const test = require('node:test');
const assert = require('node:assert/strict');
const { createInterviewHandler } = require('../interview/routes');

function createHarness(user, deleteSession) {
  const responses = [];
  const handler = createInterviewHandler({
    service: { deleteSession },
    verifyToken: () => user,
    readBody: async () => ({}),
    sendJson: (_res, body, status = 200) => responses.push({ body, status })
  });
  return { handler, responses };
}

const request = { method: 'DELETE', url: '/api/interview/sessions/session-1' };

test('delete route requires login and uses the verified user identity', async () => {
  const calls = [];
  const unauthenticated = createHarness(null, () => { throw new Error('不应调用服务'); });
  await unauthenticated.handler(request, {});
  assert.deepEqual(unauthenticated.responses, [{ body: { error: '未登录' }, status: 401 }]);

  const authenticated = createHarness({ userId: 'verified-user' }, (...args) => {
    calls.push(args);
    return true;
  });
  await authenticated.handler(request, {});
  assert.deepEqual(calls, [['verified-user', 'session-1']]);
  assert.deepEqual(authenticated.responses, [{ body: { ok: true }, status: 200 }]);
});

test('delete route returns 404 for missing records and rejects active sessions', async () => {
  const missing = createHarness({ userId: 'user-a' }, () => false);
  await missing.handler(request, {});
  assert.deepEqual(missing.responses, [{ body: { error: '没有找到这场模拟面试' }, status: 404 }]);

  const active = createHarness({ userId: 'user-a' }, () => {
    throw new Error('请先结束正在进行的模拟面试再删除');
  });
  await active.handler(request, {});
  assert.deepEqual(active.responses, [{ body: { error: '请先结束正在进行的模拟面试再删除' }, status: 400 }]);
});
