const STORAGE_KEY = 'interview-ops-active-agent-run-v1'
export const ACTIVE_RUN_MAX_AGE_MS = 35 * 60 * 1000

function getStorage(storage) {
  return storage === undefined ? globalThis.sessionStorage : storage
}

export function clearActiveRun(storage) {
  try {
    getStorage(storage)?.removeItem(STORAGE_KEY)
  } catch {
    // Storage may be disabled by the browser.
  }
}

export function saveActiveRun(state, storage, now = Date.now()) {
  if (!state?.requestId || !state?.sessionId || !state?.assistantMessageId) return
  try {
    getStorage(storage)?.setItem(STORAGE_KEY, JSON.stringify({
      requestId: state.requestId,
      runId: state.runId || null,
      lastSeq: Math.max(0, Number(state.lastSeq) || 0),
      sessionId: state.sessionId,
      assistantMessageId: state.assistantMessageId,
      refreshTodos: Boolean(state.refreshTodos),
      updatedAt: now
    }))
  } catch {
    // Streaming still works when storage is unavailable; only refresh recovery is lost.
  }
}

export function loadActiveRun(storage, now = Date.now()) {
  const target = getStorage(storage)
  try {
    const state = JSON.parse(target?.getItem(STORAGE_KEY) || 'null')
    const valid = state
      && typeof state.requestId === 'string'
      && typeof state.sessionId === 'string'
      && typeof state.assistantMessageId === 'string'
      && Number.isFinite(Number(state.updatedAt))
      && now - Number(state.updatedAt) <= ACTIVE_RUN_MAX_AGE_MS

    if (!valid) {
      clearActiveRun(target)
      return null
    }

    return {
      ...state,
      runId: typeof state.runId === 'string' && state.runId ? state.runId : null,
      lastSeq: Math.max(0, Number(state.lastSeq) || 0),
      refreshTodos: Boolean(state.refreshTodos)
    }
  } catch {
    clearActiveRun(target)
    return null
  }
}
