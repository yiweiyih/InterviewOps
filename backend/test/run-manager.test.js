const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { createRunManager } = require('../run-manager');

const nextTurn = () => new Promise(resolve => setImmediate(resolve));

class FakeResponse extends EventEmitter {
  constructor() {
    super();
    this.headers = {};
    this.chunks = [];
    this.writableEnded = false;
    this.destroyed = false;
  }
  setHeader(name, value) { this.headers[name] = value; }
  flushHeaders() {}
  write(chunk) { this.chunks.push(String(chunk)); }
  end() { this.writableEnded = true; }
}

test('same user request id creates only one agent run', async t => {
  const manager = createRunManager();
  t.after(() => manager.stop());
  let executions = 0;
  const execute = sink => {
    executions++;
    sink.write('data: {"content":"hello"}\n\n');
    sink.end();
  };

  const first = manager.createRun({ userId: 'user-a', requestId: 'request-1', execute });
  const second = manager.createRun({ userId: 'user-a', requestId: 'request-1', execute });
  await nextTurn();

  assert.equal(first.runId, second.runId);
  assert.equal(second.reused, true);
  assert.equal(executions, 1);
  assert.equal(manager.getRun(first.runId, 'user-a').status, 'completed');
});

test('subscriber replays only events after Last-Event-ID', async t => {
  const manager = createRunManager();
  t.after(() => manager.stop());
  const created = manager.createRun({
    userId: 'user-a',
    requestId: 'request-2',
    execute(sink) {
      sink.write('data: {"content":"first"}\n\n');
      sink.write('data: {"content":"second"}\n\n');
      sink.end();
    }
  });
  await nextTurn();

  const response = new FakeResponse();
  assert.equal(manager.subscribe({
    runId: created.runId,
    userId: 'user-a',
    lastEventId: 1,
    res: response
  }), true);

  const replay = response.chunks.join('');
  assert.doesNotMatch(replay, /first/);
  assert.match(replay, /id: 2\nevent: message_delta/);
  assert.match(replay, /id: 3\nevent: done/);
  assert.equal(response.writableEnded, true);
});

test('runs are user scoped and cancellation is terminal', async t => {
  const manager = createRunManager();
  t.after(() => manager.stop());
  const created = manager.createRun({
    userId: 'user-a',
    requestId: 'request-3',
    execute(_sink, signal) {
      return new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    }
  });
  await nextTurn();

  assert.equal(manager.getRun(created.runId, 'user-b'), null);
  assert.equal(manager.subscribe({
    runId: created.runId,
    userId: 'user-b',
    res: new FakeResponse()
  }), false);

  const cancelled = manager.cancelRun(created.runId, 'user-a');
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(manager.getRun(created.runId, 'user-a').events.at(-1).type, 'done');
});
