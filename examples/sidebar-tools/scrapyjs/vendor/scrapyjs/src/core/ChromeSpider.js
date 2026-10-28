const CrawlSpider = require('./CrawlSpider');
const Item = require('../item/Item');
const ItemLoader = require('../item/ItemLoader');
const Processing = require('../ai/Processing');
const BrowserValidation = require('../ai/BrowserValidation');

class ChromeSpider extends CrawlSpider {
  constructor(config) {
    super(config);
    this.page = null;
    this.puppeteerConfig = config.puppeteerConfig || {};
    this.lastPageSignature = '';
    this.seenPageSignatures = new Set();
    if (Object.prototype.hasOwnProperty.call(config, 'validation')) {
      this.config = { ...config, ...BrowserValidation.validateConfig(config) };
    }
    if (Object.prototype.hasOwnProperty.call(config, 'processing')) {
      const itemKeys = Object.keys(config.itemConfig || {}).filter(key => !key.startsWith('_'));
      const processing = Processing.validate(config.processing, itemKeys);
      if (processing.rules.length) this.pipeline.addPipeline(Processing.createPipeline(processing));
    }
  }

  stableStringify(value) {
    if (Array.isArray(value)) {
      return `[${value.map(item => this.stableStringify(item)).join(',')}]`;
    }

    if (value && typeof value === 'object') {
      const keys = Object.keys(value).sort();
      return `{${keys.map(key => `${JSON.stringify(key)}:${this.stableStringify(value[key])}`).join(',')}}`;
    }

    return JSON.stringify(value);
  }

  buildPageSignature(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return '';
    }

    return this.stableStringify(items);
  }

  recordStopReason(reason) {
    if (!reason || !this.scrapy?.stats) return;
    if (typeof this.scrapy.stats.set === 'function') this.scrapy.stats.set('stopReason', reason);
    else this.scrapy.stats.stopReason = reason;
  }

  recordCloseReason() {
    const closeReason = this.scrapy?.closeSpider?.getClosingReason?.();
    const mapped = {
      closespider_pagecount: 'page_limit',
      closespider_itemcount: 'item_limit',
      closespider_timeout: 'timeout',
      user: 'user_stop'
    }[closeReason] || closeReason;
    this.recordStopReason(mapped);
  }

  incrementInPageCount(isInitialPage) {
    if (isInitialPage || !this.scrapy) return;
    this.scrapy.stats.inc('pageCount');
    const currentPageCount = this.scrapy.stats.get('pageCount');
    console.log(`Current page count: ${currentPageCount}`);
  }


  async *parse(response) {
    // Scrapy supplies fresh stats per run; page deduplication belongs to that run.
    if (this.scrapy && this.pageRunStats !== this.scrapy.stats) {
      this.pageRunStats = this.scrapy.stats;
      this.lastPageSignature = '';
      this.seenPageSignatures.clear();
    }
    if (!this.page) {
      this.page = globalThis.page____ChromePage____Object;
    }
    let page = this.page;

    // Get initial page count from stats

    let hasNextPage = true;
    let isInitialPage = true;
    while (hasNextPage) {
      // Get current URL for logging
      const currentUrl = await page.url();
      console.log(`Parsing page: ${currentUrl}`);

      if (this.puppeteerConfig.waitForSelector) {
        await this.waitForSelector(page, this.puppeteerConfig.waitForSelector);
      }

      let itemConfig = this.config.itemConfig;
      let baseURL = currentUrl;
      if (Object.prototype.hasOwnProperty.call(this.config, 'validation')) {
        const validation = await BrowserValidation.validateBrowserProfile(page, this.config);
        if (!validation.valid) {
          const code = validation.issues.some(issue => issue.code === 'E_AI_PAGE_ACCESS') ? 'E_AI_PAGE_ACCESS'
            : validation.issues.some(issue => issue.code === 'E_AI_STALE') ? 'E_AI_STALE' : 'E_AI_VALIDATION';
          throw Object.assign(new Error('Browser page failed the configured validation'), { code, errorCode: code, validation });
        }
        baseURL = validation.baseURL || currentUrl;
      }
      let extractedData = await ItemLoader.parse(
        page,
        itemConfig,
        false
      );
      extractedData = ItemLoader.ensureArray(extractedData);
      if (Object.prototype.hasOwnProperty.call(this.config, 'validation')) {
        extractedData = extractedData.map(record => BrowserValidation.normalizeRecord(record, this.config, baseURL));
      }

      const currentPageSignature = this.buildPageSignature(extractedData);

      if (currentPageSignature && this.seenPageSignatures.has(currentPageSignature)) {
        this.recordStopReason('duplicate_page');
        console.log('Duplicate page content detected after pagination. Stopping crawl without yielding duplicate items.');
        return;
      }
      this.lastPageSignature = currentPageSignature;
      if (currentPageSignature) this.seenPageSignatures.add(currentPageSignature);

      console.log(`Extracted ${extractedData?.length} items from page`);

      for (const data of extractedData) {
        yield new Item(data);
      }

      this.incrementInPageCount(isInitialPage);

      // Check if we should stop after processing current page
      if (this.scrapy?.shouldClose()) {
        this.recordCloseReason();
        console.log('Closing spider due to CLOSESPIDER_PAGECOUNT');
        return;
      }

      // Try to navigate to next page
      try {
        hasNextPage = await this.goToNextPage(page);
      } catch (error) {
        if (!this.scrapy?.stats?.get?.('stopReason')) this.recordStopReason('error');
        throw error;
      }
      if (hasNextPage) {
        isInitialPage = false;
      }
      console.log('Has next page:', hasNextPage);
      if (hasNextPage) {
        // await page.waitForTimeout(this.config.delay || 2000);
      }
    }
  }

  async goToNextPage(page) {
    const { nextPageSelector, navigationTimeout = 30000, waitForSelector } = this.puppeteerConfig || {};
    if (!nextPageSelector) {
      this.recordStopReason('single_page');
      return false;
    }
    if (!Number.isFinite(navigationTimeout) || navigationTimeout <= 0) throw new Error('navigationTimeout must be positive');
    const next = await this.findElement(page, nextPageSelector);
    if (!next) {
      this.recordStopReason('site_exhausted');
      return false;
    }
    const isXPath = this.isXPath(nextPageSelector);
    const disabled = await page.evaluate(function buttonDisabled(selector, xpath) {
      const button = xpath ? document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue : document.querySelector(selector);
      if (!button) return true;
      const style = button.nodeType === 1 ? getComputedStyle(button) : null;
      return button.disabled
        || button.getAttribute('aria-disabled') === 'true'
        || button.getAttribute('disabled') !== null
        || button.classList.contains('disabled')
        || button.classList.contains('is-disabled')
        || button.classList.contains('ant-pagination-disabled')
        || style?.display === 'none'
        || style?.visibility === 'hidden'
        || style?.pointerEvents === 'none';
    }, nextPageSelector, isXPath);
    if (disabled) {
      this.recordStopReason('site_exhausted');
      return false;
    }
    const region = this.config.itemConfig?._listContainer || null;
    const capture = () => page.evaluate(function transitionSnapshot(selector, xpath, itemSelector) {
      const element = selector ? xpath ? document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue : document.querySelector(selector) : document.body;
      let rows = element ? Array.from(element.children) : [];
      if (itemSelector !== null) {
        if (element) element.matches(itemSelector);
        rows = rows.filter(row => row.matches(itemSelector));
      }
      let busy = false;
      for (let node = element; node; node = node.parentElement) {
        if (node.getAttribute('aria-busy') === 'true' || node.hidden) busy = true;
      }
      const style = element ? getComputedStyle(element) : null;
      return { url: location.href, content: itemSelector === null ? element?.innerHTML || '' : JSON.stringify(rows.map(row => row.outerHTML)), records: rows.length,
        visible: !!element && !busy && style?.display !== 'none' && style?.visibility !== 'hidden',
        ready: document.readyState === 'complete' };
    }, region, !!region && this.isXPath(region), this.config.itemConfig?._listItem ?? null);
    const before = await capture();
    await next.click();
    const deadline = Date.now() + navigationTimeout;
    let candidate = null, candidateSince = 0, latest = before;
    const settleMs = Math.min(300, navigationTimeout / 4);
    while (Date.now() < deadline) {
      if (this.scrapy?.shouldClose(false)) return false;
      const after = await capture();
      latest = after;
      // Navigation alone, empty placeholders and busy/hidden old records are not a completed page.
      if (after?.ready && after.visible !== false && after.records !== 0 && after.content !== before?.content) {
        const signature = JSON.stringify([after.url, after.content]);
        if (candidate !== signature) { candidate = signature; candidateSince = Date.now(); }
        if (Date.now() - candidateSince >= settleMs) {
          if (waitForSelector) await this.waitForSelector(page, waitForSelector, { timeout: Math.max(1, deadline - Date.now()) });
          const delay = Number(this.config.delay || 0);
          if (!Number.isFinite(delay) || delay < 0) throw new Error('delay must be a nonnegative finite number');
          const delayUntil = Date.now() + delay;
          while (Date.now() < delayUntil) {
            if (this.scrapy?.shouldClose(false)) { this.recordCloseReason(); return false; }
            await page.waitForTimeout(Math.min(50, delayUntil - Date.now()));
          }
          return true;
        }
      } else {
        candidate = null;
      }
      await page.waitForTimeout(Math.min(50, Math.max(1, deadline - Date.now())));
    }
    if (latest?.ready && latest.visible !== false && latest.records !== 0 &&
        latest.url !== before?.url && latest.content === before?.content) {
      this.recordStopReason('duplicate_page');
      return false;
    }
    this.recordStopReason('transition_timeout');
    throw Object.assign(new Error('Next-page click did not produce a confirmed page transition'), { code: 'PAGE_TRANSITION_TIMEOUT' });
  }

  // Utility function to detect if the selector is an XPath
  isXPath(selector) {
    return selector.startsWith('//') ||
      selector.startsWith('.//') ||
      selector.startsWith('(//') ||
      selector.startsWith('(.//') ||
      selector.startsWith('descendant::') ||
      selector.startsWith('./');
  }

  // Function to find elements using either CSS or XPath
  async findElement(page, selector) {
    if (this.isXPath(selector)) {
      // XPath selector
      const elements = await page.$x(selector);
      return elements.length > 0 ? elements[0] : null;
    } else {
      // CSS selector
      return await page.$(selector);
    }
  }

  // Function to wait for selector using either CSS or XPath
  async waitForSelector(page, selector, options = {}) {
    if (this.isXPath(selector)) {
      // Wait for XPath selector
      await page.waitForXPath(selector, options);
    } else {
      // Wait for CSS selector
      await page.waitForSelector(selector, options);
    }
  }
}

module.exports = ChromeSpider;
