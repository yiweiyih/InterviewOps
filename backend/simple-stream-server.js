const http = require('http');
const https = require('https');
require('dotenv').config();

const API_KEY = process.env.XUNFEI_API_KEY;
const PORT = 3001;

// 创建简单的HTTP服务器
const server = http.createServer((req, res) => {
  // 只处理POST请求到/api/chat
  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    
    // 接收请求体
    req.on('data', (chunk) => {
      body += chunk;
    });
    
    req.on('end', () => {
      try {
        const requestData = JSON.parse(body);
        const { messages, stream } = requestData;
        
        console.log('=== 收到请求 ===');
        console.log('消息:', messages);
        console.log('流式请求:', stream);
        
        if (stream) {
          // 处理流式请求
          handleStreamRequest(messages, res);
        } else {
          // 处理非流式请求
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: '仅支持流式请求' }));
        }
      } catch (error) {
        console.error('解析请求体错误:', error);
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: '请求格式错误' }));
      }
    });
  } else {
    res.statusCode = 404;
    res.end();
  }
});

// 处理流式请求
function handleStreamRequest(messages, res) {
  // 创建与测试脚本完全相同的请求体
  const requestBody = {
    model: 'xop3qwen1b7',
    messages: messages,
    max_tokens: 4000,
    temperature: 0.7,
    stream: true
  };
  
  // 创建与测试脚本完全相同的请求选项
  const options = {
    hostname: 'maas-api.cn-huabei-1.xf-yun.com',
    port: 443,
    path: '/v1/chat/completions',
    method: 'POST',
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'User-Agent': 'Node.js-Client',
      'Accept': '*/*'
    }
  };
  
  console.log('发送到MaaS的请求体:', JSON.stringify(requestBody, null, 2));
  console.log('请求选项:', JSON.stringify(options, null, 2));
  
  // 创建请求（与测试脚本完全相同的方式）
  const maasReq = https.request(options, (maasRes) => {
    console.log('\n=== MaaS API 响应 ===');
    console.log('状态码:', maasRes.statusCode);
    console.log('响应头:', maasRes.headers);
    
    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    
    // 直接将MaaS响应的数据发送给客户端
    maasRes.pipe(res);
    
    // 响应结束时发送DONE信号
    maasRes.on('end', () => {
      console.log('\n=== 响应结束 ===');
      res.write('data: [DONE]\n\n');
    });
  });
  
  // 错误处理
  maasReq.on('error', (error) => {
    console.error('\n=== 请求错误 ===');
    console.error('错误:', error);
    
    res.write(`data: {"error": "流式请求失败：${error.message}"} \n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });
  
  // 超时处理
  maasReq.on('timeout', () => {
    console.error('\n=== 请求超时 ===');
    maasReq.destroy();
    
    res.write(`data: {"error": "请求超时"} \n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });
  
  // 发送请求体
  maasReq.write(JSON.stringify(requestBody));
  maasReq.end();
  
  console.log('\n=== 请求已发送 ===');
}

// 启动服务器
server.listen(PORT, () => {
  console.log(`简化版流式服务器已启动，监听端口 ${PORT}`);
  console.log('测试地址: http://localhost:3001/api/chat');
});
