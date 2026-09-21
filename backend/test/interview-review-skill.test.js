const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createInterviewService } = require('../interview/service');
const { InterviewStore } = require('../interview/store');

function createFixture(reviewOutput, { retrieveKnowledge = async () => [], onReview } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interview-review-skill-'));
  let modelCalls = 0;
  const service = createInterviewService({
    dataDir,
    retrieveKnowledge,
    callJson: async messages => {
      modelCalls += 1;
      if (modelCalls === 1 || modelCalls === 3) {
        return {
          text: modelCalls === 1
            ? '请说明你在项目中做出的关键技术取舍。'
            : '你会如何验证这个方案的效果？',
          competency: '技术决策',
          expectedSignals: ['背景', '个人决策', '验证结果']
        };
      }
      if (modelCalls === 2) {
        return {
          scores: { problem: 4, depth: 3, ownership: 4, communication: 4 },
          summary: '说明了个人决策，但缺少量化验证',
          evidence: ['我选择了分阶段上线'],
          strengths: ['个人贡献清楚'],
          missingPoints: ['补充效果指标'],
          betterStructure: '背景—取舍—验证—结果'
        };
      }
      if (modelCalls === 4 || modelCalls === 5) {
        if (onReview) await onReview(messages);
        return reviewOutput;
      }
      throw new Error(`意外的模型调用：${modelCalls}`);
    }
  });

  return {
    dataDir,
    service,
    getModelCalls: () => modelCalls,
    cleanup: () => fs.rmSync(dataDir, { recursive: true, force: true })
  };
}

const VALID_REVIEW = {
  summary: '优先补齐技术取舍的效果证据。',
  days: [1, 2, 3].map(day => ({
    day,
    focus: '量化验证',
    task: '整理上线前后的效果指标',
    checkpoint: '能说明指标口径与变化',
    evidence: { questionNumber: 1, quote: '我选择了分阶段上线' }
  }))
};

test('review skill rejects active, empty, and other users\' sessions', async () => {
  const fixture = createFixture(VALID_REVIEW);
  try {
    const { service } = fixture;
    const active = await service.startSession('owner', { mode: 'project', questionCount: 2 });
    await assert.rejects(() => service.reviewSession('owner', active.id));
    await assert.rejects(() => service.reviewSession('other-user', active.id));

    service.completeSession('owner', active.id);
    await assert.rejects(() => service.reviewSession('owner', active.id));
    assert.equal(service.getSession('owner', active.id).skillReview, undefined);
    assert.equal(fixture.getModelCalls(), 1, 'invalid reviews must not call the model');
  } finally {
    fixture.cleanup();
  }
});

test('review skill persists a completed review and reuses it without another model call', async () => {
  const fixture = createFixture(VALID_REVIEW);
  try {
    const { service, dataDir } = fixture;
    const started = await service.startSession('owner', { mode: 'project', questionCount: 2 });
    await service.answerSession(
      'owner',
      started.id,
      '我选择了分阶段上线，并用固定测试集先验证核心路径，但还没有整理完整的线上效果指标。'
    );
    service.completeSession('owner', started.id);

    await assert.rejects(() => service.reviewSession('other-user', started.id));
    assert.equal(fixture.getModelCalls(), 3, 'cross-user access must not call the model');

    const reviewed = await service.reviewSession('owner', started.id);
    assert.equal(reviewed.id, started.id);
    assert.equal(reviewed.skillReview.summary, VALID_REVIEW.summary);
    assert.ok(Array.isArray(reviewed.skillReview.focusAreas));
    assert.ok(reviewed.skillReview.days.length > 0);
    assert.deepEqual(reviewed.skillReview.days[0].evidenceQuestionNumbers, [1]);
    assert.ok(reviewed.skillReview.generatedAt);
    assert.deepEqual(service.getSession('owner', started.id).skillReview, reviewed.skillReview);
    assert.equal(fixture.getModelCalls(), 4);

    const reloaded = createInterviewService({
      dataDir,
      retrieveKnowledge: async () => [],
      callJson: async () => { throw new Error('cached review must not call the model'); }
    });
    const repeated = await reloaded.reviewSession('owner', started.id);
    assert.deepEqual(repeated.skillReview, reviewed.skillReview);
    assert.equal(fixture.getModelCalls(), 4);
  } finally {
    fixture.cleanup();
  }
});

test('review skill persists a verified quote and derives its question reference', async () => {
  const fixture = createFixture({
    ...VALID_REVIEW,
    days: [
      { ...VALID_REVIEW.days[0], evidence: { questionNumber: 1, quote: '我选择了分阶段上线' } },
      ...VALID_REVIEW.days.slice(1)
    ]
  });
  try {
    const { service } = fixture;
    const started = await service.startSession('owner', { mode: 'project', questionCount: 2 });
    await service.answerSession(
      'owner',
      started.id,
      '我选择了分阶段上线，并用固定测试集验证核心路径，随后补充线上指标核对方案效果。'
    );
    service.completeSession('owner', started.id);

    const reviewed = await service.reviewSession('owner', started.id);
    assert.deepEqual(reviewed.skillReview.days[0].evidenceQuestionNumbers, [1]);
    assert.deepEqual(service.getSession('owner', started.id).skillReview.days[0].evidenceQuestionNumbers, [1]);
  } finally {
    fixture.cleanup();
  }
});

test('legacy review upgrades only on request and retains its previous plan', async () => {
  const fixture = createFixture(VALID_REVIEW);
  try {
    const { service } = fixture;
    const started = await service.startSession('owner', { mode: 'project', questionCount: 2 });
    await service.answerSession('owner', started.id,
      '我选择了分阶段上线，并用固定测试集验证核心路径，随后补充线上指标。');
    service.completeSession('owner', started.id);
    const oldPlan = { skill: 'interview-review', summary: '旧计划',
      days: [1, 2, 3].map(day => ({ day, evidenceQuestionNumbers: [1] })) };
    const store = new InterviewStore(fixture.dataDir);
    const saved = store.getSession('owner', started.id);
    saved.skillReview = oldPlan;
    store.saveSession('owner', saved);

    assert.equal((await service.reviewSession('owner', started.id)).skillReview.summary, '旧计划');
    assert.equal(fixture.getModelCalls(), 3);
    const upgraded = await service.reviewSession('owner', started.id, { regenerate: true });
    assert.equal(upgraded.skillReview.version, 3);
    assert.equal(upgraded.skillReviewHistory.length, 1);
    assert.deepEqual(upgraded.skillReviewHistory[0], oldPlan);
    assert.equal(fixture.getModelCalls(), 4);
    assert.equal((await service.reviewSession('owner', started.id, { regenerate: true })).skillReview.version, 3);
    assert.equal(fixture.getModelCalls(), 4);
  } finally {
    fixture.cleanup();
  }
});

test('legacy review with practice history cannot silently change its question mapping', async () => {
  const fixture = createFixture(VALID_REVIEW);
  try {
    const { service } = fixture;
    const started = await service.startSession('owner', { mode: 'project', questionCount: 2 });
    await service.answerSession('owner', started.id,
      '我选择了分阶段上线，并用固定测试集验证核心路径，随后补充线上指标。');
    service.completeSession('owner', started.id);
    const store = new InterviewStore(fixture.dataDir);
    const saved = store.getSession('owner', started.id);
    saved.skillReview = { summary: '旧计划', days: [] };
    saved.practiceAttempts = [{ day: 1, questionNumber: 1, answer: '旧练习' }];
    store.saveSession('owner', saved);
    await assert.rejects(
      () => service.reviewSession('owner', started.id, { regenerate: true }),
      /不能更换题目依据/
    );
    assert.equal(fixture.getModelCalls(), 3);
    assert.equal(service.getSession('owner', started.id).skillReview.summary, '旧计划');
  } finally {
    fixture.cleanup();
  }
});

test('review skill rejects a plan with no real question references', async () => {
  const fixture = createFixture({
    ...VALID_REVIEW,
    days: VALID_REVIEW.days.map(day => ({ ...day, evidence: { questionNumber: 99, quote: '不存在的原句' } }))
  });
  try {
    const { service } = fixture;
    const started = await service.startSession('owner', { mode: 'project', questionCount: 2 });
    await service.answerSession(
      'owner', started.id,
      '我选择了分阶段上线，并用固定测试集验证核心路径，随后补充线上指标核对方案效果。'
    );
    service.completeSession('owner', started.id);
    await assert.rejects(() => service.reviewSession('owner', started.id), /没有引用有效/);
    assert.equal(service.getSession('owner', started.id).skillReview, undefined);
  } finally {
    fixture.cleanup();
  }
});

test('review skill uses the target captured when the interview started', async () => {
  let reviewPayload;
  const fixture = createFixture(VALID_REVIEW, {
    onReview: async messages => { reviewPayload = JSON.parse(messages[1].content); }
  });
  try {
    const { service } = fixture;
    service.updateWorkspace('owner', {
      profile: { targetRole: '测试开发工程师' },
      target: { jobDescription: '旧岗位要求：自动化测试' }
    });
    const started = await service.startSession('owner', { mode: 'project', questionCount: 2 });
    await service.answerSession(
      'owner', started.id,
      '我选择了分阶段上线，并用固定测试集验证核心路径，随后补充线上指标核对方案效果。'
    );
    service.completeSession('owner', started.id);
    service.updateWorkspace('owner', {
      profile: { targetRole: '前端工程师' },
      target: { jobDescription: '新岗位要求：页面性能' }
    });
    await service.reviewSession('owner', started.id);
    assert.equal(reviewPayload.target.role, '测试开发工程师');
    assert.match(reviewPayload.target.jobDescription, /自动化测试/);
    assert.doesNotMatch(JSON.stringify(reviewPayload.target), /页面性能/);
  } finally {
    fixture.cleanup();
  }
});

test('concurrent review requests for one session share a single model generation', async () => {
  let signalReviewStarted;
  let releaseReview;
  const reviewStarted = new Promise(resolve => { signalReviewStarted = resolve; });
  const reviewGate = new Promise(resolve => { releaseReview = resolve; });
  const fixture = createFixture(VALID_REVIEW, {
    onReview: async () => {
      signalReviewStarted();
      await reviewGate;
    }
  });

  try {
    const { service } = fixture;
    const started = await service.startSession('owner', { mode: 'project', questionCount: 2 });
    await service.answerSession(
      'owner',
      started.id,
      '我选择了分阶段上线，并用固定测试集验证核心路径，随后补充线上指标核对方案效果。'
    );
    service.completeSession('owner', started.id);

    const pending = Promise.all([
      service.reviewSession('owner', started.id),
      service.reviewSession('owner', started.id)
    ]);
    await reviewStarted;
    releaseReview();
    const [first, second] = await pending;

    assert.deepEqual(first.skillReview, second.skillReview);
    assert.equal(fixture.getModelCalls(), 4, 'concurrent requests must share the fourth (review) model call');
    assert.deepEqual(service.getSession('owner', started.id).skillReview, first.skillReview);
  } finally {
    releaseReview();
    fixture.cleanup();
  }
});

test('review retrieval uses the server userId and failure does not block generation', async () => {
  let reviewing = false;
  const reviewRetrievalCalls = [];
  const fixture = createFixture(VALID_REVIEW, {
    retrieveKnowledge: async (...args) => {
      if (reviewing) {
        reviewRetrievalCalls.push(args);
        throw new Error('检索服务暂时不可用');
      }
      return [];
    }
  });

  try {
    const { service } = fixture;
    const started = await service.startSession('owner', { mode: 'project', questionCount: 2 });
    await service.answerSession(
      'owner',
      started.id,
      '我选择了分阶段上线，并用固定测试集验证核心路径，随后补充线上指标核对方案效果。'
    );
    service.completeSession('owner', started.id);

    reviewing = true;
    const reviewed = await service.reviewSession('owner', started.id);

    assert.ok(reviewRetrievalCalls.length > 0, 'review should attempt user-scoped knowledge retrieval');
    assert.ok(reviewRetrievalCalls.every(args => args[2] === 'owner'));
    assert.equal(reviewed.skillReview.summary, VALID_REVIEW.summary);
    assert.deepEqual(service.getSession('owner', started.id).skillReview, reviewed.skillReview);
  } finally {
    fixture.cleanup();
  }
});
