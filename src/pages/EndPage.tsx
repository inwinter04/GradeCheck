interface EndPageProps {
  result: {
    startIndex: number
    endIndex: number
    duration: number
    markedCount: number
  } | null
  onBack: () => void
}

export default function EndPage({ result, onBack }: EndPageProps) {
  if (!result) {
    return (
      <div className="w-full h-screen bg-apple-gray flex items-center justify-center">
        <p className="text-gray-500">没有核查结果</p>
      </div>
    )
  }

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) {
      return `${hours}小时 ${minutes % 60}分钟 ${seconds % 60}秒`
    } else if (minutes > 0) {
      return `${minutes}分钟 ${seconds % 60}秒`
    } else {
      return `${seconds}秒`
    }
  }

  return (
    <div className="w-full h-screen bg-apple-gray flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-800 mb-1">核查完成</h1>
          <p className="text-sm text-gray-500">本次核查已成功结束</p>
        </div>

        <div className="space-y-3 mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 font-medium">起始序号</span>
              <span className="text-xl font-semibold text-gray-800">{result.startIndex}</span>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 font-medium">结束序号</span>
              <span className="text-xl font-semibold text-gray-800">{result.endIndex}</span>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 font-medium">核查数量</span>
              <span className="text-xl font-semibold text-gray-800">
                {result.endIndex - result.startIndex + 1} 条
              </span>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 font-medium">标记数量</span>
              <span className="text-xl font-semibold text-orange-500">{result.markedCount} 条</span>
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-4 border-2 border-apple-blue">
            <div className="flex justify-between items-center">
              <span className="text-sm text-apple-blue font-medium">耗时</span>
              <span className="text-xl font-semibold text-apple-blue">
                {formatDuration(result.duration)}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={onBack}
          className="w-full bg-apple-blue text-white px-4 py-3 rounded-xl text-base font-medium hover:bg-blue-600 transition-colors shadow-lg"
        >
          返回主页
        </button>
      </div>
    </div>
  )
}

