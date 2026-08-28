const test = require('node:test');
const assert = require('node:assert/strict');
const {
  chunkText,
  cosineSimilarity,
  summarizeDocuments,
  tokenizeText,
  calculateBm25Scores,
  reciprocalRankFusion
} = require('../rag/index');

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
    { name: 'resume.md', category: 'other', chunks: 2, indexedAt: '2026-08-01T00:00:00.000Z' }
  ]);
});

test('tokenizeText keeps technical terms and creates Chinese phrase tokens', () => {
  const tokens = tokenizeText('用 DeepSeek 做混合检索 Hybrid-Search');

  assert.ok(tokens.includes('deepseek'));
  assert.ok(tokens.includes('hybrid-search'));
  assert.ok(tokens.includes('混合'));
  assert.ok(tokens.includes('检索'));
});

test('BM25 ranks a document with matching technical keywords first', () => {
  const scores = calculateBm25Scores('JWT 鉴权', [
    '使用 JWT 完成用户鉴权和数据隔离',
    '使用向量模型完成语义检索',
    '通过 SSE 返回流式文本'
  ]);

  assert.equal(scores.length, 3);
  assert.ok(scores[0] > scores[1]);
  assert.ok(scores[0] > scores[2]);
});

test('reciprocal rank fusion rewards items present near the top of both rankings', () => {
  const scores = reciprocalRankFusion([[0, 1, 2], [1, 0]], 3);

  assert.ok(scores[0] > scores[2]);
  assert.ok(scores[1] > scores[2]);
});
