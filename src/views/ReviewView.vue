<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { DataAnalysis, Delete, DocumentCopy, Microphone, TrendCharts } from '@element-plus/icons-vue'
import { dimensionLabels, formatDate, interviewApi, scoreTone } from '../utils/interview'
import { formatReviewHistoryLabel } from '../utils/reviewHistory'
import { getReviewQueueState } from '../utils/reviewQueue'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const detailLoading = ref(false)
const reviewLoading = ref(false)
const practiceLoading = ref(false)
const reinforcementLoading = ref(false)
const deletingId = ref(null)
const activePracticeDay = ref(null)
const practiceAnswer = ref('')
const activeReinforcementQuestion = ref(null)
const reinforcementAnswer = ref('')
const sessions = ref([])
const selected = ref(null)
let selectionVersion = 0
let pendingSelectionId = null
const REVIEW_VERSION = 3
const reviewCycle = computed(() => selected.value?.skillReview?.cycle || 1)
const reviewQueueState = computed(() => getReviewQueueState(selected.value))
const reviewQueue = computed(() => reviewQueueState.value.queue)
const reviewPolicyReady = computed(() => reviewQueueState.value.synced)
const requiredQuestions = computed(() => reviewQueue.value.filter(item => item.required))
const outdatedPlan = computed(() => {
  const review = selected.value?.skillReview
  if (review?.version !== REVIEW_VERSION || !review.days?.length) return false
  const previous = new Set((selected.value?.practiceAttempts || [])
    .filter(item => (item.cycle || 1) < reviewCycle.value).map(item => item.questionNumber))
  const remainingAtStart = requiredQuestions.value.filter(item => !previous.has(item.questionNumber)).length
  const numbers = review.days.map(day => day.evidence?.questionNumber || day.evidenceQuestionNumbers?.[0])
  return numbers.length !== Math.min(3, remainingAtStart)
    || new Set(numbers).size !== numbers.length
    || numbers.some(number => previous.has(number) || !requiredQuestions.value.some(item => item.questionNumber === number))
})
const canRefreshPlan = computed(() => reviewPolicyReady.value && outdatedPlan.value && requiredQuestions.value.some(item => item.practicedCount === 0) && !(selected.value?.practiceAttempts || [])
  .some(item => (item.cycle || 1) === reviewCycle.value && item.kind !== 'reinforcement'))
const requiredReviewComplete = computed(() => requiredQuestions.value.every(item => item.practicedCount > 0))
const reinforcementCandidates = computed(() => reviewQueue.value.filter(item => item.needsReinforcement))
const REINFORCEMENT_LIMIT = 5
const canStartNextCycle = computed(() => {
  const review = selected.value?.skillReview
  if (!reviewPolicyReady.value || review?.version !== REVIEW_VERSION || requiredReviewComplete.value || !requiredQuestions.value.some(item => item.practicedCount === 0)) return false
  return review.days?.filter(day => requiredQuestions.value.some(item => item.questionNumber === (day.evidence?.questionNumber || day.evidenceQuestionNumbers?.[0])))
    .every(day => (selected.value?.practiceAttempts || []).some(attempt => (
    (attempt.cycle || 1) === reviewCycle.value
    && attempt.day === day.day
    && attempt.questionNumber === (day.evidence?.questionNumber || day.evidenceQuestionNumbers?.[0])
    )))
})

const completedCount = computed(() => sessions.value.filter(item => item.report?.answeredQuestions > 0).length)
const averageScore = computed(() => {
  const scored = sessions.value.filter(item => item.report?.overallScore)
  return scored.length ? Math.round(scored.reduce((sum,item) => sum + item.report.overallScore, 0) / scored.length) : 0
})

async function selectSession(id, updateRoute = true) {
  if (!id) return
  const version = ++selectionVersion
  pendingSelectionId = id
  detailLoading.value = true
  try {
    const { session } = await interviewApi.getSession(id)
    if (version !== selectionVersion || !sessions.value.some(item => item.id === id)) return
    selected.value = session
    activePracticeDay.value = null
    practiceAnswer.value = ''
    activeReinforcementQuestion.value = null
    reinforcementAnswer.value = ''
    if (updateRoute) router.replace({ query: { session: id } })
  } catch (error) {
    if (version === selectionVersion) ElMessage.error(error.message)
  } finally {
    if (version === selectionVersion) {
      pendingSelectionId = null
      detailLoading.value = false
    }
  }
}

async function loadSessions() {
  loading.value = true
  try {
    sessions.value = (await interviewApi.listSessions()).sessions
    const requestedId = route.query.session
    const firstId = sessions.value.some(item => item.id === requestedId) ? requestedId : sessions.value[0]?.id
    if (firstId) await selectSession(firstId, requestedId && requestedId !== firstId)
    else selected.value = null
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    loading.value = false
  }
}

async function confirmDeleteSession(item) {
  if (deletingId.value || item.status === 'active') return
  try {
    await ElMessageBox.confirm(
      `删除「${item.title}」（${formatDate(item.startedAt)}）后，原始回答、评分、复盘计划和重答记录将一并移除，且无法恢复。确定删除吗？`,
      '删除训练记录',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  deletingId.value = item.id
  try {
    await interviewApi.deleteSession(item.id)
    if (pendingSelectionId === item.id) {
      selectionVersion += 1
      pendingSelectionId = null
      detailLoading.value = false
    }
    sessions.value = sessions.value.filter(session => session.id !== item.id)
    if (selected.value?.id === item.id) {
      selected.value = null
      activePracticeDay.value = null
      practiceAnswer.value = ''
      activeReinforcementQuestion.value = null
      reinforcementAnswer.value = ''
      if (sessions.value.length) await selectSession(sessions.value[0].id)
      else await router.replace({ query: {} })
    }
    ElMessage.success('训练记录已删除')
  } catch (error) {
    ElMessage.error(error.message || '删除失败')
  } finally {
    deletingId.value = null
  }
}

async function generateSkillReview() {
  const id = selected.value?.id
  if (!id || !reviewPolicyReady.value || reviewLoading.value) return
  reviewLoading.value = true
  try {
    const { session } = await interviewApi.reviewSession(id, { regenerate: Boolean(selected.value?.skillReview) })
    if (session.skillReview?.version !== REVIEW_VERSION) {
      throw new Error('后端仍返回旧版计划，请重启后端服务后重试')
    }
    if (selected.value?.id === id) {
      selected.value = session
      ElMessage.success(`${session.skillReview.days.length} 项复习任务已保存`)
    }
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    reviewLoading.value = false
  }
}

async function generateNextCycle() {
  const id = selected.value?.id
  if (!id || !canStartNextCycle.value || reviewLoading.value) return
  reviewLoading.value = true
  try {
    const { session } = await interviewApi.reviewSession(id, { nextCycle: true })
    if (selected.value?.id === id) {
      selected.value = session
      activePracticeDay.value = null
      practiceAnswer.value = ''
      ElMessage.success('下一轮重点复习计划已保存')
    }
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    reviewLoading.value = false
  }
}

function latestPractice(day) {
  return (selected.value?.practiceAttempts || []).filter(item => (
    (item.cycle || 1) === reviewCycle.value && item.day === day
  )).at(-1)
}

function latestReinforcement(questionNumber) {
  return (selected.value?.practiceAttempts || []).filter(item => (
    item.kind === 'reinforcement' && item.questionNumber === questionNumber
  )).at(-1)
}

function reinforcementCount(questionNumber) {
  return (selected.value?.practiceAttempts || []).filter(item => (
    item.kind === 'reinforcement' && item.questionNumber === questionNumber
  )).length
}

function practiceQuestion(day) {
  const number = day.evidence?.questionNumber || day.evidenceQuestionNumbers?.[0]
  return selected.value?.turns?.[number - 1]?.question?.text || '原题暂不可用'
}

function scoreComparison(attempt) {
  const original = selected.value?.turns?.[attempt.questionNumber - 1]?.feedback?.scores || {}
  return Object.entries(attempt.feedback.scores).map(([key, score]) => ({
    key, label: dimensionLabels[key] || key, original: original[key], current: score
  }))
}

async function submitPractice(day) {
  const id = selected.value?.id
  if (!id || practiceLoading.value) return
  practiceLoading.value = true
  try {
    const { session } = await interviewApi.practiceReview(id, day, practiceAnswer.value)
    if (selected.value?.id === id) {
      selected.value = session
      activePracticeDay.value = null
      practiceAnswer.value = ''
      ElMessage.success('练习已评估并保存')
    }
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    practiceLoading.value = false
  }
}

async function submitReinforcement(questionNumber) {
  const id = selected.value?.id
  if (!id || reinforcementLoading.value) return
  reinforcementLoading.value = true
  try {
    const { session } = await interviewApi.reinforceReview(id, questionNumber, reinforcementAnswer.value)
    if (selected.value?.id === id) {
      selected.value = session
      reinforcementAnswer.value = ''
      if (reinforcementCount(questionNumber) >= REINFORCEMENT_LIMIT) activeReinforcementQuestion.value = null
      ElMessage.success('巩固练习已评估并保存')
    }
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    reinforcementLoading.value = false
  }
}

onMounted(loadSessions)
</script>

<template>
  <div class="io-page review-page" v-loading="loading">
    <section class="review-hero">
      <div><span class="io-eyebrow">REVIEW ARCHIVE</span><h1>复盘不是一句“答得不好”，而是可追踪的能力变化</h1><p>保留每道问题、原始回答、评分证据和改进结构，让下一轮训练知道该追问哪里。</p></div>
      <div class="archive-stats"><div><strong>{{ completedCount }}</strong><span>已复盘场次</span></div><i></i><div><strong>{{ averageScore || '—' }}</strong><span>平均表现</span></div></div>
    </section>

    <section v-if="sessions.length" class="archive-layout">
      <aside class="io-panel session-sidebar">
        <div class="io-section-heading"><div><span class="io-eyebrow">TIMELINE</span><h2>训练记录</h2></div></div>
        <div class="archive-list">
          <div v-for="item in sessions" :key="item.id" :class="['archive-entry', selected?.id === item.id && 'active']">
            <button type="button" class="session-select" @click="selectSession(item.id)">
              <span :class="['mini-score', item.status, scoreTone(item.report?.overallScore || 0)]">{{ item.report?.answeredQuestions ? item.report.overallScore : '··' }}</span>
              <div><strong>{{ item.title }}</strong><p>{{ formatDate(item.startedAt) }}</p><small>{{ item.answeredQuestions }}/{{ item.questionCount }} 题 · {{ item.status === 'completed' ? (item.report?.answeredQuestions ? '已复盘' : '已结束') : '进行中' }}</small></div>
            </button>
            <el-button class="session-delete" text circle size="small" :icon="Delete" :loading="deletingId === item.id"
              :disabled="item.status === 'active' || Boolean(deletingId)" :title="item.status === 'active' ? '请先结束面试再删除' : '删除这场训练记录'"
              :aria-label="`删除 ${item.title} ${formatDate(item.startedAt)} 的训练记录`" @click="confirmDeleteSession(item)" />
          </div>
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

          <article class="io-panel skill-review-panel">
            <div class="io-section-heading">
              <div><span class="io-eyebrow">INTERVIEW REVIEW SKILL</span><h2>第 {{ reviewCycle }} 轮 · {{ selected.skillReview?.days?.length ? `${selected.skillReview.days.length} 项重点复习` : '重点复习' }}</h2></div>
              <el-button v-if="reviewPolicyReady && ((!selected.skillReview && requiredQuestions.length) || canRefreshPlan)" type="primary" :loading="reviewLoading" @click="generateSkillReview">{{ canRefreshPlan ? '按新规则更新本轮' : '生成复习计划' }}</el-button>
            </div>
            <p v-if="!reviewPolicyReady" class="review-old-plan-note">逐题评分显示有 {{ requiredQuestions.length }} 道必练题，但复习规则接口尚未同步。请重启后端服务并刷新页面，再生成计划；原始回答和评分仍可在下方查看。</p>
            <div v-if="selected.skillReview && selected.skillReview.version !== REVIEW_VERSION" class="skill-legacy-warning">
              <strong>这份计划尚未通过单题证据与乱码校验</strong>
              <p>旧计划可能存在一天跨多题、缺少原话证据或乱码，暂不作为练习依据。升级时会保留旧计划，并重新核对主问题、引用原话和具体指标；原始面试回答不会修改。</p>
              <el-button v-if="reviewPolicyReady && requiredQuestions.length" type="primary" :loading="reviewLoading" @click="generateSkillReview">升级为已校验计划</el-button>
            </div>
            <template v-else-if="selected.skillReview?.version === REVIEW_VERSION">
              <p v-if="outdatedPlan" class="review-old-plan-note">这份计划按旧规则安排了无需必练的题目。{{ !requiredQuestions.length ? '本场暂无必练题，旧任务仅供回看，不强制重答。' : canRefreshPlan ? '本轮尚未练习，可以点击“按新规则更新本轮”。' : '为避免更换已有练习的题目依据，原计划继续保留。' }}</p>
              <p class="skill-review-summary">{{ selected.skillReview.summary }}</p>
              <div class="skill-review-focus"><span>整场薄弱维度</span><p v-for="item in selected.skillReview.focusAreas" :key="item.dimension">{{ item.label }}（{{ item.score }}/5）· 可回看第 {{ item.questionNumber }} 题</p></div>
              <div v-if="reviewQueue.length" class="review-queue">
                <strong>逐题复习队列</strong>
                <p>全部 {{ reviewQueue.length }} 道原题均保留评估；其中 {{ requiredQuestions.length }} 道原始评分低于 4/5 或有缺失点，列为必练。必练题按原评分与缺口排序，本轮题目不会中途更换。</p>
                <p v-if="requiredReviewComplete">{{ requiredQuestions.length ? '必练题均已至少重答一次，基础复习计划已结束；仍有低分或缺口的题可自选巩固。' : '本场暂无必练题，原题和评分均可回看。' }}</p>
                <p v-else>完成本轮后，可继续安排尚未练过的必练题。</p>
                <ol><li v-for="item in reviewQueue" :key="item.questionNumber"><span>第 {{ item.questionNumber }} 题</span><b>{{ item.currentScore }}/5</b><em>{{ !item.required ? '无需重答' : item.practicedCount ? '已练' : item.inCurrentPlan ? '本轮' : '待练' }}</em><small>{{ item.practicedCount ? `已重答 ${item.practicedCount} 次` : item.required ? '尚未重答' : '可回看原答' }}</small></li></ol>
              </div>
              <div v-if="requiredReviewComplete" class="review-complete">
                <strong>基础复习已完成</strong>
                <p>{{ requiredQuestions.length ? `${requiredQuestions.length} 道必练原题都已至少重答一次` : '本场暂无必练题' }}，不再生成新一轮。其他题目可在下方回看原答与评分。</p>
                <template v-if="reinforcementCandidates.length">
                  <p>以下题目最近一次得分低于 4/5 或仍有缺失点；未达次数上限的可自选巩固：</p>
                  <div v-for="item in reinforcementCandidates" :key="item.questionNumber" class="reinforcement-item">
                    <div><strong>第 {{ item.questionNumber }} 题 · {{ item.currentScore }}/5</strong><span>待补缺口 {{ item.gapCount }} 项</span></div>
                    <el-button size="small" :disabled="reinforcementCount(item.questionNumber) >= REINFORCEMENT_LIMIT" @click="activeReinforcementQuestion = activeReinforcementQuestion === item.questionNumber ? null : item.questionNumber; reinforcementAnswer = ''">{{ reinforcementCount(item.questionNumber) >= REINFORCEMENT_LIMIT ? '已达 5 次上限' : activeReinforcementQuestion === item.questionNumber ? '收起' : '自选巩固' }}</el-button>
                    <div v-if="activeReinforcementQuestion === item.questionNumber" class="practice-editor">
                      <p class="practice-question">{{ selected.turns[item.questionNumber - 1]?.question?.text }}</p>
                      <el-input v-model="reinforcementAnswer" type="textarea" :rows="5" maxlength="10000" show-word-limit placeholder="重新回答原题，至少 20 个字符" />
                      <el-button type="primary" size="small" :loading="reinforcementLoading" @click="submitReinforcement(item.questionNumber)">提交并评估</el-button>
                    </div>
                    <div v-if="latestReinforcement(item.questionNumber)" class="practice-result">
                      <b>最近一次巩固：{{ latestReinforcement(item.questionNumber).originalAverageScore }}/5 → {{ latestReinforcement(item.questionNumber).feedback.averageScore }}/5</b>
                      <p>{{ latestReinforcement(item.questionNumber).feedback.summary }}</p>
                    </div>
                  </div>
                </template>
                <p v-else>目前没有低分或缺口题，无需继续巩固。</p>
                <div v-if="activeReinforcementQuestion && !reinforcementCandidates.some(item => item.questionNumber === activeReinforcementQuestion) && latestReinforcement(activeReinforcementQuestion)" class="practice-result">
                  <b>第 {{ activeReinforcementQuestion }} 题本次巩固：{{ latestReinforcement(activeReinforcementQuestion).originalAverageScore }}/5 → {{ latestReinforcement(activeReinforcementQuestion).feedback.averageScore }}/5</b>
                  <p>{{ latestReinforcement(activeReinforcementQuestion).feedback.summary }} · 当前已无低分或缺口，可结束巩固。</p>
                </div>
              </div>
              <div class="skill-review-days">
                <section v-for="day in selected.skillReview.days" :key="day.day">
                  <strong>任务 {{ day.day }} · {{ day.focus }}</strong>
                  <p>{{ day.task }}</p>
                  <small>完成检查：{{ day.checkpoint }} · 对应第 {{ day.evidenceQuestionNumbers.join('、') }} 题</small>
                  <p v-if="day.evidence?.quote" class="practice-evidence">原回答依据：“{{ day.evidence.quote }}”</p>
                  <el-button class="practice-open" size="small" @click="activePracticeDay = activePracticeDay === day.day ? null : day.day; practiceAnswer = ''">{{ activePracticeDay === day.day ? '收起练习' : '重新回答这题' }}</el-button>
                  <div v-if="activePracticeDay === day.day" class="practice-editor">
                    <p class="practice-question">{{ practiceQuestion(day) }}</p>
                    <el-input v-model="practiceAnswer" type="textarea" :rows="5" maxlength="10000" show-word-limit placeholder="重新回答原题，至少 20 个字符" />
                    <el-button type="primary" size="small" :loading="practiceLoading" @click="submitPractice(day.day)">提交并评估</el-button>
                  </div>
                  <div v-if="latestPractice(day.day)" class="practice-result">
                    <b>最近一次练习：{{ latestPractice(day.day).originalAverageScore }}/5 → {{ latestPractice(day.day).feedback.averageScore }}/5</b>
                    <div v-for="item in scoreComparison(latestPractice(day.day))" :key="item.key">{{ item.label }}：{{ item.original ?? '—' }} → {{ item.current }}</div>
                    <p>{{ latestPractice(day.day).feedback.summary }}</p>
                    <details><summary>查看原回答与练习回答</summary><p>原回答：{{ selected.turns[latestPractice(day.day).questionNumber - 1]?.answer }}</p><p>练习回答：{{ latestPractice(day.day).answer }}</p></details>
                  </div>
                </section>
              </div>
              <div v-if="canStartNextCycle" class="next-cycle-row"><p>本轮任务已完成；尚未重答的必练题会进入下一轮。</p><el-button type="primary" :loading="reviewLoading" @click="generateNextCycle">生成下一轮计划</el-button></div>
              <details v-if="selected.skillReviewHistory?.length" class="review-history">
                <summary>查看历史复习计划（{{ selected.skillReviewHistory.length }}）</summary>
                <p v-if="selected.skillReviewHistory.some(plan => plan.version !== REVIEW_VERSION)" class="review-history-note">旧版计划是升级前保留的草稿，不代表完成了一轮练习；题目安排可能与当前计划不同，请以当前计划为准。</p>
                <div v-for="(plan,index) in selected.skillReviewHistory" :key="`${plan.generatedAt || index}-${index}`">
                  <strong>{{ formatReviewHistoryLabel(plan, index, REVIEW_VERSION) }}</strong><p>{{ plan.summary || '旧计划' }}</p>
                  <small v-for="day in plan.days || []" :key="day.day">DAY {{ day.day }} · 第 {{ day.evidence?.questionNumber || day.evidenceQuestionNumbers?.[0] || '—' }} 题 · {{ day.focus || '练习任务' }}</small>
                </div>
              </details>
              <p class="skill-review-note">计划是复习草稿；再练习分数是模型对本次回答的反馈，不等同于客观能力提升。不会自动创建笔记或待办。</p>
            </template>
              <p v-else class="skill-review-empty">{{ !reviewPolicyReady ? '复习计划暂不可生成，请先同步后端服务。' : requiredQuestions.length ? '结束面试后可主动生成；计划会引用本场题目与评分缺失点。' : '本场原题均达到 4/5 且无缺失点，暂无必练题；原答和评分仍可在下方逐题回看。' }}</p>
          </article>

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
.review-hero { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: clamp(32px,4vw,64px); padding: 34px 40px; border-radius: 22px; color: #fff; background: linear-gradient(125deg,#20203e,#393578 66%,#315f70); }.review-hero > div:first-child { min-width: 0; }.review-hero h1 { max-width: 760px; margin: 9px 0; font-size: clamp(26px,3vw,38px); line-height: 1.2; letter-spacing: -.03em; }.review-hero p { max-width: 690px; color: #bcbcd3; font-size: 12px; line-height: 1.7; }.review-hero .io-eyebrow { color: #9e9ad9; }.archive-stats { display: flex; align-items: center; justify-content: space-around; justify-self: end; gap: 22px; min-width: 210px; padding: 16px 20px; border: 1px solid rgba(255,255,255,.13); border-radius: 14px; background: rgba(255,255,255,.07); }.archive-stats div { display: flex; min-width: 66px; flex-direction: column; align-items: center; }.archive-stats strong { font-size: 27px; }.archive-stats span { margin-top: 3px; color: #aaaac4; font-size: 9px; }.archive-stats i { width: 1px; height: 38px; background: rgba(255,255,255,.13); }
.archive-layout { display: grid; grid-template-columns: 280px minmax(0,1fr); gap: 16px; margin-top: 16px; }.session-sidebar { align-self: start; max-height: calc(100vh - 190px); padding: 20px 13px; overflow-y: auto; }.session-sidebar .io-section-heading { padding: 0 8px; }.archive-list { display: grid; gap: 6px; }.archive-entry { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; border-radius: 11px; }.archive-entry:hover { background: #f7f7fb; }.archive-entry.active { background: #f0eeff; }.archive-list .session-select { display: grid; grid-template-columns: 39px minmax(0,1fr); gap: 10px; align-items: center; min-width: 0; width: 100%; padding: 10px; color: inherit; background: transparent; text-align: left; cursor: pointer; }.archive-list .session-select > div { min-width: 0; }.archive-list .session-delete { margin-right: 6px; color: #9295a6; }.archive-list .session-delete:hover { color: #d45151; background: #fff0f0; }.mini-score { display: grid; place-items: center; width: 39px; height: 39px; border-radius: 11px; color: #6157e8; background: #ebe9ff; font-size: 11px; font-weight: 800; }.mini-score.active { color: #cf792d; background: #fff0df; }.archive-list strong { display: block; overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }.archive-list p,.archive-list small { display: block; margin-top: 2px; color: #999bab; font-size: 8px; }.detail-column { min-height: 300px; }.score-overview { display: grid; grid-template-columns: minmax(170px,.75fr) 100px minmax(280px,1fr); gap: 22px; align-items: center; padding: 24px; }.score-overview h2 { margin-top: 5px; font-size: 18px; }.score-overview p { margin-top: 5px; color: #9699a9; font-size: 9px; }.hero-score { display: flex; flex-direction: column; align-items: center; padding: 13px; border-radius: 14px; color: #6157e8; background: #efedff; }.hero-score strong { font-size: 33px; }.hero-score span { font-size: 8px; }.dimension-bars { display: grid; grid-template-columns: repeat(2,1fr); gap: 9px 18px; }.dimension-bars > div { display: grid; grid-template-columns: 65px 1fr 20px; gap: 7px; align-items: center; }.dimension-bars span,.dimension-bars b { color: #777a8c; font-size: 8px; }.dimension-bars :deep(.el-progress-bar__inner) { background: #7167ed; }
.insight-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 13px; margin-top: 13px; }.insight-card { padding: 17px; }.insight-card > span { display: flex; align-items: center; gap: 6px; color: #65697b; font-size: 10px; font-weight: 700; }.insight-card ul,.insight-card ol { display: grid; gap: 7px; margin-top: 12px; list-style: none; }.insight-card li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px; border-radius: 8px; color: #6c7081; background: #f8f8fb; font-size: 9px; }.insight-card li strong { font-size: 9px; }.insight-card li em { color: #8b8e9e; font-style: normal; }.insight-card.action li { justify-content: flex-start; line-height: 1.5; }.insight-card.action b { display: grid; flex: 0 0 19px; place-items: center; width: 19px; height: 19px; border-radius: 6px; color: #6157e8; background: #ebe9ff; font-size: 8px; }.strength { border-color: #dcefe9; }.gap { border-color: #f3e3d1; }.action { border-color: #e2e0f7; }
.skill-review-panel { margin-top: 13px; padding: 23px; }.skill-review-summary { margin-top: 13px; color: #52566d; font-size: 12px; line-height: 1.7; }.skill-review-focus { margin-top: 15px; padding: 12px 14px; border-radius: 10px; background: #fff7ec; }.skill-review-focus span { color: #9b6b32; font-size: 10px; font-weight: 700; }.skill-review-focus p { margin-top: 6px; color: #6d6870; font-size: 10px; line-height: 1.6; }.skill-review-days { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,250px),1fr)); gap: 10px; margin-top: 14px; }.skill-review-days section { padding: 14px; border: 1px solid #e7e4fb; border-radius: 10px; background: #faf9ff; }.skill-review-days strong { color: #6157ad; font-size: 11px; }.skill-review-days p { margin-top: 9px; color: #4d5063; font-size: 10px; line-height: 1.6; }.skill-review-days small { display: block; margin-top: 11px; color: #818397; font-size: 9px; line-height: 1.5; }.skill-review-note,.skill-review-empty { margin-top: 13px; color: #8e91a2; font-size: 10px; line-height: 1.6; }
.review-queue { margin-top: 14px; padding: 14px; border: 1px solid #e7e5f8; border-radius: 11px; background: #faf9ff; }.review-queue > strong { color: #514c91; font-size: 12px; }.review-queue > p { margin-top: 6px; color: #85889a; font-size: 10px; line-height: 1.6; }.review-queue ol { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 11px; list-style: none; }.review-queue li { display: flex; align-items: center; gap: 6px; padding: 7px 9px; border-radius: 7px; background: #fff; color: #55596e; font-size: 10px; }.review-queue li b { color: #6259db; }.review-queue li em { color: #9b6b32; font-style: normal; }.review-queue li small { color: #9598a9; }.next-cycle-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; }.next-cycle-row p { color: #777a8e; font-size: 11px; }
.review-complete { margin-top: 14px; padding: 14px; border: 1px solid #cce9df; border-radius: 11px; background: #f3fbf8; }.review-complete > strong { color: #246b59; font-size: 13px; }.review-complete > p { margin-top: 7px; color: #5d756d; font-size: 11px; line-height: 1.6; }.reinforcement-item { margin-top: 10px; padding: 11px; border: 1px solid #dbece6; border-radius: 8px; background: #fff; }.reinforcement-item > div:first-child { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }.reinforcement-item > div:first-child strong { color: #36594e; font-size: 11px; }.reinforcement-item > div:first-child span { color: #8a978f; font-size: 10px; }
.review-old-plan-note { margin-top: 13px; padding: 10px 12px; border: 1px solid #f1dfbc; border-radius: 8px; background: #fff8ed; color: #8b683b; font-size: 11px; line-height: 1.6; }
.review-history { margin-top: 14px; padding: 12px 14px; border: 1px solid #e7e5f8; border-radius: 10px; }.review-history summary { color: #6259ba; cursor: pointer; font-size: 11px; font-weight: 700; }.review-history > div { padding: 10px 0; border-top: 1px solid #efedf8; }.review-history > div:first-of-type { margin-top: 10px; }.review-history strong { color: #4f5270; font-size: 11px; }.review-history p,.review-history small { display: block; margin-top: 5px; color: #85889a; font-size: 10px; line-height: 1.5; }
.review-history .review-history-note { margin-top: 10px; color: #8a6a39; }
.skill-legacy-warning { margin-top: 16px; padding: 18px; border: 1px solid #f3d7ab; border-radius: 12px; background: #fff8ea; color: #694d26; }.skill-legacy-warning strong { font-size: 14px; }.skill-legacy-warning p { margin: 10px 0 14px; font-size: 12px; line-height: 1.7; }
.skill-review-days strong { font-size: 13px; line-height: 1.5; }.skill-review-days p { font-size: 13px; line-height: 1.65; overflow-wrap: anywhere; }.skill-review-days small { font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }.practice-result { font-size: 12px; }
.transcript-panel { margin-top: 13px; padding: 23px; }.question-title { display: grid; grid-template-columns: 32px 1fr auto; gap: 10px; align-items: center; width: 100%; padding-right: 8px; }.question-title > span { color: #6157e8; font-size: 9px; font-weight: 800; }.question-title strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.question-title em { color: #696d80; font-size: 9px; font-style: normal; }.turn-detail { padding: 4px 8px 15px; }.turn-detail section > span { color: #777a8e; font-size: 9px; font-weight: 700; }.turn-detail section > p { margin-top: 7px; color: #585c70; font-size: 10px; line-height: 1.75; white-space: pre-wrap; }.turn-columns { display: grid; grid-template-columns: repeat(2,1fr); gap: 10px; margin-top: 13px; }.turn-columns section,.structure { padding: 13px; border-radius: 10px; }.evidence { background: #eefaf7; }.missing { background: #fff6eb; }.turn-columns ul { display: grid; gap: 5px; margin: 7px 0 0 15px; color: #686c7c; font-size: 9px; line-height: 1.6; }.structure { margin-top: 10px; background: #f5f3ff; }.active-session,.empty-archive { display: flex; min-height: 330px; flex-direction: column; align-items: center; justify-content: center; text-align: center; }.active-session > span,.empty-archive > span { display: grid; place-items: center; width: 50px; height: 50px; border-radius: 15px; color: #6157e8; background: #efedff; font-size: 24px; }.active-session h2,.empty-archive h2 { margin-top: 14px; font-size: 18px; }.active-session p,.empty-archive p { max-width: 480px; margin: 7px 0 14px; color: #8e91a2; font-size: 10px; }.empty-archive { margin-top: 16px; }
@media(max-width:1050px){.archive-layout{grid-template-columns:1fr}.session-sidebar{max-height:none}.archive-list{grid-template-columns:repeat(3,1fr)}.score-overview{grid-template-columns:1fr 100px}.dimension-bars{grid-column:1/-1}}
@media(max-width:940px){.review-hero{grid-template-columns:1fr;gap:24px}.archive-stats{justify-self:start}}
@media(max-width:760px){.archive-list,.insight-grid,.skill-review-days{grid-template-columns:1fr}.score-overview{grid-template-columns:1fr}.hero-score{align-items:flex-start}.dimension-bars,.turn-columns{grid-template-columns:1fr}}
@media(max-width:680px){.archive-stats{justify-self:stretch;justify-content:center;width:100%}}
@media(max-width:760px){.next-cycle-row{align-items:flex-start;flex-direction:column}}
.practice-evidence { padding: 8px; border-left: 2px solid #8d81ed; border-radius: 4px; background: #f2f0ff; white-space: pre-wrap; }.practice-open { margin-top: 12px; }.practice-editor { display: grid; gap: 10px; margin-top: 12px; }.practice-editor .practice-question { margin: 0; font-weight: 700; }.practice-editor :deep(.el-button) { justify-self: start; }.practice-result { margin-top: 12px; padding: 10px; border-radius: 8px; background: #eef8f5; color: #4d5d5a; font-size: 10px; line-height: 1.6; }.practice-result b { display: block; margin-bottom: 5px; color: #2e6960; }.practice-result p { white-space: pre-wrap; }.practice-result details { margin-top: 8px; }.practice-result summary { cursor: pointer; }.practice-result details p { margin-top: 7px; }
</style>
