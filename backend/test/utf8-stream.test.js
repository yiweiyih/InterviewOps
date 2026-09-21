const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { asUtf8 } = require('../utf8-stream');

test('UTF-8 stream decoding preserves Chinese characters split between byte chunks', async () => {
  const source = '规则冲突时，如何判断方案有效？🙂';
  const bytes = Buffer.from(source, 'utf8');
  const stream = asUtf8(new PassThrough());
  let result = '';
  const completed = new Promise((resolve, reject) => {
    stream.on('data', chunk => { result += chunk; });
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  for (const byte of bytes) stream.write(Buffer.from([byte]));
  stream.end();
  await completed;
  assert.equal(result, source);
  assert.equal(result.includes('\uFFFD'), false);
});
