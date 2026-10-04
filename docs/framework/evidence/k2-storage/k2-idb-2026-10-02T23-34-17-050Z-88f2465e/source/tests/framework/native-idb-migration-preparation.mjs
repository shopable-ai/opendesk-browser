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
const mode = option('--mode', 'migration');
if (!['migration', 'preparation'].includes(mode)) throw new Error('Unknown native IDB mode');
const output = resolve(project, 'docs/framework/evidence/k2-storage', runId);
const profile = resolve(project, 'tests/.cache', runId);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const writeJSON = (name, value) => writeFile(resolve(output, name), JSON.stringify(value, null, 2) + '\n');
const sourcePaths = ['src/platform/storage/index.js', 'src/platform/storage/idb.js', 'src/platform/storage/repository.js',
  'src/platform/protocol.js', 'src/platform/schema.js', 'src/platform/journal.js', 'src/platform/storage/regression.js',
  'tests/framework/native-idb-migration-verification.js', 'tests/framework/native-idb-migration-fixture.js', 'tests/framework/native-idb-migration-preparation.mjs'];
const legacyRoot = resolve(project, 'docs/framework/evidence/k2-idb-preparation/k2-idb-2026-10-02T23-11-28-530Z-53242aac/source');
const legacyPaths = ['src/platform/storage/index.js', 'src/platform/storage/idb.js', 'src/platform/storage/repository.js', 'src/platform/protocol.js', 'src/platform/schema.js'];
const legacySources = [];
const sources = [];
await mkdir(output, {recursive: true});
await mkdir(profile, {recursive: true});
for (const path of sourcePaths) {
  const bytes = await readFile(resolve(project, path));
  sources.push({path, bytes: bytes.length, sha256: sha(bytes)});
  await mkdir(dirname(resolve(output, 'source', path)), {recursive: true});
  await writeFile(resolve(output, 'source', path), bytes);
}
for (const path of legacyPaths) {
  const bytes = await readFile(resolve(legacyRoot, path));
  legacySources.push({path: `legacy/${path}`, originalPath: resolve(legacyRoot, path), bytes: bytes.length, sha256: sha(bytes)});
  await mkdir(dirname(resolve(output, 'source/legacy', path)), {recursive: true});
  await writeFile(resolve(output, 'source/legacy', path), bytes);
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
    } else if (path.startsWith('/legacy/') && legacyPaths.includes(path.slice('/legacy/'.length))) {
      const file = path.slice('/legacy/'.length), bytes = await readFile(resolve(legacyRoot, file)), hash = sha(bytes);
      if (hash !== legacySources.find(item => item.path === `legacy/${file}`).sha256) throw new Error('Legacy snapshot changed');
      http.push({url: request.url, method: request.method, status: 200, path: `legacy/${file}`, bytes: bytes.length, sha256: hash});
      response.writeHead(200, {'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store'}); response.end(bytes);
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
      page.evaluate(async ({mode, freshOnly}) => mode === 'migration'
        ? (await import('/tests/framework/native-idb-migration-verification.js')).runMigrationVerification({freshOnly})
        : (await import('/tests/framework/native-idb-migration-fixture.js')).runPreparation(), {mode, freshOnly: args.includes('--fresh-only')}),
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
const report = {schema: 'k2.native-idb-storage.v1', runId, mode, freshOnly: args.includes('--fresh-only'), scope: 'Actual product storage modules on HTTP native IDB; no extension/SDK sender/F2/F3 acceptance or case closure',
  browser: {executable, executableSha256: sha(await readFile(executable)), version: browserVersion, headed: true, freshProfile: profile,
    os: {platform: platform(), release: release(), arch: arch()}, playwrightPath, playwrightVersion: require(`${playwrightPath}/package.json`).version},
  origin, databaseName: 'opendesk-browser', sources: unchangedSources, legacySources, protectedF1Hashes: protectedAfter, browserResult, runnerFailure,
  cleanup: {browserContextClosed: contextClosed, serverClosed: !server.listening, profileRemoved, profilePath: profile, ownResourcesOnly: true},
  preparationAssertionsPassed: Boolean(browserResult) && !runnerFailure && !browserResult.initializationOrAssertionFailure && !browserResult.failure && browserResult.cases.every(item => item.pass),
  productV2MigrationPassed: Boolean(browserResult?.cases.some(item => ['K2-NATIVE-SAME-DATABASE-V2', 'K2-NATIVE-FRESH-V2'].includes(item.id) && item.pass)), gatesWritten: false, ledgerCasesClosed: [],
  primaryReference: 'https://w3c.github.io/IndexedDB/#key-construct',
  note: 'Date and binary keys are serialized into typed evidence in-browser before Playwright transport; binary view keys normalize to native ArrayBuffer key bytes. Recovery readonly is an actual service guard, not an intrinsically readonly IDBDatabase connection.'};
await writeJSON('report.json', report);
await writeJSON('native-events.json', browserResult?.nativeEvents || browserResult?.events || []);
await writeJSON('key-value-inputs.json', browserResult?.inputEvidence || browserResult?.comparisons || []);
await writeJSON('backups-typed.json', browserResult?.backups || null);
await writeJSON('http.json', http);
await writeJSON('console.json', consoleEvents);
const mapping = {preparationAssertions: browserResult?.cases || [], relatedUnclosedContracts: ['SVC01-IDB-TRANSACTIONS', 'SVC01-IDB-RECOVERY'],
  qualification: 'test-input/native failure-recovery preparation only; no production case status changed', notTested: browserResult?.notTested || ['browser preparation did not complete']};
await writeJSON('contract-boundary.json', mapping);
const markdown = `K2 产品模块原生 IDB 验证\n\n模式：${mode}；freshOnly=${report.freshOnly}。实际 origin：${origin}；浏览器：${browserVersion?.product}。\n\n实际 storage、journal、regression 及 frozen v1 JS 的 source/HTTP payload hash 均记录。唯一库名 opendesk-browser；migration 模式沿用原始 80 条明确 typed key/JSON value 输入。\n\n断言：${report.preparationAssertionsPassed ? '通过' : '存在失败，见原始报告'}；本次实际 v2 场景=${report.productV2MigrationPassed}。升级 abort/blocked 的原生事件和数据保持、成功升级及旧 JS/当前只读诊断分别记账，不修改旧准备证据。\n\n这是 HTTP native IDB 的真实产品方法验证；seeded host/run 不是可信 sender。不是扩展入口/F2/F3 验收，不关闭 17/R3–R8 或合同 case。尚未测项见 contract-boundary.json。\n\n清理：context=${contextClosed}、server=${!server.listening}、仅本次 profileRemoved=${profileRemoved}；执行期间源及 F1 冻结件 hash ${unchangedSources.every(x => x.unchanged) && protectedAfter.every(x => x.unchanged) ? '无漂移' : '存在变化，需核对报告'}。\n\n复跑：node tests/framework/native-idb-migration-preparation.mjs；新库场景追加 --fresh-only。\n\n[IndexedDB 规范](https://w3c.github.io/IndexedDB/#key-construct)。\n`;
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
