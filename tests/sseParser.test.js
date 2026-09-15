import test from 'node:test'
import assert from 'node:assert/strict'
import { createSseParser } from '../src/utils/sseParser.js'

test('parses SSE events split across arbitrary network chunks', () => {
  const events = []
  const parser = createSseParser(event => events.push(event))

  parser.feed('event: tool_')
  parser.feed('call\r\ndata: {"name":"weather"}\r')
  parser.feed('\n\r\ndata: {"content":"你')
  parser.feed('好"}\n\n')
  parser.finish()

  assert.deepEqual(events, [
    { event: 'tool_call', data: '{"name":"weather"}' },
    { event: 'message', data: '{"content":"你好"}' }
  ])
})

test('joins multiline data and ignores comments', () => {
  const events = []
  const parser = createSseParser(event => events.push(event))

  parser.feed(': keepalive\ndata: first\ndata: second\n\n')
  parser.finish()

  assert.deepEqual(events, [{ event: 'message', data: 'first\nsecond' }])
})

test('keeps structured plan progress separate from answer content', () => {
  const events = []
  const parser = createSseParser(event => events.push(event))

  parser.feed('event: plan_progress\ndata: {"status":"running","tasks":[{"id":1,"status":"running"}]}\n\n')
  parser.feed('data: {"content":"最终回答"}\n\n')
  parser.finish()

  assert.deepEqual(events, [
    {
      event: 'plan_progress',
      data: '{"status":"running","tasks":[{"id":1,"status":"running"}]}'
    },
    { event: 'message', data: '{"content":"最终回答"}' }
  ])
})

test('parses event ids used for resume and resets them per event', () => {
  const events = []
  const parser = createSseParser(event => events.push(event))

  parser.feed('id: 41\nevent: message_delta\ndata: {"content":"你"}\n\n')
  parser.feed('id: 42\nevent: message_delta\ndata: {"content":"好"}\n\n')
  parser.feed('event: done\ndata: {"status":"completed"}\n\n')
  parser.finish()

  assert.deepEqual(events, [
    { event: 'message_delta', data: '{"content":"你"}', id: '41' },
    { event: 'message_delta', data: '{"content":"好"}', id: '42' },
    { event: 'done', data: '{"status":"completed"}' }
  ])
})
