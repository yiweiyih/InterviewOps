import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACTIVE_RUN_MAX_AGE_MS,
  clearActiveRun,
  loadActiveRun,
  saveActiveRun
} from '../src/utils/agentRunState.js'

function createStorage() {
  const values = new Map()
  return {
    getItem(key) {
      return values.get(key) ?? null
    },
    setItem(key, value) {
      values.set(key, value)
    },
    removeItem(key) {
      values.delete(key)
    }
  }
}

test('persists the active run checkpoint needed after a page refresh', () => {
  const storage = createStorage()
  saveActiveRun({
    requestId: 'request_saved',
    runId: 'run_saved',
    lastSeq: 12,
    sessionId: 'session_saved',
    assistantMessageId: 'message_saved',
    refreshTodos: true
  }, storage, 1000)

  assert.deepEqual(loadActiveRun(storage, 2000), {
    requestId: 'request_saved',
    runId: 'run_saved',
    lastSeq: 12,
    sessionId: 'session_saved',
    assistantMessageId: 'message_saved',
    refreshTodos: true,
    updatedAt: 1000
  })

  clearActiveRun(storage)
  assert.equal(loadActiveRun(storage, 2000), null)
})

test('drops stale refresh checkpoints after the backend retention window', () => {
  const storage = createStorage()
  saveActiveRun({
    requestId: 'request_stale',
    runId: 'run_stale',
    lastSeq: 2,
    sessionId: 'session_stale',
    assistantMessageId: 'message_stale'
  }, storage, 1000)

  assert.equal(loadActiveRun(storage, 1000 + ACTIVE_RUN_MAX_AGE_MS + 1), null)
})
