const test = require('node:test');
const assert = require('node:assert/strict');
const { INTERVIEW_MODES, buildReport, getMode, normalizeFeedback, normalizeQuestion } = require('../interview/rubric');

test('setup modes are role-agnostic while legacy modes remain readable', () => {
  assert.equal(getMode('role').label, '岗位专项');
  assert.equal(getMode('missing').label, '综合模拟');
  assert.equal(INTERVIEW_MODES.frontend.hidden, true);
  assert.equal(INTERVIEW_MODES.agent.hidden, true);
});

test('question normalization accepts model aliases and trims noisy fields', () => {
  assert.deepEqual(normalizeQuestion({
    question: '  你如何评估 RAG 效果？ ',
    competency: '评测设计',
    expected_signals: ['离线集', '线上指标']
  }), {
    text: '你如何评估 RAG 效果？',
    competency: '评测设计',
    rationale: '根据候选人资料进行针对性追问',
    expectedSignals: ['离线集', '线上指标']
  });
});

test('feedback clamps scores and report aggregates dimensions to a 100 point score', () => {
  const feedback = normalizeFeedback({
    scores: { problem: 6, depth: 3, ownership: 4, communication: 0 },
    strengths: ['结构清楚'],
    missingPoints: ['缺少量化指标']
  }, 'project');
  assert.deepEqual(feedback.scores, { problem: 5, depth: 3, ownership: 4, communication: 1 });
  assert.equal(feedback.averageScore, 3.3);

  const report = buildReport({ turns: [{ feedback }, { feedback }] });
  assert.equal(report.overallScore, 65);
  assert.equal(report.answeredQuestions, 2);
  assert.equal(report.nextActions[0], '缺少量化指标');
});
