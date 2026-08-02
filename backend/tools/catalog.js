const TOOL_DEFINITIONS = [
  {
    name: 'get_weather',
    description: '查询指定城市的实时天气，包括温度、湿度、风速和天气状况',
    transport: 'mcp',
    scope: 'public',
    timeoutMs: 12000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { city: { type: 'string', description: '城市名称，如“北京”或“Shanghai”' } },
      required: ['city']
    }
  },
  {
    name: 'search_web',
    description: '通过搜索引擎查询实时信息，适合新闻、人物和百科类问题',
    transport: 'mcp',
    scope: 'public',
    timeoutMs: 12000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { query: { type: 'string', description: '需要搜索的关键词' } },
      required: ['query']
    }
  },
  {
    name: 'get_todos',
    description: '获取当前用户的待办事项列表',
    transport: 'mcp',
    scope: 'user',
    timeoutMs: 5000,
    inputSchema: { type: 'object', additionalProperties: false, properties: {} }
  },
  {
    name: 'add_todo',
    description: '为当前用户添加一条待办事项',
    transport: 'mcp',
    scope: 'user',
    timeoutMs: 5000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { text: { type: 'string', description: '待办事项内容' } },
      required: ['text']
    }
  },
  {
    name: 'delete_todo',
    description: '删除当前用户指定 ID 的待办事项',
    transport: 'mcp',
    scope: 'user',
    timeoutMs: 5000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { id: { type: 'number', description: '待办事项 ID' } },
      required: ['id']
    }
  },
  {
    name: 'toggle_todo',
    description: '切换当前用户指定待办事项的完成状态',
    transport: 'mcp',
    scope: 'user',
    timeoutMs: 5000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { id: { type: 'number', description: '待办事项 ID' } },
      required: ['id']
    }
  },
  {
    name: 'get_datetime',
    description: '获取当前日期、时间和星期',
    transport: 'mcp',
    scope: 'public',
    timeoutMs: 3000,
    inputSchema: { type: 'object', additionalProperties: false, properties: {} }
  },
  {
    name: 'write_note',
    description: '为当前用户保存一条长期笔记',
    transport: 'mcp',
    scope: 'user',
    timeoutMs: 5000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string', description: '笔记标题' },
        text: { type: 'string', description: '笔记正文' }
      },
      required: ['title', 'text']
    }
  },
  {
    name: 'read_notes',
    description: '读取当前用户保存的所有笔记',
    transport: 'mcp',
    scope: 'user',
    timeoutMs: 5000,
    inputSchema: { type: 'object', additionalProperties: false, properties: {} }
  },
  {
    name: 'retrieve_knowledge',
    description: '检索当前用户上传的知识库，并返回带来源和相关度的文档片段',
    transport: 'local',
    scope: 'user',
    timeoutMs: 15000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { query: { type: 'string', description: '需要检索的问题或关键词' } },
      required: ['query']
    }
  }
];

const TOOL_MAP = new Map(TOOL_DEFINITIONS.map(tool => [tool.name, tool]));

function validationError(message) {
  const error = new Error(message);
  error.code = -32602;
  return error;
}

function getToolDefinition(name) {
  const definition = TOOL_MAP.get(name);
  if (!definition) {
    const error = new Error(`未知工具: ${name}`);
    error.code = -32601;
    throw error;
  }
  return definition;
}

function validateToolArguments(name, input, { allowInternal = false } = {}) {
  const definition = getToolDefinition(name);
  const args = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const publicArgs = { ...args };

  if (allowInternal) delete publicArgs.userId;
  if (!allowInternal && Object.hasOwn(publicArgs, 'userId')) {
    throw validationError('模型无权指定 userId');
  }
  if (allowInternal && definition.scope === 'user' && !args.userId) {
    throw validationError(`工具 ${name} 缺少用户身份`);
  }

  const schema = definition.inputSchema;
  const allowedKeys = new Set(Object.keys(schema.properties || {}));
  const unknownKey = Object.keys(publicArgs).find(key => !allowedKeys.has(key));
  if (unknownKey && schema.additionalProperties === false) {
    throw validationError(`工具 ${name} 不支持参数 ${unknownKey}`);
  }

  for (const key of schema.required || []) {
    if (publicArgs[key] === undefined || publicArgs[key] === null || publicArgs[key] === '') {
      throw validationError(`工具 ${name} 缺少参数 ${key}`);
    }
  }

  for (const [key, value] of Object.entries(publicArgs)) {
    const expectedType = schema.properties?.[key]?.type;
    if (expectedType && typeof value !== expectedType) {
      throw validationError(`工具 ${name} 的参数 ${key} 必须是 ${expectedType}`);
    }
  }

  return definition;
}

function getMcpTools() {
  return TOOL_DEFINITIONS
    .filter(tool => tool.transport === 'mcp')
    .map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

function getLlmTools() {
  return TOOL_DEFINITIONS.map(({ name, description, inputSchema }) => ({
    type: 'function',
    function: { name, description, parameters: inputSchema }
  }));
}

module.exports = {
  TOOL_DEFINITIONS,
  getToolDefinition,
  validateToolArguments,
  getMcpTools,
  getLlmTools
};
