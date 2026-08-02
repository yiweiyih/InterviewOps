const test = require('node:test');
const assert = require('node:assert/strict');
const { chunkText, cosineSimilarity } = require('../rag/index');

test('chunkText creates deterministic overlapping chunks', () => {
  assert.deepEqual(chunkText('abcdefghij', 6, 2), ['abcdef', 'efghij', 'ij']);
});

test('chunkText rejects overlap that could cause an infinite loop', () => {
  assert.throws(() => chunkText('abc', 3, 3), /overlap/);
});

test('cosineSimilarity handles normal and zero vectors', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([0, 0], [1, 0]), 0);
  assert.throws(() => cosineSimilarity([1], [1, 2]), /长度相同/);
});
