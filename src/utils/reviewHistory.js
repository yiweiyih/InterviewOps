export function formatReviewHistoryLabel(plan, index, currentVersion) {
  if (plan?.version !== currentVersion) return `旧版计划 ${index + 1}`
  if (Number.isInteger(plan.cycle) && plan.cycle > 0) return `第 ${plan.cycle} 轮（历史）`
  return `历史计划 ${index + 1}（轮次未记录）`
}
