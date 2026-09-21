const fs = require('fs');
const path = require('path');
const { generateReview, normalizeReview } = require('../skills/interview-review');

const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, 'review-quality-cases.json'), 'utf8'));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function applyCase(candidate, item) {
  if (!item.patch) return candidate;
  const parts = item.patch.path.split('.');
  let target = candidate;
  for (const part of parts.slice(0, -1)) {
    if (target == null || !Object.hasOwn(target, part)) {
      throw new Error(`评测样例路径无效：${item.patch.path}`);
    }
    target = target[part];
  }
  target[parts.at(-1)] = item.patch.value;
  return candidate;
}

function runOffline() {
  const results = dataset.cases.map(item => {
    let actual = 'accept';
    let reason = '';
    try {
      normalizeReview(applyCase(clone(dataset.candidate), item), dataset.session);
    } catch (error) {
      actual = 'reject';
      reason = error.message;
    }
    return { id: item.id, category: item.category, expected: item.expected, actual,
      passed: actual === item.expected, reason };
  });
  const passed = results.filter(item => item.passed).length;
  console.table(results);
  console.log(`Review quality validator: ${passed}/${results.length} passed`);
  if (passed !== results.length) process.exitCode = 1;
}

async function runLive() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('缺少 DEEPSEEK_API_KEY；线上评测不会自动运行');
  const endpoint = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/chat/completions';
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const results = [];
  for (const item of dataset.liveCases) {
    const session = clone(dataset.session);
    if (item.answerAppend) session.turns[0].answer += `\n${item.answerAppend}`;
    try {
      const review = await generateReview({
        session,
        userId: 'review-quality-eval',
        retrieveKnowledge: async () => [],
        parseJsonResponse: response => {
          const content = response?.choices?.[0]?.message?.content;
          return typeof content === 'string' ? JSON.parse(content) : content;
        },
        callJson: async messages => {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages, max_tokens: 1000,
              response_format: { type: 'json_object' }, temperature: 0, stream: false }),
            signal: AbortSignal.timeout(60000)
          });
          if (!response.ok) throw new Error(`模型服务 HTTP ${response.status}`);
          return response.json();
        }
      });
      results.push({ id: item.id, passed: true, attempts: review.generationAttempts,
        latencyMs: review.latencyMs });
    } catch (error) {
      results.push({ id: item.id, passed: false, error: error.message });
    }
  }
  const passed = results.filter(item => item.passed).length;
  console.table(results);
  console.log(`Review live generation: ${passed}/${results.length} passed`);
  if (passed !== results.length) process.exitCode = 1;
}

if (process.argv.includes('--live')) {
  runLive().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
} else {
  runOffline();
}
