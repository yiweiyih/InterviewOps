import test from 'node:test'
import assert from 'node:assert/strict'

function streamResponse(text) {
  const bytes = new TextEncoder().encode(text)
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      }
    })
  }
}

test('reconnects with Last-Event-ID and ignores replayed message deltas', async t => {
  const originalFetch = globalThis.fetch
  const originalLocalStorage = globalThis.localStorage
  globalThis.localStorage = {
    getItem() {
      return JSON.stringify({ token: 'test-token' })
    }
  }

  let call = 0
  const seenLastEventIds = []
  globalThis.fetch = async (_url, options) => {
    call++
    if (call === 1) {
      assert.equal(options.method, 'POST')
      assert.ok(options.headers['Idempotency-Key'])
      return {
        ok: true,
        status: 202,
        json: async () => ({ runId: 'run_test' })
      }
    }

    seenLastEventIds.push(options.headers['Last-Event-ID'])
    if (call === 2) {
      return streamResponse('id: 1\nevent: message_delta\ndata: {"content":"你"}\n\n')
    }
    return streamResponse(
      'id: 1\nevent: message_delta\ndata: {"content":"你"}\n\n'
      + 'id: 2\nevent: message_delta\ndata: {"content":"好"}\n\n'
      + 'id: 3\nevent: done\ndata: {"status":"completed"}\n\n'
    )
  }

  t.after(() => {
    globalThis.fetch = originalFetch
    globalThis.localStorage = originalLocalStorage
  })

  const { streamChat } = await import('../src/utils/sseClient.js')
  const chunks = []
  await streamChat(
    '/api/agent/runs',
    [{ role: 'user', content: 'hello' }],
    content => chunks.push(content),
    new AbortController().signal
  )

  assert.deepEqual(chunks, ['你', '好'])
  assert.deepEqual(seenLastEventIds, ['0', '1'])
  assert.equal(call, 3)
})
