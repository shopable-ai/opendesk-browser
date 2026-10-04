'use strict';

// Standalone product probes, intentionally outside Vitest's *.spec.js discovery.
// node test/devflow-product.cjs [consumer-directory]
// Each probe gets an isolated child and a 5s deadline. Failures remain failures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { sourceState } = require('../scripts/sdk-sync.cjs');

const names = ['pause-resume', 'resume-during-flight', 'concurrent-start', 'stop-derived-work',
  'release-during-flight', 'release-idempotent', 'release-feed-stream', 'borrowed-chrome-page',
  'transport-status-retry', 'processing-is-not-transport-retry', 'pipeline-error-visible',
  'start-json-consistency', 'start-jsonl-consistency', 'start-csv-consistency',
  'empty-json', 'empty-jsonl', 'empty-csv', 'repeat-json-export', 'csv-late-column',
  'sink-error-visible', 'file-error-visible'];

if (process.argv[2] !== '--case') {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf('--output');
  const outputReport = outputIndex < 0 ? null : args[outputIndex + 1];
  assert.ok(outputIndex < 0 || (outputReport && path.isAbsolute(outputReport)), '--output needs an absolute report path');
  if (outputIndex >= 0) args.splice(outputIndex, 2);
  assert.ok(args.length <= 1 && (!args[0] || !args[0].startsWith('--')), 'Usage: node test/devflow-product.cjs [consumer-directory] [--output /absolute/report.json]');
  const consumer = args[0] ? path.resolve(args[0]) : null;
  const sourceBefore = consumer ? null : sourceState(path.resolve(__dirname, '..'));
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'scrapyjs-product-'));
  const results = names.map(name => {
    const child = spawnSync(process.execPath, [__filename, '--case', name], {
      cwd: artifacts, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024,
      env: { ...process.env, SCRAPYJS_CONSUMER_DIR: consumer || '', SCRAPYJS_PROBE_DIR: artifacts },
    });
    const log = path.join(artifacts, `${name}.log`);
    fs.writeFileSync(log, `${child.stdout || ''}${child.stderr || ''}${child.error ? child.error.stack : ''}`);
    const result = { name, status: child.status === 0 && !child.error && child.stdout?.includes(`PROBE PASS ${name}`) ? 'pass' : 'fail',
      exitCode: child.status, signal: child.signal, timeout: child.error?.code === 'ETIMEDOUT', log };
    console.log(`${result.status.toUpperCase()} ${name} (${log})`);
    return result;
  });
  const sourceAfter = consumer ? null : sourceState(path.resolve(__dirname, '..'));
  const sourceStable = consumer ? null : sourceBefore.sourceHash === sourceAfter.sourceHash;
  const report = { node: process.version, execPath: process.execPath, consumer, artifacts, sourceBefore, sourceAfter, sourceStable,
    pass: results.filter(result => result.status === 'pass').length,
    fail: results.filter(result => result.status === 'fail').length, results };
  fs.writeFileSync(path.join(artifacts, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (outputReport) fs.writeFileSync(outputReport, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, results: undefined, report: path.join(artifacts, 'report.json') }, null, 2));
  process.exitCode = report.fail || sourceStable === false ? 1 : 0;
} else {
  const watchdog = setTimeout(() => {
    console.error(`PROBE DEADLINE ${process.argv[3]}: checkpoint did not complete within 4.5 seconds.`);
    process.exit(1);
  }, 4500);
  runCase(process.argv[3]).then(() => console.log(`PROBE PASS ${process.argv[3]}`)).catch(error => {
    console.error(error.stack);
    process.exitCode = 1;
  }).finally(() => clearTimeout(watchdog));
}

async function runCase(name) {
  const consumer = process.env.SCRAPYJS_CONSUMER_DIR;
  const consumerRequire = consumer && createRequire(path.join(consumer, 'entry.cjs'));
  const api = consumerRequire ? consumerRequire('scrapyjs') : require('../src/index.js');
  const { Scrapy, Spider, Request, Response, Item, DownloaderMiddleware, FeedExport, ExportManager } = api;
  const plain = value => JSON.parse(JSON.stringify(value));
  const turn = () => new Promise(resolve => setImmediate(resolve));
  const observe = value => console.log(`OBSERVATION ${JSON.stringify(value)}`);
  const output = format => path.join(process.env.SCRAPYJS_PROBE_DIR, `${name}.${format}`);
  const gate = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
  };

  class Fixture extends DownloaderMiddleware {
    constructor(handler = async () => {}) {
      super();
      this.handler = handler;
      this.calls = [];
      this.active = 0;
      this.maxActive = 0;
      this.closes = 0;
      this.browserCloses = 0;
      this.closedWhileActive = false;
      this.errors = [];
    }
    async process_request(request, spider) {
      this.calls.push(new URL(request.url).pathname);
      this.active += 1;
      this.maxActive = Math.max(this.maxActive, this.active);
      try {
        const status = await this.handler(request, spider);
        return new Response({ url: request.url, status: status || 200, body: 'fixture', request });
      } finally {
        this.active -= 1;
      }
    }
    async process_response(request, response) { return response; }
    async process_exception(request, error) { this.errors.push(error.message); }
    async close() { this.closes += 1; this.closedWhileActive ||= this.active > 0; }
    async closeBrowser() { this.browserCloses += 1; this.closedWhileActive ||= this.active > 0; }
  }
  function make(fixture = new Fixture(), options = {}) {
    class ProbeSpider extends Spider {
      start_requests() {
        return (options.routes || ['/first']).map(route => new Request(`http://fixture.invalid${route}`, 'parse',
          options.requestOptions || { retry_times: 0 }));
      }
      async *parse(response) {
        if (options.parse) yield* options.parse(response);
        else yield new Item({ route: new URL(response.url).pathname });
      }
    }
    const scrapy = new Scrapy({ middlewares: [fixture], RANDOMIZE_DOWNLOAD_DELAY: false,
      RETRY_BACKOFF_BASE: 1, ...options.settings });
    scrapy.spider = new ProbeSpider({ name, output: options.output });
    return scrapy;
  }

  if (name === 'pause-resume') {
    const first = gate();
    const entered = gate();
    const fixture = new Fixture(async () => { if (fixture.calls.length === 2) entered.resolve(); await first.promise; });
    const scrapy = make(fixture, { routes: ['/a', '/b', '/c', '/d'],
      settings: { CONCURRENT_REQUESTS: 2, CONCURRENT_REQUESTS_PER_DOMAIN: 2 } });
    let ownerSettled = false;
    const owner = scrapy.start().then(items => { ownerSettled = true; return items; });
    await entered.promise;
    scrapy.pause();
    first.resolve();
    await turn();
    const paused = { calls: fixture.calls.length, queued: scrapy.scheduler.queue.length,
      items: scrapy.feedExport.data.length, ownerSettled };
    await scrapy.resume();
    await owner;
    observe({ paused, calls: fixture.calls, maxActive: fixture.maxActive, items: plain(scrapy.feedExport.data) });
    assert.deepEqual(paused, { calls: 2, queued: 2, items: 2, ownerSettled: false },
      'Pause must suspend dispatch while retaining the original run owner.');
    assert.equal(fixture.maxActive, 2);
    assert.equal(scrapy.feedExport.data.length, 4);
    await scrapy.release();
  } else if (['resume-during-flight', 'concurrent-start', 'release-during-flight'].includes(name)) {
    const blocked = gate();
    const entered = gate();
    const fixture = new Fixture(async () => { entered.resolve(); await blocked.promise; });
    const scrapy = make(fixture, { routes: name === 'resume-during-flight' ? ['/first', '/second'] : ['/first'] });
    let ownerSettled = false;
    const owner = scrapy.start().then(items => { ownerSettled = true; return items; });
    await entered.promise;
    if (name === 'resume-during-flight') scrapy.pause();
    let settled = false;
    let rejected = false;
    const operation = Promise.resolve(name === 'concurrent-start' ? scrapy.start()
      : name === 'release-during-flight' ? scrapy.release() : scrapy.resume())
      .then(() => { settled = true; }, () => { rejected = true; });
    await turn();
    const premature = settled;
    const prematureOwner = ownerSettled;
    const closedWhileActive = fixture.closedWhileActive;
    blocked.resolve();
    await Promise.all([owner, operation]);
    observe({ premature, prematureOwner, rejected, closedWhileActive, calls: fixture.calls, items: plain(scrapy.feedExport.data) });
    if (name === 'resume-during-flight') {
      // Resume may acknowledge immediately; the original owner still owns completion.
      assert.equal(prematureOwner, false);
      assert.deepEqual(fixture.calls, ['/first', '/second']);
      assert.equal(fixture.maxActive, 1);
    } else assert.equal(premature, false, 'Concurrent start/release must not report completion while its run remains active.');
    if (name === 'concurrent-start') {
      assert.equal(rejected, true, 'A second start must reject while the original owner remains active.');
      assert.deepEqual(fixture.calls, ['/first']);
    }
    if (name === 'release-during-flight') assert.equal(closedWhileActive, false, 'Release closed a resource still used by an active request.');
    await scrapy.release();
  } else if (name === 'stop-derived-work') {
    const blocked = gate();
    const entered = gate();
    const fixture = new Fixture(async request => {
      if (request.url.endsWith('/first')) { entered.resolve(); await blocked.promise; }
    });
    const scrapy = make(fixture, { routes: ['/first', '/queued'], parse: async function* (response) {
      yield new Item({ route: new URL(response.url).pathname });
      if (response.url.endsWith('/first')) yield new Request('http://fixture.invalid/derived', 'parse', { retry_times: 0 });
    } });
    const owner = scrapy.start();
    await entered.promise;
    scrapy.stop();
    blocked.resolve();
    await owner;
    observe({ calls: fixture.calls, items: plain(scrapy.feedExport.data), queued: scrapy.scheduler.queue.length });
    assert.deepEqual(fixture.calls, ['/first'], 'Stop must prevent derived requests from restarting work.');
  } else if (name === 'release-idempotent') {
    const fixture = new Fixture();
    const scrapy = make(fixture);
    await Promise.all([scrapy.release(), scrapy.release()]);
    await scrapy.release();
    observe({ closes: fixture.closes, browserCloses: fixture.browserCloses });
    assert.equal(fixture.closes, 1, 'Repeated/concurrent release must close owned resources exactly once.');
  } else if (name === 'release-feed-stream') {
    const entered = gate(), blocked = gate();
    const file = output('jsonl');
    const scrapy = make(new Fixture(), { output: file, parse: async function* () {
      yield new Item({ id: 1 });
      await scrapy.feedExport.flushBuffer();
      entered.resolve();
      await blocked.promise;
      yield new Item({ id: 2 });
    } });
    const owner = scrapy.start();
    await entered.promise;
    const stream = scrapy.feedExport.stream;
    assert.ok(stream, 'The probe must exercise a genuinely open stream.');
    const releasing = scrapy.release();
    blocked.resolve();
    await Promise.all([owner, releasing]);
    const state = { writableFinished: stream.writableFinished, destroyed: stream.destroyed,
      buffered: scrapy.feedExport.buffer.length, streamRetained: scrapy.feedExport.stream === stream };
    // Cleanup only after recording the release failure; this is not a product fix.
    stream.destroy();
    observe(state);
    assert.ok(state.writableFinished || state.destroyed, 'Release leaves the feed stream open.');
    assert.equal(state.buffered, 0, 'Release retains buffered items.');
    assert.deepEqual(fs.readFileSync(file, 'utf8').trim().split('\n').map(row => JSON.parse(row)), [{ id: 1 }],
      'Release must finish accepted data and exclude items produced after stopping.');
  } else if (name === 'borrowed-chrome-page') {
    let closes = 0;
    let url = 'about:blank';
    const page = { tabId: 123, goto: async target => { url = target; }, waitForNavigation: async () => {},
      url: async () => url, content: async () => 'borrowed fixture', close: async () => { closes += 1; } };
    const middleware = new api.ChromeDownloaderMiddleware({ resolvePage: () => page });
    const scrapy = make(middleware);
    await scrapy.start();
    await scrapy.release();
    await scrapy.release();
    observe({ closes });
    assert.equal(closes, 0, 'Release must not close a borrowed ChromePage.');
  } else if (['transport-status-retry', 'processing-is-not-transport-retry'].includes(name)) {
    let parses = 0;
    const fixture = new Fixture(async () => name === 'transport-status-retry' && fixture.calls.length === 1 ? 503 : 200);
    const scrapy = make(fixture, { requestOptions: { retry_times: 1, errback: () => new Item({ failed: true }) },
      parse: async function* () {
        parses += 1;
        if (name === 'processing-is-not-transport-retry') throw new Error('connect parser bug');
        yield new Item({ ok: true });
      } });
    let rejection;
    try { await scrapy.start(); } catch (error) { rejection = error.message; }
    observe({ calls: fixture.calls, parses, rejection, errors: fixture.errors, items: plain(scrapy.feedExport.data) });
    assert.equal(fixture.calls.length, name === 'transport-status-retry' ? 2 : 1,
      'Only a transport failure may trigger transport retry.');
    assert.equal(parses, 1);
    if (name === 'processing-is-not-transport-retry') assert.equal(rejection, 'connect parser bug');
    else assert.equal(rejection, undefined);
  } else if (name === 'pipeline-error-visible') {
    const scrapy = make();
    scrapy.addPipeline(item => { throw new Error(`invalid item ${item.route}`); });
    let rejection;
    let items;
    try { items = await scrapy.start(); } catch (error) { rejection = error.message; }
    observe({ rejection, items: plain(items || []) });
    assert.ok(rejection, 'Pipeline failure was logged but reported as successful collection.');
  } else if (name.startsWith('start-')) {
    const format = name.split('-')[1];
    const file = output(format);
    const scrapy = make(new Fixture(), { output: file });
    const items = plain(await scrapy.start());
    const content = fs.readFileSync(file, 'utf8');
    const expected = [{ route: '/first' }];
    observe({ items, itemCount: scrapy.getRunStats().itemCount, content });
    if (format === 'json') assert.deepEqual(JSON.parse(content), expected);
    if (format === 'jsonl') assert.deepEqual(content.trim().split('\n').map(line => JSON.parse(line)), expected);
    if (format === 'csv') assert.equal(content.trimEnd(), ExportManager.toCSV(expected));
    assert.ok(Array.isArray(items));
    // File mode may deliberately bound memory and return []; verify delivered counts instead.
    assert.equal(scrapy.getRunStats().itemCount, expected.length);
    if (items.length) assert.deepEqual(items, expected);
    if (scrapy.runResult?.counts) assert.equal(scrapy.runResult.counts.committed, expected.length);
  } else if (name.startsWith('empty-')) {
    const format = name.slice('empty-'.length);
    const file = output(format);
    await new FeedExport(file).exportData();
    const exists = fs.existsSync(file);
    observe({ exists, file });
    assert.ok(exists, 'An empty successful export must create its output artifact.');
    if (format === 'json') assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), []);
  } else if (name === 'repeat-json-export') {
    const file = output('json');
    const exporter = new FeedExport(file);
    exporter.addItem({ id: 1 });
    await exporter.exportData();
    await exporter.exportData();
    let finalizedRejection;
    try { exporter.addItem({ id: 2 }); } catch (error) { finalizedRejection = error.message; }
    if (finalizedRejection) {
      observe({ finalizedRejection, content: fs.readFileSync(file, 'utf8') });
      assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), [{ id: 1 }]);
      return;
    }
    await exporter.exportData();
    const content = fs.readFileSync(file, 'utf8');
    observe({ content });
    assert.deepEqual(JSON.parse(content), [{ id: 2 }], 'Reused exporter must produce a valid independent output.');
  } else if (name === 'csv-late-column') {
    const file = output('csv');
    const exporter = new FeedExport(file);
    const items = [{ id: 1 }, { id: 2, late: 'must survive' }];
    exporter.addItem(items[0]);
    await exporter.flushBuffer();
    let rejection;
    try { exporter.addItem(items[1]); await exporter.exportData(); } catch (error) { rejection = error.message; }
    if (rejection) {
      observe({ rejection });
      assert.match(rejection, /column|field/i, 'Unsupported late CSV columns must be rejected explicitly.');
      return;
    }
    const actual = fs.readFileSync(file, 'utf8').trimEnd();
    const expected = ExportManager.toCSV(items);
    observe({ actual, expected });
    assert.equal(actual, expected, 'Incremental CSV silently loses fields first encountered after the first flush.');
  } else if (['sink-error-visible', 'file-error-visible'].includes(name)) {
    const previousAxios = globalThis.axios;
    globalThis.axios = { request: async () => { throw new Error('offline sink failure'); } };
    const exporter = new FeedExport(name === 'sink-error-visible'
      ? 'http://fixture.invalid/sink' : path.join(process.env.SCRAPYJS_PROBE_DIR, 'missing-parent', 'out.json'));
    exporter.addItem({ id: 1 });
    let rejection;
    try { await exporter.exportData(); } catch (error) { rejection = error.message; }
    finally { globalThis.axios = previousAxios; }
    await turn();
    observe({ rejection, buffered: exporter.buffer.length, returnedWithoutRejection: !rejection });
    assert.ok(rejection, 'Export failure must reject its caller; logging alone reports false success.');
  } else {
    throw new Error(`Unknown probe ${name}`);
  }
}
