const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const https = require('https');
const { EventEmitter } = require('events');

test('disconnecting an MCP client aborts the upstream search', async t => {
  const previousKey = process.env.SERPER_API_KEY;
  process.env.SERPER_API_KEY = 'test-key';
  const { app } = require('../mcp-server');
  const server = app.listen(0);
  const originalRequest = https.request;
  t.after(async () => {
    https.request = originalRequest;
    if (previousKey === undefined) delete process.env.SERPER_API_KEY;
    else process.env.SERPER_API_KEY = previousKey;
    await new Promise(resolve => server.close(resolve));
  });

  let started;
  const upstreamStarted = new Promise(resolve => { started = resolve; });
  let aborted;
  const upstreamAborted = new Promise(resolve => { aborted = resolve; });
  https.request = options => {
    const request = new EventEmitter();
    request.write = () => {};
    request.end = () => started();
    request.setTimeout = () => {};
    request.destroy = () => {
      aborted();
      request.emit('error', new Error('aborted'));
    };
    options.signal.addEventListener('abort', () => request.destroy(), { once: true });
    return request;
  };

  const body = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'search_web', arguments: { query: 'interview' } }
  });
  const client = http.request({
    port: server.address().port,
    method: 'POST',
    path: '/mcp',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  });
  client.on('error', () => {});
  client.end(body);
  await upstreamStarted;
  client.destroy();
  await Promise.race([
    upstreamAborted,
    new Promise((_, reject) => setTimeout(() => reject(new Error('MCP did not abort upstream')), 1000))
  ]);
});
