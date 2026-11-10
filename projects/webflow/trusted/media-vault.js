import {normalizeUploadMetadata, VALUE_LIMITS} from '../../../src/framework/control/value.js';

export const MEDIA_VAULT_POLICY = Object.freeze({
  database: 'opendesk-webflow-media-v1', fileBytes: VALUE_LIMITS.uploadBytes,
  totalBytes: 10 * 1024 * 1024, maxAssets: 20, lifetimeMs: 7 * 24 * 60 * 60 * 1000
});
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const ASSET_ID = /^wf-media-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class MediaVaultError extends Error {
  constructor(code, message = code) { super(message); this.name = 'MediaVaultError'; this.code = code; }
}
function requireMedia(condition, code, message) {
  if (!condition) throw new MediaVaultError(code, message);
}
function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}
function openMediaDatabase(factory) {
  return new Promise((resolve, reject) => {
    const request = factory.open(MEDIA_VAULT_POLICY.database, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets');
      if (!db.objectStoreNames.contains('scope')) db.createObjectStore('scope');
    };
    request.onblocked = () => reject(new MediaVaultError('E_MEDIA_DB_BLOCKED'));
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
async function transaction(factory, stores, mode, run) {
  let db, tx, completed;
  try {
    db = await openMediaDatabase(factory);
    tx = db.transaction(stores, mode);
    completed = new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
    const result = await run(tx);
    await completed;
    return result;
  } catch (error) {
    if (tx) { try { tx.abort(); } catch { /* Already completed/aborted. */ } }
    await completed?.catch(() => {});
    if (error instanceof MediaVaultError) throw error;
    throw new MediaVaultError(error?.name === 'QuotaExceededError' ? 'E_MEDIA_QUOTA' : 'E_MEDIA_STORAGE',
      '扩展素材仓库不可用：' + String(error?.message || error));
  } finally { db?.close(); }
}
export function validatePngBytes(bytes) {
  requireMedia(bytes instanceof Uint8Array && bytes.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((value, index) => bytes[index] === value), 'E_MEDIA_SIGNATURE', 'PNG 文件签名不匹配');
  return true;
}
export function inspectMediaFile(file) {
  requireMedia(typeof File !== 'undefined' && file instanceof File && Number.isSafeInteger(file.size),
    'E_MEDIA_FILE', '必须选择本机真实文件');
  let metadata;
  try { metadata = normalizeUploadMetadata({name: file.name, type: file.type}); }
  catch { throw new MediaVaultError('E_MEDIA_FORMAT', '文件名与媒体类型不匹配'); }
  requireMedia(metadata.type === 'image/png', 'E_MEDIA_TYPE', '首版只接收 PNG 图片');
  requireMedia(file.size >= PNG_SIGNATURE.length && file.size <= MEDIA_VAULT_POLICY.fileBytes,
    'E_MEDIA_SIZE', '文件大小应在 8 字节至 1 MiB 之间');
  return {name: metadata.name, mime: metadata.type, size: file.size};
}
export async function sha256Hex(bytes, cryptoApi = globalThis.crypto) {
  requireMedia(cryptoApi?.subtle?.digest, 'E_MEDIA_CRYPTO', 'SHA-256 不可用');
  const digest = new Uint8Array(await cryptoApi.subtle.digest('SHA-256', bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}
function publicRecord(row) {
  return Object.freeze({assetId: row.assetId, name: row.name, mime: row.mime, size: row.size,
    sha256: row.sha256, source: row.source, owner: {...row.owner}, createdAt: row.createdAt,
    expiresAt: row.expiresAt, state: row.state});
}
function validRow(row, profileId, now) {
  requireMedia(row && row.state === 'ready' && row.owner?.kind === 'chrome-extension-profile' &&
    row.owner.profileId === profileId, 'E_MEDIA_SCOPE', '素材不属于当前扩展 Profile');
  requireMedia(Number.isSafeInteger(row.expiresAt) && now < row.expiresAt, 'E_MEDIA_EXPIRED', '素材已过期');
  requireMedia(row.mime === 'image/png' && typeof row.name === 'string' && row.size >= 8 &&
    row.size <= MEDIA_VAULT_POLICY.fileBytes && /^[a-f0-9]{64}$/.test(row.sha256) &&
    row.blob instanceof Blob && row.blob.size === row.size, 'E_MEDIA_CORRUPT', '素材元数据不一致');
}

// Imported only by trusted extension-owned pages (and later the original Host).
// No message listener, sandbox interface or assetId-based authorization is created here.
export function createWebflowMediaVault({indexedDB: factory = globalThis.indexedDB,
  crypto: cryptoApi = globalThis.crypto, extensionId = globalThis.chrome?.runtime?.id,
  origin = globalThis.location?.origin, now = () => Date.now()} = {}) {
  requireMedia(typeof extensionId === 'string' && /^[a-p]{32}$/.test(extensionId) &&
    origin === 'chrome-extension://' + extensionId, 'E_MEDIA_ORIGIN', '只允许当前扩展的可信页面访问');
  requireMedia(factory?.open && cryptoApi?.randomUUID && cryptoApi?.subtle?.digest &&
    typeof now === 'function', 'E_MEDIA_UNAVAILABLE', 'IndexedDB 或加密功能不可用');
  const profile = async () => transaction(factory, ['scope'], 'readwrite', async tx => {
    const store = tx.objectStore('scope');
    let record = await requestResult(store.get('owner'));
    if (!record) {
      record = {kind: 'chrome-extension-profile', profileId: 'profile-' + cryptoApi.randomUUID()};
      store.add(record, 'owner');
    }
    requireMedia(record.kind === 'chrome-extension-profile' && typeof record.profileId === 'string' &&
      /^profile-[0-9a-f-]{36}$/.test(record.profileId), 'E_MEDIA_SCOPE', 'Profile 身份损坏');
    return record.profileId;
  });
  async function read(assetId) {
    requireMedia(ASSET_ID.test(assetId), 'E_MEDIA_ID', '素材 ID 无效');
    const profileId = await profile();
    const row = await transaction(factory, ['assets'], 'readonly', tx =>
      requestResult(tx.objectStore('assets').get(assetId)));
    validRow(row, profileId, now());
    const bytes = new Uint8Array(await row.blob.arrayBuffer());
    validatePngBytes(bytes);
    requireMedia(bytes.length === row.size && await sha256Hex(bytes, cryptoApi) === row.sha256,
      'E_MEDIA_HASH', '素材内容 SHA-256 不一致');
    return {metadata: publicRecord(row), bytes};
  }
  async function list() {
    const profileId = await profile(), time = now();
    const rows = await transaction(factory, ['assets'], 'readonly', tx =>
      requestResult(tx.objectStore('assets').getAll()));
    return rows.filter(row => row?.owner?.profileId === profileId && row.state === 'ready' &&
      Number.isSafeInteger(row.expiresAt) && row.expiresAt > time)
      .map(publicRecord).sort((a, b) => b.createdAt - a.createdAt);
  }
  async function cleanup() {
    const profileId = await profile(), time = now();
    return transaction(factory, ['assets'], 'readwrite', async tx => {
      const store = tx.objectStore('assets');
      const rows = await requestResult(store.getAll());
      let removed = 0;
      for (const row of rows) if (row?.owner?.profileId === profileId &&
        (!Number.isSafeInteger(row.expiresAt) || row.expiresAt <= time)) {
        store.delete(row.assetId); removed++;
      }
      return removed;
    });
  }
  async function save(file) {
    const metadata = inspectMediaFile(file);
    const bytes = new Uint8Array(await file.arrayBuffer());
    requireMedia(bytes.length === metadata.size, 'E_MEDIA_SIZE', '文件读取长度改变');
    validatePngBytes(bytes);
    const sha256 = await sha256Hex(bytes, cryptoApi);
    const profileId = await profile(), createdAt = now();
    const assetId = 'wf-media-' + cryptoApi.randomUUID();
    const row = {...metadata, assetId, sha256, source: 'trusted-settings-file-picker',
      owner: {kind: 'chrome-extension-profile', profileId}, state: 'ready', createdAt,
      expiresAt: createdAt + MEDIA_VAULT_POLICY.lifetimeMs,
      blob: new Blob([bytes], {type: metadata.mime})};
    await transaction(factory, ['assets'], 'readwrite', async tx => {
      const store = tx.objectStore('assets');
      const rows = await requestResult(store.getAll());
      const active = rows.filter(item => item?.owner?.profileId === profileId &&
        Number.isSafeInteger(item.expiresAt) && item.expiresAt > createdAt);
      requireMedia(active.length < MEDIA_VAULT_POLICY.maxAssets &&
        active.reduce((sum, item) => sum + item.size, 0) + metadata.size <= MEDIA_VAULT_POLICY.totalBytes,
        'E_MEDIA_QUOTA', '当前 Profile 已达到素材数量或容量上限');
      for (const item of rows) if (item?.owner?.profileId === profileId && item.expiresAt <= createdAt)
        store.delete(item.assetId);
      store.add(row, assetId);
    });
    // A committed IDB write is not verified until a separate transaction reads
    // the exact persisted Blob and independently recomputes the content hash.
    try { return (await read(assetId)).metadata; }
    catch (cause) {
      const error = new MediaVaultError('E_MEDIA_VERIFY_UNKNOWN', '保存可能已提交，但读回核验失败；仅按原 assetId 查询，不自动重存');
      error.assetId = assetId; error.cause = cause; throw error;
    }
  }
  async function remove(assetId) {
    requireMedia(ASSET_ID.test(assetId), 'E_MEDIA_ID', '素材 ID 无效');
    const profileId = await profile();
    return transaction(factory, ['assets'], 'readwrite', async tx => {
      const store = tx.objectStore('assets');
      const row = await requestResult(store.get(assetId));
      if (!row) return false;
      requireMedia(row.owner?.profileId === profileId, 'E_MEDIA_SCOPE');
      store.delete(assetId);
      return true;
    });
  }
  return Object.freeze({save, read, list, cleanup, remove});
}
