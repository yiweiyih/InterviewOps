# Backend

后端包含两个独立进程：

- `index.js`：HTTP API、JWT 鉴权、Agent Loop、SSE、RAG/Memory 调用和指标。
- `mcp-server.js`：JSON-RPC 工具服务，承载天气、搜索、待办、笔记和时间工具。

完整的架构、启动和验证说明见仓库根目录 [README](../README.md)。

## 单独启动

```bash
cp .env.example .env
npm ci
npm run mcp   # terminal 1, :3002
npm run dev   # terminal 2, :3001
```

## 环境变量

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `JWT_SECRET` | 是 | 生产环境至少 32 字符 |
| `DEEPSEEK_API_KEY` | 是 | 对话模型密钥 |
| `DEEPSEEK_BASE_URL` | 是 | OpenAI-compatible chat completions 地址 |
| `SILICONFLOW_API_KEY` | 是 | BGE-M3 embedding 密钥 |
| `SERPER_API_KEY` | 否 | 网络搜索工具密钥 |
| `MCP_SERVER_URL` | 否 | 默认 `http://localhost:3002` |
| `DATA_DIR` | 否 | 运行数据目录；Docker 使用 `/data` |
| `CORS_ORIGIN` | 否 | 默认 `http://localhost:5173` |

## 验证

```bash
npm run check
npm test
npm run eval:tools:dry
```

在线评测 `npm run eval:tools` 会调用真实模型并产生费用；结果写入已忽略的 `evals/results/latest.json`。
