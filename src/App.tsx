import { useState, useEffect } from 'react'
import { HashRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import MainPage from './pages/MainPage'
import CheckWindow from './pages/CheckWindow'
import EndPage from './pages/EndPage'
import NoteWindow from './pages/NoteWindow'
import SettingsPage from './pages/SettingsPage'
import TablePreviewWindow from './pages/TablePreviewWindow'

function AppContent() {
  const location = useLocation()
  const navigate = useNavigate()
  const [checkResult, setCheckResult] = useState<any>(null)

  // 监听路由变化和自定义事件，获取核查结果
  useEffect(() => {
    // 监听自定义事件（从主进程触发）
    const handleCheckResult = (event: any) => {
      if (event.detail) {
        setCheckResult(event.detail)
      }
    }
    
    window.addEventListener('check-result', handleCheckResult as EventListener)
    
    // 如果导航到结束页面但没有结果，尝试从主进程获取
    if (location.hash === '#/end' && !checkResult) {
      if (window.electronAPI) {
        window.electronAPI.getLastCheckResult().then((result: any) => {
          if (result) {
            setCheckResult(result)
          }
        })
      }
    }
    
    return () => {
      window.removeEventListener('check-result', handleCheckResult as EventListener)
    }
  }, [location, checkResult])

  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route path="/check" element={<CheckWindow onEnd={(result) => {
        setCheckResult(result)
        // 延迟导航，确保主窗口已经恢复并调整大小
        setTimeout(() => {
          navigate('/end')
        }, 200)
      }} />} />
      <Route path="/end" element={<EndPage result={checkResult} onBack={() => {
        setCheckResult(null)
        navigate('/')
      }} />} />
      <Route path="/note" element={<NoteWindow />} />
      <Route path="/table-preview" element={<TablePreviewWindow />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  )
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  )
}

export default App

