const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });
const STORE_PATH = path.join(DATA_DIR, 'memory-store.json');
const SF_API_KEY = process.env.SILICONFLOW_API_KEY;
const EMBED_MODEL = 'BAAI/bge-m3';

function loadStore() {
  if (!fs.existsSync(STORE_PATH)) return [];
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
}

function saveStore(memories) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(memories, null, 2));
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
          if (json.error) return reject(new Error(json.error.message));
          resolve(json.data[0].embedding);
        } catch { reject(new Error('Embedding解析失败: ' + data)); }
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

// 写入一条记忆，同key的旧记忆会被覆盖
async function saveMemory(key, value, userId) {
  if (!userId) throw new Error('缺少用户身份，拒绝写入长期记忆');
  const store = loadStore().filter(m => !(m.key === key && m.userId === userId));
  const text = `${key}：${value}`;
  const vector = await getEmbedding(text);
  store.push({ key, value, text, vector, userId, updatedAt: new Date().toISOString() });
  saveStore(store);
}

// 按相关性检索记忆，返回Top-K
async function retrieveMemory(query, topK = 5, userId) {
  if (!userId) return [];
  const store = loadStore().filter(m => m.userId === userId);
  if (!store.length) return [];
  const queryVector = await getEmbedding(query);
  return store
    .map(m => ({ key: m.key, value: m.value, text: m.text, score: cosineSimilarity(queryVector, m.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter(m => m.score > 0.3);
}

// 对话结束后自动提取用户事实，调用方传入 callLLM 函数避免循环依赖
async function extractAndSaveMemories(userMsg, assistantReply, callLLM, userId) {
  try {
    const response = await callLLM([
      {
        role: 'system',
        content: `从对话中提取用户的个人事实和偏好，只提取明确表达的信息。
输出JSON格式，没有值得记忆的信息则输出{"facts":[]}。
格式：{"facts":[{"key":"用户城市","value":"上海","confidence":0.9}]}
常见key类型：用户城市、用户职业、用户偏好、用户姓名、用户习惯等。`
      },
      {
        role: 'user',
        content: `用户说：${userMsg}\n助手回复：${assistantReply}`
      }
    ]);

    const content = response.choices?.[0]?.message?.content;
    const json = typeof content === 'string' ? JSON.parse(content) : content;
    const facts = json?.facts || [];

    for (const fact of facts) {
      if (fact.confidence >= 0.7) {
        await saveMemory(fact.key, fact.value, userId);
        console.log('[Memory] 保存用户记忆成功');
      }
    }
  } catch (e) {
    console.warn('[Memory] 提取记忆失败:', e.message);
  }
}

module.exports = { saveMemory, retrieveMemory, extractAndSaveMemories };
