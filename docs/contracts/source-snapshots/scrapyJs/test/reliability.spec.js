const Scrapy = require('../src/core/Scrapy');
const Scheduler = require('../src/core/Scheduler');
const Request = require('../src/http/Request');
const Response = require('../src/http/Response');
const Item = require('../src/item/Item');
const Pipeline = require('../src/core/Pipeline');
const ExportManager = require('../src/exporter/ExportManager');
const { BaseSpider } = require('../src/core/BaseSpider');
const fs = require('fs');
const os = require('os');
const path = require('path');

function gate() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
const turn = () => new Promise(resolve => setImmediate(resolve));
async function until(fn) { for (let i = 0; i < 100; i++) { if (fn()) return; await turn(); } throw new Error('Expected checkpoint was not reached'); }
function setup(parse, options = {}, config = {}, requests = null) {
  const calls = [];
  const middleware = {
    async process_request(request) { calls.push(request.url); return new Response({ url: request.url, request, body: 'ok', status: 200 }); },
    async process_response(request, response) { return response; },
    async process_exception() {},
    isRetryableException(error) { return error.code === 'ETIMEDOUT'; },
    isRetryableStatus(status) { return status === 500; },
  };
  class TestSpider extends BaseSpider {
    start_requests() { return requests || [new Request('https://a.local/1')]; }
    parse(...args) { return parse.apply(this, args); }
  }
  const scrapy = new Scrapy({ middlewares: [middleware], RETRY_BACKOFF_BASE: 0, ...options });
  scrapy.spider = new TestSpider(config);
  return { scrapy, middleware, calls };
}
function reconcile(result) {
  const c = result.counts;
  expect(c.emitted).toBe(c.filtered + c.rejected + c.preacceptFailed + c.discarded + c.accepted + c.processingPending);
  expect(c.accepted).toBe(c.committed + c.pending + c.deliveryUnknown);
  expect(c.processingPending).toBe(0);
}
afterEach(() => vi.restoreAllMocks());

describe('failure boundaries', () => {
  for (const where of ['parse', 'iterator', 'pipeline', 'schema', 'errback']) {
    it(`${where} ETIMEDOUT rejects original processing error without downloading again`, async () => {
      const original = Object.assign(new Error(where), { code: 'ETIMEDOUT' });
      const { scrapy, middleware, calls } = setup(function () {
        if (where === 'parse') throw original;
        return (async function* () { yield new Item({ id: 1 }); if (where === 'iterator') throw original; })();
      }, { RETRY_TIMES: 1 }, where === 'schema' ? { itemSchema: { validators: { id() { throw original; } } } } : {},
      where === 'errback' ? [new Request('https://a.local/1', null, { retries: 0, errback() { throw original; } })] : null);
      if (where === 'pipeline') scrapy.spider.pipeline.addPipeline(item => { throw original; });
      if (where === 'errback') middleware.process_request = async request => { calls.push(request.url); throw new Error('download failed'); };
      await expect(scrapy.start()).rejects.toBe(original);
      expect(original.stage).toBe('processing');
      expect(calls).toHaveLength(1);
      expect(scrapy.runResult.status).toBe('failed');
      reconcile(scrapy.runResult);
    });
  }

  it('pipeline first failure stops the next handler; null and undefined keep filtering', async () => {
    const p = new Pipeline(); const error = new Error('broken'); let next = 0;
    p.addPipeline(item => { throw error; }); p.addPipeline(item => { next++; return item; });
    await expect(p.process_item(new Item(), {})).rejects.toBe(error); expect(next).toBe(0);
    for (const value of [null, undefined]) {
      const { scrapy } = setup(async function* () { yield new Item({ id: 1 }); });
      scrapy.spider.pipeline.addPipeline(item => value);
      expect(await scrapy.start()).toEqual([]); expect(scrapy.runResult.counts.filtered).toBe(1); reconcile(scrapy.runResult);
    }
  });

  for (const mode of ['status', 'exception']) {
    it(`${mode} retry exhaustion fails without errback and consumes errback once`, async () => {
      for (const withErrback of [false, true]) {
        let parsed = 0; let handled = 0;
        const req = new Request('https://a.local/1', null, { retry_times: 1,
          errback: withErrback ? async function* () { handled++; yield Promise.resolve(new Item({ recovery: true })); } : null });
        const { scrapy, middleware, calls } = setup(async function* () { parsed++; yield new Item(); }, {}, {}, [req]);
        middleware.process_request = async request => { calls.push(request.url); if (mode === 'exception') throw Object.assign(new Error('transport'), { code: 'ETIMEDOUT' }); return new Response({ url: request.url, request, status: 500 }); };
        if (withErrback) { expect(await scrapy.start()).toEqual([new Item({ recovery: true })]); expect(scrapy.runResult.status).toBe('partial'); }
        else { await expect(scrapy.start()).rejects.toMatchObject({ stage: 'download' }); expect(scrapy.runResult.status).toBe('failed'); }
        expect(calls).toHaveLength(2); expect(parsed).toBe(0); expect(handled).toBe(withErrback ? 1 : 0); reconcile(scrapy.runResult);
      }
    });
  }

  it('nonretryable 404 retains parse semantics', async () => {
    const { scrapy, middleware } = setup(async function* (response) { yield new Item({ status: response.status }); });
    middleware.process_response = async (r, response) => { response.status = 404; return response; };
    expect(await scrapy.start()).toEqual([new Item({ status: 404 })]);
  });

  it('schema checks pipeline output before accepting it', async () => {
    const { scrapy } = setup(async function* () { yield new Item({ id: 1 }); }, {}, { itemSchema: { required: ['id'] } });
    scrapy.spider.pipeline.addPipeline(item => new Item({ other: 1 }));
    await expect(scrapy.start()).rejects.toMatchObject({ stage: 'processing' });
    expect(scrapy.runResult.counts).toMatchObject({ accepted: 0, preacceptFailed: 1 }); reconcile(scrapy.runResult);
  });

  it('sink ETIMEDOUT is delivery failure; metadata failure does not undo confirmed data', async () => {
    const error = Object.assign(new Error('sink'), { code: 'ETIMEDOUT' });
    const sink = vi.spyOn(ExportManager, 'postJSON').mockRejectedValue(error);
    const { scrapy, calls } = setup(async function* () { yield new Item({ id: 1 }); }, {}, { output: 'https://sink.local/post' });
    await expect(scrapy.start()).rejects.toBe(error); expect(error.stage).toBe('delivery'); expect(calls).toHaveLength(1); expect(sink).toHaveBeenCalledTimes(1);
    expect(scrapy.runResult.counts.deliveryUnknown).toBe(1); reconcile(scrapy.runResult);
    sink.mockRestore();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scrapy-meta-'));
    try {
      const failed = new Error('stats storage');
      vi.spyOn(ExportManager, 'writeFileNode').mockRejectedValue(failed);
      const second = setup(async function* () { yield new Item({ id: 1 }); }, { RUN_STATS_PATH: path.join(tmp, 'stats.json') }, { output: path.join(tmp, 'items.json') });
      await expect(second.scrapy.start()).rejects.toBe(failed);
      expect(JSON.parse(fs.readFileSync(path.join(tmp, 'items.json')))).toEqual([{ id: 1 }]);
      expect(second.scrapy.runResult.counts.committed).toBe(1); expect(second.scrapy.runResult.metadataPersisted).toBe(false); reconcile(second.scrapy.runResult);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  it('latches first fatal, drains other work, and retains cleanup as secondary', async () => {
    const pending = gate(); const primary = new Error('parse'); const secondary = new Error('cleanup'); let entered = 0;
    const { scrapy, middleware } = setup(async function* (response) {
      entered++; if (response.url.includes('a.local')) { await until(() => entered === 2); throw primary; }
      await pending.promise; yield new Item({ id: 2 });
    }, { CONCURRENT_REQUESTS: 2 }, {}, [new Request('https://a.local/1'), new Request('https://b.local/2')]);
    middleware.closeBrowser = async () => { throw secondary; };
    let settled = false; const outcome = scrapy.start().then(() => null, error => { settled = true; return error; });
    await until(() => entered === 2); await turn(); await turn(); expect(settled).toBe(false);
    pending.resolve(); expect(await outcome).toBe(primary); expect(primary.secondaryErrors).toContain(secondary);
    expect(scrapy.scheduler.isRunning).toBe(false); for (const domain of scrapy.scheduler.domainState.values()) expect(domain.activeCount).toBe(0);
    reconcile(scrapy.runResult);
  });
});

describe('run ownership and control', () => {
  it('rejects second start and spider replacement before reset, returns stable snapshots per run', async () => {
    const pending = gate(); let entered = false;
    const { scrapy, calls } = setup(async function* () { entered = true; await pending.promise; yield new Item({ id: 1 }); });
    const owner = scrapy.start(); await until(() => entered);
    try { await expect(scrapy.start()).rejects.toThrow(/active|running/i); expect(() => { scrapy.spider = new BaseSpider(); }).toThrow(/active|running/i); }
    finally { pending.resolve(); }
    const first = await owner; const result = scrapy.runResult;
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.counts)).toBe(true);
    expect(calls).toHaveLength(1); expect(await scrapy.start()).toHaveLength(1); expect(first).toHaveLength(1); expect(scrapy.runResult.runId).not.toBe(result.runId); reconcile(scrapy.runResult);
  });

  it('pause keeps owner pending; resume continues that same run without returning owner', async () => {
    const pending = gate(); let entered = false;
    const { scrapy, calls } = setup(async function* (response) { if (response.url.endsWith('/1')) { entered = true; await pending.promise; } yield new Item({ url: response.url }); }, {}, {}, [new Request('https://a.local/1'), new Request('https://a.local/2')]);
    let settled = false; const owner = scrapy.start().then(v => { settled = true; return v; });
    await until(() => entered); const runId = scrapy.runResult.runId; await scrapy.pause(); pending.resolve(); await turn(); await turn();
    expect(settled).toBe(false); expect(scrapy.runResult.finishTime).toBeNull(); expect(calls).toHaveLength(1);
    expect(await scrapy.resume()).toMatchObject({ runId }); expect(await owner).toHaveLength(2); expect(scrapy.runResult.runId).toBe(runId);
  });

  it('stop during pipeline blocks later handlers, retries, derived requests, items and crawl', async () => {
    const pending = gate(); let entered = false; let next = 0;
    const { scrapy, calls } = setup(async function* () { yield new Item({ id: 1 }); yield new Request('https://a.local/2'); yield new Item({ id: 2 }); });
    scrapy.spider.pipeline.addPipeline(async item => { entered = true; await pending.promise; return item; });
    scrapy.spider.pipeline.addPipeline(item => { next++; return item; });
    const owner = scrapy.start(); await until(() => entered);
    expect(await scrapy.stop()).toMatchObject({ state: 'stopping' });
    await expect(scrapy.crawl(new Request('https://a.local/3'))).rejects.toThrow(/stop/i);
    pending.resolve(); expect(await owner).toEqual([]); expect(next).toBe(0); expect(calls).toHaveLength(1);
    expect(scrapy.runResult.status).toBe('stopped'); expect(scrapy.runResult.counts.discarded).toBe(1); reconcile(scrapy.runResult);
  });

  it('callback can await pause/resume/stop without self-waiting', async () => {
    const { scrapy } = setup(async function* (response, owner) { await owner.pause(); await owner.resume(); yield new Item({ id: 1 }); await owner.stop(); yield new Item({ id: 2 }); });
    expect(await scrapy.start()).toEqual([new Item({ id: 1 })]); expect(scrapy.runResult.status).toBe('stopped'); reconcile(scrapy.runResult);
  });

  it('stop wakes paused wait, release is idempotent and waits for the active owner', async () => {
    const pending = gate(); let entered = false; let closes = 0;
    const { scrapy, middleware } = setup(async function* () { entered = true; await pending.promise; yield new Item({ id: 1 }); });
    middleware.close = async () => { closes++; };
    const owner = scrapy.start(); await until(() => entered); scrapy.pause();
    let released = false; const release = scrapy.release().then(() => { released = true; }); const second = scrapy.release();
    await turn(); expect(released).toBe(false); pending.resolve(); await owner; await release; await second;
    expect(closes).toBe(1); expect(scrapy.runResult.status).toBe('stopped');
    expect(await scrapy.start()).toHaveLength(1); expect(closes).toBe(2);
  });

  it('idle crawl owns a complete run, but stopped crawl cannot reopen it', async () => {
    const { scrapy, calls } = setup(async function* () { yield new Item({ id: 1 }); });
    expect(await scrapy.crawl(new Request('https://a.local/custom'))).toHaveLength(1);
    expect(calls).toEqual(['https://a.local/custom']); expect(scrapy.runResult.status).toBe('completed');
    await scrapy.stop(); await expect(scrapy.crawl(new Request('https://a.local/no'))).rejects.toThrow(/stop/i);
    expect(await scrapy.start()).toHaveLength(1);
  });
});

describe('eligible scheduler selection', () => {
  it('orders ready requests by priority then enqueue FIFO regardless of construction time', () => {
    const scheduler = new Scheduler({}, {}); const spider = { scrapy: { setting: {} } };
    const low = new Request('https://a.local/low', null, { priority: 1, _availableAt: 0 });
    const high = new Request('https://a.local/high', null, { priority: 9, _availableAt: 1 });
    scheduler.add_request(low); scheduler.add_request(high);
    expect(scheduler.queue[scheduler.findRunnableRequestIndex(spider)]).toBe(high);
    scheduler.clear();
    const old = new Request('https://a.local/old', null, { _availableAt: 0 });
    const recent = new Request('https://a.local/recent', null, { _availableAt: 1 });
    scheduler.add_request(recent); scheduler.add_request(old);
    expect(scheduler.queue[scheduler.findRunnableRequestIndex(spider)]).toBe(recent);
  });
  it('future priority and saturated domains cannot block other eligible requests', () => {
    const scheduler = new Scheduler({}, {}); const spider = { scrapy: { setting: { CONCURRENT_REQUESTS_PER_DOMAIN: 1 } } };
    const blocked = new Request('https://a.local/busy', null, { priority: 99 });
    const future = new Request('https://c.local/future', null, { priority: 999, _availableAt: Date.now() + 10000 });
    const ready = new Request('https://b.local/ready');
    scheduler.add_request(blocked); scheduler.add_request(future); scheduler.add_request(ready);
    scheduler.reserveSlot(blocked, spider);
    expect(scheduler.queue[scheduler.findRunnableRequestIndex(spider)]).toBe(ready);
  });
});
