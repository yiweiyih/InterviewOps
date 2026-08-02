const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeRoute,
  recordHttp,
  recordTool,
  recordRag,
  renderPrometheus,
  resetMetrics
} = require('../observability/metrics');

test.beforeEach(resetMetrics);

test('normalizes dynamic routes to avoid high-cardinality metrics', () => {
  assert.equal(normalizeRoute('DELETE', '/api/todos/123'), '/api/todos/:id');
  assert.equal(normalizeRoute('PATCH', '/api/todos/123/toggle'), '/api/todos/:id/toggle');
  assert.equal(normalizeRoute('DELETE', '/api/knowledge/resume.md'), '/api/knowledge/:document');
});

test('renders HTTP, tool and RAG metrics without user data', () => {
  recordHttp({ method: 'GET', route: '/health', status: 200, durationMs: 12.5 });
  recordTool({ tool: 'get_weather', status: 'success', durationMs: 40 });
  recordRag({ outcome: 'hit', durationMs: 30, resultCount: 3 });

  const output = renderPrometheus();
  assert.match(output, /agentic_http_requests_total\{method="GET",route="\/health",status="200"\} 1/);
  assert.match(output, /agentic_tool_executions_total\{tool="get_weather",status="success"\} 1/);
  assert.match(output, /agentic_rag_queries_total\{outcome="hit"\} 1/);
  assert.match(output, /agentic_rag_results_total 3/);
  assert.doesNotMatch(output, /userId/);
});
