const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreCase, summarizeToolRouting } = require('../evals/scoring');

test('scores exact and partial tool routing results', () => {
  assert.equal(scoreCase(['get_weather'], ['get_weather']).exact, true);
  assert.deepEqual(scoreCase(['get_weather', 'get_datetime'], ['get_weather']), {
    exact: false,
    truePositives: 1,
    predicted: 1,
    expected: 2
  });
});

test('summarizes routing accuracy, precision, recall and latency', () => {
  const summary = summarizeToolRouting([
    { expectedTools: ['get_weather'], actualTools: ['get_weather'], latencyMs: 100 },
    { expectedTools: ['get_datetime'], actualTools: [], latencyMs: 200 }
  ]);

  assert.equal(summary.accuracy, 0.5);
  assert.equal(summary.precision, 1);
  assert.equal(summary.recall, 0.5);
  assert.equal(summary.averageLatencyMs, 150);
});
