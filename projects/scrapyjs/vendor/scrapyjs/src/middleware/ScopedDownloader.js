'use strict';

const Downloader = require('../middleware/DownloaderMiddleware');
const { assertAllowedUrl, fault } = require('../ai/TaskSpec');

function checkTime(deadline, signal) { if (Date.now() >= deadline) throw fault('TIME_BUDGET'); if (signal?.aborted) throw fault('ABORTED'); }

// Shared scope validation keeps manual extraction and downloads on the same bounds.
function validateScope(scope, legacy = false) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) throw fault('URL_SCOPE', 'A valid scope is required');
  if (!legacy && Object.keys(scope).some(key => !['allowedOrigins', 'allowedProtocols', 'allowedPathPrefixes', 'limits'].includes(key))) throw fault('URL_SCOPE', 'Unknown scope key');
  for (const key of ['allowedOrigins', 'allowedProtocols', 'allowedPathPrefixes']) {
    if (legacy && key === 'allowedPathPrefixes' && scope[key] === undefined) continue;
    if (!Array.isArray(scope[key]) || !scope[key].length || scope[key].some(value => typeof value !== 'string' || !value)) throw fault('URL_SCOPE', 'Invalid scope ' + key);
  }
  for (const origin of scope.allowedOrigins) {
    let url;
    try { url = new URL(origin); } catch { throw fault('URL_SCOPE'); }
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw fault('URL_SCOPE');
  }
  if (!scope.allowedProtocols.every(value => ['http:', 'https:'].includes(value)) || (scope.allowedPathPrefixes && !scope.allowedPathPrefixes.every(value => value.startsWith('/') && !/[?#\\%]/.test(value)))) throw fault('URL_SCOPE');
  const defaults = { maxRequests: 1, maxMs: 60000, requestTimeoutMs: 10000, maxBodyBytes: 1048576 };
  const raw = scope.limits === undefined ? {} : scope.limits;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw fault('TASK_LIMIT');
  const allowed = [...Object.keys(defaults), ...(legacy ? ['maxListPages', 'maxDetailPages', 'maxItems'] : [])];
  if (Object.keys(raw).some(key => !allowed.includes(key))) throw fault('TASK_LIMIT');
  for (const [key, value] of Object.entries(raw)) {
    const max = key === 'maxBodyBytes' ? 10485760 : key.endsWith('Ms') ? 600000 : 20000;
    if (!Number.isSafeInteger(value) || value < (legacy && key === 'maxDetailPages' ? 0 : 1) || value > max) throw fault('TASK_LIMIT');
  }
  return { allowedOrigins: [...scope.allowedOrigins], allowedProtocols: [...scope.allowedProtocols], ...(scope.allowedPathPrefixes ? { allowedPathPrefixes: [...scope.allowedPathPrefixes] } : {}), limits: Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, raw[key] ?? value])) };
}

class ScopedDownloader extends Downloader {
  constructor(scope, ledger, deadline, signal) {
    super();
    const legacy = ledger !== undefined;
    const validated = validateScope(scope, legacy);
    this.spec = { ...validated, limits: legacy ? { ...scope.limits, ...validated.limits } : validated.limits };
    this.ledger = ledger || { limits: { maxDownloadAttempts: validated.limits.maxRequests }, startedAt: Date.now(), modelAttempts: [], downloadAttempts: [], repairs: 0 };
    this.deadline = deadline ?? this.ledger.startedAt + validated.limits.maxMs;
    this.startAttempt = this.ledger.downloadAttempts.length;
    this.closed = false;
    if (legacy) this.signal = signal;
    else {
      this._controller = new AbortController();
      this.signal = this._controller.signal;
      this._timer = setTimeout(() => this._controller.abort(), Math.max(1, this.deadline - Date.now()));
      this._timer.unref?.();
    }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this._timer);
    if (this._stop) this.signal.removeEventListener('abort', this._stop);
    this._controller?.abort();
  }
  static validateScope(scope) { return validateScope(scope); }
  async process_request(request, spider) {
    if (this.closed) throw fault('ABORTED');
    if (this._controller && !this._stop && spider?.scrapy) {
      this._stop = () => spider.scrapy.stop();
      this.signal.addEventListener('abort', this._stop, { once: true });
      if (this.signal.aborted) this._stop();
    }
    checkTime(this.deadline, this.signal);
    assertAllowedUrl(request.url, this.spec);
    if (this.ledger.downloadAttempts.length - this.startAttempt >= this.spec.limits.maxRequests || this.ledger.downloadAttempts.length >= this.ledger.limits.maxDownloadAttempts) throw fault('REQUEST_BUDGET');
    return super.process_request(request, spider);
  }
  _resolveAxios() {
    const client = require('axios');
    return { request: async config => {
      checkTime(this.deadline, this.signal);
      assertAllowedUrl(config.url, this.spec);
      // Proxy resolution above can yield: reserve at the send boundary, with
      // no await between this budget check and recording the attempt.
      if (this.ledger.downloadAttempts.length - this.startAttempt >= this.spec.limits.maxRequests || this.ledger.downloadAttempts.length >= this.ledger.limits.maxDownloadAttempts) throw fault('REQUEST_BUDGET');
      const attempt = { attempt: this.ledger.downloadAttempts.length + 1, startedAt: Date.now(), outcome: 'running' };
      this.ledger.downloadAttempts.push(attempt);
      try {
        const response = await client.request({ ...config, proxy: false, maxRedirects: 0, maxContentLength: this.spec.limits.maxBodyBytes, maxBodyLength: 0, timeout: Math.max(1, Math.min(this.spec.limits.requestTimeoutMs, this.deadline - Date.now())), signal: this.signal });
        attempt.httpStatus = response.status;
        if (response.status >= 300 && response.status < 400) throw fault('REDIRECT_REJECTED');
        if (response.status >= 400) throw fault('HTTP_STATUS');
        checkTime(this.deadline, this.signal);
        attempt.outcome = 'ok'; return response;
      } catch (error) {
        const code = this.signal?.aborted ? (Date.now() >= this.deadline ? 'TIME_BUDGET' : 'ABORTED') : ['ECONNABORTED', 'ETIMEDOUT'].includes(error.code) ? 'DOWNLOAD_TIMEOUT' : /maxContentLength/.test(error.message || '') ? 'PAGE_SIZE' : error.code || 'DOWNLOAD_FAILED';
        attempt.outcome = code; throw fault(code);
      } finally { attempt.finishedAt = Date.now(); attempt.elapsedMs = attempt.finishedAt - attempt.startedAt; }
    } };
  }
  async process_exception() { /* Diagnostics use codes, never credential-bearing request URLs. */ }
  isRetryableException() { return false; }
}

module.exports = ScopedDownloader;
