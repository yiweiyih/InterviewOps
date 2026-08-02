# LongCat API 集成指南

本项目已成功集成 LongCat API，替换原有的讯飞 MaaS API。

## 修改内容

### 1. 后端修改 (`backend/index.js`)
- 将 API 提供商从讯飞 MaaS 改为 LongCat API
- 使用 OpenAI API 格式进行通信
- 默认使用 `LongCat-Flash-Chat` 模型
- 保持 SSE (Server-Sent Events) 流式响应格式

### 2. 环境配置 (`backend/.env`)
```env
PORT=3001
LONGCAT_API_KEY=ak_2v69or0Up0wM7ZV8oF57k9nN5DW3Z
LONGCAT_BASE_URL=https://api.longcat.chat/openai/v1/chat/completions
```

### 3. 前端修改 (`src/views/AIVIew.vue`)
- 更新 API 地址从 `localhost:3000` 到 `localhost:3001`

## 支持的模型

可以在 `requestBody` 中修改 `model` 参数来使用不同的 LongCat 模型：

- `LongCat-Flash-Chat` (默认) - 最大256K tokens
- `LongCat-Flash-Thinking` - 最大256K tokens
- `LongCat-Flash-Thinking-2601` - 最大256K tokens
- `LongCat-Flash-Lite` - 最大320K tokens
- `LongCat-Flash-Omni-2603` - 最大8K tokens

## 启动项目

### 后端
```bash
cd backend
node index.js
```

### 前端
```bash
npm run dev
```

## API 调用格式

```javascript
POST /api/chat
Content-Type: application/json

{
  "messages": [
    {"role": "user", "content": "你的问题"}
  ],
  "model": "LongCat-Flash-Chat",
  "max_tokens": 4000,
  "temperature": 0.7
}
```

## 响应格式

返回 SSE 格式：
```
data: {"content": "回复内容"}

data: [DONE]
```

## 错误处理

- 429 状态码：请求频率超限，需要实现指数退避重试
- 其他错误会通过 SSE 返回错误信息

## 注意事项

1. 请妥善保管 API Key，避免泄露
2. 未使用完的免费额度不会保留到第二天
3. 建议在前端实现重试机制以处理限流情况