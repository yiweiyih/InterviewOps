const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createInterviewService, toPublicSession } = require('../interview/service');

test('interview service completes a scored session without sharing user data', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interview-service-'));
  let callCount = 0;
  const callJson = async () => {
    callCount += 1;
    if (callCount === 1 || callCount === 3) {
      return { choices: [{ message: { content: JSON.stringify({
        text: callCount === 1 ? '请介绍项目里最关键的技术取舍。' : '你如何验证这个取舍有效？',
        competency: '技术决策',
        expectedSignals: ['背景', '取舍', '结果']
      }) } }] };
    }
    return { choices: [{ message: { content: JSON.stringify({
      scores: { problem: 4, depth: 4, ownership: 5, communication: 4 },
      summary: '能够说明个人决策',
      evidence: ['我负责设计检索链路'],
      strengths: ['个人贡献明确'],
      missingPoints: ['补充线上指标'],
      betterStructure: '问题—方案—取舍—结果'
    }) } }] };
  };

  try {
    const service = createInterviewService({
      dataDir: tempDir,
      callJson,
      retrieveKnowledge: async () => [{ source: 'project.md', text: '项目资料' }]
    });
    const session = await service.startSession('user-a', { mode: 'project', questionCount: 2 });
    assert.equal(session.contextSources[0], 'project.md');
    assert.equal(session.currentQuestion.expectedSignals.length, 3);
    assert.equal('expectedSignals' in toPublicSession(session).currentQuestion, false);

    const afterFirstAnswer = await service.answerSession(
      'user-a',
      session.id,
      '我负责设计检索链路，先用简单循环建立基线，再通过回归用例验证路由和隔离边界。'
    );
    assert.equal(afterFirstAnswer.status, 'active');
    assert.equal(afterFirstAnswer.turns.length, 1);
    assert.match(afterFirstAnswer.currentQuestion.text, /如何验证/);

    const completed = await service.answerSession(
      'user-a',
      session.id,
      '我建立固定离线集并记录准确率、延迟和失败率，同时保留原始回答证据，避免把未采集的数据写成结果。'
    );
    assert.equal(completed.status, 'completed');
    assert.equal(completed.report.overallScore, 85);
    assert.equal(completed.turns.length, 2);
    assert.equal(service.listSessions('user-b').length, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('interview service can end an active session before the first answer', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interview-service-'));
  try {
    const service = createInterviewService({
      dataDir: tempDir,
      callJson: async () => ({
        text: '请介绍你负责的项目。',
        competency: '项目经验',
        expectedSignals: ['背景', '贡献', '结果']
      }),
      retrieveKnowledge: async () => []
    });

    const session = await service.startSession('user-a', { mode: 'project' });
    const completed = service.completeSession('user-a', session.id);

    assert.equal(completed.status, 'completed');
    assert.equal(completed.report.answeredQuestions, 0);
    assert.equal(completed.report.overallScore, 0);
    assert.equal(service.getSummary('user-a').completedSessions, 0);
    assert.equal(service.getSummary('user-a').averageScore, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('interview service rejects repeated follow-up questions and falls back to a new dimension', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interview-service-'));
  let questionCalls = 0;
  const repeatedQuestion = '你提到通过路由懒加载和拆包优化首屏性能，请具体说明你如何确定拆分方案并验证效果？';

  try {
    const service = createInterviewService({
      dataDir: tempDir,
      callJson: async messages => {
        if (messages[0].content.includes('复盘教练')) {
          return {
            scores: { problem: 4, depth: 4, ownership: 4, communication: 4 },
            summary: '回答包含方案和验证方法',
            evidence: ['使用性能指标验证'],
            strengths: ['说明了个人决策'],
            missingPoints: ['补充业务价值'],
            betterStructure: '背景—决策—取舍—结果'
          };
        }
        questionCalls += 1;
        return {
          text: repeatedQuestion,
          competency: '性能优化',
          rationale: '考察性能优化方法',
          expectedSignals: ['分析', '方案', '验证']
        };
      },
      retrieveKnowledge: async () => []
    });

    const session = await service.startSession('user-a', { mode: 'project', questionCount: 2 });
    const afterFirstAnswer = await service.answerSession(
      'user-a',
      session.id,
      '我先用性能面板定位首屏瓶颈，再拆分路由和重依赖，并通过固定网络条件下的 FCP 数据验证效果。'
    );

    assert.equal(questionCalls, 3);
    assert.notEqual(afterFirstAnswer.currentQuestion.text, repeatedQuestion);
    assert.match(afterFirstAnswer.currentQuestion.text, /尚未讨论/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
