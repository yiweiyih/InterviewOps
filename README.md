# AI聊天应用教程

这是一个基于 Vue 3 + Node.js 构建的AI聊天应用教学项目，实现了与讯飞MaaS平台的集成，支持流式对话功能。

## 技术栈

### 前端
- Vue 3 (Composition API)
- Vite
- Element Plus
- CSS3

### 后端
- Node.js
- 原生HTTP模块
- HTTPS模块
- dotenv

### AI服务
- 讯飞MaaS平台 (xop3qwen1b7模型)

## 项目架构

```
├── backend/          # 后端服务
│   ├── index.js     # 主服务器文件
│   ├── package.json # 后端依赖
│   └── .env         # 环境变量配置
├── src/             # 前端代码
│   ├── views/       # 页面组件
│   │   └── AIVIew.vue # AI聊天页面
│   ├── components/  # 通用组件
│   ├── main.js      # 前端入口
│   └── App.vue      # 根组件
├── index.html       # HTML模板
├── package.json     # 前端依赖
└── vite.config.js   # Vite配置
```

## 核心功能

1. **实时流式对话**：与AI模型进行实时的流式交互，逐字显示回复内容
2. **消息历史管理**：自动维护对话历史，支持上下文理解
3. **响应式UI设计**：适配不同屏幕尺寸的现代化界面
4. **优雅的错误处理**：完善的错误提示和边界情况处理

## 前置条件

- Node.js 16+ 环境
- 讯飞开放平台账号 (获取API密钥)
- Git (可选)

## 快速开始

### 1. 克隆项目

```bash
git clone <repository-url>
cd yuan-chat-vue
```

### 2. 配置环境变量

在 `backend/` 目录下创建 `.env` 文件：

```env
# 讯飞MaaS平台API密钥
XUNFEI_API_KEY=your-api-key-here

# 服务器端口
PORT=3000
```

### 3. 安装依赖

#### 前端依赖
```bash
npm install
```

#### 后端依赖
```bash
cd backend
npm install
cd ..
```

### 4. 启动服务

#### 启动后端服务
```bash
cd backend
npm run dev
```

后端服务将运行在 `http://localhost:3000`

#### 启动前端服务
在新的终端窗口中：
```bash
npm run dev
```

前端应用将运行在 `http://localhost:5173`

### 5. 访问应用

打开浏览器访问 `http://localhost:5173`，即可开始与AI聊天！

## 核心代码解析

### 后端实现 (backend/index.js)

#### HTTP服务器创建
```javascript
const http = require('http');
const server = http.createServer((req, res) => {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  // 处理请求...
});
```

#### API端点处理
```javascript
// 处理POST请求到/api/chat
if (req.method === 'POST' && req.url === '/api/chat') {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    const requestData = JSON.parse(body);
    handleStreamRequest(requestData.messages, res);
  });
}
```

#### 流式响应处理
```javascript
function handleStreamRequest(messages, res) {
  // 构造请求体
  const requestBody = {
    model: 'xop3qwen1b7',
    messages: messages,
    max_tokens: 4000,
    temperature: 0.7,
    stream: true
  };
  
  // 发送HTTPS请求到MaaS平台
  const maasReq = https.request(options, (maasRes) => {
    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    
    // 直接将MaaS响应传递给客户端
    maasRes.pipe(res);
  });
  
  maasReq.write(JSON.stringify(requestBody));
  maasReq.end();
}
```

### 前端实现 (src/views/AIVIew.vue)

#### 消息发送处理
```javascript
const sendMessage = async () => {
  if (!inputMessage.value.trim() || isGenerating.value) return;
  
  // 添加用户消息
  const userMessage = { /* ... */ };
  messages.value.push(userMessage);
  
  isGenerating.value = true;
  
  try {
    // 调用后端API
    const response = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: apiMessages })
    });
    
    // 处理流式响应
    await handleStreamResponse(response);
  } catch (error) {
    ElMessage.error('获取AI回复失败');
  } finally {
    isGenerating.value = false;
  }
};
```

#### 流式响应处理
```javascript
const handleStreamResponse = async (response) => {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  let aiReply = { /* ... */ };
  messages.value.push(aiReply);
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        
        const json = JSON.parse(data);
        const content = json.choices[0].delta.content;
        if (content) {
          aiReply.content += content;
          messages.value = [...messages.value];
          scrollToBottom();
        }
      }
    }
  }
};
```

## 部署建议

### 开发环境
- 使用 `npm run dev` 启动服务
- 前端支持热重载

### 生产环境
1. 构建前端生产版本：
```bash
npm run build
```

2. 配置Nginx反向代理：
```nginx
server {
    listen 80;
    server_name example.com;
    
    location / {
        root /path/to/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
    
    location /api/ {
        proxy_pass http://localhost:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. 使用PM2管理后端进程：
```bash
cd backend
pm install pm2 -g
pm start
```

## 常见问题

### 1. API请求失败
- 检查 `.env` 文件中的API密钥是否正确
- 确保网络连接正常，能够访问讯飞MaaS平台
- 查看后端日志了解具体错误信息

### 2. 流式响应不显示
- 检查浏览器控制台是否有JavaScript错误
- 确认后端服务正常运行
- 验证网络请求是否成功

### 3. 前端样式异常
- 检查Element Plus是否正确安装
- 清除浏览器缓存
- 查看控制台是否有CSS错误

## 扩展学习

### 功能扩展建议
1. 添加多模型选择功能
2. 实现消息保存和加载
3. 增加用户身份认证
4. 添加语音输入/输出功能
5. 支持文件上传和处理

### 技术深入学习
- Vue 3 Composition API 官方文档
- Node.js 流处理机制
- Server-Sent Events (SSE) 协议
- 讯飞MaaS平台 API 文档

## 贡献指南

欢迎提交Issue和Pull Request来改进这个项目！

## 许可证

MIT License

## 联系方式

如有问题或建议，请通过以下方式联系：
- GitHub Issues: <repository-issues-url>
- 电子邮件: <your-email>

---

**享受AI聊天的乐趣！** 🤖💬