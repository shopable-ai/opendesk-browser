import {createServer} from 'node:http';
import {spawn, execFileSync} from 'node:child_process';
import {readFile, mkdir, writeFile, rm, readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stamp = new Date().toISOString().replaceAll(':', '-');
const output = path.join(root, 'docs/framework/evidence/k3', `native-registry-${stamp}`); await mkdir(output, {recursive: true});
const browsers = [
  {label: '138', binary: path.join(root, 'tests/.cache/m5-browsers/138.0.7204.183/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')},
  {label: '154', binary: path.join(root, 'tests/.cache/m5-browsers/154.0.8037.92/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')}
];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function inventory() {
  const paths = ['src/framework/ChromePage.js', 'src/framework/context.js'];
  async function walk(dir) { for (const e of await readdir(path.join(root, dir), {withFileTypes: true})) { const p = `${dir}/${e.name}`; if (e.isDirectory()) await walk(p); else paths.push(p); } }
  await walk('src/framework/control'); await walk('src/scripting'); const files = [];
  for (const p of paths.sort()) files.push({path: p, sha256: sha(await readFile(path.join(root, p)))}); return files;
}
const sourceBefore = await inventory();
await writeFile(path.join(output, 'source-manifest.json'), JSON.stringify(sourceBefore, null, 2) + '\n');
const html = '<!doctype html><meta charset="utf-8"><title>Target-A</title><input id="name" value="Base"><input id="readonly" readonly value="Base"><input id="file" type="file"><button id="submit">Submit</button><div id="marker">A</div><p class="item">one</p><p class="item">two</p><div id="hidden" style="display:none">hidden</div><iframe id="child" src="/child"></iframe><script type="module" src="/tests/framework/k3-native-registry-page.js"></script>';
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/') { response.writeHead(200, {'content-type': 'text/html'}); response.end(html); return; }
  if (url.pathname === '/child') { response.writeHead(200, {'content-type': 'text/html'}); response.end('<!doctype html><title>Child-B</title><div>B</div>'); return; }
  const relative = decodeURIComponent(url.pathname.slice(1));
  if (!(relative.startsWith('src/framework/') || relative.startsWith('src/scripting/') || relative === 'tests/framework/k3-native-registry-page.js') || relative.includes('..') || !relative.endsWith('.js')) { response.writeHead(404); response.end(); return; }
  try { response.writeHead(200, {'content-type': 'text/javascript'}); response.end(await readFile(path.join(root, relative))); }
  catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/#targeted`;
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function connect(url) {
  const ws = new WebSocket(url), pending = new Map(); let id = 0;
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = ({data}) => { const message = JSON.parse(data); if (message.id && pending.has(message.id)) { const wait = pending.get(message.id); pending.delete(message.id); if (message.error) wait.reject(new Error(JSON.stringify(message.error))); else wait.resolve(message.result); } };
  return {request(method, params = {}) { return new Promise((resolve, reject) => { const key = ++id; pending.set(key, {resolve, reject}); ws.send(JSON.stringify({id: key, method, params})); }); }, close() { ws.close(); }};
}
const reports = [];
try {
  for (const browser of browsers) {
    const own = path.join(output, browser.label); await mkdir(own); const profile = path.join(own, 'profile'); await mkdir(profile);
    const binaryHash = sha(await readFile(browser.binary)), version = execFileSync(browser.binary, ['--version'], {encoding: 'utf8'}).trim();
    const args = ['--headless=new', '--use-mock-keychain', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'];
    const process = spawn(browser.binary, args, {stdio: ['ignore', 'pipe', 'pipe']}); let stderr = '', stdout = '', browserClient, pageClient, report;
    process.stderr.on('data', b => { stderr += b.toString(); }); process.stdout.on('data', b => { stdout += b.toString(); });
    const exited = new Promise(resolve => process.once('exit', (code, signal) => resolve({code, signal})));
    try {
      let ws; for (let i = 0; i < 200; i++) { ws = stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1]; if (ws) break; await sleep(25); }
      if (!ws) throw new Error('Browser debugging endpoint not observed');
      browserClient = await connect(ws); const info = await browserClient.request('Browser.getVersion');
      const {targetId} = await browserClient.request('Target.createTarget', {url});
      const port = new URL(ws).port; let tab;
      for (let i = 0; i < 100; i++) { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); tab = list.find(t => t.id === targetId); if (tab) break; await sleep(20); }
      pageClient = await connect(tab.webSocketDebuggerUrl);
      let result; for (let i = 0; i < 400; i++) {
        const response = await pageClient.request('Runtime.evaluate', {expression: 'globalThis.__k3RegistryReport', returnByValue: true});
        result = response.result.value; if (result) break; await sleep(25);
      }
      if (!result) {
        const diagnostics = await pageClient.request('Runtime.evaluate', {expression: '({href:location.href,readyState:document.readyState,body:document.body.innerHTML})', returnByValue: true});
        throw new Error(`No targeted registry report: ${JSON.stringify(diagnostics)}`);
      }
      report = {label: browser.label, binary: browser.binary, binarySha256: binaryHash, completeVersion: version, cdpVersion: info,
        OS: {type: os.type(), release: os.release(), arch: os.arch()}, profile, browserPid: process.pid, targetId, url, sourceManifestSha256: sha(JSON.stringify(sourceBefore)),
        layer: 'targeted product-module DOM semantics; not integrated final product qualification', permission: 'No Chrome authority/UI grant assertions in this layer', ...result};
      await browserClient.request('Target.closeTarget', {targetId});
    } catch (error) { report = {label: browser.label, status: 'ERROR', error: {name: error.name, message: error.message}, profile, browserPid: process.pid}; }
    finally {
      pageClient?.close(); if (browserClient) { try { await browserClient.request('Browser.close'); } catch {} browserClient.close(); } else process.kill('SIGTERM');
      const termination = await Promise.race([exited, sleep(5000).then(() => null)]); if (!termination) { process.kill('SIGKILL'); await exited; }
      report.cleanup = {...report.cleanup, browserExit: termination, ownedBrowserPidAlive: (() => { try { globalThis.process.kill(process.pid, 0); return true; } catch { return false; } })(), onlyOwnedProfileRemoved: profile};
      await writeFile(path.join(own, 'stdout.txt'), stdout); await writeFile(path.join(own, 'stderr.txt'), stderr); await rm(profile, {recursive: true, force: true});
    }
    await writeFile(path.join(own, 'report.json'), JSON.stringify(report, null, 2) + '\n'); reports.push(report);
    console.log(JSON.stringify({label: browser.label, summary: report.summary, error: report.error, cleanup: report.cleanup, output: path.join(own, 'report.json')}));
  }
} finally { await new Promise(resolve => server.close(resolve)); }
const after = await inventory(); const unchanged = JSON.stringify(sourceBefore) === JSON.stringify(after);
await writeFile(path.join(output, 'summary.json'), JSON.stringify({planHash: 'da4432720e75bbda7112f93d90829f1bfefd8790a1d7cecec09473bd1c6bc7d1', unchangedSource: unchanged, reports: reports.map(r => ({label: r.label, summary: r.summary, status: r.status})), limitations: 'Targeted module proof only; no final product PASS'}, null, 2) + '\n');
if (!unchanged || reports.some(r => r.status === 'ERROR' || r.summary.FAIL !== 0 || r.cleanup.ownedBrowserPidAlive)) globalThis.process.exitCode = 1;
