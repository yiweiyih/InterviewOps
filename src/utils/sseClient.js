import { createSseParser } from './sseParser'
import { getAuthToken } from './api'

const MAX_ATTEMPTS = 3
const BASE_DELAY = 500
const MAX_DELAY = 8000

function calcBackoffDelay(attempt) {
  const delay = BASE_DELAY * Math.pow(2, attempt - 1)
  return Math.min(delay, MAX_DELAY)
}

export async function streamChat(url, messages, onChunk, signal, onCitations, onToolCall, onPlanProgress) {
  let attempt = 0

  while (true) {
    attempt++
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({ messages }),
        signal
      })

      if (!response.ok) {
        const error = new Error(response.status === 401 ? '登录状态已失效，请重新登录' : `请求失败（HTTP ${response.status}）`)
        error.retryable = response.status === 408 || response.status === 429 || response.status >= 500
        throw error
      }

      if (!response.body) throw new Error('浏览器不支持流式响应')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let completed = false
      const parser = createSseParser(({ event, data }) => {
        if (data === '[DONE]') {
          completed = true
          return
        }

        let json
        try {
          json = JSON.parse(data)
        } catch {
          console.warn('[sseClient] 忽略无法解析的 SSE 数据')
          return
        }

        if (event === 'citations') {
          onCitations?.(json)
          return
        }
        if (event === 'tool_call') {
          onToolCall?.(json)
          return
        }
        if (event === 'plan_progress') {
          onPlanProgress?.(json)
          return
        }
        if (json.error) throw new Error(json.error)

        const content = json.content || json.choices?.[0]?.delta?.content || ''
        if (content) onChunk(content)
      })

      while (!completed) {
        const { done, value } = await reader.read()
        if (done) break
        parser.feed(decoder.decode(value, { stream: true }))
      }

      parser.feed(decoder.decode())
      parser.finish()
      if (completed) await reader.cancel()

      return
    } catch (err) {
      if (err.name === 'AbortError') throw err

      const isNetworkError = err instanceof TypeError
      if ((!err.retryable && !isNetworkError) || attempt >= MAX_ATTEMPTS) {
        throw err
      }

      const delay = calcBackoffDelay(attempt)
      console.warn(`[sseClient] 第 ${attempt} 次请求失败，${delay}ms 后重试`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}
