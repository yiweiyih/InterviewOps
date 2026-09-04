import test from 'node:test'
import assert from 'node:assert/strict'
import { createChatId, normalizeSessionMessages, stripLegacyPlanProgress } from '../src/stores/chat.js'

test('chat ids stay unique for messages created in the same millisecond', () => {
  const ids = Array.from({ length: 5 }, () => createChatId('message'))
  assert.equal(new Set(ids).size, ids.length)
})

test('normalization repairs duplicate message ids without dropping user messages', () => {
  const messages = normalizeSessionMessages([
    { id: 100, role: 'user', content: '我的问题' },
    { id: 100, role: 'assistant', content: '教练回答' }
  ], 'session-1')

  assert.equal(messages.length, 2)
  assert.equal(new Set(messages.map(message => message.id)).size, 2)
  assert.deepEqual(messages.map(message => message.role), ['user', 'assistant'])
})

test('legacy standalone tool calls are grouped into their assistant answer', () => {
  const messages = normalizeSessionMessages([
    { id: 1, role: 'user', content: '帮我看看资料' },
    { id: 2, role: 'assistant', content: '这是建议' },
    { id: 2, type: 'tool_call', name: 'retrieve_knowledge', status: 'done', result: '已检索' },
    { id: 2, type: 'tool_call', name: 'get_todos', status: 'done', result: '共 2 条待办' }
  ], 'session-1')

  assert.equal(messages.length, 2)
  assert.deepEqual(messages[1].toolCalls.map(toolCall => toolCall.name), [
    'retrieve_knowledge',
    'get_todos'
  ])
})

test('legacy planner logs are removed without changing the final answer', () => {
  const content = [
    '🗂️ 已将任务拆解为 2 个子任务，开始执行...',
    '📋 子任务 1：检索资料',
    '✅ 子任务 1 完成',
    '📝 正在整合所有结果...',
    '',
    '这是最终回答。'
  ].join('\n')

  assert.equal(stripLegacyPlanProgress(content), '这是最终回答。')
})
