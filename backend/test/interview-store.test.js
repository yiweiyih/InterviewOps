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

test('deleting a session removes its review data only for the authenticated user', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interview-store-'));
  try {
    const store = new InterviewStore(tempDir);
    store.saveSession('user-a', {
      id: 'shared-id', status: 'completed', turns: [{ answer: '原回答' }],
      skillReview: { summary: '复习计划' }, practiceAttempts: [{ answer: '重答' }]
    });
    store.saveSession('user-b', { id: 'shared-id', status: 'completed', turns: [{ answer: '其他用户的回答' }] });

    assert.equal(store.deleteSession('user-a', 'shared-id'), true);
    assert.equal(store.getSession('user-a', 'shared-id'), null);
    assert.equal(store.deleteSession('user-a', 'shared-id'), false);
    assert.equal(store.getSession('user-b', 'shared-id').turns[0].answer, '其他用户的回答');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
