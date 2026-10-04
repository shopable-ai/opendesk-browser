const IDownloaderMiddleware = require('./IDownloaderMiddleware');
const Response = require('../http/Response');

/**
 * Downloader that relies on the Chrome extension's injected ChromePage bridge.
 * It navigates the active tab when needed and captures the rendered HTML so that
 * spiders can operate on the same context a user sees.
 */
class ChromeDownloaderMiddleware extends IDownloaderMiddleware {
  constructor(options = {}) {
    super();
    this.resolvePage =
      options.resolvePage ||
      (() => globalThis.page____ChromePage____Object || null);
    this.defaultTimeout = options.navigationTimeout || 30000;
  }

  async process_request(request, spider) {
    const page = await this._ensurePage();
    console.log('[Downloader] resolved page instance', { tabId: page.tabId });
    if (!page.tabId && typeof page._resolveActiveTabId === 'function') {
      try {
        page.tabId = await page._resolveActiveTabId();
        console.log('[Downloader] resolved active tabId', page.tabId);
      } catch (error) {
        console.warn('[Downloader] failed to resolve active tab id', error);
      }
    }
    const targetUrl = request.url;

    if (!targetUrl) {
      throw new Error('ChromeDownloaderMiddleware requires request.url');
    }

    await this._navigateIfNeeded(page, targetUrl, request, spider);
    await this._waitForReadyState(page, request);

    const shouldCaptureHtml = this.shouldCaptureHtml(request, spider);
    const body = shouldCaptureHtml ? await page.content() : '';
    console.log('[Downloader] fetched content length', body ? String(body).length : 0);
    const finalUrl = await page.url();

    return new Response({
      url: finalUrl,
      status: 200,
      body,
      request,
      headers: {
        'content-type': 'text/html',
      },
    });
  }

  shouldCaptureHtml(request, spider) {
    if (request.meta?.captureHtml) {
      return true;
    }

    if (Array.isArray(spider?.rules) && spider.rules.length > 0) {
      return true;
    }

    return spider?.constructor?.name !== 'ChromeSpider';
  }

  async process_response(request, response) {
    return response;
  }

  async process_exception(request, exception) {
    console.error(`Chrome downloader failed for ${request.url}:`, exception);
  }

  async _ensurePage() {
    const page = await this.resolvePage();
    if (!page) {
      throw new Error(
        'ChromePage bridge is not available. Ensure ChromePage.js is loaded before starting the spider.'
      );
    }

    for (const method of ['goto', 'waitForNavigation', 'content', 'url']) {
      if (typeof page[method] !== 'function') {
        throw new Error(
          `ChromePage instance is missing required method "${method}".`
        );
      }
    }

    return page;
  }

  async _navigateIfNeeded(page, targetUrl, request, spider) {
    const normalizedTarget = this._normalizeUrl(targetUrl);
    let current = '';

    try {
      current = this._normalizeUrl(await page.url());
    } catch (error) {
      console.warn('Unable to read current page url:', error);
    }

    const shouldReload =
      request.meta?.forceNavigation ||
      normalizedTarget !== current ||
      !current;

    console.log('[Downloader] shouldReload check', {
      normalizedTarget,
      current,
      shouldReload,
      forced: request.meta?.forceNavigation
    });

    if (!shouldReload) {
      return false;
    }

    const timeout = this._resolveTimeout(request, spider);

    console.log('[Downloader] navigating to', targetUrl);
    await page.goto(targetUrl, { timeout, waitUntil: 'domcontentloaded' });
    console.log('[Downloader] goto completed', { url: targetUrl });
    return true;
  }

  async _waitForReadyState(page, request) {
    const selector = request.waitForSelector || request.meta?.waitForSelector;
    if (!selector) return;

    const timeout = request.meta?.waitTimeout || request.timeout || this.defaultTimeout;
    await page.waitForSelector(selector, { timeout });
  }

  _normalizeUrl(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      // Remove hash to avoid false reloads when only fragment changed.
      parsed.hash = '';
      return parsed.toString();
    } catch {
      return url;
    }
  }

  _resolveTimeout(request, spider) {
    if (typeof request.timeout === 'number') {
      return request.timeout;
    }
    if (typeof spider?.config?.timeout === 'number') {
      return spider.config.timeout;
    }
    return this.defaultTimeout;
  }
}

module.exports = ChromeDownloaderMiddleware;
