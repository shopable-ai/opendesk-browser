// import axios from 'axios';
const IDownloaderMiddleware = require('./IDownloaderMiddleware');
const Response = require('../http/Response');
const { ProxyManager } = require('./ProxyMiddleware');

/**
 * Downloader Middleware for handling network requests with axios (保持与 Scrapy 中 DownloaderMiddleware 类相似)
 */
class DownloaderMiddleware extends IDownloaderMiddleware {
  constructor(options = {}) {
    super();
    this.retryableStatusCodes = new Set(options.retryableStatusCodes || [408, 429, 500, 502, 503, 504]);
    this.proxyManager = options.proxyManager || null;
    this.proxyCooldowns = new Map();
  }

  formatCookiesForHeader(cookies) {
    if (typeof cookies === 'string') return cookies;
    if (Array.isArray(cookies)) {
      return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    }
    return '';
  }

  async process_request(request, spider) {
    const axiosClient = this._resolveAxios();
    if (!axiosClient) {
      throw new Error('Axios is required for DownloaderMiddleware but is not available in this environment.');
    }

    const cookieString = request.cookies
      ? this.formatCookiesForHeader(request.cookies)
      : '';

    const proxy = await this.resolveProxy(request, spider);
    const config = {
      url: request.url,
      method: request.method || 'GET',
      headers: {
        ...(request.headers || {}),
        ...(request.userAgent ? { 'User-Agent': request.userAgent } : {}),
        ...(cookieString ? { Cookie: cookieString } : {}),
      },
      data: request.body,
      timeout: request.timeout,
      responseType: request.responseType || 'text',
      validateStatus: () => true,
    };

    if (proxy) {
      config.proxy = proxy;
      request.meta = {
        ...(request.meta || {}),
        proxy: this.serializeProxy(proxy),
      };
    }

    const response = await axiosClient.request(config);

    return new Response({
      url: response.request?.responseURL || request.url,
      status: response.status,
      headers: response.headers,
      body: response.data,
      request,
    });
  }

  async process_response(request, response, spider) {
    if (this.isRetryableStatus(response?.status, request, spider)) {
      this.markProxyFailure(request, spider);
    }
    return response;
  }

  async process_exception(request, exception, spider) {
    this.markProxyFailure(request, spider);
    console.error(`Exception occurred while processing ${request.url}:`, exception);
  }

  getRetryableStatusCodes(request, spider) {
    const requestCodes = Array.isArray(request.retry_http_codes) ? request.retry_http_codes : null;
    const spiderCodes = Array.isArray(spider?.config?.retry_http_codes) ? spider.config.retry_http_codes : null;
    const globalCodes = Array.isArray(spider?.scrapy?.setting?.RETRY_HTTP_CODES) ? spider.scrapy.setting.RETRY_HTTP_CODES : null;
    return new Set(requestCodes || spiderCodes || globalCodes || this.retryableStatusCodes);
  }

  isRetryableStatus(status, request, spider) {
    return this.getRetryableStatusCodes(request, spider).has(status);
  }

  isRetryableException(exception) {
    const code = exception?.code || '';
    const message = String(exception?.message || exception || '').toLowerCase();
    return [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ECONNABORTED',
      'EHOSTUNREACH',
      'ENOTFOUND'
    ].includes(code) || /timeout|network|socket|proxy|connect/.test(message);
  }

  resolveProxyConfig(request, spider) {
    return request.proxy || spider?.config?.proxy || spider?.config?.proxyConfig || spider?.scrapy?.setting?.proxy || spider?.scrapy?.setting?.proxyConfig || null;
  }

  ensureProxyManager(proxyConfig) {
    if (!proxyConfig || typeof proxyConfig !== 'object') {
      return null;
    }

    if (proxyConfig instanceof ProxyManager) {
      return proxyConfig;
    }

    if (!this.proxyManager || this.proxyManager.__proxyConfig !== proxyConfig) {
      this.proxyManager = new ProxyManager(proxyConfig);
      this.proxyManager.__proxyConfig = proxyConfig;
    }

    return this.proxyManager;
  }

  async resolveProxy(request, spider) {
    const proxyConfig = this.resolveProxyConfig(request, spider);

    if (!proxyConfig) {
      return null;
    }

    if (typeof proxyConfig === 'string') {
      request.meta = {
        ...(request.meta || {}),
        _proxyConfig: proxyConfig,
      };
      return this.normalizeProxy(proxyConfig);
    }

    const proxyManager = this.ensureProxyManager(proxyConfig);
    if (!proxyManager) {
      return null;
    }

    const proxyString = await proxyManager.getNextProxy();
    request.meta = {
      ...(request.meta || {}),
      _proxyConfig: proxyConfig,
    };
    return this.normalizeProxy(proxyString);
  }

  normalizeProxy(proxyValue) {
    if (!proxyValue) {
      return null;
    }

    if (typeof proxyValue === 'object' && proxyValue.host && proxyValue.port) {
      return {
        protocol: proxyValue.protocol || 'http',
        host: proxyValue.host,
        port: Number(proxyValue.port)
      };
    }

    const raw = String(proxyValue).trim();
    if (!raw) {
      return null;
    }

    const withProtocol = raw.includes('://') ? raw : `http://${raw}`;
    const parsed = new URL(withProtocol);
    return {
      protocol: parsed.protocol.replace(':', '') || 'http',
      host: parsed.hostname,
      port: Number(parsed.port || 80)
    };
  }

  serializeProxy(proxy) {
    if (!proxy) {
      return null;
    }
    return `${proxy.protocol || 'http'}://${proxy.host}:${proxy.port}`;
  }

  markProxyFailure(request, spider) {
    const proxy = request?.meta?.proxy;
    const proxyConfig = request?.meta?._proxyConfig ?? this.resolveProxyConfig(request, spider);
    if (!proxy) {
      return;
    }

    const proxyManager = this.ensureProxyManager(proxyConfig);
    if (proxyManager && typeof proxyManager.markProxyAsFailed === 'function') {
      proxyManager.markProxyAsFailed(proxy.replace(/^\w+:\/\//, ''));
    }
  }

  _resolveAxios() {
    if (typeof globalThis !== 'undefined' && globalThis.axios) {
      return globalThis.axios;
    }

    try {
      return require('axios');
    } catch {
      return null;
    }
  }
}

module.exports = DownloaderMiddleware;
