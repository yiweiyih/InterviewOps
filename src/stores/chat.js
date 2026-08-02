import { reactive, ref, computed } from 'vue'
import { defineStore } from 'pinia'

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
    const id = `session-${Date.now()}`
    const session = {
      id,
      title: '新对话',
      messages: [{
        id: Date.now(),
        role: 'assistant',
        content: '你好，我是 Agentic RAG Assistant。你可以交给我需要检索知识、调用工具或拆解执行的任务。',
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
      id: Date.now(),
      role: 'user',
      content,
      timestamp: new Date().toLocaleString()
    })
  }

  const startAssistantMessage = () => {
    const session = currentSession.value
    if (!session) return null
    const msg = {
      id: Date.now(),
      role: 'assistant',
      content: '',
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
          arr.forEach(([id, session]) => sessions.set(id, session))
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

  const upsertToolCall = ({ name, status, input, result }) => {
    const session = currentSession.value
    if (!session) return
    const msgs = session.messages
    const existing = [...msgs].reverse().find(m => m.type === 'tool_call' && m.name === name && m.status === 'running')
    if (existing) {
      existing.status = status
      if (result !== null) existing.result = result
    } else {
      msgs.push({ id: Date.now(), type: 'tool_call', name, status, input, result })
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
