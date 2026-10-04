const fs = require('fs');
const path = require('path');

const ItemLoader = require('../src/item/ItemLoader');
const ExportManager = require('../src/exporter/ExportManager');
const FeedExport = require('../src/exporter/FeedExport');
const Pipeline = require('../src/core/Pipeline');
const Scrapy = require('../src/core/Scrapy');
const Request = require('../src/http/Request');
const Response = require('../src/http/Response');
const Rule = require('../src/core/Rule');
const LinkExtractor = require('../src/link/LinkExtractor');
const { BaseSpider } = require('../src/core/BaseSpider');
const CrawlSpider = require('../src/core/CrawlSpider');
const ListSpider = require('../src/core/ListSpider');
const ChromeSpider = require('../src/core/ChromeSpider');
const Item = require('../src/item/Item');
const Scheduler = require('../src/core/Scheduler');
const DownloaderMiddlewareManager = require('../src/middleware/DownloaderMiddlewareManager');
const IDownloaderMiddleware = require('../src/middleware/IDownloaderMiddleware');
const DownloaderMiddleware = require('../src/middleware/DownloaderMiddleware');
const ChromeDownloaderMiddleware = require('../src/middleware/ChromeDownloaderMiddleware');
const { StaticProxyProvider, DynamicProxyProvider, ProxyManager, ProxyProviderConfig } = require('../src/middleware/ProxyMiddleware');
const CloseSpider = require('../src/core/CloseSpider');
const axios = require('axios');

class StaticMiddleware {
  constructor(routes) {
    this.routes = routes;
  }

  async process_request(request) {
    const route = this.routes[request.url] || { status: 200, body: '<html></html>' };
    return new Response({
      url: request.url,
      status: route.status || 200,
      body: route.body,
      request,
      headers: { 'content-type': 'text/html' }
    });
  }

  async process_response(request, response) {
    return response;
  }

  async process_exception() {}
}

describe('Phase 4 regression suite', () => {
  it('exports the public API surface from src/index', () => {
    const api = require('../src/index');

    expect(api).toHaveProperty('Scrapy');
    expect(api).toHaveProperty('Request');
    expect(api).toHaveProperty('Response');
    expect(api).toHaveProperty('Rule');
    expect(api).toHaveProperty('ListSpider');
    expect(api).toHaveProperty('ChromeDownloaderMiddleware');
  });

  it('exposes default downloader middleware interface behavior', async () => {
    class Impl extends IDownloaderMiddleware {}
    const middleware = new Impl();
    const response = await middleware.process_response({}, { ok: true }, {});
    expect(response).toEqual({ ok: true });
    await expect(middleware.process_request({}, {})).rejects.toThrow('process_request() must be implemented');
  });

  it('chains downloader middleware manager request response and close hooks', async () => {
    const calls = [];

    class FirstMiddleware extends IDownloaderMiddleware {
      async process_request(request) {
        calls.push(['request:first', request.url]);
        return null;
      }
      async process_response(request, response) {
        calls.push(['response:first', request.url]);
        return { ...response, first: true };
      }
      async process_exception(request, error) {
        calls.push(['exception:first', request.url, error.message]);
      }
      async close() {
        calls.push(['close:first']);
      }
    }

    class SecondMiddleware extends IDownloaderMiddleware {
      async process_request(request) {
        calls.push(['request:second', request.url]);
        return new Response({ url: request.url, body: 'ok', request });
      }
      async process_response(request, response) {
        calls.push(['response:second', request.url]);
        return { ...response, second: true };
      }
      async process_exception(request, error) {
        calls.push(['exception:second', request.url, error.message]);
      }
      async close() {
        calls.push(['close:second']);
      }
    }

    const manager = new DownloaderMiddlewareManager([new FirstMiddleware(), new SecondMiddleware()]);
    const request = { url: 'http://manager.local' };
    const response = await manager.process_request(request, {});
    const processed = await manager.process_response(request, response, {});
    await manager.process_exception(request, new Error('boom'), {});
    await manager.close();

    expect(processed.first).toBe(true);
    expect(processed.second).toBe(true);
    expect(calls).toEqual([
      ['request:first', 'http://manager.local'],
      ['request:second', 'http://manager.local'],
      ['response:first', 'http://manager.local'],
      ['response:second', 'http://manager.local'],
      ['exception:first', 'http://manager.local', 'boom'],
      ['exception:second', 'http://manager.local', 'boom'],
      ['close:first'],
      ['close:second']
    ]);
  });

  it('parses browser-mode ItemLoader selectors from a page bridge', async () => {
    const page = {
      async evaluate(fn, config) {
        return [
          {
            title: 'Browser Item',
            url: '/browser/1'
          }
        ];
      }
    };

    const originalPage = global.page____ChromePage____Object;
    global.page____ChromePage____Object = page;

    const result = await ItemLoader.parse(page, {
      title: '.title',
      url: '.title::href'
    }, true, false);

    global.page____ChromePage____Object = originalPage;
    expect(result).toEqual({ title: 'Browser Item', url: '/browser/1' });
  });

  it('applies item schema whitelist required fields and validators', () => {
    const result = Item.applySchema(
      { title: 'Hello', price: 2, extra: 'drop' },
      {
        whitelist: ['title', 'price'],
        required: ['title'],
        validators: {
          price: (value) => value > 0
        }
      }
    );

    expect(result).toEqual({ title: 'Hello', price: 2 });
    expect(() => Item.applySchema({ price: 0 }, { required: ['title'] })).toThrow('missing required field');
    expect(() => Item.applySchema({ title: 'Hello', price: 0 }, { validators: { price: (value) => value > 0 } })).toThrow('validation failed');
  });

  it('parses detail items with ItemLoader.parse using fixture HTML', async () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../demo/data/taobao_detail.html'), 'utf8');
    const item = await ItemLoader.parse(html, {
      title: 'h1.mainTitle--O1XCl8e2',
      price: '.highlightPrice--OOP9oDP8 .text--fZ9NUhyQ',
      sold: '.salesDesc--uG0VbTiu'
    }, true, true);

    expect(item.title).toContain('csdx会员');
    expect(item.price).toContain('2.45');
    expect(item.sold).toContain('已售');
  });

  it('parses list pages and next-page URLs with ListSpider', async () => {
    const spider = new ListSpider({
      name: 'list-test',
      itemConfig: {
        _listContainer: '#content_left',
        title: 'h3.c-title a',
        url: 'h3.c-title a::href'
      },
      nextPageSelector: '#page a.n',
      nextPageText: '下一页',
      delay: 0,
    });

    const response = new Response({
      url: 'https://example.com/start',
      body: `
        <div id="content_left">
          <div><h3 class="c-title"><a href="/detail/1">one</a></h3></div>
        </div>
        <div id="page"><a class="n" href="/page/2">下一页</a></div>
      `,
      request: new Request('https://example.com/start')
    });

    const outputs = [];
    for await (const value of spider.parse(response)) {
      outputs.push(value);
    }

    expect(outputs[0]).toBeInstanceOf(Item);
    expect(outputs[0].title).toBe('one');
    expect(outputs[1]).toBeInstanceOf(Request);
    expect(outputs[1].url).toBe('https://example.com/page/2');
  });

  it('parses simple list fixtures with ItemLoader and normalizes arrays', async () => {
    const html = `
      <div id="items">
        <div><a class="title" href="/a">A</a></div>
        <div><a class="title" href="/b">B</a></div>
      </div>
    `;

    const items = await ItemLoader.parse(html, {
      _listContainer: '#items',
      title: 'a.title',
      url: 'a.title::href'
    }, false, true);

    expect(items).toEqual([
      { title: 'A', url: '/a' },
      { title: 'B', url: '/b' }
    ]);
    expect(ItemLoader.ensureArray(null)).toEqual([]);
    expect(ItemLoader.ensureArray({ a: 1 })).toEqual([{ a: 1 }]);
  });

  it('parses browser-mode ItemLoader calls through the page bridge', async () => {
    const originalPage = global.page____ChromePage____Object;
    global.page____ChromePage____Object = {
      async evaluate() {
        return [{ title: 'Browser Item', url: '/browser/1' }];
      }
    };

    const result = await ItemLoader.parse(global.page____ChromePage____Object, {
      title: '.title',
      url: '.title::href'
    }, true, false);

    global.page____ChromePage____Object = originalPage;
    expect(result).toEqual({ title: 'Browser Item', url: '/browser/1' });
  });

  it('exports nested objects to CSV with escaped values', () => {
    const csv = ExportManager.toCSV([
      { title: 'x,y', nested: { score: 1 }, note: 'line\nbreak' }
    ]);

    expect(csv).toContain('nested_score');
    expect(csv).toContain('"x,y"');
    expect(csv).toContain('"line\nbreak"');
  });

  it('supports browser-side saveToFile and format helpers', () => {
    const originalWindow = global.window;
    const originalBlob = global.Blob;
    const originalDocument = global.document;
    const originalURL = global.URL;
    const clicked = { value: false };

    try {
      const browserURL = {
        createObjectURL() { return 'blob:test'; },
        revokeObjectURL() {}
      };

      global.window = {
        URL: browserURL,
        Blob: function Blob(parts, options) {
          this.parts = parts;
          this.options = options;
        },
        document: {
          createElement() {
            return {
              click() { clicked.value = true; }
            };
          }
        }
      };
      global.Blob = global.window.Blob;
      global.document = global.window.document;
      global.URL = browserURL;

      expect(ExportManager.getFormat('file.json')).toBe('json');
      expect(ExportManager.toJSON([{ a: 1 }])).toContain('\n');
      ExportManager.saveToFileBrowser('test.json', '{"a":1}', 'application/json');
      expect(clicked.value).toBe(true);
    } finally {
      global.window = originalWindow;
      global.Blob = originalBlob;
      global.document = originalDocument;
      global.URL = originalURL;
    }
  });

  it('extracts links through LinkExtractor with css and xpath-compatible filters', () => {
    const response = new Response({
      url: 'https://example.com/start',
      body: '<div id="page"><a class="n" href="/next">下一页</a><a class="n" href="/prev">上一页</a></div><a class="detail-link" href="/detail/1">detail</a>'
    });

    const cssExtractor = new LinkExtractor({
      restrict_css: ['a.detail-link'],
      attrs: ['href']
    });
    const xpathShapeExtractor = new LinkExtractor({
      restrict_xpaths: ["//div[@id='page']//a[@class='n'][contains(text(),'下一页')]"]
    });

    expect(cssExtractor.extract_links(response)).toEqual(['https://example.com/detail/1']);
    expect(xpathShapeExtractor.extract_links(response)).toEqual(['https://example.com/next']);
  });

  it('creates unique Scheduler fingerprints for method and body changes', () => {
    const scheduler = new Scheduler({ middlewares: [] }, { shouldClose: () => false, stats: { get: () => 0 } });
    const a = new Request('http://fp.local/path', null, { method: 'GET' });
    const b = new Request('http://fp.local/path', null, { method: 'POST', body: 'x=1' });
    const c = new Request('http://fp.local/path', null, { method: 'POST', body: 'x=2' });

    expect(new Set([
      scheduler.getRequestFingerprint(a),
      scheduler.getRequestFingerprint(b),
      scheduler.getRequestFingerprint(c)
    ]).size).toBe(3);
  });

  it('runs ChromeSpider from a page object without extra HTML extraction', async () => {
    const originalParse = ItemLoader.parse;
    let parseCalls = 0;
    ItemLoader.parse = async (source) => {
      parseCalls += 1;
      expect(typeof source.evaluate).toBe('function');
      return [{ title: 'same-item' }];
    };

    const page = {
      async url() { return 'https://example.com/list'; },
      async waitForSelector() {},
      async $(selector) { return selector === '.next' ? { async click() {} } : null; },
      async evaluate() { return false; },
      async waitForTimeout() {},
      async $x() { return []; }
    };

    const spider = new ChromeSpider({
      name: 'chrome-test',
      itemConfig: { title: '.title' },
      puppeteerConfig: { nextPageSelector: '.next', waitForSelector: '.list' },
      delay: 0
    });
    spider.page = page;
    spider.scrapy = {
      shouldClose: () => false,
      stats: { inc() {}, get() { return 0; } }
    };

    const outputs = [];
    for await (const item of spider.parse({ text: '<html></html>' })) {
      outputs.push(item);
      if (outputs.length >= 1) break;
    }

    ItemLoader.parse = originalParse;
    expect(parseCalls).toBe(1);
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toBeInstanceOf(Item);
  });

  it('uses ChromeSpider selector helpers for css and xpath paths', async () => {
    const spider = new ChromeSpider({ name: 'chrome-helpers' });
    const calls = [];
    const page = {
      async $() { return { type: 'css' }; },
      async $x() { return [{ type: 'xpath' }]; },
      async waitForSelector(selector) { calls.push(['css', selector]); },
      async waitForXPath(selector) { calls.push(['xpath', selector]); }
    };

    expect(spider.isXPath('//div')).toBe(true);
    expect(spider.isXPath('.title')).toBe(false);
    expect(await spider.findElement(page, '.title')).toEqual({ type: 'css' });
    expect(await spider.findElement(page, '//div')).toEqual({ type: 'xpath' });
    await spider.waitForSelector(page, '.title');
    await spider.waitForSelector(page, '//div');
    expect(calls).toEqual([
      ['css', '.title'],
      ['xpath', '//div']
    ]);
  });

  it('resolves proxies and cools down failed static proxies', async () => {
    const downloader = new DownloaderMiddleware();
    const requestProxy = await downloader.resolveProxy({ meta: {}, proxy: '127.0.0.1:8080' }, { config: {} });
    const provider = new StaticProxyProvider({ proxyList: ['1.1.1.1:80', '2.2.2.2:81'], proxyCooldown: 1000 });
    const first = await provider.getProxy();
    provider.markProxyAsFailed(first);
    const second = await provider.getProxy();

    expect(requestProxy).toEqual({ protocol: 'http', host: '127.0.0.1', port: 8080 });
    expect(first).toBe('1.1.1.1:80');
    expect(second).toBe('2.2.2.2:81');
  });

  it('parses proxy provider responses and rotates static ProxyManager proxies', async () => {
    const parser = new ProxyProviderConfig({
      responseType: 'json',
      responsePath: 'data',
      responseFormat: '${ip}:${port}'
    });
    expect(parser.responseParser({ data: { data: { ip: '3.3.3.3', port: 88 } } })).toBe('3.3.3.3:88');

    const originalFetch = global.fetch;
    const originalSetInterval = global.setInterval;
    global.fetch = async () => ({ ok: false });
    global.setInterval = () => 0;

    try {
      const manager = new ProxyManager({ mode: 'static', proxyList: ['9.9.9.9:90', '8.8.8.8:80'], proxyCooldown: 1000 });
      const first = await manager.getNextProxy();
      manager.markProxyAsFailed(first);
      const second = await manager.getNextProxy();
      expect(first).toBe('9.9.9.9:90');
      expect(second).toBe('8.8.8.8:80');
    } finally {
      global.fetch = originalFetch;
      global.setInterval = originalSetInterval;
    }
  });

  it('fetches dynamic proxies through axios-backed provider', async () => {
    const originalGet = axios.get;
    axios.get = async () => ({ data: '5.5.5.5:55' });

    try {
      const provider = new DynamicProxyProvider({ proxyApiUrl: 'http://proxy.local', responseType: 'text' });
      await provider.fetchNewProxy();
      expect(provider.currentProxy).toBe('5.5.5.5:55');
    } finally {
      axios.get = originalGet;
    }
  });

  it('formats downloader cookies and serializes proxies', () => {
    const downloader = new DownloaderMiddleware();
    expect(downloader.formatCookiesForHeader([{ name: 'a', value: '1' }, { name: 'b', value: '2' }])).toBe('a=1; b=2');
    expect(downloader.serializeProxy({ protocol: 'http', host: '127.0.0.1', port: 8080 })).toBe('http://127.0.0.1:8080');
    expect(downloader.normalizeProxy('127.0.0.1:8080')).toEqual({ protocol: 'http', host: '127.0.0.1', port: 8080 });
  });

  it('marks retryable statuses and exceptions in DownloaderMiddleware', () => {
    const downloader = new DownloaderMiddleware();
    const timeoutError = new Error('socket timeout');
    timeoutError.code = 'ETIMEDOUT';

    expect(downloader.isRetryableStatus(500, { retry_http_codes: [500] }, { config: {} })).toBe(true);
    expect(downloader.isRetryableStatus(404, { retry_http_codes: [500] }, { config: {} })).toBe(false);
    expect(downloader.isRetryableException(timeoutError)).toBe(true);
    expect(downloader.isRetryableException(new Error('permanent failure'))).toBe(false);
  });

  it('writes JSON exports incrementally and clears node-side cache after export', async () => {
    delete global.window;
    delete global.Blob;
    delete global.document;
    const outputPath = path.resolve(__dirname, './phase4-output.json');
    try {
      fs.unlinkSync(outputPath);
    } catch {}

    const exporter = new FeedExport(outputPath);
    exporter.addItem({ id: 1, title: 'a' });
    exporter.addItem({ id: 2, title: 'b' });
    await exporter.flushBuffer();
    await exporter.exportData();

    const parsed = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(parsed).toHaveLength(2);
    expect(exporter.data).toEqual([]);
    fs.unlinkSync(outputPath);
  });

  it('writes JSONL exports incrementally and clears node-side cache after export', async () => {
    delete global.window;
    delete global.Blob;
    delete global.document;
    const outputPath = path.resolve(__dirname, './phase4-output.jsonl');
    try {
      fs.unlinkSync(outputPath);
    } catch {}

    const exporter = new FeedExport(outputPath);
    exporter.addItem({ id: 1, title: 'a' });
    exporter.addItem({ id: 2, title: 'b' });
    await exporter.flushBuffer();
    await exporter.exportData();

    const content = fs.readFileSync(outputPath, 'utf8').trim().split('\n');
    expect(content).toHaveLength(2);
    expect(exporter.data).toEqual([]);
    fs.unlinkSync(outputPath);
  });

  it('posts export payloads to HTTP sinks', async () => {
    const calls = [];
    const originalAxios = global.axios;
    global.axios = {
      async request(config) {
        calls.push(config);
        return { status: 200, data: { ok: true } };
      }
    };

    try {
      const exporter = new FeedExport('https://sink.local/collect', {
        http: { headers: { Authorization: 'Bearer token' } }
      });
      exporter.addItem({ id: 1, title: 'sink' });
      await exporter.exportData();
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('https://sink.local/collect');
      expect(calls[0].headers.Authorization).toBe('Bearer token');
      expect(calls[0].data).toEqual([{ id: 1, title: 'sink' }]);
    } finally {
      global.axios = originalAxios;
    }
  });

  it('skips full HTML capture on the ChromeSpider path', async () => {
    let contentCalls = 0;
    const page = {
      tabId: 1,
      async goto() {},
      async waitForNavigation() {},
      async content() {
        contentCalls += 1;
        return '<html></html>';
      },
      async url() {
        return 'https://example.com/';
      },
      async waitForSelector() {}
    };

    const middleware = new ChromeDownloaderMiddleware({ resolvePage: async () => page });
    const response = await middleware.process_request(
      { url: 'https://example.com', meta: {} },
      { constructor: { name: 'ChromeSpider' }, rules: [] }
    );

    expect(contentCalls).toBe(0);
    expect(response.body).toBe('');
  });

  it('closes when page_count reaches the configured boundary', () => {
    const closeSpider = new CloseSpider({
      stats: {
        get(key) {
          return key === 'pageCount' ? 2 : 0;
        },
        itemCount: 0,
        startTime: Date.now(),
      }
    });

    closeSpider.addReason('page_count', 2);
    expect(closeSpider.check({})).toBe(true);
    expect(closeSpider.getClosingReason()).toBe('closespider_pagecount');
  });

  it('closes on item_count and timeout boundaries', () => {
    const closeSpider = new CloseSpider({
      stats: {
        get() {
          return 0;
        },
        itemCount: 3,
        startTime: Date.now() - 2000,
      }
    });

    closeSpider.addReason('item_count', 3);
    expect(closeSpider.check({})).toBe(true);
    closeSpider.reset();
    closeSpider.clearReasons();
    closeSpider.addReason('timeout', 1);
    expect(closeSpider.check({})).toBe(true);
  });

  it('runs Pipeline handlers in sequence', async () => {
    const pipeline = new Pipeline({ name: 'pipeline-test' });
    pipeline.addPipeline((item) => ({ ...item, first: true }));
    pipeline.addPipeline(async (item) => ({ ...item, second: item.first === true }));

    const result = await pipeline.process_item({ value: 1 }, { name: 'pipeline-test' });
    expect(result).toEqual({ value: 1, first: true, second: true });
  });

  it('runs a minimal Scrapy integration through Scheduler', async () => {
    class TestSpider extends BaseSpider {
      start_requests() {
        return [new Request('http://test.local/list')];
      }

      async *parse(response) {
        yield new Item({ url: response.url, text: response.text.trim() });
      }
    }

    const scrapy = new Scrapy({
      middlewares: [new StaticMiddleware({
        'http://test.local/list': { body: 'hello world' }
      })]
    });
    scrapy.spider = new TestSpider({ name: 'integration-test' });

    const items = await scrapy.start();
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe('http://test.local/list');
    expect(items[0].text).toBe('hello world');
  });

  it('persists run stats to disk when configured', async () => {
    const statsPath = path.resolve(__dirname, './phase5-run-stats.json');
    try {
      fs.unlinkSync(statsPath);
    } catch {}

    class StatsSpider extends BaseSpider {
      start_requests() {
        return [new Request('http://stats.local/list')];
      }

      async *parse(response) {
        yield new Item({ url: response.url });
      }
    }

    const scrapy = new Scrapy({
      middlewares: [new StaticMiddleware({
        'http://stats.local/list': { body: 'ok' }
      })],
      RUN_STATS_PATH: statsPath
    });
    scrapy.spider = new StatsSpider({ name: 'stats-test' });

    await scrapy.start();
    const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
    expect(stats.pageCount).toBe(1);
    expect(stats.itemCount).toBe(1);
    expect(typeof stats.elapsedMs).toBe('number');
    fs.unlinkSync(statsPath);
  });

  it('retries retryable responses and invokes errback after final failure', async () => {
    class RetryMiddleware {
      constructor() {
        this.calls = {};
      }

      isRetryableStatus(status) {
        return status === 500;
      }

      isRetryableException(error) {
        return error?.code === 'ETIMEDOUT';
      }

      async process_request(request) {
        this.calls[request.url] = (this.calls[request.url] || 0) + 1;
        if (request.url === 'http://retry.local/status' && this.calls[request.url] === 1) {
          return new Response({ url: request.url, status: 500, body: 'fail', request });
        }
        if (request.url === 'http://retry.local/error') {
          const error = new Error('timeout');
          error.code = 'ETIMEDOUT';
          throw error;
        }
        return new Response({ url: request.url, status: 200, body: 'ok', request });
      }

      async process_response(request, response) {
        return response;
      }

      async process_exception() {}
    }

    class RetrySpider extends BaseSpider {
      constructor(config) {
        super(config);
        this.events = [];
      }

      start_requests() {
        return [
          new Request('http://retry.local/status', null, { retry_times: 1 }),
          new Request('http://retry.local/error', null, { retry_times: 1, errback: 'onError' })
        ];
      }

      async *parse(response) {
        this.events.push(['parse', response.url, response.status]);
        yield new Item({ url: response.url, status: response.status });
      }

      async *onError(error) {
        this.events.push(['errback', error.code || error.message]);
        yield new Item({ errback: error.code || error.message });
      }
    }

    const retryMiddleware = new RetryMiddleware();
    const scrapy = new Scrapy({ middlewares: [retryMiddleware], RETRY_BACKOFF_BASE: 1 });
    const spider = new RetrySpider({ name: 'retry-test' });
    scrapy.spider = spider;

    const items = await scrapy.start();
    expect(items.map(item => ({ ...item })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))).toEqual([
      { errback: 'ETIMEDOUT' },
      { url: 'http://retry.local/status', status: 200 }
    ].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
    expect(retryMiddleware.calls).toEqual({
      'http://retry.local/status': 2,
      'http://retry.local/error': 2
    });
    expect(spider.events.map(event => JSON.stringify(event)).sort()).toEqual([
      ['parse', 'http://retry.local/status', 200],
      ['errback', 'ETIMEDOUT']
    ].map(event => JSON.stringify(event)).sort());
  });

  it('uses Rule and Scheduler semantics for callback and follow requests', async () => {
    class RuleSpider extends CrawlSpider {
      constructor(config) {
        super(config);
        this.visited = [];
      }

      start_requests() {
        return [new Request('http://rule.local/start', this._parse_response.bind(this))];
      }

      async *parse(response) {
        this.visited.push(['parse', response.url]);
        if (response.url.endsWith('/start')) {
          yield new Item({ kind: 'list', url: response.url });
        }
      }

      async *parse_detail(response, scrapy, cb_kwargs) {
        this.visited.push(['detail', response.url, cb_kwargs.kind]);
        yield new Item({ kind: cb_kwargs.kind, url: response.url });
      }
    }

    const spider = new RuleSpider({
      name: 'rule-test',
      rules: [
        new Rule({
          link_extractor: new LinkExtractor({
            restrict_css: ['a.detail-link'],
            attrs: ['href']
          }),
          callback: 'parse_detail',
          cb_kwargs: { kind: 'detail' },
          follow: false,
          process_request: (request) => {
            request.priority = 5;
            return request;
          }
        })
      ]
    });

    const scrapy = new Scrapy({
      middlewares: [new StaticMiddleware({
        'http://rule.local/start': {
          body: '<a class="detail-link" href="/detail/1">one</a><a class="detail-link" href="/detail/2">two</a>'
        },
        'http://rule.local/detail/1': { body: '<html>detail 1</html>' },
        'http://rule.local/detail/2': { body: '<html>detail 2</html>' }
      })]
    });
    scrapy.spider = spider;

    const items = await scrapy.start();
    expect(items.map(item => item.kind)).toEqual(['list', 'detail', 'detail']);
    expect(spider.visited).toEqual([
      ['parse', 'http://rule.local/start'],
      ['detail', 'http://rule.local/detail/1', 'detail'],
      ['detail', 'http://rule.local/detail/2', 'detail']
    ]);
  });
});
