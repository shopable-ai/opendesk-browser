/**
 * Request object (保持与 Scrapy 中 Request 类相似)
 */
class Request {
  constructor(url, callback = null, options = {}) {
    if (callback && typeof callback === 'object' && !Array.isArray(callback)) {
      options = callback;
      callback = options.callback ?? null;
    }

    const {
      headers = {},
      method = 'GET',
      body = null,
      meta = {},
      priority = 0,
      dont_filter = false,
      timeout = 30000,
      errback = null,
      cookies = null,
      userAgent = 'Mozilla/5.0',
      encoding = 'utf-8',
      clickSelector = null,
      waitForSelector = null,
      responseType = undefined,
      retries = undefined,
      retry_times = undefined,
      retry_http_codes = null,
      proxy = undefined,
      download_delay = 0,
    } = options;

    this.url = url;
    this.callback = callback;
    this.headers = { ...headers };
    this.method = String(method || 'GET').toUpperCase();
    this.body = body;
    this.meta = { ...meta };
    this.priority = Number.isFinite(Number(priority)) ? Number(priority) : 0;
    this.dont_filter = Boolean(dont_filter);
    this.timeout = timeout;
    this.errback = errback;
    this.cookies = cookies;
    this.userAgent = userAgent;
    this.encoding = encoding;
    this.clickSelector = clickSelector;
    this.waitForSelector = waitForSelector;
    this.responseType = responseType;
    this.retries = Request.normalizeRetryTimes(retries, 'retries');
    this.retry_times = Request.normalizeRetryTimes(retry_times, 'retry_times');
    this.retry_http_codes = Array.isArray(retry_http_codes) ? [...retry_http_codes] : retry_http_codes;
    this.proxy = proxy;
    this.download_delay = download_delay;
    this._retryCount = Number.isFinite(Number(options._retryCount)) ? Number(options._retryCount) : 0;
    this._retryRequest = Boolean(options._retryRequest);
    this._availableAt = Number.isFinite(Number(options._availableAt))
      ? Number(options._availableAt)
      : Date.now();
  }

  static normalizeRetryTimes(value, name = 'retries') {
    if (value === undefined) {
      return undefined;
    }

    if (
      (typeof value !== 'number' && typeof value !== 'string') ||
      (typeof value === 'string' && value.trim() === '')
    ) {
      throw new TypeError(`${name} must be a non-negative integer.`);
    }

    const retryTimes = Number(value);
    if (!Number.isInteger(retryTimes) || retryTimes < 0) {
      throw new TypeError(`${name} must be a non-negative integer.`);
    }
    return retryTimes;
  }

  // Resolve request aliases only; inherited limits and defaults belong to Scheduler.
  getRetryTimes() {
    const retryTimes = Request.normalizeRetryTimes(this.retry_times, 'retry_times');
    const retries = Request.normalizeRetryTimes(this.retries, 'retries');
    return retryTimes ?? retries;
  }

  toOptions() {
    return {
      callback: this.callback,
      headers: { ...this.headers },
      method: this.method,
      body: this.body,
      meta: { ...this.meta },
      priority: this.priority,
      dont_filter: this.dont_filter,
      timeout: this.timeout,
      errback: this.errback,
      cookies: this.cookies,
      userAgent: this.userAgent,
      encoding: this.encoding,
      clickSelector: this.clickSelector,
      waitForSelector: this.waitForSelector,
      responseType: this.responseType,
      retries: this.retries,
      retry_times: this.retry_times,
      retry_http_codes: Array.isArray(this.retry_http_codes) ? [...this.retry_http_codes] : this.retry_http_codes,
      proxy: this.proxy,
      download_delay: this.download_delay,
      _retryCount: this._retryCount,
      _retryRequest: this._retryRequest,
      _availableAt: this._availableAt,
    };
  }

  // Overrides replace fields, including headers/meta; the constructor copies containers.
  clone(overrides = {}) {
    const { url = this.url, ...options } = overrides;
    return new Request(url, { ...this.toOptions(), ...options });
  }
}

module.exports = Request;
