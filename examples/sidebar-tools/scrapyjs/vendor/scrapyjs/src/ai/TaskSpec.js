'use strict';

function fault(code, message = code) { return Object.assign(new Error(message), { code }); }
function assertNodeRuntime() {
  if (typeof process === 'undefined' || !process.versions?.node || typeof require('crypto').createHash !== 'function') throw fault('UNSUPPORTED_CAPABILITY', 'AI HTTP profile requires Node');
}
function data(value, depth = 0) {
  if (depth > 32) throw fault('JSON_DEPTH');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw fault('JSON_ONLY');
  const out = Array.isArray(value) ? [] : {};
  for (const key of Object.keys(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw fault('JSON_KEY');
    out[key] = data(value[key], depth + 1);
  }
  return out;
}
// A small JSON reader preserves duplicate-key rejection before JSON.parse loses it.
function parseJson(raw, maxBytes = 16384) {
  if (typeof raw !== 'string') return data(raw);
  if (new TextEncoder().encode(raw).length > maxBytes) throw fault('JSON_SIZE');
  let at = 0;
  const ws = () => { while (/[ \t\r\n]/.test(raw[at] || '') && at < raw.length) at++; };
  const string = () => {
    const start = at++;
    while (at < raw.length) {
      if (raw[at] === '\\') { at += 2; continue; }
      if (raw[at++] === '"') return JSON.parse(raw.slice(start, at));
    }
    throw fault('JSON_INVALID');
  };
  function value(depth = 0) {
    if (depth > 32) throw fault('JSON_DEPTH');
    ws(); const token = raw[at];
    if (token === '"') return string();
    if (token === '{' || token === '[') {
      at++; ws(); const object = token === '{'; const end = object ? '}' : ']';
      const result = object ? {} : []; const keys = new Set();
      if (raw[at] === end) { at++; return result; }
      for (;;) {
        ws(); let key;
        if (object) {
          if (raw[at] !== '"') throw fault('JSON_INVALID');
          key = string(); ws(); if (raw[at++] !== ':') throw fault('JSON_INVALID');
          if (keys.has(key)) throw fault('JSON_DUPLICATE_KEY');
          if (['__proto__', 'constructor', 'prototype'].includes(key)) throw fault('JSON_KEY');
          keys.add(key);
        }
        const next = value(depth + 1);
        if (object) result[key] = next; else result.push(next);
        ws(); if (raw[at] === end) { at++; return result; }
        if (raw[at++] !== ',') throw fault('JSON_INVALID');
      }
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(raw.slice(at));
    if (!match) throw fault('JSON_INVALID');
    at += match[0].length; return JSON.parse(match[0]);
  }
  try { const result = value(); ws(); if (at !== raw.length) throw fault('JSON_INVALID'); return data(result); }
  catch (error) { throw error.code ? error : fault('JSON_INVALID'); }
}
function deepFreeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }
function canonical(value) {
  const v = data(value);
  const encode = x => x && typeof x === 'object' ? Array.isArray(x) ? '[' + x.map(encode).join(',') + ']' : '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + encode(x[k])).join(',') + '}' : JSON.stringify(x);
  return encode(v);
}
function digest(value) {
  if (typeof process === 'undefined' || !process.versions?.node) throw fault('UNSUPPORTED_CAPABILITY', 'AI hashing requires Node');
  const crypto = require('crypto');
  if (typeof crypto.createHash !== 'function') throw fault('UNSUPPORTED_CAPABILITY', 'AI hashing requires Node crypto');
  return crypto.createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}
function keys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fault('SCHEMA');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw fault('UNKNOWN_KEY', 'Unknown key: ' + key);
}
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function integer(value, max = 10000, min = 1) { return Number.isSafeInteger(value) && value >= min && value <= max; }
function selector(value, allowAdjacent = false) {
  if (!text(value) || value.length > 256) throw fault('CSS_SYNTAX');
  // Small CSS subset: compound tag/id/class/equality attributes, descendant/child/adjacent sibling.
  const ident = '[a-zA-Z_][a-zA-Z0-9_-]*';
  const attr = '\\[' + ident + '(?:=(?:"[^"\\\\\\]\\r\\n]*"|\'[^\'\\\\\\]\\r\\n]*\'|' + ident + '))?\\]';
  const suffix = '(?:[.#]' + ident + '|' + attr + ')';
  const compound = '(?:' + ident + suffix + '*|' + suffix + '+)';
  const combinator = allowAdjacent === true ? '[>+]' : '>';
  const re = new RegExp('^' + compound + '(?:(?:\\s*' + combinator + '\\s*|\\s+)' + compound + ')*$');
  if (!re.test(value.trim())) throw fault('CSS_SYNTAX');
  try { require('cheerio').load('<div></div>')(value); } catch { throw fault('CSS_SYNTAX'); }
  return value.trim();
}
function assertAllowedUrl(value, spec, base) {
  let url;
  try { url = new URL(value, base); } catch { throw fault('URL_INVALID'); }
  if (!['http:', 'https:'].includes(url.protocol) || !spec.allowedProtocols.includes(url.protocol) || url.username || url.password || !spec.allowedOrigins.includes(url.origin)) throw fault('URL_SCOPE');
  if (spec.allowedPathPrefixes && !spec.allowedPathPrefixes.some(p => url.pathname === p || url.pathname.startsWith(p.endsWith('/') ? p : p + '/'))) throw fault('URL_SCOPE');
  // Encoded separators cannot escape a configured path boundary through a server decoder.
  if (spec.allowedPathPrefixes && /%(?:2f|5c|2e)/i.test(url.pathname)) throw fault('URL_SCOPE');
  url.hash = ''; return url.href;
}
function missingBusiness(s) {
  const missing = [];
  if (!text(s.goal || s.userIntent)) missing.push('goal');
  for (const name of ['seedUrls', 'allowedOrigins', 'allowedProtocols', 'identity']) if (!Array.isArray(s[name]) || !s[name].length) missing.push(name);
  if (!s.list?.fields || !Object.keys(s.list.fields).length) missing.push('list.fields');
  for (const stage of ['list', ...(s.mode === 'list-detail' ? ['detail'] : [])]) {
    if (!s[stage]?.fields) { if (stage === 'detail') missing.push('detail.fields'); continue; }
    for (const [key, f] of Object.entries(s[stage].fields)) {
      if (!text(f.meaning)) missing.push(stage + '.fields.' + key + '.meaning');
      for (const prop of ['valueType', 'required', 'cardinality']) if (f[prop] === undefined) missing.push(stage + '.fields.' + key + '.' + prop);
    }
  }
  for (const name of ['maxListPages', 'maxItems', 'maxRequests', 'maxMs', 'requestTimeoutMs', 'maxBodyBytes', ...(s.mode === 'list-detail' ? ['maxDetailPages'] : [])]) if (s.limits?.[name] === undefined) missing.push('limits.' + name);
  if (!s.acceptance || s.acceptance.minItems === undefined || typeof s.acceptance.requireNaturalEnd !== 'boolean') missing.push('acceptance');
  if (!text(s.format)) missing.push('format');
  if (!text(s.mode)) missing.push('mode');
  return missing;
}
function prepareTaskSpec(raw) {
  assertNodeRuntime();
  const s = parseJson(raw, 65536);
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw fault('SCHEMA');
  if (s.profile && s.profile !== 'http-cheerio') throw fault('UNSUPPORTED_CAPABILITY');
  const missing = missingBusiness(s);
  return missing.length ? { status: 'needsInput', missing } : { status: 'ready', taskSpec: validateTaskSpec(s) };
}
function validateTaskSpec(raw) {
  assertNodeRuntime();
  const s = parseJson(raw, 65536);
  keys(s, ['schemaVersion', 'taskId', 'purpose', 'execution', 'allowedOrigins', 'allowedProtocols', 'allowedPathPrefixes', 'identity', 'duplicatePolicy', 'concurrency', 'list', 'detail', 'states', 'pagination', 'limits', 'expectedDelivery', 'synthetic', 'userIntent', 'goal', 'mode', 'profile', 'browserAI', 'seedUrlsBySplit', 'seedUrls', 'excludedRegions', 'errorCodes', 'format', 'acceptance']);
  if (s.profile !== 'http-cheerio' || (s.execution && s.execution !== 'http-cheerio') || !['list', 'list-detail'].includes(s.mode) || (s.concurrency !== undefined && s.concurrency !== 1)) throw fault('UNSUPPORTED_CAPABILITY');
  const missing = missingBusiness(s); if (missing.length) throw fault('TASK_NEEDS_INPUT', missing.join(', '));
  if (s.schemaVersion !== 1 || (s.duplicatePolicy && s.duplicatePolicy !== 'error') || !['json', 'jsonl', 'csv'].includes(s.format)) throw fault('TASK_SCHEMA');
  for (const origin of s.allowedOrigins) { let u; try { u = new URL(origin); } catch { throw fault('URL_SCOPE'); } if (u.origin !== origin || !['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw fault('URL_SCOPE'); }
  if (!s.allowedProtocols.every(p => ['http:', 'https:'].includes(p))) throw fault('URL_SCOPE');
  if (s.allowedPathPrefixes && (!Array.isArray(s.allowedPathPrefixes) || !s.allowedPathPrefixes.length || !s.allowedPathPrefixes.every(p => typeof p === 'string' && p.startsWith('/') && !/[?#\\%]/.test(p)))) throw fault('URL_SCOPE');
  s.seedUrls = s.seedUrls.map(url => assertAllowedUrl(url, s));
  // Corpus routing annotations are not business input and must never reach a model.
  delete s.seedUrlsBySplit;
  if (s.seedUrls.length !== 1) throw fault('UNSUPPORTED_CAPABILITY', 'First version accepts one ordered seed');
  keys(s.limits, ['maxListPages', 'maxDetailPages', 'maxItems', 'maxRequests', 'maxMs', 'requestTimeoutMs', 'maxBodyBytes']);
  for (const [key, v] of Object.entries(s.limits)) if (!integer(v, key === 'maxBodyBytes' ? 10485760 : key.endsWith('Ms') ? 600000 : 20000, key === 'maxDetailPages' && s.mode === 'list' ? 0 : 1)) throw fault('TASK_LIMIT');
  if (s.limits.requestTimeoutMs > s.limits.maxMs) throw fault('TASK_LIMIT');
  keys(s.acceptance, ['minItems', 'exactItems', 'requireNaturalEnd']);
  if (!integer(s.acceptance.minItems, s.limits.maxItems, 0) || (s.acceptance.exactItems !== undefined && (!integer(s.acceptance.exactItems, s.limits.maxItems, 0) || s.acceptance.exactItems < s.acceptance.minItems))) throw fault('TASK_ACCEPTANCE');
  if (s.mode === 'list' && s.detail) throw fault('UNSUPPORTED_CAPABILITY');
  for (const stage of ['list', ...(s.mode === 'list-detail' ? ['detail'] : [])]) {
    const section = s[stage];
    keys(section, stage === 'list' ? ['container', 'record', 'fields'] : ['container', 'linkField', 'follow', 'matchFields', 'fields']);
    if (section.container) selector(section.container);
    for (const [name, f] of Object.entries(section.fields)) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw fault('FIELD_SCHEMA');
      keys(f, ['selector', 'read', 'attr', 'required', 'cardinality', 'normalizers', 'valueType', 'missing', 'meaning']);
      if (!['string', 'number', 'boolean', 'url'].includes(f.valueType) || typeof f.required !== 'boolean' || !['one', 'many'].includes(f.cardinality)) throw fault('FIELD_SCHEMA');
      f.normalizers ??= f.valueType === 'url' ? ['resolveUrl'] : [];
      if (!f.required && f.missing === undefined) f.missing = null;
      if (!Array.isArray(f.normalizers) || !f.normalizers.every(n => ['trim', 'resolveUrl'].includes(n)) || (!f.required && f.missing !== null)) throw fault('FIELD_SCHEMA');
      if (f.valueType === 'url' && !f.normalizers.includes('resolveUrl')) throw fault('FIELD_SCHEMA');
      if (f.valueType !== 'url' && f.normalizers.includes('resolveUrl')) throw fault('FIELD_SCHEMA');
      if (f.selector) selector(f.selector, true);
      if (f.read && !['text', 'attr'].includes(f.read)) throw fault('FIELD_SCHEMA');
      if (f.attr && !['href', 'src'].includes(f.attr)) throw fault('FIELD_SCHEMA');
      delete f.selector; delete f.read; delete f.attr;
    }
    delete section.container; delete section.record;
  }
  if (!s.identity.every(k => s.list.fields[k]?.required && s.list.fields[k]?.cardinality === 'one')) throw fault('FIELD_IDENTITY');
  if (s.mode === 'list-detail' && (s.detail.follow !== 'onePerListRecord' || s.list.fields[s.detail.linkField]?.valueType !== 'url' || !s.list.fields[s.detail.linkField]?.required || !Array.isArray(s.detail.matchFields) || !s.detail.matchFields.length || !s.detail.matchFields.every(k => s.list.fields[k]?.required && s.detail.fields[k]?.required))) throw fault('DETAIL_SCHEMA');
  if (s.mode === 'list-detail' && Object.keys(s.detail.fields).some(key => s.list.fields[key] && !s.detail.matchFields.includes(key))) throw fault('DETAIL_SCHEMA');
  if (!s.states || typeof s.states.allowEmpty !== 'boolean' || !s.pagination) throw fault('TASK_SCHEMA');
  keys(s.states, ['ready', 'empty', 'login', 'error', 'allowEmpty']);
  for (const k of ['ready', 'empty', 'login', 'error']) { if (s.states[k] !== undefined) selector(s.states[k]); delete s.states[k]; }
  keys(s.pagination, ['kind', 'selector', 'attr', 'disabledSelector', 'endSelector', 'missingNextIsEnd']);
  if (s.pagination.kind !== 'nextHref' || s.pagination.attr !== 'href' || typeof s.pagination.missingNextIsEnd !== 'boolean') throw fault('UNSUPPORTED_CAPABILITY');
  for (const k of ['selector', 'disabledSelector', 'endSelector']) { if (s.pagination[k] !== undefined) selector(s.pagination[k]); delete s.pagination[k]; }
  s.excludedRegions ??= [];
  if (!Array.isArray(s.excludedRegions)) throw fault('TASK_SCHEMA');
  s.excludedRegions.forEach(value => selector(value));
  return deepFreeze(s);
}
function validateCandidate(raw, taskSpec) {
  const s = validateTaskSpec(taskSpec); const c = parseJson(raw);
  if (canonical(c).length > 16384) throw fault('JSON_SIZE');
  keys(c, ['schemaVersion', 'profile', 'list', 'detail', 'states', 'pagination']);
  if (c.schemaVersion !== 1 || c.profile !== 'http-cheerio') throw fault('UNSUPPORTED_CAPABILITY');
  if (s.mode === 'list' && c.detail) throw fault('UNSUPPORTED_CAPABILITY');
  for (const stage of ['list', ...(s.mode === 'list-detail' ? ['detail'] : [])]) {
    const section = c[stage]; keys(section, stage === 'list' ? ['container', 'record', 'fields'] : ['container', 'fields']);
    section.container = selector(section.container); keys(section.fields, Object.keys(s[stage].fields));
    if (Object.keys(section.fields).length !== Object.keys(s[stage].fields).length) throw fault('FIELD_SCHEMA');
    for (const [name, f] of Object.entries(section.fields)) {
      keys(f, ['selector', 'read', 'attr']); f.selector = selector(f.selector, true);
      if (!['text', 'attr'].includes(f.read) || (f.read === 'attr' ? !['href', 'src'].includes(f.attr) : f.attr !== undefined)) throw fault('FIELD_SCHEMA');
      if (s[stage].fields[name].valueType === 'url' && f.read !== 'attr') throw fault('FIELD_SCHEMA');
    }
  }
  keys(c.list.record, ['selector', 'relation']); c.list.record.selector = selector(c.list.record.selector);
  if (c.list.record.relation !== 'directChildren') throw fault('UNSUPPORTED_CAPABILITY');
  keys(c.states, ['ready', 'empty', 'login', 'error', 'allowEmpty']);
  if (c.states.allowEmpty !== s.states.allowEmpty) throw fault('CANDIDATE_CONSTRAINT');
  for (const k of ['ready', 'empty', 'login', 'error']) c.states[k] = selector(c.states[k]);
  keys(c.pagination, ['kind', 'selector', 'attr', 'disabledSelector', 'endSelector', 'missingNextIsEnd']);
  if (c.pagination.kind !== s.pagination.kind || c.pagination.attr !== 'href' || c.pagination.missingNextIsEnd !== s.pagination.missingNextIsEnd) throw fault('CANDIDATE_CONSTRAINT');
  for (const k of ['selector', 'disabledSelector', 'endSelector']) c.pagination[k] = selector(c.pagination[k]);
  return deepFreeze(c);
}
module.exports = { validateTaskSpec, prepareTaskSpec, validateCandidate, assertAllowedUrl, selector, parseJson, canonical, digest, deepFreeze, fault };
