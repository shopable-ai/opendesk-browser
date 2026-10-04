const Scheduler = require('./Scheduler');
const FeedExport = require('../exporter/FeedExport');
const ExportManager = require('../exporter/ExportManager');
const DownloaderMiddleware = require('../middleware/DownloaderMiddleware');
const ChromeDownloaderMiddleware = require('../middleware/ChromeDownloaderMiddleware');
const CloseSpider = require('./CloseSpider');
const Request = require('../http/Request');
const Item = require('../item/Item');
const Pipeline = require('./Pipeline');
const { ISpider } = require('./BaseSpider');
const { failure, publicError, secondaryFailures } = require('./RunFailure');
let runSequence = 0;

function resolveDefaultMiddlewares(setting) {
  if (Array.isArray(setting.middlewares) && setting.middlewares.length) return setting.middlewares;
  if (globalThis.page____ChromePage____Object || (typeof globalThis.chrome !== 'undefined' && !ExportManager.getFs())) return [new ChromeDownloaderMiddleware()];
  return [new DownloaderMiddleware()];
}
function createStats() {
  return {
    pageCount: 0, itemCount: 0, startTime: Date.now(), finishTime: null,
    emitted: 0, accepted: 0, filtered: 0, rejected: 0, preacceptFailed: 0,
    discarded: 0, ignored: 0, processingPending: 0,
    get(key) { return this[key] ?? 0; },
    set(key, value) { this[key] = value; },
    inc(key, value = 1) { this[key] = (this[key] || 0) + value; }
  };
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}

class Scrapy {
  constructor(setting = {}) {
    this.setting = {
      CONCURRENT_REQUESTS: 1, CONCURRENT_REQUESTS_PER_DOMAIN: 1,
      DOWNLOAD_DELAY: 0, RANDOMIZE_DOWNLOAD_DELAY: true, RETRY_TIMES: 3,
      RETRY_HTTP_CODES: [408, 429, 500, 502, 503, 504],
      RETRY_BACKOFF_BASE: 500, PROXY_COOLDOWN: 10000,
      ...setting, middlewares: resolveDefaultMiddlewares(setting)
    };
    this.scheduler = new Scheduler(this.setting, this);
    this._spider = null;
    this._run = null;
    this._stopRequested = false;
    this.feedExport = null;
    this.stats = createStats();
    this.closeSpider = new CloseSpider(this);
    this.initializeCloseSpider();
  }
  initializeCloseSpider() {
    this.closeSpider.clearReasons();
    for (const [key, reason] of [['CLOSESPIDER_PAGECOUNT', 'page_count'], ['CLOSESPIDER_ITEMCOUNT', 'item_count'], ['CLOSESPIDER_TIMEOUT', 'timeout']]) {
      if (this.setting[key]) this.closeSpider.addReason(reason, this.setting[key]);
    }
  }
  get spider() { return this._spider; }
  set spider(spider) {
    if (this._run && !this._run.done) throw new Error('Cannot replace spider while a run is active');
    if (!(spider instanceof ISpider)) throw new Error('Spider must be an instance of a class extending ISpider.');
    this._spider = spider;
    spider.scrapy = this;
    if (spider.config.custom_settings) Object.assign(this.setting, spider.config.custom_settings);
    this.feedExport = new FeedExport(spider.config.output || null, spider.config.exportOptions || this.setting.EXPORT_OPTIONS || {});
    this.initializeCloseSpider();
  }

  _isAccepting(run) { return !!(run && run === this._run && !run.done && run.accepting && !run.fatal); }
  _recordFailure(run, error, stage) {
    const f = failure(error, stage);
    if (!run.fatal) run.fatal = f;
    else if (run.fatal !== f && run.fatal.error !== f.error) run.fatal.secondary.push(f);
    run.accepting = false;
    this.scheduler.stop();
    return f;
  }
  _snapshot(run) {
    if (!run) return null;
    const delivery = run.exporter.delivery;
    const counts = {};
    for (const key of ['emitted', 'filtered', 'rejected', 'preacceptFailed', 'discarded', 'accepted', 'processingPending', 'ignored']) counts[key] = run.stats.get(key);
    counts.committed = delivery.committed; counts.pending = delivery.pending; counts.deliveryUnknown = delivery.deliveryUnknown;
    const status = run.fatal ? 'failed' : run.done || run.finishTime
      ? run.stopped && run.stopReason === 'user' ? 'stopped'
        : run.partial || run.stopped || delivery.deliveryUnknown ? 'partial' : 'completed'
      : run.stopped ? 'stopping' : this.scheduler.isPaused ? 'paused' : run.state;
    const describe = f => ({ stage: f.stage, message: f.error.message, code: f.error.code ?? null });
    return freeze({
      runId: run.id, status, pageCount: run.stats.get('pageCount'), itemCount: run.stats.get('itemCount'),
      startTime: run.stats.startTime, finishTime: run.finishTime,
      elapsedMs: (run.finishTime || Date.now()) - run.stats.startTime,
      closeReason: run.closeReason, counts, delivery: { ...delivery },
      metadataPersisted: run.metadataPersisted,
      error: run.fatal ? describe(run.fatal) : null,
      secondaryErrors: run.fatal ? secondaryFailures(run.fatal).map(describe) : [],
      recoveredErrors: run.recovered.map(describe)
    });
  }
  get runResult() { return this._run?.result || this._snapshot(this._run); }
  getRunStats() { return this.runResult || { pageCount: this.stats.get('pageCount'), itemCount: this.stats.get('itemCount'), startTime: this.stats.startTime, finishTime: this.stats.finishTime, elapsedMs: 0, closeReason: this.closeSpider.getClosingReason() }; }
  normalizeRequests(requests) { return requests == null ? [] : typeof requests[Symbol.iterator] === 'function' ? Array.from(requests) : [requests]; }

  start() { return this._beginRun(); }
  _beginRun(seeds) {
    if (!this._spider) return Promise.reject(new Error('Spider is not set.'));
    if (this._run && !this._run.done) return Promise.reject(new Error('A run is already active'));
    this._stopRequested = false;
    this._releasePromise = null;
    const run = {
      id: Date.now().toString(36) + '-' + (++runSequence), stats: createStats(),
      exporter: new FeedExport(this._spider.config.output || null, this._spider.config.exportOptions || this.setting.EXPORT_OPTIONS || {}),
      accepting: true, stopped: false, stopReason: null, partial: false,
      fatal: null, recovered: [], done: false, state: 'running',
      finishTime: null, closeReason: null, metadataPersisted: null
    };
    this._run = run; this.stats = run.stats; this.feedExport = run.exporter;
    this.closeSpider.reset(); this.initializeCloseSpider(); this.scheduler.clear();
    run.exporter.setFailureObserver((error, stage) => this._recordFailure(run, error, stage));
    run.owner = this._executeRun(run, seeds);
    run.owner.catch(() => {});
    return run.owner;
  }

  async _executeRun(run, seeds) {
    try {
      await this._validateMetadataTarget(run);
      const initial = seeds ?? this._spider.start_requests();
      for await (const request of this.scheduler.iterateResults(initial)) {
        if (request instanceof Request) this.scheduler.add_request(request, run);
        else run.stats.inc('ignored');
      }
      await this.scheduler.run(this._spider, run);
    } catch (error) { this._recordFailure(run, error, 'processing'); }
    run.accepting = false; run.state = 'finishing';
    if (run.fatal) {
      try { await run.exporter.abort(); } catch (error) { this._recordFailure(run, error, 'cleanup'); }
    } else {
      try { await run.exporter.exportData(); }
      catch (error) {
        this._recordFailure(run, error, run.exporter.failureStage);
        for (const secondary of run.exporter.cleanupErrors) this._recordFailure(run, secondary, 'cleanup');
      }
    }
    try { await this.scheduler.closeResources(); } catch (error) { this._recordFailure(run, error, 'cleanup'); }
    run.finishTime = Date.now(); run.stats.set('finishTime', run.finishTime);
    try { await this.persistRunStats(run); } catch (error) { this._recordFailure(run, error, 'cleanup'); }
    run.done = true;
    run.result = this._snapshot(run);
    if (run.fatal) throw publicError(run.fatal);
    return run.exporter.data.slice();
  }

  async _validateMetadataTarget(run) {
    const metadata = this.setting.RUN_STATS_PATH || this._spider?.config?.runStatsPath;
    const output = run.exporter.outputPath;
    if (!metadata || !output || run.exporter.format === 'http' || !ExportManager.getFs()) return;
    const fs = ExportManager.getFs(); const path = require('path');
    const canonical = async name => {
      const full = path.resolve(name);
      try { return path.join(await fs.promises.realpath(path.dirname(full)), path.basename(full)); }
      catch (error) { if (error.code === 'ENOENT') return full; throw error; }
    };
    if (await canonical(metadata) === await canonical(output)) {
      run.metadataBlocked = true; run.metadataPersisted = false;
      throw new Error('Run stats path must differ from the item output path');
    }
  }

  async persistRunStats(run = this._run) {
    const output = this.setting.RUN_STATS_PATH || this._spider?.config?.runStatsPath;
    if (!output || run.metadataBlocked) return;
    run.metadataPersisted = false;
    if (!ExportManager.getFs()) throw new Error('Run stats persistence requires an explicit Node filesystem capability');
    await ExportManager.writeFileNode(output, JSON.stringify({ ...this._snapshot(run), metadataPersisted: true }, null, 2));
    run.metadataPersisted = true;
  }

  async crawl(request) {
    if (!(request instanceof Request)) throw new Error('Scrapy.crawl() expects a Request instance.');
    if (this._stopRequested || this._run?.stopped || (this._run && !this._run.done && !this._run.accepting)) throw new Error('Cannot crawl after stop or while the run is stopping');
    if (!this._run || this._run.done) return this._beginRun([request]);
    this.scheduler.add_request(request, this._run);
    // Admission acknowledgement only: safe when awaited from a callback.
    return this._run.exporter.data.slice();
  }

  shouldClose(pageBoundary = true) {
    const run = this._run;
    if (!run || run.done) return this.closeSpider.check(this._spider);
    if (this.closeSpider.check(this._spider, pageBoundary)) {
      run.closeReason = this.closeSpider.getClosingReason();
      if (run.closeReason === 'closespider_pagecount') {
        // Page limits close request admission, while already admitted pages
        // finish extracting their records. User stop/fatal/item/time limits
        // still close the item gate immediately.
        run.stopped = true; run.stopReason ||= run.closeReason;
        this.scheduler.closeAdmission();
        return !run.accepting;
      }
      this._stopRun(run, run.closeReason);
      return true;
    }
    return !run.accepting;
  }
  _stopRun(run, reason) {
    run.stopped = true; run.stopReason ||= reason; run.accepting = false;
    this.scheduler.stop();
  }

  async addItemToFeedExport(item, run = this._run) {
    if (!run || run.done || run !== this._run) return false;
    run.stats.inc('emitted'); run.stats.inc('processingPending');
    let classified = false;
    const classify = kind => { run.stats.inc('processingPending', -1); run.stats.inc(kind); classified = true; };
    try {
      if (!this._isAccepting(run)) { classify('discarded'); return false; }
      let value = item;
      if (this._spider.config.itemSchema) value = new Item(Item.applySchema(value, this._spider.config.itemSchema));
      if (this._spider.pipeline) value = await this._spider.pipeline.process_item(value, this._spider, () => this._isAccepting(run));
      if (!this._isAccepting(run) || value === Pipeline.DISCARDED) { classify('discarded'); return false; }
      if (value == null) { classify('filtered'); return false; }
      if (this._spider.config.itemSchema) value = new Item(Item.applySchema(value, this._spider.config.itemSchema));
      try {
        run.exporter.addItem(value);
      } catch (error) { throw failure(error, 'delivery'); }
      classify('accepted'); run.stats.inc('itemCount');
      if (run.exporter.shouldFlushBuffer()) {
        try { await run.exporter.flushBuffer(); } catch (error) { throw failure(error, 'delivery'); }
      }
      this.shouldClose(false);
      return true;
    } catch (error) {
      if (!classified) classify('preacceptFailed');
      throw failure(error, 'processing');
    }
  }

  pause() {
    if (this._run && !this._run.done && this._run.accepting) this.scheduler.pause();
    return Promise.resolve({ runId: this._run?.id ?? null, state: this.scheduler.isPaused ? 'paused' : 'idle' });
  }
  resume() {
    if (this._run && !this._run.done && this._run.accepting) this.scheduler.resume();
    return Promise.resolve({ runId: this._run?.id ?? null, state: this._run?.stopped ? 'stopping' : this._run && !this._run.done ? 'running' : 'idle' });
  }
  stop() {
    this._stopRequested = true;
    if (this._run && !this._run.done) this._stopRun(this._run, 'user');
    else this.scheduler.stop();
    return Promise.resolve({ runId: this._run?.id ?? null, state: this._run && !this._run.done ? 'stopping' : 'stopped' });
  }
  release() {
    if (!this._releasePromise) {
      this.stop();
      const owner = this._run && !this._run.done ? this._run.owner : null;
      this._releasePromise = owner ? owner.then(() => undefined) : this.scheduler.closeResources();
      this._releasePromise.catch(() => {});
    }
    return this._releasePromise;
  }
  addPipeline(codeInput) { this._spider.pipeline.addPipeline(codeInput); }
  clearPipeline() { this._spider.pipeline.clear(); }
  removePipeline(pipelineFunc) { this._spider.pipeline.removePipeline(pipelineFunc); }
}
module.exports = Scrapy;
