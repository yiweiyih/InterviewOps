<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ChatDotRound,
  Collection,
  Connection,
  DataAnalysis,
  DocumentChecked,
  Files,
  Monitor,
  SetUp,
  Timer
} from '@element-plus/icons-vue'
import { apiUrl, authHeaders } from '../utils/api'

const router = useRouter()
const loading = ref(true)
const error = ref('')
const dashboard = ref({
  service: { status: 'loading', version: '-', uptimeSeconds: 0 },
  tools: { total: 0 },
  knowledge: { documents: 0 },
  metrics: {
    toolExecutions: { total: 0, success: 0, error: 0 },
    rag: { queries: 0, hits: 0 },
    llm: { total: 0, inputTokens: 0, outputTokens: 0 }
  }
})

const ragHitRate = computed(() => {
  const { queries, hits } = dashboard.value.metrics.rag
  return queries ? `${Math.round((hits / queries) * 100)}%` : '待采样'
})

async function loadDashboard() {
  loading.value = true
  error.value = ''
  try {
    const response = await fetch(apiUrl('/api/dashboard'), { headers: authHeaders() })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '运行数据加载失败')
    dashboard.value = data
  } catch (loadError) {
    error.value = loadError.message
  } finally {
    loading.value = false
  }
}

onMounted(loadDashboard)
</script>

<template>
  <div class="dashboard-page">
    <section class="hero-panel">
      <div>
        <div class="status-line">
          <span :class="['status-dot', dashboard.service.status]"></span>
          {{ dashboard.service.status === 'ok' ? '所有核心服务运行正常' : '正在连接运行服务' }}
          <span class="version">v{{ dashboard.service.version }}</span>
        </div>
        <h1>让 Agent 的每一步都可执行、可追踪、可评测</h1>
        <p>融合多工具编排、用户级 RAG、长期记忆与流式交互，并用统一指标和回归集约束效果。</p>
      </div>
      <div class="hero-actions">
        <el-button type="primary" size="large" :icon="ChatDotRound" @click="router.push('/ai')">开始 Agent 对话</el-button>
        <el-button size="large" :icon="Collection" @click="router.push('/knowledge')">管理知识库</el-button>
      </div>
    </section>

    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="dashboard-alert" />

    <section v-loading="loading" class="stats-grid">
      <article class="stat-card">
        <div class="stat-icon healthy"><el-icon><Monitor /></el-icon></div>
        <div><span>服务状态</span><strong>{{ dashboard.service.status === 'ok' ? '健康' : '连接中' }}</strong></div>
        <small>运行 {{ dashboard.service.uptimeSeconds }} 秒</small>
      </article>
      <article class="stat-card">
        <div class="stat-icon tools"><el-icon><SetUp /></el-icon></div>
        <div><span>受治理工具</span><strong>{{ dashboard.tools.total }}</strong></div>
        <small>{{ dashboard.metrics.toolExecutions.total }} 次累计执行</small>
      </article>
      <article class="stat-card">
        <div class="stat-icon docs"><el-icon><Files /></el-icon></div>
        <div><span>知识文档</span><strong>{{ dashboard.knowledge.documents }}</strong></div>
        <small>当前用户独立索引</small>
      </article>
      <article class="stat-card">
        <div class="stat-icon rag"><el-icon><DataAnalysis /></el-icon></div>
        <div><span>RAG 命中率</span><strong>{{ ragHitRate }}</strong></div>
        <small>{{ dashboard.metrics.rag.queries }} 次检索采样</small>
      </article>
    </section>

    <section class="content-grid">
      <article class="capability-panel">
        <div class="section-heading">
          <div><span>CORE CAPABILITIES</span><h2>项目核心能力</h2></div>
          <el-button text type="primary" @click="router.push('/ai')">进入演示 →</el-button>
        </div>
        <div class="capability-list">
          <div class="capability-item">
            <el-icon><Connection /></el-icon>
            <div><strong>Agent 工具治理</strong><p>统一工具目录、参数白名单、用户身份注入、超时与失败降级。</p></div>
          </div>
          <div class="capability-item">
            <el-icon><DocumentChecked /></el-icon>
            <div><strong>用户级 RAG</strong><p>文档按用户隔离，召回结果携带来源、片段和相关度引用。</p></div>
          </div>
          <div class="capability-item">
            <el-icon><Timer /></el-icon>
            <div><strong>可观测与可评测</strong><p>记录请求、工具、RAG、LLM 延迟与 Token，并维护路由回归集。</p></div>
          </div>
        </div>
      </article>

      <article class="runtime-panel">
        <div class="section-heading"><div><span>RUNTIME</span><h2>运行摘要</h2></div></div>
        <dl>
          <div><dt>LLM 调用</dt><dd>{{ dashboard.metrics.llm.total }}</dd></div>
          <div><dt>输入 Token</dt><dd>{{ dashboard.metrics.llm.inputTokens }}</dd></div>
          <div><dt>输出 Token</dt><dd>{{ dashboard.metrics.llm.outputTokens }}</dd></div>
          <div><dt>工具成功 / 失败</dt><dd>{{ dashboard.metrics.toolExecutions.success }} / {{ dashboard.metrics.toolExecutions.error }}</dd></div>
        </dl>
        <p class="privacy-note">指标只包含低基数运行数据，不记录用户 ID、问题内容或文档正文。</p>
      </article>
    </section>
  </div>
</template>

<style scoped>
.dashboard-page { min-width: 0; height: 100%; overflow: auto; padding: 28px; background: #f4f7fb; }
.hero-panel { display: flex; align-items: flex-end; justify-content: space-between; gap: 32px; padding: 30px 34px; border-radius: 18px; color: #fff; background: linear-gradient(135deg, #071b30 0%, #123d64 60%, #21567f 100%); box-shadow: 0 16px 36px rgba(7, 27, 48, .16); }
.hero-panel > div:first-child { min-width: 0; }
.hero-panel h1 { max-width: 760px; margin: 10px 0 10px; font-size: clamp(25px, 3vw, 38px); line-height: 1.18; }
.hero-panel p { max-width: 720px; color: #bed0df; line-height: 1.7; }
.status-line { display: flex; align-items: center; gap: 8px; color: #d6e5ef; font-size: 12px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; box-shadow: 0 0 0 4px rgba(245,158,11,.14); }
.status-dot.ok { background: #34d399; box-shadow: 0 0 0 4px rgba(52,211,153,.14); }
.version { margin-left: 4px; color: #7fa0b8; }
.hero-actions { display: flex; flex: 0 0 auto; flex-wrap: wrap; gap: 10px; }
.hero-actions .el-button + .el-button { margin-left: 0; }
.dashboard-alert { margin-top: 18px; }
.stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-top: 20px; min-height: 126px; }
.stat-card { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: center; padding: 20px; background: #fff; border: 1px solid #e7edf4; border-radius: 14px; box-shadow: 0 5px 18px rgba(31,49,70,.04); }
.stat-card div span { display: block; color: #7b8794; font-size: 12px; margin-bottom: 3px; }
.stat-card strong { color: #172236; font-size: 24px; }
.stat-card small { grid-column: 1 / -1; color: #9aa5b1; }
.stat-icon { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px; font-size: 21px; }
.stat-icon.healthy { color: #059669; background: #ecfdf5; }
.stat-icon.tools { color: #2563eb; background: #eff6ff; }
.stat-icon.docs { color: #7c3aed; background: #f5f3ff; }
.stat-icon.rag { color: #d97706; background: #fffbeb; }
.content-grid { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(280px, .8fr); gap: 18px; margin-top: 18px; }
.capability-panel, .runtime-panel { background: #fff; border: 1px solid #e7edf4; border-radius: 14px; padding: 22px; }
.section-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
.section-heading span { color: #93a0ad; font-size: 9px; letter-spacing: .14em; }
.section-heading h2 { color: #1f2d3d; font-size: 18px; margin-top: 3px; }
.capability-list { display: grid; gap: 10px; }
.capability-item { display: grid; grid-template-columns: 38px 1fr; gap: 12px; padding: 13px; border-radius: 10px; background: #f7f9fc; }
.capability-item > .el-icon { width: 38px; height: 38px; border-radius: 10px; color: #2563eb; background: #eaf2ff; }
.capability-item strong { font-size: 14px; }
.capability-item p { color: #778391; font-size: 12px; line-height: 1.6; margin-top: 3px; }
.runtime-panel dl { display: grid; gap: 0; }
.runtime-panel dl > div { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #edf1f5; }
.runtime-panel dt { color: #7b8794; font-size: 13px; }
.runtime-panel dd { color: #1f2d3d; font-weight: 700; }
.privacy-note { margin-top: 16px; padding: 12px; border-radius: 9px; color: #667788; background: #f3f7fa; font-size: 11px; line-height: 1.6; }
@media (max-width: 1050px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } .content-grid { grid-template-columns: 1fr; } .hero-panel { align-items: flex-start; flex-direction: column; } }
@media (max-width: 680px) { .dashboard-page { padding: 16px; } .hero-panel { padding: 24px; } .stats-grid { grid-template-columns: 1fr; } .hero-actions { width: 100%; flex-direction: column; } .hero-actions .el-button { width: 100%; } }
</style>
