const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');

const SUPPORTED_EXTENSIONS = new Set([
  '.docx',
  '.pdf',
  '.md',
  '.markdown',
  '.txt',
  '.json'
]);
const MAX_TEXT_LENGTH = 300_000;

function isSupportedDocument(fileName) {
  return SUPPORTED_EXTENSIONS.has(path.extname(fileName || '').toLowerCase());
}

function normalizeExtractedText(value) {
  const text = String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

  if (!text) throw new Error('没有从文件中提取到可索引的文字');
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`文档文字超过 ${MAX_TEXT_LENGTH.toLocaleString()} 字符，请拆分后上传`);
  }
  return text;
}

async function extractPdfText(filePath) {
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractDocumentText(filePath, fileName) {
  const extension = path.extname(fileName || filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error('仅支持 DOCX、PDF、Markdown、TXT、JSON 文件');
  }

  let text;
  if (extension === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    text = result.value;
  } else if (extension === '.pdf') {
    text = await extractPdfText(filePath);
  } else {
    text = fs.readFileSync(filePath, 'utf-8');
  }

  return normalizeExtractedText(text);
}

module.exports = {
  MAX_TEXT_LENGTH,
  SUPPORTED_EXTENSIONS,
  extractDocumentText,
  isSupportedDocument,
  normalizeExtractedText
};
