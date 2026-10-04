import {BUDGETS, canonical, digest, invariant, validate} from '../protocol.js';
import {AUDIENCE, POLICY_VERSION, createSignatureVerifier, entitlementSigningPayload} from './crypto.js';

export {TRUSTED_KEYS, entitlementSigningPayload, revocationSigningPayload} from './crypto.js';
export const OFFLINE_GRACE_MS = 259200000;
const CAPABILITIES = Object.freeze(['dom.top.v1', 'read.text.v1', 'read.attribute.v1', 'transform.safe.v1',
  'pagination.none.v1', 'pagination.next-link.v1', 'pagination.next-button.v1', 'page.stage-seal.v1', 'download.receipt.v1']);
const LIMIT_KEYS = ['maxPages', 'maxRecords', 'maxDurationMs', 'maxStoredBytes'];
const copy = value => structuredClone(value);
const iso = ms => new Date(ms).toISOString();
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
function timestamp(value) {
  invariant(Number.isSafeInteger(value) && value >= 0 && value <= 253402300799999,
    'E_ENTITLEMENT', 'Clock must supply epoch milliseconds');
  return value;
}
function limitsFor(limits, tier) {
  invariant(limits && Object.keys(limits).length === LIMIT_KEYS.length && LIMIT_KEYS.every(key =>
    Number.isSafeInteger(limits[key]) && limits[key] > 0), 'E_ENTITLEMENT', 'Invalid requested limits');
  const result = Object.fromEntries(LIMIT_KEYS.map(key => [key, Math.min(limits[key], BUDGETS[key],
    key === 'maxPages' && tier === 'free' ? 1 : key === 'maxRecords' && tier === 'free' ? 100 : BUDGETS[key])]));
  validate('Limits', result);
  return result;
}

// clock.trustedNow is supplied only by a trusted verification transport, never by a runtime message.
// A function clock is a wall clock only and cannot establish or refresh trusted Pro verification.
export function createEntitlementService({storage, clock, keys, subject}) {
  invariant(storage && typeof storage.transaction === 'function' && typeof subject === 'string' && subject.length > 0,
    'E_ENTITLEMENT', 'Storage and a bound subject are required');
  const time = typeof clock === 'function' ? {now: clock} : clock ?? {
    now: () => Date.now(), monotonicNow: () => performance.now()
  };
  invariant(typeof time.now === 'function', 'E_ENTITLEMENT', 'clock.now is required');
  const verifier = createSignatureVerifier(keys);
  const monotonicNow = time.monotonicNow ? () => time.monotonicNow() : () => performance.now();
  const issuedSnapshots = new WeakMap();
  let anchor = null;
  let queue = Promise.resolve();
  const serial = action => { const result = queue.then(action); queue = result.catch(() => {}); return result; };
  const initial = () => ({kind: 'entitlement-policy', version: 1, subject, revision: 0, claim: null, claimHash: null,
    verifiedAtMs: null, lastTrustedTimeMs: 0, lastWallTimeMs: null, rollback: false,
    revocationVersion: 0, revokedThrough: -1, revocation: null});
  async function read() {
    return storage.transaction(['entitlements'], 'readonly', async tx => (await tx.get('entitlements', subject)) ?? initial());
  }
  function observe(row) {
    invariant(row.kind === 'entitlement-policy' && row.version === 1 && row.subject === subject,
      'E_ENTITLEMENT', 'Unexpected entitlement persistence record');
    const wall = timestamp(time.now());
    const sampledMono = monotonicNow();
    invariant(Number.isFinite(sampledMono) && sampledMono >= 0, 'E_ENTITLEMENT', 'Invalid monotonic clock');
    const mono = Math.floor(sampledMono);
    let now = Math.max(wall, row.lastTrustedTimeMs);
    let regressed = row.lastWallTimeMs !== null && wall < row.lastWallTimeMs;
    if (anchor) {
      regressed ||= wall < anchor.wall || mono < anchor.mono;
      now = Math.max(now, anchor.now + Math.max(0, mono - anchor.mono));
    }
    timestamp(now);
    anchor = {wall, mono, now, regressed};
    row.lastWallTimeMs = Math.max(wall, row.lastWallTimeMs ?? wall);
    row.lastTrustedTimeMs = now;
    row.rollback ||= regressed;
    return now;
  }
  async function commit(expected, update, resetRollbackAt) {
    return storage.transaction(['entitlements'], 'readwrite', async tx => {
      const current = (await tx.get('entitlements', subject)) ?? initial();
      invariant(current.revision === expected.revision, 'E_ENTITLEMENT', 'Entitlement changed; retry admission');
      // Observation must never overwrite a newer high-water mark from another host.
      update.lastWallTimeMs = Math.max(update.lastWallTimeMs ?? 0, current.lastWallTimeMs ?? 0);
      update.lastTrustedTimeMs = Math.max(update.lastTrustedTimeMs, current.lastTrustedTimeMs);
      if (resetRollbackAt !== undefined) invariant(resetRollbackAt >= current.lastTrustedTimeMs,
        'E_ENTITLEMENT', 'Trusted refresh predates a concurrent clock observation');
      else update.rollback ||= current.rollback;
      observe(update);
      await tx.put('entitlements', update, subject);
      return update;
    });
  }
  async function evaluated() {
    const before = await read();
    const row = copy(before);
    observe(row);
    let reason = 'no-claim';
    let tier = 'free';
    if (row.claim) {
      try {
        await verifier.claim(row.claim, subject);
        invariant(await digest(entitlementSigningPayload(row.claim)) === row.claimHash, 'E_ENTITLEMENT', 'Cached claim changed');
        if (row.revocation) await verifier.revocation(row.revocation, subject);
        invariant(row.revokedThrough < 0 || (row.revocation && row.revocation.revocationVersion === row.revokedThrough),
          'E_ENTITLEMENT', 'Missing signed revocation');
        reason = null;
      } catch { reason = 'invalid-signature-or-claims'; }
    }
    await commit(before, row);
    const now = row.lastTrustedTimeMs;
    // Crypto and transaction admission can take time: classify only after the final observation.
    if (row.claim && reason === null) {
        const issuedAt = Date.parse(row.claim.issuedAt), expiresAt = Date.parse(row.claim.expiresAt);
        if (row.rollback) reason = 'clock-rollback';
        else if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) || issuedAt >= expiresAt || issuedAt > now) reason = 'invalid-time';
        else if (now >= expiresAt) reason = 'expired';
        else if (row.claim.revocationVersion < row.revocationVersion || row.claim.revocationVersion <= row.revokedThrough) reason = 'revoked';
        else if (row.verifiedAtMs === null || row.verifiedAtMs > now || row.verifiedAtMs < issuedAt) reason = 'no-trusted-verification';
        else if (now - row.verifiedAtMs > OFFLINE_GRACE_MS) reason = 'offline-grace-exceeded';
        else { tier = 'pro'; reason = null; }
    }
    return {row, now, tier, reason};
  }
  function asEntitlement(state) {
    const {row, now, tier} = state;
    const result = tier === 'pro' ? {...copy(row.claim), verification: 'ecdsa-p256-sha256',
      verifiedAt: iso(row.verifiedAtMs), lastTrustedTime: iso(now)} : {
      tier: 'free', issuer: 'opendesk-browser.local', subject, features: [...CAPABILITIES],
      issuedAt: iso(0), expiresAt: '9999-12-31T23:59:59.999Z', verifiedAt: iso(now), signature: null, keyId: null,
      verification: 'local-free', revocationVersion: row.revocationVersion, formatVersion: POLICY_VERSION,
      audience: AUDIENCE, lastTrustedTime: iso(now)
    };
    validate('Entitlement', result);
    return freeze(result);
  }
  async function trustedTime() {
    invariant(typeof time.trustedNow === 'function', 'E_ENTITLEMENT', 'No trusted verification time source');
    return timestamp(await time.trustedNow());
  }
  async function installClaim(input) {
    const claim = copy(input);
    await verifier.claim(claim, subject);
    const verifiedAtMs = await trustedTime();
    const before = await read(), row = copy(before);
    const now = observe(row);
    invariant(!anchor.regressed && verifiedAtMs >= before.lastTrustedTimeMs && verifiedAtMs <= now &&
      Date.parse(claim.issuedAt) <= verifiedAtMs && Date.parse(claim.issuedAt) < Date.parse(claim.expiresAt) && now < Date.parse(claim.expiresAt),
    'E_ENTITLEMENT', 'Untrusted, future, expired or rolled-back verification time');
    invariant(claim.revocationVersion >= row.revocationVersion && claim.revocationVersion > row.revokedThrough,
      'E_ENTITLEMENT', 'Stale or revoked license version');
    row.claim = claim;
    row.claimHash = await digest(entitlementSigningPayload(claim));
    row.verifiedAtMs = verifiedAtMs;
    // Only an explicit trusted refresh may clear a durable rollback freeze.
    row.rollback = false;
    row.revocationVersion = claim.revocationVersion;
    row.revision += 1;
    await commit(before, row, verifiedAtMs);
    return asEntitlement(await evaluated());
  }
  async function snapshot({limits = Object.fromEntries(LIMIT_KEYS.map(key => [key, BUDGETS[key]])), requiredCapabilities = []} = {}) {
    invariant(Array.isArray(requiredCapabilities) && new Set(requiredCapabilities).size === requiredCapabilities.length &&
      requiredCapabilities.every(capability => CAPABILITIES.includes(capability)), 'E_ENTITLEMENT', 'Unknown required capability');
    const state = await evaluated();
    const approvedCapabilities = state.tier === 'pro' ? CAPABILITIES.filter(capability => state.row.claim.features.includes(capability)) : [...CAPABILITIES];
    invariant(requiredCapabilities.every(capability => approvedCapabilities.includes(capability)),
      'E_ENTITLEMENT', 'License does not grant a required capability');
    const result = freeze({policyVersion: POLICY_VERSION, tier: state.tier, approvedAt: iso(state.now),
      claimHash: state.tier === 'pro' ? state.row.claimHash : null,
      offlineAgeMs: state.tier === 'pro' ? state.now - state.row.verifiedAtMs : 0,
      effectiveLimits: limitsFor(limits, state.tier), maxSavedTemplates: state.tier === 'pro' ? 50 : 1,
      approvedCapabilities, runExpiryRevokes: false});
    validate('EntitlementSnapshot', result);
    issuedSnapshots.set(result, {revision: state.row.revision, claim: state.row.claim && canonical(state.row.claim),
      verifiedAtMs: state.row.verifiedAtMs, revokedThrough: state.row.revokedThrough});
    return result;
  }
  const service = {
    get: () => serial(async () => asEntitlement(await evaluated())),
    status: () => serial(async () => {
      const state = await evaluated();
      return freeze({tier: state.tier, reason: state.reason, revocationVersion: state.row.revocationVersion,
        trustedNowMs: state.now, lastTrustedVerifiedAt: state.row.verifiedAtMs === null ? null : iso(state.row.verifiedAtMs),
        exportsAllowed: true, existingRecordsAllowed: true, previewAllowed: true, deletionAllowed: true});
    }),
    install: claim => serial(() => installClaim(claim)),
    refresh: () => serial(async () => {
      const row = await read();
      invariant(row.claim, 'E_ENTITLEMENT', 'No cached signed claim to refresh');
      return installClaim(row.claim);
    }),
    revoke: evidence => serial(async () => {
      const signed = copy(evidence);
      await verifier.revocation(signed, subject);
      const before = await read(), row = copy(before), now = observe(row);
      invariant(Date.parse(signed.issuedAt) <= now && signed.revocationVersion > row.revocationVersion,
        'E_ENTITLEMENT', 'Future or non-increasing revocation evidence');
      row.revocation = signed;
      row.revocationVersion = signed.revocationVersion;
      row.revokedThrough = signed.revocationVersion;
      row.revision += 1;
      await commit(before, row);
      return asEntitlement(await evaluated());
    }),
    getSnapshot: request => serial(() => snapshot(request)),
    admitRun: template => serial(() => {
      invariant(template && template.limits && Array.isArray(template.requiredCapabilities), 'E_ENTITLEMENT', 'Template admission requires limits and capabilities');
      return snapshot({limits: template.limits, requiredCapabilities: template.requiredCapabilities});
    }),
    admitTemplate(request) {
      const templateId = request?.templateId ?? request?.template?.templateId;
      // The public SaveTemplateRequest call prepares a quota. The storage owner must
      // recheck it in the actual write transaction with the optional tx/snapshot bridge.
      if (!request?.tx) return serial(async () => {
        const approved = await snapshot();
        return storage.transaction(['templates', 'entitlements'], 'readwrite', tx =>
          checkTemplate({templateId, tx, snapshot: approved}));
      });
      return checkTemplate({...request, templateId});
    }
  };
  async function checkTemplate({templateId, tx, snapshot: approved}) {
      invariant(typeof templateId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(templateId) && tx && issuedSnapshots.has(approved),
        'E_ENTITLEMENT', 'Template admission requires a service-issued snapshot and the template write transaction');
      const row = (await tx.get('entitlements', subject)) ?? initial();
      const ticket = issuedSnapshots.get(approved);
      invariant(row.revision === ticket.revision && row.verifiedAtMs === ticket.verifiedAtMs && row.revokedThrough === ticket.revokedThrough &&
        (!row.claim || canonical(row.claim) === ticket.claim), 'E_ENTITLEMENT', 'Entitlement changed; prepare a new snapshot');
      const now = observe(row);
      if (approved.tier === 'pro') invariant(!row.rollback && now < Date.parse(row.claim.expiresAt) &&
        now - row.verifiedAtMs <= OFFLINE_GRACE_MS && row.claim.revocationVersion > row.revokedThrough,
      'E_ENTITLEMENT', 'Pro template admission expired or revoked');
      const templates = await tx.all('templates');
      // The storage repository retains immutable revision rows separately from heads.
      // Only live heads consume template quota, including after a head is deleted.
      const repositoryRows = templates.some(template => template.metadata && (template.template || !template.head));
      const heads = repositoryRows ? templates.filter(template => template.metadata && !template.template) : templates;
      const ids = new Set(heads.filter(template => !template.tombstone && !template.deletedAt).map(template =>
        template.templateId ?? template.metadata?.templateId ?? template.head?.templateId ?? template.template?.templateId).filter(Boolean));
      invariant(ids.has(templateId) || ids.size < approved.maxSavedTemplates, 'E_ENTITLEMENT', 'Saved template limit reached');
      await tx.put('entitlements', row, subject);
      return approved;
  }
  return Object.freeze(service);
}
