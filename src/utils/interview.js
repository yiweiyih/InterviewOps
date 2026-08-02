import { requestJson } from './api'

export const dimensionLabels = {
  problem: '问题定义',
  fundamentals: '基础准确性',
  depth: '技术深度',
  tradeoff: '取舍意识',
  ownership: '个人贡献',
  evidence: '事实与指标',
  structure: '表达结构',
  communication: '沟通清晰度',
  reflection: '复盘成长'
}

export function formatDate(value, fallback = '未设置') {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

export function scoreTone(score) {
  if (score >= 80) return 'excellent'
  if (score >= 60) return 'steady'
  return 'improve'
}

export const interviewApi = {
  getWorkspace: () => requestJson('/api/interview/workspace'),
  saveWorkspace: workspace => requestJson('/api/interview/workspace', {
    method: 'PUT', body: JSON.stringify(workspace)
  }),
  listSessions: () => requestJson('/api/interview/sessions'),
  getSession: id => requestJson(`/api/interview/sessions/${id}`),
  startSession: options => requestJson('/api/interview/sessions', {
    method: 'POST', body: JSON.stringify(options)
  }),
  answerSession: (id, answer) => requestJson(`/api/interview/sessions/${id}/answer`, {
    method: 'POST', body: JSON.stringify({ answer })
  }),
  completeSession: id => requestJson(`/api/interview/sessions/${id}/complete`, { method: 'POST' })
}
