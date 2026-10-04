import {createServer} from 'node:http';
import {spawn, execFileSync} from 'node:child_process';
import {readFile, mkdir, writeFile, rm, readdir, copyFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash, generateKeyPairSync} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import webpack from 'webpack';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'docs/framework/evidence/k3', `native-control-component-${new Date().toISOString().replaceAll(':', '-')}`);
await mkdir(output, {recursive: true}); const extension = path.join(output, 'component-extension'); await mkdir(extension);
const requests = [], server = createServer((req, res) => { requests.push({url: req.url, at: Date.now(), monoMs: performance.now()}); res.writeHead(200, {'access-control-allow-origin': '*'}); res.end(new URL(req.url, 'http://localhost').searchParams.get('kind') === 'positive' ? 'positive' : 'worker'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const network = `http://127.0.0.1:${server.address().port}/network`;
const publicKey = generateKeyPairSync('rsa', {modulusLength: 2048}).publicKey.export({format: 'der', type: 'spki'}), key = publicKey.toString('base64');
const extensionId = createHash('sha256').update(publicKey).digest('hex').slice(0, 32).split('').map(ch => String.fromCharCode(97 + parseInt(ch, 16))).join('');
const policy = "sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-eval'; worker-src blob:; connect-src 'none'; child-src 'none'; img-src 'none'; style-src 'none'; base-uri 'none'; form-action 'none'";
await writeFile(path.join(extension, 'manifest.json'), JSON.stringify({manifest_version: 3, name: 'K3 product-module targeted proof', version: '1.0.0', key,
  host_permissions: ['http://127.0.0.1/*'], sandbox: {pages: ['src/scripting/sandbox/sandbox.html']}, content_security_policy: {extension_pages: "script-src 'self'; object-src 'none'", sandbox: policy}}, null, 2));
await writeFile(path.join(extension, 'host.html'), '<!doctype html><meta charset="utf-8"><title>K3 component proof</title><body><script src="host.js"></script></body>');
await mkdir(path.join(extension, 'src/scripting/sandbox'), {recursive: true});
for (const f of ['sandbox.html', 'sandbox.js']) await copyFile(path.join(root, 'src/scripting/sandbox', f), path.join(extension, 'src/scripting/sandbox', f));
await new Promise((resolve, reject) => webpack({mode: 'none', devtool: false, context: root,
  entry: {host: './tests/framework/k3-control-native-page.js', worker: './src/scripting/sandbox/worker-runtime.js'},
  output: {path: extension, filename: '[name].js'}, optimization: {minimize: false}}, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({all: false, errors: true}))) : resolve()));
const source = [];
async function walk(dir) { for (const e of await readdir(path.join(root, dir), {withFileTypes: true})) { const p = `${dir}/${e.name}`; if (e.isDirectory()) await walk(p); else source.push({path: p, sha256: createHash('sha256').update(await readFile(path.join(root, p))).digest('hex')}); } }
for (const p of ['src/framework/ChromePage.js', 'src/framework/context.js']) source.push({path: p, sha256: createHash('sha256').update(await readFile(path.join(root, p))).digest('hex')});
await walk('src/framework/control'); await walk('src/scripting'); source.sort((a,b) => a.path.localeCompare(b.path));
await writeFile(path.join(output, 'source-manifest.json'), JSON.stringify(source, null, 2) + '\n');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function connect(url) {
  const socket = new WebSocket(url), pending = new Map(); let seq = 0;
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = ({data}) => { const message = JSON.parse(data), waiter = pending.get(message.id); if (!waiter) return; pending.delete(message.id); message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result); };
  return {send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, {resolve, reject}); socket.send(JSON.stringify({id, method, params})); }); }, close: () => socket.close()};
}
const reports = [];
try {
  for (const label of ['138', '154']) {
    const version = label === '138' ? '138.0.7204.183' : '154.0.8037.92';
    const binary = path.join(root, `tests/.cache/m5-browsers/${version}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`);
    const own = path.join(output, label), profile = path.join(own, 'profile'); await mkdir(profile, {recursive: true});
    const browser = spawn(binary, ['--headless=new', '--use-mock-keychain', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--load-extension=${extension}`, `--disable-extensions-except=${extension}`, 'about:blank'], {stdio: ['ignore', 'pipe', 'pipe']});
    let stderr = '', stdout = '', hostClient, browserClient, report; const beginRequest = requests.length;
    browser.stderr.on('data', bytes => { stderr += bytes.toString(); }); browser.stdout.on('data', bytes => { stdout += bytes.toString(); });
    const exited = new Promise(resolve => browser.once('exit', (code, signal) => resolve({code, signal})));
    try {
      let endpoint; for (let i = 0; i < 200; i++) { endpoint = stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1]; if (endpoint) break; await sleep(25); } if (!endpoint) throw new Error('No browser endpoint');
      browserClient = await connect(endpoint); const cdpVersion = await browserClient.send('Browser.getVersion');
      const url = `chrome-extension://${extensionId}/host.html?network=${encodeURIComponent(network)}`;
      const {targetId} = await browserClient.send('Target.createTarget', {url}); let tab;
      for (let i = 0; i < 100; i++) { tab = (await (await fetch(`http://127.0.0.1:${new URL(endpoint).port}/json/list`)).json()).find(t => t.id === targetId); if (tab) break; await sleep(20); }
      hostClient = await connect(tab.webSocketDebuggerUrl); let raw;
      for (let i = 0; i < 1800; i++) { raw = (await hostClient.send('Runtime.evaluate', {expression: 'globalThis.__k3ControlReport', returnByValue: true})).result.value; if (raw) break; await sleep(25); }
      if (!raw) throw new Error('No native control component report');
      report = {label, binary, binarySha256: createHash('sha256').update(await readFile(binary)).digest('hex'), completeVersion: execFileSync(binary, ['--version'], {encoding: 'utf8'}).trim(),
        OS: {type: os.type(), release: os.release(), arch: os.arch()}, extensionId, profile, browserPid: browser.pid, targetId, cdpVersion, source, ...raw, rawServerRequests: requests.slice(beginRequest)};
      const ownRequests = requests.slice(beginRequest); if (ownRequests.some(req => req.url.includes('kind=worker')) || ownRequests.filter(req => req.url.includes('kind=positive')).length !== 1) report.networkAttributionFailure = true;
      await browserClient.send('Target.closeTarget', {targetId});
    } catch (error) { report = {label, status: 'ERROR', error: {message: error.message, stack: error.stack}}; }
    finally {
      hostClient?.close(); if (browserClient) { try { await browserClient.send('Browser.close'); } catch {} browserClient.close(); } else browser.kill('SIGTERM');
      let exit = await Promise.race([exited, sleep(5000).then(() => null)]); if (!exit) { browser.kill('SIGKILL'); exit = await exited; }
      await writeFile(path.join(own, 'stderr.txt'), stderr); await writeFile(path.join(own, 'stdout.txt'), stdout); await rm(profile, {recursive: true, force: true});
      report.cleanup = {browserExit: exit, ownedBrowserPidAlive: (() => { try { process.kill(browser.pid, 0); return true; } catch { return false; } })(), ownedProfileRemoved: profile};
    }
    await writeFile(path.join(own, 'report.json'), JSON.stringify(report, null, 2) + '\n'); reports.push(report);
    console.log(JSON.stringify({label, summary: report.summary, error: report.error, networkAttributionFailure: report.networkAttributionFailure, output: path.join(own, 'report.json')}));
  }
} finally { await new Promise(resolve => server.close(resolve)); }
await writeFile(path.join(output, 'summary.json'), JSON.stringify({planHash: 'da4432720e75bbda7112f93d90829f1bfefd8790a1d7cecec09473bd1c6bc7d1', reports: reports.map(r => ({label: r.label, summary: r.summary, error: r.error})), finalProductPassed: false, serverClosed: true}, null, 2) + '\n');
if (reports.some(r => r.status === 'ERROR' || r.summary.FAIL || r.networkAttributionFailure || r.cleanup.ownedBrowserPidAlive)) process.exitCode = 1;
