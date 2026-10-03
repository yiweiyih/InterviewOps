function feedbackScore(feedback) {
  const average = Number(feedback?.averageScore)
  if (Number.isFinite(average) && average > 0) return average
  const scores = Object.values(feedback?.scores || {}).map(Number).filter(value => Number.isFinite(value) && value > 0)
  return scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 5
}

export function getReviewQueueState(session) {
  const turns = Array.isArray(session?.turns) ? session.turns : []
  const attempts = Array.isArray(session?.practiceAttempts) ? session.practiceAttempts : []
  const planned = new Set((session?.skillReview?.days || []).map(day => (
    day.evidence?.questionNumber || day.evidenceQuestionNumbers?.[0]
  )))
  const fallback = turns.map((turn, index) => {
    const questionNumber = index + 1
    const practice = attempts.filter(item => item.questionNumber === questionNumber)
    const feedback = practice.at(-1)?.feedback || turn.feedback || {}
    const originalScore = feedbackScore(turn.feedback)
    const originalGapCount = Array.isArray(turn.feedback?.missingPoints) ? turn.feedback.missingPoints.length : 0
    const gapCount = Array.isArray(feedback.missingPoints) ? feedback.missingPoints.length : 0
    const required = originalScore < 4 || originalGapCount > 0
    return {
      questionNumber, originalScore, originalGapCount, required,
      currentScore: feedbackScore(feedback), gapCount,
      practicedCount: practice.length,
      inCurrentPlan: planned.has(questionNumber),
      needsReinforcement: required && practice.length > 0 && (feedbackScore(feedback) < 4 || gapCount > 0)
    }
  }).sort((left, right) => (
    Number(!left.required) - Number(!right.required)
    || Number(left.practicedCount > 0) - Number(right.practicedCount > 0)
    || left.currentScore - right.currentScore
    || right.gapCount - left.gapCount
    || left.questionNumber - right.questionNumber
  ))

  const serverQueue = session?.reviewQueue
  const localByNumber = new Map(fallback.map(item => [item.questionNumber, item]))
  const synced = Array.isArray(serverQueue) && serverQueue.length === turns.length
    && new Set(serverQueue.map(item => item.questionNumber)).size === turns.length
    && serverQueue.every(item => typeof item.required === 'boolean'
      && typeof item.needsReinforcement === 'boolean'
      && Number.isFinite(item.currentScore)
      && Number.isInteger(item.practicedCount)
      && item.required === localByNumber.get(item.questionNumber)?.required)
  return { queue: synced ? serverQueue : fallback, synced }
}
