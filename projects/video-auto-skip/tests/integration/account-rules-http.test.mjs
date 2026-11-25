import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp, rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Readable} from 'node:stream';
import test from 'node:test';
import {createAccountRulesHandler, PRODUCT_ID, TIMING_RULES_PATH} from '../../server/account-rules.js';
import {projectAccountRuleChange} from '../../src/account-rule-change.js';

const context = {seriesKey: 'iyf:synthetic-work', episodeKey: 'synthetic-episode'};
const introA = {kind: 'fixed', start: 0, end: 45};
const introB = {kind: 'fixed', start: 0, end: 25};

async function openPilot(path, sessions, readOnly = false) {
  const db = new DatabaseSync(path, {readOnly});
  if (!readOnly) db.exec('CREATE TABLE IF NOT EXISTS rules (key TEXT PRIMARY KEY, revision INTEGER NOT NULL, rules TEXT NOT NULL)');
  const query = db.prepare('SELECT revision, rules FROM rules WHERE key = ?');
  const insert = readOnly ? null : db.prepare('INSERT INTO rules VALUES (?, ?, ?) ON CONFLICT DO NOTHING');
  const update = db.prepare('UPDATE rules SET revision = ?, rules = ? WHERE key = ? AND revision = ?');
  const handle = createAccountRulesHandler({
    verifySession(request, productId) {
      assert.equal(productId, PRODUCT_ID);
      return sessions.get(request.headers.get('authorization'));
    },
    store: {
      get(key) {
        const row = query.get(key);
        return row && {revision: row.revision, rules: JSON.parse(row.rules)};
      },
      compareAndSet(key, expected, {revision, rules}) {
        const data = JSON.stringify(rules);
        const result = expected === 0 ? insert.run(key, revision, data) : update.run(revision, data, key, expected);
        return result.changes === 1;
      },
    },
  });
  const server = createServer(async (req, res) => {
    const {method, headers, url} = req;
    const request = new Request('http://127.0.0.1' + url, {method, headers,
      ...(method === 'PATCH' ? {body: Readable.toWeb(req), duplex: 'half'} : {})});
    const response = await handle(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    async stop() {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      db.close();
    },
    async request(token, body, route = TIMING_RULES_PATH) {
      const headers = token ? {Authorization: token} : {};
      const response = await fetch('http://127.0.0.1:' + server.address().port + route, body ? {
        method: 'PATCH', headers: {...headers, 'Content-Type': 'application/json'}, body: JSON.stringify(body),
      } : {headers});
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return {status: response.status, body: await response.json()};
    },
  };
}

const changeFrom = (intro, before = {}) => projectAccountRuleChange({context, scope: 'episode', before, after: {intro}});
const write = (revision, intro, before) => ({revision, change: changeFrom(intro, before)});
const rulesFor = intro => ({series: {[context.seriesKey]: {defaults: {}, episodes: {[context.episodeKey]: {intro}}}}});

test('loopback API authenticates writes and preserves only the current account across an independent disk read', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'graydove-account-rules-'));
  const database = join(directory, 'rules.sqlite');
  const accountA = {issuer: 'synthetic', subject: 'a'};
  const sessions = new Map([['Bearer test-a', accountA], ['Bearer test-b', {issuer: 'synthetic', subject: 'b'}]]);
  let pilot;
  async function reopen(readOnly = false) {
    await pilot?.stop();
    pilot = undefined;
    pilot = await openPilot(database, sessions, readOnly);
  }
  t.after(async () => {
    try { await pilot?.stop(); } finally { await rm(directory, {recursive: true, force: true}); }
  });
  await reopen();

  assert.equal((await pilot.request(null, write(0, introA))).status, 401);
  assert.equal((await pilot.request('Bearer invalid')).status, 401);
  assert.equal((await pilot.request('Bearer test-a', null, '/v1/products/another/timing-rules')).status, 404);
  assert.deepEqual(await pilot.request('Bearer test-a', write(0, introA)),
    {status: 200, body: {saved: true, revision: 1}});

  // Close the HTTP listener and database connection. Reopen the same file;
  // a fresh session for A must succeed even though the original is invalid.
  sessions.delete('Bearer test-a');
  sessions.set('Bearer test-a-new', accountA);
  await reopen();
  assert.equal((await pilot.request('Bearer test-a')).status, 401);
  assert.deepEqual(await pilot.request('Bearer test-a-new'), {status: 200, body: {revision: 1, rules: rulesFor(introA)}});
  assert.deepEqual(await pilot.request('Bearer test-b'), {status: 200, body: {revision: 0, rules: {series: {}}}});
  assert.equal((await pilot.request('Bearer test-b', {...write(0, introB), accountId: 'a'})).status, 400);
  assert.deepEqual(await pilot.request('Bearer test-b', write(0, introB)), {status: 200, body: {saved: true, revision: 1}});
  assert.deepEqual((await pilot.request('Bearer test-b')).body.rules, rulesFor(introB));
  assert.deepEqual((await pilot.request('Bearer test-a-new')).body.rules, rulesFor(introA));
  assert.equal((await pilot.request('Bearer test-a-new', write(0, introB, {intro: introA}))).status, 409);

  await reopen(true);
  assert.deepEqual(await pilot.request('Bearer test-a-new', write(1, introB, {intro: introA})),
    {status: 503, body: {code: 'UNAVAILABLE'}});
  assert.deepEqual(await pilot.request('Bearer test-a-new'), {status: 200, body: {revision: 1, rules: rulesFor(introA)}});
});
