const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getMcpTools,
  getLlmTools,
  validateToolArguments
} = require('../tools/catalog');

test('exposes local RAG to the model but not through MCP', () => {
  assert.equal(getLlmTools().some(tool => tool.function.name === 'retrieve_knowledge'), true);
  assert.equal(getMcpTools().some(tool => tool.name === 'retrieve_knowledge'), false);
});

test('rejects model-supplied user identity and unknown arguments', () => {
  assert.throws(
    () => validateToolArguments('get_todos', { userId: 'attacker' }),
    /无权指定 userId/
  );
  assert.throws(
    () => validateToolArguments('get_weather', { city: '北京', extra: true }),
    /不支持参数 extra/
  );
});

test('requires internal user identity for user-scoped MCP calls', () => {
  assert.throws(
    () => validateToolArguments('add_todo', { text: '准备面试' }, { allowInternal: true }),
    /缺少用户身份/
  );
  assert.doesNotThrow(() => validateToolArguments(
    'add_todo',
    { text: '准备面试', userId: 'u-1' },
    { allowInternal: true }
  ));
});

test('validates required argument types', () => {
  assert.throws(() => validateToolArguments('delete_todo', { id: '1' }), /必须是 number/);
  assert.throws(() => validateToolArguments('search_web', {}), /缺少参数 query/);
});
