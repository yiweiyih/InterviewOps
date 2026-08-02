import { reactive, ref, computed, watch } from 'vue'
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
            messages: [
                {
                    id: Date.now(),
                    role: 'assistant',
                    content: '你好！我是你的AI助手，有什么可以帮助你的吗？',
                    timestamp: new Date().toLocaleString()
                }
            ]
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
            if (!first.done) {
                currentSessionId.value = first.value
            } else {
                currentSessionId.value = null
            }
        }
    }

    const initFromStorage = () => {
        // 已有数据说明不是首次初始化，不覆盖
        if (sessions.size > 0) return

        const raw = localStorage.getItem(getStorageKey())
        if (raw) {
            try {
        const arr = JSON.parse(raw)
                if (Array.isArray(arr)) {
                    arr.forEach(([id, session]) => {
                        sessions.set(id, session)
                    })
                }
            } catch (e) {
                console.error('加载会话历史失败:', e)
            }
        }

        if (sessions.size === 0) {
            createSession()
        } else if (!currentSessionId.value) {
            const first = sessions.keys().next()
            if (!first.done) {
                currentSessionId.value = first.value
            }
        }
    }

    const saveToStorage = () => {
        try {
            const arr = Array.from(sessions.entries())
            localStorage.setItem(getStorageKey(), JSON.stringify(arr))
        } catch (e) {
            console.error('保存会话历史失败:', e)
        }
    }

    let saveTimeout = null
    // 移除 watch 自动保存，改为由调用方在合适时机手动调 saveToStorage
    // 避免流式过程中频繁保存中间状态导致历史消息重复

    const upsertToolCall = ({ name, status, input, result }) => {
      const session = currentSession.value
      if (!session) return
      const msgs = session.messages
      // 找到同名且还在 running 状态的气泡，有则更新，无则插入
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
