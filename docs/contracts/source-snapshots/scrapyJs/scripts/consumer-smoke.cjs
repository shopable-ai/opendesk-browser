'use strict';

// Run with: node scripts/consumer-smoke.cjs. Artifacts stay in the printed temp directory.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { sourceState } = require('./sdk-sync.cjs');

const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--output' && path.isAbsolute(args[1])),
  'Usage: node scripts/consumer-smoke.cjs [--output /absolute/report.json]');
const outputReport = args[1];

const core = path.resolve(__dirname, '..');
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'scrapyjs-consumer-'));
const report = { node: process.version, execPath: process.execPath, core, artifacts, checks: [] };
const plain = value => JSON.parse(JSON.stringify(value));
const npmLauncher = process.env.npm_execpath || (process.env.PATH || '').split(path.delimiter)
  .map(directory => path.join(directory, 'npm')).find(file => fs.existsSync(file));
assert.ok(npmLauncher, 'An existing npm launcher is required.');
const npmCLI = fs.realpathSync(npmLauncher);
const command = (file, args, cwd = core) => execFileSync(file, args, {
  cwd, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024,
  env: { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ''}`,
    npm_config_update_notifier: 'false', npm_config_audit: 'false' },
});

async function check(name, action) {
  try {
    const observation = await action();
    report.checks.push({ name, status: 'pass', observation });
  } catch (error) {
    report.checks.push({ name, status: 'fail', error: error.stack });
    process.exitCode = 1;
  }
}

async function main() {
  assert.ok(fs.existsSync(path.join(core, 'node_modules')), 'Existing core/node_modules is required; no install is performed.');
  const packDir = path.join(artifacts, 'pack');
  fs.mkdirSync(packDir);
  report.sourceBefore = sourceState(core);
  report.npmExecPath = npmCLI;
  report.npm = command(process.execPath, [npmCLI, '--version']).trim();
  const packJSON = command(process.execPath, [npmCLI, 'pack', '--json', '--offline', '--ignore-scripts', '--pack-destination', packDir]);
  fs.writeFileSync(path.join(artifacts, 'pack.json'), packJSON);
  const [packed] = JSON.parse(packJSON);
  report.sourceAfter = sourceState(core);
  await check('source remained stable while packing', () => {
    assert.equal(report.sourceBefore.sourceHash, report.sourceAfter.sourceHash, 'Concurrent source edit while packing');
    return { sourceHash: report.sourceBefore.sourceHash };
  });
  const tarball = path.join(packDir, packed.filename);
  const bytes = fs.readFileSync(tarball);
  const sha1 = crypto.createHash('sha1').update(bytes).digest('hex');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const integrity = `sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}`;
  assert.equal(sha1, packed.shasum);
  assert.equal(integrity, packed.integrity);
  report.tarball = { path: tarball, name: packed.name, version: packed.version, sha1, sha256, integrity,
    bytes: bytes.length, files: packed.files.map(file => file.path).sort() };

  const consumer = path.join(artifacts, 'consumer');
  const installed = path.join(consumer, 'node_modules', packed.name);
  fs.mkdirSync(installed, { recursive: true });
  fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ private: true, name: 'offline-consumer' }));
  command('tar', ['-xzf', tarball, '-C', installed, '--strip-components=1']);
  // Only dependencies are linked. The package under test is the actual extracted tarball.
  fs.symlinkSync(path.join(core, 'node_modules'), path.join(installed, 'node_modules'), 'dir');
  const consumerRequire = createRequire(path.join(consumer, 'entry.cjs'));
  const resolved = consumerRequire.resolve(packed.name);
  assert.ok(fs.realpathSync(resolved).startsWith(`${fs.realpathSync(installed)}${path.sep}`));
  const api = consumerRequire(packed.name);
  const extracted = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'));
  assert.equal(extracted.version, packed.version);
  report.tarball.fileHashes = Object.fromEntries(report.tarball.files.map(file => [file,
    crypto.createHash('sha256').update(fs.readFileSync(path.join(installed, file))).digest('hex')]));
  await check('packed source bytes match observed workspace inputs', () => {
    for (const [file, digest] of Object.entries(report.sourceBefore.inputs)) {
      if (file === 'package.json' || file.startsWith('src/')) assert.equal(report.tarball.fileHashes[file], digest, file);
    }
    return { verified: 'package.json and all src files' };
  });
  report.consumer = { directory: consumer, resolved, dependencyLink: fs.readlinkSync(path.join(installed, 'node_modules')),
    exportKeys: Object.keys(api).sort(), declaredNode: extracted.engines?.node };

  await check('package-name require and public API', () => {
    for (const name of ['ISpider', 'BaseSpider', 'CrawlSpider', 'Spider', 'ChromeSpider', 'ListSpider',
      'Scheduler', 'Rule', 'Scrapy', 'Pipeline', 'ChromeDownloaderMiddleware', 'DownloaderMiddleware',
      'DownloaderMiddlewareManager', 'ProxyProviderConfig', 'IProxyProvider', 'StaticProxyProvider',
      'DynamicProxyProvider', 'ProxyManager', 'ExportManager', 'FeedExport', 'Request', 'Response', 'Item',
      'ItemLoader', 'LinkExtractor']) assert.equal(typeof api[name], 'function', name);
    return { resolved, version: extracted.version };
  });

  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!['/one', '/two'].includes(request.url)) {
      response.writeHead(404).end();
      return;
    }
    response.end(`<h1>${request.url === '/one' ? '离线 Alpha' : '离线 Beta'}</h1>`);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const expected = [{ title: '离线 Alpha', route: '/one', processed: true },
    { title: '离线 Beta', route: '/two', processed: true }];
  let items;
  try {
    await check('offline default downloader -> ItemLoader -> pipeline -> start array', async () => {
      class FixtureSpider extends api.Spider {
        start_requests() {
          return ['/one', '/two'].map(route => new api.Request(`${base}${route}`, 'parse', { retry_times: 0 }));
        }
        async *parse(response) {
          const parsed = await api.ItemLoader.parse(response.text, { title: 'h1' }, true, true);
          yield new api.Item({ title: parsed.title, route: new URL(response.url).pathname });
        }
      }
      const scrapy = new api.Scrapy();
      scrapy.spider = new FixtureSpider({ name: 'tarball-consumer' });
      scrapy.addPipeline(item => new api.Item({ ...item, processed: true }));
      try {
        items = plain(await scrapy.start());
        assert.deepEqual(items, expected);
        assert.equal(scrapy.getRunStats().pageCount, 2);
        assert.equal(scrapy.getRunStats().itemCount, 2);
        return { items, stats: scrapy.getRunStats(), downloader: scrapy.setting.middlewares[0].constructor.name };
      } finally {
        await scrapy.release();
      }
    });

    for (const format of ['json', 'jsonl', 'csv']) {
      await check(`FeedExport ${format} matches collected array`, async () => {
        assert.ok(items, 'The start()->array check must succeed before exporting.');
        const output = path.join(artifacts, `fixture.${format}`);
        const exporter = new api.FeedExport(output);
        for (const item of items) exporter.addItem(item);
        await exporter.exportData();
        const content = fs.readFileSync(output, 'utf8');
        if (format === 'json') assert.deepEqual(JSON.parse(content), expected);
        if (format === 'jsonl') assert.deepEqual(content.trim().split('\n').map(line => JSON.parse(line)), expected);
        if (format === 'csv') assert.equal(content.trimEnd(), api.ExportManager.toCSV(expected));
        return { output, bytes: Buffer.byteLength(content), rows: items.length };
      });
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

const watchdog = setTimeout(() => {
  report.fatal = 'Consumer smoke exceeded 30 seconds.';
  finish();
  process.exit(1);
}, 30000);
function finish() {
  fs.writeFileSync(path.join(artifacts, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (outputReport) fs.writeFileSync(outputReport, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ report: path.join(artifacts, 'report.json'), node: report.node,
    tarball: report.tarball, consumer: report.consumer, checks: report.checks, fatal: report.fatal }, null, 2));
}
main().catch(error => {
  report.fatal = error.stack;
  process.exitCode = 1;
}).finally(() => {
  clearTimeout(watchdog);
  finish();
});
