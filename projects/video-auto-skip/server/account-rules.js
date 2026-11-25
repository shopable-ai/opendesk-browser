import {parseAccountRuleChange} from '../src/account-rule-change.js';
import {EMPTY, readScope, updateScope} from '../src/rules.js';

export const PRODUCT_ID = 'video-auto-skip';
export const TIMING_RULES_PATH = '/v1/products/' + PRODUCT_ID + '/timing-rules';
const maxRulesBytes = 8192;
const maxRequestBytes = 2048;
const reply = (body, status = 200) => Response.json(body, {
  status, headers: {'Cache-Control': 'no-store'},
});

async function readChange(request) {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim() !== 'application/json' || !request.body) {
    throw new TypeError('Expected a JSON rule change');
  }
  const body = new Uint8Array(maxRequestBytes);
  let offset = 0;
  for await (const part of request.body) {
    if (part.length > body.length - offset) throw new TypeError('Rule change is too large');
    body.set(part, offset);
    offset += part.length;
  }
  const input = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(body.subarray(0, offset)));
  if (!input || Object.keys(input).length !== 2 || !Object.hasOwn(input, 'revision') ||
      !Number.isSafeInteger(input.revision) || input.revision < 0 || !Object.hasOwn(input, 'change')) {
    throw new TypeError('Expected one change with an expected revision');
  }
  return {revision: input.revision, change: parseAccountRuleChange(input.change)};
}

// The server owner provides a verifier for an active GrayDove session entitled
// to this product and a durable store. compareAndSet must resolve after commit
// and atomically match the supplied revision (missing record = revision 0).
export function createAccountRulesHandler({verifySession, store}) {
  return async request => {
    const url = new URL(request.url);
    if (url.pathname !== TIMING_RULES_PATH || url.search) return reply({code: 'NOT_FOUND'}, 404);
    if (!['GET', 'PATCH'].includes(request.method)) return reply({code: 'METHOD_NOT_ALLOWED'}, 405);
    try {
      const session = await verifySession(request, PRODUCT_ID);
      if (typeof session?.issuer !== 'string' || !session.issuer ||
          typeof session?.subject !== 'string' || !session.subject) return reply({code: 'AUTH_REQUIRED'}, 401);
      const key = JSON.stringify([session.issuer, session.subject, PRODUCT_ID]);
      if (request.method === 'GET') return reply(await store.get(key) ?? {revision: 0, rules: EMPTY});

      let patch;
      try { patch = await readChange(request); }
      catch { return reply({code: 'INVALID_CHANGE'}, 400); }
      const before = await store.get(key) ?? {revision: 0, rules: EMPTY};
      if (before.revision !== patch.revision) return reply({code: 'REVISION_CONFLICT'}, 409);
      const {target, changes} = patch.change;
      const context = {...target, episodeKey: target.episodeKey ?? 'unused'};
      const scope = {...readScope(before.rules, context, target.scope)};
      for (const [field, change] of Object.entries(changes)) {
        if (change.op === 'remove') delete scope[field];
        else scope[field] = change.rule;
      }
      const rules = updateScope(before.rules, context, target.scope, scope);
      if (new TextEncoder().encode(JSON.stringify(rules)).length > maxRulesBytes) {
        return reply({code: 'RULES_LIMIT'}, 413);
      }
      const revision = before.revision + 1;
      if (!Number.isSafeInteger(revision)) return reply({code: 'UNAVAILABLE'}, 503);
      if (!await store.compareAndSet(key, before.revision, {revision, rules})) {
        return reply({code: 'REVISION_CONFLICT'}, 409);
      }
      return reply({saved: true, revision});
    } catch {
      return reply({code: 'UNAVAILABLE'}, 503);
    }
  };
}
