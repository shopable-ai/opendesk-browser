// Local-only quota/history store. Separate from Cookie Editor's credential vault.
// Writes only sanitized quota metadata; files and folders are owner-only.
import {constants} from 'node:fs';
import {open, mkdir, lstat, rename, unlink} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join, resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {emptyState, registerAccount, recordProbeResult,
  listAccounts, accountHistory, underuseInsights, normalizeIdentity, SCHEMA_VERSION} from './domain.mjs';

const FILE = 'history-v1.json';
const LOCK_FILE = '.history-v1.lock';
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const err = code => Object.assign(new Error(code), {code});
const exact = (o, names) => o && typeof o === 'object' && !Array.isArray(o) &&
  Object.keys(o).every(k => names.includes(k));
const ACCOUNT_FIELDS = ['displayName','subscription','identity','providerPlan','lastAttempt','lastSuccessAt'];
const WINDOW_FIELDS = ['accountAlias','mode','limitId','observedAt','windowKey','slot','kind','durationSeconds',
  'usedPercent','remainingPercent','resetsAt'];
const ROLLOVER_FIELDS = ['accountAlias','windowKey','priorResetsAt','detectedAt','type',
  'lastPreResetSampleAt','leadSeconds','lastObservedRemainingPercent',
  'nearResetUnusedEstimatePercent','estimateQuality'];

function validateState(state) {
  if (!exact(state, ['schemaVersion','accounts','observations','rollovers']) ||
      state.schemaVersion !== SCHEMA_VERSION ||
      !exact(state.accounts, Object.keys(state.accounts ?? {})) ||
      !Array.isArray(state.observations) || state.observations.length > 20_000 ||
      !Array.isArray(state.rollovers) || state.rollovers.length > 3_000)
    throw err('E_HISTORY_SCHEMA');
  if (Object.keys(state.accounts).length > 64) throw err('E_HISTORY_SCHEMA');
  for (const [alias,row] of Object.entries(state.accounts)) {
    try { normalizeIdentity(row.identity); } catch { throw err('E_HISTORY_SCHEMA'); }
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,47}$/.test(alias) || !exact(row,ACCOUNT_FIELDS) ||
        typeof row.displayName !== 'string' || !exact(row.subscription,
          ['tierLabel','multiplier','membershipExpiresAt','nextBillingAt','source']) ||
        !exact(row.providerPlan, ['family','code','multiplier','source']) ||
        (row.lastAttempt !== null && !exact(row.lastAttempt,
          ['mode','status','reason','checkedAt','quotaHttpStatus','sessionHttpStatus'])))
      throw err('E_HISTORY_SCHEMA');
    if (row.lastAttempt?.mode !== undefined &&
        !['COOKIE_ONLY','CODEX_OAUTH'].includes(row.lastAttempt.mode)) throw err('E_HISTORY_SCHEMA');
  }
  for (const row of state.observations) {
    if (!exact(row,WINDOW_FIELDS) || !Object.hasOwn(state.accounts,row.accountAlias) ||
        !Number.isFinite(row.usedPercent) || !Number.isFinite(row.remainingPercent) ||
        (row.mode !== undefined && !['COOKIE_ONLY','CODEX_OAUTH'].includes(row.mode)) ||
        (row.limitId !== undefined && (typeof row.limitId !== 'string' ||
          !/^[A-Za-z0-9_-]{1,64}$/.test(row.limitId))))
      throw err('E_HISTORY_SCHEMA');
  }
  for (const row of state.rollovers) {
    if (!exact(row,ROLLOVER_FIELDS) || !Object.hasOwn(state.accounts,row.accountAlias))
      throw err('E_HISTORY_SCHEMA');
  }
  return state;
}

async function checkPath(path, isDirectory) {
  const s = await lstat(path);
  if (s.isSymbolicLink() || (isDirectory ? !s.isDirectory() : !s.isFile()) ||
      (s.mode & 0o077) !== 0 ||
      (typeof process.getuid === 'function' && s.uid !== process.getuid()))
    throw err('E_HISTORY_PERMISSIONS');
  return s;
}

export class HistoryStore {
  #dir;
  #queue = Promise.resolve();
  constructor({directory = join(homedir(),'.opendesk','ai-account-usage')}={}) {
    if (typeof directory !== 'string' || !directory.startsWith('/')) throw err('E_HISTORY_DIRECTORY');
    this.#dir = resolve(directory);
  }
  async #init() {
    await mkdir(this.#dir,{recursive:true, mode:0o700});
    await checkPath(this.#dir,true);
  }
  async #load() {
    await this.#init();
    const file = join(this.#dir,FILE);
    let fd;
    try {
      await checkPath(file,false);
      fd = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      const stat = await fd.stat();
      if (stat.size > MAX_FILE_BYTES || stat.size < 2) throw err('E_HISTORY_SIZE');
      const body = await fd.readFile({encoding:'utf8'});
      return validateState(JSON.parse(body));
    } catch(error) {
      if (error?.code === 'ENOENT') return emptyState();
      if (error?.code?.startsWith('E_HISTORY_')) throw error;
      throw err('E_HISTORY_READ'); // No raw JSON, path or original error in logs.
    } finally {await fd?.close();}
  }
  async #save(state) {
    validateState(state);
    const body = JSON.stringify(state);
    if (Buffer.byteLength(body,'utf8') > MAX_FILE_BYTES) throw err('E_HISTORY_SIZE');
    const dest = join(this.#dir, FILE);
    // Directory is 0700. Rename overwrites old state atomically; no partial JSON.
    const temp = join(this.#dir, `.history-${randomBytes(12).toString('hex')}.tmp`);
    let fd;
    try {
      fd = await open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW || 0), 0o600);
      await fd.writeFile(body,'utf8');
      await fd.sync();
      await fd.close(); fd = null;
      await rename(temp,dest);
    } catch {
      throw err('E_HISTORY_WRITE');
    } finally {await fd?.close();await unlink(temp).catch(()=>{});}
  }
  // All cooperating processes must acquire this lock BEFORE loading state.
  // Contention (including a crash-left lock) fails explicitly; never guess owner
  // liveness or remove a lock that this transaction did not create.
  async #writeTransaction(run) {
    await this.#init();
    const path = join(this.#dir, LOCK_FILE);
    let lock;
    try {
      lock = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY |
        (constants.O_NOFOLLOW || 0), 0o600);
    } catch (error) {
      throw err(error?.code === 'EEXIST' ? 'E_HISTORY_BUSY' : 'E_HISTORY_WRITE');
    }
    try {
      const stat = await lock.stat();
      if (!stat.isFile() || (stat.mode & 0o077) !== 0 ||
          (typeof process.getuid === 'function' && stat.uid !== process.getuid()))
        throw err('E_HISTORY_PERMISSIONS');
      return await run();
    } finally {
      try {
        const held = await lock.stat();
        const current = await lstat(path);
        if (current.isSymbolicLink() || current.dev !== held.dev || current.ino !== held.ino)
          throw err('E_HISTORY_BUSY');
        await unlink(path);
      } catch (error) {
        if (error?.code === 'E_HISTORY_BUSY') throw error;
        throw err('E_HISTORY_WRITE');
      } finally { await lock.close(); }
    }
  }
  #serial(run) {
    const task = this.#queue.then(run,run);
    this.#queue=task.catch(()=>{});
    return task;
  }
  register(meta) {return this.#serial(()=>this.#writeTransaction(async()=>{
    const state=await this.#load();
    const next=registerAccount(state,meta);
    await this.#save(next);
    return {registered:true,alias:meta.alias};
  }));}
  record(alias,probeResult) {return this.#serial(()=>this.#writeTransaction(async()=>{
    const state=await this.#load();
    const next=recordProbeResult(state,alias,probeResult);
    await this.#save(next);
    return next.accounts[alias].lastAttempt;
  }));}
  snapshot() {return this.#serial(async()=>structuredClone(await this.#load()));}
  accounts() {return this.#serial(async()=>listAccounts(await this.#load()));}
  history(alias, options) {return this.#serial(async()=>accountHistory(await this.#load(),alias,options));}
  insights(options) {return this.#serial(async()=>underuseInsights(await this.#load(),options));}
}
