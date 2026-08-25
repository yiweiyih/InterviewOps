<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, DocumentChecked, MagicStick, Plus, User } from '@element-plus/icons-vue'
import { interviewApi } from '../utils/interview'

const loading = ref(true)
const saving = ref(false)
const customFocus = ref('')
const focusPresets = ['项目深挖', '岗位基础', '系统设计', '工程质量', '性能与稳定性', '沟通与协作', '行为面试']
const workspace = reactive({
  profile: { targetRole: '', seniority: '', focusAreas: [], introduction: '' },
  target: { company: '', jobTitle: '', jobDescription: '', interviewDate: '' }
})
const focusOptions = computed(() => [...new Set([...focusPresets, ...workspace.profile.focusAreas])])

const completion = computed(() => {
  const fields = [workspace.profile.targetRole, workspace.profile.introduction, workspace.target.company, workspace.target.jobTitle, workspace.target.jobDescription]
  return Math.round(fields.filter(value => String(value || '').trim()).length / fields.length * 100)
})

function toggleFocus(item) {
  const index = workspace.profile.focusAreas.indexOf(item)
  if (index >= 0) workspace.profile.focusAreas.splice(index, 1)
  else if (workspace.profile.focusAreas.length < 8) workspace.profile.focusAreas.push(item)
  else ElMessage.warning('最多选择 8 个重点训练领域')
}

function addCustomFocus() {
  const value = customFocus.value.trim().slice(0, 30)
  if (!value) return
  if (workspace.profile.focusAreas.includes(value)) {
    ElMessage.info('这个训练领域已经添加过了')
    return
  }
  if (workspace.profile.focusAreas.length >= 8) {
    ElMessage.warning('最多选择 8 个重点训练领域')
    return
  }
  workspace.profile.focusAreas.push(value)
  customFocus.value = ''
}

async function loadWorkspace() {
  loading.value = true
  try {
    const data = await interviewApi.getWorkspace()
    Object.assign(workspace.profile, data.workspace.profile)
    Object.assign(workspace.target, data.workspace.target)
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    loading.value = false
  }
}

async function saveWorkspace() {
  saving.value = true
  try {
    const data = await interviewApi.saveWorkspace(workspace)
    Object.assign(workspace.profile, data.workspace.profile)
    Object.assign(workspace.target, data.workspace.target)
    ElMessage.success('目标画像已保存，下一场模拟会自动使用这些信息')
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    saving.value = false
  }
}

onMounted(loadWorkspace)
</script>

<template>
  <div class="io-page profile-page" v-loading="loading">
    <div class="profile-scroll">
      <section class="profile-hero">
        <div><span class="io-eyebrow">TARGETING LAYER</span><h1>先定义“为哪一场面试准备”</h1><p>同一段项目经历，面对不同公司和岗位，追问重点完全不同。目标画像让每一道题都有上下文。</p></div>
        <div class="completion-ring"><el-progress type="circle" :percentage="completion" :width="82" :stroke-width="7" color="#7f75ef" /><span>画像完整度</span></div>
      </section>

      <section class="profile-grid">
        <div class="form-stack">
          <article class="io-panel form-panel">
            <div class="panel-title"><span><el-icon><User /></el-icon></span><div><small>01 · CANDIDATE</small><h2>候选人画像</h2><p>描述你的求职方向与希望重点训练的能力。</p></div></div>
            <div class="two-columns">
              <label><span>目标方向</span><el-input v-model="workspace.profile.targetRole" maxlength="80" placeholder="例如：后端开发 / 测试开发 / AI 应用工程" /></label>
              <label><span>求职阶段</span><el-select v-model="workspace.profile.seniority" style="width:100%"><el-option v-for="item in ['校招 / 初级','社招 1—3 年','社招 3—5 年','资深 / 专家']" :key="item" :label="item" :value="item" /></el-select></label>
            </div>
            <label class="full-field"><span>个人介绍与优势证据</span><el-input v-model="workspace.profile.introduction" type="textarea" :rows="6" maxlength="2000" show-word-limit placeholder="用 3—5 句话概括：你的技术方向、最有代表性的经历、能被验证的结果。不要写空泛形容词。" /></label>
            <div class="focus-field">
              <span>重点训练领域</span>
              <div class="focus-tags"><button v-for="item in focusOptions" :key="item" :class="workspace.profile.focusAreas.includes(item) && 'active'" @click="toggleFocus(item)"><el-icon v-if="workspace.profile.focusAreas.includes(item)"><Check /></el-icon>{{ item }}</button></div>
              <div class="custom-focus"><el-input v-model="customFocus" maxlength="30" placeholder="自定义，例如：Spring Boot、自动化测试、Agent 评测" @keyup.enter="addCustomFocus" /><el-button :icon="Plus" @click="addCustomFocus">添加</el-button></div>
              <small class="focus-help">预设只描述通用能力；具体技术栈由你的目标方向、JD 和自定义领域决定，最多 8 项。</small>
            </div>
          </article>

          <article class="io-panel form-panel">
            <div class="panel-title"><span class="target"><el-icon><DocumentChecked /></el-icon></span><div><small>02 · TARGET ROLE</small><h2>目标岗位与 JD</h2><p>系统会用 JD 约束题目方向，而不是随机出题。</p></div></div>
            <div class="two-columns">
              <label><span>目标公司</span><el-input v-model="workspace.target.company" maxlength="80" placeholder="例如：目标公司 / 业务线" /></label>
              <label><span>岗位名称</span><el-input v-model="workspace.target.jobTitle" maxlength="80" placeholder="例如：后端开发工程师 / 测试开发工程师" /></label>
              <label><span>预计面试日期</span><el-date-picker v-model="workspace.target.interviewDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width:100%" /></label>
            </div>
            <label class="full-field"><span>岗位描述（JD）</span><el-input v-model="workspace.target.jobDescription" type="textarea" :rows="9" maxlength="10000" show-word-limit placeholder="粘贴岗位职责与任职要求。系统会提取技术关键词、业务场景和能力优先级。" /></label>
          </article>
        </div>

        <aside class="guidance-stack">
          <article class="io-panel guidance-card highlight"><span><el-icon><MagicStick /></el-icon></span><h3>这不是“填资料”</h3><p>画像是问题生成器的约束层。目标越清晰，追问越接近真实面试，而不是通用八股题。</p></article>
          <article class="io-panel guidance-card"><small>高质量画像公式</small><ol><li><b>方向</b><span>我要面什么岗位</span></li><li><b>证据</b><span>我做过什么、结果如何</span></li><li><b>差距</b><span>这次最想训练什么</span></li></ol></article>
          <article class="io-panel guidance-card safety"><small>证据原则</small><p>系统不会替你编造数据。没有写进画像或资料的指标，会被标为“建议补充”，不会被当成你的真实经历。</p></article>
        </aside>
      </section>
    </div>

    <div class="save-dock">
      <div class="save-bar"><p>资料只保存在你的私有工作区，模拟面试和复盘会读取最新版本。</p><el-button type="primary" size="large" :loading="saving" @click="saveWorkspace">保存并用于训练</el-button></div>
    </div>
  </div>
</template>

<style scoped>
.profile-page { display: grid; grid-template-rows: minmax(0,1fr) auto; overflow: hidden; }
.profile-scroll { min-width: 0; min-height: 0; overflow-y: auto; }
.profile-hero { display: flex; align-items: center; justify-content: space-between; gap: 30px; padding: 31px 36px; border: 1px solid #dedcf6; border-radius: 22px; background: linear-gradient(125deg,#f5f3ff,#fff 62%,#f0fbf8); }
.profile-hero h1 { margin: 8px 0; color: #1a1c32; font-size: clamp(27px,3vw,38px); letter-spacing: -.03em; }.profile-hero p { max-width: 700px; color: #74788e; font-size: 13px; line-height: 1.7; }
.completion-ring { display: flex; flex: 0 0 auto; align-items: center; gap: 12px; padding: 9px 15px 9px 9px; border-radius: 50px; background: #fff; box-shadow: 0 10px 25px rgba(56,52,108,.08); }.completion-ring span { color: #60647a; font-size: 11px; }
.profile-grid { display: grid; grid-template-areas: "form guidance"; grid-template-columns: minmax(0,1fr) 280px; gap: 17px; margin-top: 17px; }.form-stack,.guidance-stack { display: grid; align-content: start; gap: 15px; }.form-stack { grid-area: form; }.guidance-stack { grid-area: guidance; }
.form-panel { padding: 25px; }.panel-title { display: flex; gap: 13px; align-items: flex-start; margin-bottom: 23px; }.panel-title > span { display: grid; flex: 0 0 40px; place-items: center; width: 40px; height: 40px; border-radius: 12px; color: #6157e8; background: #eeecff; font-size: 19px; }.panel-title > span.target { color: #169b7b; background: #e9f9f5; }.panel-title small { color: #989bae; font-size: 8px; font-weight: 700; letter-spacing: .14em; }.panel-title h2 { margin-top: 3px; font-size: 18px; }.panel-title p { margin-top: 4px; color: #8b8ea1; font-size: 11px; }
.two-columns { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 15px; }.two-columns label,.full-field { display: block; }.two-columns label > span,.full-field > span,.focus-field > span { display: block; margin-bottom: 7px; color: #565a70; font-size: 11px; font-weight: 600; }.full-field,.focus-field { margin-top: 18px; }
.focus-tags { display: flex; flex-wrap: wrap; gap: 8px; }.focus-tags button { display: inline-flex; align-items: center; gap: 4px; padding: 7px 10px; border: 1px solid #e3e4ec; border-radius: 8px; color: #686c80; background: #fafafe; font-size: 11px; cursor: pointer; }.focus-tags button.active { border-color: #c7c2ff; color: #5148ce; background: #f0eeff; }
.custom-focus { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; max-width: 560px; margin-top: 11px; }.focus-help { display: block; margin-top: 7px; color: #989bad; font-size: 9px; line-height: 1.6; }
.save-dock { display: grid; grid-template-columns: minmax(0,1fr) 280px; gap: 17px; padding-top: 17px; }.save-bar { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 16px 18px; border: 1px solid #dad8f2; border-radius: 15px; background: rgba(255,255,255,.94); box-shadow: 0 12px 28px rgba(33,31,75,.1); backdrop-filter: blur(12px); }.save-bar p { color: #85889b; font-size: 10px; }.save-bar .el-button { flex: 0 0 auto; }
.guidance-card { padding: 21px; }.guidance-card > span { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; color: #fff; background: #6157e8; }.guidance-card h3 { margin-top: 14px; font-size: 15px; }.guidance-card p { margin-top: 8px; color: #7d8093; font-size: 11px; line-height: 1.7; }.guidance-card.highlight { border-color: #d8d4ff; background: linear-gradient(145deg,#f3f1ff,#fff); }.guidance-card small { color: #777b91; font-size: 9px; font-weight: 700; letter-spacing: .11em; }.guidance-card ol { display: grid; gap: 9px; margin-top: 14px; list-style: none; }.guidance-card li { display: flex; justify-content: space-between; padding: 9px; border-radius: 8px; background: #f7f7fb; }.guidance-card li b { font-size: 11px; }.guidance-card li span { color: #9295a7; font-size: 10px; }.guidance-card.safety { border-color: #d8eee8; background: #f4fbf9; }
@media(max-width:1050px){.profile-grid{grid-template-areas:"form" "guidance";grid-template-columns:1fr}.guidance-stack{grid-template-columns:repeat(3,1fr)}.save-dock{grid-template-columns:1fr}}
@media(max-width:760px){.profile-hero{align-items:flex-start;flex-direction:column}.two-columns{grid-template-columns:1fr}.guidance-stack{grid-template-columns:1fr}.save-bar{align-items:flex-start;flex-direction:column}.save-bar .el-button{width:100%}}
</style>
