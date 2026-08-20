import { reactive, ref, computed } from 'vue'
import { defineStore } from 'pinia'

let idSequence = 0

export function createChatId(prefix) {
  idSequence += 1
  return `${prefix}-${Date.now().toString(36)}-${idSequence.toString(36)}`
}

function normalizeToolCalls(toolCalls = [], sessionId, messageIndex) {
  const usedIds = new Set()
  return toolCalls.map((toolCall, toolIndex) => {
    const originalId = toolCall.callId || toolCall.id
    let id = originalId ? String(originalId) : `${sessionId}-tool-${messageIndex}-${toolIndex}`
    while (usedIds.has(id)) id = `${id}-${toolIndex}`
    usedIds.add(id)
    return { ...toolCall, id }
  })
}

export function normalizeSessionMessages(messages = [], sessionId = 'session') {
  const normalized = []
  const usedIds = new Set()

  for (const [index, message] of messages.entries()) {
    if (!message || typeof message !== 'object') continue

    // 兼容旧数据：工具调用曾被保存成独立消息，加载时归入上一条教练回答。
    if (message.type === 'tool_call') {
      const assistant = [...normalized].reverse().find(item => item.role === 'assistant')
      if (assistant) {
        assistant.toolCalls = normalizeToolCalls(
          [...(assistant.toolCalls || []), message],
          sessionId,
          index
        )
      }
      continue
    }

    const originalId = message.id === undefined || message.id === null
      ? ''
      : String(message.id)
    let id = originalId
    if (!id || usedIds.has(id)) id = `${sessionId}-message-${index}`
    while (usedIds.has(id)) id = `${id}-${index}`
    usedIds.add(id)

    normalized.push({
      ...message,
      id,
      ...(message.toolCalls?.length
        ? { toolCalls: normalizeToolCalls(message.toolCalls, sessionId, index) }
        : {})
    })
  }

  return normalized
}

function getStorageKey() {
  try {
    const stored = JSON.parse(localStorage.getItem('auth-user'))
    const uid = stored?.userId || 'guest'
    return `chat-sessions-v1-${uid}`
  } catch {
    return 'chat-sessions-v1-guest'
  }
}

export const useChatStore = defineStore('chat', () => {
  const sessions = reactive(new Map())
  const currentSessionId = ref(null)

  const currentSession = computed(() => {
    if (!currentSessionId.value) return null
    return sessions.get(currentSessionId.value) || null
  })

  const createSession = () => {
    const id = createChatId('session')
    const session = {
      id,
      title: '新对话',
      messages: [{
        id: createChatId('message'),
        role: 'assistant',
        content: '你好，我是 InterviewOps 备战教练。我可以结合你的简历、JD 和项目资料做表达诊断、项目追问、公司调研，并把改进项写入提升计划。',
        timestamp: new Date().toLocaleString()
      }]
    }
    sessions.set(id, session)
    currentSessionId.value = id
  }

  const setCurrentSession = (id) => {
    if (sessions.has(id)) {
      currentSessionId.value = id
    }
  }

  const addUserMessage = (content) => {
    const session = currentSession.value
    if (!session) return
    if (session.title === '新对话') {
      session.title = content.length > 16 ? `${content.slice(0, 16)}…` : content
    }
    session.messages.push({
      id: createChatId('message'),
      role: 'user',
      content,
      timestamp: new Date().toLocaleString()
    })
  }

  const startAssistantMessage = () => {
    const session = currentSession.value
    if (!session) return null
    const msg = {
      id: createChatId('message'),
      role: 'assistant',
      content: '',
      toolCalls: [],
      timestamp: new Date().toLocaleString()
    }
    session.messages.push(msg)
    return session.messages[session.messages.length - 1]
  }

  const deleteSession = (id) => {
    if (!sessions.has(id)) return
    sessions.delete(id)
    if (currentSessionId.value === id) {
      const first = sessions.keys().next()
      if (!first.done) currentSessionId.value = first.value
      else createSession()
    }
  }

  const initFromStorage = () => {
    if (sessions.size > 0) return

    const raw = localStorage.getItem(getStorageKey())
    if (raw) {
      try {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) {
          arr.forEach(([id, session]) => {
            if (!session || typeof session !== 'object') return
            sessions.set(id, {
              ...session,
              messages: normalizeSessionMessages(session.messages, id)
            })
          })
        }
      } catch (error) {
        console.error('加载会话历史失败:', error)
      }
    }

    if (sessions.size === 0) {
      createSession()
    } else if (!currentSessionId.value) {
      const first = sessions.keys().next()
      if (!first.done) currentSessionId.value = first.value
    }
  }

  const saveToStorage = () => {
    try {
      const arr = Array.from(sessions.entries())
      localStorage.setItem(getStorageKey(), JSON.stringify(arr))
    } catch (error) {
      console.error('保存会话历史失败:', error)
    }
  }

  const upsertToolCall = (
    { callId, name, status, input, result },
    sessionId = currentSessionId.value,
    assistantMessageId
  ) => {
    const session = sessions.get(sessionId)
    if (!session) return
    const assistant = assistantMessageId
      ? session.messages.find(message => message.id === assistantMessageId)
      : [...session.messages].reverse().find(message => message.role === 'assistant')
    if (!assistant) return

    assistant.toolCalls ||= []
    const existing = callId
      ? assistant.toolCalls.find(toolCall => toolCall.id === callId)
      : [...assistant.toolCalls].reverse().find(toolCall => toolCall.name === name && toolCall.status === 'running')

    if (existing) {
      existing.status = status
      if (input !== undefined) existing.input = input
      if (result !== null) existing.result = result
    } else {
      assistant.toolCalls.push({
        id: callId || createChatId('tool'),
        name,
        status,
        input,
        result
      })
    }
  }

  const reset = () => {
    sessions.clear()
    currentSessionId.value = null
  }

  return {
    sessions,
    currentSessionId,
    currentSession,
    createSession,
    setCurrentSession,
    addUserMessage,
    startAssistantMessage,
    deleteSession,
    initFromStorage,
    saveToStorage,
    upsertToolCall,
    reset
  }
})
