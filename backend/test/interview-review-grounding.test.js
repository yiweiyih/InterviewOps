const test = require('node:test');
const assert = require('node:assert/strict');
const { generateReview, normalizeReview } = require('../skills/interview-review');

const session = {
  reviewContext: { role: '测试开发工程师', jobDescription: '' },
  report: { gaps: [{ key: 'evidence', label: '事实与指标', score: 2 }] },
  turns: [
    { answer: '我先做了灰度发布，记录了失败率 12% 和恢复时间，再决定是否全量上线。', feedback: { scores: { evidence: 2 } } },
    { answer: '我用冲突优先级和回归用例处理规则覆盖问题，没有记录百分比。', feedback: { scores: { evidence: 3 } } }
  ]
};

function validOutput() {
  return {
    summary: '需要补全效果验证，已回答的失败率为 12%。',
    days: [1, 2, 3].map(day => ({
      day,
      focus: '说明指标来源',
      task: '围绕原题说明失败率 12% 的统计口径和上线判断。',
      checkpoint: '能解释统计时间窗口。',
      evidence: { questionNumber: 1, quote: '记录了失败率 12% 和恢复时间' }
    }))
  };
}

test('review plan keeps only a verbatim answer quote and grounded metrics', () => {
  const result = normalizeReview(validOutput(), session);
  assert.equal(result.version, 3);
  assert.deepEqual(result.days[0].evidenceQuestionNumbers, [1]);
  assert.equal(result.days[0].evidence.quote, '记录了失败率 12% 和恢复时间');
});

test('review plan rejects invented metrics and quotes from the wrong question', () => {
  const inventedMetric = validOutput();
  inventedMetric.days[0].task = '项目失败率降到了 7.8%。';
  assert.throws(() => normalizeReview(inventedMetric, session), /不存在的指标/);

  const wrongQuestion = validOutput();
  wrongQuestion.days[0].evidence.questionNumber = 2;
  assert.throws(() => normalizeReview(wrongQuestion, session), /原始回答/);

  const inventedSummary = validOutput();
  inventedSummary.summary = '整体时延降低 300ms。';
  assert.throws(() => normalizeReview(inventedSummary, session), /总结引用了回答中不存在/);
});

test('each review day rejects question references outside its evidence question', () => {
  const crossQuestion = validOutput();
  crossQuestion.days[1].task = '结合第1题和第2题，重新组织验证方法。';
  assert.throws(() => normalizeReview(crossQuestion, session), /只能围绕证据对应的第 1 题/);

  const qStyle = validOutput();
  qStyle.days[2].checkpoint = '对照 Q02 检查回答是否完整。';
  assert.throws(() => normalizeReview(qStyle, session), /只能围绕证据对应的第 1 题/);
});

test('review plan rejects replacement characters instead of displaying garbled text', () => {
  const output = validOutput();
  output.days[1].focus = '规则�冲突';
  assert.throws(() => normalizeReview(output, session), /乱码/);

  const garbledQuote = validOutput();
  garbledQuote.days[0].evidence.quote = '记录了失败率�和恢复时间';
  assert.throws(() => normalizeReview(garbledQuote, session), /乱码/);

  const brokenSurrogate = validOutput();
  brokenSurrogate.days[0].task = '验证方案\uD83D';
  assert.throws(() => normalizeReview(brokenSurrogate, session), /乱码/);
});

test('review text truncation preserves complete Unicode characters', () => {
  const output = validOutput();
  output.days[0].focus = `${'好'.repeat(99)}🙂后续内容`;
  const result = normalizeReview(output, session);
  assert.equal(result.days[0].focus, `${'好'.repeat(99)}🙂`);
});

test('review generation retries once when the first answer is ungrounded', async () => {
  let calls = 0;
  const result = await generateReview({
    session,
    userId: 'owner',
    retrieveKnowledge: async () => [],
    parseJsonResponse: value => value,
    callJson: async () => {
      calls += 1;
      if (calls === 1) {
        const bad = validOutput();
        bad.days[0].task = '失败率是 7.8%。';
        return bad;
      }
      return validOutput();
    }
  });
  assert.equal(calls, 2);
  assert.equal(result.generationAttempts, 2);
  assert.ok(result.latencyMs >= 0);
});
