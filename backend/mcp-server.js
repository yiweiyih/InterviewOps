const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const app = express();
app.use(express.json());

// ── Todo 数据文件 ──────────────────────────────────────────
const TODOS_FILE = path.join(__dirname, 'todos.json');

function readTodos(userId) {
  const file = userId ? path.join(__dirname, `todos-${userId}.json`) : TODOS_FILE;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
}

function writeTodos(userId, todos) {
  const file = userId ? path.join(__dirname, `todos-${userId}.json`) : TODOS_FILE;
  fs.writeFileSync(file, JSON.stringify(todos, null, 2));
}

const PORT = Number(process.env.MCP_PORT || 3002);
const SERPER_API_KEY = process.env.SERPER_API_KEY;

// ── Notes 数据文件 ─────────────────────────────────────────
const NOTES_FILE = path.join(__dirname, 'notes.json');

function readNotes(userId) {
  const file = userId ? path.join(__dirname, `notes-${userId}.json`) : NOTES_FILE;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
}

function writeNotes(userId, notes) {
  const file = userId ? path.join(__dirname, `notes-${userId}.json`) : NOTES_FILE;
  fs.writeFileSync(file, JSON.stringify(notes, null, 2));
}

// ── 工具定义 ──────────────────────────────────────────────
const TOOLS = [
  {
    name: 'get_weather',
    description: '查询指定城市的实时天气信息，返回温度、湿度、天气状况等数据',
    inputSchema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '城市名称，支持中文或英文，如"北京"或"Beijing"'
        }
      },
      required: ['city']
    }
  },
  {
    name: 'search_web',
    description: '通过搜索引擎查询网络上的信息，适合查询人物、新闻、百科等内容',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词，如"南京邮电大学 张三 教授"'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_todos',
    description: '获取所有待办事项列表',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'add_todo',
    description: '添加一条新的待办事项',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '待办事项内容' }
      },
      required: ['text']
    }
  },
  {
    name: 'delete_todo',
    description: '删除指定ID的待办事项',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: '待办事项的ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'toggle_todo',
    description: '切换待办事项的完成状态（完成↔未完成）',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: '待办事项的ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'get_datetime',
    description: '获取当前日期、时间和星期，用于回答"现在几点"、"今天是几号"等时间相关问题',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'write_note',
    description: '将重要信息保存为笔记，供以后回忆。适合用户说"记住xxx"、"帮我记录xxx"等场景',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '笔记标题，简短概括内容' },
        text:  { type: 'string', description: '笔记正文内容' }
      },
      required: ['title', 'text']
    }
  },
  {
    name: 'read_notes',
    description: '读取所有已保存的笔记，用于回答"你记得什么"、"我之前让你记住了什么"等问题',
    inputSchema: { type: 'object', properties: {} }
  }
];

// ── 网络搜索 ──────────────────────────────────────────────
function searchWeb(query) {
  return new Promise((resolve, reject) => {
    if (!SERPER_API_KEY) {
      reject(new Error('SERPER_API_KEY 未配置，网络搜索工具不可用'));
      return;
    }

    const body = JSON.stringify({ q: query, num: 5 });
    const options = {
      hostname: 'google.serper.dev',
      path: '/search',
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const results = (json.organic || []).slice(0, 5).map(item => ({
            title: item.title,
            snippet: item.snippet,
            link: item.link
          }));
          resolve({ query, results });
        } catch (e) {
          reject(new Error('搜索结果解析失败'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('搜索超时')); });
    req.write(body);
    req.end();
  });
}

// ── 天气查询 ──────────────────────────────────────────────
function fetchWeather(city) {
  return new Promise((resolve, reject) => {
    const encodedCity = encodeURIComponent(city);
    const url = `https://wttr.in/${encodedCity}?format=j1`;

    const req = https.get(url, { headers: { 'User-Agent': 'curl/7.68.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const current = json.current_condition[0];
          const area = json.nearest_area[0];
          resolve({
            city: city,  // 直接用传入的中文城市名
            country: area.country[0].value,
            temp_c: current.temp_C,
            feels_like_c: current.FeelsLikeC,
            humidity: current.humidity,
            description: current.weatherDesc[0].value,
            wind_kmph: current.windspeedKmph,
            wind_dir: current.winddir16Point,
            visibility: current.visibility,
            uv_index: current.uvIndex
          });
        } catch (e) {
          reject(new Error(`天气数据解析失败: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('天气查询超时'));
    });
  });
}

// ── JSON-RPC 2.0 处理 ─────────────────────────────────────
async function handleRpc(method, params) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'yuan-agent-mcp-server', version: '2.0.0' }
      };

    case 'tools/list':
      return { tools: TOOLS };

    case 'tools/call': {
      const { name, arguments: args } = params || {};
      if (name === 'get_weather') {
        if (!args?.city) throw { code: -32602, message: '缺少参数: city' };
        console.log(`[MCP] 调用 get_weather，城市: ${args.city}`);
        const weather = await fetchWeather(args.city);
        console.log(`[MCP] 天气数据:`, weather);
        return { content: [{ type: 'text', text: JSON.stringify(weather) }] };
      } else if (name === 'search_web') {
        if (!args?.query) throw { code: -32602, message: '缺少参数: query' };
        console.log(`[MCP] 调用 search_web，关键词: ${args.query}`);
        const result = await searchWeb(args.query);
        console.log(`[MCP] 搜索结果:`, result);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } else if (name === 'get_todos') {
        const todos = readTodos(args?.userId);
        return { content: [{ type: 'text', text: JSON.stringify({ todos }) }] };
      } else if (name === 'add_todo') {
        if (!args?.text) throw { code: -32602, message: '缺少参数: text' };
        const todos = readTodos(args?.userId);
        const newTodo = { id: Date.now(), text: args.text.trim(), completed: false };
        todos.push(newTodo);
        writeTodos(args?.userId, todos);
        console.log(`[MCP] 添加待办: ${args.text}`);
        return { content: [{ type: 'text', text: JSON.stringify({ todo: newTodo, todos }) }] };
      } else if (name === 'delete_todo') {
        if (args?.id === undefined) throw { code: -32602, message: '缺少参数: id' };
        const todos = readTodos(args?.userId);
        const filtered = todos.filter(t => t.id !== args.id);
        writeTodos(args?.userId, filtered);
        console.log(`[MCP] 删除待办 id: ${args.id}`);
        return { content: [{ type: 'text', text: JSON.stringify({ todos: filtered }) }] };
      } else if (name === 'toggle_todo') {
        if (args?.id === undefined) throw { code: -32602, message: '缺少参数: id' };
        const todos = readTodos(args?.userId);
        const todo = todos.find(t => t.id === args.id);
        if (!todo) throw { code: -32602, message: `未找到 id: ${args.id}` };
        todo.completed = !todo.completed;
        writeTodos(args?.userId, todos);
        console.log(`[MCP] 切换待办 id: ${args.id}，completed: ${todo.completed}`);
        return { content: [{ type: 'text', text: JSON.stringify({ todo, todos }) }] };
      } else if (name === 'get_datetime') {
        const now = new Date();
        const dateStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        console.log(`[MCP] 调用 get_datetime: ${dateStr}`);
        return { content: [{ type: 'text', text: JSON.stringify({ datetime: dateStr, iso: now.toISOString() }) }] };
      } else if (name === 'write_note') {
        if (!args?.title || !args?.text) throw { code: -32602, message: '缺少参数: title 或 text' };
        const notes = readNotes(args?.userId);
        const note = { id: Date.now(), title: args.title.trim(), text: args.text.trim(), created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) };
        notes.push(note);
        writeNotes(args?.userId, notes);
        console.log(`[MCP] 写入笔记: ${args.title}`);
        return { content: [{ type: 'text', text: JSON.stringify({ note, total: notes.length }) }] };
      } else if (name === 'read_notes') {
        const notes = readNotes(args?.userId);
        console.log(`[MCP] 读取笔记，共 ${notes.length} 条`);
        return { content: [{ type: 'text', text: JSON.stringify({ notes, total: notes.length }) }] };
      } else {
        throw { code: -32601, message: `未知工具: ${name}` };
      }
    }

    default:
      throw { code: -32601, message: `未知方法: ${method}` };
  }
}

// ── HTTP 端点 ─────────────────────────────────────────────
app.post('/mcp', async (req, res) => {
  const { jsonrpc, method, params, id } = req.body;

  if (jsonrpc !== '2.0') {
    return res.json({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request' } });
  }

  try {
    const result = await handleRpc(method, params);
    res.json({ jsonrpc: '2.0', id, result });
  } catch (err) {
    const error = err.code ? err : { code: -32603, message: err.message || 'Internal error' };
    res.json({ jsonrpc: '2.0', id, error });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'agentic-rag-mcp',
    version: '2.0.0',
    tools: TOOLS.map(t => t.name),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`MCP Server running on http://localhost:${PORT}`);
  console.log(`Tools: ${TOOLS.map(t => t.name).join(', ')}`);
});
