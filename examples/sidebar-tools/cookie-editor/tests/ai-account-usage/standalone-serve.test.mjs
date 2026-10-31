import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {request} from 'node:http';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {HistoryStore} from '../../ai-account-usage/history-store.mjs';

const owner = fileURLToPath(new URL('../../ai-account-usage/', import.meta.url));
const guard = fileURLToPath(new URL('./fixtures/standalone-guard.mjs', import.meta.url));

// Same synthetic HistoryStore + numeric loopback/Host pattern as the owner's
// service-binding-http tests, now exercising the unmodified executable main.
test('ordinary CLI serve pairs and serves management settings without desktop, credentials or upstream', {timeout: 20000}, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'usage-standalone-'));
  let child;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await once(child, 'exit');
    }
    await rm(directory, {recursive: true, force: true});
  });
  const home = join(directory, 'home');
  await mkdir(home, {mode: 0o700});
  const history = join(directory, 'isolated-state');
  const store = new HistoryStore({directory: history});
  await store.register({alias: 'synthetic_01', displayName: 'Synthetic account'});
  const before = await readFile(join(history, 'history-v1.json'), 'utf8');
  const config = join(directory, 'accounts.json');
  await writeFile(config, JSON.stringify({accounts: [{alias: 'synthetic_01', displayName: 'Synthetic account',
    mode: 'CODEX_OAUTH', source: {type: 'CODEX_AUTH_FILE', path: join(home, '.codex', 'auth.json')}}]}), {mode: 0o600});
  const audit = join(directory, 'audit.txt');
  // Permission allowlists prevent any real user state access, subprocess/desktop
  // launch or worker launch. The Native resolver loader needs worker permission.
  const args = ['--permission', `--allow-fs-read=${owner}`, `--allow-fs-read=${directory}`,
    `--allow-fs-read=${guard}`, `--allow-fs-write=${directory}`, '--allow-worker', '--import', guard];
  const env = {HOME: home, TMPDIR: directory, USAGE_TEST_AUDIT: audit};
  // Prove the guards actually reject each prohibited action before relying on
  // an empty audit from the real CLI. No real credentials or network are used.
  const control = spawn(process.execPath, [...args, '--input-type=module', '-e', `
    for (const action of [
      () => import(${JSON.stringify(new URL('native-connection.mjs', `file://${owner}`).href)}),
      () => import('node:fs/promises').then(fs => fs.readFile(${JSON.stringify(join(home, '.codex', 'auth.json'))})),
      () => fetch('https://example.invalid/'),
      () => import('node:net').then(net => net.connect({path: '/nonexistent-standalone-test.sock'}))
    ]) { try { await action(); process.exitCode = 1; } catch {} }
  `], {cwd: directory, env, timeout: 5000, stdio: ['ignore', 'ignore', 'pipe']});
  let controlError = '';
  control.stderr.on('data', part => { controlError += part; });
  assert.deepEqual(await once(control, 'exit'), [0, null], controlError);
  assert.deepEqual((await readFile(audit, 'utf8')).trim().split('\n').sort(),
    ['guard-ready', 'native-import', 'credential-read', 'upstream-request', 'outbound-connect'].sort());
  await writeFile(audit, '');

  child = spawn(process.execPath, [...args, join(owner, 'manage.mjs'), 'serve', '--config', config, '--port', '0', '--data-dir', history],
    {cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe']});
  const exited = once(child, 'exit');
  let stdout = '', stderr = '';
  child.stderr.on('data', part => { stderr += part; });
  const link = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(`CLI startup timed out: ${stderr}`)), 8000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(Error(`CLI exited before pairing: ${stderr}`)); });
    child.stdout.on('data', part => {
      stdout += part;
      if (stdout.includes('\n')) { clearTimeout(timer); resolve(new URL(stdout.trim())); }
    });
  });
  assert.match(link.hostname, /^usage-[a-f0-9]+\.localhost$/);
  assert.equal(link.pathname, '/pair');
  const origin = link.origin;
  const req = (path, {method = 'GET', body, cookie} = {}) => new Promise((resolve, reject) => {
    const r = request({hostname: '127.0.0.1', port: link.port, path, method, agent: false,
      headers: {host: link.host, ...(cookie ? {cookie} : {}),
        ...(body ? {origin, 'content-type': 'application/json'} : {})}}, res => {
      const chunks = [];
      res.on('data', part => chunks.push(part));
      res.on('end', () => resolve({status: res.statusCode, headers: res.headers,
        text: Buffer.concat(chunks).toString('utf8')}));
    });
    r.setTimeout(3000, () => r.destroy(Error('HTTP_TIMEOUT')));
    r.once('error', reject);
    r.end(body ? JSON.stringify(body) : undefined);
  });
  assert.equal((await req('/pair')).status, 200);
  assert.equal((await req('/opendesk/admin/api/devices')).status, 401);
  const pairing = {method: 'POST', body: {code: new URLSearchParams(link.hash.slice(1)).get('pair')}};
  const session = await req('/session', pairing);
  assert.equal(session.status, 200);
  assert.match(session.headers['set-cookie'][0], /HttpOnly; SameSite=Strict/);
  assert.equal((await req('/session', pairing)).status, 401);
  const cookie = session.headers['set-cookie'][0].split(';')[0];
  const settings = await req('/opendesk/admin/sync', {cookie});
  assert.equal(settings.status, 200);
  assert.match(settings.text, /src="\/app.js"/);
  assert.match(settings.text, /href="\/app.css"/);
  // Serve the existing formal assets, not a fake HTML/UI fixture. These checks
  // prove delivery; they intentionally do not claim browser rendering/clicks.
  for (const [path, file] of [['/app.js', 'app.js'], ['/app.css', 'app.css']]) {
    const asset = await req(path, {cookie});
    assert.equal(asset.status, 200);
    assert.equal(asset.text, await readFile(join(owner, 'web', 'dist', file), 'utf8'));
    if (file === 'app.js') assert.ok(asset.text.includes('cookie-sync-title'), 'formal bundle must include management settings');
  }
  const devices = await req('/opendesk/admin/api/devices', {cookie});
  assert.equal(devices.status, 200);
  assert.deepEqual(JSON.parse(devices.text), {devices: [], readOnly: false});
  const accounts = await req('/api/v1/accounts', {cookie});
  assert.equal(accounts.status, 200, `${accounts.text}; ${await readFile(audit, 'utf8')}; ${stderr}`);
  assert.deepEqual(JSON.parse(accounts.text).accounts.map(row => row.alias), ['synthetic_01']);
  assert.equal((await req('/api/v1/accounts/synthetic_01/history', {cookie})).status, 200);
  assert.equal(await readFile(join(history, 'history-v1.json'), 'utf8'), before);
  assert.equal(await readFile(audit, 'utf8'), 'guard-ready\n');

  // Ordinary CLI has no special shutdown RPC: terminate only this test's child.
  child.kill('SIGTERM');
  assert.deepEqual(await exited, [null, 'SIGTERM']);
  await assert.rejects(req('/opendesk/admin/sync', {cookie}), {code: 'ECONNREFUSED'});
  assert.equal(await readFile(audit, 'utf8'), 'guard-ready\n');
});
