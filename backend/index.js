const http = require('http');
const https = require('https');
const dotenv = require('dotenv');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { ingestFile, retrieve, listDocuments, deleteDocument } = require('./rag/index');
const { isSupportedDocument } = require('./documents/extract-text');
const { createInterviewService } = require('./interview/service');
const { createInterviewHandler } = require('./interview/routes');
const { retrieveMemory, extractAndSaveMemories } = require('./memory/index');
const { getLlmTools, validateToolArguments } = require('./tools/catalog');
const {
  normalizeRoute,
  recordHttp,
  recordTool,
  recordRag,
  recordLlm,
  renderPrometheus,
  getMetricsSummary
} = require('./observability/metrics');

dotenv.config({ quiet: true });

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少必要环境变量 ${name}，请检查 backend/.env`);
  return value;
}

const JWT_SECRET = requiredEnv('JWT_SECRET');
if (JWT_SECRET.length < 32) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境的 JWT_SECRET 至少需要 32 个字符');
  }
  console.warn('[Security] 当前 JWT_SECRET 少于 32 个字符，仅允许用于本地开发');
}
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); } catch { return []; }
}
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}
function verifyToken(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }); } catch { return null; }
}

const upload = multer({
  dest: path.join(DATA_DIR, 'uploads'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowed = isSupportedDocument(file.originalname);
    callback(allowed ? null : new Error('仅支持 DOCX、PDF、Markdown、TXT、JSON 文件'), allowed);
  }
});

const API_KEY = requiredEnv('DEEPSEEK_API_KEY');
const PORT = Number(process.env.PORT || 3001);
const API_BASE_URL = requiredEnv('DEEPSEEK_BASE_URL');
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3002';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const SERVICE_VERSION = '2.0.0';

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT 必须是 1 到 65535 之间的整数');
}

// ── 工具函数 ──────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

function sendJson(res, data, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 超过 ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function observeLlm(operation, request) {
  const startedAt = performance.now();
  try {
    const response = await request();
    recordLlm({
      operation,
      status: 'success',
      durationMs: performance.now() - startedAt,
      usage: response.usage || {}
    });
    return response;
  } catch (error) {
    recordLlm({ operation, status: 'error', durationMs: performance.now() - startedAt });
    throw error;
  }
}

const interviewService = createInterviewService({
  dataDir: DATA_DIR,
  callJson: messages => observeLlm('interview', () => callDeepSeekJSON(messages)),
  retrieveKnowledge: retrieve
});
const handleInterviewRequest = createInterviewHandler({
  service: interviewService,
  verifyToken,
  readBody,
  sendJson
});

// ── MCP Client ────────────────────────────────────────────
function callMcpTool(toolName, args, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: toolName, arguments: args },
      id: Date.now()
    });
    const url = new URL('/mcp', MCP_SERVER_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(data);
        } catch {
          reject(new Error('MCP 返回了无效的 JSON 响应'));
          return;
        }
        if (json.error) return reject(new Error(json.error.message));
        const text = json.result?.content?.[0]?.text;
        try { resolve(JSON.parse(text)); }
        catch { reject(new Error('MCP 工具结果解析失败')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error(`MCP 调用超过 ${timeoutMs}ms`)); });
    req.write(body);
    req.end();
  });
}

// 创建与简化版服务器完全相同的HTTP服务器
const server = http.createServer(async (req, res) => {
  const requestStartedAt = performance.now();
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);
  res.once('finish', () => {
    recordHttp({
      method: req.method,
      route: normalizeRoute(req.method, req.url),
      status: res.statusCode,
      durationMs: performance.now() - requestStartedAt
    });
  });
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, DELETE, PATCH, PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');
  
  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (await handleInterviewRequest(req, res)) return;
  
  // 只处理POST请求到/api/chat
  if (req.method === 'POST' && req.url === '/api/chat') {
    const user = verifyToken(req);
    if (!user) { sendJson(res, { error: '未登录' }, 401); return; }
    let body = '';
    
    // 接收请求体
    req.on('data', (chunk) => {
      body += chunk;
    });
    
    req.on('end', async () => {
      try {
        const requestData = JSON.parse(body);
        const { messages } = requestData;

        await handleWithPlanning(messages, res, user.userId);
      } catch (error) {
        console.error('解析请求体错误:', error);
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: '请求格式错误' }));
      }
    });
  } else if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, {
      status: 'ok',
      service: 'interviewops-api',
      version: SERVICE_VERSION,
      timestamp: new Date().toISOString()
    });
  } else if (req.method === 'GET' && req.url === '/metrics') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.end(renderPrometheus());
  } else if (req.method === 'GET' && req.url === '/api/dashboard') {
    const user = verifyToken(req);
    if (!user) { sendJson(res, { error: '未登录' }, 401); return; }
    sendJson(res, {
      interview: interviewService.getSummary(user.userId),
      service: { status: 'ok', version: SERVICE_VERSION, uptimeSeconds: Math.round(process.uptime()) },
      tools: { total: TOOLS_SCHEMA.length },
      knowledge: { documents: listDocuments(user.userId).length },
      metrics: getMetricsSummary()
    });
  } else if (req.method === 'POST' && req.url === '/api/register') {
    readBody(req).then(async (body) => {
      const { username, password } = body;
      if (!username || !password) { sendJson(res, { error: '用户名和密码不能为空' }, 400); return; }
      if (username.length < 3 || username.length > 32) { sendJson(res, { error: '用户名长度应为 3 到 32 个字符' }, 400); return; }
      if (password.length < 8 || password.length > 128) { sendJson(res, { error: '密码长度应为 8 到 128 个字符' }, 400); return; }
      const users = readUsers();
      if (users.find(u => u.username === username)) { sendJson(res, { error: '用户名已存在' }, 400); return; }
      const hash = await bcrypt.hash(password, 10);
      const newUser = { id: `u-${Date.now()}`, username, password: hash };
      users.push(newUser);
      writeUsers(users);
      const token = jwt.sign({ userId: newUser.id, username }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' });
      sendJson(res, { token, userId: newUser.id, username });
    });
  } else if (req.method === 'POST' && req.url === '/api/login') {
    readBody(req).then(async (body) => {
      const { username, password } = body;
      const users = readUsers();
      const user = users.find(u => u.username === username);
      if (!user || !(await bcrypt.compare(password, user.password))) {
        sendJson(res, { error: '用户名或密码错误' }, 401); return;
      }
      const token = jwt.sign({ userId: user.id, username }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' });
      sendJson(res, { token, userId: user.id, username });
    });
  } else if (req.method === 'GET' && req.url === '/api/todos') {
    const user = verifyToken(req);
    if (!user) { sendJson(res, { error: '未登录' }, 401); return; }
    callMcpTool('get_todos', { userId: user.userId })
      .then(data => sendJson(res, data))
      .catch(err => sendJson(res, { error: err.message }, 500));
  } else if (req.method === 'POST' && req.url === '/api/todos') {
    const user = verifyToken(req);
    if (!user) { sendJson(res, { error: '未登录' }, 401); return; }
    readBody(req).then(async (body) => {
      try {
        const data = await callMcpTool('add_todo', { text: body.text, userId: user.userId });
        sendJson(res, data);
      } catch (err) { sendJson(res, { error: err.message }, 500); }
    });
  } else if (req.method === 'DELETE' && req.url.startsWith('/api/todos/')) {
    const user = verifyToken(req);
    if (!user) { sendJson(res, { error: '未登录' }, 401); return; }
    const id = Number(req.url.split('/')[3]);
    callMcpTool('delete_todo', { id, userId: user.userId })
      .then(data => sendJson(res, data))
      .catch(err => sendJson(res, { error: err.message }, 500));
  } else if (req.method === 'PATCH' && req.url.includes('/toggle')) {
    const user = verifyToken(req);
    if (!user) { sendJson(res, { error: '未登录' }, 401); return; }
    const id = Number(req.url.split('/')[3]);
    callMcpTool('toggle_todo', { id, userId: user.userId })
      .then(data => sendJson(res, data))
      .catch(err => sendJson(res, { error: err.message }, 500));
  } else if (req.method === 'POST' && req.url === '/api/knowledge/upload') {
    const user = verifyToken(req);
    if (!user) { sendJson(res, { error: '未登录' }, 401); return; }
    upload.single('file')(req, res, async (err) => {
      if (err) return sendJson(res, { error: err.message }, 400);
      if (!req.file) return sendJson(res, { error: '请选择要上传的文件' }, 400);
      try {
        const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf-8');
        const category = String(req.body?.category || 'other').trim().slice(0, 30);
        const count = await ingestFile(req.file.path, fileName, user.userId, { category });
        sendJson(res, { ok: true, chunks: count, name: fileName, category });
      } catch (e) {
        sendJson(res, { error: e.message }, 500);
      } finally {
        fs.unlink(req.file.path, () => {});
      }
    });
  } else if (req.method === 'GET' && req.url === '/api/knowledge') {
    const user = verifyToken(req);
    if (!user) { sendJson(res, { error: '未登录' }, 401); return; }
    sendJson(res, { documents: listDocuments(user.userId) });
  } else if (req.method === 'DELETE' && req.url.startsWith('/api/knowledge/')) {
    const user = verifyToken(req);
    if (!user) { sendJson(res, { error: '未登录' }, 401); return; }
    try {
      const source = decodeURIComponent(req.url.slice('/api/knowledge/'.length).split('?')[0]);
      const removedChunks = deleteDocument(user.userId, source);
      if (removedChunks === 0) { sendJson(res, { error: '未找到该文档' }, 404); return; }
      sendJson(res, { ok: true, name: source, removedChunks });
    } catch (error) {
      sendJson(res, { error: error.message }, 400);
    }
  } else {
    res.statusCode = 404;
    res.end();
  }
});

// DeepSeek Function Calling 工具定义由统一目录生成，避免 API 与 MCP 漂移。
const TOOLS_SCHEMA = getLlmTools();

// ── 任务规划层 ────────────────────────────────────────────

const PLAN_SYSTEM = `你是一个任务规划助手。判断用户的请求是否是需要分步执行的复杂任务。
如果是复杂任务，输出JSON任务树（不要有其他文字）：
{"tasks":[{"id":1,"description":"子任务描述","dependsOn":[]},{"id":2,"description":"子任务描述","dependsOn":[1]}]}
如果不是复杂任务（普通问答、单步操作），输出：{"tasks":null}
复杂任务的判断标准：需要3个以上明显独立的步骤、步骤之间有数据依赖关系。`;

function requestDeepSeekJson(payload, label) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify(payload);
    const url = new URL(API_BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); }
        catch { reject(new Error(`${label}返回了无效的 JSON`)); return; }
        if (res.statusCode < 200 || res.statusCode >= 300 || json.error) {
          reject(new Error(json.error?.message || `${label}请求失败（HTTP ${res.statusCode}）`));
          return;
        }
        resolve(json);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`${label}请求超时`)));
    req.write(requestBody);
    req.end();
  });
}

function callDeepSeekJSON(messages) {
  return requestDeepSeekJson({
    model: 'deepseek-chat',
    messages,
    max_tokens: 1000,
    temperature: 0.3,
    response_format: { type: 'json_object' }
  }, 'DeepSeek JSON');
}

// 拓扑排序：按依赖顺序返回任务执行序列
function topoSort(tasks) {
  const result = [];
  const visited = new Set();
  const map = new Map(tasks.map(t => [t.id, t]));

  function visit(id) {
    if (visited.has(id)) return;
    const task = map.get(id);
    if (!task) return;
    for (const dep of (task.dependsOn || [])) visit(dep);
    visited.add(id);
    result.push(task);
  }

  for (const task of tasks) visit(task.id);
  return result;
}

// 规划入口：返回任务列表或null（普通对话）
async function planTasks(userMessage) {
  try {
    const response = await observeLlm('planner', () => callDeepSeekJSON([
      { role: 'system', content: PLAN_SYSTEM },
      { role: 'user', content: userMessage }
    ]));
    const content = response.choices?.[0]?.message?.content;
    const json = typeof content === 'string' ? JSON.parse(content) : content;
    return json?.tasks || null;
  } catch (e) {
    console.warn('[Planner] 规划失败，降级为普通对话:', e.message);
    return null;
  }
}

// 执行单个子任务，把前置任务结果注入context，复用现有ReAct循环
async function executeTaskNode(task, results, originalMessages, writeProgress, userId) {
  const prevContext = (task.dependsOn || [])
    .map(id => `子任务${id}的结果：${results[id] || '无结果'}`)
    .join('\n');

  const taskMessages = [
    ...originalMessages,
    {
      role: 'user',
      content: prevContext
        ? `请完成以下子任务：${task.description}\n\n前置信息：\n${prevContext}`
        : `请完成以下子任务：${task.description}`
    }
  ];

  writeProgress(`📋 子任务 ${task.id}：${task.description}`);

  // 用现有的 ReAct 循环执行子任务，收集文本结果
  return new Promise((resolve) => {
    let collected = '';
    const fakeRes = {
      _headers: {},
      _written: false,
      setHeader(k, v) { this._headers[k] = v; },
      write(chunk) {
        const str = typeof chunk === 'string' ? chunk : chunk.toString();
        // 只收集 data: {"content":"..."} 行
        for (const line of str.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') { resolve(collected); return; }
          try {
            const json = JSON.parse(raw);
            if (json.content) collected += json.content;
          } catch { /* ignore */ }
        }
      },
      end() { resolve(collected); }
    };
    handleWithFunctionCalling(taskMessages, fakeRes, userId).catch(() => resolve(collected));
  });
}

// 完整规划+调度流程
async function handleWithPlanning(messages, res, userId) {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';

  // SSE 头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const writeProgress = (text) => {
    res.write(`data: ${JSON.stringify({ content: text + '\n' })}\n\n`);
  };

  const tasks = await planTasks(lastUserMsg);

  // 普通对话直接走原有流程
  if (!tasks || tasks.length === 0) {
    handleWithFunctionCalling(messages, res, userId);
    return;
  }

  console.log(`[Planner] 拆解为 ${tasks.length} 个子任务`);
  writeProgress(`🗂️ 已将任务拆解为 ${tasks.length} 个子任务，开始执行...\n`);

  const ordered = topoSort(tasks);
  const results = {};

  for (const task of ordered) {
    try {
      results[task.id] = await executeTaskNode(task, results, messages, writeProgress, userId);
      writeProgress(`✅ 子任务 ${task.id} 完成`);
    } catch (e) {
      results[task.id] = `执行失败: ${e.message}`;
      writeProgress(`❌ 子任务 ${task.id} 失败: ${e.message}`);
    }
  }

  // 汇总：把所有子任务结果交给模型做最终整合回答
  const summaryMessages = [
    ...messages,
    {
      role: 'user',
      content: `以上子任务均已完成，结果如下：\n${ordered.map(t => `子任务${t.id}（${t.description}）：\n${results[t.id]}`).join('\n\n')}\n\n请基于以上结果，给用户一个完整、连贯的最终回答。`
    }
  ];

  writeProgress('\n📝 正在整合所有结果...\n\n');
  // 最终汇总走流式，但SSE头已设置，传true跳过重复设置
  handleStreamRequest(summaryMessages, res, true);
}

// 第一轮：带 tools 发给 DeepSeek，让模型决定是否调用工具
function callDeepSeekWithTools(messages) {
  return requestDeepSeekJson({
      model: 'deepseek-chat',
      messages,
      tools: TOOLS_SCHEMA,
      tool_choice: 'auto',
      max_tokens: 4000,
      temperature: 0.7
    }, 'DeepSeek 工具决策');
}

// 完整的 Agent Loop：支持多工具串联，最多 5 轮
async function handleWithFunctionCalling(messages, res, userId) {
  // 对话前：检索长期记忆，注入 system prompt
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  let memoryContext = '';
  try {
    const memories = await retrieveMemory(lastUserMsg, 5, userId);
    if (memories.length) {
      memoryContext = '\n\n已知用户信息（来自长期记忆）：\n' + memories.map(m => `- ${m.text}`).join('\n');
      console.log(`[Memory] 注入 ${memories.length} 条记忆`);
    }
  } catch (e) {
    console.warn('[Memory] 检索记忆失败:', e.message);
  }

  const systemMessage = {
    role: 'system',
    content: `你是 InterviewOps 面试备战教练，帮助用户在面试前训练、在练习后复盘。你的价值不是给套话，而是结合简历、JD、项目资料找到证据缺口并形成下一步行动。
边界：只服务于面试准备和事后复盘，不帮助用户在真实面试中实时作弊或冒充本人作答。
可用工具：网络搜索(search_web)、待办管理(get_todos/add_todo/delete_todo/toggle_todo)、当前时间(get_datetime)、笔记(write_note/read_notes)、资料检索(retrieve_knowledge)，以及通用天气工具(get_weather)。
规则：
1. 用户询问已上传的简历、JD、项目或复盘记录时，必须调用 retrieve_knowledge，并在回答中注明来源。
2. 制定提升计划时应把清晰、可执行的行动项写入待办；所有待办操作都必须实际调用对应工具。
3. 需要公司、岗位或行业的实时信息时调用 search_web，不得编造。
4. 反馈必须区分“回答中已有的事实”和“建议补充的信息”，不得替用户虚构指标或经历。
5. 回答优先使用 STAR、问题-方案-取舍-结果、定义-原理-场景等适合面试表达的结构。
6. 时间、天气等通用请求仍需调用对应工具。${memoryContext}`
  };

  let loopMessages = [systemMessage, ...messages].filter(
    m => !(m.role === 'assistant' && !m.content)
  );
  const MAX_ROUNDS = 5;
  let citations = []; // 收集所有 RAG 召回结果

  // 工具调用事件辅助函数
  let sseStarted = false;
  function ensureSseHeaders() {
    if (sseStarted) return;
    sseStarted = true;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
  }
  function writeToolCall(name, status, input, result) {
    ensureSseHeaders();
    const payload = `event: tool_call\ndata: ${JSON.stringify({ name, status, input, result })}\n\n`;
    console.log(`[SSE] writeToolCall ${name} ${status}`);
    res.write(payload);
  }
  function getToolInputSummary(toolCall) {
    try {
      const args = JSON.parse(toolCall.function.arguments || '{}');
      return Object.values(args)[0] || '';
    } catch {
      return '';
    }
  }

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      console.log(`[Agent] 第 ${round + 1} 轮：发送给 DeepSeek`);
      const response = await observeLlm('agent_decision', () => callDeepSeekWithTools(loopMessages));
      const choice = response.choices?.[0];

      if (choice?.finish_reason !== 'tool_calls' || !choice?.message?.tool_calls?.length) {
        console.log(`[Agent] 第 ${round + 1} 轮：无工具调用，开始流式输出`);
        if (citations.length) {
          ensureSseHeaders();
          res.write(`event: citations\ndata: ${JSON.stringify(citations)}\n\n`);
        }
        // 对话后：异步提取用户事实存入长期记忆（不阻塞流式输出）
        const assistantContent = choice?.message?.content || '';
        if (assistantContent && lastUserMsg) {
          const memoryLlm = memoryMessages => observeLlm(
            'memory_extraction',
            () => callDeepSeekJSON(memoryMessages)
          );
          extractAndSaveMemories(lastUserMsg, assistantContent, memoryLlm, userId).catch(() => {});
        }
        handleStreamRequest(loopMessages, res, sseStarted);
        return;
      }

      // 并行执行所有工具调用（allSettled：任何工具失败不影响其他工具）
      const toolCalls = choice.message.tool_calls;
      console.log(`[Agent] 第 ${round + 1} 轮：并行执行 ${toolCalls.length} 个工具：${toolCalls.map(t => t.function.name).join(', ')}`);

      const settledResults = await Promise.allSettled(
        toolCalls.map(async (toolCall) => {
          const toolStartedAt = performance.now();
          const toolName = toolCall.function.name;
          try {
            const toolArgs = JSON.parse(toolCall.function.arguments || '{}');
            const definition = validateToolArguments(toolName, toolArgs);
            const inputSummary = getToolInputSummary(toolCall);
            if (definition.scope === 'user') {
              if (!userId) throw new Error(`工具 ${toolName} 需要登录用户`);
              toolArgs.userId = userId;
            }
            writeToolCall(toolName, 'running', inputSummary, null);

            let result;
            if (definition.transport === 'local') {
              const ragStartedAt = performance.now();
              try {
                result = await withTimeout(retrieve(toolArgs.query, 3, userId), definition.timeoutMs, `工具 ${toolName}`);
                recordRag({
                  outcome: result.length > 0 ? 'hit' : 'miss',
                  durationMs: performance.now() - ragStartedAt,
                  resultCount: result.length
                });
              } catch (error) {
                recordRag({ outcome: 'error', durationMs: performance.now() - ragStartedAt, resultCount: 0 });
                throw error;
              }
            } else {
              result = await callMcpTool(toolName, toolArgs, definition.timeoutMs);
            }

            if (toolName === 'retrieve_knowledge' && Array.isArray(result)) citations.push(...result);

            function buildResultSummary(name, toolResult) {
              if (!toolResult || typeof toolResult !== 'object') return String(toolResult || '').slice(0, 60);
              if (name === 'get_weather') return `${toolResult.temp_c}°C · ${toolResult.description} · 湿度${toolResult.humidity}%`;
              if (name === 'get_datetime') return toolResult.datetime || toolResult.date || JSON.stringify(toolResult).slice(0, 60);
              if (name === 'add_todo') return `已添加：${toolResult.todo?.text || ''}`;
              if (name === 'delete_todo') return '已删除';
              if (name === 'toggle_todo') return `已${toolResult.todo?.completed ? '完成' : '取消完成'}`;
              if (name === 'get_todos') return `共 ${toolResult.todos?.length ?? 0} 条待办`;
              if (name === 'search_web') return toolResult.summary || toolResult.results?.[0]?.title || '搜索完成';
              if (name === 'write_note') return `已保存笔记：${toolResult.title || ''}`;
              if (name === 'read_notes') return `共 ${toolResult.notes?.length ?? 0} 条笔记`;
              return JSON.stringify(toolResult).slice(0, 60);
            }

            const resultSummary = buildResultSummary(toolName, result);
            writeToolCall(toolName, 'done', inputSummary, resultSummary);
            recordTool({ tool: toolName, status: 'success', durationMs: performance.now() - toolStartedAt });
            console.log(`[Agent] 工具 ${toolName} 执行成功`);
            return { tool_call_id: toolCall.id, content: JSON.stringify(result) };
          } catch (error) {
            recordTool({ tool: toolName, status: 'error', durationMs: performance.now() - toolStartedAt });
            throw error;
          }
        })
      );

      // 将结果映射为统一格式，失败的工具注入错误信息让模型做语义级降级
      const toolResults = settledResults.map((settled, i) => {
        const toolName = toolCalls[i].function.name;
        if (settled.status === 'fulfilled') {
          return settled.value;
        } else {
          console.warn(`[Agent] 工具 ${toolName} 失败:`, settled.reason?.message);
          writeToolCall(toolName, 'error', getToolInputSummary(toolCalls[i]), settled.reason?.message || '执行失败');
          return {
            tool_call_id: toolCalls[i].id,
            content: JSON.stringify({ error: `工具 ${toolName} 执行失败: ${settled.reason?.message}` })
          };
        }
      });

      // 将 assistant 消息和所有工具结果追加到上下文
      loopMessages.push(choice.message);
      for (const result of toolResults) {
        loopMessages.push({ role: 'tool', tool_call_id: result.tool_call_id, content: result.content });
      }
    }

    // 超出最大轮数，直接流式输出当前上下文
    console.warn('[Agent] 达到最大轮数限制，强制输出');
    handleStreamRequest(loopMessages, res, sseStarted);
  } catch (err) {
    console.warn('[Agent] 异常，降级为普通对话:', err.message);
    handleStreamRequest([systemMessage, ...messages], res, sseStarted);
  }
}

// 处理流式请求
function handleStreamRequest(messages, res, headersAlreadySet = false) {
  const llmStartedAt = performance.now();
  let completed = false;
  let usage = {};

  const requestBody = {
    model: 'deepseek-chat',
    messages: messages,
    max_tokens: 4000,
    temperature: 0.7,
    stream: true
  };

  const url = new URL(API_BASE_URL);
  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname,
    method: 'POST',
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'User-Agent': 'Node.js-Client',
      'Accept': 'text/event-stream'
    }
  };

  // 设置SSE响应头（citations 已提前设置过则跳过）
  if (!headersAlreadySet) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
  }

  function recordStream(status) {
    recordLlm({
      operation: 'stream_response',
      status,
      durationMs: performance.now() - llmStartedAt,
      usage
    });
  }

  function finish(status, errorMessage) {
    if (completed) return;
    completed = true;
    recordStream(status);
    if (res.writableEnded || res.destroyed) return;
    if (errorMessage) res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }

  const maasReq = https.request(options, (maasRes) => {
    if (maasRes.statusCode < 200 || maasRes.statusCode >= 300) {
      let errorBody = '';
      maasRes.on('data', chunk => errorBody += chunk);
      maasRes.on('end', () => {
        let message = `模型服务请求失败（HTTP ${maasRes.statusCode}）`;
        try { message = JSON.parse(errorBody).error?.message || message; } catch { /* ignore */ }
        finish('error', message);
      });
      return;
    }

    let buffer = '';

    maasRes.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留不完整的最后一行

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          finish('success');
          return;
        }
        try {
          const json = JSON.parse(data);
          if (json.usage) usage = json.usage;
          const content = json.choices?.[0]?.delta?.content || '';
          if (content && !completed && !res.writableEnded) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        } catch (e) {
          // 忽略解析失败的行
        }
      }
    });

    maasRes.on('end', () => {
      finish('success');
    });
    maasRes.on('error', error => finish('error', `模型响应中断：${error.message}`));
  });

  maasReq.on('error', (error) => {
    console.error('请求错误:', error);
    finish('error', '流式请求失败：' + error.message);
  });

  maasReq.on('timeout', () => {
    finish('error', '模型请求超时');
    maasReq.destroy();
  });

  res.once('close', () => {
    if (completed) return;
    completed = true;
    recordStream('cancelled');
    maasReq.destroy();
  });

  maasReq.write(JSON.stringify(requestBody));
  maasReq.end();
}

// 启动服务器
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
