<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowRight,
  Calendar,
  DataAnalysis,
  Document,
  Microphone,
  Position,
  TrendCharts
} from '@element-plus/icons-vue'
import { requestJson } from '../utils/api'
import { formatDate } from '../utils/interview'

const router = useRouter()
const loading = ref(true)
const error = ref('')
const dashboard = ref({
  interview: {
    workspace: { profile: {}, target: {} },
    profileCompleteness: 0,
    sessions: 0,
    completedSessions: 0,
    averageScore: 0,
    weakDimensions: [],
    recentSessions: []
  },
  knowledge: { documents: 0 }
})

const interview = computed(() => dashboard.value.interview)
const targetTitle = computed(() => interview.value.workspace.profile.targetRole
  || interview.value.workspace.target.jobTitle
  || '等待设置目标岗位')
const company = computed(() => interview.value.workspace.target.company || '目标公司待补充')
const nextStep = computed(() => {
  if (interview.value.profileCompleteness < 60) return { label: '补全目标与画像', path: '/profile' }
  if (!dashboard.value.knowledge.documents) return { label: '上传简历与项目资料', path: '/materials' }
  return { label: '开始一场针对性模拟', path: '/interview' }
})

async function loadDashboard() {
  loading.value = true
  error.value = ''
  try {
    dashboard.value = await requestJson('/api/dashboard')
  } catch (loadError) {
    error.value = loadError.message
  } finally {
    loading.value = false
  }
}

onMounted(loadDashboard)
</script>

<template>
  <div class="io-page dashboard-page">
    <section class="hero">
      <div class="hero-copy">
        <div class="hero-status"><span></span> PERSONAL INTERVIEW WORKSPACE</div>
        <h1>让每次练习，都成为下一次提升的依据</h1>
        <p>基于你的简历、目标 JD 和项目经历持续追问；每次练习后沉淀优势、能力缺口和改进建议，并生成下一轮训练重点。</p>
        <div class="hero-actions">
          <el-button type="primary" size="large" :icon="Microphone" @click="router.push('/interview')">开始模拟面试</el-button>
          <el-button size="large" :icon="Document" @click="router.push('/materials')">完善面试资料</el-button>
        </div>
      </div>
      <div class="target-card">
        <span>当前备战目标</span>
        <strong>{{ targetTitle }}</strong>
        <p>{{ company }}</p>
        <div class="target-meta">
          <span><el-icon><Calendar /></el-icon>{{ interview.workspace.target.interviewDate || '面试日期待定' }}</span>
          <span><el-icon><Position /></el-icon>{{ interview.workspace.profile.seniority || '校招 / 初级' }}</span>
        </div>
        <button @click="router.push('/profile')">调整目标 <el-icon><ArrowRight /></el-icon></button>
      </div>
    </section>

    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="page-alert" />

    <section v-loading="loading" class="metrics-grid">
      <article class="metric-card primary">
        <div><span>准备度</span><strong>{{ interview.profileCompleteness }}<small>%</small></strong></div>
        <el-progress :percentage="interview.profileCompleteness" :show-text="false" :stroke-width="6" />
        <p>画像、目标公司与 JD 完整度</p>
      </article>
      <article class="metric-card">
        <span class="metric-icon violet"><el-icon><Microphone /></el-icon></span>
        <div><span>模拟训练</span><strong>{{ interview.sessions }}<small> 场</small></strong><p>{{ interview.completedSessions }} 场已生成复盘</p></div>
      </article>
      <article class="metric-card">
        <span class="metric-icon mint"><el-icon><TrendCharts /></el-icon></span>
        <div><span>平均表现</span><strong>{{ interview.averageScore || '—' }}<small v-if="interview.averageScore"> 分</small></strong><p>{{ interview.averageScore ? '基于所有已完成训练' : '完成首场训练后生成' }}</p></div>
      </article>
      <article class="metric-card">
        <span class="metric-icon amber"><el-icon><Document /></el-icon></span>
        <div><span>面试资料</span><strong>{{ dashboard.knowledge.documents }}<small> 份</small></strong><p>简历、JD、项目与复盘记录</p></div>
      </article>
    </section>

    <section class="workspace-grid">
      <article class="io-panel sprint-panel">
        <div class="io-section-heading">
          <div><span class="io-eyebrow">NEXT SPRINT</span><h2>下一步最值得做什么</h2></div>
          <el-button text type="primary" @click="router.push(nextStep.path)">{{ nextStep.label }} →</el-button>
        </div>
        <div class="prep-flow">
          <button :class="['flow-item', interview.profileCompleteness >= 60 && 'done']" @click="router.push('/profile')">
            <span>01</span><div><strong>定义目标</strong><p>岗位、级别、公司与 JD</p></div><i></i>
          </button>
          <button :class="['flow-item', dashboard.knowledge.documents > 0 && 'done']" @click="router.push('/materials')">
            <span>02</span><div><strong>沉淀证据</strong><p>简历、项目与真实指标</p></div><i></i>
          </button>
          <button :class="['flow-item', interview.sessions > 0 && 'done']" @click="router.push('/interview')">
            <span>03</span><div><strong>针对性训练</strong><p>动态追问与逐题反馈</p></div><i></i>
          </button>
          <button :class="['flow-item', interview.completedSessions > 0 && 'done']" @click="router.push('/reviews')">
            <span>04</span><div><strong>复盘改进</strong><p>薄弱维度与行动计划</p></div><i></i>
          </button>
        </div>
        <div v-if="interview.weakDimensions.length" class="weak-line">
          <span>最近薄弱项</span>
          <em v-for="item in interview.weakDimensions" :key="item.key">{{ item.label }}</em>
        </div>
        <div v-else class="empty-guidance">
          <el-icon><DataAnalysis /></el-icon>
          <div><strong>完成第一场模拟，建立你的能力基线</strong><p>系统会把模糊的“感觉答得不好”拆成具体评分维度。</p></div>
        </div>
      </article>

      <article class="io-panel recent-panel">
        <div class="io-section-heading">
          <div><span class="io-eyebrow">RECENT REVIEWS</span><h2>最近训练</h2></div>
          <el-button text @click="router.push('/reviews')">全部档案</el-button>
        </div>
        <div v-if="interview.recentSessions.length" class="session-list">
          <button v-for="session in interview.recentSessions" :key="session.id" @click="router.push(`/reviews?session=${session.id}`)">
            <span :class="['score', session.status]">{{ session.report?.overallScore ?? '···' }}</span>
            <div><strong>{{ session.title }}</strong><p>{{ formatDate(session.startedAt) }} · {{ session.answeredQuestions }}/{{ session.questionCount }} 题</p></div>
            <el-icon><ArrowRight /></el-icon>
          </button>
        </div>
        <div v-else class="recent-empty">
          <span><el-icon><Microphone /></el-icon></span>
          <strong>还没有训练记录</strong>
          <p>从 2—8 道问题开始一场低负担模拟。</p>
          <el-button type="primary" plain @click="router.push('/interview')">开始第一场</el-button>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.dashboard-page { color: var(--io-ink); }
.hero { position: relative; display: grid; grid-template-columns: minmax(0,1.5fr) minmax(300px,.65fr); gap: 30px; overflow: hidden; padding: 38px 40px; border-radius: 24px; color: #fff; background: linear-gradient(125deg, #1c1c39 0%, #292653 52%, #413a93 100%); box-shadow: 0 20px 44px rgba(41,38,83,.18); }
.hero::after { position: absolute; top: -120px; right: 20%; width: 320px; height: 320px; border: 1px solid rgba(255,255,255,.08); border-radius: 50%; content: ''; }
.hero-copy, .target-card { position: relative; z-index: 1; }
.hero-status { display: flex; align-items: center; gap: 8px; color: #aaa6e8; font-size: 9px; font-weight: 700; letter-spacing: .17em; }
.hero-status span { width: 7px; height: 7px; border-radius: 50%; background: #38d5ae; box-shadow: 0 0 0 5px rgba(56,213,174,.11); }
.hero h1 { margin: 14px 0 12px; font-size: clamp(30px,3.2vw,47px); line-height: 1.12; letter-spacing: -.035em; white-space: nowrap; }
.hero-copy > p { max-width: 700px; color: #c0c0da; font-size: 14px; line-height: 1.8; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
.hero-actions .el-button + .el-button { margin-left: 0; }
.target-card { align-self: stretch; padding: 23px; border: 1px solid rgba(255,255,255,.13); border-radius: 17px; background: rgba(255,255,255,.08); backdrop-filter: blur(12px); }
.target-card > span { color: #aaa9c8; font-size: 10px; }
.target-card > strong { display: block; margin-top: 13px; font-size: 20px; }
.target-card > p { margin-top: 5px; color: #aaa9c8; font-size: 12px; }
.target-meta { display: grid; gap: 8px; margin-top: 23px; padding-top: 17px; border-top: 1px solid rgba(255,255,255,.1); }
.target-meta span { display: flex; align-items: center; gap: 7px; color: #d0cfe2; font-size: 11px; }
.target-card button { display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: 20px; padding: 9px 11px; border-radius: 9px; color: #d9d8ee; background: rgba(255,255,255,.08); cursor: pointer; }
.page-alert { margin-top: 18px; }
.metrics-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 14px; min-height: 128px; margin-top: 18px; }
.metric-card { display: flex; align-items: center; gap: 14px; padding: 20px; border: 1px solid var(--io-border); border-radius: 16px; background: #fff; box-shadow: 0 7px 24px rgba(30,35,67,.04); }
.metric-card.primary { display: block; }
.metric-card > div { min-width: 0; flex: 1; }
.metric-card span, .metric-card p { color: #85899c; font-size: 11px; }
.metric-card strong { display: block; margin: 5px 0 7px; font-size: 27px; letter-spacing: -.03em; }
.metric-card strong small { font-size: 12px; font-weight: 500; }
.metric-card.primary :deep(.el-progress-bar__inner) { background: linear-gradient(90deg,#6157e8,#887ff1); }
.metric-icon { display: grid; flex: 0 0 42px; place-items: center; width: 42px; height: 42px; border-radius: 12px; font-size: 19px; }
.metric-icon.violet { color: #6157e8; background: #efedff; }.metric-icon.mint { color: #16a983; background: #e8faf5; }.metric-icon.amber { color: #d27b2e; background: #fff3e7; }
.workspace-grid { display: grid; grid-template-columns: minmax(0,1.5fr) minmax(320px,.7fr); gap: 16px; margin-top: 16px; }
.sprint-panel,.recent-panel { padding: 23px; }
.prep-flow { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 9px; }
.flow-item { position: relative; display: flex; min-width: 0; align-items: center; gap: 10px; padding: 14px 11px; border: 1px solid #ececf3; border-radius: 12px; color: inherit; background: #fafafe; text-align: left; cursor: pointer; }
.flow-item > span { display: grid; flex: 0 0 28px; place-items: center; width: 28px; height: 28px; border-radius: 9px; color: #777b91; background: #ededf3; font-size: 9px; font-weight: 800; }
.flow-item strong { font-size: 12px; }.flow-item p { margin-top: 3px; overflow: hidden; color: #9194a6; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.flow-item.done > span { color: #fff; background: #6157e8; }.flow-item.done i { position: absolute; top: 8px; right: 8px; width: 6px; height: 6px; border-radius: 50%; background: #35caa6; }
.weak-line { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 16px; padding: 13px; border-radius: 11px; background: #fff8ef; }
.weak-line span { color: #9b6b39; font-size: 11px; }.weak-line em { padding: 4px 8px; border-radius: 6px; color: #8b5f31; background: #ffecd7; font-size: 10px; font-style: normal; }
.empty-guidance { display: flex; align-items: center; gap: 12px; margin-top: 16px; padding: 14px; border-radius: 11px; color: #6157e8; background: #f4f2ff; }
.empty-guidance > .el-icon { flex: 0 0 auto; font-size: 24px; }.empty-guidance strong { color: #44405e; font-size: 12px; }.empty-guidance p { margin-top: 3px; color: #85809e; font-size: 10px; }
.session-list { display: grid; gap: 8px; }.session-list button { display: grid; grid-template-columns: 40px 1fr auto; gap: 10px; align-items: center; width: 100%; padding: 10px; border-radius: 11px; color: inherit; background: #f8f8fc; text-align: left; cursor: pointer; }
.score { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 11px; color: #6157e8; background: #ebe9ff; font-size: 13px; font-weight: 800; }.score.active { color: #d37a2a; background: #fff0df; }
.session-list strong { display: block; overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.session-list p { margin-top: 3px; color: #9497a9; font-size: 9px; }
.recent-empty { display: flex; min-height: 178px; flex-direction: column; align-items: center; justify-content: center; color: #8a8da0; text-align: center; }.recent-empty > span { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 13px; color: #6157e8; background: #efedff; font-size: 20px; }.recent-empty strong { margin-top: 10px; color: #515469; font-size: 12px; }.recent-empty p { margin: 4px 0 11px; font-size: 10px; }
@media (max-width: 1180px) { .metrics-grid { grid-template-columns: repeat(2,1fr); }.workspace-grid { grid-template-columns: 1fr; } }
@media (min-width: 1181px) { .hero-copy > p { max-width: none; white-space: nowrap; } }
@media (max-width: 1000px) { .hero h1 { white-space: normal; } }
@media (max-width: 820px) { .hero { grid-template-columns: 1fr; }.prep-flow { grid-template-columns: repeat(2,1fr); } }
@media (max-width: 560px) { .hero { padding: 28px 24px; }.metrics-grid { grid-template-columns: 1fr; }.prep-flow { grid-template-columns: 1fr; }.hero-actions { flex-direction: column; }.hero-actions .el-button { width: 100%; } }
</style>
