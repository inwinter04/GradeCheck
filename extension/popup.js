// Popup脚本
document.addEventListener('DOMContentLoaded', () => {
  const statusDiv = document.getElementById('status');
  const checkBtn = document.getElementById('checkBtn');
  
  function updateStatus(connected) {
    if (connected) {
      statusDiv.className = 'status connected';
      statusDiv.textContent = '✓ 已连接到主应用';
    } else {
      statusDiv.className = 'status disconnected';
      statusDiv.textContent = '✗ 未连接到主应用';
    }
  }
  
  // 检查连接状态
  function checkConnection() {
    chrome.runtime.sendMessage({ type: 'CHECK_CONNECTION' }, (response) => {
      if (chrome.runtime.lastError) {
        updateStatus(false);
        return;
      }
      updateStatus(response && response.connected);
    });
  }
  
  checkBtn.addEventListener('click', checkConnection);
  
  // 初始检查
  checkConnection();
});

