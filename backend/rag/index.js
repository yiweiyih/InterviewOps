const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const STORE_PATH = path.join(__dirname, 'knowledge-store.json');
const SF_API_KEY = process.env.SILICONFLOW_API_KEY;
const EMBED_MODEL = 'BAAI/bge-m3';

function loadStore() {
  if (!fs.existsSync(STORE_PATH)) return [];
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
}

function saveStore(chunks) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(chunks, null, 2));
}

function chunkText(text, chunkSize = 500, overlap = 50) {
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
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function ingestFile(filePath, fileName) {
  const raw = fs.readFileSync(filePath);
  const text = raw.toString('utf-8');
  const chunks = chunkText(text);
  const store = loadStore().filter(c => c.source !== fileName);

  for (let i = 0; i < chunks.length; i++) {
    const vector = await getEmbedding(chunks[i]);
    store.push({ source: fileName, chunk: i, text: chunks[i], vector });
  }
  saveStore(store);
  return chunks.length;
}

async function retrieve(query, topK = 3) {
  const store = loadStore();
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

module.exports = { ingestFile, retrieve };
