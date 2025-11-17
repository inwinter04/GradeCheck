import { app, BrowserWindow, ipcMain, clipboard, globalShortcut, dialog, Tray, nativeImage, screen, shell, Menu } from 'electron'
import { fileURLToPath } from 'url'
import { dirname, join, basename } from 'path'
import { readFileSync, appendFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { spawn } from 'child_process'
import { createRequire } from 'module'
import { startExtensionServer, stopExtensionServer } from './extension-server.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

let mainWindow = null
let checkWindow = null
let noteWindow = null
let tablePreviewWindow = null
let tray = null
let pendingMarkData = null // 存储待标记的数据
let checkData = null
let currentIndex = 0
let startTime = null
let markedCount = 0
let startIndex = 0
let checkConfig = null
let markFileName = null
let appIsQuiting = false
let lastCheckResult = null
let mainWindowSize = { width: 1000, height: 720 } // 保存主窗口初始尺寸
let markedRows = new Map() // 跟踪已标记的行：key 为行索引，value 为 { rowData, note }
let extensionServer = null // 扩展通信服务器
let currentShortcut = 'CommandOrControl+N' // 当前注册的快捷键
let shortcutHandler = null // 快捷键处理函数

// 注册全局快捷键
function registerGlobalShortcut(shortcut) {
  // 先取消注册所有快捷键
  globalShortcut.unregisterAll()
  
  // 节流变量：防止快捷键重复触发
  let lastNextRowTime = 0
  const THROTTLE_DELAY = 300 // 300ms 内只允许触发一次
  
  // 创建快捷键处理函数
  shortcutHandler = () => {
    const now = Date.now()
    // 节流：如果距离上次触发时间小于阈值，则忽略
    if (now - lastNextRowTime < THROTTLE_DELAY) {
      return
    }
    lastNextRowTime = now

    if (checkWindow && !checkWindow.isDestroyed()) {
      checkWindow.webContents.send('next-row')
      // 如果窗口被最小化或隐藏，显示并聚焦
      if (!checkWindow.isVisible()) {
        checkWindow.show()
      }
      checkWindow.focus()
    }
  }
  
  // 注册新的快捷键
  const ret = globalShortcut.register(shortcut, shortcutHandler)
  
  if (!ret) {
    console.log(`全局快捷键 ${shortcut} 注册失败，可能已被其他应用占用`)
    return { success: false, error: '快捷键注册失败，可能已被其他应用占用' }
  } else {
    console.log(`全局快捷键 ${shortcut} 注册成功`)
    currentShortcut = shortcut
    return { success: true }
  }
}

function findExecutable(candidates = []) {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

function getEdgeExecutablePath() {
  const programFiles = process.env['PROGRAMFILES']
  const programFilesX86 = process.env['PROGRAMFILES(X86)']
  const localAppData = process.env['LOCALAPPDATA']

  const candidates = [
    programFiles && join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    programFilesX86 && join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    localAppData && join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ]

  return findExecutable(candidates)
}

function getChromeExecutablePath() {
  const programFiles = process.env['PROGRAMFILES']
  const programFilesX86 = process.env['PROGRAMFILES(X86)']
  const localAppData = process.env['LOCALAPPDATA']

  const candidates = [
    programFiles && join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    programFilesX86 && join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    localAppData && join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ]

  return findExecutable(candidates)
}

function openBrowserExtensionPage(browser) {
  const targetUrl =
    browser === 'edge' ? 'edge://extensions/' : 'chrome://extensions/'

  const executablePath =
    browser === 'edge' ? getEdgeExecutablePath() : getChromeExecutablePath()

  if (!executablePath) {
    return {
      success: false,
      error:
        browser === 'edge'
          ? '未找到 Microsoft Edge 可执行文件，请确认已安装 Edge 浏览器。'
          : '未找到 Google Chrome 可执行文件，请确认已安装 Chrome 浏览器。',
    }
  }

  try {
    const child = spawn(executablePath, [targetUrl], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 获取标记文件夹路径
function getMarksFolderPath() {
  let marksFolderPath
  if (app.isPackaged) {
    // 打包后，在 exe 同目录下创建"标记记录"文件夹
    const exePath = process.execPath
    const exeDir = dirname(exePath)
    marksFolderPath = join(exeDir, '标记记录')
  } else {
    // 开发模式下，在项目根目录创建"标记记录"文件夹
    marksFolderPath = join(process.cwd(), '标记记录')
  }
  
  // 如果文件夹不存在，创建它
  if (!existsSync(marksFolderPath)) {
    mkdirSync(marksFolderPath, { recursive: true })
  }
  
  return marksFolderPath
}

function createWindow() {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
  const preloadPath = join(__dirname, 'preload.js')
  const iconPath = join(__dirname, '../icon.png')
  
  // 调试信息
  if (isDev) {
    console.log('Preload script path:', preloadPath)
    console.log('Icon path:', iconPath)
  }
  
  mainWindow = new BrowserWindow({
    width: mainWindowSize.width,
    height: mainWindowSize.height,
    minWidth: 800,
    minHeight: 600,
    frame: false,  // 移除原生边框，使用自定义标题栏
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,  // 自动隐藏菜单栏
    backgroundColor: '#F5F5F7',
    icon: iconPath,  // 设置窗口图标
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  })
  
  // 移除菜单栏
  mainWindow.setMenuBarVisibility(false)
  
  // 保存窗口尺寸变化
  mainWindow.on('resize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const [width, height] = mainWindow.getSize()
      mainWindowSize = { width, height }
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }
  
  // 监听主窗口关闭事件，点击×直接退出程序
  mainWindow.on('close', (event) => {
    if (!appIsQuiting) {
      // 点击×时直接退出程序
      appIsQuiting = true
      // 关闭所有窗口
      if (checkWindow && !checkWindow.isDestroyed()) {
        checkWindow.destroy()
        checkWindow = null
      }
      if (noteWindow && !noteWindow.isDestroyed()) {
        noteWindow.destroy()
        noteWindow = null
      }
      if (tablePreviewWindow && !tablePreviewWindow.isDestroyed()) {
        tablePreviewWindow.destroy()
        tablePreviewWindow = null
      }
      // 销毁托盘
      if (tray) {
        tray.destroy()
        tray = null
      }
      // 退出应用
      app.quit()
    }
  })
  
  // 调试：检查 preload 是否加载
  mainWindow.webContents.on('did-finish-load', () => {
    if (isDev) {
      console.log('Preload path:', preloadPath)
    }
  })
}

function createTray() {
  // 获取图标路径：打包后使用 resources 目录，开发时使用项目根目录
  let iconPath
  if (app.isPackaged) {
    // 打包后，图标在 resources 目录下
    iconPath = join(process.resourcesPath, 'icon.ico')
    // 如果 .ico 不存在，尝试 .png
    if (!existsSync(iconPath)) {
      iconPath = join(process.resourcesPath, 'icon.png')
    }
  } else {
    // 开发环境，使用项目根目录
    iconPath = join(__dirname, '../icon.ico')
    if (!existsSync(iconPath)) {
      iconPath = join(__dirname, '../icon.png')
    }
  }
  
  const icon = nativeImage.createFromPath(iconPath)
  
  // 如果图标加载失败，尝试使用应用图标作为后备
  if (icon.isEmpty()) {
    console.warn('无法加载托盘图标，尝试使用应用图标')
    // 尝试使用应用图标
    const appIcon = app.getAppPath()
    const fallbackIcon = join(appIcon, 'icon.ico')
    const fallbackIconPng = join(appIcon, 'icon.png')
    
    let finalIcon = nativeImage.createEmpty()
    if (existsSync(fallbackIcon)) {
      finalIcon = nativeImage.createFromPath(fallbackIcon)
    } else if (existsSync(fallbackIconPng)) {
      finalIcon = nativeImage.createFromPath(fallbackIconPng)
    }
    
    if (finalIcon.isEmpty()) {
      console.warn('无法加载任何图标，使用空图标')
      tray = new Tray(nativeImage.createEmpty())
    } else {
      tray = new Tray(finalIcon)
    }
  } else {
    tray = new Tray(icon)
  }
  
  tray.setToolTip('广理成绩核查')
  
  // 创建右键菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示/隐藏',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            mainWindow.hide()
          } else {
            mainWindow.show()
            mainWindow.focus()
          }
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: '退出',
      click: () => {
        appIsQuiting = true
        // 关闭所有窗口
      if (checkWindow) {
        checkWindow.close()
      }
      if (noteWindow) {
        noteWindow.close()
      }
      if (tablePreviewWindow) {
        tablePreviewWindow.close()
      }
        if (mainWindow) {
          mainWindow.close()
        }
        // 销毁托盘
        if (tray) {
          tray.destroy()
        }
        // 退出应用
        app.quit()
      }
    }
  ])
  
  tray.setContextMenu(contextMenu)
  
  // 左键点击显示/隐藏窗口
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })
}

function createCheckWindow() {
  if (checkWindow) {
    checkWindow.focus()
    return
  }

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
  const preloadPath = join(__dirname, 'preload.js')
  const iconPath = join(__dirname, '../icon.png')

  // 获取屏幕尺寸，计算窗口位置（右上角）
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
  
  const windowWidth = 280
  const windowHeight = 240
  const x = screenWidth - windowWidth - 20  // 距离右边 20px
  const y = 20  // 距离顶部 20px

  checkWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: x,
    y: y,
    frame: false,  // 无边框窗口
    alwaysOnTop: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    movable: true,  // 允许移动窗口（通过 CSS -webkit-app-region: drag 实现）
    autoHideMenuBar: true,  // 自动隐藏菜单栏
    backgroundColor: '#F5F5F7',
    icon: iconPath,  // 设置窗口图标
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  })
  
  // 移除菜单栏
  checkWindow.setMenuBarVisibility(false)

  // 隐藏主窗口到托盘
  if (mainWindow) {
    mainWindow.hide()
  }

  if (isDev) {
    checkWindow.loadURL('http://localhost:5173/#/check')
  } else {
    checkWindow.loadFile(join(__dirname, '../dist/index.html'), { hash: 'check' })
  }

  checkWindow.on('closed', () => {
    checkWindow = null
    // 恢复主窗口
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function createNoteWindow(rowData, rowIndex) {
  // 如果窗口已存在，先关闭
  if (noteWindow) {
    noteWindow.close()
  }

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
  const preloadPath = join(__dirname, 'preload.js')
  const iconPath = join(__dirname, '../icon.png')

  // 获取屏幕尺寸，计算窗口位置（屏幕中心）
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
  
  const windowWidth = 500
  const windowHeight = 300
  const x = Math.floor((screenWidth - windowWidth) / 2)
  const y = Math.floor((screenHeight - windowHeight) / 2)

  noteWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: x,
    y: y,
    frame: false,  // 移除原生边框
    titleBarStyle: 'hidden',
    alwaysOnTop: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    backgroundColor: '#F5F5F7',
    icon: iconPath,  // 设置窗口图标
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  })
  
  // 移除菜单栏
  noteWindow.setMenuBarVisibility(false)

  // 存储待标记的数据
  pendingMarkData = { rowData, rowIndex }

  if (isDev) {
    noteWindow.loadURL('http://localhost:5173/#/note')
  } else {
    noteWindow.loadFile(join(__dirname, '../dist/index.html'), { hash: 'note' })
  }

  noteWindow.on('closed', () => {
    noteWindow = null
    pendingMarkData = null
  })
}

function createTablePreviewWindow() {
  // 如果窗口已存在，聚焦并返回
  if (tablePreviewWindow && !tablePreviewWindow.isDestroyed()) {
    tablePreviewWindow.focus()
    return
  }

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
  const preloadPath = join(__dirname, 'preload.js')
  const iconPath = join(__dirname, '../icon.png')

  // 获取屏幕尺寸，计算窗口位置和大小
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
  
  const windowWidth = Math.min(1200, screenWidth * 0.9)
  const windowHeight = Math.min(800, screenHeight * 0.9)
  const x = Math.floor((screenWidth - windowWidth) / 2)
  const y = Math.floor((screenHeight - windowHeight) / 2)

  tablePreviewWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: x,
    y: y,
    frame: false,  // 移除原生边框
    titleBarStyle: 'hidden',
    alwaysOnTop: false,  // 表格预览窗口不需要置顶
    resizable: true,
    minimizable: true,
    maximizable: true,
    autoHideMenuBar: true,
    backgroundColor: '#F5F5F7',
    icon: iconPath,  // 设置窗口图标
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  })
  
  // 移除菜单栏
  tablePreviewWindow.setMenuBarVisibility(false)

  if (isDev) {
    tablePreviewWindow.loadURL('http://localhost:5173/#/table-preview')
  } else {
    tablePreviewWindow.loadFile(join(__dirname, '../dist/index.html'), { hash: 'table-preview' })
  }

  tablePreviewWindow.on('closed', () => {
    tablePreviewWindow = null
  })
}

// 单实例检查：确保只能运行一个实例
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // 如果已经有实例在运行，退出当前实例
  console.log('程序已在运行，退出当前实例')
  app.quit()
  process.exit(0)
} else {
  // 当第二个实例启动时，激活第一个实例的窗口
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(() => {
  createWindow()
  createTray()
  
  // 启动扩展通信服务器
  try {
    extensionServer = startExtensionServer(8765)
    console.log('扩展通信服务器启动成功')
  } catch (error) {
    console.error('扩展通信服务器启动失败:', error)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // 注册全局快捷键（默认使用 CommandOrControl+N）
  // 等待主窗口加载完成后，从 localStorage 读取保存的快捷键设置
  if (mainWindow) {
    mainWindow.webContents.once('did-finish-load', () => {
      // 等待一小段时间确保 localStorage 已初始化
      setTimeout(() => {
        mainWindow.webContents.executeJavaScript(`
          (async () => {
            const savedShortcut = localStorage.getItem('globalShortcut');
            if (savedShortcut) {
              return savedShortcut;
            }
            return null;
          })()
        `).then((savedShortcut) => {
          if (savedShortcut) {
            console.log('[Main] 从 localStorage 加载快捷键:', savedShortcut)
            registerGlobalShortcut(savedShortcut)
          } else {
            console.log('[Main] 使用默认快捷键:', currentShortcut)
            registerGlobalShortcut(currentShortcut)
          }
        }).catch((error) => {
          console.error('[Main] 读取快捷键设置失败:', error)
          // 如果获取失败，使用默认快捷键
          registerGlobalShortcut(currentShortcut)
        })
      }, 100)
    })
  } else {
    registerGlobalShortcut(currentShortcut)
  }
})

// 处理应用退出前的清理工作
app.on('before-quit', (event) => {
  // 如果正在退出，确保所有资源都已释放
  if (appIsQuiting) {
    return
  }
  
  // 检查是否有未保存的工作（如果需要）
  // 这里可以添加保存提示逻辑
})

app.on('will-quit', (event) => {
  appIsQuiting = true
  globalShortcut.unregisterAll()
  stopExtensionServer()
  
  // 确保所有窗口都已关闭并销毁
  if (checkWindow && !checkWindow.isDestroyed()) {
    checkWindow.destroy()
    checkWindow = null
  }
  if (noteWindow && !noteWindow.isDestroyed()) {
    noteWindow.destroy()
    noteWindow = null
  }
  if (tablePreviewWindow && !tablePreviewWindow.isDestroyed()) {
    tablePreviewWindow.destroy()
    tablePreviewWindow = null
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy()
    mainWindow = null
  }
  
  // 销毁托盘
  if (tray) {
    tray.destroy()
    tray = null
  }
})

// 确保应用完全退出
app.on('window-all-closed', () => {
  // 在 Windows 和 Linux 上，当所有窗口关闭时，不退出应用（因为有托盘）
  // 在 macOS 上，应用通常保持运行
  if (process.platform !== 'darwin') {
    // 不退出应用，让它在托盘中运行
    // 用户可以通过托盘图标重新打开窗口
    // 只有在 appIsQuiting 为 true 时才真正退出
    if (appIsQuiting) {
      app.quit()
    }
  }
})

// IPC 处理
ipcMain.handle('show-open-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Excel文件', extensions: ['xlsx', 'xls'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  
  if (result.canceled) {
    return null
  }
  
  return result.filePaths[0]
})

ipcMain.handle('read-excel', async (event, filePath) => {
  try {
    const workbook = XLSX.readFile(filePath)
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
    return { success: true, data }
  } catch (error) {
    console.error('读取 Excel 文件错误:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('start-check', async (event, { data, config, filePath }) => {
  checkData = data
  checkConfig = config
  currentIndex = config.startRow - 1
  startIndex = config.startRow
  startTime = Date.now()
  markedCount = 0
  markedRows.clear() // 清空之前的标记记录
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  
  // 提取 Excel 文件名（不含扩展名）
  let excelFileName = ''
  if (filePath) {
    const fileName = basename(filePath)
    excelFileName = fileName.replace(/\.[^/.]+$/, '') // 移除扩展名
  }
  
  // 如果 Excel 文件名存在，添加到 txt 文件名
  if (excelFileName) {
    markFileName = `${timestamp}_${excelFileName}.txt`
  } else {
    markFileName = `${timestamp}.txt`
  }
  
  createCheckWindow()
  
  return { success: true, fileName: markFileName }
})

ipcMain.handle('get-current-row', async () => {
  if (!checkData || currentIndex >= checkData.length) {
    return null
  }
  
  const row = checkData[currentIndex]
  return {
    index: currentIndex + 1,
    row: row,
    config: checkConfig,
  }
})

ipcMain.handle('next-row', async () => {
  if (!checkData) return { success: false }
  
  currentIndex++
  if (currentIndex >= checkData.length) {
    return { success: false, finished: true }
  }
  
  const row = checkData[currentIndex]
  return {
    success: true,
    index: currentIndex + 1,
    row: row,
    config: checkConfig,
  }
})

ipcMain.handle('copy-to-clipboard', async (event, text) => {
  clipboard.writeText(text)
  return { success: true }
})

ipcMain.handle('open-note-window', async (event, { rowData, rowIndex }) => {
  try {
    // 确保 rowData 是数组
    const rowDataArray = Array.isArray(rowData) ? rowData : Object.values(rowData || {})
    createNoteWindow(rowDataArray, rowIndex)
    return { success: true }
  } catch (error) {
    console.error('打开备注窗口错误:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('get-pending-mark-data', async () => {
  return pendingMarkData
})

ipcMain.handle('mark-row', async (event, { rowData, note, rowIndex }) => {
  try {
    if (!markFileName) {
      return { success: false, error: '未找到标记文件' }
    }
    
    // 确保 rowData 是数组
    const rowDataArray = Array.isArray(rowData) ? rowData : Object.values(rowData || {})
    
    // 保存到标记记录文件夹
    const marksFolderPath = getMarksFolderPath()
    const filePath = join(marksFolderPath, markFileName)
    
    // 构建行内容：原始数据 + 备注（如果有）
    const rowContent = [...rowDataArray]
    if (note && note.trim()) {
      rowContent.push(note.trim())
    }
    const content = rowContent.join('\t') + '\n'
    
    // 如果该行已经标记过，先取消标记（但不减少计数，因为我们要重新标记）
    const wasAlreadyMarked = markedRows.has(rowIndex)
    if (wasAlreadyMarked) {
      await unmarkRowFromFile(filePath, rowIndex, false) // false 表示不减少计数
    }
    
    // 追加到文件
    appendFileSync(filePath, content, 'utf-8')
    
    // 记录标记信息
    markedRows.set(rowIndex, { rowData: rowDataArray, note: note || '' })
    
    // 只有新标记时才增加计数
    if (!wasAlreadyMarked) {
      markedCount++
    }
    
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 从文件中移除指定行的辅助函数
// decreaseCount: 是否减少标记计数（默认 true）
async function unmarkRowFromFile(filePath, rowIndex, decreaseCount = true) {
  try {
    if (!existsSync(filePath)) {
      return
    }
    
    // 读取文件内容
    const fileContent = readFileSync(filePath, 'utf-8')
    const lines = fileContent.split('\n').filter(line => line.trim() !== '')
    
    // 找到并移除对应的行
    // 由于我们记录的是原始行数据，需要匹配原始数据部分
    const markedInfo = markedRows.get(rowIndex)
    if (!markedInfo) return
    
    const targetRowData = markedInfo.rowData
    const targetRowStr = targetRowData.join('\t')
    
    // 查找匹配的行（可能包含备注，所以只匹配原始数据部分）
    const filteredLines = lines.filter(line => {
      // 如果行包含备注，需要只比较原始数据部分
      const lineParts = line.split('\t')
      const originalDataParts = lineParts.slice(0, targetRowData.length)
      return originalDataParts.join('\t') !== targetRowStr
    })
    
    // 重写文件
    if (filteredLines.length > 0) {
      writeFileSync(filePath, filteredLines.join('\n') + '\n', 'utf-8')
    } else {
      // 如果文件为空，删除文件或写入空内容
      writeFileSync(filePath, '', 'utf-8')
    }
    
    // 从记录中移除
    markedRows.delete(rowIndex)
    
    // 只有需要减少计数时才减少
    if (decreaseCount) {
      markedCount = Math.max(0, markedCount - 1)
    }
  } catch (error) {
    console.error('取消标记失败:', error)
    throw error
  }
}

ipcMain.handle('unmark-row', async (event, rowIndex) => {
  try {
    if (!markFileName) {
      return { success: false, error: '未找到标记文件' }
    }
    
    // 保存到标记记录文件夹
    const marksFolderPath = getMarksFolderPath()
    const filePath = join(marksFolderPath, markFileName)
    
    await unmarkRowFromFile(filePath, rowIndex)
    
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('check-row-marked', async (event, rowIndex) => {
  return { marked: markedRows.has(rowIndex), note: markedRows.get(rowIndex)?.note || '' }
})

ipcMain.handle('close-note-window', async () => {
  if (noteWindow) {
    // 通知核查窗口更新状态
    if (checkWindow) {
      checkWindow.webContents.send('note-window-closed')
    }
    noteWindow.close()
    noteWindow = null
    pendingMarkData = null
  }
  return { success: true }
})

ipcMain.handle('end-check', async () => {
  const endIndex = currentIndex + 1
  const duration = Date.now() - startTime
  
  const result = {
    startIndex,
    endIndex,
    duration,
    markedCount,
  }
  
  // 保存结果，供主窗口使用
  lastCheckResult = result
  
  if (checkWindow) {
    checkWindow.close()
    checkWindow = null
  }
  
  // 恢复主窗口并导航到结束页面
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
    // 恢复主窗口到初始尺寸
    mainWindow.setSize(mainWindowSize.width, mainWindowSize.height)
    mainWindow.center()
    
    // 等待窗口显示后再导航
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript(`
          if (window.location && window.location.hash !== '#/end') {
            window.location.hash = '#/end'
            // 触发自定义事件传递结果
            window.dispatchEvent(new CustomEvent('check-result', { detail: ${JSON.stringify(result)} }))
          }
        `)
      }
    }, 100)
  }
  
  return result
})

// 获取最后一次核查结果
ipcMain.handle('get-last-check-result', async () => {
  return lastCheckResult
})

ipcMain.handle('close-check-window', () => {
  if (checkWindow) {
    checkWindow.close()
    checkWindow = null
  }
})

// 窗口控制 IPC 处理器
ipcMain.handle('window-minimize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (window) {
    window.minimize()
  }
})

ipcMain.handle('window-maximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (window) {
    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
  }
})

ipcMain.handle('window-close', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (window) {
    if (window === mainWindow) {
      appIsQuiting = true
      window.close()
    } else {
      window.close()
    }
  }
})

ipcMain.handle('window-is-maximized', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (window) {
    return window.isMaximized()
  }
  return false
})

// 扩展通信 IPC 处理
ipcMain.handle('check-extension-connection', async () => {
  try {
    if (!extensionServer) {
      return { connected: false, error: '服务器未启动' }
    }
    
    // 检查服务器状态
    const response = await fetch('http://localhost:8765/status')
    if (response.ok) {
      return { connected: true }
    }
    return { connected: false, error: '服务器无响应' }
  } catch (error) {
    return { connected: false, error: error.message }
  }
})

ipcMain.handle('send-to-extension', async (event, message) => {
  try {
    if (!extensionServer) {
      return { success: false, error: '服务器未启动' }
    }
    
    extensionServer.sendToExtension(message)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('wait-for-extension-message', async (event, timeout = 30000, expectedType = null) => {
  try {
    if (!extensionServer) {
      return { success: false, error: '服务器未启动' }
    }
    
    console.log(`[Main] 等待扩展消息，期望类型: ${expectedType || '任意'}, 超时: ${timeout}ms`)
    const message = await extensionServer.waitForMessage(timeout, expectedType)
    console.log(`[Main] 收到扩展消息: ${message.type}`)
    return { success: true, message }
  } catch (error) {
    console.error(`[Main] 等待扩展消息失败: ${error.message}`)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('open-browser-url', async (event, url) => {
  try {
    await shell.openExternal(url)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 打开标记文件夹
ipcMain.handle('open-marks-folder', async () => {
  try {
    const marksFolderPath = getMarksFolderPath()
    await shell.openPath(marksFolderPath)
    return { success: true, path: marksFolderPath }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 打开浏览器扩展管理页面
ipcMain.handle('open-extension-page', async (event, browser) => {
  try {
    const result = openBrowserExtensionPage(browser === 'edge' ? 'edge' : 'chrome')
    return result
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 打开扩展安装包所在位置（extension.crx）
ipcMain.handle('open-extension-crx', async () => {
  try {
    let crxPath

    if (app.isPackaged) {
      // 打包后，优先在可执行文件同级目录查找 extension.crx
      const exeDir = dirname(process.execPath)
      const exeCrxPath = join(exeDir, 'extension.crx')

      if (existsSync(exeCrxPath)) {
        crxPath = exeCrxPath
      } else {
        // 兼容：如果放在 resources 目录
        const resourceCrxPath = join(process.resourcesPath, 'extension.crx')
        if (existsSync(resourceCrxPath)) {
          crxPath = resourceCrxPath
        }
      }
    } else {
      // 开发环境：直接使用项目根目录下的 extension.crx
      const devCrxPath = join(process.cwd(), 'extension.crx')
      if (existsSync(devCrxPath)) {
        crxPath = devCrxPath
      }
    }

    if (!crxPath) {
      return { success: false, error: '未找到 extension.crx，请确认文件是否存在于程序目录下' }
    }

    // 在资源管理器中选中该文件，方便用户拖拽
    shell.showItemInFolder(crxPath)
    return { success: true, path: crxPath }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 打开扩展源代码文件夹（for 加载已解压的扩展）
ipcMain.handle('open-extension-folder', async () => {
  try {
    let extensionPath

    if (app.isPackaged) {
      const exeDir = dirname(process.execPath)
      const packagedPath = join(exeDir, 'extension')
      if (existsSync(packagedPath)) {
        extensionPath = packagedPath
      } else {
        const resourcePath = join(process.resourcesPath, 'extension')
        if (existsSync(resourcePath)) {
          extensionPath = resourcePath
        }
      }
    } else {
      const devPath = join(process.cwd(), 'extension')
      if (existsSync(devPath)) {
        extensionPath = devPath
      }
    }

    if (!extensionPath) {
      return { success: false, error: '未找到 extension 目录，请确认程序目录中是否包含 extension 文件夹。' }
    }

    const result = await shell.openPath(extensionPath)
    if (result) {
      return { success: false, error: result }
    }

    return { success: true, path: extensionPath }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 更新全局快捷键
ipcMain.handle('update-global-shortcut', async (event, shortcut) => {
  try {
    console.log('[IPC] 收到更新快捷键请求:', shortcut)
    
    if (!shortcut || typeof shortcut !== 'string') {
      return { success: false, error: '快捷键格式不正确' }
    }
    
    // 清理快捷键字符串（移除空格）
    const cleanShortcut = shortcut.replace(/\s+/g, '')
    
    // 验证快捷键格式（允许只有主键，或修饰键+主键）
    // 允许：N, CommandOrControl+N, Command+N, Control+N, Alt+N, Shift+N 等
    const modifiers = ['CommandOrControl', 'Command', 'Control', 'Alt', 'Shift']
    const parts = cleanShortcut.split('+')
    
    // 检查是否至少有一个主键（非修饰键）
    const hasMainKey = parts.some(part => !modifiers.includes(part))
    
    if (!hasMainKey) {
      console.log('[IPC] 快捷键格式验证失败: 缺少主键', cleanShortcut)
      return { success: false, error: '快捷键必须包含至少一个主键（如 N、M、Space 等）' }
    }
    
    // 验证主键格式（字母、数字或特殊键名）
    const mainKey = parts.find(part => !modifiers.includes(part))
    if (!mainKey || mainKey.length === 0) {
      console.log('[IPC] 快捷键格式验证失败: 主键无效', cleanShortcut)
      return { success: false, error: '主键格式不正确' }
    }
    
    // 注册新快捷键
    console.log('[IPC] 尝试注册快捷键:', cleanShortcut)
    const result = registerGlobalShortcut(cleanShortcut)
    console.log('[IPC] 快捷键注册结果:', result)
    return result
  } catch (error) {
    console.error('[IPC] 更新快捷键时出错:', error)
    return { success: false, error: error.message }
  }
})

// 获取当前快捷键
ipcMain.handle('get-global-shortcut', async () => {
  return { success: true, shortcut: currentShortcut }
})

// 打开表格预览窗口
ipcMain.handle('open-table-preview', async () => {
  try {
    createTablePreviewWindow()
    return { success: true }
  } catch (error) {
    console.error('打开表格预览窗口错误:', error)
    return { success: false, error: error.message }
  }
})

// 获取所有核查数据
ipcMain.handle('get-all-check-data', async () => {
  return {
    success: true,
    data: checkData,
    config: checkConfig,
    currentIndex: currentIndex + 1,  // 返回从1开始的行号
  }
})

// 跳转到指定行
ipcMain.handle('jump-to-row', async (event, rowIndex) => {
  try {
    // rowIndex 是从1开始的行号，需要转换为从0开始的索引
    const targetIndex = rowIndex - 1
    
    if (!checkData || targetIndex < 0 || targetIndex >= checkData.length) {
      return { success: false, error: '无效的行号' }
    }
    
    currentIndex = targetIndex
    
    // 通知核查窗口更新
    if (checkWindow && !checkWindow.isDestroyed()) {
      checkWindow.webContents.send('jump-to-row', {
        index: rowIndex,
        row: checkData[currentIndex],
        config: checkConfig,
      })
    }
    
    return { success: true }
  } catch (error) {
    console.error('跳转到指定行错误:', error)
    return { success: false, error: error.message }
  }
})

// 关闭表格预览窗口
ipcMain.handle('close-table-preview', async () => {
  if (tablePreviewWindow && !tablePreviewWindow.isDestroyed()) {
    tablePreviewWindow.close()
    tablePreviewWindow = null
  }
  return { success: true }
})

