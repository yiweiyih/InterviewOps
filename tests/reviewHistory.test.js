import test from 'node:test'
import assert from 'node:assert/strict'
import { formatReviewHistoryLabel } from '../src/utils/reviewHistory.js'

test('legacy plan versions are not mislabeled as practice cycles', () => {
  assert.equal(formatReviewHistoryLabel({}, 0, 3), '旧版计划 1')
  assert.equal(formatReviewHistoryLabel({ version: 2 }, 1, 3), '旧版计划 2')
})

test('only current-version plans with a real cycle show a round number', () => {
  assert.equal(formatReviewHistoryLabel({ version: 3, cycle: 1 }, 0, 3), '第 1 轮（历史）')
  assert.equal(formatReviewHistoryLabel({ version: 3 }, 0, 3), '历史计划 1（轮次未记录）')
})
