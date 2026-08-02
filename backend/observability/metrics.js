const httpCounters = new Map();
const httpDurations = new Map();
const toolCounters = new Map();
const toolDurations = new Map();
const ragCounters = new Map();
const ragDurations = new Map();
const llmCounters = new Map();
const llmDurations = new Map();
let llmInputTokensTotal = 0;
let llmOutputTokensTotal = 0;
let ragResultsTotal = 0;

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function observe(map, key, value) {
  const current = map.get(key) || { count: 0, sum: 0, max: 0 };
  current.count += 1;
  current.sum += value;
  current.max = Math.max(current.max, value);
  map.set(key, current);
}

function normalizeRoute(method, rawUrl) {
  let pathname;
  try { pathname = new URL(rawUrl, 'http://localhost').pathname; }
  catch { return 'unknown'; }

  if (/^\/api\/todos\/[^/]+\/toggle$/.test(pathname)) return '/api/todos/:id/toggle';
  if (/^\/api\/todos\/[^/]+$/.test(pathname)) return '/api/todos/:id';
  if (method === 'DELETE' && /^\/api\/knowledge\/.+/.test(pathname)) return '/api/knowledge/:document';
  return pathname;
}

function recordHttp({ method, route, status, durationMs }) {
  const key = JSON.stringify([method, route, String(status)]);
  increment(httpCounters, key);
  observe(httpDurations, key, durationMs);
}

function recordTool({ tool, status, durationMs }) {
  const key = JSON.stringify([tool, status]);
  increment(toolCounters, key);
  observe(toolDurations, key, durationMs);
}

function recordRag({ outcome, durationMs, resultCount }) {
  increment(ragCounters, outcome);
  ragResultsTotal += resultCount;
  observe(ragDurations, outcome, durationMs);
}

function recordLlm({ operation, status, durationMs, usage = {} }) {
  const key = JSON.stringify([operation, status]);
  increment(llmCounters, key);
  observe(llmDurations, key, durationMs);
  llmInputTokensTotal += usage.prompt_tokens || usage.input_tokens || 0;
  llmOutputTokensTotal += usage.completion_tokens || usage.output_tokens || 0;
}

function escapeLabel(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function labels(values) {
  return `{${Object.entries(values).map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(',')}}`;
}

function renderPrometheus() {
  const lines = [
    '# HELP agentic_http_requests_total Total HTTP responses.',
    '# TYPE agentic_http_requests_total counter'
  ];

  for (const [key, count] of [...httpCounters.entries()].sort()) {
    const [method, route, status] = JSON.parse(key);
    const metricLabels = labels({ method, route, status });
    const duration = httpDurations.get(key);
    lines.push(`agentic_http_requests_total${metricLabels} ${count}`);
    lines.push(`agentic_http_request_duration_ms_sum${metricLabels} ${duration.sum.toFixed(3)}`);
    lines.push(`agentic_http_request_duration_ms_count${metricLabels} ${duration.count}`);
    lines.push(`agentic_http_request_duration_ms_max${metricLabels} ${duration.max.toFixed(3)}`);
  }

  lines.push('# HELP agentic_tool_executions_total Total agent tool executions.');
  lines.push('# TYPE agentic_tool_executions_total counter');
  for (const [key, count] of [...toolCounters.entries()].sort()) {
    const [tool, status] = JSON.parse(key);
    const metricLabels = labels({ tool, status });
    const duration = toolDurations.get(key);
    lines.push(`agentic_tool_executions_total${metricLabels} ${count}`);
    lines.push(`agentic_tool_duration_ms_sum${metricLabels} ${duration.sum.toFixed(3)}`);
    lines.push(`agentic_tool_duration_ms_count${metricLabels} ${duration.count}`);
  }

  lines.push('# HELP agentic_rag_queries_total Total RAG queries by outcome.');
  lines.push('# TYPE agentic_rag_queries_total counter');
  for (const [outcome, count] of [...ragCounters.entries()].sort()) {
    const metricLabels = labels({ outcome });
    const duration = ragDurations.get(outcome);
    lines.push(`agentic_rag_queries_total${metricLabels} ${count}`);
    lines.push(`agentic_rag_duration_ms_sum${metricLabels} ${duration.sum.toFixed(3)}`);
    lines.push(`agentic_rag_duration_ms_count${metricLabels} ${duration.count}`);
    lines.push(`agentic_rag_duration_ms_max${metricLabels} ${duration.max.toFixed(3)}`);
  }
  lines.push('# HELP agentic_rag_results_total Total chunks returned by RAG.');
  lines.push('# TYPE agentic_rag_results_total counter');
  lines.push(`agentic_rag_results_total ${ragResultsTotal}`);

  lines.push('# HELP agentic_llm_calls_total Total LLM calls by operation and status.');
  lines.push('# TYPE agentic_llm_calls_total counter');
  for (const [key, count] of [...llmCounters.entries()].sort()) {
    const [operation, status] = JSON.parse(key);
    const metricLabels = labels({ operation, status });
    const duration = llmDurations.get(key);
    lines.push(`agentic_llm_calls_total${metricLabels} ${count}`);
    lines.push(`agentic_llm_duration_ms_sum${metricLabels} ${duration.sum.toFixed(3)}`);
    lines.push(`agentic_llm_duration_ms_count${metricLabels} ${duration.count}`);
    lines.push(`agentic_llm_duration_ms_max${metricLabels} ${duration.max.toFixed(3)}`);
  }
  lines.push('# HELP agentic_llm_input_tokens_total Total LLM input tokens reported by the provider.');
  lines.push('# TYPE agentic_llm_input_tokens_total counter');
  lines.push(`agentic_llm_input_tokens_total ${llmInputTokensTotal}`);
  lines.push('# HELP agentic_llm_output_tokens_total Total LLM output tokens reported by the provider.');
  lines.push('# TYPE agentic_llm_output_tokens_total counter');
  lines.push(`agentic_llm_output_tokens_total ${llmOutputTokensTotal}`);

  return `${lines.join('\n')}\n`;
}

function resetMetrics() {
  httpCounters.clear();
  httpDurations.clear();
  toolCounters.clear();
  toolDurations.clear();
  ragCounters.clear();
  ragDurations.clear();
  llmCounters.clear();
  llmDurations.clear();
  ragResultsTotal = 0;
  llmInputTokensTotal = 0;
  llmOutputTokensTotal = 0;
}

module.exports = {
  normalizeRoute,
  recordHttp,
  recordTool,
  recordRag,
  recordLlm,
  renderPrometheus,
  resetMetrics
};
