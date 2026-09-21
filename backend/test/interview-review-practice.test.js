const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createInterviewService } = require('../interview/service');
const { InterviewStore } = require('../interview/store');
const { buildReport, normalizeFeedback } = require('../interview/rubric');

function createFixture(onEvaluate) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interview-review-practice-'));
  const turn = {
    question: { text: '你如何验证项目方案有效？', competency: '效果验证', expectedSignals: ['指标'] },
    answer: '我先上线了项目方案，观察到运行正常，但没有记录明确的指标。',
    feedback: normalizeFeedback({
      scores: { problem: 3, depth: 2, ownership: 3, communication: 4 },
      missingPoints: ['补充指标口径和对照数据']
    }, 'project')
  };
  const session = {
    id: 'practice-session', title: '项目深挖', mode: 'project', status: 'completed',
    questionCount: 2, turns: [turn], reviewContext: { role: '测试开发', jobDescription: '验证系统方案' },
    skillReview: {
      version: 3,
      days: [1, 2, 3].map(day => ({
        day, evidence: { questionNumber: 1, quote: '观察到运行正常' }, evidenceQuestionNumbers: [1]
      }))
    },
    practiceAttempts: []
  };
  session.report = buildReport(session);
  new InterviewStore(dataDir).saveSession('owner', session);
  let modelCalls = 0;
  const service = createInterviewService({
    dataDir,
    retrieveKnowledge: async () => [],
    callJson: async messages => {
      modelCalls += 1;
      if (onEvaluate) await onEvaluate(messages);
      return {
        scores: { problem: 4, depth: 4, ownership: 4, communication: 4 },
        summary: '补充了指标和验证方法',
        evidence: ['增加了固定口径的验证'],
        strengths: ['验证路径更具体'],
        missingPoints: ['继续补充真实数据来源'],
        betterStructure: '背景—方法—指标—结果'
      };
    }
  });
  return {
    dataDir, service, getModelCalls: () => modelCalls,
    cleanup: () => fs.rmSync(dataDir, { recursive: true, force: true })
  };
}

const ANSWER = '我重新说明了验证方法：固定测试样本、明确指标口径，并对比上线前后的结果。';

test('practice is user-scoped, uses the original question, and persists a comparable result', async () => {
  let evaluationPayload;
  const fixture = createFixture(messages => { evaluationPayload = JSON.parse(messages[1].content); });
  try {
    const { service } = fixture;
    await assert.rejects(() => service.practiceReview('other-user', 'practice-session', 1, ANSWER), /没有找到/);
    await assert.rejects(() => service.practiceReview('owner', 'practice-session', 4, ANSWER), /无效/);
    await assert.rejects(() => service.practiceReview('owner', 'practice-session', 1, '太短'), /至少/);
    assert.equal(fixture.getModelCalls(), 0);

    const result = await service.practiceReview('owner', 'practice-session', 1, ANSWER);
    const attempt = result.practiceAttempts[0];
    assert.equal(evaluationPayload.question.text, '你如何验证项目方案有效？');
    assert.equal(evaluationPayload.profile.targetRole, '测试开发');
    assert.deepEqual(Object.keys(attempt.feedback.scores), ['problem', 'depth', 'ownership', 'communication']);
    assert.equal(attempt.originalAverageScore, 3);
    assert.equal(attempt.feedback.averageScore, 4);
    assert.equal(attempt.answer, ANSWER);
    assert.deepEqual(service.getSession('owner', 'practice-session').practiceAttempts, result.practiceAttempts);

    const reloaded = createInterviewService({
      dataDir: fixture.dataDir,
      retrieveKnowledge: async () => [],
      callJson: async () => { throw new Error('duplicate should not call model'); }
    });
    const duplicate = await reloaded.practiceReview('owner', 'practice-session', 1, ANSWER);
    assert.equal(duplicate.practiceAttempts.length, 1);
    assert.equal(fixture.getModelCalls(), 1);
  } finally {
    fixture.cleanup();
  }
});

test('practice refuses an unverified legacy plan before using its question mapping', async () => {
  const fixture = createFixture();
  try {
    const store = new InterviewStore(fixture.dataDir);
    const session = store.getSession('owner', 'practice-session');
    delete session.skillReview.version;
    store.saveSession('owner', session);
    await assert.rejects(
      () => fixture.service.practiceReview('owner', 'practice-session', 1, ANSWER),
      /请先升级旧版复盘计划/
    );
    assert.equal(fixture.getModelCalls(), 0);
  } finally {
    fixture.cleanup();
  }
});

test('practice limits unique attempts per day to five', async () => {
  const fixture = createFixture();
  try {
    for (let index = 0; index < 5; index += 1) {
      await fixture.service.practiceReview('owner', 'practice-session', 1, `${ANSWER}第${index + 1}次练习。`);
    }
    await assert.rejects(
      () => fixture.service.practiceReview('owner', 'practice-session', 1, `${ANSWER}第6次练习。`),
      /达到 5 次上限/
    );
    assert.equal(fixture.getModelCalls(), 5);
  } finally {
    fixture.cleanup();
  }
});

test('simultaneous submissions of the same answer share one model call', async () => {
  let release;
  let started;
  const waiting = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const fixture = createFixture(async () => { started(); await gate; });
  try {
    const first = fixture.service.practiceReview('owner', 'practice-session', 2, ANSWER);
    const second = fixture.service.practiceReview('owner', 'practice-session', 2, ANSWER);
    await waiting;
    release();
    const results = await Promise.all([first, second]);
    assert.equal(fixture.getModelCalls(), 1);
    assert.equal(results[0].practiceAttempts.length, 1);
    assert.deepEqual(results[0].practiceAttempts, results[1].practiceAttempts);
  } finally {
    release();
    fixture.cleanup();
  }
});
