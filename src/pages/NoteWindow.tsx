import { useState, useEffect } from 'react'
import TitleBar from '../components/TitleBar'

export default function NoteWindow() {
  const [note, setNote] = useState('')
  const [pendingData, setPendingData] = useState<{ rowData: any[]; rowIndex: number } | null>(null)

  useEffect(() => {
    // 获取待标记的数据
    const loadData = async () => {
      try {
        const data = await window.electronAPI.getPendingMarkData()
        if (data) {
          setPendingData(data)
        }
      } catch (error) {
        console.error('加载数据失败:', error)
      }
    }
    
    loadData()
  }, [])

  const handleConfirm = async () => {
    if (!pendingData) return
    
    try {
      const result = await window.electronAPI.markRow(pendingData.rowData, note, pendingData.rowIndex)
      if (result.success) {
        // 通知核查窗口更新状态
        await window.electronAPI.closeNoteWindow()
      } else {
        alert('标记失败: ' + result.error)
      }
    } catch (error) {
      alert('标记时出错: ' + error)
    }
  }

  const handleCancel = async () => {
    await window.electronAPI.closeNoteWindow()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel()
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleConfirm()
    }
  }

  return (
    <div className="w-full h-screen bg-white flex flex-col">
      {/* 自定义标题栏 */}
      <TitleBar title="添加备注" showMaximize={false} showMinimize={false} />
      
      <div className="flex-1 flex flex-col p-6 min-h-0">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">添加备注</h3>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="请输入备注信息（可选）"
          className="flex-1 w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-apple-blue focus:border-transparent resize-none text-sm"
          autoFocus
        />
        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={handleCancel}
            className="px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="px-6 py-2 text-sm font-medium bg-apple-blue text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            确认
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2 text-center">按 Ctrl+Enter 快速确认，ESC 取消</p>
      </div>
    </div>
  )
}

