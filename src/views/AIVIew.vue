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
import { apiUrl } from '../utils/api'

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
const showStarter = computed(() => {
  return messages.value.length === 1 && messages.value[0]?.role === 'assistant'
})

const starterPrompts = [
  { label: '多工具编排', title: '查询北京天气并生成今日出行待办', query: '查询北京今天的天气，并根据天气情况帮我生成一份今日出行待办。' },
  { label: '知识库问答', title: '基于我的文档回答并标注来源', query: '请检索我的知识库，总结最重要的三点，并标注引用来源。' },
  { label: '任务执行', title: '拆解目标并写入任务中心', query: '把“本周完成项目面试准备”拆成可执行的待办事项，并添加到任务中心。' }
]

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
  chatStore.saveToStorage()
  nextTick(scrollToBottom)
}

const handleSwitchSession = (id) => {
  chatStore.setCurrentSession(id)
  nextTick(scrollToBottom)
}

const handleDeleteSession = (id) => {
  chatStore.deleteSession(id)
  chatStore.saveToStorage()
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
      apiUrl('/api/chat'),
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
      apiUrl('/api/chat'),
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
    <div class="session-bar">
      <div class="session-list">
        <div v-for="session in sessionList" :key="session.id"
          :class="['session-tab', session.id === chatStore.currentSessionId ? 'active' : '']"
          @click="handleSwitchSession(session.id)">
          <span class="session-indicator"></span>
          <span class="session-title">{{ session.title || '会话' }}</span>
          <span class="session-close" title="删除会话" @click.stop="handleDeleteSession(session.id)">×</span>
        </div>
      </div>
      <button class="session-add" @click="handleCreateSession">+ 新建会话</button>
    </div>

    <section v-if="showStarter" class="starter-panel">
      <div class="starter-badge"><span></span> AGENT READY</div>
      <h2>从一个真实任务开始</h2>
      <p>Agent 会自主选择工具、检索你的私有知识，并在执行过程中展示调用状态和引用来源。</p>
      <div class="prompt-grid">
        <button v-for="prompt in starterPrompts" :key="prompt.label" class="prompt-card" @click="inputMessage = prompt.query">
          <span>{{ prompt.label }}</span>
          <strong>{{ prompt.title }}</strong>
          <small>填入输入框 →</small>
        </button>
      </div>
      <div class="governance-line">
        <span>参数校验</span><i></i><span>身份隔离</span><i></i><span>超时降级</span><i></i><span>全链路指标</span>
      </div>
    </section>

    <VirtualList
      v-else
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
                {{ item.status === 'running' ? '执行中...' : item.status === 'error' ? '失败' : '完成' }}
              </span>
              <span v-if="item.result && item.status !== 'running'" class="tool-result">{{ item.result }}</span>
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

    <div v-if="isGenerating" class="typing-bar">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
      <span class="typing-text">Agent 正在规划并执行任务…</span>
    </div>

    <div class="input-area">
      <div class="composer">
        <el-input v-model="inputMessage" placeholder="描述你想完成的任务，Agent 会自动规划并选择工具…" @keyup.enter.exact="sendMessage" :disabled="isGenerating"
          type="textarea" :rows="2" resize="none" />
        <div class="composer-footer">
          <span>Enter 发送 · Shift + Enter 换行 · 支持中途停止</span>
          <el-button v-if="!isGenerating" type="primary" @click="sendMessage"
            :disabled="!inputMessage.trim()" :icon="ChatDotRound">
            交给 Agent
          </el-button>
          <el-button v-else type="danger" @click="handleStop" :icon="Close">
            停止生成
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  background: radial-gradient(circle at 50% 10%, #f9fbff 0, #f4f7fb 55%, #f1f5f9 100%);
}

.session-bar {
  display: flex;
  align-items: center;
  min-height: 58px;
  gap: 12px;
  padding: 10px 22px;
  background-color: #ffffff;
  border-bottom: 1px solid #e7edf4;
}

.session-list {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
}

.session-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  padding: 7px 10px;
  border-radius: 9px;
  border: 1px solid #e5e7eb;
  background-color: #f8fafc;
  color: #526071;
  font-size: 13px;
  cursor: pointer;
}

.session-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.session-indicator { flex: 0 0 auto; width: 6px; height: 6px; border-radius: 50%; background: #a8b2bf; }

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
  background-color: #eef5ff;
  color: #1558a6;
  border-color: #b8d4f7;
}
.session-tab.active .session-indicator { background: #2f80ed; box-shadow: 0 0 0 3px rgba(47,128,237,.12); }

.session-add {
  margin-left: auto;
  flex: 0 0 auto;
  padding: 8px 13px;
  border-radius: 9px;
  border: 1px solid #d8e2ed;
  background-color: #fff;
  color: #2769b2;
  cursor: pointer;
}
.session-add:hover { border-color: #77a9e4; background: #f4f8fd; }

.starter-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: min(900px, calc(100% - 48px));
  margin: 0 auto;
  padding: 34px 0;
}
.starter-badge { display: flex; align-items: center; justify-content: center; gap: 8px; color: #5f7991; font-size: 10px; letter-spacing: .16em; }
.starter-badge span { width: 7px; height: 7px; border-radius: 50%; background: #19b97a; box-shadow: 0 0 0 4px rgba(25,185,122,.12); }
.starter-panel h2 { margin-top: 15px; color: #14243a; font-size: clamp(26px, 3vw, 36px); text-align: center; }
.starter-panel > p { max-width: 660px; margin: 10px auto 28px; color: #738194; line-height: 1.7; text-align: center; }
.prompt-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.prompt-card { display: flex; flex-direction: column; min-height: 142px; padding: 18px; border: 1px solid #dfe7f0; border-radius: 13px; background: rgba(255,255,255,.9); text-align: left; cursor: pointer; box-shadow: 0 7px 22px rgba(31,49,70,.04); transition: .2s ease; }
.prompt-card:hover { border-color: #91bced; transform: translateY(-2px); box-shadow: 0 10px 26px rgba(31,83,140,.1); }
.prompt-card > span { align-self: flex-start; padding: 3px 7px; border-radius: 5px; color: #2769b2; background: #edf5ff; font-size: 10px; }
.prompt-card strong { margin-top: 14px; color: #23344a; font-size: 14px; line-height: 1.5; }
.prompt-card small { margin-top: auto; color: #8c9aaa; }
.governance-line { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 22px; color: #8896a6; font-size: 11px; }
.governance-line i { width: 3px; height: 3px; border-radius: 50%; background: #b8c3ce; }

.chat-messages {
  flex: 1;
  min-height: 0;
  position: relative;
  background: transparent;
}

.message-item {
  width: min(960px, calc(100% - 40px));
  padding: 12px 0;
  margin: 0 auto;
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
  max-width: 78%;
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
  padding: 8px max(20px, calc((100% - 960px) / 2));
  background-color: transparent;
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
  padding: 14px 22px 18px;
  background: rgba(255,255,255,.92);
  border-top: 1px solid #e5ebf2;
  backdrop-filter: blur(10px);
}

.composer { width: min(960px, 100%); margin: 0 auto; padding: 8px 9px 8px 14px; border: 1px solid #dce5ef; border-radius: 14px; background: #fff; box-shadow: 0 8px 24px rgba(31,49,70,.07); }

.input-area :deep(.el-textarea__inner) {
  padding: 8px 4px;
  border: none;
  box-shadow: none;
  resize: none;
  font-size: 15px;
}

.composer-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-top: 7px; border-top: 1px solid #edf1f5; }
.composer-footer > span { color: #9aa6b3; font-size: 11px; }
.input-area :deep(.el-button) {
  border-radius: 9px;
  padding: 8px 24px;
  font-size: 14px;
  background-color: #276fbd;
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
.tool-status.error { color: #dc2626; }

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

@media (max-width: 820px) {
  .prompt-grid { grid-template-columns: 1fr; }
  .prompt-card { min-height: 105px; }
  .governance-line { flex-wrap: wrap; }
  .starter-panel { justify-content: flex-start; overflow-y: auto; }
  .message-content, .tool-call-bubble { max-width: 90%; }
  .composer-footer > span { display: none; }
  .composer-footer { justify-content: flex-end; }
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
