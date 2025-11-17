import { useState, useEffect, useRef } from 'react'
import TitleBar from '../components/TitleBar'

export default function TablePreviewWindow() {
  const [data, setData] = useState<any[][]>([])
  const [config, setConfig] = useState<any>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredData, setFilteredData] = useState<any[][]>([])
  const [filteredIndexMap, setFilteredIndexMap] = useState<number[]>([]) // 映射：过滤后的索引 -> 原始索引
  const tableRef = useRef<HTMLDivElement>(null)
  const currentRowRef = useRef<HTMLTableRowElement>(null)

  useEffect(() => {
    // 加载所有核查数据
    const loadData = async () => {
      try {
        const result = await window.electronAPI.getAllCheckData()
        if (result.success && result.data) {
          setData(result.data)
          setFilteredData(result.data)
          setFilteredIndexMap(result.data.map((_, index) => index))
          setConfig(result.config)
          setCurrentIndex(result.currentIndex || 0)
        }
      } catch (error) {
        console.error('加载数据失败:', error)
      }
    }
    
    loadData()

    // 监听跳转事件（从主进程发送）
    const handleJumpToRow = (event: any, payload: any) => {
      if (payload && payload.index) {
        setCurrentIndex(payload.index)
        // 滚动到当前行
        setTimeout(() => {
          if (currentRowRef.current) {
            currentRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }, 100)
      }
    }

    if (window.electronAPI.onJumpToRow) {
      window.electronAPI.onJumpToRow(handleJumpToRow)
    }

    return () => {
      // 清理监听器
    }
  }, [])

  // 搜索过滤
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredData(data)
      setFilteredIndexMap(data.map((_, index) => index))
      return
    }

    const filtered: any[][] = []
    const indexMap: number[] = []
    
    data.forEach((row, originalIndex) => {
      // 搜索所有列
      const matches = row.some(cell => {
        const cellStr = String(cell || '').toLowerCase()
        return cellStr.includes(searchTerm.toLowerCase())
      })
      
      if (matches) {
        filtered.push(row)
        indexMap.push(originalIndex)
      }
    })
    
    setFilteredData(filtered)
    setFilteredIndexMap(indexMap)
  }, [searchTerm, data])

  // 滚动到当前行
  useEffect(() => {
    if (currentRowRef.current) {
      currentRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentIndex, filteredData])

  const handleRowClick = async (rowIndex: number) => {
    try {
      // rowIndex 是过滤后数据的索引
      // 使用映射找到原始索引
      const originalRowIndex = filteredIndexMap[rowIndex]
      
      if (originalRowIndex === undefined || originalRowIndex === -1) {
        alert('无法找到对应的行')
        return
      }
      
      const result = await window.electronAPI.jumpToRow(originalRowIndex + 1)
      if (result.success) {
        setCurrentIndex(originalRowIndex + 1)
        // 关闭预览窗口
        await window.electronAPI.closeTablePreview()
      } else {
        alert('跳转失败: ' + result.error)
      }
    } catch (error) {
      console.error('跳转失败:', error)
      alert('跳转时出错: ' + error)
    }
  }

  const handleClose = async () => {
    await window.electronAPI.closeTablePreview()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose()
    }
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-screen bg-white flex flex-col" onKeyDown={handleKeyDown}>
        <TitleBar title="表格预览" />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">暂无数据</p>
        </div>
      </div>
    )
  }

  // 获取表头（第一行）
  const headers = data[0] || []
  const maxCols = Math.max(...data.map(row => row.length), headers.length)

  return (
    <div className="w-full h-screen bg-white flex flex-col" onKeyDown={handleKeyDown}>
      <TitleBar title="表格预览" />
      
      <div className="flex-1 flex flex-col min-h-0">
        {/* 搜索栏 */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-apple-blue focus:border-transparent"
              autoFocus
            />
            <span className="text-sm text-gray-500">
              共 {filteredData.length} 行
            </span>
          </div>
        </div>

        {/* 表格容器 */}
        <div ref={tableRef} className="flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200 w-16">
                  行号
                </th>
                {Array.from({ length: maxCols }).map((_, colIndex) => (
                  <th
                    key={colIndex}
                    className="px-4 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200 min-w-[120px]"
                  >
                    列 {colIndex + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, rowIndex) => {
                // 使用映射找到原始索引
                const originalRowIndex = filteredIndexMap[rowIndex]
                const isCurrentRow = originalRowIndex !== undefined && originalRowIndex + 1 === currentIndex
                
                return (
                  <tr
                    key={originalRowIndex}
                    ref={isCurrentRow ? currentRowRef : null}
                    onClick={() => handleRowClick(rowIndex)}
                    className={`
                      cursor-pointer hover:bg-blue-50 transition-colors
                      ${isCurrentRow ? 'bg-apple-blue text-white hover:bg-blue-600' : ''}
                    `}
                  >
                    <td className={`px-4 py-2 text-sm border-b border-gray-200 font-medium ${isCurrentRow ? 'text-white' : 'text-gray-900'}`}>
                      {originalRowIndex !== undefined ? originalRowIndex + 1 : '-'}
                    </td>
                    {Array.from({ length: maxCols }).map((_, colIndex) => (
                      <td
                        key={colIndex}
                        className={`px-4 py-2 text-sm border-b border-gray-200 ${isCurrentRow ? 'text-white' : 'text-gray-700'}`}
                        title={String(row[colIndex] || '')}
                      >
                        <div className="truncate max-w-[200px]">
                          {String(row[colIndex] || '')}
                        </div>
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* 底部提示 */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-500 text-center">
            点击行号跳转到该行 | 按 ESC 关闭窗口 | 当前行: {currentIndex}
          </p>
        </div>
      </div>
    </div>
  )
}

