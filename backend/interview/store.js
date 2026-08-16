const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_WORKSPACE = Object.freeze({
  profile: {
    targetRole: '',
    seniority: '校招 / 初级',
    focusAreas: [],
    introduction: ''
  },
  target: {
    company: '',
    jobTitle: '',
    jobDescription: '',
    interviewDate: ''
  }
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeWorkspace(input = {}, previous = DEFAULT_WORKSPACE) {
  const inputProfile = input.profile || {};
  const inputTarget = input.target || {};
  const isImplicitLegacyDefault = !input.updatedAt
    && inputProfile.targetRole === '前端开发工程师'
    && inputTarget.jobTitle === '前端开发工程师'
    && JSON.stringify(inputProfile.focusAreas) === JSON.stringify(['项目深挖', '前端基础', 'Agent / RAG']);
  const profile = isImplicitLegacyDefault
    ? { ...inputProfile, targetRole: '', focusAreas: [] }
    : inputProfile;
  const target = isImplicitLegacyDefault
    ? { ...inputTarget, jobTitle: '' }
    : inputTarget;
  const previousProfile = previous.profile || DEFAULT_WORKSPACE.profile;
  const previousTarget = previous.target || DEFAULT_WORKSPACE.target;
  const focusAreas = Array.isArray(profile.focusAreas)
    ? profile.focusAreas.map(item => cleanText(item, 30)).filter(Boolean).slice(0, 8)
    : previousProfile.focusAreas;

  return {
    profile: {
      targetRole: cleanText(profile.targetRole ?? previousProfile.targetRole, 80),
      seniority: cleanText(profile.seniority ?? previousProfile.seniority, 40),
      focusAreas,
      introduction: cleanText(profile.introduction ?? previousProfile.introduction, 2000)
    },
    target: {
      company: cleanText(target.company ?? previousTarget.company, 80),
      jobTitle: cleanText(target.jobTitle ?? previousTarget.jobTitle, 80),
      jobDescription: cleanText(target.jobDescription ?? previousTarget.jobDescription, 10_000),
      interviewDate: cleanText(target.interviewDate ?? previousTarget.interviewDate, 20)
    }
  };
}

class InterviewStore {
  constructor(dataDir) {
    this.directory = path.join(dataDir, 'interview-data');
    fs.mkdirSync(this.directory, { recursive: true });
  }

  fileFor(userId) {
    if (!userId) throw new Error('缺少用户身份');
    const safeId = crypto.createHash('sha256').update(String(userId)).digest('hex').slice(0, 24);
    return path.join(this.directory, `${safeId}.json`);
  }

  read(userId) {
    const filePath = this.fileFor(userId);
    if (!fs.existsSync(filePath)) {
      return { workspace: clone(DEFAULT_WORKSPACE), sessions: [] };
    }
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return {
        workspace: normalizeWorkspace(data.workspace),
        sessions: Array.isArray(data.sessions) ? data.sessions : []
      };
    } catch {
      throw new Error('面试工作区数据损坏，请恢复对应数据文件');
    }
  }

  write(userId, data) {
    const filePath = this.fileFor(userId);
    const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
    fs.renameSync(tempPath, filePath);
  }

  getWorkspace(userId) {
    return this.read(userId).workspace;
  }

  updateWorkspace(userId, patch) {
    const data = this.read(userId);
    data.workspace = {
      ...normalizeWorkspace(patch, data.workspace),
      updatedAt: new Date().toISOString()
    };
    this.write(userId, data);
    return data.workspace;
  }

  listSessions(userId) {
    return this.read(userId).sessions
      .slice()
      .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
  }

  getSession(userId, sessionId) {
    return this.read(userId).sessions.find(item => item.id === sessionId) || null;
  }

  saveSession(userId, session) {
    const data = this.read(userId);
    const index = data.sessions.findIndex(item => item.id === session.id);
    if (index >= 0) data.sessions[index] = session;
    else data.sessions.push(session);
    data.sessions = data.sessions.slice(-100);
    this.write(userId, data);
    return session;
  }
}

module.exports = {
  DEFAULT_WORKSPACE,
  InterviewStore,
  normalizeWorkspace
};
