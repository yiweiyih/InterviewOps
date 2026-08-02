const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isSupportedDocument,
  normalizeExtractedText
} = require('../documents/extract-text');

test('document support covers interview materials but rejects executable files', () => {
  assert.equal(isSupportedDocument('resume.docx'), true);
  assert.equal(isSupportedDocument('job-description.PDF'), true);
  assert.equal(isSupportedDocument('notes.md'), true);
  assert.equal(isSupportedDocument('payload.js'), false);
});

test('normalizeExtractedText removes null bytes and rejects blank files', () => {
  assert.equal(normalizeExtractedText('  项目\u0000经历\r\n\r\n\r\n\r\n指标  '), '项目经历\n\n\n指标');
  assert.throws(() => normalizeExtractedText(' \n '), /没有从文件中提取/);
});
