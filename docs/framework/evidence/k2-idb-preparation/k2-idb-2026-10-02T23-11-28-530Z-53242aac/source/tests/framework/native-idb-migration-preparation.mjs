import {createServer} from 'node:http';
import {readFile, writeFile, mkdir, rm, readdir, stat} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {platform, release, arch} from 'node:os';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const executable = option('--executable', resolve(project, 'tests/.cache/m5-browsers/154.0.8037.92/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
const require = createRequire(import.meta.url);
const playwrightPath = option('--playwright', '/Users/shopme/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {chromium} = require(playwrightPath);
const runId = `k2-idb-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const output = resolve(project, 'docs/framework/evidence/k2-idb-preparation', runId);
const profile = resolve(project, 'tests/.cache', runId);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const writeJSON = (name, value) => writeFile(resolve(output, name), JSON.stringify(value, null, 2) + '\n');
const sourcePaths = ['src/platform/storage/index.js', 'src/platform/storage/idb.js', 'src/platform/storage/repository.js',
  'src/platform/protocol.js', 'src/platform/schema.js', 'tests/framework/native-idb-migration-fixture.js', 'tests/framework/native-idb-migration-preparation.mjs'];
const sources = [];
await mkdir(output, {recursive: true});
await mkdir(profile, {recursive: true});
for (const path of sourcePaths) {
  const bytes = await readFile(resolve(project, path));
  sources.push({path, bytes: bytes.length, sha256: sha(bytes)});
  await mkdir(dirname(resolve(output, 'source', path)), {recursive: true});
  await writeFile(resolve(output, 'source', path), bytes);
}
const protectedPaths = [
  'docs/framework/reviews/m5-f1/final-candidate-v1/candidate-manifest.json',
  'tests/prototypes/user-scripts-v2/fixture/host.js', 'tests/prototypes/user-scripts-v2/fixture/host.html',
  'tests/prototypes/user-scripts-v2/fixture/adapter.js', 'tests/prototypes/user-scripts-v2/run-headed.mjs',
  'tests/prototypes/user-scripts-v2/evidence/m5-2026-10-02T21-43-14-105Z-m5-round6-138-final-r1-e4583721/evidence-manifest.json',
  'tests/prototypes/user-scripts-v2/evidence/m5-2026-10-02T21-45-38-480Z-m5-round6-154-final-r1-88420ebe/evidence-manifest.json'];
const protectedHashes = await Promise.all(protectedPaths.map(async path => ({path, sha256: sha(await readFile(resolve(project, path)))})));
const http = [], consoleEvents = [];
let context, browserVersion, origin, browserResult, runnerFailure, contextClosed = false, profileRemoved = false;
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/') {
      http.push({url: request.url, method: request.method, status: 200});
      response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
      response.end('<!doctype html><meta charset="utf-8"><title>K2 native IDB input preparation</title><p>HTTP native IDB input preparation; no extension qualification.</p>');
    } else if (sourcePaths.includes(path.slice(1)) && !path.endsWith('preparation.mjs')) {
      const file = path.slice(1), bytes = await readFile(resolve(project, file)), hash = sha(bytes);
      if (hash !== sources.find(item => item.path === file).sha256) throw new Error(`Source changed during execution: ${file}`);
      http.push({url: request.url, method: request.method, status: 200, path: file, bytes: bytes.length, sha256: hash});
      response.writeHead(200, {'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-K2-Source-Sha256': hash});
      response.end(bytes);
    } else {http.push({url: request.url, method: request.method, status: 404}); response.writeHead(404); response.end();}
  } catch (error) {http.push({url: request.url, error: String(error)}); response.writeHead(500); response.end(String(error));}
});
try {
  await new Promise((yes, no) => {server.once('error', no); server.listen(0, '127.0.0.1', yes);});
  origin = `http://localhost:${server.address().port}`;
  context = await chromium.launchPersistentContext(profile, {executablePath: executable, headless: false, viewport: {width: 1100, height: 760},
    args: ['--no-first-run', '--no-default-browser-check']});
  const page = context.pages()[0] || await context.newPage();
  page.on('console', message => consoleEvents.push({type: message.type(), text: message.text()}));
  page.on('pageerror', error => consoleEvents.push({type: 'pageerror', name: error.name, message: error.message}));
  const cdp = await context.newCDPSession(page);
  const version = await cdp.send('Browser.getVersion');
  browserVersion = version;
  if (!version.product.endsWith('/154.0.8037.92')) throw new Error(`Unexpected browser version: ${version.product}`);
  await page.goto(origin);
  let timeout;
  try {
    browserResult = await Promise.race([
      page.evaluate(async () => (await import('/tests/framework/native-idb-migration-fixture.js')).runPreparation()),
      new Promise((_, reject) => {timeout = setTimeout(() => reject(new Error('Native IDB preparation exceeded 45s; owned context will close')), 45000);})
    ]);
  } finally {clearTimeout(timeout);}
  await page.screenshot({path: resolve(output, 'http-origin-native-idb.png')});
  await cdp.detach();
} catch (error) {runnerFailure = {name: error.name, message: error.message, stack: error.stack};}
finally {
  if (context) {await context.close(); contextClosed = true;}
  if (server.listening) await new Promise(yes => server.close(yes));
  await rm(profile, {recursive: true, force: true});
  profileRemoved = true;
}
const unchangedSources = await Promise.all(sources.map(async item => ({...item, unchanged: sha(await readFile(resolve(project, item.path))) === item.sha256})));
const protectedAfter = await Promise.all(protectedHashes.map(async item => ({...item, unchanged: sha(await readFile(resolve(project, item.path))) === item.sha256})));
const report = {schema: 'k2.native-idb-preparation.v1', runId, scope: 'HTTP origin native IndexedDB primitive and test-input preparation only; no extension/SDK sender/F2/F3 acceptance or case closure',
  browser: {executable, executableSha256: sha(await readFile(executable)), version: browserVersion, headed: true, freshProfile: profile,
    os: {platform: platform(), release: release(), arch: arch()}, playwrightPath, playwrightVersion: require(`${playwrightPath}/package.json`).version},
  origin, databaseName: 'opendesk-browser', sources: unchangedSources, protectedF1Hashes: protectedAfter, browserResult, runnerFailure,
  cleanup: {browserContextClosed: contextClosed, serverClosed: !server.listening, profileRemoved, profilePath: profile, ownResourcesOnly: true},
  preparationAssertionsPassed: Boolean(browserResult) && !runnerFailure && !browserResult.initializationOrAssertionFailure && browserResult.cases.every(item => item.pass),
  productV2MigrationPassed: false, gatesWritten: false, ledgerCasesClosed: [],
  primaryReference: 'https://w3c.github.io/IndexedDB/#key-construct',
  note: 'Date and binary keys are serialized into typed evidence in-browser before Playwright transport; binary view keys normalize to native ArrayBuffer key bytes. Recovery readonly is an actual service guard, not an intrinsically readonly IDBDatabase connection.'};
await writeJSON('report.json', report);
await writeJSON('native-events.json', browserResult?.nativeEvents || []);
await writeJSON('key-value-inputs.json', browserResult?.inputEvidence || []);
await writeJSON('backups-typed.json', browserResult?.backups || null);
await writeJSON('http.json', http);
await writeJSON('console.json', consoleEvents);
const mapping = {preparationAssertions: browserResult?.cases || [], relatedUnclosedContracts: ['SVC01-IDB-TRANSACTIONS', 'SVC01-IDB-RECOVERY'],
  qualification: 'test-input/native failure-recovery preparation only; no production case status changed', notTested: browserResult?.notTested || ['browser preparation did not complete']};
await writeJSON('contract-boundary.json', mapping);
const markdown = `K2 原生 IDB 输入及失败恢复准备\n\n实际 origin：${origin}；浏览器：${browserVersion?.product}。\n\n实际加载产品 storage/index.js、idb.js、repository.js 及 protocol/schema，源 hash 与 HTTP payload 记录见 report.json/http.json。唯一库名 opendesk-browser，v1 十 store；80 条明确 key/value 输入包含 string、number、Date、ArrayBuffer/view 字节及复合 array。\n\n准备断言：${report.preparationAssertionsPassed ? '通过' : '存在失败，见原始报告'}。当前 v2 升级支持仍为 false；真实 onupgradeneeded/abort 与 v1 只读恢复单独记录，不能计作 v2 迁移成功。\n\n这是 HTTP origin 原生 primitive/test-input preparation，不是扩展入口、SDK sender 或 F2/F3 验收；不关闭合同 case。已保存故障前后 typed backup/hash、事件及只读写拒绝。尚未测项见 contract-boundary.json。\n\n清理：context=${contextClosed}、server=${!server.listening}、仅本次 profileRemoved=${profileRemoved}。产品源码和 F1 保护源/hash ${unchangedSources.every(x => x.unchanged) && protectedAfter.every(x => x.unchanged) ? '均保持不变' : '出现外部变化，需核对报告'}。\n\n复跑：node tests/framework/native-idb-migration-preparation.mjs\n\n键类型与升级 abort 的语义参考 [IndexedDB 规范](https://w3c.github.io/IndexedDB/#key-construct)；本结论以保存的实际 native 事件与数据为证。\n`;
await writeFile(resolve(output, 'preparation.md'), markdown);
const inventory = [];
async function collect(directory) {
  for (const name of (await readdir(directory)).sort()) {
    const path = resolve(directory, name), info = await stat(path);
    if (info.isDirectory()) await collect(path);
    else inventory.push({path: path.slice(output.length + 1), bytes: info.size, sha256: sha(await readFile(path))});
  }
}
await collect(output);
await writeJSON('evidence-manifest.json', {schema: 'k2.native-idb-preparation-manifest.v1', runId, files: inventory});
console.log(JSON.stringify({output, manifestSha256: sha(await readFile(resolve(output, 'evidence-manifest.json'))), assertionsPassed: report.preparationAssertionsPassed,
  cases: browserResult?.cases.map(item => ({id: item.id, pass: item.pass})), runnerFailure, browserFailure: browserResult?.initializationOrAssertionFailure, cleanup: report.cleanup}, null, 2));
if (!report.preparationAssertionsPassed || !unchangedSources.every(x => x.unchanged) || !protectedAfter.every(x => x.unchanged)) process.exitCode = 1;
