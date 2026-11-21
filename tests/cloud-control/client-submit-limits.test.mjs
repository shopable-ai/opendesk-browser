import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openProvider } from '../../scripts/cloud-control/provider.mjs';

function post(transport, options, path, body, credential) {
  const headers = { 'content-type': 'application/json' };
  if (credential) headers.authorization = 'Bearer ' + credential;
  return new Promise((resolve, reject) => {
    const req = transport.request({ ...options, path, method: 'POST', headers }, resolve);
    req.on('error', reject);
    req.end(JSON.stringify(body));
  }).then(async response => {
    const chunks = [];
    for await (const chunk of response) chunks.push(chunk);
    const value = JSON.parse(Buffer.concat(chunks));
    if (response.statusCode !== 200) {
      throw Object.assign(new Error('Provider rejected ' + path), { code: value.error.code });
    }
    return value;
  });
}

test('limited Client recovers the original queued Job at both submit limits', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'od-client-submit-limits-'));
  let provider;
  try {
    const keyFile = join(directory, 'key.pem');
    const certFile = join(directory, 'cert.pem');
    const configFile = join(directory, 'openssl.cnf');
    await writeFile(configFile, [
      '[req]', 'distinguished_name=dn', 'x509_extensions=ext', 'prompt=no',
      '[dn]', 'CN=127.0.0.1', '[ext]', 'subjectAltName=IP:127.0.0.1',
      'basicConstraints=critical,CA:TRUE', ''
    ].join('\n'));
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-keyout', keyFile, '-out', certFile, '-config', configFile
    ], { stdio: 'ignore' });

    let now = Date.UTC(2026, 10, 19);
    const host = '127.0.0.1';
    provider = await openProvider({
      directory, port: 0, publicTls: { host, port: 0, keyFile, certFile }, clock: () => now
    });
    const local = { host, port: provider.port };
    const remote = { host, port: provider.publicPort, ca: await readFile(certFile) };
    const admin = JSON.parse(await readFile(provider.credentialFile));
    const pkg = JSON.parse(await readFile(new URL('../../examples/tasks/form-fill.v1.opendesk-task.json', import.meta.url)));
    const pin = {
      taskId: pkg.manifest.taskId, version: pkg.manifest.version,
      manifestHash: pkg.manifestHash, sourceHash: pkg.manifest.program.sourceHash
    };
    const executorId = randomUUID();
    const executor = await post(http, local, '/v1/pair', { executorId, pairingCode: admin.pairingCode });
    await post(http, local, '/v1/capabilities', {
      grantId: randomUUID(),
      tasks: [{ taskId: pin.taskId, manifestHash: pin.manifestHash, sourceHash: pin.sourceHash }]
    }, executor.credential);
    const client = await post(http, local, '/admin/client-grant', {
      executorId, tasks: [pin], allowResult: false
    }, admin.adminToken);

    const submit = number => post(https, remote, '/v1/submit', {
      requestKey: 'limit-' + number, ...pin, params: { name: 'Submit limits' },
      target: { mode: 'owned', url: 'http://127.0.0.1:43111/demo-form.html' }
    }, client.credential);
    const statusByKey = number => post(https, remote, '/v1/job-status', {
      requestKey: 'limit-' + number
    }, client.credential);
    const original = await submit(1);

    async function verifyLimit(count) {
      const refused = count + 1;
      await assert.rejects(submit(refused), { code: 'E_QUEUE_LIMIT' }, 'first submission');
      await assert.rejects(submit(refused), { code: 'E_QUEUE_LIMIT' }, 'immediate retry');
      assert.deepEqual(await submit(1), original);
      const ledgerPath = join(directory, 'state.json');
      const snapshot = await readFile(ledgerPath, 'utf8');
      await assert.rejects(statusByKey(refused), { code: 'E_JOB' });
      const status = await statusByKey(1);
      assert.deepEqual(status, { jobId: original.jobId, state: 'queued', receiptConfirmed: false });
      assert.equal(await readFile(ledgerPath, 'utf8'), snapshot);
      const jobs = Object.values(JSON.parse(snapshot).jobs);
      assert.equal(jobs.length, count);
      assert.ok(jobs.every(job => job.state === 'queued' && !job.cancelled && !job.assignment));
      t.diagnostic(`queued=${jobs.length}, limit-${refused}: submit and retry=E_QUEUE_LIMIT, lookup=E_JOB; limit-1: retry and lookup=original Job, assignments=0`);
    }

    for (let number = 2; number <= 60; number++) await submit(number);
    await verifyLimit(60);
    now += 60_000;
    const firstAcceptedAfterWindow = await submit(61);
    assert.notEqual(firstAcceptedAfterWindow.jobId, original.jobId);
    assert.deepEqual(await statusByKey(61), {
      jobId: firstAcceptedAfterWindow.jobId, state: 'queued', receiptConfirmed: false
    });
    t.diagnostic('after +60000 ms, limit-61: first Job created and found by key');
    for (let number = 62; number <= 100; number++) await submit(number);
    await verifyLimit(100);
  } finally {
    try {
      await provider?.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});
