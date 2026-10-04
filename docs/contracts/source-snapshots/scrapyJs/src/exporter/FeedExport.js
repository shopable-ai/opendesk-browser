const ExportManager = require('./ExportManager');
const outputOwners = new Map();
let partSequence = 0;

class FeedExport {
  constructor(outputPath, options = {}) {
    this.outputPath = outputPath;
    this.options = options;
    this.format = this.getFormat(outputPath);
    this.data = [];
    this.buffer = [];
    this.bufferLimit = options.bufferLimit ?? 100;
    this.headers = options.fields ? [...options.fields] : null;
    this.stream = null;
    this.tempPath = null;
    this.hasWrittenHeader = false;
    this.hasWrittenAnyItem = false;
    this._tail = Promise.resolve();
    this._final = null;
    this._error = null;
    this._closing = false;
    this._accepted = 0;
    this._committed = 0;
    this._unknown = 0;
    this._ackLevel = outputPath ? null : 'memory';
    this._fs = options.sink ? null : ExportManager.getFs();
    this._nodeFile = !!(outputPath && this.format !== 'http' && this._fs);
  }

  getFormat(filePath) { return ExportManager.getFormat(filePath); }
  get delivery() {
    return Object.freeze({
      accepted: this._accepted, committed: this._committed,
      pending: this._accepted - this._committed - this._unknown,
      deliveryUnknown: this._unknown, ackLevel: this._ackLevel,
      outputPath: this.outputPath, tempPath: this.tempPath
    });
  }

  addItem(item) {
    if (this._closing) throw new Error('Exporter is closing or finalized');
    if (this._error) throw this._error;
    if (item == null) return false;
    // Snapshot before acceptance, so queued batches cannot change afterwards.
    const value = this.outputPath ? JSON.parse(ExportManager.stringify(item)) : item;
    if (!this._nodeFile) this.data.push(value);
    if (this.outputPath) this.buffer.push(value);
    this._accepted++;
    if (!this.outputPath) this._committed++;
    return true;
  }

  shouldFlushBuffer() { return this._nodeFile && this.buffer.length >= this.bufferLimit; }
  _enqueue(action) {
    const task = this._tail.then(async () => {
      if (this._error) throw this._error;
      return action();
    });
    // Immediately observe failure; retain it for every subsequent operation.
    this._tail = task.catch(error => { this._error ||= error; });
    return task;
  }

  async _claimTarget() {
    const path = require('path');
    const full = path.resolve(this.outputPath);
    const parent = await this._fs.promises.realpath(path.dirname(full));
    this._target = path.join(parent, path.basename(full));
    if (outputOwners.has(this._target) && outputOwners.get(this._target) !== this) {
      throw new Error('Output conflict: target is owned by another exporter: ' + this._target);
    }
    outputOwners.set(this._target, this);
    this._ownsTarget = true;
    let stat;
    try { stat = await this._fs.promises.lstat(this._target); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat && !stat.isFile()) throw new Error('Output must be a regular file; symlink, directory and special paths are refused');
    if (stat && this.options.overwrite === false) throw new Error('Output already exists; overwrite is disabled');
    this.tempPath = this._target + '.' + Date.now() + '-' + (++partSequence) + '-' + Math.random().toString(36).slice(2) + '.part';
  }

  _releaseTarget() {
    if (this._ownsTarget && outputOwners.get(this._target) === this) outputOwners.delete(this._target);
    this._ownsTarget = false;
  }
  async _ensureStream() {
    if (!this._nodeFile || this.stream) return;
    if (!['json', 'jsonl', 'csv'].includes(this.format)) throw new Error('Unsupported export format: ' + this.format);
    await this._claimTarget();
    this.stream = ExportManager.createWriteStream(this.tempPath, { flags: 'wx' });
    if (this.format === 'json') await ExportManager.writeToStream(this.stream, '[');
  }
  ensureStream() { return this._enqueue(() => this._ensureStream()); }

  async _writeBatch(batch) {
    if (!this._nodeFile || !batch.length) return;
    await this._ensureStream();
    let chunk;
    if (this.format === 'jsonl') chunk = batch.map(item => ExportManager.stringify(item) + '\n').join('');
    if (this.format === 'json') chunk = (this.hasWrittenAnyItem ? ',\n' : '\n') + batch.map(item => ExportManager.stringify(item)).join(',\n');
    if (this.format === 'csv') {
      const flattened = batch.map(item => ExportManager.flattenObject(item));
      this.headers ||= Array.from(new Set(flattened.flatMap(item => Object.keys(item))));
      ExportManager.validateCSVColumns(flattened, this.headers);
      const header = !this.hasWrittenHeader && this.headers.length
        ? this.headers.map(h => ExportManager.escapeCSVValue(h)).join(',') + '\n' : '';
      chunk = header + ExportManager.toCSVRows(flattened, this.headers).map(row => row + '\n').join('');
    }
    await ExportManager.writeToStream(this.stream, chunk);
    this.hasWrittenAnyItem = true;
    if (this.format === 'csv') this.hasWrittenHeader = true;
  }

  flushBuffer() {
    if (this._closing) return this._final || Promise.reject(new Error('Exporter is closing'));
    const batch = this._nodeFile ? this.buffer.splice(0) : [];
    return this._enqueue(() => this._writeBatch(batch));
  }

  exportData() {
    if (this._final) return this._final;
    this._closing = true;
    const batch = this.buffer.splice(0);
    this._final = this._enqueue(async () => {
      if (!this.outputPath) return this.delivery;
      if (this._nodeFile) {
        await this._writeBatch(batch);
        await this._ensureStream();
        if (this.format === 'json') await ExportManager.writeToStream(this.stream, this.hasWrittenAnyItem ? '\n]\n' : ']\n');
        if (this.format === 'csv' && !this.hasWrittenHeader && this.headers?.length) {
          ExportManager.validateCSVColumns([], this.headers);
          await ExportManager.writeToStream(this.stream, this.headers.map(h => ExportManager.escapeCSVValue(h)).join(',') + '\n');
        }
        await ExportManager.endStream(this.stream);
        // Publication is same-directory atomic visibility, not fsync durability.
        if (this.options.overwrite === false) {
          await this._fs.promises.link(this.tempPath, this._target);
          this._committed = this._accepted; this._ackLevel = 'file-published';
          await this._fs.promises.unlink(this.tempPath);
        } else {
          let stat;
          try { stat = await this._fs.promises.lstat(this._target); }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
          if (stat && !stat.isFile()) throw new Error('Output target became a special path before publication');
          await this._fs.promises.rename(this.tempPath, this._target);
          this._committed = this._accepted; this._ackLevel = 'file-published';
        }
        this.data = [];
        this.stream = null;
      } else if (this.format === 'http') {
        this._unknown = this._accepted;
        await ExportManager.postJSON(this.outputPath, this.data, this.options.http || {});
        this._unknown = 0; this._committed = this._accepted; this._ackLevel = 'http-response-2xx';
        if (ExportManager.getFs()) this.data = [];
      } else {
        const content = this.format === 'json' ? ExportManager.toJSON(this.data) + '\n'
          : this.format === 'jsonl' ? this.data.map(item => ExportManager.stringify(item) + '\n').join('')
          : this.format === 'csv' ? ExportManager.toCSV(this.data, this.headers) : null;
        if (content === null) throw new Error('Unsupported export format: ' + this.format);
        if (this.options.sink) {
          this._unknown = this._accepted;
          const ack = await this.options.sink.write({ outputPath: this.outputPath, content, format: this.format, count: this._accepted });
          if (!ack?.ackLevel) throw new Error('Explicit sink must return its acknowledgement level');
          this._ackLevel = ack.ackLevel;
          if (ack.confirmed === true) { this._committed = this._accepted; this._unknown = 0; }
        } else {
          if (!ExportManager.hasBrowserSink()) throw new Error('No file sink is available in this runtime; provide exportOptions.sink');
          ExportManager.saveToFileBrowser(this.outputPath, content, this.format === 'csv' ? 'text/csv' : 'application/json');
          this._unknown = this._accepted; this._ackLevel = 'download-initiated';
        }
      }
      return this.delivery;
    });
    this._final = this._final.catch(async error => {
      try { await ExportManager.destroyStream(this.stream); }
      catch (cleanup) { try { error.secondaryErrors = [cleanup]; } catch {} }
      throw error;
    }).finally(() => this._releaseTarget());
    this._final.catch(() => {});
    return this._final;
  }

  abort() {
    if (!this._abort) this._abort = (async () => {
      this._closing = true;
      if (this._final) await this._final.catch(() => {});
      await this._tail;
      try { await ExportManager.destroyStream(this.stream); }
      finally { this._releaseTarget(); this.buffer = []; }
    })();
    return this._abort;
  }
  finalize() { return this.exportData(); }
  exportToJSON() { return this.exportData(); }
  exportToJSONL() { return this.exportData(); }
  exportToCSV() { return this.exportData(); }
  exportToHttp() { return this.exportData(); }
}
module.exports = FeedExport;
