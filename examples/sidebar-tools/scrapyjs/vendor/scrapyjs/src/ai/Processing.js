'use strict';

const Item = require('../item/Item');
const { splitPublication } = require('./Publication');
const MAX_RULES = 8;
const DERIVED_FIELDS = Object.freeze(['publication_raw', 'author', 'translator', 'publisher', 'publication_date', 'price', 'currency']);
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const fieldName = key => typeof key === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !['__proto__', 'prototype', 'constructor'].includes(key);

function fail(code, message) { throw Object.assign(new Error(message), { code, stage: 'pipeline' }); }
function keys(object, allowed) {
  if (!object || typeof object !== 'object' || Array.isArray(object)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(object))
      || Reflect.ownKeys(object).some(key => !allowed.includes(key)
        || !Object.getOwnPropertyDescriptor(object, key).enumerable
        || !owns(Object.getOwnPropertyDescriptor(object, key), 'value'))) {
    fail('PROCESSING_SCHEMA', 'Processing must contain only the supported JSON keys');
  }
}

function validate(processing, itemKeys) {
  keys(processing, ['version', 'rules']);
  if (processing.version !== 1 || !Array.isArray(processing.rules) || processing.rules.length > MAX_RULES) {
    fail('PROCESSING_SCHEMA', `Processing version 1 supports at most ${MAX_RULES} rules`);
  }
  if (itemKeys !== undefined && (!Array.isArray(itemKeys) || itemKeys.some(key => typeof key !== 'string') || new Set(itemKeys).size !== itemKeys.length)) {
    fail('PROCESSING_SCHEMA', 'Item keys must be an array of unique strings');
  }
  const fields = itemKeys === undefined ? null : new Set(itemKeys);
  const derived = new Set();
  const rules = [];
  for (const rule of processing.rules) {
    keys(rule, ['op', 'field']);
    if (rule.op !== 'splitPublication' || !fieldName(rule.field)) fail('PROCESSING_SCHEMA', 'Unsupported processing operation or field');
    if (fields && !fields.has(rule.field)) fail('PROCESSING_SOURCE', `Missing processing source: ${rule.field}`);
    if (DERIVED_FIELDS.includes(rule.field) || DERIVED_FIELDS.some(key => fields?.has(key) || derived.has(key))) {
      fail('PROCESSING_COLLISION', 'Processing would overwrite a reserved derived field');
    }
    DERIVED_FIELDS.forEach(key => derived.add(key));
    rules.push(Object.freeze({ op: rule.op, field: rule.field }));
  }
  return Object.freeze({ version: 1, rules: Object.freeze(rules) });
}

function outputFields(processing, itemKeys) {
  if (!Array.isArray(itemKeys)) fail('PROCESSING_SCHEMA', 'Output fields require an array of item keys');
  const config = validate(processing, itemKeys);
  return [...itemKeys, ...(config.rules.length ? DERIVED_FIELDS : [])];
}

function apply(record, processing) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) fail('PROCESSING_SOURCE', 'Processing requires an item record');
  const config = validate(processing, Object.keys(record));
  if (!config.rules.length) return { record, warnings: [] };
  const output = { ...record };
  const warnings = [];
  for (const rule of config.rules) {
    const split = splitPublication(record[rule.field]);
    for (const key of DERIVED_FIELDS) output[key] = split.values[key];
    warnings.push(...split.warnings);
  }
  return { record: output, warnings };
}

function processRecord(record, processing) {
  if (processing === undefined) return record;
  try { return apply(record, processing).record; }
  catch (error) { error.stage = 'pipeline'; throw error; }
}

function increment(stats, key, count = 1) {
  if (!stats) return;
  if (typeof stats.inc === 'function') stats.inc(key, count);
  else stats[key] = (stats[key] || 0) + count;
}

function createPipeline(processing) {
  const config = validate(processing);
  return function processingPipeline(item, spider) {
    if (!config.rules.length) return item;
    const stats = spider?.scrapy?.stats;
    increment(stats, 'processing/calls');
    try {
      const result = apply(item, config);
      if (stats) {
        const previous = typeof stats.get === 'function' ? stats.get('processing/warnings') : stats['processing/warnings'];
        const warnings = [...(Array.isArray(previous) ? previous : []), ...result.warnings.map(warning => ({ ...(item.url === undefined ? {} : { url: item.url }), ...warning }))];
        if (typeof stats.set === 'function') stats.set('processing/warnings', warnings);
        else stats['processing/warnings'] = warnings;
        increment(stats, 'processing/warningCount', result.warnings.length);
      }
      return new Item(result.record);
    } catch (error) {
      increment(stats, 'processing/errors');
      error.stage = 'pipeline';
      throw error;
    }
  };
}

module.exports = { validate, outputFields, processRecord, createPipeline, splitPublication, MAX_RULES };
