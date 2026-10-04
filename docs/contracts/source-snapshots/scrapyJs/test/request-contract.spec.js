const Request = require('../src/http/Request');

const url = 'https://request.local/start';
const signatures = [
  ['url/options', options => new Request(url, options)],
  ['url/callback/options', options => new Request(url, options.callback ?? null, options)],
];

describe('Request constructor contract', () => {
  for (const [signature, create] of signatures) {
    it(`accepts the ${signature} signature with callback and download options`, () => {
      const callback = () => {};
      const request = create({ callback, method: 'post', body: false, timeout: 0, responseType: 'json' });

      expect(request.url).toBe(url);
      expect(request.callback).toBe(callback);
      expect(request.method).toBe('POST');
      expect(request.body).toBe(false);
      expect(request.timeout).toBe(0);
      expect(request.responseType).toBe('json');
    });

    it(`leaves omitted retry limits unset through ${signature} serialization and cloning`, () => {
      const request = create({});

      expect(request.retries).toBeUndefined();
      expect(request.retry_times).toBeUndefined();
      for (const candidate of [request.toOptions(), request.clone()]) {
        expect(candidate.retries).toBeUndefined();
        expect(candidate.retry_times).toBeUndefined();
      }
      expect(request.getRetryTimes()).toBeUndefined();
      expect(request.clone().getRetryTimes()).toBeUndefined();
    });
  }

  it('keeps the positional callback authoritative in the three-argument signature', () => {
    const request = new Request(url, 'parse', { callback: 'otherMethod' });

    expect(request.callback).toBe('parse');
    expect(new Request(url, { callback: 'parse' }).callback).toBe('parse');
  });

  it('copies caller-owned headers, meta and retry HTTP status arrays', () => {
    const options = { headers: { Accept: 'application/json' }, meta: { page: 1 }, retry_http_codes: [500] };
    const request = new Request(url, options);
    options.headers.Accept = 'text/html';
    options.meta.page = 2;
    options.retry_http_codes.push(503);

    expect(request.headers).toEqual({ Accept: 'application/json' });
    expect(request.meta).toEqual({ page: 1 });
    expect(request.retry_http_codes).toEqual([500]);
  });
});

describe('Request retry contract', () => {
  it.each([
    [0, 0],
    [2, 2],
    ['0', 0],
    ['4', 4],
    [' 0 ', 0],
  ])('normalizes the non-negative integer %s without discarding zero', (value, expected) => {
    for (const [, create] of signatures) {
      for (const alias of ['retries', 'retry_times']) {
        const request = create({ [alias]: value });

        expect(request[alias]).toBe(expected);
        expect(request.getRetryTimes()).toBe(expected);
      }
    }
    expect(Request.normalizeRetryTimes(value)).toBe(expected);
  });

  it.each([
    ['true', true],
    ['false', false],
    ['empty string', ''],
    ['whitespace', ' \t\n '],
    ['null', null],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['negative Infinity', -Infinity],
    ['negative integer', -1],
    ['fraction', 1.5],
    ['negative string', '-1'],
    ['fraction string', '1.5'],
    ['non-numeric string', 'zero'],
    ['NaN string', 'NaN'],
    ['Infinity string', 'Infinity'],
    ['array', []],
    ['object', {}],
    ['boxed number', new Number(0)],
    ['bigint', 0n],
    ['symbol', Symbol('zero')],
  ])('rejects %s retry limits in both aliases and constructor signatures', (label, value) => {
    for (const [, create] of signatures) {
      for (const alias of ['retries', 'retry_times']) {
        expect(() => create({ [alias]: value })).toThrow(/non-negative integer/);
      }
    }
  });

  it.each([
    [{ retries: 7, retry_times: 0 }, 0],
    [{ retries: 0, retry_times: 2 }, 2],
    [{ retries: '7', retry_times: '0' }, 0],
    [{ retries: 0, retry_times: undefined }, 0],
    [{ retries: undefined, retry_times: 0 }, 0],
  ])('gives retry_times precedence over retries for %j', (options, expected) => {
    for (const [, create] of signatures) {
      const request = create(options);

      expect(request.getRetryTimes()).toBe(expected);
      expect(request.clone().getRetryTimes()).toBe(expected);
    }
  });

  it('rejects invalid aliases even when the other alias would take precedence', () => {
    expect(() => new Request(url, { retries: false, retry_times: 0 })).toThrow(/retries/);
    expect(() => new Request(url, { retries: 0, retry_times: '' })).toThrow(/retry_times/);
  });

  it('offers the same validation to Scheduler for inherited retry limits', () => {
    expect(Request.normalizeRetryTimes(undefined)).toBeUndefined();
    expect(Request.normalizeRetryTimes('0', 'RETRY_TIMES')).toBe(0);
    expect(() => Request.normalizeRetryTimes(false, 'RETRY_TIMES')).toThrow(/RETRY_TIMES.*non-negative integer/);
  });
});

describe('Request copy contract', () => {
  it('clones callback, explicit values, response type, aliases and retry bookkeeping', () => {
    const callback = () => {};
    const errback = () => {};
    const request = new Request(url, callback, {
      headers: { Accept: 'application/json' },
      method: 'POST',
      body: false,
      meta: { enabled: false, count: 0, empty: null },
      priority: 0,
      dont_filter: false,
      timeout: 0,
      errback,
      cookies: null,
      userAgent: null,
      encoding: null,
      clickSelector: null,
      waitForSelector: null,
      responseType: 'json',
      retries: 7,
      retry_times: 0,
      retry_http_codes: [500, 503],
      proxy: false,
      download_delay: 0,
      _retryCount: 0,
      _retryRequest: false,
      _availableAt: 123,
    });
    const clone = request.clone();

    expect(clone).toBeInstanceOf(Request);
    expect(clone).not.toBe(request);
    expect(clone).toMatchObject({
      url, callback, errback, method: 'POST', body: false, priority: 0, dont_filter: false,
      timeout: 0, cookies: null, userAgent: null, encoding: null, clickSelector: null,
      waitForSelector: null, responseType: 'json', retries: 7, retry_times: 0,
      proxy: false, download_delay: 0, _retryCount: 0, _retryRequest: false, _availableAt: 123,
    });
    expect(clone.getRetryTimes()).toBe(0);
    expect(clone.headers).not.toBe(request.headers);
    expect(clone.meta).not.toBe(request.meta);
    expect(clone.retry_http_codes).not.toBe(request.retry_http_codes);
    clone.headers.Accept = 'text/html';
    clone.meta.count = 1;
    clone.retry_http_codes.push(429);

    expect(request.headers.Accept).toBe('application/json');
    expect(request.meta).toEqual({ enabled: false, count: 0, empty: null });
    expect(request.retry_http_codes).toEqual([500, 503]);
  });

  it('serializes detached headers and meta with explicit values and responseType', () => {
    const request = new Request(url, 'parse', {
      headers: { Accept: 'application/json' }, meta: { count: 0, empty: null }, body: false,
      timeout: 0, responseType: 'arraybuffer', retries: 0, retry_http_codes: [500], proxy: null,
    });
    const options = request.toOptions();

    expect(options).toMatchObject({
      callback: 'parse', body: false, timeout: 0, responseType: 'arraybuffer', retries: 0, proxy: null,
    });
    for (const [, create] of signatures) {
      const restored = create(options);
      expect(restored.callback).toBe('parse');
      expect(restored.body).toBe(false);
      expect(restored.timeout).toBe(0);
      expect(restored.responseType).toBe('arraybuffer');
      expect(restored.getRetryTimes()).toBe(0);
      expect(restored.proxy).toBeNull();
    }
    options.headers.Accept = 'text/html';
    options.meta.count = 1;
    options.retry_http_codes.push(503);

    expect(request.headers.Accept).toBe('application/json');
    expect(request.meta).toEqual({ count: 0, empty: null });
    expect(request.retry_http_codes).toEqual([500]);
  });

  it('honors null, false and zero overrides without mutating the original', () => {
    const request = new Request(url, 'parse', {
      body: 'payload', timeout: 10, priority: 5, dont_filter: true, errback: 'onError',
      cookies: 'session=1', proxy: { host: 'proxy.local' }, download_delay: 10, responseType: 'json',
    });
    const clone = request.clone({
      url: 'https://request.local/next', callback: null, body: null, timeout: 0, priority: 0,
      dont_filter: false, errback: null, cookies: null, proxy: false, download_delay: 0, responseType: null,
    });

    expect(clone).toMatchObject({
      url: 'https://request.local/next', callback: null, body: null, timeout: 0, priority: 0,
      dont_filter: false, errback: null, cookies: null, proxy: false, download_delay: 0, responseType: null,
    });
    expect(request).toMatchObject({
      url, callback: 'parse', body: 'payload', timeout: 10, priority: 5, dont_filter: true,
      errback: 'onError', cookies: 'session=1', proxy: { host: 'proxy.local' },
      download_delay: 10, responseType: 'json',
    });
  });

  it('allows alias overrides and explicit undefined to restore inheritance', () => {
    const request = new Request(url, { retries: 7, retry_times: 2 });

    expect(request.clone({ retry_times: 0 }).getRetryTimes()).toBe(0);
    expect(request.clone({ retries: 0 }).getRetryTimes()).toBe(2);
    expect(request.clone({ retries: 0, retry_times: undefined }).getRetryTimes()).toBe(0);
    expect(request.clone({ retries: undefined, retry_times: undefined }).getRetryTimes()).toBeUndefined();
    expect(request.getRetryTimes()).toBe(2);
    expect(() => request.clone({ retries: false })).toThrow(/retries/);
  });

  it('replaces header/meta overrides and copies the supplied containers', () => {
    const request = new Request(url, { headers: { Original: 'yes' }, meta: { original: true } });
    const overrides = { headers: { Accept: 'application/json' }, meta: { count: 0, empty: null } };
    const clone = request.clone(overrides);
    overrides.headers.Accept = 'text/html';
    overrides.meta.count = 1;

    expect(clone.headers).toEqual({ Accept: 'application/json' });
    expect(clone.meta).toEqual({ count: 0, empty: null });
    expect(request.headers).toEqual({ Original: 'yes' });
    expect(request.meta).toEqual({ original: true });
  });
});
