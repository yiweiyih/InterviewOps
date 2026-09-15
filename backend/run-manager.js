const crypto = require('crypto');
const { EventEmitter } = require('events');

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

function formatSseEvent(item) {
  const data = String(item.data).split('\n').map(line => 'data: ' + line).join('\n');
  return 'id: ' + item.seq + '\nevent: ' + item.type + '\n' + data + '\n\n';
}

function parseFrame(frame) {
  let type = 'message_delta';
  const data = [];
  for (const raw of frame.split(/\r?\n/)) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (!line || line.startsWith(':')) continue;
    const index = line.indexOf(':');
    const field = index < 0 ? line : line.slice(0, index);
    let value = index < 0 ? '' : line.slice(index + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') type = value || type;
    if (field === 'data') data.push(value);
  }
  return { type: type === 'message' ? 'message_delta' : type, data: data.join('\n') };
}

class RunSink extends EventEmitter {
  constructor(manager, run) {
    super();
    this.manager = manager;
    this.run = run;
    this.buffer = '';
    this.ended = false;
    this._destroyed = false;
  }
  setHeader() {}
  get writableEnded() { return this.ended; }
  get destroyed() { return this._destroyed; }
  write(chunk) {
    if (this.ended || this._destroyed) return false;
    this.buffer += typeof chunk === 'string' ? chunk : chunk.toString();
    let boundary = this.buffer.match(/\r?\n\r?\n/);
    while (boundary) {
      const frame = this.buffer.slice(0, boundary.index);
      this.buffer = this.buffer.slice(boundary.index + boundary[0].length);
      if (frame.trim()) this.manager.captureFrame(this.run, frame);
      boundary = this.buffer.match(/\r?\n\r?\n/);
    }
    return true;
  }
  end(chunk) {
    if (chunk) this.write(chunk);
    if (this.ended) return;
    if (this.buffer.trim()) this.manager.captureFrame(this.run, this.buffer);
    this.buffer = '';
    this.ended = true;
    if (!TERMINAL.has(this.run.status)) this.manager.finishRun(this.run, 'completed');
  }
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.emit('close');
  }
}

function createRunManager(options = {}) {
  const ttlMs = options.ttlMs || 30 * 60 * 1000;
  const heartbeatMs = options.heartbeatMs || 15 * 1000;
  const maxEvents = options.maxEvents || 10000;
  const runs = new Map();
  const requests = new Map();
  const keyFor = (userId, requestId) => userId + ':' + requestId;
  const publicRun = (run, reused = false) => ({
    runId: run.id, status: run.status, lastSeq: run.lastSeq, reused
  });

  function appendEvent(run, type, data) {
    const item = {
      seq: ++run.lastSeq,
      type,
      data: typeof data === 'string' ? data : JSON.stringify(data)
    };
    run.events.push(item);
    if (run.events.length > maxEvents) run.events.shift();
    run.updatedAt = Date.now();
    const payload = formatSseEvent(item);
    for (const subscriber of [...run.subscribers]) {
      try { subscriber.res.write(payload); } catch { subscriber.close(); }
    }
    return item;
  }

  function finishRun(run, status, error) {
    if (TERMINAL.has(run.status)) return;
    run.status = status;
    run.finishedAt = Date.now();
    if (status === 'failed') {
      appendEvent(run, 'error', { error: error?.message || String(error || '任务执行失败') });
    } else {
      appendEvent(run, 'done', { status });
    }
    for (const subscriber of [...run.subscribers]) subscriber.close(true);
  }

  function captureFrame(run, frame) {
    if (TERMINAL.has(run.status)) return;
    const parsed = parseFrame(frame);
    if (!parsed.data) return;
    if (parsed.data === '[DONE]') return finishRun(run, 'completed');
    try {
      const json = JSON.parse(parsed.data);
      if (json?.error) return finishRun(run, 'failed', new Error(json.error));
    } catch {}
    appendEvent(run, parsed.type, parsed.data);
  }

  const sinkApi = { captureFrame, finishRun };

  function createRun({ userId, requestId, execute }) {
    if (!userId) throw new Error('缺少用户身份');
    if (!requestId || requestId.length > 128) throw new Error('缺少或无效的 requestId');
    const requestKey = keyFor(userId, requestId);
    const existingId = requests.get(requestKey);
    if (existingId && runs.has(existingId)) return publicRun(runs.get(existingId), true);

    const run = {
      id: 'run_' + crypto.randomUUID(),
      userId,
      requestId,
      status: 'running',
      lastSeq: 0,
      events: [],
      subscribers: new Set(),
      abortController: new AbortController(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      finishedAt: null
    };
    run.sink = new RunSink(sinkApi, run);
    runs.set(run.id, run);
    requests.set(requestKey, run.id);

    queueMicrotask(async () => {
      try {
        await execute(run.sink, run.abortController.signal);
      } catch (error) {
        finishRun(run, error?.name === 'AbortError' ? 'cancelled' : 'failed', error);
      }
    });
    return publicRun(run);
  }

  function getRun(runId, userId) {
    const run = runs.get(runId);
    return run && run.userId === userId ? run : null;
  }

  function subscribe({ runId, userId, lastEventId = 0, res }) {
    const run = getRun(runId, userId);
    if (!run) return false;

    const parsedSeq = Number(lastEventId);
    const afterSeq = Number.isFinite(parsedSeq) ? Math.max(0, parsedSeq) : 0;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    for (const event of run.events) {
      if (event.seq > afterSeq) res.write(formatSseEvent(event));
    }
    if (TERMINAL.has(run.status)) {
      res.end();
      return true;
    }

    const subscriber = {
      res,
      timer: null,
      closed: false,
      close(endResponse = false) {
        if (this.closed) return;
        this.closed = true;
        clearInterval(this.timer);
        run.subscribers.delete(this);
        if (endResponse && !res.writableEnded) res.end();
      }
    };
    subscriber.timer = setInterval(() => {
      if (res.writableEnded || res.destroyed) subscriber.close();
      else res.write(': ping\n\n');
    }, heartbeatMs);
    subscriber.timer.unref?.();
    run.subscribers.add(subscriber);
    res.once('close', () => subscriber.close());
    return true;
  }

  function cancelRun(runId, userId) {
    const run = getRun(runId, userId);
    if (!run) return null;
    if (!TERMINAL.has(run.status)) {
      run.abortController.abort();
      run.sink.destroy();
      finishRun(run, 'cancelled');
    }
    return publicRun(run);
  }

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [runId, run] of runs) {
      if (!run.finishedAt || now - run.finishedAt < ttlMs) continue;
      runs.delete(runId);
      requests.delete(keyFor(run.userId, run.requestId));
    }
  }, Math.min(ttlMs, 60 * 1000));
  cleanupTimer.unref?.();

  return {
    createRun,
    getRun,
    subscribe,
    cancelRun,
    appendEvent,
    finishRun,
    stop() {
      clearInterval(cleanupTimer);
      for (const run of runs.values()) {
        for (const subscriber of [...run.subscribers]) subscriber.close(true);
      }
    }
  };
}

module.exports = { createRunManager, formatSseEvent };
