# AI Chat Backend Service

一个基于Node.js和Express的AI聊天后端服务，兼容OpenAI API格式，支持与讯飞MaaS平台进行交互。

## 功能特性

- ✅ 兼容OpenAI API格式的聊天接口
- ✅ 支持普通非流式对话
- ✅ 支持流式对话
- ✅ 环境变量配置，安全管理API密钥
- ✅ 跨域支持

## 安装和配置

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

在项目根目录创建`.env`文件，并添加以下配置：

```env
# 服务器端口
PORT=3000

# 讯飞MaaS平台API密钥
API_KEY=your_xunfei_maas_api_key

# 讯飞应用ID（可选，当前实现暂不使用）
APPID=your_xunfei_app_id

# 讯飞API密钥（可选，当前实现暂不使用）
API_SECRET=your_xunfei_api_secret
```

**注意事项：**
- `API_KEY`需要从讯飞MaaS服务管控页面获取
- `MODEL_ID`默认使用`xop3qwen1b7`，可根据实际情况调整

### 3. 启动服务

```bash
# 开发模式启动
npm run dev

# 生产模式启动
npm start
```

服务将在`http://localhost:3000`启动

## API使用说明

### 聊天接口

```
POST /api/chat
```

**请求参数：**

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| messages | Array | 是 | 对话消息列表 |
| stream | Boolean | 否 | 是否使用流式输出（默认：false） |
| temperature | Number | 否 | 温度参数（默认：0.7） |
| max_tokens | Number | 否 | 最大生成token数（默认：4000） |

**请求示例：**

```json
{
  "messages": [
    {
      "role": "user",
      "content": "你好，请介绍一下自己"
    }
  ],
  "stream": false,
  "temperature": 0.7,
  "max_tokens": 4000
}
```

**非流式响应示例：**

```json
{
  "id": "cht000xxxx@dx19b0xxxxxxx",
  "object": "chat.completion",
  "created": 1765285704,
  "model": "xop3qwen1b7",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "你好！我是你的AI助手...",
        "reasoning_content": "",
        "plugins_content": null
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 17,
    "completion_tokens": 77,
    "total_tokens": 94
  }
}
```

**流式响应示例：**

```
data: {"id":"cht000xxxx@dx19b0xxxxxxx","object":"chat.completion","created":1765285710,"model":"xop3qwen1b7","choices":[{"index":0,"message":{"role":"assistant","content":"你好！我是你的AI助手...","reasoning_content":"","plugins_content":null},"finish_reason":"stop"}],"usage":{"prompt_tokens":17,"completion_tokens":70,"total_tokens":87}}

data: [DONE]
```

### 健康检查接口

```
GET /health
```

**响应示例：**

```json
{
  "status": "ok",
  "message": "AI Chat API is running"
}
```

## 关于流式请求的说明

系统支持完整的流式对话功能：

- 客户端可以发送`stream: true`的请求启用流式输出
- 服务器会将请求以流式方式发送给AI服务
- 服务器会将AI服务的流式响应通过SSE格式（Server-Sent Events）实时返回给客户端

流式请求的优势：
1. 更快的响应速度（无需等待完整响应生成）
2. 更好的用户体验（实时显示生成内容）
3. 支持长时间对话（避免超时问题）

## 技术栈

- Node.js
- 原生HTTP模块（替代Express，提升流式性能）
- dotenv
- cors（通过原生代码实现）

## 开发和调试

### 查看日志

服务器运行时会输出详细的日志信息，包括：
- 请求参数
- 响应数据
- 错误信息

可以通过终端查看这些日志，帮助调试和问题排查。

### 测试API

可以使用curl或Postman等工具测试API：

```bash
# 测试非流式请求
curl -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" -d '{"messages": [{"role": "user", "content": "你好"}], "stream": false}'

# 测试流式请求
curl -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" -d '{"messages": [{"role": "user", "content": "你好"}], "stream": true}'
```

## 错误处理

服务会返回以下常见错误：

- `400 Bad Request`：请求参数格式错误
- `500 Internal Server Error`：服务器内部错误

错误响应格式：

```json
{
  "error": "错误描述信息"
}
```

## 安全注意事项

1. 不要将API密钥硬编码在代码中，使用环境变量管理
2. 生产环境中建议启用HTTPS
3. 考虑添加API请求频率限制
4. 定期更新依赖包，修复安全漏洞

## 未来改进计划

- [ ] 解决流式请求连接稳定性问题
- [ ] 添加更多AI模型支持
- [ ] 实现请求缓存机制
- [ ] 添加API文档页面
- [ ] 支持更多OpenAI API特性

## 许可证

ISC
