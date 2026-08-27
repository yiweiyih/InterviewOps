<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { DataAnalysis, DocumentCopy, Microphone, TrendCharts } from '@element-plus/icons-vue'
import { dimensionLabels, formatDate, interviewApi, scoreTone } from '../utils/interview'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const detailLoading = ref(false)
const sessions = ref([])
const selected = ref(null)

const completedCount = computed(() => sessions.value.filter(item => item.report?.answeredQuestions > 0).length)
const averageScore = computed(() => {
  const scored = sessions.value.filter(item => item.report?.overallScore)
  return scored.length ? Math.round(scored.reduce((sum,item) => sum + item.report.overallScore, 0) / scored.length) : 0
})

async function selectSession(id, updateRoute = true) {
  if (!id) return
  detailLoading.value = true
  try {
    selected.value = (await interviewApi.getSession(id)).session
    if (updateRoute) router.replace({ query: { session: id } })
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    detailLoading.value = false
  }
}

async function loadSessions() {
  loading.value = true
  try {
    sessions.value = (await interviewApi.listSessions()).sessions
    const firstId = route.query.session || sessions.value[0]?.id
    if (firstId) await selectSession(firstId, false)
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    loading.value = false
  }
}

onMounted(loadSessions)
</script>

<template>
  <div class="io-page review-page" v-loading="loading">
    <section class="review-hero">
      <div><span class="io-eyebrow">REVIEW ARCHIVE</span><h1>复盘不是一句“答得不好”，而是可追踪的能力变化。</h1><p>保留每道问题、原始回答、评分证据和改进结构，让下一轮训练知道该追问哪里。</p></div>
      <div class="archive-stats"><div><strong>{{ completedCount }}</strong><span>已复盘场次</span></div><i></i><div><strong>{{ averageScore || '—' }}</strong><span>平均表现</span></div></div>
    </section>

    <section v-if="sessions.length" class="archive-layout">
      <aside class="io-panel session-sidebar">
        <div class="io-section-heading"><div><span class="io-eyebrow">TIMELINE</span><h2>训练记录</h2></div></div>
        <div class="archive-list">
          <button v-for="item in sessions" :key="item.id" :class="selected?.id === item.id && 'active'" @click="selectSession(item.id)">
            <span :class="['mini-score', item.status, scoreTone(item.report?.overallScore || 0)]">{{ item.report?.answeredQuestions ? item.report.overallScore : '··' }}</span>
            <div><strong>{{ item.title }}</strong><p>{{ formatDate(item.startedAt) }}</p><small>{{ item.answeredQuestions }}/{{ item.questionCount }} 题 · {{ item.status === 'completed' ? (item.report?.answeredQuestions ? '已复盘' : '已结束') : '进行中' }}</small></div>
          </button>
        </div>
      </aside>

      <main v-loading="detailLoading" class="detail-column">
        <template v-if="selected?.report?.answeredQuestions">
          <article class="score-overview io-panel">
            <div><span class="io-eyebrow">PERFORMANCE SNAPSHOT</span><h2>{{ selected.title }}</h2><p>{{ formatDate(selected.startedAt) }} · {{ selected.report.answeredQuestions }} 道问题</p></div>
            <div :class="['hero-score',scoreTone(selected.report.overallScore)]"><strong>{{ selected.report.overallScore }}</strong><span>综合表现</span></div>
            <div class="dimension-bars"><div v-for="(score,key) in selected.report.dimensionScores" :key="key"><span>{{ dimensionLabels[key] }}</span><el-progress :percentage="score*20" :show-text="false" :stroke-width="6" /><b>{{ score }}</b></div></div>
          </article>

          <div class="insight-grid">
            <article class="io-panel insight-card strength"><span><el-icon><TrendCharts /></el-icon>稳定优势</span><ul><li v-for="item in selected.report.strengths" :key="item.key"><strong>{{ item.label }}</strong><em>{{ item.score }}/5</em></li></ul></article>
            <article class="io-panel insight-card gap"><span><el-icon><DataAnalysis /></el-icon>优先补强</span><ul><li v-for="item in selected.report.gaps" :key="item.key"><strong>{{ item.label }}</strong><em>{{ item.score }}/5</em></li></ul></article>
            <article class="io-panel insight-card action"><span><el-icon><DocumentCopy /></el-icon>下一步行动</span><ol><li v-for="(item,index) in selected.report.nextActions" :key="item"><b>{{ index+1 }}</b>{{ item }}</li><li v-if="!selected.report.nextActions.length">完成更多题目后生成具体行动</li></ol></article>
          </div>

          <article class="io-panel transcript-panel">
            <div class="io-section-heading"><div><span class="io-eyebrow">QUESTION REVIEW</span><h2>逐题证据链</h2></div><p>问题 → 原始回答 → 评分依据 → 更好结构</p></div>
            <el-collapse accordion>
              <el-collapse-item v-for="(turn,index) in selected.turns" :key="turn.answeredAt" :name="index">
                <template #title><div class="question-title"><span>Q{{ String(index+1).padStart(2,'0') }}</span><strong>{{ turn.question.text }}</strong><em>{{ turn.feedback.averageScore }}/5</em></div></template>
                <div class="turn-detail"><section><span>你的原始回答</span><p>{{ turn.answer }}</p></section><div class="turn-columns"><section class="evidence"><span>有效证据</span><ul><li v-for="item in turn.feedback.evidence" :key="item">{{ item }}</li></ul></section><section class="missing"><span>缺失信息</span><ul><li v-for="item in turn.feedback.missingPoints" :key="item">{{ item }}</li></ul></section></div><section class="structure"><span>建议表达结构</span><p>{{ turn.feedback.betterStructure || '本题暂无结构建议' }}</p></section></div>
              </el-collapse-item>
            </el-collapse>
          </article>
        </template>
        <article v-else-if="selected?.report" class="io-panel active-session"><span><el-icon><DataAnalysis /></el-icon></span><h2>本场没有可评分的回答</h2><p>这场训练在提交第一道回答前结束，因此不会生成能力评分，也不会计入平均表现。</p><el-button type="primary" @click="router.push('/interview')">重新开始一场</el-button></article>
        <article v-else-if="selected" class="io-panel active-session"><span><el-icon><Microphone /></el-icon></span><h2>这场训练还在进行中</h2><p>完成或提前结束模拟后，这里会生成能力雷达、证据链和补强行动。</p><el-button type="primary" @click="router.push('/interview')">继续模拟面试</el-button></article>
      </main>
    </section>

    <section v-else class="empty-archive io-panel"><span><el-icon><DataAnalysis /></el-icon></span><h2>你的复盘档案还在等待第一条记录</h2><p>完成一场模拟面试后，每题回答和评分证据都会沉淀在这里。</p><el-button type="primary" size="large" @click="router.push('/interview')">开始第一场模拟</el-button></section>
  </div>
</template>

<style scoped>
.review-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 30px; padding: 30px 35px; border-radius: 22px; color: #fff; background: linear-gradient(125deg,#20203e,#393578 66%,#315f70); }.review-hero h1 { max-width: 760px; margin: 9px 0; font-size: clamp(26px,3vw,38px); line-height: 1.2; letter-spacing: -.03em; }.review-hero p { max-width: 690px; color: #bcbcd3; font-size: 12px; line-height: 1.7; }.review-hero .io-eyebrow { color: #9e9ad9; }.archive-stats { display: flex; align-items: center; gap: 22px; padding: 16px 20px; border: 1px solid rgba(255,255,255,.13); border-radius: 14px; background: rgba(255,255,255,.07); }.archive-stats div { display: flex; min-width: 66px; flex-direction: column; align-items: center; }.archive-stats strong { font-size: 27px; }.archive-stats span { margin-top: 3px; color: #aaaac4; font-size: 9px; }.archive-stats i { width: 1px; height: 38px; background: rgba(255,255,255,.13); }
.archive-layout { display: grid; grid-template-columns: 280px minmax(0,1fr); gap: 16px; margin-top: 16px; }.session-sidebar { align-self: start; max-height: calc(100vh - 190px); padding: 20px 13px; overflow-y: auto; }.session-sidebar .io-section-heading { padding: 0 8px; }.archive-list { display: grid; gap: 6px; }.archive-list button { display: grid; grid-template-columns: 39px 1fr; gap: 10px; align-items: center; width: 100%; padding: 10px; border-radius: 11px; color: inherit; background: transparent; text-align: left; cursor: pointer; }.archive-list button:hover { background: #f7f7fb; }.archive-list button.active { background: #f0eeff; }.mini-score { display: grid; place-items: center; width: 39px; height: 39px; border-radius: 11px; color: #6157e8; background: #ebe9ff; font-size: 11px; font-weight: 800; }.mini-score.active { color: #cf792d; background: #fff0df; }.archive-list strong { display: block; overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }.archive-list p,.archive-list small { display: block; margin-top: 2px; color: #999bab; font-size: 8px; }.detail-column { min-height: 300px; }.score-overview { display: grid; grid-template-columns: minmax(170px,.75fr) 100px minmax(280px,1fr); gap: 22px; align-items: center; padding: 24px; }.score-overview h2 { margin-top: 5px; font-size: 18px; }.score-overview p { margin-top: 5px; color: #9699a9; font-size: 9px; }.hero-score { display: flex; flex-direction: column; align-items: center; padding: 13px; border-radius: 14px; color: #6157e8; background: #efedff; }.hero-score strong { font-size: 33px; }.hero-score span { font-size: 8px; }.dimension-bars { display: grid; grid-template-columns: repeat(2,1fr); gap: 9px 18px; }.dimension-bars > div { display: grid; grid-template-columns: 65px 1fr 20px; gap: 7px; align-items: center; }.dimension-bars span,.dimension-bars b { color: #777a8c; font-size: 8px; }.dimension-bars :deep(.el-progress-bar__inner) { background: #7167ed; }
.insight-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 13px; margin-top: 13px; }.insight-card { padding: 17px; }.insight-card > span { display: flex; align-items: center; gap: 6px; color: #65697b; font-size: 10px; font-weight: 700; }.insight-card ul,.insight-card ol { display: grid; gap: 7px; margin-top: 12px; list-style: none; }.insight-card li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px; border-radius: 8px; color: #6c7081; background: #f8f8fb; font-size: 9px; }.insight-card li strong { font-size: 9px; }.insight-card li em { color: #8b8e9e; font-style: normal; }.insight-card.action li { justify-content: flex-start; line-height: 1.5; }.insight-card.action b { display: grid; flex: 0 0 19px; place-items: center; width: 19px; height: 19px; border-radius: 6px; color: #6157e8; background: #ebe9ff; font-size: 8px; }.strength { border-color: #dcefe9; }.gap { border-color: #f3e3d1; }.action { border-color: #e2e0f7; }
.transcript-panel { margin-top: 13px; padding: 23px; }.question-title { display: grid; grid-template-columns: 32px 1fr auto; gap: 10px; align-items: center; width: 100%; padding-right: 8px; }.question-title > span { color: #6157e8; font-size: 9px; font-weight: 800; }.question-title strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.question-title em { color: #696d80; font-size: 9px; font-style: normal; }.turn-detail { padding: 4px 8px 15px; }.turn-detail section > span { color: #777a8e; font-size: 9px; font-weight: 700; }.turn-detail section > p { margin-top: 7px; color: #585c70; font-size: 10px; line-height: 1.75; white-space: pre-wrap; }.turn-columns { display: grid; grid-template-columns: repeat(2,1fr); gap: 10px; margin-top: 13px; }.turn-columns section,.structure { padding: 13px; border-radius: 10px; }.evidence { background: #eefaf7; }.missing { background: #fff6eb; }.turn-columns ul { display: grid; gap: 5px; margin: 7px 0 0 15px; color: #686c7c; font-size: 9px; line-height: 1.6; }.structure { margin-top: 10px; background: #f5f3ff; }.active-session,.empty-archive { display: flex; min-height: 330px; flex-direction: column; align-items: center; justify-content: center; text-align: center; }.active-session > span,.empty-archive > span { display: grid; place-items: center; width: 50px; height: 50px; border-radius: 15px; color: #6157e8; background: #efedff; font-size: 24px; }.active-session h2,.empty-archive h2 { margin-top: 14px; font-size: 18px; }.active-session p,.empty-archive p { max-width: 480px; margin: 7px 0 14px; color: #8e91a2; font-size: 10px; }.empty-archive { margin-top: 16px; }
@media(max-width:1050px){.archive-layout{grid-template-columns:1fr}.session-sidebar{max-height:none}.archive-list{grid-template-columns:repeat(3,1fr)}.score-overview{grid-template-columns:1fr 100px}.dimension-bars{grid-column:1/-1}}
@media(min-width:1181px){.review-hero h1,.review-hero p{max-width:none;white-space:nowrap}}
@media(max-width:760px){.review-hero{align-items:flex-start;flex-direction:column}.archive-list,.insight-grid{grid-template-columns:1fr}.score-overview{grid-template-columns:1fr}.hero-score{align-items:flex-start}.dimension-bars,.turn-columns{grid-template-columns:1fr}}
</style>
