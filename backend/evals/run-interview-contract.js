const fs = require('fs');
const path = require('path');
const { getMode, normalizeFeedback } = require('../interview/rubric');

const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'interview-contract-cases.json'), 'utf-8'));
const results = cases.map((item, index) => {
  const feedback = normalizeFeedback({ scores: item.scores }, item.mode);
  const expectedKeys = getMode(item.mode).dimensions;
  const actualKeys = Object.keys(feedback.scores);
  const passed = JSON.stringify(actualKeys) === JSON.stringify(expectedKeys)
    && feedback.averageScore === item.expectedAverage
    && Object.values(feedback.scores).every(score => score >= 1 && score <= 5);
  return { case: index + 1, mode: item.mode, passed, average: feedback.averageScore };
});

const passed = results.filter(item => item.passed).length;
console.table(results);
console.log(`Interview contract: ${passed}/${results.length} passed`);
if (passed !== results.length) process.exitCode = 1;
