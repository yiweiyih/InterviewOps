export function inferInterviewRecommendation(workspace = {}) {
  const profile = workspace.profile || {}
  const target = workspace.target || {}
  const focusAreas = (profile.focusAreas || []).map(item => String(item).trim()).filter(Boolean)
  const targetLabel = profile.targetRole || target.jobTitle

  if (focusAreas.length === 1 && focusAreas[0] === '项目深挖') {
    return { mode: 'project', reason: '你只选择了“项目深挖”' }
  }
  if (focusAreas.length === 1 && focusAreas[0] === '行为面试') {
    return { mode: 'behavioral', reason: '你只选择了“行为面试”' }
  }
  if (focusAreas.length === 1) {
    return { mode: 'role', reason: `你希望重点训练“${focusAreas[0]}”` }
  }
  if (focusAreas.length > 1) {
    return { mode: 'comprehensive', reason: `需要覆盖 ${focusAreas.length} 个重点训练领域` }
  }
  if (targetLabel || target.jobDescription) {
    return { mode: 'role', reason: targetLabel ? `根据目标方向“${targetLabel}”` : '根据你填写的目标 JD' }
  }
  return { mode: 'comprehensive', reason: '尚未限定单一训练方向' }
}

export function inferInterviewMode(workspace = {}) {
  return inferInterviewRecommendation(workspace).mode
}

export function inferInterviewQuestionCount(workspace = {}) {
  const focusCount = Array.isArray(workspace.profile?.focusAreas)
    ? workspace.profile.focusAreas.filter(item => String(item || '').trim()).length
    : 0
  return Math.min(8, Math.max(4, focusCount))
}
