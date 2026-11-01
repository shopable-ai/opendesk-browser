'use strict';

const TYPES = ['text', 'number', 'date', 'url', 'image'];
const ATTRIBUTES = ['href', 'src', 'alt', 'title', 'datetime', 'content', 'text'];
const RESERVED = ['constructor', 'prototype', '__proto__', 'toString', 'valueOf', 'hasOwnProperty'];

function invalid(message) {
  throw Object.assign(new Error(message), { code: 'E_AI_VALIDATION', errorCode: 'E_AI_VALIDATION' });
}

function object(value, name, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid(`${name} must be a JSON object`);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')
        || (allowed && !allowed.includes(key))) invalid(`${name} contains an unsupported key or accessor`);
  }
  return value;
}

function selector(value, field = false) {
  if (typeof value !== 'string' || !value.trim() || value.length > 500
      || /::|\/\/|[{};`]|\b(?:javascript|eval|function)\b/i.test(value)
      || (field && /^:scope\s*$/.test(value.trim()))) invalid('Only CSS descendant selectors are supported');
  return value.trim();
}

function fieldKey(key) {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) || RESERVED.includes(key)) invalid('Invalid or reserved field key');
}

/** Validate before crawling. Return only a cloned, normalized JSON browser profile; do not mutate config. */
function validateConfig(config) {
  object(config, 'config');
  const validation = object(config.validation, 'validation', ['version', 'rowShape']);
  if (validation.version !== 1 || typeof validation.rowShape !== 'string' || validation.rowShape.length > 200) invalid('Unsupported validation version or rowShape');
  const [tag, ...classes] = validation.rowShape.split('.');
  if (!/^[a-z][a-z0-9-]*$/.test(tag) || classes.length > 3 || new Set(classes).size !== classes.length
      || classes.some(c => !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(c) || /token|secret|session|listselector|highlight/i.test(c))) invalid('rowShape must be a DOM-agent tag/class token');
  const input = object(config.itemConfig, 'itemConfig');
  const keys = Object.keys(input).filter(key => key !== '_listContainer' && key !== '_listItem');
  if (!keys.length || keys.length > 20) invalid('itemConfig must contain 1–20 fields');
  const itemConfig = {};
  if (Object.hasOwn(input, '_listContainer')) itemConfig._listContainer = selector(input._listContainer);
  if (Object.hasOwn(input, '_listItem')) itemConfig._listItem = selector(input._listItem);
  for (const key of keys) {
    fieldKey(key);
    if (typeof input[key] !== 'string') {
      const field = object(input[key], 'field descriptor', ['selector', 'read', 'attr', 'cardinality']);
      if (!['text', 'attr'].includes(field.read) || !['one', 'many'].includes(field.cardinality)
          || (field.read === 'attr' ? !ATTRIBUTES.includes(field.attr) || field.attr === 'text' : Object.hasOwn(field, 'attr'))) invalid('Unsupported field descriptor read, attribute or cardinality');
      itemConfig[key] = { selector: selector(field.selector, true), read: field.read,
        ...(field.read === 'attr' ? { attr: field.attr } : {}), cardinality: field.cardinality };
      continue;
    }
    const parts = input[key].trim().split('::');
    if (parts.length > 2 || (parts.length === 2 && !ATTRIBUTES.includes(parts[1]))) invalid('Unsupported field attribute');
    itemConfig[key] = selector(parts[0], true) + (parts.length === 2 ? `::${parts[1]}` : '');
  }
  const requirements = config.fieldRequirements === undefined ? [] : config.fieldRequirements;
  if (!Array.isArray(requirements) || requirements.length > 20) invalid('fieldRequirements must be an array of at most 20 fields');
  // Reject sparse arrays, accessors and extra properties without invoking serialization hooks.
  if (Reflect.ownKeys(requirements).length !== requirements.length + 1) invalid('fieldRequirements must be a JSON array');
  const fieldRequirements = [], seen = new Set();
  for (let i = 0; i < requirements.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(requirements, String(i));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid('fieldRequirements must be a JSON array');
    const field = object(descriptor.value, 'field requirement', ['key', 'required', 'valueType']);
    if (typeof field.key !== 'string' || !keys.includes(field.key) || seen.has(field.key)
        || typeof field.required !== 'boolean' || !TYPES.includes(field.valueType)) invalid('Invalid, duplicate or unknown field requirement');
    seen.add(field.key);
    fieldRequirements.push({ key: field.key, required: field.required, valueType: field.valueType });
  }
  if (!Object.hasOwn(itemConfig, '_listContainer') && !Object.hasOwn(itemConfig, '_listItem')) invalid('A record selector or explicit legacy scope is required');
  let selection;
  try { selection = require('../item/record-selection').recordSelection(itemConfig._listContainer, itemConfig._listItem); }
  catch (_) { invalid('Invalid record selection'); }
  return { validation: { version: 1, rowShape: validation.rowShape }, itemConfig, fieldRequirements, selection };
}

// This callback must remain self-contained: ChromePage serializes it into the page's DOM realm.
function inspectDOM(config) {
  const result = { valid: true, checkedRows: 0, rowShape: null, issues: [],
    ...(typeof document.baseURI === 'string' ? { baseURL: document.baseURI } : {}) };
  const issue = (code, message, details = {}) => {
    result.valid = false;
    result.issues.push({ code, message, ...details });
  };
  const excluded = 'script,style,noscript,template,iframe,object,embed,input,textarea,select,button,[contenteditable]:not([contenteditable="false" i]),[role~="textbox" i],[role~="searchbox" i],[hidden],[aria-hidden="true"],[data-ai-selector-ui]';
  const media = ['img', 'video', 'audio'];
  function visible(el) {
    if (!el || el.isContentEditable || el.closest(excluded)) return false;
    for (let p = el; p && p.nodeType === 1; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse'
          || s.opacity === '0' || s.contentVisibility === 'hidden') return false;
      if (p.tagName === 'DETAILS' && !p.open && p !== el) {
        const summary = Array.from(p.children).find(child => child.tagName === 'SUMMARY');
        if (!summary?.contains(el)) return false;
      }
    }
    return true;
  }
  function token(el) {
    const classes = Array.from(el.classList).filter(c => /^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(c)
      && !/token|secret|session|listselector|highlight/i.test(c)).slice(0, 3);
    // The admitted class alphabet needs no CSS escaping, matching DOM-agent's CSS.escape output.
    return el.tagName.toLowerCase() + classes.map(c => '.' + c).join('');
  }
  function valueOf(el, attribute) {
    if (attribute === 'text') return (el.textContent || '').trim();
    if (attribute) return el.getAttribute(attribute) || '';
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return (el.innerText || '').trim() || el.getAttribute('href') || '';
    if (media.includes(tag)) return el.getAttribute('src') || '';
    return (el.textContent || '').trim();
  }
  function semantic(value, el, attribute, type) {
    if (attribute === 'text' && ['url', 'image'].includes(type)) return 'Text cannot satisfy a URL or image field';
    if (!attribute && ['text', 'number', 'date'].includes(type)
        && (media.includes(el.tagName.toLowerCase()) || el.tagName === 'A' && !(el.innerText || '').trim())) return 'Media or empty-link fallback cannot be text';
    if (['url', 'image'].includes(type)) {
      try { if (!['http:', 'https:'].includes(new URL(value, document.baseURI).protocol)) return 'Unsupported URL protocol'; }
      catch { return 'Invalid URL'; }
      if (type === 'image' && attribute !== 'src') return 'Image fields require the src attribute';
      if (type === 'url' && attribute !== 'href') return 'URL fields require the href attribute';
    }
    if (type === 'number' && !/^[\s￥¥$€£+-]*\d+(?:[,，]\d{3})*(?:\.\d+)?\s*(?:%|元|件)?$/.test(String(value))) return 'Ambiguous number';
    if (type === 'date') {
      const m = /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})(?:日|(?:[ T].*)?)$/.exec(String(value).trim());
      if (!m || !Number.isFinite(Date.parse(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`))
          || Number(m[2]) > 12 || Number(m[3]) > new Date(Number(m[1]), Number(m[2]), 0).getDate()) return 'Ambiguous date';
    }
    return null;
  }
  try {
    const plan = config.selection;
    const containers = plan.listSelector === null ? [] : Array.from(document.querySelectorAll(plan.listSelector));
    if (plan.listSelector !== null && !containers.length) {
      const title = String(document.title || '').trim();
      const denied = /^(?:401(?:\s+unauthorized)?|403(?:\s+forbidden)?|429(?:\s+too many requests)?|access denied|forbidden|Security Verification|请进行安全验证(?:\s*\(Security Verification\))?)$/i.test(title);
      issue(denied ? 'E_AI_PAGE_ACCESS' : 'E_AI_STALE', denied ? 'Target page requires access verification: ' + title : 'List scope no longer matches', {key:'_listContainer',hits:0});
      return result;
    }
    if (containers.some(container => container.shadowRoot || !visible(container))) {
      issue('E_AI_STALE', 'List scope is hidden or unsupported');
      return result;
    }
    // A document query is already ordered and unique, even for overlapping scopes.
    // For legacy container-only profiles, collect direct children by identity.
    const admitted = new Set();
    if (plan.listSelector !== null) for (const container of containers) for (const child of container.children) admitted.add(child);
    let selected;
    try { selected = Array.from(document.querySelectorAll(plan.itemSelector || '*')); }
    catch { issue('E_AI_VALIDATION', 'Invalid record CSS selector', {selector:plan.itemSelector}); return result; }
    const rows = selected.filter(row => plan.listSelector === null || admitted.has(row));
    if (!rows.length || rows.length > 500) {
      const title = String(document.title || '').trim();
      const denied = /^(?:401(?:\s+unauthorized)?|403(?:\s+forbidden)?|429(?:\s+too many requests)?|access denied|forbidden|Security Verification|请进行安全验证(?:\s*\(Security Verification\))?)$/i.test(title);
      issue(!rows.length && denied ? 'E_AI_PAGE_ACCESS' : 'E_AI_STALE', 'List must contain 1–500 selected records', {key:plan.listSelector === null ? '_listItem' : '_listContainer',hits:rows.length});
      return result;
    }
    result.rowShape = token(rows[0]);
    const fields = Object.entries(config.itemConfig).filter(([key]) => key !== '_listContainer' && key !== '_listItem').map(([key, source]) => {
      const descriptor = typeof source !== 'string';
      const [selector, attribute] = descriptor
        ? [source.selector, source.read === 'text' ? 'text' : source.attr] : source.split('::');
      const requirement = config.fieldRequirements.find(field => field.key === key);
      return { key, selector, attribute, many: descriptor && source.cardinality === 'many', descriptor, required: requirement?.required ?? false, valueType: requirement?.valueType };
    });
    for (const [rowIndex, row] of rows.entries()) {
      result.checkedRows++;
      if (!visible(row) || row.shadowRoot || row.matches('script,style,iframe,thead,tbody,tfoot')
          || token(row) !== result.rowShape || token(row) !== config.validation.rowShape) issue('E_AI_STALE', 'Row is hidden, unsupported or has changed shape', { rowIndex });
      for (const field of fields) {
        const details = { rowIndex, key: field.key };
        let matches;
        try { matches = Array.from(row.querySelectorAll(field.selector)); }
        catch { issue('E_AI_VALIDATION', 'Invalid field CSS selector', details); continue; }
        if ((!field.many && matches.length > 1) || (!matches.length && field.required)) {
          issue('E_AI_STALE', 'Field selector cardinality changed', { ...details, hits: matches.length });
          continue;
        }
        for (const el of matches) {
          if (!visible(el) || el.shadowRoot) {
            issue('E_AI_STALE', 'Field is hidden or uses Shadow DOM', details);
            continue;
          }
          if (field.valueType === undefined) continue;
          const value = valueOf(el, field.attribute);
          if (!value || !String(value).trim()) {
            // Explicit text reads preserve prepared optional empty cells. Legacy
            // string profiles still reject matched empty nodes, as before.
            if (!(field.descriptor && field.attribute === 'text' && !field.required && !['url', 'image'].includes(field.valueType))) {
              issue('E_AI_STALE', 'Field is empty or its attribute is missing', details);
            }
            continue;
          }
          const error = semantic(value, el, field.attribute, field.valueType);
          if (error) issue('E_AI_VALIDATION', error, details);
        }
      }
    }
  } catch {
    issue('E_AI_VALIDATION', 'Invalid CSS selector or unavailable native DOM capability');
  }
  return result;
}

/** Always resolve diagnostics. rowShape is the observed first-row token, or null before inspection. */
async function validateBrowserProfile(page, spiderConfig) {
  try {
    const config = validateConfig(spiderConfig);
    if (!page || typeof page.evaluate !== 'function') invalid('A page.evaluate transport is required');
    const report = await page.evaluate(inspectDOM, config);
    if (!report || typeof report.valid !== 'boolean' || !Number.isInteger(report.checkedRows)
        || report.checkedRows < 0 || report.checkedRows > 500 || !Array.isArray(report.issues)
        || (report.rowShape !== null && typeof report.rowShape !== 'string')) invalid('Invalid browser validation transport result');
    if (report.baseURL !== undefined && (typeof report.baseURL !== 'string' || !/^https?:\/\//i.test(report.baseURL))) invalid('Invalid browser base URL');
    return { valid: report.valid, checkedRows: report.checkedRows, rowShape: report.rowShape, issues: report.issues,
      ...(report.baseURL === undefined ? {} : { baseURL: report.baseURL }) };
  } catch (error) {
    return { valid: false, checkedRows: 0, rowShape: null, issues: [{ code: 'E_AI_VALIDATION', message: error?.message || 'Browser validation failed' }] };
  }
}

// Opted-in semantic URL fields agree with the absolute URLs shown by DOM sampling.
// Legacy ItemLoader callers retain their literal attribute behavior.
function normalizeRecord(record, config, baseURL) {
  if (!Object.hasOwn(config, 'validation')) return record;
  const { fieldRequirements, itemConfig } = validateConfig(config);
  const output = { ...record };
  for (const field of fieldRequirements) {
    if (!['url', 'image'].includes(field.valueType) || output[field.key] === undefined) continue;
    const many = itemConfig[field.key].cardinality === 'many';
    if (!many && output[field.key] === '') continue;
    const resolve = value => {
      if (typeof value !== 'string' || (many && !value.trim())) invalid('URL field must be a nonempty string');
      let url;
      try { url = new URL(value, baseURL); } catch { invalid('URL field could not be resolved'); }
      if (!['http:', 'https:'].includes(url.protocol)) invalid('URL field must use HTTP or HTTPS');
      return url.href;
    };
    if (many) {
      if (!Array.isArray(output[field.key])) invalid('URL many field must be an array');
      output[field.key] = Array.from(output[field.key], resolve);
    } else {
      if (typeof output[field.key] !== 'string') invalid('URL field must be a scalar string');
      output[field.key] = resolve(output[field.key]);
    }
  }
  return output;
}

module.exports = { validateConfig, validateBrowserProfile, normalizeRecord };
