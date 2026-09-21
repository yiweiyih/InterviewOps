const fs = require('fs');
const path = require('path');

const SKILL_NAME = 'interview-review';
const REVIEW_VERSION = 3;
const SKILL_PATH = path.join(__dirname, 'SKILL.md');

function loadInstructions() {
  const source = fs.readFileSync(SKILL_PATH, 'utf8');
  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  if (!match || !match[1].trim()) throw new Error('面试复盘 Skill 配置无效');
  return match[1].trim();
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? Array.from(value.trim()).slice(0, maxLength).join('') : '';
}

function normalizeEvidenceText(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/gu, '');
}

function metricTokens(value) {
  const matches = String(value || '').normalize('NFKC')
    .match(/\d+(?:\.\d+)?\s*(?:%|ms|毫秒|分钟|秒|GB|MB|倍)/giu) || [];
  return matches.map(item => item.replace(/\s+/gu, '').toLowerCase());
}

function assertCleanText(text) {
  if (text.includes('\uFFFD') || Buffer.from(text, 'utf8').toString('utf8') !== text) {
    throw new Error('模型输出包含乱码');
  }
}

function questionReferences(value) {
  const text = String(value || '').normalize('NFKC');
  const patterns = [
    /第\s*(\d{1,3})\s*题/giu,
    /第\s*(\d{1,3})\s*个问题/giu,
    /问题\s*(\d{1,3})/giu,
    /\bQ\s*0*(\d{1,3})\b/giu
  ];
  const references = new Set();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) references.add(Number(match[1]));
  }
  return [...references];
}

function buildFocusAreas(session) {
  const turns = session.turns || [];
  return (session.report?.gaps || []).map(gap => {
    const ranked = turns
      .map((turn, index) => ({ turn, questionNumber: index + 1 }))
      .sort((a, b) => (a.turn.feedback?.scores?.[gap.key] ?? 5) - (b.turn.feedback?.scores?.[gap.key] ?? 5));
    const source = ranked[0];
    return {
      dimension: gap.key,
      label: gap.label,
      score: gap.score,
      questionNumber: source?.questionNumber || 1
    };
  });
}

function normalizeReview(value, session) {
  const source = value && typeof value === 'object' ? value : {};
  const rawDays = Array.isArray(source.days) ? source.days : [];
  const days = [1, 2, 3].map(day => {
    const raw = rawDays.find(item => Number(item?.day) === day);
    if (!raw) throw new Error('模型没有生成完整的三天复习计划');
    const focus = cleanText(raw.focus, 100);
    const task = cleanText(raw.task, 500);
    const checkpoint = cleanText(raw.checkpoint, 300);
    if (!focus || !task || !checkpoint) throw new Error('模型没有生成有效的复习任务');
    [focus, task, checkpoint].forEach(assertCleanText);
    const questionNumber = Number(raw.evidence?.questionNumber);
    const quote = cleanText(raw.evidence?.quote, 200);
    assertCleanText(quote);
    const answer = session.turns[questionNumber - 1]?.answer;
    if (!Number.isInteger(questionNumber) || !answer) throw new Error('模型没有引用有效的本场题目');
    const mentionedQuestions = questionReferences([focus, task, checkpoint].join(' '));
    if (mentionedQuestions.some(number => number !== questionNumber)) {
      throw new Error(`第 ${day} 天只能围绕证据对应的第 ${questionNumber} 题`);
    }
    if (normalizeEvidenceText(quote).length < 6 ||
      !normalizeEvidenceText(answer).includes(normalizeEvidenceText(quote))) {
      throw new Error('引用原句不在对应题目的原始回答中');
    }
    const answerMetrics = new Set(metricTokens(answer));
    for (const metric of metricTokens([focus, task, checkpoint].join(' '))) {
      if (!answerMetrics.has(metric)) throw new Error(`引用了回答中不存在的指标：${metric}`);
    }
    return {
      day,
      focus,
      task,
      checkpoint,
      evidence: { questionNumber, quote },
      evidenceQuestionNumbers: [questionNumber]
    };
  });
  const summary = cleanText(source.summary, 400);
  if (!summary) throw new Error('模型没有生成有效的复盘总结');
  assertCleanText(summary);
  const sessionMetrics = new Set((session.turns || []).flatMap(turn => metricTokens(turn.answer)));
  for (const metric of metricTokens(summary)) {
    if (!sessionMetrics.has(metric)) throw new Error(`总结引用了回答中不存在的指标：${metric}`);
  }
  return {
    skill: SKILL_NAME,
    version: REVIEW_VERSION,
    summary,
    focusAreas: buildFocusAreas(session),
    days,
    generatedAt: new Date().toISOString()
  };
}

async function generateReview({ session, callJson, retrieveKnowledge, parseJsonResponse, userId }) {
  const startedAt = performance.now();
  const instructions = loadInstructions();
  const gaps = (session.report?.gaps || []).map(item => item.label).join(' ');
  const target = session.reviewContext || { role: '', jobDescription: '' };
  let materials = [];
  try {
    const query = [target.role, gaps].filter(Boolean).join(' ');
    materials = await retrieveKnowledge(query, 3, userId);
  } catch (error) {
    console.warn('[Interview review] 资料检索失败，继续依据答题证据生成:', error.message);
  }
  const messages = [
    { role: 'system', content: instructions },
    {
      role: 'user',
      content: JSON.stringify({
        target,
        report: session.report,
        turns: session.turns.map((turn, index) => ({
          questionNumber: index + 1,
          question: turn.question?.text,
          answer: String(turn.answer || '').slice(0, 1800),
          scores: turn.feedback?.scores,
          evidence: turn.feedback?.evidence,
          missingPoints: turn.feedback?.missingPoints
        })),
        materials: (Array.isArray(materials) ? materials : []).slice(0, 3)
          .map(item => ({ source: item.source, text: String(item.text || '').slice(0, 600) }))
      })
    }
  ];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await callJson(messages);
    try {
      const review = normalizeReview(parseJsonResponse(response), session);
      review.generationAttempts = attempt + 1;
      review.latencyMs = Math.round(performance.now() - startedAt);
      return review;
    } catch (error) {
      if (attempt === 1) throw error;
      messages.push({
        role: 'user',
        content: `上次结果未通过服务端证据校验：${error.message}。请重新输出完整 JSON：每天只能绑定一道题，focus、task、checkpoint 和 evidence 必须围绕同一道题，不得提及其他题号；每天提供能在对应原始回答中逐字找到的短句；不得出现回答中没有的百分比或时延数值，也不得包含乱码。`
      });
    }
  }
}

module.exports = {
  REVIEW_VERSION,
  buildFocusAreas,
  generateReview,
  loadInstructions,
  metricTokens,
  normalizeReview,
  questionReferences
};
