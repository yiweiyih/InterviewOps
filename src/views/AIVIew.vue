<script setup>
import { ref, watch, onMounted, nextTick, computed, defineAsyncComponent } from 'vue'
import { ChatDotRound, Close } from '@element-plus/icons-vue'
import VirtualList from '../components/VirtualList.vue'

const MarkdownRenderer = defineAsyncComponent(() =>
  import('../components/MarkdownRenderer.vue')
)
import { ElMessage } from 'element-plus'
import { useChatStore } from '../stores/chat'
import { useTodoStore } from '../stores/todo'
import { streamChat } from '../utils/sseClient'

const chatStore = useChatStore()
const todoStore = useTodoStore()

const messages = computed(() => {
  const session = chatStore.currentSession
  return session ? session.messages : []
})

const inputMessage = ref('')
const scroller = ref(null)
const isGenerating = ref(false)
const sessionList = computed(() => Array.from(chatStore.sessions.values()))

let abortController = null
let saveTimer = null
let chunkBuffer = ''
let flushTimer = null

const handleStop = () => {
  if (abortController) abortController.abort()
}

const throttledSave = () => {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    chatStore.saveToStorage()
    saveTimer = null
  }, 500)
}

const handleCreateSession = () => {
  chatStore.createSession()
  nextTick(scrollToBottom)
}

const handleSwitchSession = (id) => {
  chatStore.setCurrentSession(id)
  nextTick(scrollToBottom)
}

const scrollToBottom = () => {
  if (scroller.value) scroller.value.scrollToBottom()
}

// 监听消息内容变化，DOM 更新后自动滚到底部
watch(
  () => {
    const msgs = chatStore.currentSession?.messages
    return msgs?.[msgs.length - 1]?.content
  },
  () => scrollToBottom(),
  { flush: 'post' }
)

// 发送消息
const sendMessage = async () => {
  if (!inputMessage.value.trim() || isGenerating.value) return

  chatStore.addUserMessage(inputMessage.value.trim())
  inputMessage.value = ''
  isGenerating.value = true

  // 滑动窗口：只取最近 20 条，过滤工具调用气泡和空 assistant 消息，避免污染上下文
  const WINDOW_SIZE = 20
  const apiMessages = messages.value
    .filter(m => m.type !== 'tool_call' && m.content !== '')
    .slice(-WINDOW_SIZE)
    .map(msg => ({ role: msg.role, content: msg.content }))

  const aiReply = chatStore.startAssistantMessage()
  if (aiReply) aiReply.status = 'interrupted'
  chatStore.saveToStorage()

  const onChunk = (content) => {
    if (!aiReply) return
    chunkBuffer += content
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        aiReply.content += chunkBuffer
        chunkBuffer = ''
        flushTimer = null
        throttledSave()
      }, 50)
    }
  }

  const onCitations = (citations) => {
    if (aiReply) aiReply.citations = citations
  }

  const onToolCall = (data) => {
    chatStore.upsertToolCall(data)
  }

  abortController = new AbortController()

  try {
    await streamChat(
      'http://localhost:3001/api/chat',
      apiMessages,
      onChunk,
      abortController.signal,
      onCitations,
      onToolCall
    )
    if (aiReply) aiReply.status = 'done'
  } catch (err) {
    if (err.name !== 'AbortError') {
      ElMessage.error(err.message || '获取AI回复失败，请稍后重试')
    }
  } finally {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
    if (chunkBuffer && aiReply) { aiReply.content += chunkBuffer; chunkBuffer = '' }
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
    chatStore.saveToStorage()
    abortController = null
    isGenerating.value = false
    scrollToBottom()
    await todoStore.fetchTodos()
  }
}

const handleRegenerate = async (msgId) => {
  const session = chatStore.currentSession
  if (!session || isGenerating.value) return

  const idx = session.messages.findIndex(m => m.id === msgId)
  if (idx !== -1) session.messages.splice(idx, 1)

  isGenerating.value = true

  const WINDOW_SIZE = 20
  const apiMessages = session.messages
    .filter(m => m.type !== 'tool_call' && m.content !== '')
    .slice(-WINDOW_SIZE)
    .map(msg => ({ role: msg.role, content: msg.content }))

  const aiReply = chatStore.startAssistantMessage()
  if (aiReply) aiReply.status = 'interrupted'
  chatStore.saveToStorage()

  const onChunk = (content) => {
    if (!aiReply) return
    chunkBuffer += content
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        aiReply.content += chunkBuffer
        chunkBuffer = ''
        flushTimer = null
        throttledSave()
      }, 50)
    }
  }

  abortController = new AbortController()

  try {
    await streamChat(
      'http://localhost:3001/api/chat',
      apiMessages,
      onChunk,
      abortController.signal,
      null,
      (data) => chatStore.upsertToolCall(data)
    )
    if (aiReply) aiReply.status = 'done'
  } catch (err) {
    if (err.name !== 'AbortError') {
      ElMessage.error(err.message || '重新生成失败，请稍后重试')
    }
  } finally {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
    if (chunkBuffer && aiReply) { aiReply.content += chunkBuffer; chunkBuffer = '' }
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
    chatStore.saveToStorage()
    abortController = null
    isGenerating.value = false
    scrollToBottom()
  }
}

onMounted(() => {
  chatStore.initFromStorage()
  nextTick(scrollToBottom)
})
</script>

<template>
  <div class="chat-container">
    <!-- 会话切换 -->
    <div class="session-bar">
      <div v-for="session in sessionList" :key="session.id"
        :class="['session-tab', session.id === chatStore.currentSessionId ? 'active' : '']"
        @click="handleSwitchSession(session.id)">
        {{ session.title || '会话' }}
        <span class="session-close" @click.stop="chatStore.deleteSession(session.id)">×</span>
      </div>
      <button class="session-add" @click="handleCreateSession">+ 新建会话</button>
    </div>

    <!-- 聊天消息列表 -->
    <VirtualList
      ref="scroller"
      class="chat-messages"
      :items="messages"
      :estimated-item-height="80"
    >
      <template #default="{ item }">
        <div :class="['message-item', item.type === 'tool_call' ? 'tool-call-item' : item.role === 'assistant' ? 'ai-message' : 'user-message']">
            <!-- 工具调用气泡 -->
            <div v-if="item.type === 'tool_call'" class="tool-call-bubble">
              <span class="tool-icon">🔧</span>
              <span class="tool-name">{{ item.name }}</span>
              <span v-if="item.input" class="tool-input">{{ item.input }}</span>
              <span :class="['tool-status', item.status]">
                {{ item.status === 'running' ? '执行中...' : '完成' }}
              </span>
              <span v-if="item.result && item.status === 'done'" class="tool-result">{{ item.result }}</span>
            </div>
            <Suspense v-else-if="item.role === 'assistant'">
              <template #default>
                <MarkdownRenderer :content="item.content" class="message-content" />
              </template>
              <template #fallback>
                <div class="message-content message-loading">加载中...</div>
              </template>
            </Suspense>
            <!-- 中断提示 -->
            <div v-if="item.role === 'assistant' && item.status === 'interrupted' && !isGenerating" class="regenerate-bar">
              <span class="interrupted-tip">生成被中断</span>
              <el-button size="small" type="primary" plain @click="handleRegenerate(item.id)">重新生成</el-button>
            </div>
            <!-- 引用来源卡片 -->
            <div v-if="item.citations && item.citations.length" class="citations">
              <div class="citations-title">引用来源</div>
              <div v-for="(c, i) in item.citations" :key="i" class="citation-item">
                <div class="citation-header">
                  <span class="citation-source">📄 {{ c.source }}</span>
                  <span class="citation-score">相关度 {{ c.score }}</span>
                </div>
                <div class="citation-text">{{ c.text }}</div>
              </div>
            </div>
            <div class="message-content" v-else-if="item.role !== 'assistant'">{{ item.content }}</div>
        </div>
      </template>
    </VirtualList>

    <!-- 正在输入指示器 -->
    <div v-if="isGenerating" class="typing-bar">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
      <span class="typing-text">正在思考...</span>
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <el-input v-model="inputMessage" placeholder="请输入消息..." @keyup.enter.exact="sendMessage" :disabled="isGenerating"
        type="textarea" :rows="3" resize="none" />
      <el-button v-if="!isGenerating" type="primary" @click="sendMessage"
        :disabled="!inputMessage.trim()" :icon="ChatDotRound">
        发送
      </el-button>
      <el-button v-else type="danger" @click="handleStop" :icon="Close">
        停止生成
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #f5f5f5;
}

.session-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background-color: #ffffff;
  border-bottom: 1px solid #e8e8e8;
}

.session-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background-color: #f9fafb;
  font-size: 13px;
  cursor: pointer;
}

.session-close {
  font-size: 15px;
  line-height: 1;
  color: #9ca3af;
  border-radius: 50%;
  padding: 0 2px;
}
.session-close:hover {
  color: #ef4444;
  background-color: #fee2e2;
}

.session-tab.active {
  background-color: #0284c7;
  color: #ffffff;
  border-color: #0284c7;
}

.session-add {
  margin-left: auto;
  padding: 6px 12px;
  border-radius: 12px;
  border: 1px dashed #0284c7;
  background-color: #eff6ff;
  color: #0284c7;
  cursor: pointer;
}

.chat-messages {
  flex: 1;
  min-height: 0;
  position: relative;
  background-color: #fafafa;
}

.message-item {
  padding: 10px 20px;
  margin-bottom: 0;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.ai-message { justify-content: flex-start; }
.user-message { justify-content: flex-end; }

.message-content {
  max-width: 70%;
  padding: 14px 18px;
  border-radius: 18px;
  font-size: 15px;
  line-height: 1.5;
  word-wrap: break-word;
}

.ai-message .message-content {
  background-color: #fff;
  border: 1px solid #e8e8e8;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.ai-message .message-content :deep(p) {
  margin: 0 0 8px 0;
}
.ai-message .message-content :deep(p:last-child) {
  margin-bottom: 0;
}
.ai-message .message-content :deep(h1),
.ai-message .message-content :deep(h2),
.ai-message .message-content :deep(h3) {
  margin: 12px 0 6px 0;
  font-weight: 600;
}
.ai-message .message-content :deep(ul),
.ai-message .message-content :deep(ol) {
  padding-left: 20px;
  margin: 6px 0;
}
.ai-message .message-content :deep(li) {
  margin: 4px 0;
}
.ai-message .message-content :deep(code) {
  background-color: #f3f4f6;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
}
.ai-message .message-content :deep(pre) {
  background-color: #1e1e1e;
  color: #d4d4d4;
  padding: 14px 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}
.ai-message .message-content :deep(pre code) {
  background: none;
  padding: 0;
  color: inherit;
  font-size: 13px;
}
.ai-message .message-content :deep(blockquote) {
  border-left: 3px solid #0284c7;
  padding-left: 12px;
  color: #666;
  margin: 8px 0;
}
.ai-message .message-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
}
.ai-message .message-content :deep(th),
.ai-message .message-content :deep(td) {
  border: 1px solid #e5e7eb;
  padding: 6px 12px;
  text-align: left;
}
.ai-message .message-content :deep(th) {
  background-color: #f9fafb;
  font-weight: 600;
}
.ai-message .message-content :deep(hr) {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 12px 0;
}

.user-message .message-content {
  background-color: #0284c7;
  color: white;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.typing-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 20px;
  background-color: #fafafa;
}

.typing-indicator {
  display: flex;
  gap: 4px;
}

.typing-dot {
  width: 8px;
  height: 8px;
  background-color: #0284c7;
  border-radius: 50%;
  animation: typing 1.4s infinite ease-in-out;
}

.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }

.typing-text {
  color: #666;
  font-style: italic;
}

@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30% { transform: translateY(-10px); opacity: 1; }
}

.input-area {
  padding: 20px;
  background-color: #fff;
  border-top: 1px solid #e8e8e8;
}

.input-area :deep(.el-textarea__inner) {
  border-radius: 12px;
  border-color: #e8e8e8;
  resize: none;
  font-size: 15px;
}

.input-area :deep(.el-button) {
  margin-top: 12px;
  border-radius: 12px;
  padding: 8px 24px;
  font-size: 15px;
  background-color: #0284c7;
  border: none;
}

.input-area :deep(.el-button:hover) { background-color: #0ea5e9; }

.input-area :deep(.el-button.is-disabled) {
  background-color: #93c5fd;
  cursor: not-allowed;
}

.tool-call-item {
  justify-content: flex-start;
}

.tool-call-bubble {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 14px;
  background-color: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 12px;
  font-size: 13px;
  color: #0369a1;
  max-width: 70%;
}

.tool-icon { font-size: 14px; }
.tool-name { font-weight: 600; }
.tool-input { color: #64748b; }

.tool-status.running {
  color: #d97706;
  animation: pulse 1.2s infinite;
}
.tool-status.done { color: #16a34a; }

.tool-result {
  width: 100%;
  color: #374151;
  font-size: 12px;
  border-top: 1px solid #bae6fd;
  padding-top: 4px;
  margin-top: 2px;
  word-break: break-all;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.regenerate-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 4px 0;
}

.interrupted-tip {
  font-size: 12px;
  color: #f59e0b;
}

.citations {
  margin-top: 8px;
  border-top: 1px solid #e5e7eb;
  padding-top: 8px;
  max-width: 480px;
}
.citations-title {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
  font-weight: 500;
}
.citation-item {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 6px;
  font-size: 12px;
}
.citation-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}
.citation-source { color: #3b82f6; font-weight: 500; }
.citation-score { color: #9ca3af; }
.citation-text {
  color: #4b5563;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
