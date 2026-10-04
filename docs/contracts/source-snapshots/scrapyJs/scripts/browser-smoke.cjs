#!/usr/bin/env node
'use strict';
// Actual Chrome/CDP smoke with an isolated profile, local fixture, no credentials.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(work, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await work(); if (value) return value; await pause(100); }
  throw new Error('Browser readiness timeout');
}
async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const pending = new Map();
  const exceptions = [];
  let id = 0;
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer); pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
  };
  return {
    exceptions,
    close: () => socket.close(),
    send(method, params = {}, sessionId, timeout = 20000) {
      return new Promise((resolve, reject) => {
        const requestId = ++id;
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timeout: ${method}`)); }, timeout);
        pending.set(requestId, { resolve, reject, timer });
        socket.send(JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    }
  };
}

async function main() {
  const options = {};
  const args = process.argv.slice(2);
  while (args.length) {
    const flag = args.shift();
    if (!['--browser', '--extension', '--output'].includes(flag) || !args[0] || options[flag]) throw new Error(`Unknown/duplicate option ${flag}`);
    options[flag] = args.shift();
  }
  if (typeof WebSocket !== 'function') throw new Error('This smoke runner needs Node with the global WebSocket API');
  const extension = fs.realpathSync(options['--extension'] || path.resolve(__dirname, '../../scrapyJsChrome'));
  const browser = options['--browser'] || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const receipt = JSON.parse(fs.readFileSync(path.join(extension, 'assets/js/plugins/scrapyJs.source.json')));
  const expectedHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(extension, 'assets/js/plugins/scrapyJs.js'))).digest('hex');
  assert.equal(expectedHash, receipt.sdkHash, 'Extension asset differs from source receipt');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'scrapyjs-browser-smoke-'));
  const profile = path.join(temp, 'profile');
  const downloads = path.join(temp, 'downloads');
  fs.mkdirSync(downloads);
  const report = { startedAt: new Date().toISOString(), node: process.version, nodeExecutable: process.execPath,
    browserExecutable: browser, coreVersion: receipt.packageVersion, sdkHash: expectedHash, sourceHash: receipt.sourceHash,
    profile: 'isolated temporary profile', checks: [], limitations: ['No Node version matrix', 'No authenticated websites or multi-page pagination'] };
  let cdp, child;
  let stderr = '';
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>ScrapyJs offline fixture</title><div id="rows"><div><span class="title">Alpha</span></div><div><span class="title">Beta</span></div></div>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const fixtureUrl = `http://127.0.0.1:${server.address().port}/fixture`;
  const check = async (name, work) => {
    try { const details = await work(); report.checks.push({ name, passed: true, details }); return details; }
    catch (error) { report.checks.push({ name, passed: false, error: error.message }); return null; }
  };
  try {
    child = spawn(browser, ['--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
      '--enable-unsafe-extension-debugging', '--disable-background-networking', '--disable-sync', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let spawnError;
    child.on('error', error => { spawnError = error; });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-12000); });
    const active = await until(() => {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`Chrome exited: ${child.exitCode}`);
      const file = path.join(profile, 'DevToolsActivePort');
      return fs.existsSync(file) && fs.readFileSync(file, 'utf8').split('\n');
    });
    cdp = await connect(`ws://127.0.0.1:${active[0]}${active[1]}`);
    report.browser = await cdp.send('Browser.getVersion');
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    const { id: extensionId } = await cdp.send('Extensions.loadUnpacked', { path: extension });
    report.extensionId = extensionId;
    const { targetId: fixtureTarget } = await cdp.send('Target.createTarget', { url: fixtureUrl });
    const { targetId: popupTarget } = await cdp.send('Target.createTarget', { url: `chrome-extension://${extensionId}/www/popup_crawl.html` });
    const worker = await until(async () => (await cdp.send('Target.getTargets')).targetInfos.find(target => target.type === 'service_worker' && target.url === `chrome-extension://${extensionId}/background-sw.js`));
    const { sessionId: workerSession } = await cdp.send('Target.attachToTarget', { targetId: worker.targetId, flatten: true });
    const { sessionId: popupSession } = await cdp.send('Target.attachToTarget', { targetId: popupTarget, flatten: true });
    await cdp.send('Runtime.enable', {}, workerSession);
    await cdp.send('Runtime.enable', {}, popupSession);
    const evaluate = async (session, expression) => {
      const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, session, 30000);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    await until(() => evaluate(popupSession, 'document.readyState === "complete" && typeof runScrapyTaskInBackground === "function"'));
    await check('actual MV3 worker SDK hash and globals', async () => {
      const state = await evaluate(workerSession, `(async () => {
        const bytes = await (await fetch(chrome.runtime.getURL('assets/js/plugins/scrapyJs.js'))).arrayBuffer();
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
        return { digest, scrapy: typeof Scrapy, chromeSpider: typeof ChromeSpider, bridge: typeof page____ChromePage____Object, document: typeof document, window: typeof window };
      })()`);
      assert.equal(state.digest, expectedHash); assert.equal(state.scrapy, 'function');
      assert.equal(state.chromeSpider, 'function'); assert.equal(state.bridge, 'object'); assert.equal(state.document, 'undefined');
      return state;
    });
    await evaluate(workerSession, `(async()=>{ const tabs = await chrome.tabs.query({url:${JSON.stringify(fixtureUrl)}}); if(!tabs[0]) throw new Error('Fixture tab missing'); page____ChromePage____Object.tabId = tabs[0].id; return tabs[0].id; })()`);
    await check('real ChromePage bridge returns fixture DOM', async () => {
      const title = await evaluate(workerSession, 'page____ChromePage____Object.evaluate(() => document.title)');
      assert.equal(title, 'ScrapyJs offline fixture'); return { title };
    });
    await check('popup -> background -> current SDK returns two golden records and stats', async () => {
      const result = await evaluate(popupSession, `runScrapyTaskInBackground(${JSON.stringify({ name: 'devflow-fixture', start_urls: [fixtureUrl], itemConfig: { _listContainer: '#rows', title: '.title' } })}, {scrapySettings:{RETRY_TIMES:0,DOWNLOAD_DELAY:0}})`);
      assert.deepEqual(result.data.map(item => item.title), ['Alpha', 'Beta']);
      assert.equal(result.stats.pageCount, 1); assert.equal(result.stats.itemCount, 2);
      return result;
    });
    await check('zero-record browser scrape has an array and zero itemCount', async () => {
      const result = await evaluate(popupSession, `runScrapyTaskInBackground(${JSON.stringify({ name: 'devflow-empty', start_urls: [fixtureUrl], itemConfig: { _listContainer: '#missing', title: '.title' } })}, {scrapySettings:{RETRY_TIMES:0,DOWNLOAD_DELAY:0}})`);
      assert.deepEqual(result.data, []); assert.equal(result.stats.itemCount, 0); return result;
    });
    await check('message validation exposes error and request id', async () => {
      const result = await evaluate(popupSession, `sendRuntimeMessageWithProtocol({type:'SCRAPYJS_RUN',requestId:'devflow-invalid',meta:{protocolVersion:'1.0',requestId:'devflow-invalid'},detail:{}},{timeoutMs:3000})`);
      assert.equal(result.success, false); assert.equal(typeof result.errorCode, 'string');
      assert.equal(result.requestId, 'devflow-invalid'); return result;
    });
    await check('popup JSON download publishes parseable golden data', async () => {
      await evaluate(popupSession, `downloadFile(TableDataHandler.toJSON([{title:'Alpha'},{title:'Beta'}]), 'devflow.json', 'application/json')`);
      await until(() => fs.existsSync(path.join(downloads, 'devflow.json')));
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(downloads, 'devflow.json'))), [{ title: 'Alpha' }, { title: 'Beta' }]);
      return { records: 2 };
    });
    await check('popup CSV download escapes commas, quotes and newlines', async () => {
      const records = [{ title: 'A, "B"\nC' }, { title: 'Beta' }];
      const content = await evaluate(popupSession, `(() => { TableDataHandler.currentLanguage = 'devflow'; TableDataHandler.customHeaders = new Map();
        const content = TableDataHandler.toCSV(${JSON.stringify(records)}); downloadFile(content, 'devflow.csv', 'text/csv'); return content; })()`);
      assert.equal(content.replace(/\r\n/g, '\n'), 'title\n"A, ""B""\nC"\nBeta');
      await until(() => fs.existsSync(path.join(downloads, 'devflow.csv')));
      assert.equal(fs.readFileSync(path.join(downloads, 'devflow.csv'), 'utf8'), content);
      return { records: 2, escaped: true };
    });
    await check('fixture tab survives run/release', async () => {
      const targets = (await cdp.send('Target.getTargets')).targetInfos;
      assert.ok(targets.find(target => target.targetId === fixtureTarget && target.url === fixtureUrl)); return { preserved: true };
    });
    report.runtimeExceptions = cdp.exceptions;
  } catch (error) { report.checks.push({ name: 'browser setup/required prerequisite', passed: false, error: error.message }); }
  finally {
    if (cdp) { try { await cdp.send('Browser.close', {}, undefined, 3000); } catch {} cdp.close(); }
    if (child && child.exitCode === null) { child.kill('SIGTERM'); await pause(300); if (child.exitCode === null) child.kill('SIGKILL'); }
    await new Promise(resolve => server.close(resolve));
    report.finishedAt = new Date().toISOString();
    report.passed = report.checks.length >= 8 && report.checks.every(check => check.passed);
    if (!report.passed) report.chromeStderr = stderr;
    if (options['--output']) fs.writeFileSync(options['--output'], JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    fs.rmSync(temp, { recursive: true, force: true });
    if (!report.passed) process.exitCode = 1;
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
