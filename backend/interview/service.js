const crypto = require('crypto');
const { InterviewStore } = require('./store');
const {
  INTERVIEW_MODES,
  SCORE_DIMENSIONS,
  buildReport,
  getMode,
  normalizeFeedback,
  normalizeQuestion
} = require('./rubric');

function parseJsonResponse(response) {
  const content = response?.choices?.[0]?.message?.content ?? response;
  if (typeof content === 'string') return JSON.parse(content);
  if (content && typeof content === 'object') return content;
  throw new Error('模型返回了无效的结构化结果');
}

function compactSession(session) {
  return {
    id: session.id,
    title: session.title,
    mode: session.mode,
    status: session.status,
    questionCount: session.questionCount,
    answeredQuestions: session.turns.length,
    startedAt: session.startedAt,
    completedAt: session.completedAt || null,
    report: session.report || null
  };
}

function toPublicSession(session) {
  if (!session) return session;
  const sanitizeQuestion = question => {
    if (!question) return question;
    const { expectedSignals, ...publicQuestion } = question;
    return publicQuestion;
  };
  return {
    ...session,
    currentQuestion: sanitizeQuestion(session.currentQuestion),
    turns: (session.turns || []).map(turn => ({
      ...turn,
      question: sanitizeQuestion(turn.question)
    }))
  };
}

function createInterviewService({ dataDir, callJson, retrieveKnowledge }) {
  const store = new InterviewStore(dataDir);

  async function getContext(userId, workspace, mode) {
    try {
      const query = [
        workspace.profile.targetRole,
        workspace.target.jobTitle,
        workspace.target.company,
        getMode(mode).label,
        workspace.target.jobDescription.slice(0, 500)
      ].filter(Boolean).join(' ');
      return await retrieveKnowledge(query, 5, userId);
    } catch (error) {
      console.warn('[Interview] 资料检索失败，继续使用画像与 JD:', error.message);
      return [];
    }
  }

  async function generateQuestion({ workspace, mode, difficulty, context, previousTurns = [] }) {
    const modeConfig = getMode(mode);
    const payload = await callJson([
      {
        role: 'system',
        content: `你是严格但友善的技术面试官。生成一题可追问、可基于事实评分的问题。只输出 JSON：{"text":"问题","competency":"考察能力","rationale":"为什么问","expectedSignals":["优秀回答信号"]}。不要泄露参考答案。`
      },
      {
        role: 'user',
        content: JSON.stringify({
          target: workspace.target,
          profile: workspace.profile,
          mode: modeConfig,
          difficulty,
          materials: context.map(item => ({ source: item.source, text: item.text.slice(0, 800) })),
          previousTurns: previousTurns.map(turn => ({
            question: turn.question.text,
            answer: turn.answer.slice(0, 600),
            missingPoints: turn.feedback.missingPoints
          }))
        })
      }
    ]);
    return normalizeQuestion(parseJsonResponse(payload), modeConfig.label);
  }

  async function evaluateAnswer({ session, answer, workspace }) {
    const modeConfig = getMode(session.mode);
    const dimensionSchema = Object.fromEntries(
      modeConfig.dimensions.map(key => [key, `${SCORE_DIMENSIONS[key]}，1-5 分`])
    );
    const payload = await callJson([
      {
        role: 'system',
        content: `你是技术面试复盘教练。必须只依据候选人的回答评分，不能脑补经历。只输出 JSON：{"scores":${JSON.stringify(dimensionSchema)},"summary":"一句总评","evidence":["回答中的原句或事实"],"strengths":["做得好的点"],"missingPoints":["缺失或薄弱点"],"betterStructure":"更好的回答结构"}。每项分数必须为 1-5。`
      },
      {
        role: 'user',
        content: JSON.stringify({
          profile: workspace.profile,
          target: workspace.target,
          mode: modeConfig,
          question: session.currentQuestion,
          answer
        })
      }
    ]);
    return normalizeFeedback(parseJsonResponse(payload), session.mode);
  }

  return {
    modes: INTERVIEW_MODES,

    getWorkspace(userId) {
      return store.getWorkspace(userId);
    },

    updateWorkspace(userId, patch) {
      return store.updateWorkspace(userId, patch);
    },

    listSessions(userId) {
      return store.listSessions(userId).map(compactSession);
    },

    getSession(userId, sessionId) {
      return store.getSession(userId, sessionId);
    },

    getSummary(userId) {
      const workspace = store.getWorkspace(userId);
      const sessions = store.listSessions(userId);
      const completed = sessions.filter(item => item.status === 'completed' && item.report);
      const averageScore = completed.length
        ? Math.round(completed.reduce((sum, item) => sum + item.report.overallScore, 0) / completed.length)
        : 0;
      const gapCounts = {};
      for (const session of completed) {
        for (const gap of session.report.gaps || []) {
          gapCounts[gap.key] = (gapCounts[gap.key] || 0) + 1;
        }
      }
      const weakDimensions = Object.entries(gapCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([key]) => ({ key, label: SCORE_DIMENSIONS[key] }));
      const profileFields = [
        workspace.profile.targetRole,
        workspace.profile.introduction,
        workspace.target.jobTitle,
        workspace.target.company,
        workspace.target.jobDescription
      ];
      const profileCompleteness = Math.round(
        (profileFields.filter(value => String(value || '').trim()).length / profileFields.length) * 100
      );

      return {
        workspace,
        profileCompleteness,
        sessions: sessions.length,
        completedSessions: completed.length,
        averageScore,
        weakDimensions,
        recentSessions: sessions.slice(0, 3).map(compactSession)
      };
    },

    async startSession(userId, options = {}) {
      const mode = INTERVIEW_MODES[options.mode] ? options.mode : 'project';
      const difficulty = ['基础', '进阶', '压力'].includes(options.difficulty) ? options.difficulty : '进阶';
      const questionCount = Math.min(8, Math.max(2, Number(options.questionCount) || 4));
      const workspace = store.getWorkspace(userId);
      const context = await getContext(userId, workspace, mode);
      const firstQuestion = await generateQuestion({ workspace, mode, difficulty, context });
      const now = new Date().toISOString();
      const session = {
        id: crypto.randomUUID(),
        title: `${getMode(mode).label} · ${workspace.target.company || workspace.profile.targetRole || '模拟面试'}`,
        mode,
        difficulty,
        questionCount,
        status: 'active',
        startedAt: now,
        updatedAt: now,
        currentQuestion: firstQuestion,
        contextSources: [...new Set(context.map(item => item.source))],
        turns: [],
        report: null
      };
      return store.saveSession(userId, session);
    },

    async answerSession(userId, sessionId, rawAnswer) {
      const answer = String(rawAnswer || '').trim();
      if (answer.length < 20) throw new Error('回答至少需要 20 个字符，才能进行有效复盘');
      if (answer.length > 10_000) throw new Error('单题回答不能超过 10,000 个字符');

      const session = store.getSession(userId, sessionId);
      if (!session) throw new Error('没有找到这场模拟面试');
      if (session.status !== 'active') throw new Error('这场模拟面试已经结束');
      const workspace = store.getWorkspace(userId);
      const feedback = await evaluateAnswer({ session, answer, workspace });
      session.turns.push({
        question: session.currentQuestion,
        answer,
        feedback,
        answeredAt: new Date().toISOString()
      });

      if (session.turns.length >= session.questionCount) {
        session.status = 'completed';
        session.completedAt = new Date().toISOString();
        session.currentQuestion = null;
        session.report = buildReport(session);
      } else {
        const context = await getContext(userId, workspace, session.mode);
        session.currentQuestion = await generateQuestion({
          workspace,
          mode: session.mode,
          difficulty: session.difficulty,
          context,
          previousTurns: session.turns
        });
      }
      session.updatedAt = new Date().toISOString();
      store.saveSession(userId, session);
      return session;
    },

    completeSession(userId, sessionId) {
      const session = store.getSession(userId, sessionId);
      if (!session) throw new Error('没有找到这场模拟面试');
      if (session.status !== 'completed') {
        session.status = 'completed';
        session.completedAt = new Date().toISOString();
        session.currentQuestion = null;
        session.report = buildReport(session);
        store.saveSession(userId, session);
      }
      return session;
    }
  };
}

module.exports = {
  compactSession,
  createInterviewService,
  parseJsonResponse,
  toPublicSession
};
