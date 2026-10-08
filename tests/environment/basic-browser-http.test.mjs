import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoHttpServer} from '../../examples/tasks/http-test-server.mjs';

test('real loopback HTTP server serves static JSON, HTML and true 404/non-JSON', async (t) => {
  const server = createDemoHttpServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const jsonResponse = await fetch(base + '/request-sample.json');
  assert.equal(jsonResponse.status, 200);
  assert.match(jsonResponse.headers.get('content-type'), /application\/json/);
  assert.equal((await jsonResponse.json()).source, 'opendesk-browser-local-fixture');

  const htmlResponse = await fetch(base + '/demo-form.html');
  assert.equal(htmlResponse.status, 200);
  assert.match(htmlResponse.headers.get('content-type'), /text\/html/);
  assert.match(await htmlResponse.text(), /id="api-send"/);

  const textResponse = await fetch(base + '/__test__/text');
  assert.equal(textResponse.status, 200);
  assert.match(textResponse.headers.get('content-type'), /text\/plain/);
  assert.match(await textResponse.text(), /真实纯文本响应/);

  const missing = await fetch(base + '/__opendesk_expected_404__.json');
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).status, 404);
  assert.equal(missing.headers.get('access-control-allow-origin'), null);
});

test('real loopback HTTP server emits status/POST body and delayed responses', async (t) => {
  const server = createDemoHttpServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;

  const limited = await fetch(base + '/__test__/status?code=429');
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).status, 429);

  const posted = await fetch(base + '/__test__/echo', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({hello:'OpenDesk'})
  });
  assert.equal(posted.status, 200);
  assert.deepEqual((await posted.json()).received, {hello:'OpenDesk'});

  const invalid = await fetch(base + '/__test__/echo', {method:'POST',body:'not json'});
  assert.equal(invalid.status, 400);

  const slow = await fetch(base + '/__test__/delay?ms=120');
  assert.equal(slow.status, 200);
  assert.equal((await slow.json()).delayedMs, 120);

  const controller = new AbortController();
  const pending = fetch(base + '/__test__/delay?ms=500', {signal: controller.signal});
  const timer = setTimeout(() => controller.abort(), 40);
  try {
    await assert.rejects(pending, {name:'AbortError'});
  } finally {
    clearTimeout(timer);
  }
});
