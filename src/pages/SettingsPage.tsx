import { useState, useEffect, useMemo, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import TitleBar from '../components/TitleBar'

type ConfettiShard = {
  id: number
  color: string
  offset: number
  delay: number
  duration: number
  size: number
}

type GlyphSkyPoint = {
  id: string
  char: string
  x: number
  y: number
  scale: number
  rotate: number
  delay: number
  accent: string
  intro: boolean
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const repoUrl = 'https://github.com/inwinter04/GradeCheck'
  const [shortcut, setShortcut] = useState('CommandOrControl+N')
  const [isEditing, setIsEditing] = useState(false)
  const [tempShortcut, setTempShortcut] = useState('')
  const [error, setError] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [pressedKeys, setPressedKeys] = useState<string[]>([])
  const [installMessage, setInstallMessage] = useState<string>('')
  const mysticBadge = useMemo(
    () => decodeURIComponent('%E7%A5%9E%E5%A5%87%E5%B0%8F%E5%86%AC%E5%A4%A9'),
    []
  )
  const mysticGlyphs = useMemo(() => mysticBadge.split(''), [mysticBadge])
  const [mysticClicks, setMysticClicks] = useState(0)
  const [confettiVisible, setConfettiVisible] = useState(false)
  const [confettiBurst, setConfettiBurst] = useState<ConfettiShard[]>([])
  const [glyphSky, setGlyphSky] = useState<GlyphSkyPoint[]>([])

  // 加载保存的快捷键设置
  useEffect(() => {
    const loadShortcut = async () => {
      // 先从主进程获取当前快捷键
      if (window.electronAPI && window.electronAPI.getGlobalShortcut) {
        try {
          const result = await window.electronAPI.getGlobalShortcut()
          if (result.success && result.shortcut) {
            setShortcut(result.shortcut)
            // 同步到本地存储
            localStorage.setItem('globalShortcut', result.shortcut)
            return
          }
        } catch (error) {
          console.error('获取快捷键失败:', error)
        }
      }
      // 如果主进程获取失败，从本地存储读取
      const savedShortcut = localStorage.getItem('globalShortcut') || 'CommandOrControl+N'
      setShortcut(savedShortcut)
    }
    loadShortcut()
  }, [])

  // 格式化快捷键显示
  const formatShortcut = (key: string) => {
    return key
      .replace('CommandOrControl', 'Ctrl')
      .replace('Command', 'Cmd')
      .replace('Control', 'Ctrl')
      .replace('Alt', 'Alt')
      .replace('Shift', 'Shift')
      .replace('+', ' + ')
  }

  // 将按键组合转换为 Electron 快捷键格式
  const convertToElectronShortcut = (keys: string[]): string => {
    if (keys.length === 0) return ''
    
    const modifiers: string[] = []
    let key = ''
    
    for (const k of keys) {
      const lowerKey = k.toLowerCase()
      if (lowerKey === 'meta' || lowerKey === 'cmd') {
        modifiers.push('Command')
      } else if (lowerKey === 'control' || lowerKey === 'ctrl') {
        modifiers.push('Control')
      } else if (lowerKey === 'alt') {
        modifiers.push('Alt')
      } else if (lowerKey === 'shift') {
        modifiers.push('Shift')
      } else {
        key = k.toUpperCase()
      }
    }
    
    // 如果同时有 Command 和 Control，使用 CommandOrControl
    if (modifiers.includes('Command') && modifiers.includes('Control')) {
      const otherModifiers = modifiers.filter(m => m !== 'Command' && m !== 'Control')
      return ['CommandOrControl', ...otherModifiers, key].filter(Boolean).join('+')
    }
    
    return [...modifiers, key].filter(Boolean).join('+')
  }

  // 处理键盘按键按下
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isListening) return
    
    e.preventDefault()
    e.stopPropagation()
    
    const keys: string[] = []
    
    // 检测修饰键
    if (e.metaKey) keys.push('Meta')
    if (e.ctrlKey) keys.push('Control')
    if (e.altKey) keys.push('Alt')
    if (e.shiftKey) keys.push('Shift')
    
    // 检测主键（排除修饰键）
    if (e.key && !['Meta', 'Control', 'Alt', 'Shift', 'MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight'].includes(e.key)) {
      // 处理特殊键名
      let keyName = e.key
      if (keyName === ' ') keyName = 'Space'
      else if (keyName.length === 1) keyName = keyName.toUpperCase()
      
      keys.push(keyName)
      setPressedKeys([...keys])
      
      // 转换为 Electron 格式
      const electronShortcut = convertToElectronShortcut(keys)
      setTempShortcut(electronShortcut)
    } else if (keys.length > 0) {
      setPressedKeys([...keys])
    }
  }

  // 处理键盘按键释放
  const handleKeyUp = () => {
    if (!isListening) return
    
    // 如果已经按下了主键，停止监听
    if (pressedKeys.length > 0 && !['Meta', 'Control', 'Alt', 'Shift'].includes(pressedKeys[pressedKeys.length - 1])) {
      setIsListening(false)
    }
  }

  // 保存快捷键设置
  const handleSaveShortcut = async () => {
    if (!tempShortcut.trim()) {
      setError('请先设置快捷键')
      return
    }

    try {
      // 验证快捷键格式（至少需要一个主键，修饰键可选）
      const parts = tempShortcut.split('+')
      // 检查是否至少有一个主键（非修饰键）
      const modifiers = ['CommandOrControl', 'Command', 'Control', 'Alt', 'Shift']
      const hasMainKey = parts.some(part => !modifiers.includes(part))
      
      if (!hasMainKey) {
        setError('快捷键必须包含至少一个主键（如 N、M、Space 等）')
        return
      }

      // 保存到本地存储
      localStorage.setItem('globalShortcut', tempShortcut)
      
      // 通知主进程更新快捷键
      if (!window.electronAPI) {
        setError('Electron API 未加载，请确保在 Electron 环境中运行')
        return
      }
      
      if (!window.electronAPI.updateGlobalShortcut) {
        setError('updateGlobalShortcut API 不可用，请重启应用')
        return
      }
      
      try {
        const result = await window.electronAPI.updateGlobalShortcut(tempShortcut)
        if (!result.success) {
          setError(result.error || '更新快捷键失败')
          return
        }
      } catch (error: any) {
        console.error('调用 updateGlobalShortcut 失败:', error)
        setError('调用快捷键更新 API 失败: ' + error.message)
        return
      }

      setShortcut(tempShortcut)
      setIsEditing(false)
      setIsListening(false)
      setPressedKeys([])
      setError('')
    } catch (error: any) {
      setError('保存失败: ' + error.message)
    }
  }

  // 取消编辑
  const handleCancel = () => {
    setTempShortcut('')
    setIsEditing(false)
    setIsListening(false)
    setPressedKeys([])
    setError('')
  }

  // 开始编辑
  const handleEdit = () => {
    setTempShortcut(shortcut)
    setIsEditing(true)
    setIsListening(true)
    setPressedKeys([])
    setError('')
  }

  // 停止监听
  const handleStopListening = () => {
    setIsListening(false)
    setPressedKeys([])
  }

  const triggerConfetti = () => {
    const palette = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#C77DFF']
    setConfettiBurst(
      Array.from({ length: 26 }, (_, idx) => ({
        id: Date.now() + idx,
        color: palette[idx % palette.length],
        offset: Math.random() * 100,
        delay: Math.random() * 0.35,
        duration: 2.5 + Math.random() * 1.3,
        size: 6 + Math.random() * 12,
      }))
    )
    setConfettiVisible(true)
  }

  const handleMysticTap = () => {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720
    const padding = 90
    const usableWidth = Math.max(viewportWidth - padding * 2, 160)
    const usableHeight = Math.max(viewportHeight - padding * 2, 160)
    const minDistance = Math.min(usableWidth, usableHeight) / 4
    const centerX = viewportWidth / 2
    const centerY = viewportHeight / 2

    setGlyphSky(prev => {
      const isIntro = prev.length === 0
      const ensureBase = () => {
        if (prev.length === mysticGlyphs.length) return prev
        return mysticGlyphs.map((char, idx) => ({
          id: `glyph-${idx}`,
          char,
          x: idx * 6,
          y: 0,
          scale: 1 + idx * 0.05,
          rotate: 0,
          delay: 0,
          accent: '#1d1d1f',
          intro: true,
        }))
      }

      const base = ensureBase()
      const occupied: { x: number; y: number }[] = []

      return base.map((glyph, idx) => {
        let attempts = 0
        let absX = glyph.x + centerX
        let absY = glyph.y + centerY
        do {
          absX = padding + Math.random() * usableWidth
          absY = padding + Math.random() * usableHeight
          attempts++
        } while (
          attempts < 40 &&
          occupied.some(point => Math.hypot(point.x - absX, point.y - absY) < minDistance)
        )

        occupied.push({ x: absX, y: absY })

        const nextScale = Math.min(glyph.scale + 0.35 + Math.random() * 0.65, 5)

        const accentPalette = ['#FF8E53', '#FFD452', '#69EACB', '#A1C4FD', '#FAD0C4']
        const accent = accentPalette[idx % accentPalette.length]

        return {
          ...glyph,
          char: mysticGlyphs[idx],
          x: Number((absX - centerX).toFixed(1)),
          y: Number((absY - centerY).toFixed(1)),
          scale: Number(nextScale.toFixed(2)),
          rotate: Number(((Math.random() - 0.5) * 14).toFixed(2)),
          delay: Number((Math.random() * 0.2).toFixed(2)),
          accent,
          intro: isIntro,
        }
      })
    })
    setMysticClicks(prev => {
      const next = prev + 1
      if (next % 5 === 0) {
        triggerConfetti()
      }
      return next
    })
  }

  useEffect(() => {
    if (!confettiVisible) return
    const timer = window.setTimeout(() => setConfettiVisible(false), 4200)
    return () => window.clearTimeout(timer)
  }, [confettiVisible])

  const isMysticAwake = mysticClicks >= 5

  useEffect(() => {
    if (glyphSky.length === 0) return
    const timer = window.setTimeout(() => setGlyphSky([]), 4200)
    return () => window.clearTimeout(timer)
  }, [glyphSky])

  // 安装浏览器扩展：打开指定浏览器的扩展页面并弹出 extension.crx 所在位置
  const copyAddressToClipboard = async (url: string) => {
    try {
      if (window.electronAPI && window.electronAPI.copyToClipboard) {
        await window.electronAPI.copyToClipboard(url)
        return true
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url)
        return true
      }
    } catch (error) {
      console.warn('复制剪贴板失败:', error)
    }
    return false
  }

  const handleInstallExtension = async (browser: 'chrome' | 'edge') => {
    setInstallMessage('')
    const messageParts: string[] = []

    try {
      const browserUrl =
        browser === 'chrome' ? 'chrome://extensions/' : 'edge://extensions/'

      if (window.electronAPI && (window.electronAPI as any).openExtensionPage) {
        const result = await (window.electronAPI as any).openExtensionPage(browser)
        if (!result?.success) {
          console.warn('openExtensionPage failed:', result?.error)
          messageParts.push(
            (browser === 'edge'
              ? '无法直接打开 Edge 扩展页：'
              : '无法直接打开 Chrome 扩展页：') +
              (result?.error || '未知错误') +
              '。已尝试使用默认浏览器打开相关页面，请手动确认。'
          )
          // 继续尝试使用默认浏览器打开
          if (window.electronAPI && window.electronAPI.openBrowserUrl) {
            await window.electronAPI.openBrowserUrl(browserUrl)
          } else {
            window.open(browserUrl, '_blank')
          }
        }
      } else {
        // 回退：使用默认浏览器打开
        if (window.electronAPI && window.electronAPI.openBrowserUrl) {
          await window.electronAPI.openBrowserUrl(browserUrl)
        } else {
          window.open(browserUrl, '_blank')
        }
      }

      // 打开 extension 文件夹，方便“加载已解压的扩展”
      if (window.electronAPI && (window.electronAPI as any).openExtensionFolder) {
        const result = await (window.electronAPI as any).openExtensionFolder()
        if (!result?.success) {
          messageParts.push(
            result?.error ||
              '尝试打开 extension 文件夹失败，请在程序所在目录中手动找到 extension 文件夹。'
          )
          setInstallMessage(messageParts.join('\n'))
          return
        }
      } else {
        messageParts.push(
          'Electron API 未提供 openExtensionFolder，您可以手动打开程序所在目录并找到 extension 文件夹。'
        )
        setInstallMessage(messageParts.join('\n'))
        return
      }

      const copied = await copyAddressToClipboard(browserUrl)
      if (copied) {
        window.alert(
          `已将 ${browserUrl} 复制到剪贴板，切换到浏览器后直接按 Ctrl+V 粘贴即可。`
        )
        messageParts.push(
          `地址 ${browserUrl} 已复制，切换到浏览器地址栏后按 Ctrl+V 粘贴即可。`
        )
      } else {
        messageParts.push(
          `请手动复制地址 ${browserUrl}，在浏览器地址栏中粘贴打开扩展页面。`
        )
      }

      messageParts.push(
        '在扩展页面中开启“开发人员模式”，点击“加载解压缩的扩展”按钮，然后选择刚刚打开的 extension 文件夹即可完成安装。'
      )

      setInstallMessage(messageParts.join('\n'))
    } catch (e: any) {
      console.error('安装浏览器扩展过程出错:', e)
      messageParts.push('安装引导过程出错：' + e.message)
      setInstallMessage(messageParts.join('\n'))
    }
  }

  return (
    <>
      <div className="w-full h-screen bg-apple-gray flex flex-col">
        {/* 自定义标题栏 */}
        <TitleBar title="设置" />
        
        {/* 内容区域 */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-4xl mx-auto p-8">
          {/* 返回按钮 */}
          <button
            onClick={() => navigate('/')}
            className="mb-6 text-apple-blue hover:text-blue-600 flex items-center gap-2 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回
          </button>

          {/* 设置标题 */}
          <div className="bg-white rounded-2xl shadow-sm p-8 mb-6">
            <h1 className="text-3xl font-semibold text-apple-dark mb-2">设置</h1>
            <p className="text-gray-500">配置应用程序选项</p>
          </div>

          {/* 快捷键设置 */}
          <div className="bg-white rounded-2xl shadow-sm p-8 mb-6">
            <h2 className="text-xl font-semibold text-apple-dark mb-4">快捷键设置</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  下一行快捷键
                </label>
                {!isEditing ? (
                  <div className="flex items-center gap-4">
                    <div className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                      <kbd className="text-sm font-mono text-gray-700">
                        {formatShortcut(shortcut)}
                      </kbd>
                    </div>
                    <button
                      onClick={handleEdit}
                      className="px-4 py-2 bg-apple-blue text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                    >
                      修改
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={isListening ? (pressedKeys.length > 0 ? formatShortcut(tempShortcut) : '请按下快捷键...') : formatShortcut(tempShortcut)}
                          onKeyDown={handleKeyDown}
                          onKeyUp={handleKeyUp}
                          readOnly
                          placeholder="请按下快捷键..."
                          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-apple-blue focus:border-transparent ${
                            isListening 
                              ? 'border-apple-blue bg-blue-50' 
                              : 'border-gray-300 bg-white'
                          }`}
                          autoFocus
                        />
                        {isListening && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <span className="inline-flex items-center gap-1 text-xs text-apple-blue font-medium">
                              <span className="w-2 h-2 bg-apple-blue rounded-full animate-pulse"></span>
                              监听中...
                            </span>
                          </div>
                        )}
                      </div>
                      {isListening ? (
                        <button
                          onClick={handleStopListening}
                          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                        >
                          停止
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={handleSaveShortcut}
                            className="px-4 py-2 bg-apple-blue text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                            disabled={!tempShortcut}
                          >
                            保存
                          </button>
                          <button
                            onClick={handleCancel}
                            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                          >
                            取消
                          </button>
                        </>
                      )}
                    </div>
                    {error && (
                      <p className="text-sm text-red-600">{error}</p>
                    )}
                    {isListening ? (
                      <p className="text-xs text-apple-blue">
                        请在键盘上按下您想要设置的快捷键组合（例如：Ctrl+N、Alt+N 等）
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500">
                        点击"修改"按钮后，在键盘上按下快捷键组合即可自动识别
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 浏览器扩展安装引导 */}
          <div className="bg-white rounded-2xl shadow-sm p-8 mb-6">
            <h2 className="text-xl font-semibold text-apple-dark mb-4">
              浏览器扩展
            </h2>

            <p className="text-sm text-gray-600 mb-4">
              通过安装浏览器扩展（加载已解压的 extension 文件夹），可以让本应用与浏览器配合，实现自动填写学号、姓名并自动点击查询等操作。
            </p>

            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  一键打开扩展安装页面
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => handleInstallExtension('edge')}
                    className="px-4 py-2 bg-apple-blue text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                  >
                    在 Edge 中安装扩展
                  </button>
                  <button
                    onClick={() => handleInstallExtension('chrome')}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                  >
                    在 Chrome 中安装扩展
                  </button>
                </div>
              </div>

              <div className="text-xs text-gray-500 space-y-1">
                <p className="font-medium text-gray-600">
                  加载已解压的扩展操作步骤（Chrome / Edge）：
                </p>
                <p>1. 点击上方按钮，打开浏览器的扩展管理页面。</p>
                <p>2. 在浏览器中开启右上角的「开发人员模式」。</p>
                <p>3. 程序会自动打开本地 extension 文件夹。</p>
                <p>4. 在浏览器扩展页面点击“加载解压缩的扩展”，选择该 extension 文件夹。</p>
                <p>5. 按提示确认安装扩展即可完成。</p>
                <p>
                  如果扩展页面没有自动打开，请在浏览器地址栏粘贴{' '}
                  <span className="font-mono text-gray-700">
                    chrome://extensions/
                  </span>{' '}
                  或{' '}
                  <span className="font-mono text-gray-700">
                    edge://extensions/
                  </span>{' '}
                  并回车。
                </p>
              </div>

              {installMessage && (
                <p className="text-xs text-apple-blue mt-2 whitespace-pre-line">
                  {installMessage}
                </p>
              )}
            </div>
          </div>

          {/* 版权信息 */}
          <div className="bg-white rounded-2xl shadow-sm p-8">
            <div className="border-t border-gray-200 pt-6 space-y-4">
              <h2 className="text-xl font-semibold text-apple-dark mb-4">关于</h2>
              
              <div className="space-y-3 text-gray-700">
                <div>
                  <p className="font-medium mb-1">开发者</p>
                  <span
                    role="button"
                    onClick={handleMysticTap}
                    className="mystic-trigger inline-flex items-center rounded-md px-1 py-0.5 text-sm"
                  >
                    {mysticBadge}
                  </span>
                </div>
                
                <div>
                  <p className="font-medium mb-1">开发者首页</p>
                  <a
                    href="https://www.iamdt.cn"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-apple-blue hover:text-blue-600 transition-colors"
                    onClick={async (e) => {
                      e.preventDefault()
                      if (window.electronAPI && (window.electronAPI as any).openBrowserUrl) {
                        await (window.electronAPI as any).openBrowserUrl('https://www.iamdt.cn')
                      } else {
                        window.open('https://www.iamdt.cn', '_blank')
                      }
                    }}
                  >
                    www.iamdt.cn
                  </a>
                </div>

                <div>
                  <p className="font-medium mb-2">项目仓库</p>
                  <button
                    aria-label="打开 GitHub 仓库"
                    title="打开 GitHub 仓库"
                    onClick={async () => {
                      if (window.electronAPI && (window.electronAPI as any).openBrowserUrl) {
                        await (window.electronAPI as any).openBrowserUrl(repoUrl)
                      } else {
                        window.open(repoUrl, '_blank')
                      }
                    }}
                    className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-5 h-5 text-gray-700"
                    >
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.11.82-.26.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.082-.73.082-.73 1.205.084 1.84 1.238 1.84 1.238 1.07 1.834 2.807 1.304 3.492.997.108-.776.42-1.305.763-1.605-2.665-.305-5.467-1.334-5.467-5.93 0-1.31.47-2.38 1.236-3.22-.124-.304-.536-1.53.117-3.185 0 0 1.01-.323 3.31 1.23a11.52 11.52 0 0 1 3.018-.406c1.024.005 2.053.138 3.018.406 2.3-1.553 3.31-1.23 3.31-1.23.653 1.655.241 2.88.118 3.185.77.84 1.236 1.91 1.236 3.22 0 4.61-2.807 5.624-5.48 5.92.43.37.824 1.1.824 2.22 0 1.606-.014 2.9-.014 3.293 0 .32.218.694.825.576C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                  </button>
                </div>
                
                <div>
                  <p className="font-medium mb-1">技术栈</p>
                  <div className="text-sm space-y-1">
                    <p>• Electron - 跨平台桌面应用框架</p>
                    <p>• React - 用户界面库</p>
                    <p>• TypeScript - 类型安全的 JavaScript</p>
                    <p>• Vite - 快速的前端构建工具</p>
                    <p>• Tailwind CSS - 实用优先的 CSS 框架</p>
                    <p>• XLSX - Excel 文件处理库</p>
                  </div>
                </div>
                
                <div>
                  <p className="font-medium mb-1">版本信息</p>
                  <p className="text-sm">版本 1.1.0</p>
                </div>
                
                <div>
                  <p className="font-medium mb-1">版权信息</p>
                  <p className="text-sm">Copyright © 2025 冬天的小窝</p>
                  <p className="text-sm text-gray-500 mt-1">本软件由神奇小冬天开发，保留所有权利。</p>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>

      {glyphSky.length > 0 && (
        <div className="mystic-orbit pointer-events-none">
          {glyphSky.map(point => {
            const orbitStyle = {
              '--orbit-x': `${point.x}px`,
              '--orbit-y': `${point.y}px`,
              '--orbit-scale': point.scale,
              '--orbit-rotate': `${point.rotate}deg`,
              transitionDelay: `${point.delay}s`,
            } as CSSProperties

            return (
              <span
                key={point.id}
                className="mystic-orbit__char mystic-orbit__char--visible"
                style={orbitStyle}
              >
                <span
                  className={`mystic-orbit__glyph ${
                    point.intro ? 'mystic-orbit__glyph--intro' : ''
                  } ${isMysticAwake ? 'mystic-orbit__glyph--awake' : ''}`}
                  style={{
                    color: point.accent,
                    textShadow: `0 12px 30px rgba(0, 0, 0, 0.22), 0 0 25px ${point.accent}66`,
                  }}
                >
                  {point.char}
                </span>
              </span>
            )
          })}
        </div>
      )}

      {confettiVisible && (
        <div className="mystic-confetti pointer-events-none">
          {confettiBurst.map(piece => (
            <span
              key={piece.id}
              className="mystic-confetti__piece"
              style={{
                left: `${piece.offset}%`,
                animationDelay: `${piece.delay}s`,
                animationDuration: `${piece.duration}s`,
                backgroundColor: piece.color,
                width: `${piece.size}px`,
                height: `${piece.size * 1.35}px`,
              }}
            />
          ))}
        </div>
      )}
    </>
  )
}

