const fs = require('fs');
const path = require('path');
const https = require('https');
const dotenv = require('dotenv');
const { getLlmTools, validateToolArguments } = require('../tools/catalog');
const { summarizeToolRouting } = require('./scoring');

dotenv.config({ path: path.join(__dirname, '../.env'), quiet: true });

const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, 'tool-routing.json'), 'utf8'));
const dryRun = process.argv.includes('--dry-run');
const systemPrompt = '你是一个智能助手。需要实时信息、用户数据或已上传文档时必须调用对应工具；普通知识问答不要调用工具。';

function validateDataset() {
  const ids = new Set();
  for (const item of dataset.cases) {
    if (!item.id || !item.prompt || !Array.isArray(item.expectedTools)) {
      throw new Error('评测集存在缺少 id、prompt 或 expectedTools 的条目');
    }
    if (ids.has(item.id)) throw new Error(`评测 ID 重复: ${item.id}`);
    ids.add(item.id);
    for (const tool of item.expectedTools) validateToolArguments(tool, sampleArguments(tool));
  }
}

function sampleArguments(tool) {
  const samples = {
    get_weather: { city: '北京' },
    search_web: { query: '测试' },
    get_todos: {},
    add_todo: { text: '测试' },
    delete_todo: { id: 1 },
    toggle_todo: { id: 1 },
    get_datetime: {},
    write_note: { title: '测试', text: '测试' },
    read_notes: {},
    retrieve_knowledge: { query: '测试' }
  };
  return samples[tool] || {};
}

function callModel(prompt) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL;
  if (!apiKey || !baseUrl) throw new Error('运行在线评测前需要配置 DEEPSEEK_API_KEY 和 DEEPSEEK_BASE_URL');

  const body = JSON.stringify({
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    tools: getLlmTools(),
    tool_choice: 'auto',
    temperature: 0,
    max_tokens: 300
  });
  const url = new URL(baseUrl);

  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, response => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        let json;
        try { json = JSON.parse(data); }
        catch { reject(new Error('评测模型返回了无效 JSON')); return; }
        if (response.statusCode < 200 || response.statusCode >= 300 || json.error) {
          reject(new Error(json.error?.message || `评测请求失败（HTTP ${response.statusCode}）`));
          return;
        }
        resolve(json);
      });
    });
    request.on('timeout', () => request.destroy(new Error('评测请求超时')));
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

async function run() {
  validateDataset();
  if (dryRun) {
    console.log(`评测集校验通过：${dataset.cases.length} 条用例，目标准确率 ${(dataset.threshold * 100).toFixed(0)}%`);
    return;
  }

  const results = [];
  for (const item of dataset.cases) {
    const startedAt = performance.now();
    const response = await callModel(item.prompt);
    const actualTools = (response.choices?.[0]?.message?.tool_calls || []).map(call => call.function.name);
    const result = {
      id: item.id,
      expectedTools: item.expectedTools,
      actualTools,
      latencyMs: Math.round(performance.now() - startedAt)
    };
    results.push(result);
    console.log(`${item.id}: expected=[${item.expectedTools}] actual=[${actualTools}] ${result.latencyMs}ms`);
  }

  const summary = summarizeToolRouting(results);
  const report = { generatedAt: new Date().toISOString(), datasetVersion: dataset.version, summary, results };
  const resultDir = path.join(__dirname, 'results');
  fs.mkdirSync(resultDir, { recursive: true });
  fs.writeFileSync(path.join(resultDir, 'latest.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  if (summary.accuracy < dataset.threshold) process.exitCode = 1;
}

run().catch(error => {
  console.error(`评测失败：${error.message}`);
  process.exitCode = 1;
});
