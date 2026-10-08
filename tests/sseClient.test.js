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

function createStorage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
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

test('resumes a saved run after refresh without creating a second task', async t => {
  const originalFetch = globalThis.fetch
  const originalLocalStorage = globalThis.localStorage
  globalThis.localStorage = {
    getItem() {
      return JSON.stringify({ token: 'test-token' })
    }
  }

  const requests = []
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    return streamResponse(
      'id: 4\nevent: message_delta\ndata: {"content":"继续"}\n\n'
      + 'id: 5\nevent: done\ndata: {"status":"completed"}\n\n'
    )
  }

  t.after(() => {
    globalThis.fetch = originalFetch
    globalThis.localStorage = originalLocalStorage
  })

  const { streamChat } = await import('../src/utils/sseClient.js')
  const chunks = []
  const checkpoints = []
  await streamChat(
    '/api/agent/runs',
    [],
    content => chunks.push(content),
    new AbortController().signal,
    undefined,
    undefined,
    undefined,
    {
      requestId: 'request_saved',
      runId: 'run_saved',
      lastSeq: 3,
      onCheckpoint: checkpoint => checkpoints.push(checkpoint)
    }
  )

  assert.equal(requests.length, 1)
  assert.equal(requests[0].options.method, 'GET')
  assert.equal(requests[0].options.headers['Last-Event-ID'], '3')
  assert.deepEqual(chunks, ['继续'])
  assert.deepEqual(checkpoints.map(item => item.lastSeq), [3, 4, 5])
  assert.ok(checkpoints.every(item => item.runId === 'run_saved'))
})

test('stopping before the create response cancels by request id', async t => {
  const originalFetch = globalThis.fetch
  const originalLocalStorage = globalThis.localStorage
  const originalSessionStorage = globalThis.sessionStorage
  globalThis.localStorage = { getItem: () => JSON.stringify({ token: 'test-token' }) }
  globalThis.sessionStorage = createStorage()
  const controller = new AbortController()
  let cancelBody
  let createStarted
  const started = new Promise(resolve => { createStarted = resolve })

  globalThis.fetch = (url, options) => {
    if (url === '/api/agent/runs') {
      createStarted()
      return new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => reject(new DOMException('stopped', 'AbortError')), { once: true })
      })
    }
    cancelBody = JSON.parse(options.body)
    return Promise.resolve({ ok: true, json: async () => ({ status: 'cancelled' }) })
  }
  t.after(() => {
    globalThis.fetch = originalFetch
    globalThis.localStorage = originalLocalStorage
    globalThis.sessionStorage = originalSessionStorage
  })

  const { streamChat } = await import('../src/utils/sseClient.js')
  const { loadPendingCancels } = await import('../src/utils/agentRunState.js')
  const task = streamChat('/api/agent/runs', [], () => {}, controller.signal)
  await started
  controller.abort()

  await assert.rejects(task, { name: 'AbortError' })
  assert.equal(typeof cancelBody.requestId, 'string')
  assert.deepEqual(loadPendingCancels(), [])
})

test('failed cancel is saved and retried after the network returns', async t => {
  const originalFetch = globalThis.fetch
  const originalLocalStorage = globalThis.localStorage
  const originalSessionStorage = globalThis.sessionStorage
  globalThis.localStorage = { getItem: () => JSON.stringify({ token: 'test-token' }) }
  globalThis.sessionStorage = createStorage()
  const controller = new AbortController()
  let eventsStarted
  const started = new Promise(resolve => { eventsStarted = resolve })
  globalThis.fetch = (url, options) => {
    if (url === '/api/agent/runs') {
      return Promise.resolve({ ok: true, json: async () => ({ runId: 'run-offline' }) })
    }
    if (url.endsWith('/events')) {
      eventsStarted()
      return new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => reject(new DOMException('stopped', 'AbortError')), { once: true })
      })
    }
    return Promise.reject(new TypeError('offline'))
  }
  t.after(() => {
    globalThis.fetch = originalFetch
    globalThis.localStorage = originalLocalStorage
    globalThis.sessionStorage = originalSessionStorage
  })

  const { streamChat, retryPendingCancels } = await import('../src/utils/sseClient.js')
  const { loadPendingCancels } = await import('../src/utils/agentRunState.js')
  const task = streamChat('/api/agent/runs', [], () => {}, controller.signal)
  await started
  controller.abort()
  await assert.rejects(task, error => error.name === 'AbortError' && error.cancelPending)
  assert.equal(loadPendingCancels().length, 1)

  globalThis.fetch = async () => ({ ok: true, json: async () => ({ status: 'cancelled' }) })
  await retryPendingCancels()
  assert.deepEqual(loadPendingCancels(), [])
})
