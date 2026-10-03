import test from 'node:test'
import assert from 'node:assert/strict'
import { getReviewQueueState } from '../src/utils/reviewQueue.js'

function session(scores, reviewQueue) {
  return {
    turns: scores.map((score, index) => ({
      question: { text: `第${index + 1}题` },
      feedback: { averageScore: score, missingPoints: [] }
    })),
    ...(reviewQueue === undefined ? {} : { reviewQueue })
  }
}

test('missing review queue does not turn four low-scoring answers into no mandatory questions', () => {
  const result = getReviewQueueState(session([2.3, 2.3, 3, 2.8]))
  assert.equal(result.synced, false)
  assert.equal(result.queue.length, 4)
  assert.equal(result.queue.every(item => item.required), true)
})

test('old queue without required flags falls back to original feedback', () => {
  const result = getReviewQueueState(session([2.3, 5], [
    { questionNumber: 1, currentScore: 2.3 },
    { questionNumber: 2, currentScore: 5 }
  ]))
  assert.equal(result.synced, false)
  assert.deepEqual(result.queue.map(item => item.required), [true, false])
})

test('matching server queue is used, while an inconsistent required flag is rejected', () => {
  const input = session([2.3, 5])
  const fallback = getReviewQueueState(input).queue
  assert.equal(getReviewQueueState({ ...input, reviewQueue: fallback }).synced, true)
  const inconsistent = fallback.map(item => ({ ...item, required: false }))
  assert.equal(getReviewQueueState({ ...input, reviewQueue: inconsistent }).synced, false)
})
