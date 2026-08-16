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
    assert.equal(store.getWorkspace('user-b').profile.targetRole, '');
    assert.equal(store.getWorkspace('user-b').target.jobTitle, '');
    assert.deepEqual(store.getWorkspace('user-b').profile.focusAreas, []);
    assert.notEqual(store.fileFor('user-a'), store.fileFor('user-b'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('interview store removes untouched legacy frontend defaults', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interview-store-'));
  try {
    const store = new InterviewStore(tempDir);
    store.write('legacy-user', {
      workspace: {
        profile: {
          targetRole: '前端开发工程师',
          seniority: '校招 / 初级',
          focusAreas: ['项目深挖', '前端基础', 'Agent / RAG'],
          introduction: ''
        },
        target: {
          company: '',
          jobTitle: '前端开发工程师',
          jobDescription: '',
          interviewDate: ''
        }
      },
      sessions: []
    });

    const workspace = store.getWorkspace('legacy-user');
    assert.equal(workspace.profile.targetRole, '');
    assert.equal(workspace.target.jobTitle, '');
    assert.deepEqual(workspace.profile.focusAreas, []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
