const test = require('node:test');
const assert = require('node:assert/strict');
const { chunkText, cosineSimilarity, summarizeDocuments } = require('../rag/index');

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

test('summarizeDocuments isolates users and groups chunks by source', () => {
  const store = [
    { userId: 'u-1', source: 'resume.md', indexedAt: '2026-08-01T00:00:00.000Z' },
    { userId: 'u-1', source: 'resume.md', indexedAt: '2026-08-01T00:00:00.000Z' },
    { userId: 'u-2', source: 'private.md', indexedAt: '2026-08-02T00:00:00.000Z' }
  ];

  assert.deepEqual(summarizeDocuments(store, 'u-1'), [
    { name: 'resume.md', chunks: 2, indexedAt: '2026-08-01T00:00:00.000Z' }
  ]);
});
