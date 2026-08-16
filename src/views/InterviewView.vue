<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowRight, Check, Clock, Microphone, Refresh, Trophy } from '@element-plus/icons-vue'
import { dimensionLabels, interviewApi, scoreTone } from '../utils/interview'
import { inferInterviewQuestionCount, inferInterviewRecommendation } from '../utils/interviewMode'

const loading = ref(true)
const starting = ref(false)
const submitting = ref(false)
const ending = ref(false)
const isListening = ref(false)
const session = ref(null)
const modes = ref({})
const workspace = ref(null)
const answer = ref('')
const showFeedback = ref(false)
const elapsedSeconds = ref(0)
const recommendation = ref({ mode: 'comprehensive', reason: '' })
const setup = reactive({ mode: 'comprehensive', difficulty: '进阶', questionCount: 4 })
let timer = null
let speechRecognition = null
let dictationBase = ''
let finalTranscript = ''

const SpeechRecognition = typeof window === 'undefined'
  ? null
  : window.SpeechRecognition || window.webkitSpeechRecognition
const speechSupported = Boolean(SpeechRecognition)
const visibleModes = computed(() => Object.fromEntries(
  Object.entries(modes.value).filter(([, config]) => !config.hidden)
))
const focusAreas = computed(() => workspace.value?.profile?.focusAreas || [])
const targetRole = computed(() => (
  workspace.value?.profile?.targetRole
  || workspace.value?.target?.jobTitle
  || '未设置，将按通用能力出题'
))

const progress = computed(() => {
  if (!session.value) return 0
  return Math.round((session.value.turns.length / session.value.questionCount) * 100)
})
const latestTurn = computed(() => session.value?.turns?.at(-1))
const timerText = computed(() => `${String(Math.floor(elapsedSeconds.value / 60)).padStart(2, '0')}:${String(elapsedSeconds.value % 60).padStart(2, '0')}`)

function startTimer(startedAt) {
  clearInterval(timer)
  const update = () => { elapsedSeconds.value = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)) }
  update()
  timer = setInterval(update, 1000)
}

async function initialize() {
  loading.value = true
  try {
    const [workspaceData, sessionData] = await Promise.all([interviewApi.getWorkspace(), interviewApi.listSessions()])
    modes.value = workspaceData.modes
    workspace.value = workspaceData.workspace
    const active = sessionData.sessions.find(item => item.status === 'active')
    if (active) {
      session.value = (await interviewApi.getSession(active.id)).session
      startTimer(session.value.startedAt)
    } else {
      recommendation.value = inferInterviewRecommendation(workspaceData.workspace)
      setup.mode = recommendation.value.mode
      setup.questionCount = inferInterviewQuestionCount(workspaceData.workspace)
    }
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    loading.value = false
  }
}

async function startInterview() {
  starting.value = true
  try {
    session.value = (await interviewApi.startSession(setup)).session
    answer.value = ''
    showFeedback.value = false
    startTimer(session.value.startedAt)
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    starting.value = false
  }
}

async function submitAnswer() {
  if (answer.value.trim().length < 20) {
    ElMessage.warning('请至少回答 20 个字符，给复盘留下有效证据')
    return
  }
  submitting.value = true
  try {
    session.value = (await interviewApi.answerSession(session.value.id, answer.value)).session
    answer.value = ''
    showFeedback.value = session.value.status === 'active'
    if (session.value.status === 'completed') clearInterval(timer)
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    submitting.value = false
  }
}

function nextQuestion() {
  showFeedback.value = false
}

function appendDictation(interimTranscript = '') {
  const transcript = `${finalTranscript}${interimTranscript}`.trim()
  answer.value = [dictationBase, transcript].filter(Boolean).join(dictationBase && transcript ? '\n' : '')
}

function stopDictation() {
  speechRecognition?.stop()
}

function toggleDictation() {
  if (!speechSupported) {
    ElMessage.warning('当前浏览器不支持语音输入，请使用 Chrome 或 Edge')
    return
  }
  if (isListening.value) {
    stopDictation()
    return
  }

  dictationBase = answer.value.trim()
  finalTranscript = ''
  speechRecognition = new SpeechRecognition()
  speechRecognition.lang = 'zh-CN'
  speechRecognition.continuous = true
  speechRecognition.interimResults = true
  speechRecognition.onstart = () => { isListening.value = true }
  speechRecognition.onresult = event => {
    let interimTranscript = ''
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript
      if (event.results[index].isFinal) finalTranscript += transcript
      else interimTranscript += transcript
    }
    appendDictation(interimTranscript)
  }
  speechRecognition.onerror = event => {
    const message = event.error === 'not-allowed'
      ? '未获得麦克风权限，请在浏览器设置中允许后重试'
      : '语音识别中断，请稍后重试'
    if (event.error !== 'no-speech' && event.error !== 'aborted') ElMessage.error(message)
  }
  speechRecognition.onend = () => {
    isListening.value = false
    speechRecognition = null
  }
  speechRecognition.start()
}

async function endInterview() {
  try {
    const answeredQuestions = session.value.turns.length
    const message = answeredQuestions
      ? `现在结束后，会基于已回答的 ${answeredQuestions} 道问题生成阶段性复盘。`
      : '你还没有提交回答，现在结束将保留这场记录，但不会生成有效评分。'
    await ElMessageBox.confirm(message, '提前结束模拟', { confirmButtonText: '确认结束', cancelButtonText: '继续作答', type: 'warning' })
    ending.value = true
    stopDictation()
    session.value = (await interviewApi.completeSession(session.value.id)).session
    showFeedback.value = false
    clearInterval(timer)
    ElMessage.success('模拟面试已结束，阶段性复盘已生成')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message)
  } finally {
    ending.value = false
  }
}

function resetSession() {
  session.value = null
  answer.value = ''
  showFeedback.value = false
  elapsedSeconds.value = 0
}

onMounted(initialize)
onBeforeUnmount(() => {
  clearInterval(timer)
  stopDictation()
})
</script>

<template>
  <div class="io-page interview-page" v-loading="loading">
    <section v-if="!session" class="setup-layout">
      <div class="setup-copy">
        <div class="ready-pill"><span></span> INTERVIEW ROOM READY</div>
        <h1>不是随机问答，而是沿着你的经历连续追问。</h1>
        <p>系统会读取目标画像、JD 与资料索引，像真实面试官一样根据上一题的证据缺口生成下一题。</p>
        <div class="principles"><span><b>01</b> 资料驱动</span><i></i><span><b>02</b> 动态追问</span><i></i><span><b>03</b> 证据评分</span></div>
      </div>

      <article class="io-panel setup-card">
        <span class="io-eyebrow">SESSION SETUP</span><h2>创建模拟面试</h2><p class="setup-description">建议第一次选择 4 题、进阶难度，大约 15—20 分钟。</p>
        <div class="mode-field"><span>训练模式</span><div class="mode-grid"><button v-for="(config,key) in visibleModes" :key="key" :class="setup.mode === key && 'active'" @click="setup.mode = key"><strong>{{ config.label }}<mark v-if="recommendation.mode === key">画像推荐</mark></strong><small>{{ config.description }}</small><em v-if="setup.mode === key"><el-icon><Check /></el-icon></em></button></div></div>
        <p class="recommendation-hint">推荐依据：{{ recommendation.reason }}。这是默认建议，你可以自由切换。</p>
        <div class="targeting-summary">
          <div class="targeting-heading"><div><span>本场出题依据</span><strong>{{ targetRole }}</strong></div><router-link to="/profile">调整画像</router-link></div>
          <div v-if="focusAreas.length" class="targeting-tags"><span v-for="item in focusAreas" :key="item">{{ item }}</span></div>
          <p v-else>尚未选择重点领域，将结合目标岗位、JD 和个人资料综合出题。</p>
          <small v-if="focusAreas.length">以上 {{ focusAreas.length }} 项会参与资料检索，并在整场面试中优先轮换覆盖；默认题数会尽量与重点数量匹配。</small>
        </div>
        <div class="setup-row">
          <label><span>难度</span><el-segmented v-model="setup.difficulty" :options="['基础','进阶','压力']" /></label>
          <label><span>问题数</span><el-input-number v-model="setup.questionCount" :min="2" :max="8" controls-position="right" /></label>
        </div>
        <el-button type="primary" size="large" :icon="Microphone" :loading="starting" class="start-button" @click="startInterview">生成第一道针对性问题</el-button>
        <small class="boundary">仅用于面试前练习和面试后复盘，不提供真实面试中的实时代答。</small>
      </article>
    </section>

    <template v-else-if="session.status === 'active'">
      <section class="room-header">
        <div><span class="live-dot"></span><strong>{{ session.title }}</strong><small>{{ session.difficulty }}难度 · {{ modes[session.mode]?.label }}</small></div>
        <div class="room-actions"><span><el-icon><Clock /></el-icon>{{ timerText }}</span><el-button text type="danger" :loading="ending" :disabled="ending" @click="endInterview">提前结束</el-button></div>
      </section>
      <div class="progress-line"><el-progress :percentage="progress" :show-text="false" :stroke-width="5" /><span>{{ session.turns.length }} / {{ session.questionCount }} 已完成</span></div>

      <section v-if="!showFeedback" class="question-layout">
        <article class="io-panel question-card">
          <div class="question-meta"><span>QUESTION {{ String(session.turns.length + 1).padStart(2,'0') }}</span><em>{{ session.currentQuestion.competency }}</em></div>
          <h1>{{ session.currentQuestion.text }}</h1>
          <p class="rationale">为什么问：{{ session.currentQuestion.rationale }}</p>
          <div class="answer-area">
            <div class="answer-heading">
              <strong>你的回答</strong>
              <div class="answer-tools">
                <span>{{ answer.length }} / 10000</span>
                <el-button
                  size="small"
                  :type="isListening ? 'danger' : 'primary'"
                  :plain="!isListening"
                  :icon="Microphone"
                  :disabled="submitting"
                  class="dictation-button"
                  @click="toggleDictation"
                >{{ isListening ? '停止录音' : '语音输入' }}</el-button>
              </div>
            </div>
            <p v-if="isListening" class="listening-hint"><span></span>正在聆听，识别结果会实时写入回答框</p>
            <el-input v-model="answer" type="textarea" :rows="8" maxlength="10000" placeholder="像真实面试一样完整回答。建议说明背景、你的判断、关键取舍、个人贡献与可验证结果……" />
          </div>
          <div class="submit-row"><p>评分只依据你实际写下的内容，不会替你补全经历。</p><el-button type="primary" size="large" :icon="ArrowRight" :loading="submitting" :disabled="answer.trim().length < 20" @click="submitAnswer">提交并生成复盘</el-button></div>
        </article>
        <aside class="io-panel interview-tip"><span>答题提醒</span><h3>面试官在听什么？</h3><ol><li><b>结论先行</b><p>先回答问题，再补充背景。</p></li><li><b>明确主语</b><p>区分“团队做了”和“我推动了”。</p></li><li><b>说出取舍</b><p>为什么选这个方案，代价是什么。</p></li><li><b>给出证据</b><p>指标、规模、反馈或验证方法。</p></li></ol></aside>
      </section>

      <section v-else class="feedback-layout">
        <article class="io-panel feedback-card">
          <div class="feedback-top"><div><span class="io-eyebrow">INSTANT REVIEW</span><h1>{{ latestTurn.feedback.summary }}</h1></div><span class="question-score">{{ latestTurn.feedback.averageScore }}<small>/ 5</small></span></div>
          <div class="score-grid"><div v-for="(score,key) in latestTurn.feedback.scores" :key="key"><span>{{ dimensionLabels[key] }}</span><strong>{{ score }}</strong><el-progress :percentage="score*20" :show-text="false" :stroke-width="5" /></div></div>
          <div class="feedback-columns">
            <div class="feedback-block good"><span>回答中的有效证据</span><ul><li v-for="item in latestTurn.feedback.evidence" :key="item">{{ item }}</li><li v-if="!latestTurn.feedback.evidence.length">本题没有提取到明确证据</li></ul></div>
            <div class="feedback-block gap"><span>可以补强的地方</span><ul><li v-for="item in latestTurn.feedback.missingPoints" :key="item">{{ item }}</li><li v-if="!latestTurn.feedback.missingPoints.length">暂未发现明显缺口</li></ul></div>
          </div>
          <div v-if="latestTurn.feedback.betterStructure" class="better-answer"><span>更好的表达结构</span><p>{{ latestTurn.feedback.betterStructure }}</p></div>
          <div class="next-row"><p>下一题会结合本题缺口继续追问。</p><el-button type="primary" size="large" :icon="ArrowRight" @click="nextQuestion">进入第 {{ session.turns.length + 1 }} 题</el-button></div>
        </article>
      </section>
    </template>

    <section v-else-if="session.report.answeredQuestions > 0" class="report-layout">
      <article class="report-hero">
        <span class="trophy"><el-icon><Trophy /></el-icon></span><div><span class="io-eyebrow">SESSION COMPLETE</span><h1>这场模拟已经形成能力基线</h1><p>{{ session.title }} · 完成 {{ session.report.answeredQuestions }} 道问题</p></div><div :class="['overall-score',scoreTone(session.report.overallScore)]"><strong>{{ session.report.overallScore }}</strong><span>综合表现 / 100</span></div>
      </article>
      <div class="report-grid">
        <article class="io-panel dimension-panel"><div class="io-section-heading"><div><span class="io-eyebrow">RUBRIC</span><h2>能力维度</h2></div></div><div class="dimension-list"><div v-for="(score,key) in session.report.dimensionScores" :key="key"><span>{{ dimensionLabels[key] }}</span><el-progress :percentage="score*20" :stroke-width="8" :format="()=>`${score}/5`" /></div></div></article>
        <article class="io-panel action-panel"><div class="io-section-heading"><div><span class="io-eyebrow">NEXT ACTIONS</span><h2>下一轮补强重点</h2></div></div><ol v-if="session.report.nextActions.length"><li v-for="(item,index) in session.report.nextActions" :key="item"><b>{{ String(index+1).padStart(2,'0') }}</b><span>{{ item }}</span></li></ol><p v-else>本场答题较少，完成更多问题后会生成更具体的建议。</p></article>
      </div>
      <div class="report-actions"><el-button size="large" @click="$router.push(`/reviews?session=${session.id}`)">查看完整复盘档案</el-button><el-button type="primary" size="large" :icon="Refresh" @click="resetSession">再练一场</el-button></div>
    </section>

    <section v-else class="report-layout">
      <article class="io-panel empty-report">
        <span class="trophy"><el-icon><Refresh /></el-icon></span>
        <span class="io-eyebrow">SESSION ENDED</span>
        <h1>这场模拟已结束，暂无能力评分</h1>
        <p>本场没有提交回答，因此不会把 0 分计入能力基线。准备好后可以重新开始一场。</p>
        <el-button type="primary" size="large" :icon="Refresh" @click="resetSession">重新开始</el-button>
      </article>
    </section>
  </div>
</template>

<style scoped>
.interview-page { color: var(--io-ink); }.setup-layout { display: grid; grid-template-columns: minmax(0,.85fr) minmax(500px,1fr); gap: 30px; align-items: center; min-height: calc(100vh - 124px); max-width: 1220px; margin: 0 auto; }.setup-copy { padding: 30px; }.ready-pill { display: inline-flex; align-items: center; gap: 8px; padding: 7px 10px; border: 1px solid #d8d5f6; border-radius: 30px; color: #66618f; background: #f4f2ff; font-size: 9px; font-weight: 700; letter-spacing: .12em; }.ready-pill span,.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #2fc9a5; box-shadow: 0 0 0 4px rgba(47,201,165,.12); }.setup-copy h1 { max-width: 560px; margin: 20px 0 14px; font-size: clamp(33px,4vw,50px); line-height: 1.12; letter-spacing: -.04em; }.setup-copy > p { max-width: 560px; color: #75798f; font-size: 14px; line-height: 1.85; }.principles { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 27px; color: #696d81; font-size: 11px; }.principles b { margin-right: 4px; color: #6157e8; }.principles i { width: 3px; height: 3px; border-radius: 50%; background: #b9bbc7; }
.setup-card { padding: 29px; }.setup-card h2 { margin-top: 6px; font-size: 24px; }.setup-description { margin: 6px 0 22px; color: #898c9e; font-size: 11px; }.setup-card label > span,.mode-field > span { display: block; margin-bottom: 8px; color: #55596e; font-size: 11px; font-weight: 600; }.mode-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 9px; }.mode-grid button { position: relative; min-height: 90px; padding: 14px; border: 1px solid #e4e5ed; border-radius: 12px; color: inherit; background: #fafafe; text-align: left; cursor: pointer; }.mode-grid button.active { border-color: #aaa3f5; background: #f2f0ff; box-shadow: inset 0 0 0 1px #aaa3f5; }.mode-grid strong { display: flex; align-items: center; gap: 7px; padding-right: 20px; font-size: 12px; }.mode-grid mark { padding: 3px 6px; border-radius: 5px; color: #5b52d6; background: #e8e5ff; font-size: 8px; font-weight: 700; }.mode-grid small { display: block; margin-top: 6px; color: #9295a7; font-size: 9px; line-height: 1.5; }.mode-grid em { position: absolute; top: 9px; right: 9px; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; color: #fff; background: #6157e8; font-style: normal; }.recommendation-hint { margin: 9px 0 0; color: #8a8da0; font-size: 9px; line-height: 1.5; }.setup-row { display: grid; grid-template-columns: 1fr 140px; gap: 15px; margin-top: 18px; }.setup-row :deep(.el-segmented) { width: 100%; }.start-button { width: 100%; margin-top: 22px; }.boundary { display: block; margin-top: 11px; color: #9b9eae; font-size: 9px; text-align: center; }
.targeting-summary { margin-top: 14px; padding: 13px 14px; border: 1px solid #e7e5f8; border-radius: 11px; background: #faf9ff; }.targeting-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.targeting-heading > div { display: flex; min-width: 0; align-items: baseline; gap: 8px; }.targeting-heading span { flex: 0 0 auto; color: #8c89a4; font-size: 9px; }.targeting-heading strong { overflow: hidden; color: #3d3b54; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.targeting-heading a { flex: 0 0 auto; color: #6259db; font-size: 9px; text-decoration: none; }.targeting-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }.targeting-tags span { padding: 4px 7px; border-radius: 6px; color: #5c55c7; background: #eeecff; font-size: 9px; }.targeting-summary > p,.targeting-summary > small { display: block; margin-top: 9px; color: #9295a7; font-size: 9px; line-height: 1.55; }
.room-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; max-width: 1200px; margin: 0 auto; padding: 9px 4px 15px; }.room-header > div:first-child { display: grid; grid-template-columns: auto 1fr; gap: 2px 9px; align-items: center; }.room-header strong { font-size: 13px; }.room-header small { grid-column: 2; color: #9295a5; font-size: 9px; }.room-actions { display: flex; align-items: center; gap: 12px; }.room-actions > span { display: flex; align-items: center; gap: 5px; color: #65697e; font-size: 11px; font-variant-numeric: tabular-nums; }.progress-line { display: flex; align-items: center; gap: 12px; max-width: 1200px; margin: 0 auto 14px; }.progress-line .el-progress { flex: 1; }.progress-line :deep(.el-progress-bar__inner) { background: linear-gradient(90deg,#6157e8,#8d84f2); }.progress-line span { color: #898c9d; font-size: 9px; }
.question-layout { display: grid; grid-template-columns: minmax(0,1fr) 240px; gap: 15px; max-width: 1200px; margin: 0 auto; }.question-card { padding: 30px; }.question-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.question-meta span { color: #817ae0; font-size: 9px; font-weight: 800; letter-spacing: .15em; }.question-meta em { padding: 5px 8px; border-radius: 7px; color: #5c5797; background: #f0eeff; font-size: 9px; font-style: normal; }.question-card > h1 { max-width: 860px; margin: 17px 0 10px; overflow-wrap: anywhere; font-size: clamp(20px,1.8vw,26px); font-weight: 650; line-height: 1.55; letter-spacing: -.015em; text-wrap: pretty; }.rationale { max-width: 860px; color: #8c8f9f; font-size: 10px; line-height: 1.65; }.answer-area { margin-top: 24px; padding-top: 18px; border-top: 1px solid #ececf2; }.answer-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }.answer-heading strong { font-size: 11px; }.answer-tools { display: flex; align-items: center; gap: 9px; }.answer-tools > span { color: #999cab; font-size: 9px; }.dictation-button { min-width: 92px; }.listening-hint { display: flex; align-items: center; gap: 7px; margin: -1px 0 9px; color: #d14a55; font-size: 10px; }.listening-hint span { width: 7px; height: 7px; border-radius: 50%; background: #e5535f; box-shadow: 0 0 0 4px rgba(229,83,95,.12); animation: listening-pulse 1.4s ease-in-out infinite; }.answer-area :deep(.el-textarea__inner) { min-height: 210px; padding: 15px; font-size: 13px; line-height: 1.75; }.submit-row,.next-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 16px; }.submit-row p,.next-row p { color: #999baa; font-size: 9px; }.interview-tip { align-self: start; padding: 21px; }.interview-tip > span { color: #8b86c1; font-size: 9px; font-weight: 700; letter-spacing: .12em; }.interview-tip h3 { margin-top: 7px; font-size: 15px; }.interview-tip ol { display: grid; gap: 14px; margin-top: 20px; list-style: none; counter-reset: item; }.interview-tip li { position: relative; padding-left: 13px; border-left: 2px solid #e2e0fa; }.interview-tip b { font-size: 11px; }.interview-tip p { margin-top: 3px; color: #9699a9; font-size: 9px; line-height: 1.55; }
@keyframes listening-pulse { 50% { opacity: .45; transform: scale(.82); } }
.feedback-layout { max-width: 980px; margin: 0 auto; }.feedback-card { padding: 30px; }.feedback-top { display: flex; align-items: center; justify-content: space-between; gap: 20px; }.feedback-top h1 { max-width: 700px; margin-top: 7px; font-size: 23px; }.question-score { display: flex; align-items: baseline; gap: 3px; color: #6157e8; font-size: 32px; font-weight: 800; }.question-score small { color: #9997b3; font-size: 11px; }.score-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 10px; margin-top: 24px; }.score-grid > div { padding: 13px; border-radius: 11px; background: #f8f8fc; }.score-grid span { color: #777a8f; font-size: 9px; }.score-grid strong { display: block; margin: 5px 0; font-size: 18px; }.score-grid :deep(.el-progress-bar__inner) { background: #756bed; }.feedback-columns { display: grid; grid-template-columns: repeat(2,1fr); gap: 12px; margin-top: 14px; }.feedback-block { padding: 17px; border-radius: 12px; }.feedback-block.good { background: #eefaf7; }.feedback-block.gap { background: #fff6eb; }.feedback-block > span,.better-answer > span { font-size: 10px; font-weight: 700; }.feedback-block ul { display: grid; gap: 7px; margin: 11px 0 0 17px; color: #686c7c; font-size: 10px; line-height: 1.6; }.better-answer { margin-top: 12px; padding: 17px; border: 1px solid #e6e4fa; border-radius: 12px; background: #faf9ff; }.better-answer p { margin-top: 7px; color: #6f7183; font-size: 11px; line-height: 1.7; }
.report-layout { max-width: 1050px; margin: 0 auto; }.report-hero { display: grid; grid-template-columns: auto 1fr auto; gap: 18px; align-items: center; padding: 28px 32px; border-radius: 20px; color: #fff; background: linear-gradient(130deg,#242342,#413b8d); }.trophy { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 15px; color: #f8d787; background: rgba(255,255,255,.1); font-size: 24px; }.report-hero .io-eyebrow { color: #aaa7df; }.report-hero h1 { margin-top: 5px; font-size: 24px; }.report-hero p { margin-top: 5px; color: #bdbbd7; font-size: 10px; }.overall-score { display: flex; flex-direction: column; align-items: flex-end; }.overall-score strong { font-size: 45px; line-height: 1; }.overall-score span { margin-top: 5px; color: #bdbbd7; font-size: 9px; }.report-grid { display: grid; grid-template-columns: 1fr .75fr; gap: 15px; margin-top: 15px; }.dimension-panel,.action-panel { padding: 23px; }.dimension-list { display: grid; gap: 14px; }.dimension-list > div { display: grid; grid-template-columns: 90px 1fr; align-items: center; gap: 10px; }.dimension-list span { color: #696d80; font-size: 10px; }.dimension-list :deep(.el-progress-bar__inner) { background: #6d63eb; }.action-panel ol { display: grid; gap: 9px; list-style: none; }.action-panel li { display: grid; grid-template-columns: 26px 1fr; gap: 9px; padding: 11px; border-radius: 10px; background: #faf8ff; }.action-panel b { color: #6157e8; font-size: 9px; }.action-panel span,.action-panel > p { color: #676a7d; font-size: 10px; line-height: 1.55; }.report-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px; }.report-actions .el-button + .el-button { margin-left: 0; }
.empty-report { display: flex; min-height: 360px; flex-direction: column; align-items: center; justify-content: center; padding: 40px; text-align: center; }.empty-report .trophy { color: #6157e8; background: #efedff; }.empty-report .io-eyebrow { margin-top: 17px; }.empty-report h1 { margin-top: 7px; font-size: 24px; }.empty-report p { max-width: 520px; margin: 9px 0 20px; color: #85899c; font-size: 11px; line-height: 1.7; }
@media(max-width:1000px){.setup-layout{grid-template-columns:1fr;align-items:start}.setup-copy{padding:20px 0}.question-layout{grid-template-columns:1fr}.interview-tip{display:none}}
@media(max-width:720px){.mode-grid,.feedback-columns,.report-grid{grid-template-columns:1fr}.score-grid{grid-template-columns:repeat(2,1fr)}.room-header,.feedback-top,.submit-row,.next-row{align-items:flex-start;flex-direction:column}.question-card{padding:22px}.answer-heading{align-items:flex-start;flex-direction:column}.answer-tools{justify-content:space-between;width:100%}.report-hero{grid-template-columns:auto 1fr}.overall-score{grid-column:1/-1;align-items:flex-start}.report-actions{flex-direction:column}.report-actions .el-button{width:100%}}
</style>
