import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const { chromium } = require('/Users/shopme/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(root, 'fixture');
const output = resolve(root, 'evidence/chrome-149');
const profile = resolve(root, 'profiles/chrome-149');
await mkdir(output, {recursive: true});
await mkdir(profile, {recursive: true});
let hits = 0;
const server = createServer((request, response) => { hits++; response.writeHead(200, {'Access-Control-Allow-Origin': '*'}); response.end('probe'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const networkURL = `http://127.0.0.1:${server.address().port}/probe`;
const logs = [];
let context;
let report;
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome for Testing',
    headless: false,
    args: [`--disable-extensions-except=${fixture}`, `--load-extension=${fixture}`]
  });
  const version = context.browser().version();
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', {timeout: 15000});
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  page.on('console', message => logs.push({type: 'console', level: message.type(), text: message.text(), location: message.location()}));
  page.on('pageerror', error => logs.push({type: 'pageerror', name: error.name, message: error.message, stack: error.stack}));
  await page.goto(`chrome-extension://${extensionId}/host.html?network=${encodeURIComponent(networkURL)}`);
  await page.waitForFunction(() => !!window.__prototypeReport, {timeout: 45000});
  report = await page.evaluate(() => window.__prototypeReport);
  report.actualBrowser = {version, executable: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome for Testing', channel: 'Chrome for Testing', stable: false, extensionId, headed: true, isolatedProfile: profile};
  report.networkServer = {url: networkURL, actualRequestCount: hits};
  report.evidence = {log: resolve(output, 'console.json'), screenshot: resolve(output, 'workbench.png'), fixtureCandidate: resolve(root, 'candidate-manifest.json')};
  report.designManifestSha256 = 'acca60edf9031aafb4ecb740f5f0f33777a3694d23499f28ce37af63b38f592f';
  report.prototypeCandidateSha256 = createHash('sha256').update(await readFile(resolve(root, 'candidate-manifest.json'))).digest('hex');
  report.notTested = ['user async-body execution if Worker construction fails', 'userScripts authorization/version/document/result matrix', 'full F2 migration', 'all F3 mandatory product cases', 'minimum/stable authorization matrix'];
  await page.screenshot({path: resolve(output, 'workbench.png'), fullPage: true});
} catch (error) {
  report = {backendPrototypePassed: false, fixtureFailure: {name: error.name, message: error.message, stack: error.stack}, notTested: ['EX08 backend if fixture initialization failed', 'F2', 'F3']};
} finally {
  if (context) await context.close();
  await new Promise(resolve => server.close(resolve));
  report.cleanup = {browserContextClosed: true, loopbackServerClosed: true};
  await writeFile(resolve(output, 'console.json'), JSON.stringify(logs, null, 2) + '\n');
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({report: resolve(output, 'report.json'), backendPrototypePassed: report.backendPrototypePassed, cases: report.cases?.map(({id, status, phase, error}) => ({id, status, phase, error})), fixtureFailure: report.fixtureFailure}, null, 2));
process.exitCode = report.backendPrototypePassed ? 0 : 1;
