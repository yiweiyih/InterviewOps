const fs = require('fs');
const path = require('path');
const { planFollowUp } = require('../interview/follow-up');
const { questionSimilarity } = require('../interview/service');
const { getMode } = require('../interview/rubric');

const input = process.argv[2] || path.join(__dirname, 'interview-followup-cases.json');
const cases = JSON.parse(fs.readFileSync(input, 'utf8'));
const rows = cases.map(item => {
  const decision = planFollowUp(item.mode, item.turns);
  const expected = item.expected;
  const matched = decision.strategy === expected.strategy
    && decision.targetDimension === expected.targetDimension
    && decision.targetGap === expected.targetGap;
  const similarity = Math.max(0, ...item.turns.map(turn => questionSimilarity(item.candidateQuestion, turn.question.text)));
  const repeated = similarity >= (decision.strategy === 'deepen' ? 0.68 : 0.48);
  const covered = new Set([...item.turns.map(turn => turn.question.followUp?.targetDimension), decision.targetDimension]);
  const plannedCoverage = `${[...covered].filter(key => getMode(item.mode).dimensions.includes(key)).length}/${getMode(item.mode).dimensions.length}`;
  return { case: item.name, decision: decision.strategy, matched, repeated, plannedCoverage };
});

console.table(rows);
console.log(`Sample follow-up cases: ${rows.filter(row => row.matched && !row.repeated).length}/${rows.length} passed`);
console.log('These are synthetic routing and text-repeat checks, not a measurement of live model quality.');
if (rows.some(row => !row.matched || row.repeated)) process.exitCode = 1;
