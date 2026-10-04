const streamStates = new WeakMap();
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function recordError(state, error) {
  if (!state.error) state.error = error;
  return state.error;
}

function observeStream(stream) {
  let state = streamStates.get(stream);
  if (state) return state;
  state = {
    error: stream.errored || null,
    closed: stream.closed === true,
    finished: stream.writableFinished === true,
  };
  streamStates.set(stream, state);
  // Keep one error observer even after an operation settles or the stream closes.
  stream.on('error', error => recordError(state, error));
  const onFinish = () => { state.finished = true; };
  if (!state.closed) {
    if (!state.finished) stream.once('finish', onFinish);
    stream.once('close', () => {
      state.closed = true;
      stream.off('finish', onFinish);
    });
  }
  return state;
}

function prematureClose() {
  const error = new Error('Stream closed before the operation completed.');
  error.code = 'ERR_STREAM_PREMATURE_CLOSE';
  return error;
}

function browserCapabilities() {
  const root = typeof window !== 'undefined' && window ? window : globalThis;
  return {
    Blob: root.Blob ?? globalThis.Blob,
    URL: root.URL ?? globalThis.URL,
    document: root.document ?? globalThis.document,
  };
}

function validateJSONScalar(value) {
  const type = typeof value;
  if (['undefined', 'function', 'symbol', 'bigint'].includes(type)) {
    throw new TypeError(`JSON serialization does not support ${type} values.`);
  }
  if (type === 'number' && !Number.isFinite(value)) {
    throw new TypeError('JSON serialization requires finite numbers.');
  }
}

function validateJSONFields(value) {
  if (Object.getOwnPropertySymbols(value).some(key => Object.prototype.propertyIsEnumerable.call(value, key))) {
    throw new TypeError('JSON serialization cannot preserve symbol fields.');
  }
  if (Array.isArray(value) && Object.keys(value).some(key => !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) {
    throw new TypeError('JSON serialization cannot preserve extra array fields.');
  }
}

/** Manager for file, browser, and HTTP export helpers. */
class ExportManager {
  static getFs() {
    try {
      const fs = require('fs');
      if (typeof fs.createWriteStream === 'function' && typeof fs.promises?.writeFile === 'function') return fs;
    } catch {}
    return null;
  }

  static hasBrowserSink() {
    const browser = browserCapabilities();
    return typeof browser.Blob === 'function' &&
      typeof browser.URL?.createObjectURL === 'function' &&
      typeof browser.URL?.revokeObjectURL === 'function' &&
      typeof browser.document?.createElement === 'function';
  }

  static flattenObject(item, prefix = '') {
    const flattened = {};
    const ancestors = new Set();
    const visit = (value, currentPrefix) => {
      if (ancestors.has(value)) throw new TypeError('Circular object cannot be flattened.');
      ancestors.add(value);
      try {
        for (const key of Object.keys(value)) {
          const field = `${currentPrefix}${key}`;
          const child = value[key];
          if (child !== null && typeof child === 'object') {
            visit(child, `${field}_`);
          } else {
            if (hasOwn(flattened, field)) throw new Error(`Flattened key collision: ${field}`);
            Object.defineProperty(flattened, field, { value: child, enumerable: true, writable: true, configurable: true });
          }
        }
      } finally {
        ancestors.delete(value);
      }
    };
    visit(item, prefix);
    return flattened;
  }

  static escapeCSVValue(value) {
    if (value == null) return '';
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  // Items here are already flattened; missing columns are allowed, unknown ones are not.
  static validateCSVColumns(items, headers) {
    if (!Array.isArray(headers) || headers.some(header => typeof header !== 'string')) {
      throw new TypeError('CSV columns must be an array of strings.');
    }
    const columns = new Set(headers);
    if (columns.size !== headers.length) throw new Error('Duplicate CSV column.');
    for (const item of items) {
      for (const key of Object.keys(item)) {
        if (!columns.has(key)) throw new Error(`Unknown CSV column: ${key}`);
      }
    }
  }

  static toCSV(items, headers) {
    const flattened = items.map(item => this.flattenObject(item));
    const columns = headers ?? Array.from(new Set(flattened.flatMap(item => Object.keys(item))));
    const rows = this.toCSVRows(flattened, columns);
    if (columns.length === 0) return '';
    return [columns.map(header => this.escapeCSVValue(header)).join(','), ...rows].join('\n');
  }

  static toCSVRows(items, headers) {
    this.validateCSVColumns(items, headers);
    return items.map(item => headers.map(header => this.escapeCSVValue(hasOwn(item, header) ? item[header] : '')).join(','));
  }

  static stringify(value, space) {
    const ancestors = new Set();
    const visit = current => {
      validateJSONScalar(current);
      if (current === null || typeof current !== 'object') return;
      if (ancestors.has(current)) throw new TypeError('Circular value cannot be serialized as JSON.');
      validateJSONFields(current);
      ancestors.add(current);
      try {
        if (Array.isArray(current)) {
          for (let index = 0; index < current.length; index++) visit(current[index]);
        } else {
          for (const key of Object.keys(current)) visit(current[key]);
        }
      } finally {
        ancestors.delete(current);
      }
    };
    visit(value);
    // Also validate values produced by toJSON/getters during serialization.
    return JSON.stringify(value, (key, current) => {
      validateJSONScalar(current);
      if (current !== null && typeof current === 'object') validateJSONFields(current);
      return current;
    }, space);
  }

  static appendFileNode(filename, data) {
    return this.getFs().promises.appendFile(filename, data);
  }

  static async writeFileNode(filename, data) {
    return this.getFs().promises.writeFile(filename, data);
  }

  static createWriteStream(filename, options = {}) {
    const stream = this.getFs().createWriteStream(filename, { flags: 'w', ...options });
    observeStream(stream);
    return stream;
  }

  static writeToStream(stream, chunk) {
    const state = observeStream(stream);
    if (state.error) return Promise.reject(state.error);
    if (state.closed || stream.destroyed) return Promise.reject(recordError(state, prematureClose()));
    return new Promise((resolve, reject) => {
      let callbackDone = false;
      let drained = false;
      let returned = false;
      let needsDrain = false;
      let settled = false;
      const cleanup = () => {
        stream.off('error', onError);
        stream.off('drain', onDrain);
        stream.off('close', onClose);
      };
      const fail = error => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(recordError(state, error));
      };
      const complete = () => {
        if (!settled && returned && callbackDone && (!needsDrain || drained)) {
          settled = true;
          cleanup();
          resolve();
        }
      };
      const onError = error => fail(error);
      const onDrain = () => { drained = true; complete(); };
      const onClose = () => fail(state.error || prematureClose());
      stream.on('error', onError);
      stream.on('drain', onDrain);
      stream.on('close', onClose);
      try {
        needsDrain = stream.write(chunk, error => {
          if (error) fail(error);
          else { callbackDone = true; complete(); }
        }) === false;
        returned = true;
        complete();
      } catch (error) {
        fail(error);
      }
    });
  }

  static endStream(stream) {
    const state = observeStream(stream);
    if (state.error) return Promise.reject(state.error);
    if ((state.closed || stream.destroyed) && !state.finished) return Promise.reject(recordError(state, prematureClose()));
    return new Promise((resolve, reject) => {
      const waitForClose = stream.autoClose === true;
      let settled = false;
      const cleanup = () => {
        stream.off('error', onError);
        stream.off('finish', onFinish);
        stream.off('close', onClose);
      };
      const fail = error => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(recordError(state, error));
      };
      const complete = () => {
        if (!settled && state.finished && (!waitForClose || state.closed)) {
          settled = true;
          cleanup();
          resolve();
        }
      };
      const onError = error => fail(error);
      const onFinish = () => { state.finished = true; complete(); };
      const onClose = () => {
        state.closed = true;
        if (!state.finished) fail(state.error || prematureClose());
        else complete();
      };
      stream.on('error', onError);
      stream.on('finish', onFinish);
      stream.on('close', onClose);
      try {
        if (!state.finished && !stream.writableEnded) stream.end();
        complete();
      } catch (error) {
        fail(error);
      }
    });
  }

  static destroyStream(stream) {
    if (!stream) return Promise.resolve();
    const state = observeStream(stream);
    if (state.closed) return Promise.resolve();
    const priorError = state.error;
    return new Promise((resolve, reject) => {
      let cleanupError = null;
      const cleanup = () => {
        stream.off('error', onError);
        stream.off('close', onClose);
      };
      const onError = error => {
        if (error !== priorError && !cleanupError) cleanupError = error;
      };
      const onClose = () => {
        cleanup();
        if (cleanupError) reject(cleanupError);
        else resolve();
      };
      stream.on('error', onError);
      stream.on('close', onClose);
      try {
        stream.destroy();
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }

  static async postJSON(url, data, options = {}) {
    this.stringify(data);
    const axiosClient = globalThis.axios || require('axios');
    const response = await axiosClient.request({
      url,
      method: options.method || 'POST',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      data,
      timeout: options.timeout ?? 30000,
      maxRedirects: 0,
      validateStatus: () => true,
    });
    if (!Number.isInteger(response?.status) || response.status < 200 || response.status >= 300) {
      const error = new Error(`HTTP export failed with status ${response?.status}.`);
      error.status = response?.status;
      error.response = response;
      throw error;
    }
    return response;
  }

  static getFormat(filePath) {
    if (!filePath) return;
    if (/^https?:\/\//i.test(filePath)) return 'http';
    const ext = filePath.split('.').pop().toLowerCase();
    if (ext) return ext;
    throw new Error('Unsupported export format');
  }

  static async saveToFile(filename, data, mimeType = 'text/plain') {
    if (this.getFs()) return this.saveToFileNode(filename, data);
    return this.saveToFileBrowser(filename, data, mimeType);
  }

  static async saveToFileBrowser(filename, data, mimeType = 'text/plain') {
    if (!this.hasBrowserSink()) throw new Error('Browser download sink is unavailable.');
    const browser = browserCapabilities();
    const url = browser.URL.createObjectURL(new browser.Blob([data], { type: mimeType }));
    try {
      const anchor = browser.document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      return { ackLevel: 'download-initiated' };
    } finally {
      browser.URL.revokeObjectURL(url);
    }
  }

  static async saveToFileNode(filename, data) {
    return this.writeFileNode(filename, data);
  }

  static async export(items, filename) {
    const format = this.getFormat(filename);
    if (format === 'http') return this.postJSON(filename, items);
    let data;
    if (format === 'json') data = this.toJSON(items);
    else if (format === 'jsonl') data = items.map(item => `${this.stringify(item)}\n`).join('');
    else if (format === 'csv') data = this.toCSV(items);
    else throw new Error(`Unsupported export format: ${format}`);
    return this.saveToFile(filename, data, format === 'csv' ? 'text/csv' : 'application/json');
  }

  static toJSON(items) {
    return this.stringify(items, 2);
  }
}

module.exports = ExportManager;
