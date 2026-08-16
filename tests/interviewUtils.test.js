import test from 'node:test'
import assert from 'node:assert/strict'
import { inferInterviewMode } from '../src/utils/interviewMode.js'

test('inferInterviewMode prioritizes the saved target direction', () => {
  assert.equal(inferInterviewMode({
    profile: { targetRole: 'Agent 应用工程师', focusAreas: ['Agent / RAG'] },
    target: { jobTitle: '前端开发工程师', jobDescription: '负责 Vue 页面开发' }
  }), 'agent')
})

test('inferInterviewMode falls back to frontend and project modes', () => {
  assert.equal(inferInterviewMode({ profile: { targetRole: '前端工程师' } }), 'frontend')
  assert.equal(inferInterviewMode({ profile: { targetRole: '软件工程师' } }), 'project')
})
