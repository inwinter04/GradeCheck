import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import TitleBar from '../components/TitleBar'

interface ExcelData {
  data: any[][]
  filePath: string
}

interface Config {
  startRow: number
  indexCol: number
  nameCol: number
  studentIdCol: number
}

export default function MainPage() {
  const navigate = useNavigate()
  const [excelData, setExcelData] = useState<ExcelData | null>(null)
  const [previewRows, setPreviewRows] = useState(20)
  const [showPreview, setShowPreview] = useState(false)
  const [config, setConfig] = useState<Config>({
    startRow: 2,
    indexCol: 1,
    nameCol: 2,
    studentIdCol: 3,
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewScrollRef = useRef<HTMLDivElement>(null)

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    // 文件输入主要用于备用，主要使用 Electron 对话框
    event.preventDefault()
    handleFileButtonClick()
  }

  const handleFileButtonClick = async () => {
    try {
      if (!window.electronAPI) {
        alert('Electron API 未加载，请确保在 Electron 环境中运行')
        return
      }
      
      const filePath = await window.electronAPI.showOpenDialog()
      if (!filePath) return

      const result = await window.electronAPI.readExcel(filePath)
      if (result.success) {
        setExcelData({
          data: result.data,
          filePath: filePath,
        })
        setShowPreview(true)
        setPreviewRows(20) // 重置预览行数
      } else {
        alert('读取Excel文件失败: ' + result.error)
      }
    } catch (error: any) {
      alert('读取文件时出错: ' + (error?.message || error))
      console.error('File selection error:', error)
    }
  }

  // 自动检测配置
  const autoDetectConfig = () => {
    if (!excelData || !excelData.data || excelData.data.length === 0) {
      alert('请先上传Excel文件')
      return
    }

    const data = excelData.data
    const maxRows = Math.min(data.length, 100) // 只检查前100行以提高性能
    const maxCols = data[0]?.length || 0

    // 1. 检测学号列（13位纯数字）
    let studentIdCol = -1
    const studentIdPattern = /^\d{13}$/
    for (let col = 0; col < maxCols; col++) {
      let matchCount = 0
      for (let row = 0; row < maxRows; row++) {
        const cell = String(data[row]?.[col] || '').trim()
        if (cell && studentIdPattern.test(cell)) {
          matchCount++
        }
      }
      // 如果该列有至少3个13位数字，认为是学号列
      if (matchCount >= 3) {
        studentIdCol = col + 1
        break
      }
    }

    // 2. 检测序号列（连续的数字序列：1,2,3...）
    let indexCol = -1
    let startRow = -1
    let bestSequenceLength = 0

    for (let col = 0; col < maxCols; col++) {
      // 跳过已检测到的学号列
      if (col + 1 === studentIdCol) continue

      // 查找连续的数字序列，从1开始
      let sequenceStart = -1
      let sequenceLength = 0
      let expectedValue = 1
      let bestStart = -1
      let bestLength = 0

      for (let row = 0; row < maxRows; row++) {
        const cell = String(data[row]?.[col] || '').trim()
        const numValue = parseInt(cell)

        // 检查是否是期望的值（从1开始）
        if (numValue === expectedValue && !isNaN(numValue)) {
          if (sequenceStart === -1) {
            sequenceStart = row
          }
          sequenceLength++
          expectedValue++
        } else {
          // 序列中断，记录当前最佳序列
          if (sequenceLength > bestLength && sequenceStart !== -1) {
            bestLength = sequenceLength
            bestStart = sequenceStart
          }
          
          // 如果当前单元格是1，重新开始序列
          if (numValue === 1 && !isNaN(numValue)) {
            sequenceStart = row
            sequenceLength = 1
            expectedValue = 2
          } else {
            // 重置
            sequenceStart = -1
            sequenceLength = 0
            expectedValue = 1
          }
        }
      }

      // 检查最后一段序列
      if (sequenceLength > bestLength && sequenceStart !== -1) {
        bestLength = sequenceLength
        bestStart = sequenceStart
      }

      // 如果找到更长的序列，更新结果
      if (bestLength >= 3 && bestLength > bestSequenceLength) {
        indexCol = col + 1
        startRow = bestStart + 1 // 转换为1-based索引
        bestSequenceLength = bestLength
      }
    }

    // 3. 检测姓名列（排除序号列和学号列，找包含中文的列）
    let nameCol = -1
    const chinesePattern = /[\u4e00-\u9fa5]/
    for (let col = 0; col < maxCols; col++) {
      // 跳过已检测到的列
      if (col + 1 === indexCol || col + 1 === studentIdCol) continue

      let chineseCount = 0
      for (let row = 0; row < maxRows; row++) {
        const cell = String(data[row]?.[col] || '').trim()
        if (cell && chinesePattern.test(cell) && cell.length >= 2 && cell.length <= 10) {
          chineseCount++
        }
      }
      // 如果该列有至少3个包含中文的单元格，认为是姓名列
      if (chineseCount >= 3) {
        nameCol = col + 1
        break
      }
    }

    // 如果没找到姓名列，尝试找非数字、非学号的文本列
    if (nameCol === -1) {
      for (let col = 0; col < maxCols; col++) {
        if (col + 1 === indexCol || col + 1 === studentIdCol) continue

        let textCount = 0
        for (let row = 0; row < maxRows; row++) {
          const cell = String(data[row]?.[col] || '').trim()
          // 不是纯数字，不是学号，长度在2-10之间
          if (cell && !/^\d+$/.test(cell) && !studentIdPattern.test(cell) && cell.length >= 2 && cell.length <= 10) {
            textCount++
          }
        }
        if (textCount >= 3) {
          nameCol = col + 1
          break
        }
      }
    }

    // 更新配置（使用默认值作为fallback）
    const newConfig: Config = {
      startRow: startRow > 0 ? startRow : 2,
      indexCol: indexCol > 0 ? indexCol : 1,
      nameCol: nameCol > 0 ? nameCol : 2,
      studentIdCol: studentIdCol > 0 ? studentIdCol : 3,
    }

    setConfig(newConfig)
  }

  const handleStartCheck = async () => {
    if (!excelData) {
      alert('请先上传Excel文件')
      return
    }

    try {
      const result = await window.electronAPI.startCheck(excelData.data, config, excelData.filePath)
      if (result.success) {
        navigate('/check')
      } else {
        alert('启动核查失败')
      }
    } catch (error) {
      alert('启动核查时出错: ' + error)
    }
  }

  // 自动检测配置（当打开预览窗口时）
  useEffect(() => {
    if (excelData && showPreview) {
      // 使用 setTimeout 确保在下一个事件循环中执行，避免状态更新冲突
      const timer = setTimeout(() => {
        autoDetectConfig()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [excelData?.filePath, showPreview]) // 只依赖文件路径，避免重复检测

  // 无限滚动加载
  useEffect(() => {
    const scrollContainer = previewScrollRef.current
    if (!scrollContainer || !excelData || !showPreview) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer
      // 当滚动到距离底部 100px 时加载更多
      if (scrollHeight - scrollTop - clientHeight < 100) {
        setPreviewRows(prev => {
          if (prev >= excelData.data.length) return prev
          const next = Math.min(prev + 20, excelData.data.length)
          return next
        })
      }
    }

    scrollContainer.addEventListener('scroll', handleScroll)
    return () => scrollContainer.removeEventListener('scroll', handleScroll)
  }, [excelData, showPreview])

  // ESC 键关闭预览
  useEffect(() => {
    if (!showPreview) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPreview(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showPreview])

  return (
    <div className="w-full h-screen bg-apple-gray flex flex-col">
      {/* 自定义标题栏 */}
      <TitleBar title="广理成绩核查" />
      
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-apple-dark">广理成绩核查</h1>
            <p className="text-gray-500 mt-1">上传Excel表格开始核查</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                try {
                  if (!window.electronAPI) {
                    alert('Electron API 未加载，请确保在 Electron 环境中运行')
                    return
                  }
                  const result = await window.electronAPI.openMarksFolder()
                  if (!result.success) {
                    alert('打开标记文件夹失败: ' + result.error)
                  }
                } catch (error) {
                  alert('打开标记文件夹时出错: ' + error)
                }
              }}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center gap-2"
              title="打开标记记录文件夹"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              打开标记文件夹
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center gap-2"
              title="设置"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              设置
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* 文件上传区域 */}
          <div className="bg-white rounded-2xl shadow-sm p-8">
            <h2 className="text-xl font-semibold mb-4">上传核查表</h2>
            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-apple-blue transition-colors"
              onClick={handleFileButtonClick}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
              {excelData ? (
                <div>
                  <p className="text-apple-blue text-lg font-medium">文件已上传</p>
                  <p className="text-gray-500 mt-2">{excelData.filePath.split('\\').pop()}</p>
                </div>
              ) : (
                <div>
                  <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-gray-600">点击或拖拽文件到此处上传</p>
                  <p className="text-gray-400 text-sm mt-2">支持 .xlsx, .xls 格式</p>
                </div>
              )}
            </div>
          </div>

          {/* 数据预览按钮 */}
          {excelData && !showPreview && (
            <div className="bg-white rounded-2xl shadow-sm p-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold mb-2">数据预览</h2>
                  <p className="text-gray-500 text-sm">共 {excelData.data.length} 行数据</p>
                </div>
                <button
                  onClick={() => setShowPreview(true)}
                  className="bg-apple-blue text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors"
                >
                  查看数据
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* 数据预览悬浮窗 */}
      {excelData && showPreview && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowPreview(false)
            }
          }}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full h-full max-w-[98vw] max-h-[95vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '98vw', height: '95vh' }}
          >
            {/* 悬浮窗头部 */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
              <div>
                <h2 className="text-xl font-semibold">数据预览与配置</h2>
                <p className="text-gray-500 text-sm mt-1">
                  共 {excelData.data.length} 行，已显示 {Math.min(previewRows, excelData.data.length)} 行
                </p>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="关闭"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 左右分栏容器 - 80% 和 20% */}
            <div className="flex-1 flex overflow-hidden" style={{ height: 'calc(95vh - 80px)' }}>
              {/* 左侧：表格预览 - 80% */}
              <div className="flex flex-col border-r border-gray-300" style={{ width: '80%', minWidth: 0 }}>
                <div 
                  ref={previewScrollRef}
                  className="flex-1 overflow-auto relative"
                  style={{ overflowX: 'auto', overflowY: 'auto' }}
                >
                  <table className="w-full border-collapse table-fixed min-w-full">
                    <colgroup>
                      <col style={{ width: '80px', minWidth: '80px' }} />
                      {excelData.data[0]?.map((_, colIndex) => {
                        const colCount = excelData.data[0]?.length || 0
                        const remainingWidth = colCount > 0 ? `calc((100% - 80px) / ${colCount})` : '150px'
                        return (
                          <col 
                            key={colIndex} 
                            style={{ width: remainingWidth, minWidth: '120px' }}
                          />
                        )
                      })}
                    </colgroup>
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="border border-gray-200 px-3 py-3 text-left text-sm font-medium text-gray-700 bg-gray-50 sticky left-0 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                          行号
                        </th>
                        {excelData.data[0]?.map((_, colIndex) => (
                          <th 
                            key={colIndex} 
                            className="border border-gray-200 px-3 py-3 text-left text-sm font-medium text-gray-700"
                          >
                            <div className="truncate" title={`列 ${colIndex + 1}`}>
                              列 {colIndex + 1}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {excelData.data.slice(0, previewRows).map((row, rowIndex) => (
                        <tr key={rowIndex} className="hover:bg-gray-50">
                          <td className="border border-gray-200 px-3 py-2 text-sm text-gray-600 bg-gray-50 sticky left-0 z-10 font-medium text-center shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                            {rowIndex + 1}
                          </td>
                          {row.map((cell, colIndex) => {
                            const cellValue = cell || '-'
                            const cellStr = String(cellValue)
                            return (
                              <td 
                                key={colIndex} 
                                className="border border-gray-200 px-3 py-2 text-sm"
                              >
                                <div 
                                  className="truncate cursor-help" 
                                  title={cellStr}
                                >
                                  {cellStr}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 右侧：配置选项 - 20% */}
              <div className="flex flex-col bg-gray-50 flex-shrink-0" style={{ width: '20%', minWidth: '280px' }}>
                <div className="p-4 overflow-y-auto flex-1" style={{ overflowY: 'auto' }}>
                  <h3 className="text-lg font-semibold mb-4">配置选项</h3>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        起始行号
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={excelData.data.length}
                        value={config.startRow}
                        onChange={(e) => setConfig({ ...config, startRow: parseInt(e.target.value) || 1 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-apple-blue focus:border-transparent text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">从第几行开始核查</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        序号列
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={config.indexCol}
                        onChange={(e) => setConfig({ ...config, indexCol: parseInt(e.target.value) || 1 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-apple-blue focus:border-transparent text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">序号所在的列号</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        姓名列
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={config.nameCol}
                        onChange={(e) => setConfig({ ...config, nameCol: parseInt(e.target.value) || 1 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-apple-blue focus:border-transparent text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">姓名所在的列号</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        学号列
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={config.studentIdCol}
                        onChange={(e) => setConfig({ ...config, studentIdCol: parseInt(e.target.value) || 1 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-apple-blue focus:border-transparent text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">学号所在的列号</p>
                    </div>
                  </div>
                </div>
                <div className="p-4 border-t border-gray-200 bg-white flex-shrink-0">
                  <button
                    onClick={handleStartCheck}
                    className="w-full bg-apple-blue text-white px-4 py-3 rounded-xl text-base font-medium hover:bg-blue-600 transition-colors shadow-lg hover:shadow-xl"
                  >
                    开始核查
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

