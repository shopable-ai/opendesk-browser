'use strict';

const { validateTaskSpec, validateCandidate, fault } = require('../ai/TaskSpec');
const { inspectPage } = require('../ai/ConfigExecutor');
const ScopedDownloader = require('../middleware/ScopedDownloader');

// Adapt ordinary CSS declarations to the existing constrained executor.
module.exports = function parsePage(response, options = {}) {
  try {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw fault('TASK_SCHEMA');
    const allowed = ['itemConfig', 'required', 'urlFields', 'identity', 'states', 'pagination', 'excludedRegions', 'scope', 'maxBodyBytes', 'deadline', 'signal'];
    if (Object.keys(options).some(key => !allowed.includes(key))) throw fault('UNKNOWN_KEY');
    const scope = ScopedDownloader.validateScope(options.scope);
    const itemConfig = options.itemConfig;
    if (!itemConfig || typeof itemConfig !== 'object' || Array.isArray(itemConfig)) throw fault('FIELD_SCHEMA');
    if (typeof itemConfig._listContainer !== 'string' || !itemConfig._listContainer.trim() || typeof itemConfig._listItem !== 'string' || !itemConfig._listItem.trim()) throw fault('CSS_SYNTAX');
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
      if (typeof rule !== 'string') throw fault('FIELD_SCHEMA');
      const parts = rule.split('::').map(part => part.trim());
      if (parts.length !== 2 || !parts[0] || !['text', 'href', 'src'].includes(parts[1])) throw fault('FIELD_SCHEMA');
      const isUrl = urlFields.includes(name);
      fields[name] = { meaning: name, required: required.includes(name), valueType: isUrl ? 'url' : 'string', cardinality: 'one', normalizers: isUrl ? ['trim', 'resolveUrl'] : ['trim'] };
      reads[name] = parts[1] === 'text' ? { selector: parts[0], read: 'text' } : { selector: parts[0], read: 'attr', attr: parts[1] };
    }
    if (!options.states || options.states.allowEmpty !== false || !options.pagination) throw fault('TASK_SCHEMA');
    for (const key of ['ready', 'empty', 'login', 'error']) {
      if (typeof options.states[key] !== 'string' || !options.states[key].trim()) throw fault('CSS_SYNTAX');
    }
    if (options.pagination.kind !== 'nextHref' || options.pagination.attr !== 'href' || typeof options.pagination.missingNextIsEnd !== 'boolean') throw fault('TASK_SCHEMA');
    for (const key of ['selector', 'disabledSelector', 'endSelector']) {
      if (typeof options.pagination[key] !== 'string' || !options.pagination[key].trim()) throw fault('CSS_SYNTAX');
    }
    const maxBodyBytes = options.maxBodyBytes === undefined ? scope.limits.maxBodyBytes : options.maxBodyBytes;
    if (options.maxBodyBytes !== undefined && options.scope.limits?.maxBodyBytes !== undefined && options.maxBodyBytes !== options.scope.limits.maxBodyBytes) throw fault('TASK_LIMIT');
    const spec = validateTaskSpec({
      schemaVersion: 1, profile: 'http-cheerio', mode: 'list',
      goal: 'Extract the explicitly configured CSS fields from this page',
      seedUrls: [response?.url], identity, list: { fields },
      states: options.states, pagination: options.pagination,
      allowedOrigins: scope.allowedOrigins, allowedProtocols: scope.allowedProtocols, allowedPathPrefixes: scope.allowedPathPrefixes,
      excludedRegions: options.excludedRegions ?? [],
      limits: { maxListPages: 1, maxDetailPages: 0, maxItems: 20000, maxRequests: 1, maxMs: 600000, requestTimeoutMs: 10000, maxBodyBytes },
      acceptance: { minItems: 1, requireNaturalEnd: false }, format: 'json',
    });
    const candidate = validateCandidate({
      schemaVersion: 1, profile: 'http-cheerio',
      list: { container: itemConfig._listContainer, record: { selector: itemConfig._listItem, relation: 'directChildren' }, fields: reads },
      states: options.states, pagination: options.pagination,
    }, spec);
    const source = { kind: 'http', url: response.url, status: response.status, html: response.text };
    const context = { deadline: options.deadline, signal: options.signal };
    const { records, next, errorCode } = inspectPage(source, candidate, spec, context);
    // A wrapper can hide excluded records from directChildren. Let the same
    // executor check their ancestry; never accept records from this safety probe.
    if (errorCode === 'PAGE_EMPTY' && spec.excludedRegions.length) {
      const probe = inspectPage(source, { ...candidate, list: { ...candidate.list, container: candidate.list.container + ' ' + candidate.list.record.selector } }, spec, context);
      if (probe.errorCode === 'ERROR_REGION_SELECTED') throw fault(probe.errorCode);
    }
    return { records, next, errorCode };
  } catch (error) {
    return { records: [], next: { kind: 'blocked', url: null }, errorCode: error.code || 'PAGE_INVALID' };
  }
};
