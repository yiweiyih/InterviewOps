<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { apiUrl, authHeaders } from '../utils/api'

const uploading = ref(false)
const loading = ref(false)
const uploadedFiles = ref([])
const fileInput = ref(null)

const ACCEPT = '.md,.markdown,.txt,.json'

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
    fileInput.value.value = ''
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
    <div class="upload-card">
      <h3>上传知识文件</h3>
      <p class="hint">支持 .md .markdown .txt .json，上传后自动分块建立向量索引</p>
      <input ref="fileInput" type="file" :accept="ACCEPT" style="display:none" @change="handleUpload" />
      <el-button type="primary" :loading="uploading" @click="fileInput.click()">
        {{ uploading ? '建索引中...' : '选择文件上传' }}
      </el-button>
    </div>

    <div v-if="uploadedFiles.length" class="file-list">
      <h3>已上传文件</h3>
      <el-table v-loading="loading" :data="uploadedFiles" stripe>
        <el-table-column prop="name" label="文件名" />
        <el-table-column prop="chunks" label="片段数" width="100" />
        <el-table-column prop="time" label="上传时间" width="180" />
        <el-table-column label="操作" width="80">
          <template #default="{ row }">
            <el-button type="danger" size="small" text @click="removeFile(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="tip-card">
      <h3>使用方式</h3>
      <p>上传文件后，在 AI 对话中直接提问即可，模型会自动调用 <code>retrieve_knowledge</code> 工具检索相关片段并引用回答。</p>
    </div>
  </div>
</template>

<style scoped>
.knowledge-page { display: flex; flex-direction: column; gap: 20px; }
.upload-card, .tip-card {
  background: #fff;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 1px 4px rgba(0,0,0,.08);
}
.upload-card h3, .file-list h3, .tip-card h3 { margin: 0 0 12px; font-size: 16px; }
.hint { color: #888; font-size: 13px; margin-bottom: 16px; }
.tip-card p { color: #555; font-size: 14px; line-height: 1.7; }
.tip-card code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
.file-list { background: #fff; border-radius: 8px; padding: 24px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
</style>
