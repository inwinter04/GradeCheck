// 浏览器扩展后台脚本
// 处理与主应用的通信

const SERVER_URL = 'http://localhost:8765';
let pollInterval = null;

// 检查服务器连接
async function checkServerConnection() {
  try {
    const response = await fetch(`${SERVER_URL}/status`);
    if (response.ok) {
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

// 发送消息到主应用
async function sendToApp(message) {
  try {
    const response = await fetch(`${SERVER_URL}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message)
    });
    return response.ok;
  } catch (error) {
    console.error('发送消息到主应用失败:', error);
    return false;
  }
}

// 轮询获取来自主应用的消息
async function pollForMessages() {
  try {
    const requestId = Date.now().toString();
    const response = await fetch(`${SERVER_URL}/poll?requestId=${requestId}`);
    if (response.ok) {
      const message = await response.json();
      if (message && !message.timeout) {
        console.log('轮询收到消息:', message);
        handleMessageFromApp(message);
      }
    }
  } catch (error) {
    // 忽略轮询错误，继续轮询
    console.error('轮询错误:', error);
  }
  
  // 继续轮询
  if (pollInterval) {
    clearTimeout(pollInterval);
  }
  pollInterval = setTimeout(pollForMessages, 500); // 缩短轮询间隔到500ms
}

// 记录已注入的标签页
const injectedTabs = new Set();

// 检查content script是否已注入
function checkContentScriptInjected(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'PING' })
      .then(() => resolve(true))
      .catch(() => resolve(false));
  });
}

// 确保content script已注入（如果未注入则注入）
async function ensureContentScriptInjected(tabId) {
  // 先检查是否已注入（使用更短的超时时间）
  const isInjected = await Promise.race([
    checkContentScriptInjected(tabId),
    new Promise(resolve => setTimeout(() => resolve(false), 100)) // 100ms 超时
  ]);
  
  if (isInjected) {
    console.log(`[Background] Content script已注入，标签页: ${tabId}`);
    return true;
  }
  
  // 如果未注入，则注入
  console.log(`[Background] Content script未注入，开始注入，标签页: ${tabId}`);
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    injectedTabs.add(tabId);
    console.log(`[Background] Content script注入成功，标签页: ${tabId}`);
    // 减少等待时间，让脚本快速初始化
    await new Promise(resolve => setTimeout(resolve, 100));
    return true;
  } catch (err) {
    console.error(`[Background] 注入脚本失败，标签页: ${tabId}:`, err);
    return false;
  }
}

// 打开或激活标签页（如果已存在则激活，否则创建新的）
function openOrActivateTab(url) {
  return new Promise((resolve, reject) => {
    // 使用正确的URL匹配模式（Chrome扩展需要匹配host_permissions）
    const urlPattern = url.replace(/\/$/, '') + '/*';
    
    chrome.tabs.query({ url: urlPattern }, (tabs) => {
      // 检查是否有错误
      if (chrome.runtime.lastError) {
        console.error('查询标签页失败:', chrome.runtime.lastError);
        // 即使查询失败，也尝试创建新标签页
        chrome.tabs.create({ url: url, active: true }, (tab) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(tab);
          }
        });
        return;
      }
      
      // 检查tabs是否存在
      if (tabs && tabs.length > 0) {
        // 如果已存在，激活第一个标签页
        const tab = tabs[0];
        chrome.tabs.update(tab.id, { active: true }, () => {
          if (chrome.runtime.lastError) {
            console.error('激活标签页失败:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          chrome.windows.update(tab.windowId, { focused: true }, () => {
            if (chrome.runtime.lastError) {
              console.error('聚焦窗口失败:', chrome.runtime.lastError);
            }
            resolve(tab);
          });
        });
      } else {
        // 如果不存在，创建新标签页
        chrome.tabs.create({ url: url, active: true }, (tab) => {
          if (chrome.runtime.lastError) {
            console.error('创建标签页失败:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(tab);
          }
        });
      }
    });
  });
}

// 处理来自主应用的消息
function handleMessageFromApp(message) {
  console.log('收到来自主应用的消息:', message);
  
  if (message.type === 'OPEN_TAB') {
    // 打开或激活标签页
    openOrActivateTab(message.url || 'https://jwxt.gdlgxy.edu.cn').then((tab) => {
      let resultSent = false;
      
      // 检查页面是否已经加载完成
      chrome.tabs.get(tab.id, (updatedTab) => {
        if (chrome.runtime.lastError) {
          console.error('获取标签页信息失败:', chrome.runtime.lastError);
          if (!resultSent) {
            resultSent = true;
            sendToApp({
              type: 'OPEN_TAB_RESULT',
              data: {
                success: false,
                error: chrome.runtime.lastError.message
              }
            });
          }
          return;
        }
        
        if (updatedTab && updatedTab.status === 'complete' && !resultSent) {
          resultSent = true;
          sendToApp({
            type: 'OPEN_TAB_RESULT',
            data: {
              success: true,
              tabId: tab.id
            }
          });
        }
      });
      
      // 如果页面还在加载，等待加载完成
      if (!resultSent) {
        chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
          if (tabId === tab.id && changeInfo.status === 'complete' && !resultSent) {
            chrome.tabs.onUpdated.removeListener(listener);
            resultSent = true;
            // 发送成功消息回主应用
            sendToApp({
              type: 'OPEN_TAB_RESULT',
              data: {
                success: true,
                tabId: tab.id
              }
            });
          }
        });
      }
    }).catch((err) => {
      console.error('打开标签页失败:', err);
      sendToApp({
        type: 'OPEN_TAB_RESULT',
        data: {
          success: false,
          error: err.message || '无法打开标签页'
        }
      });
    });
  } else if (message.type === 'AUTO_FILL') {
    console.log('[AUTO_FILL] 开始处理自动填写请求:', message.data);
    // 转发到content script，如果找不到标签页则不处理（不自动打开）
    // 只查询当前窗口的标签页，避免查询到后台标签页
    chrome.tabs.query({ url: 'https://jwxt.gdlgxy.edu.cn/*', currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error('[AUTO_FILL] 查询标签页失败:', chrome.runtime.lastError);
        console.log('[AUTO_FILL] 未找到标签页，不自动打开（用户要求）');
        return;
      }
      
      if (tabs && tabs.length > 0) {
        console.log('[AUTO_FILL] 找到标签页:', tabs.length, '个');
        // 打印找到的标签页信息，帮助调试
        tabs.forEach((tab, index) => {
          console.log(`[AUTO_FILL] 标签页 ${index + 1}: ID=${tab.id}, URL=${tab.url}, 可见=${!tab.hidden}, 活动=${tab.active}`);
        });
        // 激活标签页
        const tab = tabs[0];
        console.log('[AUTO_FILL] 激活标签页:', tab.id, tab.url);
        // 并行执行激活和检查注入，减少延迟
        Promise.all([
          new Promise((resolve) => {
            chrome.tabs.update(tab.id, { active: true }, () => {
              chrome.windows.update(tab.windowId, { focused: true }, () => {
                resolve();
              });
            });
          }),
          ensureContentScriptInjected(tab.id)
        ]).then(() => {
          // 直接发送消息，不等待
          chrome.tabs.sendMessage(tab.id, {
            type: 'EXECUTE_AUTO_FILL',
            data: message.data
          }).then(() => {
            console.log('[AUTO_FILL] 消息发送成功');
          }).catch(err => {
            console.error('[AUTO_FILL] 发送自动填写消息失败:', err);
          });
        }).catch(err => {
          console.error('[AUTO_FILL] 确保content script注入失败:', err);
        });
      } else {
        console.log('[AUTO_FILL] 未找到标签页（当前窗口），不自动打开（用户要求）');
        // 不再自动打开标签页，不执行任何操作
      }
    });
  } else if (message.type === 'NEXT_ROW') {
    console.log('[NEXT_ROW] 开始处理下一行请求');
    
    // 查找所有成绩单页面并关闭它们
    // 使用查询所有标签页然后过滤的方式，因为URL可能包含端口号
    console.log('[NEXT_ROW] ========== 开始查找并关闭成绩单页面 ==========');
    chrome.tabs.query({}, (allTabs) => {
      if (chrome.runtime.lastError) {
        console.error('[NEXT_ROW] ❌ 查询所有标签页失败:', chrome.runtime.lastError);
        // 即使查询失败，也继续查找jwxt页面
        findJwxtTabAndExecuteNextRow();
        return;
      }
      
      console.log('[NEXT_ROW] 📋 查询到所有标签页数量:', allTabs ? allTabs.length : 0);
      if (allTabs) {
        allTabs.forEach((tab, index) => {
          console.log(`[NEXT_ROW] 标签页 ${index + 1}: ID=${tab.id}, URL=${tab.url}, 活动=${tab.active}`);
        });
      }
      
      // 过滤出所有成绩单页面（包含jwbb.gdlgxy.edu.cn的URL）
      const reportTabs = allTabs ? allTabs.filter(tab => {
        // 检查多种可能的URL格式
        const url = tab.url || '';
        const isReport = url.includes('jwbb.gdlgxy.edu.cn');
        if (isReport) {
          console.log('[NEXT_ROW] ✅ 找到成绩单页面: ID=' + tab.id + ', URL=' + url);
        }
        return isReport;
      }) : [];
      
      // 额外检查：如果 reportTabs 为空，输出所有标签页的 URL 用于调试
      if (reportTabs.length === 0 && allTabs) {
        console.log('[NEXT_ROW] ⚠️ 未找到成绩单页面，所有标签页URL:');
        allTabs.forEach((tab, index) => {
          console.log(`[NEXT_ROW]   标签页 ${index + 1}: ${tab.url || '(无URL)'}`);
        });
      }
      
      console.log('[NEXT_ROW] 📊 过滤后找到成绩单页面数量:', reportTabs.length);
      
      if (reportTabs && reportTabs.length > 0) {
        console.log('[NEXT_ROW] 🔴 准备关闭', reportTabs.length, '个成绩单页面');
        reportTabs.forEach((tab, index) => {
          console.log(`[NEXT_ROW] 成绩单页面 ${index + 1}: ID=${tab.id}, URL=${tab.url}`);
        });
        
        // 逐个关闭成绩单页面，确保每个都关闭成功
        let closedCount = 0;
        const totalCount = reportTabs.length;
        
        reportTabs.forEach((tab) => {
          console.log(`[NEXT_ROW] 🔴 正在关闭标签页 ID=${tab.id}, URL=${tab.url}`);
          chrome.tabs.remove(tab.id, () => {
            closedCount++;
            if (chrome.runtime.lastError) {
              console.error(`[NEXT_ROW] ❌ 关闭标签页 ID=${tab.id} 失败:`, chrome.runtime.lastError);
            } else {
              console.log(`[NEXT_ROW] ✅ 成功关闭标签页 ID=${tab.id}`);
            }
            
            // 当所有标签页都处理完后，继续查找jwxt页面
            if (closedCount === totalCount) {
              console.log(`[NEXT_ROW] ✅ 已处理完所有成绩单页面 (${closedCount}/${totalCount})`);
              // 关闭后查找jwxt页面
              findJwxtTabAndExecuteNextRow();
            }
          });
        });
      } else {
        console.log('[NEXT_ROW] ℹ️ 未找到成绩单页面，直接查找jwxt页面');
        // 如果没有成绩单页面，直接查找jwxt页面
        findJwxtTabAndExecuteNextRow();
      }
    });
    
    // 查找jwxt页面并执行下一行操作的函数
    function findJwxtTabAndExecuteNextRow() {
      chrome.tabs.query({ url: 'https://jwxt.gdlgxy.edu.cn/*' }, (tabs) => {
        if (chrome.runtime.lastError) {
          console.error('[NEXT_ROW] 查询标签页失败:', chrome.runtime.lastError);
          console.log('[NEXT_ROW] 未找到标签页，不自动打开');
          return;
        }
        
        if (tabs && tabs.length > 0) {
          console.log('[NEXT_ROW] 找到标签页:', tabs.length, '个');
          // 激活标签页
          const tab = tabs[0];
          console.log('[NEXT_ROW] 激活标签页:', tab.id, tab.url);
          // 并行执行激活和检查注入，减少延迟
          Promise.all([
            new Promise((resolve) => {
              chrome.tabs.update(tab.id, { active: true }, () => {
                chrome.windows.update(tab.windowId, { focused: true }, () => {
                  resolve();
                });
              });
            }),
            ensureContentScriptInjected(tab.id)
          ]).then(() => {
            // 直接发送消息，不等待
            chrome.tabs.sendMessage(tab.id, {
              type: 'EXECUTE_NEXT_ROW'
            }).then(() => {
              console.log('[NEXT_ROW] 消息发送成功');
            }).catch(err => {
              console.error('[NEXT_ROW] 发送下一行消息失败:', err);
            });
          }).catch(err => {
            console.error('[NEXT_ROW] 确保content script注入失败:', err);
          });
        } else {
          console.log('[NEXT_ROW] 未找到标签页，不自动打开（用户要求）');
          // 不再自动打开标签页
        }
      });
    }
  } else if (message.type === 'CHECK_STATUS') {
    // 转发到content script，如果找不到标签页则自动打开
    chrome.tabs.query({ url: 'https://jwxt.gdlgxy.edu.cn/*' }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error('查询标签页失败:', chrome.runtime.lastError);
        // 查询失败，尝试打开新标签页（会自动注入）
        openOrActivateTab('https://jwxt.gdlgxy.edu.cn').then((tab) => {
          // 等待页面加载完成（onUpdated 监听器会自动注入）
          chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
            if (tabId === tab.id && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              // 确保content script已注入，然后发送消息
              setTimeout(() => {
                ensureContentScriptInjected(tab.id).then(() => {
                  chrome.tabs.sendMessage(tab.id, {
                    type: 'CHECK_STATUS'
                  }).catch(err => {
                    console.error('发送消息失败:', err);
                  });
                }).catch(err => {
                  console.error('确保content script注入失败:', err);
                });
              }, 500);
            }
          });
        }).catch(err => {
          console.error('打开标签页失败:', err);
        });
        return;
      }
      
      if (tabs && tabs.length > 0) {
        // 找到标签页，激活它并发送消息
        const tab = tabs[0];
        // 并行执行激活和检查注入，减少延迟
        Promise.all([
          new Promise((resolve) => {
            chrome.tabs.update(tab.id, { active: true }, () => {
              chrome.windows.update(tab.windowId, { focused: true }, () => {
                resolve();
              });
            });
          }),
          ensureContentScriptInjected(tab.id)
        ]).then(() => {
          // 直接发送消息，不等待
          chrome.tabs.sendMessage(tab.id, {
            type: 'CHECK_STATUS'
          }).catch(err => {
            console.error('发送消息失败:', err);
          });
        }).catch(err => {
          console.error('确保content script注入失败:', err);
        });
      } else {
        // 如果没有找到标签页，自动打开（会自动注入）
        openOrActivateTab('https://jwxt.gdlgxy.edu.cn').then((tab) => {
          // 等待页面加载完成（onUpdated 监听器会自动注入）
          chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
            if (tabId === tab.id && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              // 确保content script已注入，然后发送消息
              setTimeout(() => {
                ensureContentScriptInjected(tab.id).then(() => {
                  chrome.tabs.sendMessage(tab.id, {
                    type: 'CHECK_STATUS'
                  }).catch(err => {
                    console.error('发送消息失败:', err);
                  });
                }).catch(err => {
                  console.error('确保content script注入失败:', err);
                });
              }, 500);
            }
          });
        }).catch(err => {
          console.error('打开标签页失败:', err);
        });
      }
    });
  }
}

// 启动轮询
pollForMessages();

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background收到消息:', message);
  
  if (message.type === 'CHECK_CONNECTION') {
    // 检查连接状态
    checkServerConnection().then(connected => {
      sendResponse({ connected });
    });
    return true;
  }
  
  if (message.type === 'SEND_TO_APP') {
    // 发送消息到主应用
    sendToApp(message.data).then(success => {
      sendResponse({ success });
    });
    return true;
  }
  
  // 不再发送结果消息回主应用
  if (message.type === 'AUTO_FILL_RESULT' || message.type === 'NEXT_ROW_RESULT' || message.type === 'STATUS_RESULT') {
    console.log('[Background] 收到结果消息（不发送回主应用）:', message.type);
    sendResponse({ success: true });
    return true;
  }
  
  return true;
});

// 监听标签页更新 - 首次进入页面时自动注入
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('jwxt.gdlgxy.edu.cn')) {
    // 页面加载完成，自动注入content script（如果未注入）
    if (!injectedTabs.has(tabId)) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      }).then(() => {
        injectedTabs.add(tabId);
        console.log(`[Background] 页面加载完成，自动注入content script，标签页: ${tabId}`);
      }).catch(err => {
        console.log(`[Background] 自动注入脚本失败，标签页: ${tabId}:`, err);
      });
    }
  }
});

// 监听标签页关闭，清理记录
chrome.tabs.onRemoved.addListener((tabId) => {
  injectedTabs.delete(tabId);
});

