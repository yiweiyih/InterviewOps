const { toPublicSession } = require('./service');

function createInterviewHandler({ service, verifyToken, readBody, sendJson }) {
  return async function handleInterview(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/interview')) return false;

    const user = verifyToken(req);
    if (!user) {
      sendJson(res, { error: '未登录' }, 401);
      return true;
    }

    try {
      if (req.method === 'GET' && url.pathname === '/api/interview/workspace') {
        sendJson(res, { workspace: service.getWorkspace(user.userId), modes: service.modes });
        return true;
      }
      if (req.method === 'PUT' && url.pathname === '/api/interview/workspace') {
        sendJson(res, { workspace: service.updateWorkspace(user.userId, await readBody(req)) });
        return true;
      }
      if (req.method === 'GET' && url.pathname === '/api/interview/sessions') {
        sendJson(res, { sessions: service.listSessions(user.userId) });
        return true;
      }
      if (req.method === 'POST' && url.pathname === '/api/interview/sessions') {
        const session = await service.startSession(user.userId, await readBody(req));
        sendJson(res, { session: toPublicSession(session) }, 201);
        return true;
      }

      const sessionMatch = url.pathname.match(/^\/api\/interview\/sessions\/([^/]+)$/);
      if (req.method === 'GET' && sessionMatch) {
        const session = service.getSession(user.userId, sessionMatch[1]);
        if (!session) sendJson(res, { error: '没有找到这场模拟面试' }, 404);
        else sendJson(res, { session: toPublicSession(session) });
        return true;
      }

      const answerMatch = url.pathname.match(/^\/api\/interview\/sessions\/([^/]+)\/answer$/);
      if (req.method === 'POST' && answerMatch) {
        const body = await readBody(req);
        sendJson(res, { session: toPublicSession(await service.answerSession(user.userId, answerMatch[1], body.answer)) });
        return true;
      }

      const completeMatch = url.pathname.match(/^\/api\/interview\/sessions\/([^/]+)\/complete$/);
      if (req.method === 'POST' && completeMatch) {
        sendJson(res, { session: toPublicSession(service.completeSession(user.userId, completeMatch[1])) });
        return true;
      }

      sendJson(res, { error: '未找到面试工作区接口' }, 404);
      return true;
    } catch (error) {
      const isValidationError = /至少|不能超过|已经结束|没有找到|无效/.test(error.message);
      sendJson(res, { error: error.message }, isValidationError ? 400 : 502);
      return true;
    }
  };
}

module.exports = { createInterviewHandler };
