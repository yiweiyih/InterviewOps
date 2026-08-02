const http = require('http');
const https = require('https');
const dotenv = require('dotenv');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { ingestFile, retrieve } = require('./rag/index');
const { retrieveMemory, extractAndSaveMemories } = require('./memory/index');

dotenv.config({ quiet: true });

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
const USERS_FILE = path.join(__dirname, 'users.json');

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
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowedExtensions = new Set(['.md', '.markdown', '.txt', '.json']);
    const extension = path.extname(file.originalname).toLowerCase();
    callback(extension && allowedExtensions.has(extension) ? null : new Error('仅支持 md、markdown、txt、json 文件'), allowedExtensions.has(extension));
  }
});

const API_KEY = requiredEnv('DEEPSEEK_API_KEY');
const PORT = Number(process.env.PORT || 3001);
const API_BASE_URL = requiredEnv('DEEPSEEK_BASE_URL');
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3002';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const SERVICE_VERSION = '1.0.0';

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

// ── MCP Client ────────────────────────────────────────────
function callMcpTool(toolName, args) {
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
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message));
          const text = json.result?.content?.[0]?.text;
          resolve(JSON.parse(text));
        } catch (e) {
          reject(new Error('MCP 响应解析失败'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('MCP 调用超时')); });
    req.write(body);
    req.end();
  });
}

// 创建与简化版服务器完全相同的HTTP服务器
const server = http.createServer((req, res) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, DELETE, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');
  
  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }
  
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
      service: 'agentic-rag-api',
      version: SERVICE_VERSION,
      timestamp: new Date().toISOString()
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
        const count = await ingestFile(req.file.path, fileName, user.userId);
        sendJson(res, { ok: true, chunks: count, name: fileName });
      } catch (e) {
        sendJson(res, { error: e.message }, 500);
      } finally {
        fs.unlink(req.file.path, () => {});
      }
    });
  } else {
    res.statusCode = 404;
    res.end();
  }
});

// DeepSeek Function Calling 工具定义
const TOOLS_SCHEMA = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '查询指定城市的实时天气，包括温度、湿度、风速、天气状况等',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名称，如"北京"、"上海"、"盐城"' }
        },
        required: ['city']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: '通过搜索引擎查询网络上的信息，适合查询人物、新闻、百科等内容',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词，如"南京邮电大学 张三 教授"' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_todos',
      description: '获取所有待办事项列表',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_todo',
      description: '添加一条新的待办事项',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '待办事项内容' }
        },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_todo',
      description: '删除指定ID的待办事项',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'number', description: '待办事项的ID' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'toggle_todo',
      description: '切换待办事项的完成状态（完成↔未完成）',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'number', description: '待办事项的ID' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_datetime',
      description: '获取当前日期、时间和星期，用于回答"现在几点"、"今天是几号"等时间相关问题',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_note',
      description: '将重要信息保存为笔记，供以后回忆。适合用户说"记住xxx"、"帮我记录xxx"等场景',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '笔记标题' },
          text:  { type: 'string', description: '笔记正文内容' }
        },
        required: ['title', 'text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'retrieve_knowledge',
      description: '从本地知识库中检索与问题相关的文档片段，当用户询问已上传文档的内容时调用',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索关键词或问题' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_notes',
      description: '读取所有已保存的笔记，用于回答"你记得什么"、"我之前让你记住了什么"等问题',
      parameters: { type: 'object', properties: {} }
    }
  }
];

// ── 任务规划层 ────────────────────────────────────────────

const PLAN_SYSTEM = `你是一个任务规划助手。判断用户的请求是否是需要分步执行的复杂任务。
如果是复杂任务，输出JSON任务树（不要有其他文字）：
{"tasks":[{"id":1,"description":"子任务描述","dependsOn":[]},{"id":2,"description":"子任务描述","dependsOn":[1]}]}
如果不是复杂任务（普通问答、单步操作），输出：{"tasks":null}
复杂任务的判断标准：需要3个以上明显独立的步骤、步骤之间有数据依赖关系。`;

function callDeepSeekJSON(messages) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      model: 'deepseek-chat',
      messages,
      max_tokens: 1000,
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });
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
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('规划响应解析失败')); }
      });
    });
    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
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
    const response = await callDeepSeekJSON([
      { role: 'system', content: PLAN_SYSTEM },
      { role: 'user', content: userMessage }
    ]);
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
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      model: 'deepseek-chat',
      messages,
      tools: TOOLS_SCHEMA,
      tool_choice: 'auto',
      max_tokens: 4000,
      temperature: 0.7
    });
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
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('DeepSeek 响应解析失败')); }
      });
    });
    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
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
    content: '你是一个智能助手。你拥有以下工具：查询天气(get_weather)、网络搜索(search_web)、待办管理(get_todos/add_todo/delete_todo/toggle_todo)、获取当前时间(get_datetime)、保存笔记(write_note)、读取笔记(read_notes)、知识库检索(retrieve_knowledge)。规则：1.用户询问时间、日期、星期时必须调用get_datetime，不能凭自身知识回答。2.用户提到任何城市的天气、气温、是否下雨、要不要带伞、出行穿什么等与天气相关的问题时，必须调用get_weather，不得凭自身知识回答。3.如果你在上一轮询问了用户城市名称，用户回复了城市名，必须立即调用get_weather查询该城市天气，不得直接回答。4.用户要求添加、删除、完成、查看待办事项时，必须调用对应的待办工具(add_todo/delete_todo/toggle_todo/get_todos)，不得凭上下文记忆直接回答，每次操作都必须实际调用工具。5.用户询问已上传文档内容时必须调用retrieve_knowledge，并在回答中注明引用来源。6.需要实时信息时必须调用对应工具，不得自行编造。' + memoryContext
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

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      console.log(`[Agent] 第 ${round + 1} 轮：发送给 DeepSeek`);
      const response = await callDeepSeekWithTools(loopMessages);
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
          extractAndSaveMemories(lastUserMsg, assistantContent, callDeepSeekJSON, userId).catch(() => {});
        }
        handleStreamRequest(loopMessages, res, sseStarted);
        return;
      }

      // 并行执行所有工具调用（allSettled：任何工具失败不影响其他工具）
      const toolCalls = choice.message.tool_calls;
      console.log(`[Agent] 第 ${round + 1} 轮：并行执行 ${toolCalls.length} 个工具：${toolCalls.map(t => t.function.name).join(', ')}`);

      const settledResults = await Promise.allSettled(
        toolCalls.map(async (toolCall) => {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);
          const USER_TOOLS = ['get_todos', 'add_todo', 'delete_todo', 'toggle_todo', 'write_note', 'read_notes'];
          if (userId && USER_TOOLS.includes(toolName)) toolArgs.userId = userId;
          const inputSummary = Object.values(toolArgs)[0] || '';
          writeToolCall(toolName, 'running', inputSummary, null);
          // retrieve_knowledge 直接走本地 RAG，不经过 MCP
          const result = toolName === 'retrieve_knowledge'
            ? await retrieve(toolArgs.query, 3, userId)
            : await callMcpTool(toolName, toolArgs);
          // 收集 RAG 引用
          if (toolName === 'retrieve_knowledge' && Array.isArray(result)) {
            citations.push(...result);
          }
          function buildResultSummary(name, result) {
            if (!result || typeof result !== 'object') return String(result || '').slice(0, 60);
            if (name === 'get_weather') {
              return `${result.temp_c}°C · ${result.description} · 湿度${result.humidity}%`;
            }
            if (name === 'get_datetime') return result.datetime || result.date || JSON.stringify(result).slice(0, 60);
            if (name === 'add_todo') return `已添加：${result.todo?.text || ''}`;
            if (name === 'delete_todo') return '已删除';
            if (name === 'toggle_todo') return `已${result.todo?.completed ? '完成' : '取消完成'}`;
            if (name === 'get_todos') return `共 ${result.todos?.length ?? 0} 条待办`;
            if (name === 'search_web') return result.summary || result.results?.[0]?.title || '搜索完成';
            if (name === 'write_note') return `已保存笔记：${result.title || ''}`;
            if (name === 'read_notes') return `共 ${result.notes?.length ?? 0} 条笔记`;
            return JSON.stringify(result).slice(0, 60);
          }
          const resultSummary = buildResultSummary(toolName, result);
          writeToolCall(toolName, 'done', inputSummary, resultSummary);
          console.log(`[Agent] 工具 ${toolName} 执行成功`);
          return { tool_call_id: toolCall.id, content: JSON.stringify(result) };
        })
      );

      // 将结果映射为统一格式，失败的工具注入错误信息让模型做语义级降级
      const toolResults = settledResults.map((settled, i) => {
        const toolName = toolCalls[i].function.name;
        if (settled.status === 'fulfilled') {
          return settled.value;
        } else {
          console.warn(`[Agent] 工具 ${toolName} 失败:`, settled.reason?.message);
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

  const maasReq = https.request(options, (maasRes) => {
    console.log('状态码:', maasRes.statusCode);

    let buffer = '';

    maasRes.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留不完整的最后一行

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content || '';
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        } catch (e) {
          // 忽略解析失败的行
        }
      }
    });

    maasRes.on('end', () => {
      res.write('data: [DONE]\n\n');
      res.end();
    });
  });

  maasReq.on('error', (error) => {
    console.error('请求错误:', error);
    res.write(`data: ${JSON.stringify({ error: '流式请求失败：' + error.message })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });

  maasReq.on('timeout', () => {
    maasReq.destroy();
    res.write(`data: ${JSON.stringify({ error: '请求超时' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });

  maasReq.write(JSON.stringify(requestBody));
  maasReq.end();
}

// 启动服务器
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
