import { useState, useEffect } from 'react'

interface TitleBarProps {
  title?: string
  showControls?: boolean
  showMaximize?: boolean
  showMinimize?: boolean
}

export default function TitleBar({ title = '广理成绩核查', showControls = true, showMaximize = true, showMinimize = true }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    // 检查窗口是否最大化
    const checkMaximized = async () => {
      if (window.electronAPI?.windowIsMaximized) {
        const maximized = await window.electronAPI.windowIsMaximized()
        setIsMaximized(maximized)
      }
    }
    
    checkMaximized()
    
    // 监听窗口状态变化
    const interval = setInterval(checkMaximized, 500)
    return () => clearInterval(interval)
  }, [])

  const handleMinimize = async () => {
    if (window.electronAPI?.windowMinimize) {
      await window.electronAPI.windowMinimize()
    }
  }

  const handleMaximize = async () => {
    if (window.electronAPI?.windowMaximize) {
      await window.electronAPI.windowMaximize()
      setIsMaximized(!isMaximized)
    }
  }

  const handleClose = async () => {
    if (window.electronAPI?.windowClose) {
      await window.electronAPI.windowClose()
    }
  }

  if (!showControls) {
    return null
  }

  return (
    <div 
      className="h-10 bg-white border-b border-gray-200 flex items-center justify-end select-none"
      style={{ 
        WebkitAppRegion: 'drag',
        userSelect: 'none',
        WebkitUserSelect: 'none'
      }}
    >
      {/* 右侧：窗口控制按钮 - Windows 风格 */}
      <div 
        className="flex items-center h-full"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        {/* 最小化按钮 */}
        {showMinimize && (
          <button
            onClick={handleMinimize}
            className="h-full w-12 flex items-center justify-center hover:bg-gray-100 transition-colors group"
            title="最小化"
          >
            <svg 
              className="w-4 h-4 text-gray-600 group-hover:text-gray-900" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
        )}

        {/* 最大化/还原按钮 */}
        {showMaximize && (
          <button
            onClick={handleMaximize}
            className="h-full w-12 flex items-center justify-center hover:bg-gray-100 transition-colors group"
            title={isMaximized ? "还原" : "最大化"}
          >
            {isMaximized ? (
              // 还原图标（两个重叠的窗口）
              <svg 
                className="w-4 h-4 text-gray-600 group-hover:text-gray-900" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            ) : (
              // 最大化图标（四角向外扩展，对称）
              <svg 
                className="w-4 h-4 text-gray-600 group-hover:text-gray-900" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            )}
          </button>
        )}

        {/* 关闭按钮 */}
        <button
          onClick={handleClose}
          className="h-full w-12 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors group"
          title="关闭"
        >
          <svg 
            className="w-4 h-4 text-gray-600 group-hover:text-white" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

