'use strict';

const fault = code => Object.assign(new Error(code), { code });
function nodeModules() {
  if (typeof process === 'undefined' || !process.versions?.node) throw fault('NODE_ONLY');
  // Lazy imports; the browser build uses existing false fallbacks and never
  // imports a network listener or performs filesystem operations on load.
  return { fs: require('fs').promises, path: require('path'), randomUUID: require('crypto').randomUUID };
}
function recordCleanup(primary, error) {
  try {
    if (primary !== null && (typeof primary === 'object' || typeof primary === 'function')) {
      if (!primary.cleanupErrors) primary.cleanupErrors = [];
      primary.cleanupErrors.push(error);
      return;
    }
  } catch { /* Frozen/nonextensible errors must retain their original identity. */ }
  warn('Checkpoint cleanup also failed: ' + cleanupCode(error), 'CHECKPOINT_CLEANUP');
}
function cleanupCode(error) {
  try { return String(error?.code || 'UNKNOWN'); } catch { return 'UNKNOWN'; }
}
function warn(message, code) {
  try { process.emitWarning(message, { code }); } catch { /* Diagnostics cannot replace the primary rejection. */ }
}
function publishedMetadata(primary, published) {
  try {
    if (primary !== null && (typeof primary === 'object' || typeof primary === 'function')) {
      primary.published = published;
      return;
    }
  } catch { /* Propagate the original rejection, including frozen Error objects. */ }
  warn('Checkpoint write failed; published=' + published, 'CHECKPOINT_ERROR_METADATA');
}

class NodeCheckpointStore {
  constructor(filename, { maxBytes = 1048576, validate = () => {}, acquireLock } = {}) {
    nodeModules();
    if (typeof filename !== 'string' || !filename.trim() || !Number.isSafeInteger(maxBytes)
      || maxBytes < 1 || maxBytes > 10485760 || typeof validate !== 'function'
      || (acquireLock !== undefined && typeof acquireLock !== 'function')) throw fault('CHECKPOINT_OPTIONS');
    Object.assign(this, { filename, maxBytes, validate, acquireLock });
  }
  async _target() {
    const { fs, path } = nodeModules();
    const absolute = path.resolve(this.filename);
    const target = path.join(await fs.realpath(path.dirname(absolute)), path.basename(absolute));
    await this._checkTarget(target);
    return target;
  }
  async _checkTarget(target) {
    const { fs } = nodeModules();
    let stat;
    try { stat = await fs.lstat(target); } catch (error) { if (cleanupCode(error) === 'ENOENT') return; throw error; }
    if (!stat.isFile() || stat.nlink !== 1) throw fault('CHECKPOINT_PATH');
  }
  async load() {
    const { fs } = nodeModules();
    const target = await this._target();
    let handle;
    try { handle = await fs.open(target, 'r'); } catch (error) { if (cleanupCode(error) === 'ENOENT') return null; throw error; }
    const buffer = Buffer.alloc(this.maxBytes + 1);
    let length = 0, primary, failed = false;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1) throw fault('CHECKPOINT_PATH');
      await this._checkTarget(target);
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length > this.maxBytes) throw fault('CHECKPOINT_SIZE');
    } catch (error) { primary = error; failed = true; }
    try { await handle.close(); } catch (error) { if (failed) recordCleanup(primary, error); else { primary = error; failed = true; } }
    if (failed) throw primary;
    let value;
    try { value = JSON.parse(buffer.toString('utf8', 0, length)); } catch { throw fault('CHECKPOINT_INVALID'); }
    this.validate(value);
    return value;
  }
  async save(value) {
    const { fs, randomUUID } = nodeModules();
    this.validate(value);
    let json;
    try { json = JSON.stringify(value, null, 2); } catch (error) {
      const invalid = fault('CHECKPOINT_INVALID'); invalid.cause = error; throw invalid;
    }
    if (typeof json !== 'string') throw fault('CHECKPOINT_INVALID');
    const contents = json + '\n';
    if (Buffer.byteLength(contents, 'utf8') > this.maxBytes) throw fault('CHECKPOINT_SIZE');
    const target = await this._target();
    const temporary = target + '.' + process.pid + '.' + randomUUID() + '.tmp';
    let handle, created = false, published = false, primary, failed = false;
    try {
      handle = await fs.open(temporary, 'wx', 0o600); created = true;
      await handle.writeFile(contents, 'utf8');
      await handle.close(); handle = null;
      await this._checkTarget(target);
      await fs.rename(temporary, target); published = true;
    } catch (error) { primary = error; failed = true; }
    if (handle) try { await handle.close(); } catch (error) { if (failed) recordCleanup(primary, error); else { primary = error; failed = true; } }
    if (created) try { await fs.unlink(temporary); } catch (error) {
      if (cleanupCode(error) !== 'ENOENT') {
        if (failed) recordCleanup(primary, error);
        else if (published) warn('Checkpoint committed; temporary cleanup failed: ' + cleanupCode(error), 'CHECKPOINT_CLEANUP');
        else { primary = error; failed = true; }
      }
    }
    if (failed) { publishedMetadata(primary, published); throw primary; }
  }
  async transaction(action) {
    if (!this.acquireLock) throw fault('CHECKPOINT_LOCK_REQUIRED');
    if (typeof action !== 'function') throw fault('CHECKPOINT_OPTIONS');
    const target = await this._target();
    const release = await this.acquireLock(target);
    if (typeof release !== 'function') throw fault('CHECKPOINT_LOCK_INVALID');
    const scoped = new NodeCheckpointStore(target, { maxBytes: this.maxBytes, validate: this.validate });
    let result, primary, failed = false;
    try { result = await action(scoped); } catch (error) { primary = error; failed = true; }
    try { await release(); } catch (error) { if (failed) recordCleanup(primary, error); else { primary = error; failed = true; } }
    if (failed) throw primary;
    return result;
  }
}

module.exports = NodeCheckpointStore;
