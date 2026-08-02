# 面试讲解与演示指南

## 30 秒项目介绍

我做的是一个多用户 Agentic RAG 工作台。它不是只把问题转发给大模型，而是围绕“Agent 如何可靠执行任务”设计了工具治理层：模型只能看到公开参数 schema，用户身份由服务端从 JWT 注入；天气、搜索、待办、笔记和用户知识库可以在多轮 Agent Loop 中组合调用。系统同时提供 SSE 流式交互、用户级知识与记忆隔离、Prometheus 指标，以及 24 条工具路由回归集和 CI 门禁。

## 面试官最值得看到的三件事

### 1. 工具调用不是直接执行，而是经过治理

工具目录在 `backend/tools/catalog.js` 统一描述：

- `inputSchema`：模型允许提交的字段与类型
- `scope`：公开工具或用户级工具
- `transport`：MCP 或本地执行
- `timeoutMs`：单工具超时策略

关键安全点是：公开 schema 中没有 `userId`。API 校验 tool call 后，从 JWT 上下文注入身份；如果模型主动提交 `userId` 会直接拒绝。因此隔离边界由服务端控制，不依赖模型“自觉”。

### 2. RAG 不只是能检索，还处理了数据边界和证据链

文档上传后按重叠窗口分块并用 BGE-M3 向量化。每个 chunk 都记录 `userId`、source、chunk index 和 indexedAt；召回前先做用户过滤，答案通过 SSE 返回 citation，前端展示来源片段与相关度。

删除文档时按 `(userId, source)` 删除全部片段，写入采用临时文件 + rename，降低索引中途损坏风险。

### 3. 用指标和评测约束 Agent，而不是凭感觉调 Prompt

系统记录 HTTP、工具、RAG、LLM 的状态、延迟和 Token，动态路由被归一化，且不记录用户内容。工具路由评测集覆盖：

- 10 类工具的单工具意图
- 天气 + 待办、时间 + 待办的多工具意图
- 不应调用工具的普通问答负样本

评分输出 exact accuracy、precision、recall 和 average latency；CI 会先做 dataset/schema dry-run，在线评测可按需调用真实模型。

## 5 分钟演示脚本

1. **工作台（30 秒）**：说明服务状态、10 个受治理工具、知识文档数、RAG 与 LLM 指标。
2. **知识库（60 秒）**：上传一份项目说明，展示切分片段数与用户隔离说明。
3. **RAG 问答（60 秒）**：提问文档中的具体事实，展示 `retrieve_knowledge` 工具状态、来源和相关度。
4. **多工具任务（90 秒）**：输入“查询北京天气，并根据天气添加一条出行待办”，展示 Agent 多工具调用过程。
5. **任务中心（30 秒）**：证明 Agent 和 UI 操作的是同一份用户级数据。
6. **工程能力（30 秒）**：打开 `/metrics`、测试结果和 CI，说明系统如何被验证。

演示前准备一份 1–2 KB 的 Markdown 项目文档，避免临场依赖复杂文件解析。

## 高频追问与回答思路

### 为什么使用 MCP？

MCP 把工具发现和调用协议标准化，Agent 编排层不需要了解每个工具的内部实现。但协议本身不等于安全，所以我又加了 catalog 治理层，对 schema、scope、timeout 和 transport 做统一约束。

### 为什么 RAG 是本地工具，而不是暴露给 MCP？

知识检索需要可信的用户上下文。把它放在 API 进程内，`userId` 可以从 JWT 直接传入，减少跨进程暴露私有数据的面积；公开工具和低敏用户工具仍通过 MCP 执行。

### SSE 最容易出什么问题？

TCP chunk 边界与 SSE event 边界没有关系，单个 JSON 可能被拆成多个 chunk，多个 event 也可能粘在一起。客户端使用增量 buffer，只在完整空行分隔符出现后解析 event，并为任意分片写了单元测试。

### 多用户隔离如何保证？

JWT 只在 API 端解析；模型 schema 不包含身份字段。用户级工具执行前必须由内部调用方注入 `userId`，catalog 会拒绝缺失身份或模型伪造身份。RAG、Memory、Todo、Note 的读写都使用相同身份过滤。

### 当前方案能直接大规模生产吗？

不能。当前持久化是为了单机演示和突出核心链路，写多并发和横向扩容能力有限。生产环境会迁移到 PostgreSQL/pgvector 或 Milvus，增加 Redis 队列、分布式 trace、限流、RBAC 和 Secret Manager。这是明确的演进边界，而不是把 Demo 包装成生产系统。

### 为什么不直接使用成熟 Agent 框架？

这个项目有意手写关键 Agent Loop 和 SSE 链路，以便理解 tool call、状态回填、重试和终止条件。生产团队可以替换为 LangGraph 等框架，但身份注入、工具治理、评测与可观测这些边界仍然需要自己设计。

## 简历项目描述（可直接改写）

**Agentic RAG Assistant｜个人项目**

- 设计并实现多用户智能体工作台，基于 Node.js 构建 Agent Loop，统一编排天气、搜索、时间、待办、笔记与知识检索等 10 个工具，支持多轮 Tool Calling 与 SSE 流式输出。
- 建立工具治理层，以 schema 白名单、参数类型校验、超时降级和服务端身份注入约束模型行为；实现 JWT + bcrypt 鉴权及 Todo、Note、RAG、Memory 全链路用户隔离。
- 实现基于 BGE-M3 的用户级 RAG，覆盖文档分块、向量索引、Top-K 召回、来源引用和索引删除，并通过原子写入降低本地索引损坏风险。
- 构建 HTTP/Tool/RAG/LLM 可观测指标与 24 条工具路由回归集，接入 GitHub Actions 执行测试、构建、评测集校验和依赖安全审计；通过 Docker Compose 交付 Web/API/MCP 三服务。

不要在简历中填写尚未真实跑出的准确率、延迟或并发数字。在线评测和压测完成后，再把可复现结果补进去。

## 可继续量化的实验

- 在固定模型和 temperature=0 下运行 3 次路由评测，记录均值与方差。
- 构造 50/100/500 文档片段规模，测量 RAG P50/P95 延迟和 Recall@K。
- 用并发 1/10/30 压测 SSE 首 Token 时间、完成时间和错误率。
- 对比无治理、仅 schema、schema + 身份注入三种配置的越权用例通过率。

