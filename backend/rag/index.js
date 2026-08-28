const https = require('https');
const fs = require('fs');
const path = require('path');
const { extractDocumentText } = require('../documents/extract-text');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });
const STORE_PATH = path.join(DATA_DIR, 'knowledge-store.json');
const SF_API_KEY = process.env.SILICONFLOW_API_KEY;
const EMBED_MODEL = 'BAAI/bge-m3';
const RERANK_MODEL = process.env.RERANK_MODEL || 'BAAI/bge-reranker-v2-m3';
const RERANK_ENABLED = process.env.RERANK_ENABLED !== 'false';
const RERANK_TIMEOUT_MS = toPositiveInteger(process.env.RERANK_TIMEOUT_MS, 8000);
const HYBRID_CANDIDATE_K = toPositiveInteger(process.env.RAG_CANDIDATE_K, 20);
const RRF_K = 60;

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function loadStore() {
  if (!fs.existsSync(STORE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
  } catch {
    throw new Error('知识库索引损坏，请恢复或重建 knowledge-store.json');
  }
}

function saveStore(chunks) {
  const tempPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(chunks, null, 2));
  fs.renameSync(tempPath, STORE_PATH);
}

function summarizeDocuments(store, userId) {
  const documents = new Map();
  for (const item of store) {
    if (item.userId !== userId) continue;
    const current = documents.get(item.source) || {
      name: item.source,
      category: item.category || 'other',
      chunks: 0,
      indexedAt: item.indexedAt || null
    };
    current.chunks += 1;
    if (item.indexedAt && (!current.indexedAt || item.indexedAt > current.indexedAt)) {
      current.indexedAt = item.indexedAt;
    }
    documents.set(item.source, current);
  }
  return [...documents.values()].sort((a, b) => (b.indexedAt || '').localeCompare(a.indexedAt || ''));
}

function listDocuments(userId) {
  if (!userId) return [];
  return summarizeDocuments(loadStore(), userId);
}

function deleteDocument(userId, source) {
  if (!userId || !source) throw new Error('缺少用户身份或文档名称');
  const store = loadStore();
  const nextStore = store.filter(item => !(item.userId === userId && item.source === source));
  const removedChunks = store.length - nextStore.length;
  if (removedChunks > 0) saveStore(nextStore);
  return removedChunks;
}

function chunkText(text, chunkSize = 500, overlap = 50) {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new RangeError('chunkSize 必须是正整数');
  }
  if (!Number.isInteger(overlap) || overlap < 0 || overlap >= chunkSize) {
    throw new RangeError('overlap 必须是小于 chunkSize 的非负整数');
  }

  const chunks = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + chunkSize));
    start += chunkSize - overlap;
  }
  return chunks;
}

function getEmbedding(input) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: EMBED_MODEL, input, encoding_format: 'float' });
    const options = {
      hostname: 'api.siliconflow.cn',
      path: '/v1/embeddings',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SF_API_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message || JSON.stringify(json.error)));
          resolve(json.data[0].embedding);
        } catch { reject(new Error('Embedding 解析失败: ' + data)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function tokenizeText(text) {
  const normalized = String(text || '').normalize('NFKC').toLowerCase();
  const tokens = normalized.match(/[a-z0-9]+(?:[._+#-][a-z0-9]+)*|[\p{Script=Han}]+/gu) || [];
  const output = [];

  for (const token of tokens) {
    if (!/^[\p{Script=Han}]+$/u.test(token)) {
      output.push(token);
      continue;
    }

    if (token.length === 1) {
      output.push(token);
      continue;
    }

    // 中文没有天然空格，使用字级 unigram + bigram 兼顾召回率与短语区分度。
    for (const char of token) output.push(char);
    for (let index = 0; index < token.length - 1; index++) {
      output.push(token.slice(index, index + 2));
    }
  }

  return output;
}

function calculateBm25Scores(query, documents, options = {}) {
  if (!Array.isArray(documents) || documents.length === 0) return [];

  const k1 = Number.isFinite(options.k1) ? options.k1 : 1.5;
  const b = Number.isFinite(options.b) ? options.b : 0.75;
  const queryTerms = [...new Set(tokenizeText(query))];
  const documentTokens = documents.map(document => tokenizeText(document));
  const averageLength = documentTokens.reduce((sum, tokens) => sum + tokens.length, 0) / documents.length || 1;
  const documentFrequency = new Map();

  for (const tokens of documentTokens) {
    for (const term of new Set(tokens)) {
      if (queryTerms.includes(term)) {
        documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
      }
    }
  }

  return documentTokens.map(tokens => {
    if (tokens.length === 0 || queryTerms.length === 0) return 0;
    const termFrequency = new Map();
    for (const token of tokens) termFrequency.set(token, (termFrequency.get(token) || 0) + 1);

    let score = 0;
    for (const term of queryTerms) {
      const frequency = termFrequency.get(term) || 0;
      if (frequency === 0) continue;
      const frequencyInDocuments = documentFrequency.get(term) || 0;
      const inverseDocumentFrequency = Math.log(
        1 + (documents.length - frequencyInDocuments + 0.5) / (frequencyInDocuments + 0.5)
      );
      const lengthNormalization = frequency + k1 * (1 - b + b * tokens.length / averageLength);
      score += inverseDocumentFrequency * frequency * (k1 + 1) / lengthNormalization;
    }
    return score;
  });
}

function reciprocalRankFusion(rankings, itemCount, rrfK = RRF_K) {
  const scores = Array.from({ length: itemCount }, () => 0);
  for (const ranking of rankings) {
    ranking.forEach((itemIndex, rank) => {
      scores[itemIndex] += 1 / (rrfK + rank + 1);
    });
  }
  return scores;
}

function rerankDocuments(query, candidates, topK) {
  if (!RERANK_ENABLED || !SF_API_KEY || candidates.length === 0) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: RERANK_MODEL,
      query,
      documents: candidates.map(candidate => candidate.text),
      top_n: Math.min(topK, candidates.length),
      return_documents: false
    });
    const options = {
      hostname: 'api.siliconflow.cn',
      path: '/v1/rerank',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SF_API_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode < 200 || res.statusCode >= 300 || json.error) {
            return reject(new Error(json.error?.message || `Rerank 请求失败: HTTP ${res.statusCode}`));
          }
          if (!Array.isArray(json.results)) return reject(new Error('Rerank 返回结果格式错误'));
          resolve(json.results);
        } catch {
          reject(new Error('Rerank 解析失败: ' + data));
        }
      });
    });
    req.setTimeout(RERANK_TIMEOUT_MS, () => req.destroy(new Error('Rerank 请求超时')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) {
    throw new TypeError('向量必须是长度相同的非空数组');
  }

  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}

async function ingestText(text, fileName, userId, options = {}) {
  if (!userId) throw new Error('缺少用户身份，拒绝写入知识库');
  const chunks = chunkText(text);
  const store = loadStore().filter(c => !(c.userId === userId && c.source === fileName));
  const indexedAt = new Date().toISOString();
  const category = String(options.category || 'other').trim().slice(0, 30) || 'other';

  for (let i = 0; i < chunks.length; i++) {
    const vector = await getEmbedding(chunks[i]);
    store.push({ userId, source: fileName, category, chunk: i, text: chunks[i], vector, indexedAt });
  }
  saveStore(store);
  return chunks.length;
}

async function ingestFile(filePath, fileName, userId, options = {}) {
  const text = await extractDocumentText(filePath, fileName);
  return ingestText(text, fileName, userId, options);
}

async function retrieve(query, topK = 3, userId) {
  if (!userId) return [];
  const store = loadStore().filter(item => item.userId === userId);
  if (!store.length) return [];
  const queryVector = await getEmbedding(query);
  const limit = Math.max(1, toPositiveInteger(topK, 3));
  const vectorScores = store.map(item => cosineSimilarity(queryVector, item.vector));
  const keywordScores = calculateBm25Scores(query, store.map(item => item.text));
  const vectorRanking = vectorScores
    .map((score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score)
    .map(result => result.index);
  const keywordRanking = keywordScores
    .map((score, index) => ({ score, index }))
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(result => result.index);
  const activeRankings = [vectorRanking, keywordRanking].filter(ranking => ranking.length > 0);
  const hybridScores = reciprocalRankFusion(activeRankings, store.length);
  const maxHybridScore = activeRankings.length / (RRF_K + 1);
  const candidateLimit = Math.min(store.length, Math.max(HYBRID_CANDIDATE_K, limit * 4));
  const candidates = store
    .map((item, index) => ({
      source: item.source,
      category: item.category || 'other',
      chunk: item.chunk,
      text: item.text,
      vectorScore: vectorScores[index],
      keywordScore: keywordScores[index],
      hybridScore: hybridScores[index] / maxHybridScore
    }))
    .filter(result => result.vectorScore > 0.3 || result.keywordScore > 0)
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, candidateLimit);

  let reranked = null;
  try {
    reranked = await rerankDocuments(query, candidates, limit);
  } catch (error) {
    console.warn(`[RAG] Rerank 降级为 Hybrid Search: ${error.message}`);
  }

  const rerankedCandidates = reranked
    ? reranked
      .map(result => {
        const candidate = candidates[result.index];
        if (!candidate || !Number.isFinite(result.relevance_score)) return null;
        return { ...candidate, rerankScore: result.relevance_score };
      })
      .filter(Boolean)
      .slice(0, limit)
    : [];
  const selected = rerankedCandidates.length > 0 ? rerankedCandidates : candidates.slice(0, limit);

  return selected.map(result => ({
    source: result.source,
    category: result.category,
    chunk: result.chunk,
    text: result.text,
    score: Math.round((result.rerankScore ?? result.hybridScore) * 1000) / 1000
  }));
}

module.exports = {
  ingestFile,
  ingestText,
  retrieve,
  listDocuments,
  deleteDocument,
  summarizeDocuments,
  chunkText,
  cosineSimilarity,
  tokenizeText,
  calculateBm25Scores,
  reciprocalRankFusion
};
