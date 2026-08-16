import test from 'node:test'
import assert from 'node:assert/strict'
import {
  inferInterviewMode,
  inferInterviewQuestionCount,
  inferInterviewRecommendation
} from '../src/utils/interviewMode.js'

test('explicit project focus is not overridden by the target role', () => {
  assert.equal(inferInterviewMode({
    profile: { targetRole: '前端开发工程师', focusAreas: ['项目深挖'] },
    target: { jobTitle: '前端开发工程师' }
  }), 'project')
})

test('role recommendation supports arbitrary target roles without fixed technology modes', () => {
  assert.equal(inferInterviewMode({ profile: { targetRole: '后端开发工程师' } }), 'role')
  assert.equal(inferInterviewMode({ profile: { targetRole: '测试开发工程师' } }), 'role')
  assert.equal(inferInterviewMode({ profile: { focusAreas: ['自动化测试'] } }), 'role')
})

test('mixed focuses use comprehensive mode and explain the recommendation', () => {
  const recommendation = inferInterviewRecommendation({
    profile: { focusAreas: ['项目深挖', '系统设计'] }
  })
  assert.equal(recommendation.mode, 'comprehensive')
  assert.match(recommendation.reason, /2 个/)
  assert.equal(inferInterviewMode(), 'comprehensive')
})

test('question count follows focus coverage without leaving the supported range', () => {
  assert.equal(inferInterviewQuestionCount({ profile: { focusAreas: ['项目深挖', '系统设计'] } }), 4)
  assert.equal(inferInterviewQuestionCount({ profile: { focusAreas: ['1', '2', '3', '4', '5'] } }), 5)
  assert.equal(inferInterviewQuestionCount({ profile: { focusAreas: Array.from({ length: 10 }, (_, index) => `${index}`) } }), 8)
})
