'use strict';

const { validateTaskSpec, validateCandidate, assertAllowedUrl, canonical, fault } = require('./TaskSpec');

function identityOf(record, spec) { return canonical(spec.identity.map(key => record[key])); }
function sample(value, field) {
  if (/password|secret|token|credential|session|api.?key/i.test(field)) return '[redacted]';
  if (Array.isArray(value)) return value.slice(0, 2).map(v => sample(v, field));
  if (typeof value !== 'string') return value;
  if (/bearer\s|sk-[a-z0-9]{10}|(?:password|secret|token|api.?key)\s*[:=]/i.test(value)) return '[redacted]';
  if (/^https?:\/\//.test(value)) { const url = new URL(value); url.search = ''; value = url.href; }
  return value.slice(0, 80);
}
function inspectPage(source, candidate, taskSpec, context = {}) {
  let pageState = 'unknown';
  const evidence = { stage: context.stage || 'list', container: null, recordCount: 0, records: [] };
  let probe = { stage: evidence.stage };
  const blocked = error => { evidence.failure = { ...probe, code: error.code || 'PAGE_INVALID' }; return { pageState, records: [], next: { kind: 'blocked', url: null }, errorCode: error.code || 'PAGE_INVALID', evidence }; };
  const success = (records, next) => ({ pageState, records, next, errorCode: null, evidence });
  try {
    const spec = validateTaskSpec(taskSpec); const config = validateCandidate(candidate, spec);
    if (source.kind && source.kind !== 'http') throw fault('UNSUPPORTED_CAPABILITY');
    if (context.signal?.aborted) throw fault('ABORTED');
    if (context.deadline && Date.now() >= context.deadline) throw fault('TIME_BUDGET');
    const url = assertAllowedUrl(source.url, spec);
    if (typeof source.html !== 'string' || new TextEncoder().encode(source.html).length > spec.limits.maxBodyBytes) throw fault('PAGE_SIZE');
    const cheerio = require('cheerio'); const ItemLoader = require('../item/ItemLoader');
    const $ = cheerio.load(source.html);
    const stage = context.stage || 'list';
    if (!['list', 'detail'].includes(stage) || !config[stage]) throw fault('UNSUPPORTED_CAPABILITY');
    const section = config[stage]; const rules = spec[stage].fields;
    const safetyRegions = [...new Set([...spec.excludedRegions, '[data-role="error-region"]', config.states.login, config.states.error])];
    const excluded = element => safetyRegions.some(sel => $(element).is(sel) || $(element).parents(sel).length);
    const diagnostics = safetyRegions.filter(sel => ![config.states.login, config.states.error].includes(sel));
    const countState = name => $(config.states[name]).filter((_, el) => !diagnostics.some(sel => $(el).is(sel) || $(el).parents(sel).length)).length;
    if (source.status >= 400 || countState('error')) { pageState = 'error'; throw fault('PAGE_ERROR'); }
    if (countState('login')) { pageState = 'login'; throw fault('PAGE_LOGIN'); }
    const ready = countState('ready'); const empty = countState('empty');
    probe = { stage, selector: config.states.ready, count: ready };
    if (ready && empty) throw fault('PAGE_STATE_AMBIGUOUS');
    if (empty) pageState = 'empty'; else if (ready === 1) pageState = 'ready'; else throw fault('PAGE_NOT_READY');
    const container = $(section.container);
    evidence.container = { selector: section.container, matchCount: container.length };
    probe = { stage, selector: section.container, count: container.length };
    if (container.toArray().some(excluded)) throw fault('ERROR_REGION_SELECTED');
    if (container.length !== 1) throw fault('CONTAINER_CARDINALITY');
    const nodes = stage === 'list' ? container.children(config.list.record.selector) : container;
    evidence.recordCount = nodes.length;
    if (nodes.toArray().some(excluded)) throw fault('ERROR_REGION_SELECTED');
    const readNext = () => {
      const nextNodes = $(config.pagination.selector).filter((_, node) => !excluded(node) && !$(node).is(config.pagination.disabledSelector));
      const endNodes = $(config.pagination.endSelector).filter((_, node) => !excluded(node));
      probe = { stage, selector: config.pagination.selector, count: nextNodes.length };
      if (nextNodes.length > 1) throw fault('NEXT_CARDINALITY');
      if (nextNodes.length && endNodes.length) throw fault('NEXT_CONFLICT');
      if (nextNodes.length) {
        const href = nextNodes.attr('href'); if (!href?.trim()) throw fault('NEXT_MISSING');
        const next = { kind: 'href', url: assertAllowedUrl(href, spec, url) };
        if (next.url === url) throw fault('DUPLICATE_PAGE');
        return next;
      }
      if (endNodes.length || spec.pagination.missingNextIsEnd) return { kind: 'end', url: null };
      throw fault('NEXT_MISSING');
    };
    if (pageState === 'empty') {
      if (!spec.states.allowEmpty || nodes.length || stage === 'detail') throw fault('PAGE_EMPTY');
      return success([], readNext());
    }
    if (!nodes.length) throw fault('PAGE_EMPTY');
    const records = nodes.toArray().map((node, recordIndex) => {
      // A fragment has no page ancestors: model selectors cannot escape a record.
      const local = cheerio.load($.html(node), null, false); const root = local.root();
      const loaderRules = {};
      const detail = { recordIndex, fields: {} };
      if (recordIndex < 10) evidence.records.push(detail);
      for (const [key, field] of Object.entries(section.fields)) {
        const matches = root.find(field.selector);
        probe = { stage, recordIndex, field: key, selector: field.selector, count: matches.length };
        if (Object.keys(detail.fields).length < 32) detail.fields[key] = { selector: field.selector, matchCount: matches.length };
        if (matches.toArray().some(el => safetyRegions.some(sel => local(el).is(sel) || local(el).parents(sel).length))) throw fault('ERROR_REGION_SELECTED');
        const count = matches.length;
        if (rules[key].cardinality === 'one' && count > 1) throw fault('FIELD_CARDINALITY');
        if (rules[key].required && count === 0) throw fault('FIELD_REQUIRED');
        loaderRules[key] = field.selector + '::' + (field.read === 'text' ? 'text' : field.attr);
      }
      const raw = ItemLoader.extractItemData(local, root, loaderRules); const row = {};
      for (const [key, rule] of Object.entries(rules)) {
        const count = root.find(section.fields[key].selector).length;
        probe = { stage, recordIndex, field: key, selector: section.fields[key].selector, count };
        let values = Array.isArray(raw[key]) ? raw[key] : [raw[key]];
        if (!count) values = [];
        const normalize = input => {
          if (typeof input !== 'string') throw fault('FIELD_TYPE');
          let v = rule.normalizers.includes('trim') ? input.trim() : input;
          if (!v.trim()) { if (rule.required) throw fault('FIELD_REQUIRED'); return null; }
          if (rule.valueType === 'url') v = assertAllowedUrl(v, spec, url);
          if (rule.valueType === 'number') { if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(v) || !Number.isFinite(Number(v))) throw fault('FIELD_TYPE'); v = Number(v); }
          if (rule.valueType === 'boolean') { if (!['true', 'false'].includes(v)) throw fault('FIELD_TYPE'); v = v === 'true'; }
          return v;
        };
        if (!values.length) { if (rule.required) throw fault('FIELD_REQUIRED'); row[key] = rule.cardinality === 'many' ? [] : null; }
        else row[key] = rule.cardinality === 'many' ? values.map(normalize) : normalize(values[0]);
        if (detail.fields[key]) detail.fields[key].sampleValue = sample(row[key], key);
      }
      detail.association = { recordIndex, identity: spec.identity.filter(key => row[key] !== undefined).slice(0, 4).map(key => sample(row[key], key)) };
      return row;
    });
    if (stage === 'detail') {
      if (records.length !== 1) throw fault('FIELD_CARDINALITY');
      if (context.listRecord && spec.detail.matchFields.some(key => canonical(records[0][key]) !== canonical(context.listRecord[key]))) throw fault('DETAIL_MISMATCH');
      if (evidence.records[0]) evidence.records[0].association.listMatched = !!context.listRecord;
      return success(records, { kind: 'none', url: null });
    }
    const seen = new Set(context.seenIdentities || []);
    if (context.seenIdentityIds && spec.identity.length === 1) for (const id of context.seenIdentityIds) seen.add(canonical([id]));
    for (const row of records) { const id = identityOf(row, spec); if (seen.has(id)) throw fault('DUPLICATE_PAGE'); seen.add(id); }
    return success(records, readNext());
  } catch (error) { return blocked(error); }
}
module.exports = { inspectPage, identityOf };
