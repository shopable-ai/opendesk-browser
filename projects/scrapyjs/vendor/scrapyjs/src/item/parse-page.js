'use strict';

const { validateTaskSpec, validateCandidate, fault } = require('../ai/TaskSpec');
const { inspectPage } = require('../ai/ConfigExecutor');
const ScopedDownloader = require('../middleware/ScopedDownloader');
const { fieldRule } = require('./item-loader-extraction');
const { recordSelection } = require('./record-selection');

// Adapt ordinary CSS declarations to the existing constrained executor.
module.exports = function parsePage(response, options = {}) {
  try {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw fault('TASK_SCHEMA');
    const allowed = ['itemConfig', 'required', 'urlFields', 'identity', 'states', 'pagination', 'excludedRegions', 'scope', 'maxBodyBytes', 'deadline', 'signal'];
    if (Object.keys(options).some(key => !allowed.includes(key))) throw fault('UNKNOWN_KEY');
    const scope = ScopedDownloader.validateScope(options.scope);
    const itemConfig = options.itemConfig;
    if (!itemConfig || typeof itemConfig !== 'object' || Array.isArray(itemConfig)) throw fault('FIELD_SCHEMA');
    if (typeof itemConfig._listItem !== 'string' || !itemConfig._listItem.trim()) throw fault('CSS_SYNTAX');
    let selection;
    try { selection = recordSelection(itemConfig._listContainer, itemConfig._listItem); } catch (_) { throw fault('CSS_SYNTAX'); }
    const names = Object.keys(itemConfig).filter(key => !['_listContainer', '_listItem'].includes(key));
    if (!names.length || names.some(key => key.startsWith('_') || ['constructor', 'prototype'].includes(key) || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key))) throw fault('FIELD_SCHEMA');
    const fieldsArray = (value, fallback, nonempty = false) => {
      const result = value === undefined ? fallback : value;
      if (!Array.isArray(result) || (nonempty && !result.length) || result.some(key => typeof key !== 'string' || !names.includes(key)) || new Set(result).size !== result.length) throw fault('FIELD_SCHEMA');
      return result;
    };
    const required = fieldsArray(options.required, []);
    const urlFields = fieldsArray(options.urlFields, []);
    const identity = fieldsArray(options.identity, ['url'], true);
    const fields = {};
    const reads = {};
    for (const name of names) {
      const rule = itemConfig[name];
      // Reuse suffix parsing, but expose only this executor's CSS/text/href/src subset.
      if (typeof rule !== 'string' && (!rule || typeof rule !== 'object' || Array.isArray(rule) ||
          Object.keys(rule).some(key => !['selector', 'read', 'attr', 'cardinality'].includes(key)) ||
          (Object.hasOwn(rule, 'cardinality') && !['one', 'many'].includes(rule.cardinality)) ||
          !['text', 'attr'].includes(rule.read) ||
          (rule.read === 'attr' && !['href', 'src'].includes(rule.attr)))) throw fault('FIELD_SCHEMA');
      let parsed;
      try { parsed = fieldRule(rule, name); } catch (_) { throw fault('FIELD_SCHEMA'); }
      const attr = parsed.attr === null ? 'text' : parsed.attr;
      if (parsed.xpath || !parsed.selector || !['text', 'href', 'src'].includes(attr)) throw fault('FIELD_SCHEMA');
      const isUrl = urlFields.includes(name);
      fields[name] = { meaning: name, required: required.includes(name), valueType: isUrl ? 'url' : 'string', cardinality: parsed.cardinality === 'many' ? 'many' : 'one', normalizers: isUrl ? ['trim', 'resolveUrl'] : ['trim'] };
      reads[name] = attr === 'text' ? { selector: parsed.selector, read: 'text' } : { selector: parsed.selector, read: 'attr', attr };
    }
    if (!options.states || options.states.allowEmpty !== false || !options.pagination) throw fault('TASK_SCHEMA');
    for (const key of ['ready', 'empty', 'login', 'error']) {
      if (typeof options.states[key] !== 'string' || !options.states[key].trim()) throw fault('CSS_SYNTAX');
    }
    const pagination = {
      ...options.pagination,
      kind: options.pagination.kind === undefined ? 'nextHref' : options.pagination.kind,
      attr: options.pagination.attr === undefined ? 'href' : options.pagination.attr,
    };
    if (pagination.kind !== 'nextHref' || pagination.attr !== 'href' || typeof pagination.missingNextIsEnd !== 'boolean') throw fault('TASK_SCHEMA');
    for (const key of ['selector', 'disabledSelector', 'endSelector']) {
      if (typeof options.pagination[key] !== 'string' || !options.pagination[key].trim()) throw fault('CSS_SYNTAX');
    }
    const maxBodyBytes = options.maxBodyBytes === undefined ? scope.limits.maxBodyBytes : options.maxBodyBytes;
    if (options.maxBodyBytes !== undefined && options.scope.limits?.maxBodyBytes !== undefined && options.maxBodyBytes !== options.scope.limits.maxBodyBytes) throw fault('TASK_LIMIT');
    const spec = validateTaskSpec({
      schemaVersion: 1, profile: 'http-cheerio', mode: 'list',
      goal: 'Extract the explicitly configured CSS fields from this page',
      seedUrls: [response?.url], identity, list: { fields },
      states: options.states, pagination,
      allowedOrigins: scope.allowedOrigins, allowedProtocols: scope.allowedProtocols, allowedPathPrefixes: scope.allowedPathPrefixes,
      excludedRegions: options.excludedRegions ?? [],
      limits: { maxListPages: 1, maxDetailPages: 0, maxItems: 20000, maxRequests: 1, maxMs: 600000, requestTimeoutMs: 10000, maxBodyBytes },
      acceptance: { minItems: 1, requireNaturalEnd: false }, format: 'json',
    });
    const candidate = validateCandidate({
      schemaVersion: 1, profile: 'http-cheerio',
      list: { ...(selection.listSelector === null ? {} : {container: selection.listSelector}), record: { selector: selection.itemSelector, relation: selection.relation }, fields: reads },
      states: options.states, pagination,
    }, spec);
    const source = { kind: 'http', url: response.url, status: response.status, html: response.text };
    const context = { deadline: options.deadline, signal: options.signal };
    const { records, next, errorCode } = inspectPage(source, candidate, spec, context);
    // A wrapper can hide excluded records from directChildren. Let the same
    // executor check their ancestry; never accept records from this safety probe.
    if (errorCode === 'PAGE_EMPTY' && spec.excludedRegions.length) {
      const probe = inspectPage(source, { ...candidate, list: { ...candidate.list, record: { ...candidate.list.record, relation: 'descendants' } } }, spec, context);
      if (probe.errorCode === 'ERROR_REGION_SELECTED') throw fault(probe.errorCode);
    }
    return { records, next, errorCode };
  } catch (error) {
    return { records: [], next: { kind: 'blocked', url: null }, errorCode: error.code || 'PAGE_INVALID' };
  }
};
