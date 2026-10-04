const DownloaderMiddlewareManager = require('../middleware/DownloaderMiddlewareManager');
const Request = require('../http/Request');
const Item = require('../item/Item');
const ChromeDownloaderMiddleware = require('../middleware/ChromeDownloaderMiddleware');
const { failure } = require('./RunFailure');

function hashString(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

class Scheduler {
  constructor(config = {}, scrapyInstance) {
    this.queue = [];
    this.downloaderMiddlewareManager = new DownloaderMiddlewareManager(config.middlewares);
    this.isPaused = false;
    this.isRunning = false;
    this.scrapyInstance = scrapyInstance;
    this.seenURLs = new Set();
    this.domainState = new Map();
    this.config = config;
    this._stopping = false;
    this._wakeVersion = 0;
    this._waiter = null;
    this._timer = null;
    this._closePromise = null;
  }

  canonicalizeUrl(url) {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      return parsed.toString();
    } catch {
      return String(url || '');
    }
  }

  serializeBody(body) {
    if (body == null) {
      return '';
    }

    if (typeof body === 'string') {
      return body;
    }

    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(body)) {
      return body.toString('base64');
    }

    if (typeof body === 'object') {
      return JSON.stringify(body);
    }

    return String(body);
  }

  getRequestDomain(request) {
    try {
      return new URL(request.url).hostname;
    } catch {
      return 'default';
    }
  }

  getRequestFingerprint(request) {
    const method = String(request.method || 'GET').toUpperCase();
    const body = this.serializeBody(request.body);
    const bodyHash = hashString(body);
    return `${method}:${this.canonicalizeUrl(request.url)}:${bodyHash}`;
  }

  sortQueue() {
    // Stable Array.sort (Node >=18 / current Chrome) preserves enqueue FIFO
    // among equal priorities, including repeated occurrences of one Request.
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  getDelayMs(request, spider) {
    const requestDelay = Number(request.download_delay || 0);
    const spiderDelay = Number(spider?.config?.download_delay ?? spider?.config?.delay ?? 0);
    const globalDelay = Number(spider?.scrapy?.setting?.DOWNLOAD_DELAY || 0);
    const baseDelay = Math.max(requestDelay, spiderDelay, globalDelay, 0);
    const shouldJitter = spider?.scrapy?.setting?.RANDOMIZE_DOWNLOAD_DELAY !== false;
    if (!baseDelay) {
      return 0;
    }
    if (!shouldJitter) {
      return baseDelay;
    }
    return Math.round(baseDelay * (0.5 + Math.random()));
  }

  getGlobalConcurrency(spider) {
    const requested = Number(spider?.scrapy?.setting?.CONCURRENT_REQUESTS ?? this.config.CONCURRENT_REQUESTS ?? 1);
    const sharedPage = this.downloaderMiddlewareManager.middlewares.some(m => m instanceof ChromeDownloaderMiddleware || m.usesSharedPage === true);
    return sharedPage ? 1 : Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 1);
  }

  getDomainConcurrency(spider) {
    return Math.max(1, Number(spider?.scrapy?.setting?.CONCURRENT_REQUESTS_PER_DOMAIN ?? this.config.CONCURRENT_REQUESTS_PER_DOMAIN ?? 1) || 1);
  }

  getDomainEntry(domain) {
    const existing = this.domainState.get(domain);
    if (existing) {
      return existing;
    }

    const entry = { nextAvailableAt: 0, activeCount: 0 };
    this.domainState.set(domain, entry);
    return entry;
  }

  canStartRequest(request, spider, now = Date.now()) {
    const domainEntry = this.getDomainEntry(this.getRequestDomain(request));
    if (domainEntry.activeCount >= this.getDomainConcurrency(spider)) {
      return false;
    }

    return Number(request._availableAt || 0) <= now && domainEntry.nextAvailableAt <= now;
  }

  findRunnableRequestIndex(spider) {
    const now = Date.now();
    for (let index = 0; index < this.queue.length; index += 1) {
      if (this.canStartRequest(this.queue[index], spider, now)) {
        return index;
      }
    }
    return -1;
  }

  getNextAvailabilityDelay(spider) {
    const now = Date.now();
    let next = Infinity;
    for (const request of this.queue) {
      const domain = this.getDomainEntry(this.getRequestDomain(request));
      if (domain.activeCount >= this.getDomainConcurrency(spider)) continue;
      next = Math.min(next, Math.max(Number(request._availableAt || 0), domain.nextAvailableAt) - now);
    }
    return Number.isFinite(next) ? Math.max(next, 0) : null;
  }

  reserveSlot(request, spider) {
    const domainEntry = this.getDomainEntry(this.getRequestDomain(request));
    domainEntry.activeCount += 1;
    domainEntry.nextAvailableAt = Date.now() + this.getDelayMs(request, spider);
  }

  releaseSlot(request) {
    const domainEntry = this.getDomainEntry(this.getRequestDomain(request));
    domainEntry.activeCount = Math.max(0, domainEntry.activeCount - 1);
  }

  add_request(request, run = this.scrapyInstance?._run) {
    if (this._stopping || this._admissionClosed || (run && !this.scrapyInstance._isAccepting(run))) return false;
    if (!(request instanceof Request)) {
      throw new Error('Scheduler only accepts Request instances.');
    }

    if (request.dont_filter) {
      this.queue.push(request);
      this.sortQueue();
      this._wake();
      return true;
    }

    const fingerprint = this.getRequestFingerprint(request);
    if (this.seenURLs.has(fingerprint)) {
      console.log(`Duplicate URL skipped: ${request.url}`);
      return false;
    }

    this.queue.push(request);
    this.seenURLs.add(fingerprint);
    this.sortQueue();
    this._wake();
    return true;
  }

  resolveCallback(request, spider) {
    if (!request?.callback) {
      return null;
    }

    if (typeof request.callback === 'string') {
      const callback = spider[request.callback];
      if (typeof callback !== 'function') {
        throw new Error(`Callback "${request.callback}" is not defined on spider ${spider.name}.`);
      }
      return callback.bind(spider);
    }

    if (typeof request.callback === 'function') {
      return request.callback.bind(spider);
    }

    throw new Error('Request callback must be a function or spider method name.');
  }

  async *iterateResults(result) {
    if (result == null) return;
    if (typeof result.then === 'function') { yield* this.iterateResults(await result); return; }
    if (typeof result !== 'string' && (typeof result[Symbol.asyncIterator] === 'function' || typeof result[Symbol.iterator] === 'function')) {
      for await (const value of result) yield* this.iterateResults(value);
      return;
    }
    yield result;
  }

  async handleResult(result, run) {
    if (result instanceof Request) { this.add_request(result, run); return; }
    if (result instanceof Item) { await this.scrapyInstance.addItemToFeedExport(result, run); return; }
    run?.stats.inc('ignored');
  }

  getRetryTimes(request, spider) {
    const raw = request.retry_times ?? request.retries ?? spider?.config?.retry_times
      ?? spider?.config?.retries ?? spider?.scrapy?.setting?.RETRY_TIMES ?? this.config.RETRY_TIMES ?? 0;
    return Request.normalizeRetryTimes(raw, 'retry count');
  }

  validateConfiguration(spider) {
    for (const [object, keys] of [[spider?.config, ['retries', 'retry_times']], [spider?.scrapy?.setting || this.config, ['RETRY_TIMES']]]) {
      for (const key of keys) if (object && Object.prototype.hasOwnProperty.call(object, key)) Request.normalizeRetryTimes(object[key], key);
    }
  }

  getRetryDelay(request, spider) {
    const base = Number(spider?.scrapy?.setting?.RETRY_BACKOFF_BASE ?? this.config.RETRY_BACKOFF_BASE ?? 500);
    const count = Number(request._retryCount || 0);
    const jitter = base > 0 ? Math.floor(Math.random() * Math.max(100, base)) : 0;
    return base * Math.pow(2, Math.max(count - 1, 0)) + jitter;
  }

  cloneRequest(request, overrides = {}) { return request.clone(overrides); }

  buildRetryRequest(request, spider, reason) {
    const retryCount = Number(request._retryCount || 0) + 1;
    if (retryCount > this.getRetryTimes(request, spider)) {
      return null;
    }

    return this.cloneRequest(request, {
      _retryCount: retryCount,
      _retryRequest: true,
      dont_filter: true,
      priority: request.priority,
      meta: {
        ...(request.meta || {}),
        retry_reason: reason,
      },
      _availableAt: Date.now() + this.getRetryDelay(request, spider),
    });
  }

  async handleErrback(request, spider, exception, run) {
    if (!request?.errback) {
      return false;
    }

    const errback = typeof request.errback === 'string'
      ? spider[request.errback]
      : request.errback;

    if (typeof errback !== 'function') {
      throw new Error(`Errback "${request.errback}" is not defined on spider ${spider.name}.`);
    }

    const result = errback.call(spider, exception, this.scrapyInstance);
    for await (const value of this.iterateResults(result)) {
      await this.handleResult(value, run);
      if (!this._accepting(run)) break;
    }

    if (run) { run.partial = true; run.recovered.push(failure(exception, 'download')); }
    return true;
  }

  async resolveExecutionResult(request, response, spider) {
    const callback = this.resolveCallback(request, spider);
    if (!callback) {
      return spider.parse(response, this.scrapyInstance);
    }

    const callbackResult = callback(response, this.scrapyInstance);
    if (callbackResult == null) {
      return spider.parse(response, this.scrapyInstance);
    }

    if (
      typeof callbackResult.then === 'function' &&
      typeof callbackResult[Symbol.asyncIterator] !== 'function' &&
      typeof callbackResult[Symbol.iterator] !== 'function'
    ) {
      const awaitedResult = await callbackResult;
      return awaitedResult == null
        ? spider.parse(response, this.scrapyInstance)
        : awaitedResult;
    }

    return callbackResult;
  }

  _accepting(run) {
    return !this._stopping && (!run || this.scrapyInstance._isAccepting(run));
  }

  async _downloadFailure(request, spider, error, run, retryable) {
    const primary = failure(error, 'download');
    try { await this.downloaderMiddlewareManager.process_exception(request, primary.error, spider); }
    catch (hookError) { primary.secondary.push(failure(hookError, 'processing')); throw primary; }
    if (!this._accepting(run)) {
      // A control stop suppresses a new retry. A fatal run still records the
      // independent failure of an already launched download during its drain.
      if (run?.fatal) throw primary;
      return;
    }
    const retry = retryable && !this._admissionClosed ? this.buildRetryRequest(request, spider, primary.error.code || primary.error.message) : null;
    if (retry) { this.add_request(retry, run); return; }
    try {
      if (!await this.handleErrback(request, spider, primary.error, run)) throw primary;
    } catch (errbackError) {
      if (errbackError === primary) throw primary;
      const f = failure(errbackError, 'processing');
      f.secondary.push(primary);
      throw f;
    }
  }

  async execute_request(request, spider, run) {
    if (!this._accepting(run)) return;
    this.reserveSlot(request, spider);
    try {
      let response;
      const downloader = this.downloaderMiddlewareManager.middlewares.find(m => typeof m.isRetryableException === 'function');
      try {
        response = await this.downloaderMiddlewareManager.process_request(request, spider);
        if (!this._accepting(run)) return;
        response = await this.downloaderMiddlewareManager.process_response(request, response, spider);
      } catch (error) {
        await this._downloadFailure(request, spider, error, run, downloader?.isRetryableException(error) === true);
        return;
      }
      if (!response || !this._accepting(run)) return;
      const statusChecker = this.downloaderMiddlewareManager.middlewares.find(m => typeof m.isRetryableStatus === 'function');
      if (statusChecker?.isRetryableStatus(response.status, request, spider)) {
        const error = new Error('Retryable HTTP status exhausted: ' + response.status);
        error.status = response.status; error.response = response; error.request = request;
        await this._downloadFailure(request, spider, error, run, true);
        return;
      }
      this.scrapyInstance.stats.inc('pageCount');
      try {
        const result = await this.resolveExecutionResult(request, response, spider);
        for await (const value of this.iterateResults(result)) {
          await this.handleResult(value, run);
          if (this.scrapyInstance.shouldClose(false)) break;
        }
        this.scrapyInstance.shouldClose(true);
      } catch (error) { throw failure(error, 'processing'); }
    } finally {
      this.releaseSlot(request);
      this._wake();
    }
  }

  _wake() {
    this._wakeVersion++;
    this._waiter?.();
  }
  _waitForChange(version, waitMs) {
    if (version !== this._wakeVersion) return Promise.resolve();
    return new Promise(resolve => {
      const done = () => {
        if (this._timer !== null) { clearTimeout(this._timer); this._timer = null; }
        if (this._waiter === done) this._waiter = null;
        resolve();
      };
      this._waiter = done;
      if (version !== this._wakeVersion) { done(); return; }
      if (waitMs !== null) this._timer = setTimeout(done, Math.max(waitMs, 0));
    });
  }
  run(spider, run = this.scrapyInstance?._run) {
    if (this.isRunning) return Promise.reject(new Error('Scheduler run is already active'));
    this.isRunning = true;
    this._runPromise = this._runLoop(spider, run);
    return this._runPromise;
  }
  async _runLoop(spider, run) {
    const inFlight = new Set();
    this._inFlight = inFlight;
    let fatal = null;
    const latch = error => {
      const f = failure(error, 'processing');
      if (run) {
        this.scrapyInstance._recordFailure(run, f, f.stage);
        fatal ||= run.fatal;
      } else {
        if (!fatal) fatal = f;
        else if (fatal !== f && fatal.error !== f.error) fatal.secondary.push(f);
        this.stop();
      }
    };
    const launch = request => {
      const task = this.execute_request(request, spider, run).catch(latch).finally(() => { inFlight.delete(task); this._wake(); });
      inFlight.add(task);
    };
    try {
      this.validateConfiguration(spider);
      while (this._accepting(run) && (this.isPaused || this.queue.length || inFlight.size)) {
        const version = this._wakeVersion;
        if (this.scrapyInstance.shouldClose(false)) break;
        const pageLimit = Number(spider?.scrapy?.setting?.CLOSESPIDER_PAGECOUNT || 0);
        const atPageLimit = () => pageLimit > 0 && this.scrapyInstance.stats.get('pageCount') + inFlight.size >= pageLimit;
        while (!this.isPaused && !this._admissionClosed && this._accepting(run) && !atPageLimit() && inFlight.size < this.getGlobalConcurrency(spider)) {
          const index = this.findRunnableRequestIndex(spider);
          if (index < 0) break;
          launch(this.queue.splice(index, 1)[0]);
        }
        if (!this._accepting(run)) break;
        if (!this.isPaused && !this.queue.length && !inFlight.size) break;
        let delay = this.isPaused || this._admissionClosed || atPageLimit() || inFlight.size >= this.getGlobalConcurrency(spider) ? null : this.getNextAvailabilityDelay(spider);
        const limit = Number(spider?.scrapy?.setting?.CLOSESPIDER_TIMEOUT || 0) * 1000;
        if (limit > 0 && run) {
          const remaining = Math.max(0, run.stats.startTime + limit - Date.now());
          delay = delay === null ? remaining : Math.min(delay, remaining);
        }
        await this._waitForChange(version, delay);
      }
    } catch (error) { latch(error); }
    finally {
      // allSettled only drains already observed tasks. fatal remains latched.
      await Promise.allSettled([...inFlight]);
      this._wake();
      this.isRunning = false;
    }
    if (fatal) throw fatal;
  }

  closeResources() {
    if (!this._closePromise) this._closePromise = (async () => {
      let primary = null;
      for (const middleware of this.downloaderMiddlewareManager.middlewares) {
        const close = typeof middleware.close === 'function' ? middleware.close : middleware.closeBrowser;
        if (typeof close !== 'function') continue;
        try { await close.call(middleware); }
        catch (error) {
          const f = failure(error, 'cleanup');
          if (!primary) primary = f; else primary.secondary.push(f);
        }
      }
      if (primary) throw primary;
    })();
    return this._closePromise;
  }
  pause() { if (!this._stopping) this.isPaused = true; this._wake(); }
  resume() { if (!this._stopping) this.isPaused = false; this._wake(); }
  closeAdmission() { this._admissionClosed = true; this.queue = []; this.isPaused = false; this._wake(); }
  stop() { this._stopping = true; this.queue = []; this.isPaused = false; this._wake(); }
  async close() {
    this.stop();
    let primary;
    try { await this._runPromise; } catch (error) { primary = failure(error, 'processing'); }
    try { await this.closeResources(); } catch (error) { if (primary) primary.secondary.push(failure(error, 'cleanup')); else primary = error; }
    if (primary) throw primary;
  }
  clear() {
    if (this.isRunning) throw new Error('Cannot clear an active scheduler');
    this.queue = [];
    this.seenURLs.clear();
    this.domainState.clear();
    this.isPaused = false;
    this._stopping = false;
    this._admissionClosed = false;
    this._closePromise = null;
    this._wake();
  }
}
module.exports = Scheduler;
