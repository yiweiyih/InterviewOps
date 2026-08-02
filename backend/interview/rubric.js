const INTERVIEW_MODES = Object.freeze({
  project: {
    label: '项目深挖',
    description: '围绕项目价值、架构取舍、指标与个人贡献连续追问',
    dimensions: ['problem', 'depth', 'ownership', 'communication']
  },
  frontend: {
    label: '前端专项',
    description: '覆盖浏览器、工程化、性能、框架原理与编码取舍',
    dimensions: ['fundamentals', 'depth', 'tradeoff', 'communication']
  },
  agent: {
    label: 'Agent / RAG',
    description: '检验 Agent 编排、RAG 链路、评测与可靠性设计',
    dimensions: ['fundamentals', 'depth', 'tradeoff', 'evidence']
  },
  behavioral: {
    label: '行为面试',
    description: '通过 STAR 结构检验协作、推动力、复盘与成长',
    dimensions: ['structure', 'ownership', 'evidence', 'reflection']
  }
});

const SCORE_DIMENSIONS = Object.freeze({
  problem: '问题定义',
  fundamentals: '基础准确性',
  depth: '技术深度',
  tradeoff: '取舍意识',
  ownership: '个人贡献',
  evidence: '事实与指标',
  structure: '表达结构',
  communication: '沟通清晰度',
  reflection: '复盘与成长'
});

function clampScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 1;
  return Math.min(5, Math.max(1, Math.round(score * 10) / 10));
}

function toStringList(value, limit = 4) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function getMode(mode) {
  return INTERVIEW_MODES[mode] || INTERVIEW_MODES.project;
}

function normalizeQuestion(value, fallbackCompetency = '综合能力') {
  const source = value && typeof value === 'object' ? value : {};
  const text = String(source.text || source.question || '').trim();
  if (!text) throw new Error('模型没有生成有效的面试问题');

  return {
    text,
    competency: String(source.competency || fallbackCompetency).trim(),
    rationale: String(source.rationale || '根据候选人资料进行针对性追问').trim(),
    expectedSignals: toStringList(source.expectedSignals || source.expected_signals)
  };
}

function normalizeFeedback(value, mode) {
  const source = value && typeof value === 'object' ? value : {};
  const dimensions = getMode(mode).dimensions;
  const rawScores = source.scores && typeof source.scores === 'object' ? source.scores : {};
  const scores = Object.fromEntries(dimensions.map(key => [key, clampScore(rawScores[key])]));
  const averageScore = Math.round(
    (Object.values(scores).reduce((sum, score) => sum + score, 0) / dimensions.length) * 10
  ) / 10;

  return {
    averageScore,
    scores,
    summary: String(source.summary || '已完成本题评估').trim(),
    evidence: toStringList(source.evidence, 3),
    strengths: toStringList(source.strengths, 3),
    missingPoints: toStringList(source.missingPoints || source.missing_points, 4),
    betterStructure: String(source.betterStructure || source.better_structure || '').trim()
  };
}

function buildReport(session) {
  const turns = Array.isArray(session.turns) ? session.turns : [];
  const scoreRows = turns.map(turn => turn.feedback?.scores).filter(Boolean);
  const dimensionTotals = {};
  const dimensionCounts = {};

  for (const scores of scoreRows) {
    for (const [key, value] of Object.entries(scores)) {
      dimensionTotals[key] = (dimensionTotals[key] || 0) + value;
      dimensionCounts[key] = (dimensionCounts[key] || 0) + 1;
    }
  }

  const dimensionScores = Object.fromEntries(
    Object.keys(dimensionTotals).map(key => [
      key,
      Math.round((dimensionTotals[key] / dimensionCounts[key]) * 10) / 10
    ])
  );
  const scores = Object.values(dimensionScores);
  const overallScore = scores.length
    ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 20)
    : 0;
  const ranked = Object.entries(dimensionScores).sort((a, b) => b[1] - a[1]);
  const strengths = ranked.slice(0, 2).map(([key, score]) => ({ key, label: SCORE_DIMENSIONS[key], score }));
  const gaps = ranked.slice(-2).reverse().map(([key, score]) => ({ key, label: SCORE_DIMENSIONS[key], score }));
  const missingPoints = turns.flatMap(turn => turn.feedback?.missingPoints || []);

  return {
    overallScore,
    dimensionScores,
    strengths,
    gaps,
    answeredQuestions: turns.length,
    nextActions: [...new Set(missingPoints)].slice(0, 3),
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  INTERVIEW_MODES,
  SCORE_DIMENSIONS,
  buildReport,
  clampScore,
  getMode,
  normalizeFeedback,
  normalizeQuestion,
  toStringList
};
