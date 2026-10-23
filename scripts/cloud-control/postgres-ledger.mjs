import {readFile} from 'node:fs/promises';
import {canonical} from '../../src/platform/protocol.js';

const tables = Object.freeze({jobs:'jobs', requests:'requests', executors:'executors',
  clients:'client_bindings', taskRegistry:'task_pins'});
const fail = code => { throw Object.assign(new Error(code), {code}); };
const encode = value => canonical(value, {maxDepth:48});
const same = (a, b) => encode(a) === encode(b);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
const without = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const metadata = state => without(state, Object.keys(tables));
const relation = name => `opendesk_cc_${name}`; // Only internal fixed names reach SQL identifiers.

function validate(state) {
  if (!object(state) || !Number.isSafeInteger(state.version) || state.version < 1 ||
    typeof state.providerId !== 'string' || !state.providerId.trim()) fail('E_SCHEMA');
  encode(state);
  for (const field of Object.keys(tables)) if (!object(state[field])) fail('E_SCHEMA');
  for (const [key, job] of Object.entries(state.jobs)) {
    if (!object(job) || job.jobId !== key) fail('E_JOB');
    if (own(job, 'controlProtocol') && job.controlProtocol !== 2) fail('E_CONTROL_PROTOCOL');
    if (job.controlProtocol === 2 && own(job, 'assignment') &&
      (job.assignment?.controlProtocol !== 2 || typeof job.assignment.controlGeneration !== 'string' ||
        !job.assignment.controlGeneration.trim())) fail('E_CONTROL_GENERATION');
    if (own(job, 'assignment') && (!object(job.assignment) ||
      typeof job.assignment.executorId !== 'string' || !job.assignment.executorId.trim())) fail('E_ASSIGNMENT');
    if (own(job, 'startConsumedAt') && (!Number.isFinite(job.startConsumedAt) ||
      !job.startTicket || job.startConsumedAt < job.startTicket.issuedAt ||
      job.startConsumedAt >= job.startTicket.expiresAt)) fail('E_START_TICKET');
    if (own(job, 'receipt') && (!object(job.receipt) || !own(job, 'assignment'))) fail('E_RECEIPT_IMMUTABLE');
    if (own(job, 'receipt') && job.receipt.result?.retirementState !== 'released') fail('E_RECEIPT_RETIREMENT');
  }
  for (const row of Object.values(state.requests)) {
    if (!object(row) || typeof row.digest !== 'string' || !own(row, 'answer')) fail('E_SCHEMA');
  }
  for (const row of Object.values(state.taskRegistry)) {
    if (!object(row) || typeof row.sourceHash !== 'string' || typeof row.manifestHash !== 'string') fail('E_SCHEMA');
  }
}

function validateTransition(before, after) {
  validate(after);
  if (before.providerId !== after.providerId || !same(before.version, after.version)) fail('E_LEDGER_IDENTITY');
  for (const [key, old] of Object.entries(before.requests)) {
    if (!own(after.requests, key) || !same(old, after.requests[key])) fail('E_REQUEST_CONFLICT');
  }
  for (const [key, old] of Object.entries(before.taskRegistry)) {
    const next = after.taskRegistry[key];
    if (!next || !same(old, next)) fail('E_TASK_CONFLICT');
  }
  for (const [key, old] of Object.entries(before.jobs)) {
    const next = after.jobs[key];
    if (!next) fail('E_JOB_IMMUTABLE');
    if (own(old, 'controlProtocol') !== own(next, 'controlProtocol') ||
      old.controlProtocol !== next.controlProtocol) fail('E_CONTROL_PROTOCOL');
    if (own(old, 'startConsumedAt') && (!own(next, 'startConsumedAt') ||
      old.startConsumedAt !== next.startConsumedAt)) fail('E_REQUEST_CONFLICT');
    if (own(old, 'startTicket') && (!own(next, 'startTicket') ||
      !same(old.startTicket, next.startTicket))) fail('E_REQUEST_CONFLICT');
    if (old.controlProtocol === 2 && own(old, 'permit') && (!next.permit ||
      !same(without(old.permit, ['leaseUntil']), without(next.permit, ['leaseUntil'])))) fail('E_CONTROL_GENERATION');
    if (own(old, 'receipt') && (!next || !own(next, 'receipt') || !same(old.receipt, next.receipt))) fail('E_RECEIPT_IMMUTABLE');
    if (own(old, 'assignment') && (!next || !own(next, 'assignment') ||
      !same(without(old.assignment, ['leaseUntil']), without(next.assignment, ['leaseUntil'])))) fail('E_ASSIGNMENT_IMMUTABLE');
  }
  const occupied = new Set();
  for (const job of Object.values(after.jobs)) {
    if (!job.assignment || job.receipt) continue;
    if (occupied.has(job.assignment.executorId)) fail('E_EXECUTOR_CAPACITY');
    occupied.add(job.assignment.executorId);
  }
}

function safeEvent(event) {
  if (event === null) return null;
  if (!object(event) || typeof event.kind !== 'string' || !event.kind.trim() || event.kind.length > 128) fail('E_SCHEMA');
  const result = {kind:event.kind};
  for (const key of ['executorId', 'jobId']) {
    if (event[key] != null && (typeof event[key] !== 'string' || !event[key].trim() || event[key].length > 512)) fail('E_SCHEMA');
    result[key] = event[key] ?? null;
  }
  return result;
}

export async function openPostgresLedger({pool, ledgerId} = {}) {
  if (!pool || typeof pool.connect !== 'function' || typeof ledgerId !== 'string' ||
    !ledgerId.trim() || ledgerId.length > 128) fail('E_SCHEMA');
  let closed = false;
  const schema = await readFile(new URL('./postgres-schema.sql', import.meta.url), 'utf8');

  async function withClient(fn, {ddl = false} = {}) {
    if (closed) fail('E_LEDGER_CLOSED');
    const client = await pool.connect();
    let begun = false, destroy;
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      begun = true;
      await client.query('SET LOCAL synchronous_commit = on');
      // One lock order everywhere: DDL first (exclusive for initialize, shared
      // for normal operations), then the ledger. This also protects readers
      // from observing an in-progress schema initialization.
      await client.query(`SELECT pg_advisory_xact_lock${ddl ? '' : '_shared'}(hashtextextended($1, 0))`, ['opendesk:cloud:ddl:r201']);
      const answer = await fn(client);
      await client.query('COMMIT');
      begun = false;
      return answer;
    } catch (error) {
      if (begun) {
        try { await client.query('ROLLBACK'); }
        catch (rollbackError) { destroy = rollbackError; }
      } else { destroy = error; }
      if (error.code === '23505' && error.constraint === 'opendesk_cc_dispatch_slot') fail('E_EXECUTOR_CAPACITY');
      throw error;
    } finally { client.release(destroy); }
  }

  const lock = client => client.query(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`opendesk:cloud:ledger:${ledgerId}`]);

  async function load(client) {
    const {rows:[row]} = await client.query('SELECT metadata, credentials FROM opendesk_cc_ledgers WHERE ledger_id = $1', [ledgerId]);
    if (!row) fail('E_LEDGER_NOT_INITIALIZED');
    const state = row.metadata;
    for (const [field, table] of Object.entries(tables)) {
      const {rows} = await client.query(`SELECT key, body FROM ${relation(table)} WHERE ledger_id = $1`, [ledgerId]);
      state[field] = Object.fromEntries(rows.map(item => [item.key, item.body]));
    }
    for (const [table, field] of [['assignments', 'assignment'], ['receipts', 'receipt']]) {
      const {rows} = await client.query(`SELECT key, body FROM ${relation(table)} WHERE ledger_id = $1`, [ledgerId]);
      for (const item of rows) state.jobs[item.key][field] = item.body;
    }
    return {state, credentials:row.credentials};
  }

  async function upsert(client, table, key, body) {
    await client.query(`INSERT INTO ${relation(table)} (ledger_id, key, body) VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (ledger_id, key) DO UPDATE SET body = EXCLUDED.body`, [ledgerId, key, encode(body)]);
  }

  async function persist(client, before, after, event) {
    validateTransition(before, after);
    const changed = {};
    for (const [field, table] of Object.entries(tables)) {
      const oldMap = before[field], nextMap = after[field];
      changed[field] = [];
      for (const key of Object.keys(oldMap)) if (!own(nextMap, key)) {
        await client.query(`DELETE FROM ${relation(table)} WHERE ledger_id = $1 AND key = $2`, [ledgerId, key]);
        changed[field].push(key);
      }
      for (const [key, row] of Object.entries(nextMap)) {
        if (own(oldMap, key) && same(oldMap[key], row)) continue;
        changed[field].push(key);
        const body = field === 'jobs' ? without(row, ['assignment', 'receipt']) : row;
        const oldBody = field === 'jobs' && own(oldMap, key) ? without(oldMap[key], ['assignment', 'receipt']) : oldMap[key];
        if (!own(oldMap, key) || !same(oldBody, body)) await upsert(client, table, key, body);
      }
    }
    // Release slots only on durable receipt, before admitting another Job to that Executor.
    for (const key of changed.jobs) {
      const job = after.jobs[key];
      if (!job?.receipt || before.jobs[key]?.receipt) continue;
      if (!before.jobs[key]?.assignment) {
        await client.query('INSERT INTO opendesk_cc_assignments (ledger_id, key, body, dispatch_slot) VALUES ($1, $2, $3::jsonb, $4)',
          [ledgerId, key, encode(job.assignment), null]);
      }
      await upsert(client, 'receipts', key, job.receipt);
      await client.query('UPDATE opendesk_cc_assignments SET dispatch_slot = NULL WHERE ledger_id = $1 AND key = $2', [ledgerId, key]);
    }
    for (const key of changed.jobs) {
      const job = after.jobs[key];
      if (!job?.assignment) continue;
      if (!before.jobs[key]?.assignment && !job.receipt) {
        await client.query('INSERT INTO opendesk_cc_assignments (ledger_id, key, body, dispatch_slot) VALUES ($1, $2, $3::jsonb, $4)',
          [ledgerId, key, encode(job.assignment), job.assignment.executorId]);
      } else if (before.jobs[key]?.assignment && !same(before.jobs[key].assignment, job.assignment)) {
        await client.query('UPDATE opendesk_cc_assignments SET body = $3::jsonb WHERE ledger_id = $1 AND key = $2',
          [ledgerId, key, encode(job.assignment)]);
      }
    }
    const metaChanged = !same(metadata(before), metadata(after));
    if (metaChanged) await client.query('UPDATE opendesk_cc_ledgers SET metadata = $2::jsonb WHERE ledger_id = $1', [ledgerId, encode(metadata(after))]);
    if (!metaChanged && !Object.values(changed).some(keys => keys.length) && !event) return;
    const kind = event?.kind ?? 'state.changed';
    await client.query('INSERT INTO opendesk_cc_audit (ledger_id, kind, changed_keys) VALUES ($1, $2, $3::jsonb)',
      [ledgerId, kind, encode({...changed, metadata:metaChanged})]);
    const events = changed.jobs.map(key => {
      const job = after.jobs[key] ?? before.jobs[key];
      return {executorId:job.assignment?.executorId ?? job.targetExecutorId ?? null, jobId:key, kind};
    });
    if (event?.executorId && !events.some(item => item.executorId === event.executorId && item.jobId === event.jobId)) events.push(event);
    for (const item of events) await client.query(
      'INSERT INTO opendesk_cc_outbox (ledger_id, executor_id, job_id, kind) VALUES ($1, $2, $3, $4)',
      [ledgerId, item.executorId, item.jobId, item.kind]);
  }

  async function initialize({state, credentials, expectedProviderId, requireExisting = false, beforeInitialize} = {}) {
    if (typeof requireExisting !== 'boolean' ||
      (expectedProviderId !== undefined && (typeof expectedProviderId !== 'string' || !expectedProviderId.trim())) ||
      (beforeInitialize !== undefined && typeof beforeInitialize !== 'function')) fail('E_SCHEMA');
    if (Object.keys(state?.jobs ?? {}).length || Object.keys(state?.requests ?? {}).length) fail('E_MIGRATION_REQUIRED');
    return withClient(async client => {
      await client.query(schema);
      const {rows:[version]} = await client.query('SELECT version FROM opendesk_cc_schema WHERE singleton = true');
      if (version?.version !== 1) fail('E_LEDGER_VERSION');
      await lock(client);
      const existing = await client.query('SELECT metadata FROM opendesk_cc_ledgers WHERE ledger_id = $1', [ledgerId]);
      if (!existing.rowCount && requireExisting) fail('E_LEDGER_RECOVERY_REQUIRED');
      if (existing.rowCount) {
        const providerId = existing.rows[0].metadata.providerId;
        if (expectedProviderId !== undefined && providerId !== expectedProviderId) fail('E_LEDGER_IDENTITY');
        if (beforeInitialize) await beforeInitialize(providerId);
      } else {
        const seed = structuredClone(state);
        if (!object(seed)) fail('E_SCHEMA');
        for (const key of Object.keys(tables)) seed[key] ??= {};
        validate(seed);
        if (!object(credentials)) fail('E_SCHEMA');
        if (expectedProviderId !== undefined && seed.providerId !== expectedProviderId) fail('E_LEDGER_IDENTITY');
        if (beforeInitialize) await beforeInitialize(seed.providerId);
        await client.query('INSERT INTO opendesk_cc_ledgers (ledger_id, metadata, credentials) VALUES ($1, $2::jsonb, $3::jsonb)',
          [ledgerId, encode(metadata(seed)), encode(credentials)]);
        for (const [field, table] of Object.entries(tables)) {
          for (const [key, row] of Object.entries(seed[field])) await upsert(client, table, key, row);
        }
      }
      return load(client);
    }, {ddl:true});
  }

  async function transaction(fn, {readOnly = false, event = null} = {}) {
    if (typeof fn !== 'function' || typeof readOnly !== 'boolean') fail('E_SCHEMA');
    // Resolve targets after the callback has authenticated against the locked
    // state, and persist the sanitized hint in the same transaction as mutation.
    const notification = typeof event === 'function' ? null : safeEvent(event);
    return withClient(async client => {
      await lock(client);
      const {state} = await load(client);
      const before = structuredClone(state);
      const result = await fn(state);
      if (!readOnly) await persist(client, before, state, typeof event === 'function' ? safeEvent(event()) : notification);
      return result;
    });
  }

  async function readOutbox(afterSequence = 0, {limit = 100} = {}) {
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 10000) fail('E_SCHEMA');
    return withClient(async client => {
      const {rows} = await client.query('SELECT sequence, executor_id, job_id, kind FROM opendesk_cc_outbox WHERE ledger_id = $1 AND sequence > $2 ORDER BY sequence LIMIT $3',
        [ledgerId, afterSequence, limit]);
      return rows.map(row => {
        const sequence = Number(row.sequence);
        if (!Number.isSafeInteger(sequence)) fail('E_OUTBOX_SEQUENCE');
        return {sequence, executorId:row.executor_id, jobId:row.job_id, kind:row.kind};
      });
    });
  }

  return Object.defineProperty({initialize, transaction, readOutbox,
    async close() { closed = true; }}, 'ledgerId', {value:ledgerId, enumerable:true});
}
