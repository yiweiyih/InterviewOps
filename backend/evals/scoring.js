function unique(values) {
  return [...new Set(values)];
}

function scoreCase(expectedTools, actualTools) {
  const expected = new Set(unique(expectedTools));
  const actual = new Set(unique(actualTools));
  const truePositives = [...actual].filter(tool => expected.has(tool)).length;
  const exact = expected.size === actual.size && [...expected].every(tool => actual.has(tool));

  return {
    exact,
    truePositives,
    predicted: actual.size,
    expected: expected.size
  };
}

function summarizeToolRouting(results) {
  const totals = results.reduce((summary, result) => {
    const score = scoreCase(result.expectedTools, result.actualTools);
    summary.exact += score.exact ? 1 : 0;
    summary.truePositives += score.truePositives;
    summary.predicted += score.predicted;
    summary.expected += score.expected;
    summary.latencyMs += result.latencyMs || 0;
    return summary;
  }, { exact: 0, truePositives: 0, predicted: 0, expected: 0, latencyMs: 0 });

  const count = results.length;
  return {
    cases: count,
    exactMatches: totals.exact,
    accuracy: count ? totals.exact / count : 0,
    precision: totals.predicted ? totals.truePositives / totals.predicted : 1,
    recall: totals.expected ? totals.truePositives / totals.expected : 1,
    averageLatencyMs: count ? totals.latencyMs / count : 0
  };
}

module.exports = { scoreCase, summarizeToolRouting };
