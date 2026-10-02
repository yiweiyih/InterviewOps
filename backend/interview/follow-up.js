const { SCORE_DIMENSIONS, getMode } = require('./rubric');

function weakestDimension(scores, dimensions) {
  return [...dimensions].sort((left, right) => (
    (Number(scores?.[left]) || 5) - (Number(scores?.[right]) || 5)
  ))[0];
}

function chooseGap(turn, dimensions) {
  const missingPoints = turn.feedback?.missingPoints || [];
  if (!missingPoints.length) return null;
  const details = (turn.feedback?.gapDetails || [])
    .filter(item => dimensions.includes(item.dimension) && missingPoints.includes(item.point))
    .sort((left, right) => (
      (Number(turn.feedback?.scores?.[left.dimension]) || 5)
      - (Number(turn.feedback?.scores?.[right.dimension]) || 5)
    ));
  return details[0] || {
    point: missingPoints[0],
    dimension: weakestDimension(turn.feedback?.scores, dimensions)
  };
}

function planFollowUp(mode, previousTurns = []) {
  const dimensions = getMode(mode).dimensions;
  if (!previousTurns.length) {
    return { strategy: 'opening', targetDimension: dimensions[0], sourceQuestionNumber: null, targetGap: null };
  }

  const lastTurn = previousTurns.at(-1);
  const gap = chooseGap(lastTurn, dimensions);
  // A gap gets one targeted follow-up. The next question switches dimension even if new gaps appear.
  if (gap && lastTurn.question?.followUp?.strategy !== 'deepen') {
    return {
      strategy: 'deepen',
      targetDimension: gap.dimension,
      sourceQuestionNumber: previousTurns.length,
      targetGap: gap.point
    };
  }

  const counts = Object.fromEntries(dimensions.map(key => [key, 0]));
  for (const turn of previousTurns) {
    const key = turn.question?.followUp?.targetDimension
      || dimensions.find(dimension => SCORE_DIMENSIONS[dimension] === turn.question?.competency);
    if (key in counts) counts[key] += 1;
  }
  const current = lastTurn.question?.followUp?.targetDimension;
  const candidates = dimensions.filter(key => key !== current);
  const targetDimension = candidates.sort((left, right) => (
    counts[left] - counts[right]
    || (Number(lastTurn.feedback?.scores?.[left]) || 5) - (Number(lastTurn.feedback?.scores?.[right]) || 5)
    || dimensions.indexOf(left) - dimensions.indexOf(right)
  ))[0] || dimensions[0];
  return { strategy: 'switch', targetDimension, sourceQuestionNumber: null, targetGap: null };
}

module.exports = { planFollowUp };
