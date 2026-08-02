const MAX_RETRIES = 3
const BASE_DELAY = 500
const MAX_DELAY = 8000

function calcBackoffDelay(attempt) {
  const delay = BASE_DELAY * Math.pow(2, attempt - 1)
  return Math.min(delay, MAX_DELAY)
}

export async function streamChat(url, messages, onChunk, signal, onCitations, onToolCall) {
  let attempt = 0

  while (true) {
    attempt++
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(() => { try { return JSON.parse(localStorage.getItem('auth-user'))?.token || '' } catch { return '' } })()}`
        },
        body: JSON.stringify({ messages }),
        signal
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let eventType = 'message'
      let lastLineWasEmpty = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          // 空行 = 事件块结束，重置 eventType
          if (line === '') {
            if (lastLineWasEmpty) eventType = 'message'
            lastLineWasEmpty = true
            continue
          }
          lastLineWasEmpty = false

          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
            continue
          }
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') { reader.cancel(); return }

          try {
            const json = JSON.parse(data)
            if (eventType === 'citations') {
              if (onCitations) onCitations(json)
              eventType = 'message'
              continue
            }
            if (eventType === 'tool_call') {
              console.log('[sseClient] tool_call event:', json)
              if (onToolCall) onToolCall(json)
              eventType = 'message'
              continue
            }
            if (json.error) throw new Error(json.error)
            const content = json.content || json.choices?.[0]?.delta?.content || ''
            if (content) onChunk(content)
          } catch (parseErr) {
            console.warn('[sseClient] 解析 chunk 失败:', parseErr)
          }
        }
      }

      return
    } catch (err) {
      if (err.name === 'AbortError') throw err

      if (attempt > MAX_RETRIES) {
        throw new Error(`请求失败，已重试 ${MAX_RETRIES} 次: ${err.message}`)
      }

      const delay = calcBackoffDelay(attempt)
      console.warn(`[sseClient] 第 ${attempt} 次失败，${delay}ms 后重试...`, err.message)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}
