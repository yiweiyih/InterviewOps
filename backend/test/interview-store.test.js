const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { InterviewStore } = require('../interview/store');

test('interview store isolates users and persists normalized workspaces', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interview-store-'));
  try {
    const store = new InterviewStore(tempDir);
    store.updateWorkspace('user-a', {
      profile: { targetRole: ' AI 应用工程师 ', focusAreas: ['RAG', 'Agent'] },
      target: { company: '示例公司' }
    });

    assert.equal(store.getWorkspace('user-a').profile.targetRole, 'AI 应用工程师');
    assert.equal(store.getWorkspace('user-a').target.company, '示例公司');
    assert.equal(store.getWorkspace('user-b').target.company, '');
    assert.notEqual(store.fileFor('user-a'), store.fileFor('user-b'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
