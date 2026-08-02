const https = require('https');
require('dotenv').config();

const API_KEY = process.env.XUNFEI_API_KEY;

// 测试数据
const testData = {
  model: 'xop3qwen1b7',
  messages: [
    { role: 'user', content: '你好，请简单介绍一下自己' }
  ],
  max_tokens: 4000,
  temperature: 0.7,
  stream: true
};

// 请求选项
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

console.log('Testing direct streaming connection to MaaS API...');
console.log('API Key:', API_KEY ? 'Set' : 'Not Set');
console.log('Request Options:', JSON.stringify(options, null, 2));

// 创建请求
const req = https.request(options, (res) => {
  console.log('\nResponse Status:', res.statusCode);
  console.log('Response Headers:', res.headers);
  
  res.setEncoding('utf8');
  
  res.on('data', (chunk) => {
    console.log('\nReceived Chunk:', chunk);
  });
  
  res.on('end', () => {
    console.log('\nResponse End');
  });
});

// 错误处理
req.on('error', (e) => {
  console.error('\nRequest Error:', e);
  console.error('Error Code:', e.code);
  console.error('Error Stack:', e.stack);
});

// 超时处理
req.on('timeout', () => {
  console.error('\nRequest Timeout');
  req.destroy();
});

// 发送请求体
req.write(JSON.stringify(testData));
req.end();
