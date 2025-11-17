import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

interface CheckWindowProps {
  onEnd: (result: any) => void
}

export default function CheckWindow({ onEnd }: CheckWindowProps) {
  const navigate = useNavigate()
  const [currentRow, setCurrentRow] = useState<any>(null)
  const [index, setIndex] = useState(0)
  const [config, setConfig] = useState({
    indexCol: 1,
    nameCol: 2,
    studentIdCol: 3,
  })
  const [isMarked, setIsMarked] = useState(false)
  const [currentRowIndex, setCurrentRowIndex] = useState(0)
  const [extensionConnected, setExtensionConnected] = useState(false)
  
  // 节流：防止重复触发
  const lastNextTimeRef = useRef(0)
  const isProcessingRef = useRef(false)
  const THROTTLE_DELAY = 300 // 300ms 内只允许触发一次

  const handleNext = async () => {
    const now = Date.now()
    
    // 节流检查：如果距离上次触发时间小于阈值，则忽略
    if (now - lastNextTimeRef.current < THROTTLE_DELAY) {
      return
    }
    
    // 如果正在处理中，则忽略
    if (isProcessingRef.current) {
      return
    }
    
    lastNextTimeRef.current = now
    isProcessingRef.current = true
    try {
      // 每次切换前重新检查扩展连接状态，避免状态不同步
      const extensionIsConnected = await checkExtensionConnection()

      // 先发送 NEXT_ROW 消息到扩展，关闭成绩单页面并执行清除操作
      if (extensionIsConnected) {
        try {
          await (window.electronAPI as any).sendToExtension({
            type: 'NEXT_ROW'
          })
          console.log('[CheckWindow] 已发送 NEXT_ROW 消息到扩展')
        } catch (err: any) {
          console.error('[CheckWindow] 发送 NEXT_ROW 消息失败:', err)
        }
      }
      
      // 切换到下一行数据
      const result = await window.electronAPI.nextRow()
      if (result.success && result.row) {
        const newRow = result.row
        const newIndex = result.index ?? index
        const newConfig = result.config || config
        
        // 更新状态
        setCurrentRow(newRow)
        setIndex(newIndex)
        setCurrentRowIndex(newIndex)
        if (result.config) {
          setConfig(result.config)
        }
        
        // 检查当前行是否已标记
        const markedStatus = await window.electronAPI.checkRowMarked(newIndex)
        setIsMarked(markedStatus.marked)
        
        // 自动复制学号到剪切板
        const studentId = newRow[newConfig.studentIdCol - 1]
        if (studentId) {
          await window.electronAPI.copyToClipboard(String(studentId))
        }
        
        // 如果扩展已连接，自动填写新行（使用新行的数据，不依赖状态）
        if (extensionIsConnected) {
          // 等待一下让页面稳定
          await new Promise(resolve => setTimeout(resolve, 500))
          // 直接使用新行的数据，不依赖状态更新
          autoFillRow(newRow, newConfig, extensionIsConnected).catch((err: any) => {
            console.error('[CheckWindow] 发送自动填写消息失败:', err)
          })
        }
      } else if (result.finished) {
        alert('已到达最后一行')
      }
    } catch (error) {
      console.error('切换到下一行失败:', error)
    } finally {
      // 处理完成，重置处理状态
      isProcessingRef.current = false
    }
  }

  // 组件首次加载时执行
  useEffect(() => {
    loadCurrentRow()
    checkExtensionAndStart()
    
    // 监听全局快捷键事件（Ctrl+N）
    const handleNextRow = () => {
      handleNext()
    }
    
    // 使用 IPC 事件监听
    if (window.electronAPI.onNextRow) {
      window.electronAPI.onNextRow(handleNextRow)
    }
    
    return () => {
      // IPC 监听器会在组件卸载时自动清理
    }
  }, []) // 只在组件首次加载时执行

  // 监听备注窗口关闭事件和行索引变化
  useEffect(() => {
    // 监听备注窗口关闭事件
    const handleNoteWindowClosed = async () => {
      // 重新检查标记状态
      const markedStatus = await window.electronAPI.checkRowMarked(currentRowIndex)
      setIsMarked(markedStatus.marked)
    }
    
    if (window.electronAPI.onNoteWindowClosed) {
      window.electronAPI.onNoteWindowClosed(handleNoteWindowClosed)
    }
  }, [currentRowIndex])

  // 监听跳转事件（从表格预览窗口）
  useEffect(() => {
    const handleJumpToRow = async (event: any, payload: any) => {
      if (payload && payload.row) {
        // 更新当前行数据
        setCurrentRow(payload.row)
        setIndex(payload.index)
        setCurrentRowIndex(payload.index)
        if (payload.config) {
          setConfig(payload.config)
        }
        
        // 检查当前行是否已标记
        const markedStatus = await window.electronAPI.checkRowMarked(payload.index)
        setIsMarked(markedStatus.marked)
        
        // 自动复制学号到剪切板
        const currentConfig = payload.config || config
        const studentId = payload.row[currentConfig.studentIdCol - 1]
        if (studentId) {
          await window.electronAPI.copyToClipboard(String(studentId))
        }
      }
    }
    
    if (window.electronAPI.onJumpToRow) {
      window.electronAPI.onJumpToRow(handleJumpToRow)
    }
  }, [])
  
  // 检查扩展连接状态（不自动填写）
  const checkExtensionConnection = async () => {
    try {
      const connectionResult = await (window.electronAPI as any).checkExtensionConnection()
      if (connectionResult.connected) {
        setExtensionConnected(true)
        console.log('[CheckWindow] 扩展连接检查: 已连接')
      } else {
        setExtensionConnected(false)
        console.log('[CheckWindow] 扩展连接检查: 未连接')
      }
      return connectionResult.connected
    } catch (error: any) {
      console.error('检查扩展连接失败:', error)
      setExtensionConnected(false)
      return false
    }
  }

  // 检查扩展连接（可选，不影响主程序运行）
  const checkExtensionAndStart = async () => {
    const connected = await checkExtensionConnection()
    if (connected) {
      // 等待一下确保扩展就绪
      await new Promise(resolve => setTimeout(resolve, 500))
      // 如果扩展已连接，自动填写当前行
      autoFillCurrentRow().catch((err: any) => {
        console.error('[CheckWindow] 发送自动填写消息失败:', err)
      })
    }
  }

  // 处理点击扩展连接状态
  const handleExtensionStatusClick = async () => {
    await checkExtensionConnection()
  }
  
  
  // 自动填写指定行的数据（只发送消息，不等待结果）
  const autoFillRow = async (row: any, rowConfig: any, forceExtensionConnected?: boolean) => {
    const isConnected = forceExtensionConnected ?? extensionConnected

    if (!row || !isConnected) {
      console.log('跳过自动填写: 行为空或扩展未连接')
      return
    }
    
    const studentId = row[rowConfig.studentIdCol - 1]
    const studentName = row[rowConfig.nameCol - 1]
    
    if (!studentId || !studentName) {
      console.warn('学号或姓名为空，跳过自动填写')
      return
    }
    
    console.log(`[CheckWindow] 发送自动填写消息: 学号=${studentId}, 姓名=${studentName}`)
    
    // 发送自动填写请求（不等待结果，由用户自行判断）
    ;(window.electronAPI as any).sendToExtension({
      type: 'AUTO_FILL',
      data: {
        studentId: String(studentId),
        studentName: String(studentName)
      }
    }).catch((err: any) => {
      console.error('[CheckWindow] 发送自动填写消息失败:', err)
    })
  }
  
  // 自动填写当前行（使用当前状态）
  const autoFillCurrentRow = async () => {
    return autoFillRow(currentRow, config)
  }

  const loadCurrentRow = async () => {
    try {
      const result = await window.electronAPI.getCurrentRow()
      if (result) {
        setCurrentRow(result.row)
        setIndex(result.index)
        setCurrentRowIndex(result.index)
        if (result.config) {
          setConfig(result.config)
        }
        
        // 检查当前行是否已标记
        const markedStatus = await window.electronAPI.checkRowMarked(result.index)
        setIsMarked(markedStatus.marked)
        
        // 自动复制学号到剪切板
        const currentConfig = result.config || config
        const studentId = result.row[currentConfig.studentIdCol - 1]
        if (studentId) {
          await window.electronAPI.copyToClipboard(String(studentId))
        }
      }
    } catch (error) {
      console.error('加载当前行失败:', error)
    }
  }

  const handleMark = async () => {
    if (!currentRow) return
    
    // 如果已标记，直接取消标记
    if (isMarked) {
      try {
        const result = await window.electronAPI.unmarkRow(currentRowIndex)
        if (result.success) {
          setIsMarked(false)
        } else {
          alert('取消标记失败: ' + result.error)
        }
      } catch (error) {
        alert('取消标记时出错: ' + error)
      }
      return
    }
    
    // 如果未标记，打开备注输入窗口
    try {
      // 确保 currentRow 是数组
      const rowDataArray = Array.isArray(currentRow) ? currentRow : Object.values(currentRow || {})
      await window.electronAPI.openNoteWindow(rowDataArray, currentRowIndex)
    } catch (error) {
      alert('打开备注窗口失败: ' + error)
    }
  }



  const handleEnd = async () => {
    try {
      await window.electronAPI.endCheck()
      // 不在这里调用 onEnd，让主进程处理窗口切换和导航
      // 主进程会关闭核查窗口，恢复主窗口，并导航到结束页面
    } catch (error) {
      console.error('结束核查失败:', error)
    }
  }

  const handleIndexClick = async () => {
    try {
      await window.electronAPI.openTablePreview()
    } catch (error) {
      console.error('打开表格预览失败:', error)
    }
  }

  if (!currentRow) {
    return (
      <div className="w-full h-screen bg-white flex items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    )
  }

  const indexValue = currentRow[config.indexCol - 1] || '-'
  const nameValue = currentRow[config.nameCol - 1] || '-'
  const studentIdValue = currentRow[config.studentIdCol - 1] || '-'

  return (
    <div className="w-full h-screen bg-white flex flex-col">
      <div className="flex-1 p-2.5 flex flex-col min-h-0">
        {/* 紧凑的信息栏 - 可拖动区域 */}
        <div 
          className="flex items-center justify-between mb-1.5 pb-1.5 border-b border-gray-200"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <h2 className="text-xs font-semibold text-gray-700">核查信息</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExtensionStatusClick}
              className={`text-xs px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80 transition-opacity ${
                extensionConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}
              title="点击检查扩展连接状态"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              {extensionConnected ? '✓ 扩展已连接' : '✗ 扩展未连接'}
            </button>
            <span className="text-xs text-gray-500">#{index}</span>
          </div>
        </div>

        {/* 紧凑的信息显示区域 */}
        <div className="flex-1 space-y-1.5 mb-1.5 min-h-0">
          <div 
            className="group bg-gray-50 rounded px-2.5 py-1.5 border border-gray-200 cursor-pointer hover:bg-blue-50 hover:border-apple-blue transition-all duration-200 active:scale-[0.98] active:bg-blue-100 shadow-sm hover:shadow-md"
            onClick={handleIndexClick}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            title="点击打开表格预览"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 group-hover:text-apple-blue transition-colors duration-200">序号</span>
              <span className="text-sm font-semibold text-gray-800 group-hover:text-apple-blue transition-colors duration-200">{indexValue}</span>
            </div>
          </div>

          <div className="bg-gray-50 rounded px-2.5 py-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">姓名</span>
              <span className="text-xs font-semibold text-gray-800 truncate max-w-[140px]" title={String(nameValue)}>{nameValue}</span>
            </div>
          </div>

          <div className="bg-blue-50 rounded px-2.5 py-1.5 border border-apple-blue">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-apple-blue">学号</span>
              <span className="text-xs font-semibold text-apple-blue truncate max-w-[140px]" title={String(studentIdValue)}>{studentIdValue}</span>
            </div>
          </div>
        </div>

        {/* 紧凑的按钮区域 */}
        <div className="space-y-1.5 flex-shrink-0">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={handleNext}
              className="bg-apple-blue text-white px-2 py-1.5 rounded text-xs font-medium hover:bg-blue-600 transition-colors"
              title="Ctrl+N"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              下一行
            </button>
            <button
              data-mark-button
              onClick={handleMark}
              className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                isMarked
                  ? 'bg-gray-500 text-white hover:bg-gray-600'
                  : 'bg-orange-500 text-white hover:bg-orange-600'
              }`}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              {isMarked ? '取消标记' : '标记'}
            </button>
          </div>

          <button
            onClick={handleEnd}
            className="w-full bg-red-500 text-white px-2 py-1.5 rounded text-xs font-medium hover:bg-red-600 transition-colors"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            结束核查
          </button>
        </div>
      </div>
    </div>
  )
}

