'use strict';

const { normalizeConfig, fault } = require('./item-loader-extraction');
const { parseJson } = require('../ai/TaskSpec');
const css = require('css-what'); // The structural parser already used by Cheerio.

function boundaries(selector) {
  let branches;
  try { branches = css.parse(selector); }
  catch (error) { throw fault('E_ITEMLOADER_SELECTOR', selector, error.message); }
  // Do not turn contextual/pseudo/sibling conditions into a weaker local CSS
  // rule. Ordinary parse still supports its existing broader selector syntax.
  if (branches.length !== 1 || branches[0].length > 128 || branches[0].some(token => !['tag','attribute','universal','descendant','child'].includes(token.type) || token.namespace)) return null;
  const tokens = branches[0], result = [];
  for (let i = 1; i < tokens.length - 1; i++) {
    // A leading child combinator is not portable between DOM querySelectorAll
    // and Cheerio find. Leave that case explicit instead of dropping the >.
    if (tokens[i].type === 'descendant') result.push({record:css.stringify([tokens.slice(0,i)]),relative:css.stringify([tokens.slice(i+1)])});
  }
  return result;
}

function normalize(fields, options) {
  fields = parseJson(fields, 65536); options = parseJson(options, 16384);
  if (Object.keys(options).some(key => !['required', 'identity', 'excludedRegions'].includes(key))) throw fault('E_ITEMLOADER_CONFIG', '', 'Unsupported preparation option');
  if (Object.keys(fields).some(key => ['_listItem', '_listContainer'].includes(key))) throw fault('E_ITEMLOADER_CONFIG', '', 'prepareList accepts flat fields; use parse for explicit record configurations');
  const config = normalizeConfig(fields);
  if (config.fields.length > 20 || config.fields.some(entry => !entry.field)) throw fault('E_ITEMLOADER_CAPABILITY', '', 'Preparation supports 1–20 flat CSS fields');
  for (const entry of config.fields) {
    if (entry.field.xpath) throw fault('E_ITEMLOADER_CAPABILITY', entry.key, 'List preparation requires CSS field evidence');
    entry.field.cardinality = entry.field.cardinality === 'many' ? 'many' : 'one';
    entry.boundaries = boundaries(entry.field.selector);
  }
  const keys = config.fields.map(entry => entry.key);
  for (const key of ['required', 'identity', 'excludedRegions']) {
    options[key] ??= [];
    if (!Array.isArray(options[key]) || options[key].length > 20 || new Set(options[key]).size !== options[key].length || options[key].some(value => typeof value !== 'string' || !value.trim() || (key !== 'excludedRegions' && !keys.includes(value)))) throw fault('E_ITEMLOADER_CONFIG', key, 'Expected known field names or CSS exclusion selectors');
  }
  for (const key of options.identity) if (!options.required.includes(key) || config.fields.find(entry => entry.key === key).field.cardinality !== 'one') throw fault('E_LIST_IDENTITY', key, 'Identity must use required single-value fields');
  return { fields: config.fields, ...options };
}


function checkRecords(input, records) {
  const blank = value => value == null || typeof value === 'string' && !value.trim() || Array.isArray(value) && value.every(blank);
  const seen = new Set();
  for (const [rowIndex, row] of records.entries()) {
    for (const key of input.required) if (blank(row[key])) throw fault('E_LIST_REQUIRED', key, 'Required field is empty in record ' + rowIndex);
    if (input.identity.length) {
      const id = JSON.stringify(input.identity.map(key => row[key]));
      if (seen.has(id)) throw fault('E_LIST_IDENTITY', '', 'Duplicate identity in record ' + rowIndex);
      seen.add(id);
    }
  }
}
module.exports = {normalize,checkRecords};
