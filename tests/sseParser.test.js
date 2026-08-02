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
