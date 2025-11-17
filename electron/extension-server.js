// 扩展通信服务器
// 作为主应用和浏览器扩展之间的通信桥梁

import { createServer } from 'http';
import { parse } from 'url';

let server = null;
let pendingRequests = new Map();
let messageQueue = [];
let messageHandlers = new Map();

export function startExtensionServer(port = 8765) {
  if (server) {
    return { server, sendToExtension, waitForMessage };
  }

  server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    if (parsedUrl.pathname === '/status' && req.method === 'GET') {
      // 检查服务器状态
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'running', 
        port 
      }));
      return;
    }
    
    if (parsedUrl.pathname === '/message' && req.method === 'POST') {
      // 接收来自扩展的消息
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', () => {
        try {
          const message = JSON.parse(body);
          console.log('[Server] 收到来自扩展的消息:', message.type, message.data ? (message.data.success ? 'success' : 'error') : '');
          
          // 处理消息
          handleIncomingMessage(message);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          console.error('[Server] 处理扩展消息失败:', error);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });
      return;
    }
    
    if (parsedUrl.pathname === '/poll' && req.method === 'GET') {
      // 长轮询：扩展等待消息
      const requestId = parsedUrl.query.requestId || Date.now().toString();
      
      // 先检查是否有待处理的消息
      if (messageQueue.length > 0) {
        const message = messageQueue.shift();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(message));
        return;
      }
      
      // 如果没有消息，设置长轮询等待（5秒超时，因为扩展会频繁轮询）
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ timeout: true }));
      }, 5000);
      
      // 存储响应对象
      pendingRequests.set(requestId, { res, timeout });
      return;
    }
    
    res.writeHead(404);
    res.end('Not Found');
  });
  
  // 处理来自扩展的消息
  function handleIncomingMessage(message) {
    console.log('[Server] 处理扩展消息:', message.type, '等待的请求数:', pendingRequests.size, '临时处理器数:', Array.from(messageHandlers.keys()).filter(k => k.startsWith('temp_')).length);
    
    // 先检查临时处理器（用于waitForMessage）- 优先处理
    let handled = false;
    for (const [key, handler] of messageHandlers.entries()) {
      if (key.startsWith('temp_')) {
        console.log('[Server] 找到临时处理器:', key);
        // 调用处理器，如果返回true表示已处理
        const result = handler(message);
        if (result !== false) {
          // 处理器返回true或undefined，表示已处理
          messageHandlers.delete(key);
          handled = true;
          break;
        }
        // 如果返回false，表示类型不匹配，继续查找其他处理器
      }
    }
    
    // 触发注册的处理器（按类型）
    const handler = messageHandlers.get(message.type);
    if (handler) {
      console.log('[Server] 找到类型处理器:', message.type);
      handler(message);
    }
    
    // 发送给等待的请求（如果没有被临时处理器处理）
    if (!handled) {
      for (const [requestId, { res, timeout }] of pendingRequests.entries()) {
        console.log('[Server] 发送消息给等待的请求:', requestId);
        clearTimeout(timeout);
        pendingRequests.delete(requestId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(message));
        break; // 只发送给第一个等待的请求
      }
    }
  }
  
  // 发送消息到扩展（通过消息队列，扩展会轮询获取）
  function sendToExtension(message) {
    console.log('发送消息到扩展:', message);
    messageQueue.push(message);
    
    // 如果有等待的请求，立即发送消息
    for (const [requestId, { res, timeout }] of pendingRequests.entries()) {
      if (messageQueue.length > 0) {
        const msg = messageQueue.shift();
        clearTimeout(timeout);
        pendingRequests.delete(requestId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(msg));
        break; // 只发送给第一个等待的请求
      }
    }
  }
  
  // 等待来自扩展的消息
  function waitForMessage(timeout = 30000, expectedType = null) {
    return new Promise((resolve, reject) => {
      const requestId = Date.now().toString();
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId);
        messageHandlers.delete('temp_' + requestId);
        reject(new Error('等待消息超时'));
      }, timeout);
      
      // 检查消息队列（如果指定了类型，只接受匹配的消息）
      if (messageQueue.length > 0) {
        if (expectedType) {
          // 查找匹配类型的消息
          const index = messageQueue.findIndex(msg => msg.type === expectedType);
          if (index !== -1) {
            clearTimeout(timer);
            const message = messageQueue.splice(index, 1)[0];
            console.log(`[Server] 从队列中找到匹配的消息: ${expectedType}`);
            resolve(message);
            return;
          }
        } else {
          // 没有指定类型，返回第一个消息
          clearTimeout(timer);
          resolve(messageQueue.shift());
          return;
        }
      }
      
      // 注册处理器（如果指定了类型，只接受匹配的消息）
      const handler = (message) => {
        if (expectedType && message.type !== expectedType) {
          // 类型不匹配，继续等待，返回false表示未处理
          console.log(`[Server] 收到消息类型 ${message.type}，期望 ${expectedType}，继续等待`);
          return false;
        }
        clearTimeout(timer);
        messageHandlers.delete('temp_' + requestId);
        console.log(`[Server] 收到匹配的消息: ${message.type}`);
        resolve(message);
        return true; // 表示已处理
      };
      
      messageHandlers.set('temp_' + requestId, handler);
    });
  }
  
  server.listen(port, () => {
    console.log(`扩展通信服务器已启动，端口: ${port}`);
  });
  
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.log(`端口 ${port} 已被占用`);
    } else {
      console.error('服务器错误:', error);
    }
  });
  
  return { server, sendToExtension, waitForMessage };
}

export function stopExtensionServer() {
  if (server) {
    server.close();
    server = null;
    pendingRequests.clear();
    messageQueue = [];
    messageHandlers.clear();
    console.log('扩展通信服务器已停止');
  }
}

