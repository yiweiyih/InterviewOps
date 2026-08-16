export function inferInterviewMode(workspace = {}) {
  const profile = workspace.profile || {}
  const target = workspace.target || {}
  const signals = [profile.targetRole, ...(profile.focusAreas || []), target.jobTitle, target.jobDescription]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (/(agent|rag|llm|大模型|人工智能|ai\s*应用)/i.test(signals)) return 'agent'
  if (/(前端|frontend|vue|react|浏览器|javascript|typescript)/i.test(signals)) return 'frontend'
  return 'project'
}
