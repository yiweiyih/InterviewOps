import { createSseParser } from './sseParser.js'
import { getAuthToken } from './api.js'

const MAX_CREATE_ATTEMPTS = 3
const MAX_RECONNECT_ATTEMPTS = 5
const BASE_DELAY = 1000
const MAX_DELAY = 30000

function calcBackoffDelay(attempt) {
  const delay = Math.min(BASE_DELAY * Math.pow(2, attempt - 1), MAX_DELAY)
  return delay + Math.floor(Math.random() * 250)
}

function createRequestId() {
  return globalThis.crypto?.randomUUID?.()
    || 'request-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
}

function wait(delay, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delay)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      const error = new Error('任务已取消')
      error.name = 'AbortError'
      reject(error)
    }, { once: true })
  })
}

function buildHttpError(response, data = {}) {
  const error = new Error(
    response.status === 401
      ? '登录状态已失效，请重新登录'
      : data.error || '请求失败（HTTP ' + response.status + '）'
  )
  error.retryable = response.status === 408 || response.status === 429 || response.status >= 500
  return error
}

async function createRun(url, messages, requestId, signal) {
  let attempt = 0
  while (attempt < MAX_CREATE_ATTEMPTS) {
    attempt++
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + getAuthToken(),
          'Idempotency-Key': requestId
        },
        body: JSON.stringify({ messages, requestId }),
        signal
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw buildHttpError(response, data)
      if (!data.runId) throw new Error('服务端未返回 runId')
      return data
    } catch (error) {
      if (error.name === 'AbortError') throw error
      const networkError = error instanceof TypeError
      if ((!networkError && !error.retryable) || attempt >= MAX_CREATE_ATTEMPTS) throw error
      await wait(calcBackoffDelay(attempt), signal)
    }
  }
}

async function cancelRun(url, runId) {
  try {
    await fetch(url + '/' + encodeURIComponent(runId) + '/cancel', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + getAuthToken() },
      keepalive: true
    })
  } catch {
    // Best effort: cancellation must not hide the original AbortError.
  }
}

async function consumeEvents(url, runId, state, handlers, signal) {
  const response = await fetch(url + '/' + encodeURIComponent(runId) + '/events', {
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + getAuthToken(),
      'Last-Event-ID': String(state.lastSeq)
    },
    signal
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw buildHttpError(response, data)
  }
  if (!response.body) throw new Error('浏览器不支持流式响应')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let completed = false
  let terminalError = null

  const parser = createSseParser(({ event, data, id }) => {
    const seq = Number(id)
    if (Number.isFinite(seq)) {
      if (seq <= state.lastSeq) return
      state.lastSeq = seq
    }

    let json
    try {
      json = JSON.parse(data)
    } catch {
      console.warn('[sseClient] 忽略无法解析的 SSE 数据')
      return
    }

    if (event === 'done') {
      completed = true
      return
    }
    if (event === 'error' || json.error) {
      terminalError = new Error(json.error || '任务执行失败')
      completed = true
      return
    }
    if (event === 'citations') return handlers.onCitations?.(json)
    if (event === 'tool_call') return handlers.onToolCall?.(json)
    if (event === 'plan_progress') return handlers.onPlanProgress?.(json)

    const content = json.content || json.choices?.[0]?.delta?.content || ''
    if (content) handlers.onChunk(content)
  })

  while (!completed) {
    const result = await reader.read()
    if (result.done) break
    parser.feed(decoder.decode(result.value, { stream: true }))
  }
  parser.feed(decoder.decode())
  parser.finish()
  if (completed) await reader.cancel().catch(() => {})
  if (terminalError) throw terminalError
  if (completed) return

  const error = new Error('SSE 连接中断，正在续传')
  error.retryable = true
  throw error
}

export async function streamChat(
  url,
  messages,
  onChunk,
  signal,
  onCitations,
  onToolCall,
  onPlanProgress
) {
  const requestId = createRequestId()
  let runId = null

  try {
    const created = await createRun(url, messages, requestId, signal)
    runId = created.runId
    const state = { lastSeq: 0 }
    const handlers = { onChunk, onCitations, onToolCall, onPlanProgress }
    let reconnectAttempt = 0

    while (true) {
      try {
        await consumeEvents(url, runId, state, handlers, signal)
        return
      } catch (error) {
        if (error.name === 'AbortError') throw error
        const networkError = error instanceof TypeError
        if ((!networkError && !error.retryable) || reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
          throw error
        }
        reconnectAttempt++
        const delay = calcBackoffDelay(reconnectAttempt)
        console.warn(
          '[sseClient] 连接中断，' + delay + 'ms 后从事件 ' + state.lastSeq + ' 继续'
        )
        await wait(delay, signal)
      }
    }
  } catch (error) {
    if (error.name === 'AbortError' && runId) await cancelRun(url, runId)
    throw error
  }
}
