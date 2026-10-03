const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createInterviewService, toPublicSession } = require('../interview/service');
const { InterviewStore } = require('../interview/store');
const { buildReport } = require('../interview/rubric');
const { normalizeReview, rankReviewQuestions } = require('../skills/interview-review');

function createFixture({ practiceScore = 4, practiceMissing = [], questionCount = 6,
  originalScores = [3, 2, 4, 1, 5, 2.5], originalGapsByQuestion = [] } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interview-review-priority-'));
  const scores = originalScores.slice(0, questionCount);
  const session = {
    id: 'six-question-session', title: '六题模拟', mode: 'project', status: 'completed',
    questionCount, reviewContext: { role: '软件工程师', jobDescription: '' },
    turns: scores.map((score, index) => ({
      question: { text: `请介绍第${index + 1}题的项目经历。` },
      answer: `我负责第${index + 1}题对应的方案设计，并完成了初步实现。`,
      feedback: {
        averageScore: score,
        scores: { problem: score, depth: score, ownership: score, communication: score },
        missingPoints: originalGapsByQuestion[index] ?? (score <= 3 ? ['缺少验证方法'] : [])
      }
    }))
  };
  session.report = buildReport(session);
  new InterviewStore(dataDir).saveSession('owner', session);
  const reviewSelections = [];
  const service = createInterviewService({
    dataDir,
    retrieveKnowledge: async () => [],
    callJson: async messages => {
      if (messages[0].content.includes('复盘教练')) {
        return {
          scores: { problem: practiceScore, depth: practiceScore, ownership: practiceScore, communication: practiceScore },
          summary: '补充了验证方法', evidence: ['我补充了对照验证'],
          strengths: ['回答更具体'], missingPoints: practiceMissing, betterStructure: '背景—方案—验证'
        };
      }
      const selection = JSON.parse(messages[1].content).selectedQuestions;
      reviewSelections.push(selection.map(item => item.questionNumber));
      return {
        summary: '优先复习评分较低且尚未练习的题目。',
        days: selection.map(({ day, questionNumber }) => ({
          day,
          focus: '补充验证方法',
          task: `围绕第${questionNumber}题补充验证方法和判断依据。`,
          checkpoint: '能够说明数据来源与验证步骤。',
          evidence: { questionNumber, quote: `我负责第${questionNumber}题对应的方案设计` }
        }))
      };
    }
  });
  return { dataDir, service, reviewSelections, session, cleanup: () => fs.rmSync(dataDir, { recursive: true, force: true }) };
}

const PRACTICE_ANSWER = '我补充了对照验证：先固定样本，再记录结果，并说明数据来源和判断标准。';

test('six questions produce three distinct priorities and retain the remaining questions', async () => {
  const fixture = createFixture();
  try {
    assert.deepEqual(rankReviewQuestions(fixture.session).slice(0, 3).map(item => item.questionNumber), [4, 2, 6]);
    const reviewed = await fixture.service.reviewSession('owner', fixture.session.id);
    assert.deepEqual(reviewed.skillReview.selectedQuestionNumbers, [4, 2, 6]);
    assert.deepEqual(fixture.reviewSelections, [[4, 2, 6]]);
    const queue = toPublicSession(reviewed).reviewQueue;
    assert.equal(queue.length, 6);
    assert.deepEqual(queue.filter(item => !item.inCurrentPlan).map(item => item.questionNumber), [1, 3, 5]);
    assert.deepEqual(queue.filter(item => !item.required).map(item => item.questionNumber), [3, 5]);
    await assert.rejects(
      () => fixture.service.reviewSession('owner', fixture.session.id, { nextCycle: true }),
      /请先完成本轮全部练习/
    );
  } finally {
    fixture.cleanup();
  }
});

test('high-scoring questions without gaps stay in the report but are not mandatory practice', async () => {
  const fixture = createFixture();
  try {
    await fixture.service.reviewSession('owner', fixture.session.id);
    for (const day of [1, 2, 3]) await fixture.service.practiceReview('owner', fixture.session.id, day, PRACTICE_ANSWER);
    const finalRound = await fixture.service.reviewSession('owner', fixture.session.id, { nextCycle: true });
    assert.deepEqual(finalRound.skillReview.selectedQuestionNumbers, [1]);
    const completed = await fixture.service.practiceReview('owner', fixture.session.id, 1, PRACTICE_ANSWER);
    const queue = toPublicSession(completed).reviewQueue;
    assert.deepEqual(queue.filter(item => !item.required).map(item => item.questionNumber), [3, 5]);
    assert.equal(queue.filter(item => item.required).every(item => item.practicedCount > 0), true);
    assert.equal(queue.filter(item => !item.required).every(item => item.practicedCount === 0), true);
    await assert.rejects(
      () => fixture.service.reviewSession('owner', fixture.session.id, { nextCycle: true }),
      /基础复习计划已结束/
    );
  } finally {
    fixture.cleanup();
  }
});

test('all-strong answers need no plan, while a high-scoring answer with a gap remains mandatory', async () => {
  const strong = createFixture({ questionCount: 2, originalScores: [5, 4.5] });
  try {
    const publicSession = toPublicSession(strong.service.getSession('owner', strong.session.id));
    assert.equal(publicSession.reviewQueue.length, 2);
    assert.equal(publicSession.reviewQueue.every(item => !item.required), true);
    await assert.rejects(
      () => strong.service.reviewSession('owner', strong.session.id),
      /没有需要重答的薄弱题/
    );
  } finally {
    strong.cleanup();
  }
  const withGap = createFixture({ questionCount: 2, originalScores: [5, 5],
    originalGapsByQuestion: [['缺少验证依据'], []] });
  try {
    const reviewed = await withGap.service.reviewSession('owner', withGap.session.id);
    assert.deepEqual(reviewed.skillReview.selectedQuestionNumbers, [1]);
  } finally {
    withGap.cleanup();
  }
});

test('an optional strong question in a saved plan does not block the next mandatory round', async () => {
  const fixture = createFixture();
  try {
    await fixture.service.reviewSession('owner', fixture.session.id);
    const store = new InterviewStore(fixture.dataDir);
    const saved = store.getSession('owner', fixture.session.id);
    saved.skillReview.days[2] = {
      ...saved.skillReview.days[2],
      evidence: { questionNumber: 5, quote: '我负责第5题对应的方案设计' },
      evidenceQuestionNumbers: [5]
    };
    saved.skillReview.selectedQuestionNumbers[2] = 5;
    store.saveSession('owner', saved);
    await fixture.service.practiceReview('owner', fixture.session.id, 1, PRACTICE_ANSWER);
    await fixture.service.practiceReview('owner', fixture.session.id, 2, PRACTICE_ANSWER);
    const next = await fixture.service.reviewSession('owner', fixture.session.id, { nextCycle: true });
    assert.deepEqual(next.skillReview.selectedQuestionNumbers, [6, 1]);
    assert.equal(next.practiceAttempts.length, 2);
  } finally {
    fixture.cleanup();
  }
});

test('server-selected questions cannot be silently replaced by the model', () => {
  const fixture = createFixture();
  try {
    const wrongPlan = {
      summary: '练习低分题',
      days: [1, 2, 3].map(day => ({
        day, focus: '补充验证', task: '补充判断依据', checkpoint: '说明验证步骤',
        evidence: { questionNumber: 1, quote: '我负责第1题对应的方案设计' }
      }))
    };
    assert.throws(
      () => normalizeReview(wrongPlan, fixture.session, { selectedQuestions: [4, 2, 6] }),
      /服务端选定的第 4 题/
    );
  } finally {
    fixture.cleanup();
  }
});

test('practice reorders the queue, and the next cycle covers previously unpracticed questions', async () => {
  const fixture = createFixture({ originalScores: [3, 2, 3.5, 1, 3.8, 2.5] });
  try {
    const first = await fixture.service.reviewSession('owner', fixture.session.id);
    const originalDays = first.skillReview.selectedQuestionNumbers;
    const afterOne = await fixture.service.practiceReview('owner', fixture.session.id, 1, PRACTICE_ANSWER);
    assert.deepEqual(afterOne.skillReview.selectedQuestionNumbers, originalDays, 'current plan must remain stable');
    assert.equal(toPublicSession(afterOne).reviewQueue.at(-1).questionNumber, 4, 'practiced question moves behind unpracticed questions');
    await fixture.service.practiceReview('owner', fixture.session.id, 2, PRACTICE_ANSWER);
    const afterThree = await fixture.service.practiceReview('owner', fixture.session.id, 3, PRACTICE_ANSWER);
    assert.deepEqual(afterThree.practiceAttempts.map(item => item.cycle), [1, 1, 1]);
    assert.deepEqual(toPublicSession(afterThree).reviewQueue.slice(0, 3).map(item => item.questionNumber), [1, 3, 5]);

    const next = await fixture.service.reviewSession('owner', fixture.session.id, { nextCycle: true });
    assert.equal(next.skillReview.cycle, 2);
    assert.deepEqual(next.skillReview.selectedQuestionNumbers, [1, 3, 5]);
    assert.deepEqual(fixture.reviewSelections, [[4, 2, 6], [1, 3, 5]]);
    assert.deepEqual(next.skillReviewHistory[0].selectedQuestionNumbers, [4, 2, 6]);
    assert.equal(next.practiceAttempts.length, 3, 'old practice attempts remain attached to the session');
    await assert.rejects(
      () => fixture.service.reviewSession('owner', fixture.session.id, { nextCycle: true }),
      /请先完成本轮全部练习/
    );

    const cycleTwoPractice = await fixture.service.practiceReview('owner', fixture.session.id, 1, PRACTICE_ANSWER);
    assert.equal(cycleTwoPractice.practiceAttempts.at(-1).cycle, 2);
    assert.equal(cycleTwoPractice.practiceAttempts.at(-1).questionNumber, 1);
    await fixture.service.practiceReview('owner', fixture.session.id, 2, PRACTICE_ANSWER);
    const covered = await fixture.service.practiceReview('owner', fixture.session.id, 3, PRACTICE_ANSWER);
    assert.equal(toPublicSession(covered).reviewQueue.every(item => item.practicedCount > 0), true);
    await assert.rejects(
      () => fixture.service.reviewSession('owner', fixture.session.id, { nextCycle: true }),
      /基础复习计划已结束/
    );
    await assert.rejects(
      () => fixture.service.reinforceReview('owner', fixture.session.id, 4, `${PRACTICE_ANSWER} 我会继续核对数据。`),
      /无需巩固/
    );
    const restored = createInterviewService({
      dataDir: fixture.dataDir,
      retrieveKnowledge: async () => [],
      callJson: async () => { throw new Error('reading a saved review must not call the model'); }
    });
    const saved = restored.getSession('owner', fixture.session.id);
    assert.equal(saved.skillReview.cycle, 2);
    assert.equal(saved.skillReviewHistory.length, 1);
    assert.equal(toPublicSession(saved).reviewQueue.length, 6);
  } finally {
    fixture.cleanup();
  }
});

test('optional reinforcement starts only after every mandatory original question is practiced and targets remaining weaknesses', async () => {
  const fixture = createFixture({ practiceScore: 2, practiceMissing: ['仍缺少验证依据'],
    originalScores: [3, 2, 3.5, 1, 3.8, 2.5] });
  try {
    await fixture.service.reviewSession('owner', fixture.session.id);
    await assert.rejects(
      () => fixture.service.reinforceReview('owner', fixture.session.id, 4, PRACTICE_ANSWER),
      /请先完成所有必练原题的首次重答/
    );
    for (const day of [1, 2, 3]) await fixture.service.practiceReview('owner', fixture.session.id, day, PRACTICE_ANSWER);
    await fixture.service.reviewSession('owner', fixture.session.id, { nextCycle: true });
    for (const day of [1, 2, 3]) await fixture.service.practiceReview('owner', fixture.session.id, day, PRACTICE_ANSWER);
    const reinforced = await fixture.service.reinforceReview('owner', fixture.session.id, 4, `${PRACTICE_ANSWER} 我会继续核对数据。`);
    assert.equal(reinforced.practiceAttempts.at(-1).kind, 'reinforcement');
    assert.equal(reinforced.practiceAttempts.at(-1).questionNumber, 4);
    assert.equal(toPublicSession(reinforced).reviewQueue.find(item => item.questionNumber === 4).needsReinforcement, true);
    await assert.rejects(
      () => fixture.service.reinforceReview('owner', fixture.session.id, 7, PRACTICE_ANSWER),
      /无效的原题编号/
    );
  } finally {
    fixture.cleanup();
  }
});

test('four questions produce a three-task round followed by one task, without filler', async () => {
  const fixture = createFixture({ questionCount: 4, originalScores: [3, 2, 3.5, 1] });
  try {
    const first = await fixture.service.reviewSession('owner', fixture.session.id);
    assert.deepEqual(first.skillReview.selectedQuestionNumbers, [4, 2, 1]);
    for (const day of [1, 2, 3]) await fixture.service.practiceReview('owner', fixture.session.id, day, PRACTICE_ANSWER);
    const second = await fixture.service.reviewSession('owner', fixture.session.id, { nextCycle: true });
    assert.deepEqual(second.skillReview.selectedQuestionNumbers, [3]);
    assert.equal(second.skillReview.days.length, 1);
    await assert.rejects(
      () => fixture.service.practiceReview('owner', fixture.session.id, 2, PRACTICE_ANSWER),
      /无效的复习任务/
    );
    const covered = await fixture.service.practiceReview('owner', fixture.session.id, 1, PRACTICE_ANSWER);
    assert.equal(toPublicSession(covered).reviewQueue.every(item => item.practicedCount > 0), true);
    await assert.rejects(
      () => fixture.service.reviewSession('owner', fixture.session.id, { nextCycle: true }),
      /基础复习计划已结束/
    );
  } finally {
    fixture.cleanup();
  }
});

test('one or two original questions produce exactly that many distinct tasks', async () => {
  for (const questionCount of [1, 2]) {
    const fixture = createFixture({ questionCount });
    try {
      const reviewed = await fixture.service.reviewSession('owner', fixture.session.id);
      assert.equal(reviewed.skillReview.days.length, questionCount);
      assert.equal(new Set(reviewed.skillReview.selectedQuestionNumbers).size, questionCount);
      assert.equal(fixture.reviewSelections[0].length, questionCount);
      await assert.rejects(
        () => fixture.service.practiceReview('owner', fixture.session.id, questionCount + 1, PRACTICE_ANSWER),
        /无效的复习任务/
      );
      for (let day = 1; day <= questionCount; day += 1) {
        await fixture.service.practiceReview('owner', fixture.session.id, day, PRACTICE_ANSWER);
      }
      await assert.rejects(
        () => fixture.service.reviewSession('owner', fixture.session.id, { nextCycle: true }),
        /基础复习计划已结束/
      );
    } finally {
      fixture.cleanup();
    }
  }
});

test('server rejects a model that pads a two-question plan to three tasks', () => {
  const fixture = createFixture({ questionCount: 2 });
  try {
    const padded = {
      summary: '复习两个原题',
      days: [1, 2, 3].map(day => ({
        day, focus: '补充证据', task: '说明验证方法', checkpoint: '说出验证步骤',
        evidence: { questionNumber: day === 2 ? 1 : 2, quote: `我负责第${day === 2 ? 1 : 2}题对应的方案设计` }
      }))
    };
    assert.throws(
      () => normalizeReview(padded, fixture.session, { selectedQuestions: [2, 1] }),
      /必须生成 2 项复习任务/
    );
  } finally {
    fixture.cleanup();
  }
});

test('an untouched saved padded plan can be refreshed, but a practiced plan keeps its question mapping', async () => {
  const fixture = createFixture({ questionCount: 2 });
  try {
    const reviewed = await fixture.service.reviewSession('owner', fixture.session.id);
    const store = new InterviewStore(fixture.dataDir);
    const oldPlan = store.getSession('owner', fixture.session.id);
    oldPlan.skillReview.days.push({ ...oldPlan.skillReview.days[0], day: 3 });
    oldPlan.skillReview.selectedQuestionNumbers.push(oldPlan.skillReview.days[0].evidence.questionNumber);
    store.saveSession('owner', oldPlan);

    const refreshed = await fixture.service.reviewSession('owner', fixture.session.id, { regenerate: true });
    assert.equal(refreshed.skillReview.days.length, 2);
    assert.equal(refreshed.skillReview.cycle, reviewed.skillReview.cycle);
    assert.equal(refreshed.skillReviewHistory, undefined, 'an untouched draft is replaced without adding a fake completed round');

    const paddedAgain = store.getSession('owner', fixture.session.id);
    paddedAgain.skillReview.days.push({ ...paddedAgain.skillReview.days[0], day: 3 });
    paddedAgain.skillReview.selectedQuestionNumbers.push(paddedAgain.skillReview.days[0].evidence.questionNumber);
    store.saveSession('owner', paddedAgain);
    await fixture.service.practiceReview('owner', fixture.session.id, 1, PRACTICE_ANSWER);
    await assert.rejects(
      () => fixture.service.reviewSession('owner', fixture.session.id, { regenerate: true }),
      /本轮已有再练习记录，不能更换题目依据/
    );
  } finally {
    fixture.cleanup();
  }
});
