// Content Script - 在目标网页中运行
// 执行自动化操作

(function() {
  'use strict';
  
  // 防止重复注入
  if (window.__GRADE_CHECK_EXTENSION_LOADED__) {
    console.log('[Content] Content script已加载，跳过重复注入');
    return;
  }
  window.__GRADE_CHECK_EXTENSION_LOADED__ = true;
  
  console.log('[Content] Content script已加载');
  
  // 消息发送防重复标记
  let pendingMessages = new Set();
  
  // 等待DOM加载完成
  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkElement = () => {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
        } else if (Date.now() - startTime > timeout) {
          reject(new Error(`等待元素超时: ${selector}`));
        } else {
          setTimeout(checkElement, 100);
        }
      };
      
      checkElement();
    });
  }
  
  // 等待元素出现（使用XPath）
  function waitForElementByXPath(xpath, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkElement = () => {
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const element = result.singleNodeValue;
        if (element) {
          resolve(element);
        } else if (Date.now() - startTime > timeout) {
          reject(new Error(`等待元素超时: ${xpath}`));
        } else {
          setTimeout(checkElement, 100);
        }
      };
      
      checkElement();
    });
  }
  
  // 检查页面是否登录（通过刷新页面检查）
  async function checkLoginStatus() {
    try {
      const currentUrl = window.location.href;
      
      // 如果当前已经在登录页面，直接返回
      if (currentUrl.includes('zcpt.gdlgxy.edu.cn:8443')) {
        return { loggedIn: false, reason: '登录过期' };
      }
      
      // 刷新页面检查是否跳转到登录页面
      return new Promise((resolve) => {
        const checkAfterReload = () => {
          const newUrl = window.location.href;
          if (newUrl.includes('zcpt.gdlgxy.edu.cn:8443')) {
            resolve({ loggedIn: false, reason: '登录过期' });
          } else {
            // 检查是否有登录相关的元素
            const loginIndicator = document.querySelector('input[name="xsxh"]');
            if (loginIndicator) {
              resolve({ loggedIn: true });
            } else {
              resolve({ loggedIn: false, reason: '无法确定登录状态' });
            }
          }
        };
        
        // 监听页面加载完成
        if (document.readyState === 'complete') {
          checkAfterReload();
        } else {
          window.addEventListener('load', checkAfterReload, { once: true });
        }
        
        // 刷新页面
        window.location.reload();
      });
    } catch (error) {
      return { loggedIn: false, reason: error.message };
    }
  }
  
  // 检查panel-title是否为"学生成绩卡"
  function checkPanelTitle() {
    try {
      const panelTitle = document.querySelector('.panel-title');
      if (panelTitle && panelTitle.textContent.trim() === '学生成绩卡') {
        return { isStudentCard: true };
      }
      return { isStudentCard: false, currentTitle: panelTitle ? panelTitle.textContent.trim() : '未找到' };
    } catch (error) {
      return { isStudentCard: false, error: error.message };
    }
  }
  
  // 发送POST请求打开标签栏
  async function openTabPanel() {
    try {
      const response = await fetch('https://jwxt.gdlgxy.edu.cn/dwr/call/plaincall/dwrMonitor.getDataTzlj.dwr', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'Accept': '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
        },
        body: 'callCount=1\nnextReverseAjaxIndex=0\nc0-scriptName=dwrMonitor\nc0-methodName=getDataTzlj\nc0-id=0\nbatchId=0\ninstanceId=0\npage=%2Fcommon%2FCJGL.jsp\nscriptSessionId=\n'
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  // 添加视觉反馈（荧光框）
  function highlightElement(element, duration = 1000) {
    if (!element) return;
    
    const originalOutline = element.style.outline;
    const originalOutlineOffset = element.style.outlineOffset;
    const originalZIndex = element.style.zIndex;
    
    element.style.outline = '3px solid #00ff00';
    element.style.outlineOffset = '2px';
    element.style.zIndex = '999999';
    element.style.transition = 'outline 0.2s';
    
    setTimeout(() => {
      element.style.outline = originalOutline;
      element.style.outlineOffset = originalOutlineOffset;
      element.style.zIndex = originalZIndex;
    }, duration);
  }
  
  // 获取iframe的document（如果存在）
  function getTargetDocument() {
    // 先检查当前document
    if (document.getElementById('xsxh') || document.querySelector('input[name="xsxh"]')) {
      console.log('[Content] 在当前document中找到元素');
      return document;
    }
    
    // 检查iframe
    const iframes = document.querySelectorAll('iframe');
    console.log('[Content] 查找iframe，找到', iframes.length, '个');
    
    for (const iframe of iframes) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          console.log('[Content] 检查iframe:', iframe.src || iframe.id || iframe.name);
          // 检查iframe中是否有目标元素
          if (iframeDoc.getElementById('xsxh') || iframeDoc.querySelector('input[name="xsxh"]')) {
            console.log('[Content] 在iframe中找到目标元素');
            return iframeDoc;
          }
        }
      } catch (e) {
        // 跨域iframe无法访问，跳过
        console.log('[Content] 无法访问iframe（可能是跨域）:', e.message);
      }
    }
    
    return document; // 默认返回当前document
  }
  
  // 填写学号
  async function fillStudentId(studentId) {
    try {
      console.log('[Content] 开始查找学号输入框...');
      
      // 获取目标document（可能是iframe）
      const targetDoc = getTargetDocument();
      console.log('[Content] 使用document:', targetDoc === document ? '当前document' : 'iframe document');
      
      // 尝试多种选择器
      const input = targetDoc.getElementById('xsxh') || 
                    targetDoc.querySelector('input[name="xsxh"]') ||
                    targetDoc.querySelector('input#xsxh');
      
      if (!input) {
        console.error('[Content] 未找到学号输入框');
        return { success: false, error: '未找到学号输入框，请确保在正确的页面' };
      }
      
      console.log('[Content] 找到学号输入框，填写值:', studentId);
      
      // 添加视觉反馈
      highlightElement(input, 800);
      
      // 聚焦输入框
      input.focus();
      
      // 填写值
      input.value = studentId;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      
      console.log('[Content] 学号填写完成，当前值:', input.value);
      return { success: true };
    } catch (error) {
      console.error('[Content] 填写学号失败:', error);
      return { success: false, error: `填写学号失败: ${error.message}` };
    }
  }
  
  // 填写姓名
  async function fillStudentName(studentName) {
    try {
      console.log('[Content] 开始查找姓名输入框...');
      
      // 获取目标document（可能是iframe）
      const targetDoc = getTargetDocument();
      console.log('[Content] 使用document:', targetDoc === document ? '当前document' : 'iframe document');
      
      // 尝试多种选择器
      const input = targetDoc.getElementById('xsmc') || 
                    targetDoc.querySelector('input[name="xsmc"]') ||
                    targetDoc.querySelector('input#xsmc');
      
      if (!input) {
        console.error('[Content] 未找到姓名输入框');
        return { success: false, error: '未找到姓名输入框，请确保在正确的页面' };
      }
      
      console.log('[Content] 找到姓名输入框，填写值:', studentName);
      
      // 添加视觉反馈
      highlightElement(input, 800);
      
      // 聚焦输入框
      input.focus();
      
      // 填写值
      input.value = studentName;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      
      console.log('[Content] 姓名填写完成，当前值:', input.value);
      return { success: true };
    } catch (error) {
      console.error('[Content] 填写姓名失败:', error);
      return { success: false, error: `填写姓名失败: ${error.message}` };
    }
  }
  
  // 点击扩展报表按钮
  async function clickExpandReport() {
    try {
      console.log('[Content] 开始查找扩展报表按钮...');
      const targetDoc = getTargetDocument();
      
      // 尝试多种方式查找按钮
      let button = targetDoc.evaluate('/html/body/div[1]/div[2]/div/table/tbody/tr/td/input[3]', targetDoc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      
      if (!button) {
        // 尝试通过value属性查找
        const buttons = targetDoc.querySelectorAll('input[type="button"]');
        for (const btn of buttons) {
          if (btn.value === '扩展报表') {
            button = btn;
            break;
          }
        }
      }
      
      if (!button) {
        return { success: false, error: '未找到扩展报表按钮' };
      }
      
      console.log('[Content] 找到扩展报表按钮，点击');
      
      // 添加视觉反馈
      highlightElement(button, 800);
      
      // 点击按钮
      button.click();
      return { success: true };
    } catch (error) {
      console.error('[Content] 点击扩展报表失败:', error);
      return { success: false, error: error.message };
    }
  }
  
  // 递归查找所有嵌套iframe中的链接
  function findLinkInIframes(doc, window, depth = 0) {
    if (depth > 10) {
      console.warn('[Content] 递归深度超过10层，停止搜索');
      return null;
    }
    
    const indent = '  '.repeat(depth);
    console.log(`${indent}[Content] 在第${depth}层查找链接...`);
    
    // 先尝试在当前document中查找
    let link = doc.evaluate('/html/body/div[5]/div[2]/table/tbody/tr/td/a', doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    
    if (!link) {
      link = doc.querySelector('a[title="学生成绩单"]');
    }
    
    if (link) {
      console.log(`${indent}[Content] 在当前层找到链接`);
      return { link, doc, window };
    }
    
    // 如果没找到，递归查找所有iframe
    const iframes = doc.querySelectorAll('iframe');
    console.log(`${indent}[Content] 当前层有${iframes.length}个iframe，递归查找...`);
    
    for (const iframe of iframes) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        const iframeWindow = iframe.contentWindow;
        
        if (iframeDoc && iframeWindow) {
          console.log(`${indent}[Content] 检查iframe:`, iframe.src || iframe.id || iframe.name);
          const result = findLinkInIframes(iframeDoc, iframeWindow, depth + 1);
          if (result) {
            return result;
          }
        }
      } catch (e) {
        console.log(`${indent}[Content] 无法访问iframe:`, e.message);
      }
    }
    
    return null;
  }

  // 点击学生成绩单链接
  async function clickStudentReport() {
    try {
      console.log('[Content] 开始查找学生成绩单链接（递归查找所有iframe）...');
      
      // 递归查找所有嵌套iframe中的链接
      const result = findLinkInIframes(document, window, 0);
      
      if (!result) {
        return { success: false, error: '未找到学生成绩单链接（在所有iframe中）' };
      }
      
      const { link, doc: targetDoc, window: targetWindow } = result;
      
      console.log('[Content] 找到学生成绩单链接，点击');
      console.log('[Content] 链接信息:', {
        href: link.href,
        onclick: link.getAttribute('onclick'),
        text: link.textContent,
        clicked: link.dataset.clicked,
        attributes: Array.from(link.attributes).map(attr => `${attr.name}="${attr.value}"`)
      });
      
      // 强制清除之前的点击标记（每次自动填写都是新的操作）
      console.log('[Content] 强制清除点击标记');
      delete link.dataset.clicked;
      link.removeAttribute('data-clicked');
      console.log('[Content] 清除后的clicked值:', link.dataset.clicked);
      
      // 添加视觉反馈
      highlightElement(link, 800);
      
      // 延迟300ms后点击链接
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // 滚动到元素可见位置
      link.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log('[Content] 模拟点击链接（和其他按钮一样）');
      
      // 模拟真实的鼠标点击事件（和其他按钮一样）
      try {
        // 创建并触发鼠标事件序列
        const mouseEvents = ['mousedown', 'mouseup', 'click'];
        for (const eventType of mouseEvents) {
          const event = new MouseEvent(eventType, {
            view: targetWindow || window,
            bubbles: true,
            cancelable: true,
            buttons: 1,
            button: 0
          });
          link.dispatchEvent(event);
        }
        console.log('[Content] 已发送鼠标事件');
      } catch (e) {
        console.log('[Content] 鼠标事件失败，尝试直接click:', e);
        // 如果鼠标事件失败，尝试直接调用click
        link.click();
      }
      
      return { success: true };
    } catch (error) {
      console.error('[Content] 点击学生成绩单失败:', error);
      return { success: false, error: error.message };
    }
  }
  
  // 点击关闭按钮
  async function clickCloseButton() {
    try {
      console.log('[Content] 查找关闭按钮...');
      const targetDoc = getTargetDocument();
      const closeBtn = targetDoc.evaluate('/html/body/div[5]/div[1]/div[2]/a', targetDoc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      
      if (!closeBtn) {
        console.log('[Content] 关闭按钮未找到');
        // 不返回错误，因为关闭按钮可能不存在
        return { success: true }; // 返回成功，因为这不是必须的
      }
      
      console.log('[Content] 找到关闭按钮，点击');
      closeBtn.click();
      console.log('[Content] 关闭按钮点击完成');
      return { success: true };
    } catch (error) {
      console.log('[Content] 关闭按钮未找到或点击失败:', error.message);
      // 不返回错误，因为关闭按钮可能不存在
      return { success: true }; // 返回成功，因为这不是必须的
    }
  }
  
  // 点击清除按钮
  async function clickClearButton() {
    try {
      console.log('[Content] 查找清除按钮...');
      const targetDoc = getTargetDocument();
      const clearBtn = targetDoc.evaluate('/html/body/div[1]/div[2]/form/center/table/tbody/tr[10]/td[2]/input[4]', targetDoc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      
      if (!clearBtn) {
        console.error('[Content] 清除按钮未找到');
        return { success: false, error: '未找到清除按钮' };
      }
      
      console.log('[Content] 找到清除按钮，点击');
      clearBtn.click();
      console.log('[Content] 清除按钮点击完成');
      return { success: true };
    } catch (error) {
      console.error('[Content] 清除按钮未找到或点击失败:', error);
      return { success: false, error: error.message };
    }
  }
  
  // 关闭当前标签页（学生成绩单）
  function closeCurrentTab() {
    if (window.location.href.includes('jwbb.gdlgxy.edu.cn')) {
      window.close();
    }
  }
  
  // 执行自动填写流程
  async function executeAutoFill(data) {
    const { studentId, studentName } = data;
    const results = [];
    
    try {
      console.log('[Content] executeAutoFill - 开始执行，学号:', studentId, '姓名:', studentName);
      console.log('[Content] 当前页面信息:');
      console.log('  - URL:', window.location.href);
      console.log('  - Title:', document.title);
      console.log('  - ReadyState:', document.readyState);
      
      // 1. 检查当前页面URL是否正确
      const currentUrl = window.location.href;
      console.log('[Content] 当前URL:', currentUrl);
      
      if (!currentUrl.includes('jwxt.gdlgxy.edu.cn')) {
        return { success: false, error: '未在目标网页，请先打开 https://jwxt.gdlgxy.edu.cn' };
      }
      
      if (currentUrl.includes('zcpt.gdlgxy.edu.cn:8443')) {
        return { success: false, error: '登录过期，请重新登录' };
      }
      
      results.push({ step: 'URL检查', success: true });
      
      // 2. 填写学号
      console.log('[Content] 开始填写学号');
      const fillIdResult = await fillStudentId(studentId);
      if (!fillIdResult.success) {
        return { success: false, error: `填写学号失败: ${fillIdResult.error}` };
      }
      results.push({ step: '填写学号', success: true });
      
      // 3. 填写姓名
      console.log('[Content] 开始填写姓名');
      const fillNameResult = await fillStudentName(studentName);
      if (!fillNameResult.success) {
        return { success: false, error: `填写姓名失败: ${fillNameResult.error}` };
      }
      results.push({ step: '填写姓名', success: true });
      
      // 4. 点击扩展报表
      console.log('[Content] 开始点击扩展报表');
      const clickReportResult = await clickExpandReport();
      if (!clickReportResult.success) {
        return { success: false, error: `点击扩展报表失败: ${clickReportResult.error}` };
      }
      results.push({ step: '点击扩展报表', success: true });
      
      // 5. 点击学生成绩单
      console.log('[Content] 开始点击学生成绩单');
      const clickStudentResult = await clickStudentReport();
      if (!clickStudentResult.success) {
        return { success: false, error: `点击学生成绩单失败: ${clickStudentResult.error}` };
      }
      results.push({ step: '点击学生成绩单', success: true });
      
      console.log('[Content] 自动填写流程完成');
      return { success: true, results };
    } catch (error) {
      console.error('[Content] executeAutoFill 执行失败:', error);
      return { success: false, error: error.message, results };
    }
  }
  
  // 执行下一行操作
  async function executeNextRow() {
    try {
      console.log('[Content] executeNextRow - 当前URL:', window.location.href);
      
      // 1. 关闭当前标签页（如果是成绩单页面）
      if (window.location.href.includes('jwbb.gdlgxy.edu.cn')) {
        console.log('[Content] 检测到成绩单页面，关闭标签页');
        window.close();
        // 标签页关闭后，这个函数就结束了，不会继续执行
        return { success: true };
      }
      
      // 2. 如果还在当前页面，点击关闭按钮（关闭打印提示框）
      try {
        console.log('[Content] 尝试点击关闭按钮');
        await clickCloseButton();
        console.log('[Content] 关闭按钮点击成功');
      } catch (e) {
        console.log('[Content] 关闭按钮不存在或点击失败，继续:', e.message);
        // 关闭按钮可能不存在，忽略错误
      }
      
      // 3. 点击清除按钮
      console.log('[Content] 尝试点击清除按钮');
      await clickClearButton();
      console.log('[Content] 清除按钮点击成功');
      
      return { success: true };
    } catch (error) {
      console.error('[Content] executeNextRow 执行失败:', error);
      return { success: false, error: error.message };
    }
  }
  
  // 检查页面状态（按照需求：1.检查是否打开网页 2.刷新检查登录 3.检查panel-title）
  async function checkPageStatus() {
    try {
      // 1. 检查是否打开了目标网页
      const currentUrl = window.location.href;
      const isTargetPage = currentUrl.includes('jwxt.gdlgxy.edu.cn');
      
      if (!isTargetPage) {
        return { 
          success: false, 
          error: '未在目标网页', 
          currentUrl 
        };
      }
      
      // 2. 刷新页面检查登录状态
      return new Promise((resolve) => {
        // 监听页面刷新后的URL变化
        const checkAfterReload = () => {
          const newUrl = window.location.href;
          
          // 如果跳转到登录页面，说明登录过期
          if (newUrl.includes('zcpt.gdlgxy.edu.cn:8443')) {
            resolve({ 
              success: false, 
              error: '登录过期，需要重新登录',
              needLogin: true
            });
            return;
          }
          
          // 3. 检查panel-title是否为"学生成绩卡"
          const panelCheck = checkPanelTitle();
          
          if (!panelCheck.isStudentCard) {
            // 如果不是学生成绩卡，发送POST请求打开标签栏
            openTabPanel().then(() => {
              const panelCheck2 = checkPanelTitle();
              resolve({
                success: true,
                isStudentCard: panelCheck2.isStudentCard,
                currentTitle: panelCheck2.currentTitle,
                openedTabPanel: true
              });
            }).catch(err => {
              resolve({
                success: false,
                error: `打开标签栏失败: ${err.message}`
              });
            });
          } else {
            // 已经是学生成绩卡，检查完成
            resolve({
              success: true,
              isStudentCard: true,
              currentTitle: panelCheck.currentTitle
            });
          }
        };
        
        // 刷新页面
        window.location.reload();
        
        // 监听页面加载完成
        if (document.readyState === 'loading') {
          window.addEventListener('load', checkAfterReload, { once: true });
        } else {
          checkAfterReload();
        }
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  // 监听来自background的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Content] 收到消息:', message.type);
    
    // 处理PING消息（用于检查content script是否就绪）
    if (message.type === 'PING') {
      console.log('[Content] 收到PING，返回PONG');
      sendResponse({ type: 'PONG' });
      return true;
    }
    
    // 防止重复处理
    const messageId = message.type + '_' + Date.now();
    if (pendingMessages.has(messageId)) {
      console.log('[Content] 消息已处理，跳过:', messageId);
      return true;
    }
    pendingMessages.add(messageId);
    
    // 清理旧的消息ID（保留最近10个）
    if (pendingMessages.size > 10) {
      const oldest = Array.from(pendingMessages)[0];
      pendingMessages.delete(oldest);
    }
    
    if (message.type === 'EXECUTE_AUTO_FILL') {
      console.log('[Content] 开始执行自动填写:', message.data);
      executeAutoFill(message.data).then(result => {
        console.log('[Content] 自动填写完成:', result);
        sendResponse(result);
        // 不再发送结果回主应用
      }).catch(err => {
        console.error('[Content] 自动填写执行失败:', err);
        const errorResult = { success: false, error: err.message };
        sendResponse(errorResult);
        // 不再发送结果回主应用
      });
      return true;
    }
    
    if (message.type === 'EXECUTE_NEXT_ROW') {
      console.log('[Content] 开始执行下一行操作');
      executeNextRow().then(result => {
        console.log('[Content] 下一行操作完成:', result);
        sendResponse(result);
        // 不再发送结果回主应用
      }).catch(err => {
        console.error('[Content] 下一行操作执行失败:', err);
        const errorResult = { success: false, error: err.message };
        sendResponse(errorResult);
        // 不再发送结果回主应用
      });
      return true;
    }
    
    if (message.type === 'CHECK_STATUS') {
      console.log('[Content] 开始检查页面状态');
      checkPageStatus().then(result => {
        console.log('[Content] 页面状态检查完成:', result);
        sendResponse(result);
        // 不再发送结果回主应用
      }).catch(err => {
        console.error('[Content] 页面状态检查失败:', err);
        const errorResult = { success: false, error: err.message };
        sendResponse(errorResult);
        // 不再发送结果回主应用
      });
      return true;
    }
    
    return true;
  });
  
  // 页面加载完成后发送就绪消息
  console.log('[Content] Content script已加载，当前URL:', window.location.href);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[Content] DOM加载完成，发送就绪消息');
      chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' });
    });
  } else {
    console.log('[Content] 页面已加载，发送就绪消息');
    chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' });
  }
})();

