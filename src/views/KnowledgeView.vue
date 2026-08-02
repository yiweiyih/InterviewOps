<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Collection, Delete, DocumentAdd, Lock, Search } from '@element-plus/icons-vue'
import { apiUrl, authHeaders } from '../utils/api'

const uploading = ref(false)
const loading = ref(false)
const uploadedFiles = ref([])
const fileInput = ref(null)
const category = ref('resume')

const ACCEPT = '.docx,.pdf,.md,.markdown,.txt,.json'
const categories = [
  { value: 'resume', label: '个人简历' },
  { value: 'jd', label: '目标 JD' },
  { value: 'project', label: '项目资料' },
  { value: 'transcript', label: '面试记录' },
  { value: 'other', label: '其他笔记' }
]
const documentCount = computed(() => uploadedFiles.value.length)
const chunkCount = computed(() => uploadedFiles.value.reduce((total, document) => total + (document.chunks || 0), 0))

async function loadDocuments() {
  loading.value = true
  try {
    const res = await fetch(apiUrl('/api/knowledge'), { headers: authHeaders() })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '知识库加载失败')
    uploadedFiles.value = (data.documents || []).map(document => ({
      ...document,
      time: document.indexedAt ? new Date(document.indexedAt).toLocaleString() : '-'
    }))
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    loading.value = false
  }
}

async function handleUpload(e) {
  const file = e.target.files[0]
  if (!file) return
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    form.append('category', category.value)
    const res = await fetch(apiUrl('/api/knowledge/upload'), {
      method: 'POST',
      headers: authHeaders(),
      body: form
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    await loadDocuments()
    ElMessage.success(`「${data.name}」已建索引，共 ${data.chunks} 个片段`)
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function removeFile(document) {
  try {
    await ElMessageBox.confirm(`确定删除「${document.name}」及其全部向量索引吗？`, '删除知识文档', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    const res = await fetch(apiUrl(`/api/knowledge/${encodeURIComponent(document.name)}`), {
      method: 'DELETE',
      headers: authHeaders()
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '删除失败')
    await loadDocuments()
    ElMessage.success(`已删除「${document.name}」的 ${data.removedChunks} 个索引片段`)
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '删除失败')
  }
}

onMounted(loadDocuments)
</script>

<template>
  <div class="knowledge-page">
    <section class="knowledge-hero">
      <div class="hero-copy">
        <div class="eyebrow">EVIDENCE LIBRARY</div>
        <h1>把简历、JD 和项目材料变成可追问的证据库</h1>
        <p>支持直接上传 DOCX 与 PDF。模拟面试会从你的真实资料中生成问题，备战教练引用内容时会保留来源。</p>
        <div class="trust-row">
          <span><el-icon><Lock /></el-icon> 私有用户隔离</span>
          <span><el-icon><Search /></el-icon> 来源可追溯</span>
          <span><el-icon><Collection /></el-icon> 索引可删除</span>
        </div>
      </div>
      <div class="knowledge-stats">
        <div><strong>{{ documentCount }}</strong><span>文档</span></div>
        <i></i>
        <div><strong>{{ chunkCount }}</strong><span>索引片段</span></div>
      </div>
    </section>

    <section class="workspace-grid">
      <div class="upload-card">
        <input ref="fileInput" type="file" :accept="ACCEPT" style="display:none" @change="handleUpload" />
        <div class="category-picker">
          <span>资料类型</span>
          <el-segmented v-model="category" :options="categories.map(item => ({ label: item.label, value: item.value }))" />
        </div>
        <button class="upload-zone" :disabled="uploading" @click="fileInput?.click()">
          <span class="upload-icon"><el-icon><DocumentAdd /></el-icon></span>
          <strong>{{ uploading ? '正在解析、切分并建立索引…' : '上传面试资料' }}</strong>
          <small>支持 DOCX、PDF、Markdown、TXT、JSON · 单文件最大 5 MB</small>
          <em>{{ uploading ? '请稍候' : '浏览本地文件' }}</em>
        </button>
      </div>

      <div class="pipeline-card">
        <div class="card-heading"><span>EVIDENCE PIPELINE</span><h2>资料如何参与训练</h2></div>
        <ol>
          <li><b>01</b><div><strong>解析与分块</strong><span>从 DOCX / PDF 提取原始文字</span></div></li>
          <li><b>02</b><div><strong>用户级索引</strong><span>写入资料类型、来源与用户归属</span></div></li>
          <li><b>03</b><div><strong>针对性追问</strong><span>按岗位与训练模式召回证据</span></div></li>
        </ol>
      </div>
    </section>

    <section class="file-list">
      <div class="card-heading file-heading">
        <div><span>MATERIALS</span><h2>已索引面试资料</h2></div>
        <small>当前账户 · {{ documentCount }} 个文件</small>
      </div>
      <el-table v-loading="loading" :data="uploadedFiles" stripe>
        <el-table-column prop="name" label="文件名" min-width="220" />
        <el-table-column label="资料类型" width="110">
          <template #default="{ row }"><el-tag size="small" effect="plain">{{ categories.find(item => item.value === row.category)?.label || '其他笔记' }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="chunks" label="片段数" width="100" />
        <el-table-column prop="time" label="上传时间" width="180" />
        <el-table-column label="操作" width="100" align="right">
          <template #default="{ row }">
            <el-button type="danger" size="small" text :icon="Delete" @click="removeFile(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-state">
            <el-icon><Collection /></el-icon>
            <strong>还没有索引文档</strong>
            <span>建议先上传简历与一个代表性项目，再开始模拟面试</span>
          </div>
        </template>
      </el-table>
      <p class="privacy-note"><el-icon><Lock /></el-icon> 文档、向量与检索结果均按用户隔离；删除文件会同步移除其全部索引片段。</p>
    </section>
  </div>
</template>

<style scoped>
.knowledge-page { min-width: 0; height: 100%; overflow-y: auto; padding: 28px; background: #f4f7fb; }
.knowledge-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 28px; padding: 30px 34px; color: #fff; border-radius: 22px; background: linear-gradient(125deg, #20203e, #3b367d 68%, #286e70); box-shadow: 0 16px 36px rgba(34,31,76,.16); }
.hero-copy { min-width: 0; }
.eyebrow, .card-heading > span, .card-heading > div > span { color: #82a5be; font-size: 9px; letter-spacing: .15em; }
.hero-copy h1 { margin: 10px 0; font-size: clamp(25px, 3vw, 36px); line-height: 1.2; }
.hero-copy > p { max-width: 720px; color: #bfd1df; line-height: 1.7; }
.trust-row { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 18px; color: #d9e7ef; font-size: 12px; }
.trust-row span { display: inline-flex; align-items: center; gap: 5px; }
.knowledge-stats { display: flex; flex: 0 0 auto; align-items: center; gap: 24px; padding: 18px 22px; border: 1px solid rgba(255,255,255,.13); border-radius: 13px; background: rgba(255,255,255,.07); backdrop-filter: blur(8px); }
.knowledge-stats div { display: flex; flex-direction: column; align-items: center; min-width: 64px; }
.knowledge-stats strong { font-size: 28px; }
.knowledge-stats span { margin-top: 3px; color: #9db8ca; font-size: 11px; }
.knowledge-stats i { width: 1px; height: 42px; background: rgba(255,255,255,.16); }
.workspace-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(320px, .75fr); gap: 18px; margin-top: 18px; }
.upload-card, .pipeline-card, .file-list { padding: 22px; border: 1px solid #e4ebf2; border-radius: 14px; background: #fff; box-shadow: 0 6px 20px rgba(31,49,70,.04); }
.category-picker { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.category-picker > span { flex: 0 0 auto; color: #596075; font-size: 11px; font-weight: 600; }
.category-picker :deep(.el-segmented) { max-width: 100%; overflow-x: auto; }
.upload-zone { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; min-height: 210px; padding: 24px; border: 1px dashed #9bbce1; border-radius: 11px; color: inherit; background: linear-gradient(145deg, #f8fbff, #f3f7fc); cursor: pointer; transition: .2s ease; }
.upload-zone:hover { border-color: #397fc8; background: #f3f8ff; }
.upload-zone:disabled { cursor: wait; opacity: .7; }
.upload-icon { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 13px; color: #2a73bd; background: #e8f2ff; font-size: 24px; }
.upload-zone strong { margin-top: 13px; color: #20334b; font-size: 15px; }
.upload-zone small { margin-top: 7px; color: #8997a6; }
.upload-zone em { margin-top: 15px; padding: 6px 12px; border-radius: 7px; color: #2b6fb4; background: #e7f1fc; font-size: 11px; font-style: normal; }
.card-heading h2 { margin-top: 4px; color: #233248; font-size: 18px; }
.pipeline-card ol { display: grid; gap: 10px; margin-top: 18px; list-style: none; }
.pipeline-card li { display: grid; grid-template-columns: 34px 1fr; gap: 11px; align-items: center; padding: 12px; border-radius: 10px; background: #f7f9fc; }
.pipeline-card b { color: #3d79b6; font-size: 11px; }
.pipeline-card li div { display: flex; flex-direction: column; gap: 3px; }
.pipeline-card li strong { color: #344256; font-size: 13px; }
.pipeline-card li span { color: #8995a2; font-size: 11px; }
.file-list { margin-top: 18px; }
.file-heading { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 14px; }
.file-heading small { color: #8a97a4; }
.empty-state { display: flex; flex-direction: column; align-items: center; padding: 26px 0; color: #8491a0; }
.empty-state > .el-icon { margin-bottom: 9px; color: #82a5c8; font-size: 28px; }
.empty-state strong { color: #536273; font-size: 13px; }
.empty-state span { margin-top: 4px; font-size: 11px; }
.privacy-note { display: flex; align-items: center; gap: 6px; margin-top: 13px; padding: 10px 12px; border-radius: 8px; color: #64778a; background: #f4f7fa; font-size: 11px; }
@media (max-width: 940px) { .knowledge-hero { align-items: flex-start; flex-direction: column; } .workspace-grid { grid-template-columns: 1fr; } }
@media (max-width: 680px) { .knowledge-page { padding: 16px; } .knowledge-hero { padding: 24px; } .knowledge-stats { width: 100%; justify-content: center; } }
</style>
