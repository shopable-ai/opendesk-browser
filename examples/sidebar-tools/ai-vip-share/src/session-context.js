/** Pure tool-local metadata guards. No Cookie values, IO, SDK calls or authorization grants.
 * Callers supply reviewed declarations and authenticated source responses (never page data),
 * revalidate current authorization before writing, and retain the existing Host/CAS journal.
 * Times are epoch milliseconds; revisions/identities are nonempty opaque strings.
 */
const object = value => value !== null && typeof value === 'object' &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
function requireThat(ok) { if (!ok) throw new Error('Invalid session context'); }
function text(value) {
  requireThat(typeof value === 'string' && value.length > 0 && value.length <= 2048 &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value));
  return value;
}
function exact(value, keys) {
  requireThat(object(value) && Object.keys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key)));
}
function time(value) { requireThat(Number.isSafeInteger(value) && value >= 0); return value; }
function url(value) {
  text(value);
  const parsed = new URL(value);
  requireThat(['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password &&
    !parsed.hash && !parsed.search && parsed.href === value);
  return parsed;
}
const commercialKeys = ['companyId', 'redemptionId', 'sharedAccountId', 'assignmentRevision'];
// Same maximum batch count as the original tool delivery preflight; never split automatically.
const MAX_COOKIE_SLOTS = 50;
const scopeKeys = ['sourceId', 'serviceOrigin', 'siteId', 'subjectId',
  'authorizationRevision', 'operationKind', 'targetUrl'];

/** Journal format validator: returns the canonical key unchanged, throws on invalid input.
 * It proves structure only, not current authority. Exact JSON encoding prevents alias keys.
 */
export function validateScopeKey(key) {
  requireThat(typeof key === 'string' && key.length <= 20_000);
  const tuple = JSON.parse(key);
  requireThat(Array.isArray(tuple) && tuple.length === 8 && JSON.stringify(tuple) === key);
  tuple.slice(0, 7).forEach(text);
  requireThat(new URL(`${tuple[1]}/`).origin === tuple[1]);
  url(`${tuple[1]}/`); url(tuple[6]);
  const allocation = tuple[7];
  requireThat(Array.isArray(allocation));
  if (allocation[0] === 'ordinary') {
    requireThat(allocation.length === 2 && allocation[1] === 'no-assignment');
  } else {
    requireThat(allocation[0] === 'commercial' && allocation.length === 5);
    allocation.slice(1).forEach(text);
  }
  return key;
}

/** Fixed source policy is explicit ordinary/commercial; requiresMembership is not a policy.
 * cookieSlots contain metadata only. A resolved storeId MUST come from the original legitimately
 * authorized browser context, never a remote response or a fixture's static "0". Resolved
 * partitionKey null means unpartitioned; this pure validator cannot establish either context.
 * When the original SDK resolves omitted fields privately, use the explicit metadata pair
 * {storeId:null,partitionKey:'unresolved'}. This does not grant authority, assert a Store or
 * Partition, or belong in an SDK payload; it conservatively prevents claiming context isolation.
 * Original setMany({url,cookies}) accepts storeId/partitionKey on each cookie row; this module
 * does not create that payload or bypass its exact-batch confirmation and Authority checks.
 * Parent-domain SSO is intentionally not admitted by declarations, though conflict checks cover it.
 */
export function validateDeclarations(site, source) {
  exact(site, ['siteId', 'label', 'targetUrl', 'sourceIds', 'cookieSlots', 'verification', 'policyVersion']);
  exact(source, ['sourceId', 'serviceOrigin', 'serviceRevision', 'policy', 'endpoints',
    'operationKinds', 'maxAuthorizationMs', 'maxDeliveryMs']);
  for (const key of ['siteId', 'label', 'policyVersion', 'verification']) text(site[key]);
  for (const key of ['sourceId', 'serviceRevision']) text(source[key]);
  const target = url(site.targetUrl);
  requireThat(new URL(`${text(source.serviceOrigin)}/`).origin === source.serviceOrigin);
  url(`${source.serviceOrigin}/`);
  requireThat(['ordinary', 'commercial'].includes(source.policy));
  for (const list of [site.sourceIds, source.operationKinds]) {
    requireThat(Array.isArray(list) && list.length > 0 && new Set(list).size === list.length);
    list.forEach(text);
  }
  requireThat(site.sourceIds.includes(source.sourceId));
  exact(source.endpoints, ['authorization', 'session']);
  for (const endpoint of Object.values(source.endpoints)) {
    requireThat(url(endpoint).origin === source.serviceOrigin);
  }
  requireThat(time(source.maxAuthorizationMs) > 0 && time(source.maxDeliveryMs) > 0);
  requireThat(Array.isArray(site.cookieSlots) && site.cookieSlots.length > 0 &&
    site.cookieSlots.length <= MAX_COOKIE_SLOTS);
  const seen = new Set();
  for (const slot of site.cookieSlots) {
    exact(slot, ['name', 'domain', 'hostOnly', 'path', 'storeId', 'partitionKey',
      'secure', 'httpOnly', 'sameSite']);
    const normalized = normalizeCookieScope(slot);
    requireThat(normalized !== null && normalized.domain === target.hostname &&
      pathMatches(target.pathname, normalized.path));
    requireThat(typeof slot.secure === 'boolean' && typeof slot.httpOnly === 'boolean' &&
      ['strict', 'lax', 'no_restriction'].includes(slot.sameSite) &&
      (!slot.secure || target.protocol === 'https:') &&
      (slot.sameSite !== 'no_restriction' || slot.secure) &&
      (!slot.name.startsWith('__Secure-') || slot.secure) &&
      (!slot.name.startsWith('__Host-') || (slot.secure && slot.hostOnly && slot.path === '/')));
    // hostOnly/security attributes do not turn the same browser storage slot into another slot.
    const identity = JSON.stringify([normalized.name, normalized.domain, normalized.path,
      normalized.storeId, normalized.partition]);
    requireThat(!seen.has(identity));
    seen.add(identity);
  }
  // Snapshot only reviewed metadata; later mutation of input must not alter a captured intent.
  const copy = JSON.parse(JSON.stringify({site, source}));
  const freeze = value => {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  return freeze(copy);
}

/** Returns a strict secret-free descriptor, not proof of transport authentication or Chrome grant.
 * Ordinary still requires subject + explicit site/operation grant + revision + bounded validity.
 * Commercial additionally binds company/redemption/account/assignment and membership authority.
 */
export function validateAuthorization(context, response, now) {
  const {site, source} = validateDeclarations(context.site, context.source);
  const keys = ['sourceId', 'serviceOrigin', 'serviceRevision', 'siteId', 'subjectId',
    'authorizationRevision', 'policy', 'policyVersion', 'targetUrl', 'operationKinds',
    'authorized', 'issuedAt', 'expiresAt'];
  exact(response, source.policy === 'commercial' ? [...keys, ...commercialKeys, 'membershipAuthorized'] : keys);
  for (const key of ['sourceId', 'serviceOrigin', 'serviceRevision', 'policy'])
    requireThat(response[key] === source[key]);
  for (const key of ['siteId', 'policyVersion', 'targetUrl']) requireThat(response[key] === site[key]);
  text(response.subjectId); text(response.authorizationRevision);
  requireThat(response.authorized === true && Array.isArray(response.operationKinds) &&
    response.operationKinds.length > 0 && new Set(response.operationKinds).size === response.operationKinds.length);
  response.operationKinds.forEach(kind => requireThat(source.operationKinds.includes(kind)));
  requireThat(time(response.issuedAt) <= time(now) && time(response.expiresAt) > now &&
    response.expiresAt > response.issuedAt && response.expiresAt - response.issuedAt <= source.maxAuthorizationMs);
  if (source.policy === 'commercial') {
    commercialKeys.forEach(key => text(response[key]));
    requireThat(response.membershipAuthorized === true);
  }
  return Object.freeze({...response, operationKinds: Object.freeze([...response.operationKinds])});
}

/** JSON tuple, never delimiter concatenation. Delivery/request IDs remain scoped beneath this key. */
export function createScopeKey(context, authorization, operationKind, now) {
  const auth = validateAuthorization(context, authorization, now);
  requireThat(auth.operationKinds.includes(text(operationKind)));
  return validateScopeKey(JSON.stringify([...scopeKeys.map(key => key === 'operationKind' ? operationKind : auth[key]),
    auth.policy === 'commercial' ? ['commercial', ...commercialKeys.map(key => auth[key])] : ['ordinary', 'no-assignment']]));
}

/** Metadata envelope only: keep Cookie payload in the original controller's transient memory.
 * Scope must be rebuilt from the CURRENT authorization at response time and again before commit.
 */
export function validateSessionResponse(context, authorization, response, {requestId, operationKind, now}) {
  exact(response, ['deliveryId', 'requestId', 'scopeKey', 'serviceRevision', 'policyVersion', 'issuedAt', 'expiresAt']);
  const scopeKey = createScopeKey(context, authorization, operationKind, now);
  text(response.deliveryId); text(requestId);
  requireThat(response.requestId === requestId && response.scopeKey === scopeKey &&
    response.serviceRevision === context.source.serviceRevision && response.policyVersion === context.site.policyVersion);
  requireThat(time(response.issuedAt) <= time(now) && time(response.expiresAt) > now &&
    response.expiresAt > response.issuedAt && response.expiresAt <= authorization.expiresAt &&
    response.expiresAt - response.issuedAt <= context.source.maxDeliveryMs);
  return Object.freeze({...response});
}

/** Source clocks never share samples, accept out-of-order samples, or regress server time.
 * begin() is called before each request; sample() only after selection/response checks.
 * A broken monotonic provider latches closed for that source; recreate only with fresh authority.
 */
export function createSourceClocks(monotonicNow = () => performance.now()) {
  const clocks = new Map();
  function state(source) {
    const key = JSON.stringify([text(source.sourceId), text(source.serviceOrigin)]);
    if (!clocks.has(key)) clocks.set(key, {sequence: 0, server: null, tick: null, broken: false});
    return clocks.get(key);
  }
  function tick(clock) {
    const value = monotonicNow();
    if (!Number.isFinite(value) || value < 0 || (clock.tick !== null && value < clock.tick)) clock.broken = true;
    requireThat(!clock.broken);
    if (clock.server !== null) clock.server += value - clock.tick;
    clock.tick = value;
    return clock.server;
  }
  return Object.freeze({
    begin(source) { const clock = state(source); tick(clock); return ++clock.sequence; },
    sample(source, sequence, serverNow) {
      const clock = state(source);
      requireThat(Number.isSafeInteger(sequence) && sequence > 0 && sequence === clock.sequence);
      tick(clock);
      clock.server = Math.max(clock.server ?? 0, time(serverNow));
      // Consume the ticket so a duplicate response cannot refresh a sample.
      ++clock.sequence;
      return Math.ceil(clock.server);
    },
    now(source) { const value = tick(state(source)); return value === null ? null : Math.ceil(value); }
  });
}

/** select/invalidate on site, identity, navigation, grant/revision changes or teardown.
 * Capture once per request. Request identity rejects an earlier response even after A -> B -> A.
 * pageIdentity is the opaque document identity already available from the original Authority.
 */
export function createSelectionGuard() {
  let generation = 0, current = null, latest = null;
  return Object.freeze({
    select({scopeKey, policyVersion, serviceRevision, pageIdentity}) {
      validateScopeKey(scopeKey);
      [policyVersion, serviceRevision, pageIdentity].forEach(text);
      current = Object.freeze({scopeKey, policyVersion, serviceRevision, pageIdentity, generation: ++generation});
      latest = null;
      return current;
    },
    capture(requestId) {
      requireThat(current !== null); text(requestId);
      latest = Object.freeze({...current, requestId});
      return latest;
    },
    isCurrent(ticket) { return current !== null && latest !== null && ticket === latest; },
    invalidate() { ++generation; current = null; latest = null; }
  });
}

function pathMatches(path, prefix) {
  return path === prefix || (path.startsWith(prefix) && (prefix.endsWith('/') || path[prefix.length] === '/'));
}
// Metadata normalization only. A null result is ambiguous and must fail closed.
export function normalizeCookieScope(scope) {
  if (!object(scope)) return null;
  try {
    const {name, domain, hostOnly, path, storeId, partitionKey} = scope;
    text(name); text(domain);
    const unresolved = storeId === null && partitionKey === 'unresolved';
    if (!unresolved) { text(storeId); requireThat(partitionKey !== 'unresolved'); }
    requireThat(name.length <= 256 && /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u.test(name));
    requireThat(typeof hostOnly === 'boolean' && typeof path === 'string' && path.startsWith('/') &&
      path.length <= 512 && /^[\x20-\x3a\x3c-\x7e]+$/u.test(path));
    const host = domain.replace(/^\./u, '').toLowerCase();
    requireThat(host.length <= 253 && host.split('.').every(label =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label)) &&
      new URL(`https://${host}/`).hostname === host && (!hostOnly || !domain.startsWith('.')));
    let partition = unresolved ? 'unresolved' : null;
    if (!unresolved && partitionKey !== null) {
      exact(partitionKey, ['topLevelSite', 'hasCrossSiteAncestor']);
      requireThat(new URL(`${text(partitionKey.topLevelSite)}/`).origin === partitionKey.topLevelSite &&
        !new URL(partitionKey.topLevelSite).port && typeof partitionKey.hasCrossSiteAncestor === 'boolean');
      url(`${partitionKey.topLevelSite}/`);
      partition = JSON.stringify([partitionKey.topLevelSite, partitionKey.hasCrossSiteAncestor]);
    }
    return {name, domain: host, hostOnly, path, storeId, partition};
  } catch { return null; }
}

/** true = overlap OR insufficient evidence; false only proves these metadata slots disjoint.
 * Ports/target URLs/site IDs are not isolation. This does not read current browser Cookies,
 * authorize replacement, relax trusted confirmation, or release any unknown journal lock.
 */
export function cookieScopesOverlap(left, right) {
  const a = normalizeCookieScope(left), b = normalizeCookieScope(right);
  if (!a || !b) return true;
  if (a.name !== b.name) return false;
  // Only two resolved contexts can prove separation. An unresolved context may
  // overlap ANY known Store/Partition, but still cannot reach an unrelated Host/path.
  if (a.storeId !== null && b.storeId !== null &&
    (a.storeId !== b.storeId || a.partition !== b.partition)) return false;
  const accepts = (scope, host) => scope.domain === host || (!scope.hostOnly && host.endsWith(`.${scope.domain}`));
  return (accepts(a, b.domain) || accepts(b, a.domain)) &&
    (pathMatches(a.path, b.path) || pathMatches(b.path, a.path));
}
