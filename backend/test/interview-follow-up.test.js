const test = require('node:test');
const assert = require('node:assert/strict');
const { planFollowUp } = require('../interview/follow-up');
const { normalizeFeedback } = require('../interview/rubric');

test('follow-up planner deepens a tagged gap and switches after the follow-up', () => {
  const opening = planFollowUp('project');
  assert.equal(opening.strategy, 'opening');
  const first = {
    question: { followUp: opening },
    feedback: normalizeFeedback({
      scores: { problem: 4, depth: 2, ownership: 3, communication: 4 },
      missingPoints: ['缺少验证指标'],
      gapDetails: [{ dimension: 'depth', point: '缺少验证指标' }]
    }, 'project')
  };
  const deepen = planFollowUp('project', [first]);
  assert.deepEqual(deepen, {
    strategy: 'deepen', targetDimension: 'depth', sourceQuestionNumber: 1, targetGap: '缺少验证指标'
  });
  const second = {
    question: { followUp: deepen },
    feedback: normalizeFeedback({
      scores: { problem: 4, depth: 2, ownership: 3, communication: 4 },
      missingPoints: ['缺少验证指标']
    }, 'project')
  };
  assert.equal(planFollowUp('project', [first, second]).strategy, 'switch');
  assert.equal(planFollowUp('project', [first, second]).targetDimension, 'ownership');
});

test('follow-up planner switches when no gap exists and ignores invalid gap tags', () => {
  const feedback = normalizeFeedback({
    scores: { problem: 4, depth: 3, ownership: 4, communication: 5 },
    missingPoints: ['补充量化结果'],
    gapDetails: [{ dimension: 'other', point: '补充量化结果' }, { dimension: 'depth', point: '模型编造的缺口' }]
  }, 'project');
  assert.deepEqual(feedback.gapDetails, []);
  const legacyTurn = { question: { competency: '问题定义' }, feedback };
  assert.equal(planFollowUp('project', [legacyTurn]).targetDimension, 'depth');
  const noGapTurn = { question: { competency: '问题定义' }, feedback: { ...feedback, missingPoints: [] } };
  assert.equal(planFollowUp('project', [noGapTurn]).strategy, 'switch');
});
