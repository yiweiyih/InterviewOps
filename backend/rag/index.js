const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });
const STORE_PATH = path.join(DATA_DIR, 'knowledge-store.json');
const SF_API_KEY = process.env.SILICONFLOW_API_KEY;
const EMBED_MODEL = 'BAAI/bge-m3';

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

async function ingestFile(filePath, fileName, userId) {
  if (!userId) throw new Error('缺少用户身份，拒绝写入知识库');

  const raw = fs.readFileSync(filePath);
  const text = raw.toString('utf-8');
  const chunks = chunkText(text);
  const store = loadStore().filter(c => !(c.userId === userId && c.source === fileName));
  const indexedAt = new Date().toISOString();

  for (let i = 0; i < chunks.length; i++) {
    const vector = await getEmbedding(chunks[i]);
    store.push({ userId, source: fileName, chunk: i, text: chunks[i], vector, indexedAt });
  }
  saveStore(store);
  return chunks.length;
}

async function retrieve(query, topK = 3, userId) {
  if (!userId) return [];
  const store = loadStore().filter(item => item.userId === userId);
  if (!store.length) return [];
  const queryVector = await getEmbedding(query);

  return store
    .map(item => ({
      source: item.source,
      chunk: item.chunk,
      text: item.text,
      score: Math.round(cosineSimilarity(queryVector, item.vector) * 1000) / 1000
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter(r => r.score > 0.3);
}

module.exports = {
  ingestFile,
  retrieve,
  listDocuments,
  deleteDocument,
  summarizeDocuments,
  chunkText,
  cosineSimilarity
};
