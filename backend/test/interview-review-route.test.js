const test = require('node:test');
const assert = require('node:assert/strict');
const { createInterviewHandler } = require('../interview/routes');

function createHarness({ user, reviewSession, practiceReview, body = {} }) {
  const responses = [];
  const handler = createInterviewHandler({
    service: { reviewSession, practiceReview },
    verifyToken: () => user,
    readBody: async () => body,
    sendJson: (_res, body, status = 200) => responses.push({ body, status })
  });
  return { handler, responses };
}

function reviewRequest(sessionId = 'session-1') {
  return { method: 'POST', url: `/api/interview/sessions/${sessionId}/review` };
}

test('review route rejects unauthenticated requests without calling the service', async () => {
  let serviceCalls = 0;
  const { handler, responses } = createHarness({
    user: null,
    reviewSession: async () => {
      serviceCalls += 1;
    }
  });

  assert.equal(await handler(reviewRequest(), {}), true);
  assert.equal(serviceCalls, 0);
  assert.deepEqual(responses, [{ body: { error: '未登录' }, status: 401 }]);
});

test('review route uses the verified user ID and returns a public session', async () => {
  const calls = [];
  const session = {
    id: 'session-1',
    status: 'completed',
    currentQuestion: { text: '如何验证方案？', expectedSignals: ['指标'] },
    turns: [{ question: { text: '介绍项目', expectedSignals: ['背景'] }, answer: '我的回答' }],
    skillReview: { summary: '补充验证指标' }
  };
  const { handler, responses } = createHarness({
    user: { userId: 'verified-user' },
    reviewSession: async (userId, sessionId) => {
      calls.push([userId, sessionId]);
      return session;
    }
  });

  assert.equal(await handler(reviewRequest('session-1'), {}), true);
  assert.deepEqual(calls, [['verified-user', 'session-1']]);
  assert.deepEqual(responses, [{
    body: {
      session: {
        id: 'session-1',
        status: 'completed',
        currentQuestion: { text: '如何验证方案？' },
        turns: [{ question: { text: '介绍项目' }, answer: '我的回答' }],
        skillReview: { summary: '补充验证指标' }
      }
    },
    status: 200
  }]);
});

test('review route returns a validation error when the session is not completed', async () => {
  const message = '请先结束这场模拟面试再生成复盘计划';
  const { handler, responses } = createHarness({
    user: { userId: 'verified-user' },
    reviewSession: async () => { throw new Error(message); }
  });

  assert.equal(await handler(reviewRequest(), {}), true);
  assert.deepEqual(responses, [{ body: { error: message }, status: 400 }]);
});

test('review route forwards explicit legacy upgrade only for a true flag', async () => {
  const calls = [];
  const { handler, responses } = createHarness({
    user: { userId: 'verified-user' },
    body: { regenerate: true },
    reviewSession: async (...args) => {
      calls.push(args);
      return { id: 'session-1', turns: [], skillReview: { version: 3 } };
    }
  });
  await handler(reviewRequest(), {});
  assert.deepEqual(calls, [['verified-user', 'session-1', { regenerate: true }]]);
  assert.equal(responses[0].body.session.skillReview.version, 3);
});

test('practice route injects the verified user identity and submitted answer', async () => {
  const calls = [];
  const { handler, responses } = createHarness({
    user: { userId: 'verified-user' },
    body: { day: 2, answer: '我补充了明确的指标口径和验证步骤。' },
    practiceReview: async (...args) => {
      calls.push(args);
      return { id: 'session-1', turns: [], practiceAttempts: [{ day: 2 }] };
    }
  });
  assert.equal(await handler({ method: 'POST', url: '/api/interview/sessions/session-1/review/practice' }, {}), true);
  assert.deepEqual(calls, [['verified-user', 'session-1', 2, '我补充了明确的指标口径和验证步骤。']]);
  assert.equal(responses[0].status, 200);
  assert.equal(responses[0].body.session.practiceAttempts[0].day, 2);
});
