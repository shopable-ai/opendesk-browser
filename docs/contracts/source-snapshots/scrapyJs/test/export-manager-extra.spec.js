const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { EventEmitter } = require('events');
const { Writable } = require('stream');
const ExportManager = require('../src/exporter/ExportManager');

const turn = () => new Promise(resolve => setImmediate(resolve));
let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scrapy-manager-')); });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('ExportManager stream lifecycle helpers', () => {
  it('requires both the write callback and drain, in either order', async () => {
    for (const first of ['callback', 'drain']) {
      const stream = new EventEmitter();
      let callback;
      stream.write = (chunk, cb) => { callback = cb; return false; };
      let settled = false;
      const result = ExportManager.writeToStream(stream, 'x').then(() => { settled = true; });
      if (first === 'callback') callback?.(); else stream.emit('drain');
      await turn();
      expect(settled).toBe(false);
      if (first === 'callback') stream.emit('drain'); else callback?.();
      await result;
      expect(stream.listenerCount('drain')).toBe(0);
    }
  });

  it('observes late errors after successful writes and rejects later operations with that error', async () => {
    const stream = new Writable({ autoDestroy: false, write(chunk, encoding, cb) { cb(); } });
    for (let index = 0; index < 20; index++) await ExportManager.writeToStream(stream, 'x');
    expect(stream.listenerCount('error')).toBe(1);
    expect(stream.listenerCount('drain')).toBe(0);
    const error = new Error('late storage failure');
    expect(() => stream.emit('error', error)).not.toThrow();
    await expect(ExportManager.writeToStream(stream, 'next')).rejects.toBe(error);
    await expect(ExportManager.endStream(stream)).rejects.toBe(error);
    await ExportManager.destroyStream(stream);
    expect(stream.closed).toBe(true);
    expect(stream.listenerCount('close')).toBe(0);
    expect(stream.listenerCount('finish')).toBe(0);
    expect(() => stream.emit('error', error)).not.toThrow();
  });

  it('cleans operation listeners after a synchronous write throw and retains error observation', async () => {
    const stream = new EventEmitter();
    const error = new Error('synchronous write failure');
    stream.write = () => { throw error; };
    await expect(ExportManager.writeToStream(stream, 'x')).rejects.toBe(error);
    expect(stream.listenerCount('drain')).toBe(0);
    expect(stream.listenerCount('error')).toBe(1);
    expect(() => stream.emit('error', error)).not.toThrow();
  });

  it('waits for the file descriptor close after finish on an autoClose fs stream', async () => {
    let releaseClose;
    const stream = fs.createWriteStream(path.join(tmp, 'close.txt'), {
      fs: {
        open: fs.open,
        write: fs.write,
        close(fd, cb) { releaseClose = () => { releaseClose = null; fs.close(fd, cb); }; },
      },
    });
    await ExportManager.writeToStream(stream, 'x');
    let settled = false;
    const ending = ExportManager.endStream(stream).then(() => { settled = true; });
    try {
      for (let index = 0; !releaseClose && index < 100; index++) await turn();
      expect(typeof releaseClose).toBe('function');
      expect(settled).toBe(false);
      releaseClose();
      await ending;
      expect(stream.closed).toBe(true);
    } finally {
      releaseClose?.();
      await ending;
      if (!stream.closed) await new Promise(resolve => stream.once('close', resolve));
    }
  });

  it('resolves generic writable completion at finish and removes local listeners', async () => {
    const stream = new Writable({ autoDestroy: false, write(chunk, encoding, cb) { cb(); } });
    await ExportManager.endStream(stream);
    expect(stream.writableFinished).toBe(true);
    expect(stream.closed).toBe(false);
    expect(stream.listenerCount('error')).toBe(1);
    await ExportManager.endStream(stream);
    await ExportManager.destroyStream(stream);
    expect(stream.listenerCount('finish')).toBe(0);
    expect(stream.listenerCount('close')).toBe(0);
  });

  it('awaits asynchronous destruction and preserves a cleanup failure', async () => {
    for (const error of [null, new Error('destroy failed')]) {
      let complete;
      const stream = new Writable({ write() {}, destroy(reason, cb) { complete = cb; } });
      let settled = false;
      const outcome = ExportManager.destroyStream(stream).then(
        () => { settled = true; return null; },
        failure => { settled = true; return failure; },
      );
      await turn();
      expect(settled).toBe(false);
      complete(error);
      expect(await outcome).toBe(error);
      expect(stream.closed).toBe(true);
      await ExportManager.destroyStream(stream);
    }
    await ExportManager.destroyStream(null);
  });

  it('creates exclusively with wx and observes open errors before any write', async () => {
    const file = path.join(tmp, 'existing.txt');
    fs.writeFileSync(file, 'original');
    const stream = ExportManager.createWriteStream(file, { flags: 'wx' });
    try {
      expect(stream.listenerCount('error')).toBe(1);
      const failure = ExportManager.writeToStream(stream, 'new').catch(error => error);
      expect(await failure).toMatchObject({ code: 'EEXIST' });
      expect(fs.readFileSync(file, 'utf8')).toBe('original');
    } finally {
      // This test must also clean up the baseline implementation's unobserved stream.
      stream.on('error', () => {});
      if (!stream.closed) {
        const closed = new Promise(resolve => stream.once('close', resolve));
        stream.destroy();
        await closed;
      }
    }
  });
});

describe('ExportManager strict serialization and CSV ownership', () => {
  it.each([
    ['undefined', undefined], ['function', () => {}], ['symbol', Symbol('x')], ['bigint', 1n],
    ['NaN', NaN], ['Infinity', Infinity], ['negative Infinity', -Infinity],
  ])('rejects %s at the JSON root, in objects and in arrays', (label, value) => {
    for (const candidate of [value, { field: value }, [value]]) {
      expect(() => ExportManager.stringify(candidate)).toThrow(/JSON|finite|serializ/i);
    }
  });

  it('rejects circular graphs, symbol fields and array fields that JSON would silently omit', () => {
    const circular = {}; circular.self = circular;
    const symbolField = { id: 1, [Symbol('hidden')]: 2 };
    const extraArrayField = [1]; extraArrayField.extra = 2;
    for (const value of [circular, symbolField, extraArrayField, Array(1)]) {
      expect(() => ExportManager.stringify(value)).toThrow(/JSON|circular|serializ/i);
    }
  });

  it('keeps valid JSON, shared non-circular values, inherited fields and space compatible', () => {
    const shared = { id: 0, enabled: false, empty: null };
    const value = Object.assign(Object.create({ inherited: undefined }), { left: shared, right: shared });
    expect(ExportManager.stringify(value, 2)).toBe(JSON.stringify({ left: shared, right: shared }, null, 2));
    expect(ExportManager.stringify(new Date('2020-01-01T00:00:00Z'))).toBe('"2020-01-01T00:00:00.000Z"');
    expect(ExportManager.toJSON([shared])).toBe(JSON.stringify([shared], null, 2));
  });

  it('does not let toJSON hide invalid fields or introduce invalid values', () => {
    const hidden = { bad: undefined, toJSON() { return { id: 1 }; } };
    const transformed = Object.create({ toJSON() { return { bad: undefined }; } });
    expect(() => ExportManager.stringify(hidden)).toThrow(/JSON|serializ/i);
    expect(() => ExportManager.stringify(transformed)).toThrow(/JSON|serializ/i);
  });

  it('flattens only own fields and safely retains __proto__ and constructor as data', () => {
    const value = Object.assign(Object.create({ inherited: 9 }), { id: 1 });
    expect(ExportManager.flattenObject(value)).toEqual({ id: 1 });
    const dangerous = JSON.parse('{"__proto__":"literal","constructor":"data"}');
    const flattened = ExportManager.flattenObject(dangerous);
    expect(Object.hasOwn(flattened, '__proto__')).toBe(true);
    expect(flattened.__proto__).toBe('literal');
    expect(ExportManager.toCSV([dangerous])).toBe('__proto__,constructor\nliteral,data');
    expect(ExportManager.toCSVRows([{}], ['toString', '__proto__'])).toEqual([',']);
  });

  it('rejects flatten cycles but allows reused nested objects', () => {
    const circular = {}; circular.self = circular;
    expect(() => ExportManager.flattenObject(circular)).toThrow(/circular|cycle/i);
    const shared = { id: 1 };
    expect(ExportManager.flattenObject({ a: shared, b: shared })).toEqual({ a_id: 1, b_id: 1 });
  });

  it('validates duplicate and unknown CSV columns using own fields', () => {
    expect(() => ExportManager.validateCSVColumns([], ['id', 'id'])).toThrow(/duplicate|column/i);
    expect(() => ExportManager.validateCSVColumns([{ id: 1, extra: 2 }], ['id'])).toThrow(/unknown|column/i);
    const row = Object.assign(Object.create({ extra: 2 }), { id: 1 });
    expect(() => ExportManager.validateCSVColumns([row], ['id', 'optional'])).not.toThrow();
    expect(ExportManager.toCSV([row], ['id', 'optional'])).toBe('id,optional\n1,');
    expect(() => ExportManager.toCSVRows([{ id: 1 }], ['id', 'id'])).toThrow(/duplicate|column/i);
  });
});

describe('ExportManager sink capabilities and acknowledgements', () => {
  function browserSink() {
    const click = vi.fn();
    const browserURL = { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() };
    const browser = {
      Blob: class Blob {}, URL: browserURL,
      document: { createElement: vi.fn(() => ({ click })) },
    };
    vi.stubGlobal('window', browser);
    return { click, browserURL, browser };
  }

  it('detects actual Node fs capabilities and prioritizes them over window and chrome globals', async () => {
    const { click } = browserSink();
    vi.stubGlobal('chrome', { downloads: {} });
    expect(ExportManager.getFs()).toBe(fs);
    expect(ExportManager.hasBrowserSink()).toBe(true);
    const file = path.join(tmp, 'node.json');
    await ExportManager.saveToFile(file, '{"id":1}');
    expect(fs.readFileSync(file, 'utf8')).toBe('{"id":1}');
    expect(click).not.toHaveBeenCalled();
  });

  it('checks browser capabilities and reports only download initiation', async () => {
    vi.stubGlobal('window', { URL: {}, Blob: class Blob {}, document: {} });
    expect(ExportManager.hasBrowserSink()).toBe(false);
    const { click, browserURL } = browserSink();
    const result = ExportManager.saveToFileBrowser('data.json', '{}', 'application/json');
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toEqual({ ackLevel: 'download-initiated' });
    expect(click).toHaveBeenCalledTimes(1);
    expect(browserURL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('returns the browser acknowledgement through saveToFile and revokes failed downloads', async () => {
    const { click, browserURL } = browserSink();
    vi.spyOn(ExportManager, 'getFs').mockReturnValue(null);
    expect(await ExportManager.saveToFile('data.json', '{}')).toEqual({ ackLevel: 'download-initiated' });
    const error = new Error('click failed');
    click.mockImplementation(() => { throw error; });
    await expect(ExportManager.saveToFileBrowser('data.json', '{}')).rejects.toBe(error);
    expect(browserURL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('supports static jsonl export with the save promise and rejects unsupported formats', async () => {
    const file = path.join(tmp, 'items.jsonl');
    await ExportManager.export([{ id: 0 }, { enabled: false }], file);
    expect(fs.readFileSync(file, 'utf8')).toBe('{"id":0}\n{"enabled":false}\n');
    await expect(ExportManager.export([], path.join(tmp, 'data.unsupported'))).rejects.toThrow(/format/i);
  });

  it.each([200, 201, 204])('returns the HTTP %s response as acknowledgement', async status => {
    const response = { status, data: 'ack' };
    const request = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('axios', { request });
    expect(await ExportManager.postJSON('https://sink.local', [{ id: 1 }])).toBe(response);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([199, 302, 400, 500, undefined])('rejects HTTP %s without resubmitting', async status => {
    const request = vi.fn().mockResolvedValue({ status });
    vi.stubGlobal('axios', { request });
    await expect(ExportManager.postJSON('https://sink.local', [{ id: 1 }])).rejects.toThrow(/HTTP|status/i);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('preserves transport errors and rejects lossy JSON before sending', async () => {
    const error = new Error('transport failed');
    const request = vi.fn().mockRejectedValue(error);
    vi.stubGlobal('axios', { request });
    await expect(ExportManager.postJSON('https://sink.local', [{ id: 1 }])).rejects.toBe(error);
    await expect(ExportManager.postJSON('https://sink.local', [{ bad: undefined }])).rejects.toThrow(/JSON|serializ/i);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not automatically resend a POST body after an HTTP redirect', async () => {
    const calls = [];
    const server = http.createServer((request, response) => {
      calls.push(request.url);
      request.resume();
      if (request.url === '/initial') {
        response.writeHead(307, { Location: '/redirected' });
      } else {
        response.writeHead(200);
      }
      response.end();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const url = `http://127.0.0.1:${server.address().port}/initial`;
      await expect(ExportManager.postJSON(url, [{ id: 1 }], { headers: { Connection: 'close' } })).rejects.toMatchObject({ status: 307 });
      expect(calls).toEqual(['/initial']);
    } finally {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
