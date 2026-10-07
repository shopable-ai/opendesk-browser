// Stage 01 independent fixture oracle checks using Node built-ins, never product code.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const load = file => JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
const bytes = blob => fs.readFileSync(path.join(__dirname, blob.path));
const single = load('single-page/vector.json');
const template = single.expected.templateRevision;
const canonical = value => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
};
const content = Object.fromEntries(Object.entries(template).filter(([key]) => key !== 'contentHash'));
const canonicalBytes = Buffer.from(canonical(content), 'utf8');
assert.deepEqual(canonicalBytes, bytes(single.expected.canonicalTemplate));
assert.equal(crypto.createHash('sha256').update(canonicalBytes).digest('hex'), template.contentHash);
assert.equal(template.contentHash, '3475cba7ddc43506711b82a1865ae0228c056f074b45b364706322c057d681fa');
assert.equal(JSON.stringify(single.expected.typedRecords), bytes(single.expected.exports.json).toString('utf8'));
for (let i = 0; i < single.expected.rawRecords.length; i++) {
  const raw = single.expected.rawRecords[i]['name-url'];
  assert.equal(raw === null ? null : new URL(raw.trim(), single.input.context.documentBaseUrl).href, single.expected.typedRecords[i]['name-url']);
}

const urls = load('strict-url/vectors.json');
for (const vector of urls.cases) {
  const { context } = vector.input;
  const raw = vector.expected.rawRecords[0].value;
  const data = context.resolutionScope === 'data-field';
  let resolved = null, code = null;
  if (raw !== null) {
    const token = raw.trim();
    if (token === '') code = 'E_RECORD_URL_EMPTY';
    else {
      let parsed;
      try { parsed = new URL(token, context.documentBaseURI); }
      catch { code = 'E_RECORD_URL_INVALID'; }
      if (parsed) {
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') code = 'E_RECORD_URL_SCHEME';
        else if (parsed.username !== '' || parsed.password !== '') code = data ? 'E_RECORD_URL_CREDENTIALS' : 'E_TARGET_URL_CREDENTIALS';
        else if (!data && parsed.origin !== context.allowedOrigin) code = 'E_TARGET_ORIGIN';
        else resolved = parsed.href;
      }
    }
  }
  assert.equal(code, vector.expected.errors[0]?.code ?? null, vector.id);
  assert.equal(resolved, vector.expected.resolvedUrl, vector.id);
  assert.deepEqual(vector.expected.typedRecords, code ? [] : [{ value: resolved }], vector.id);
  assert.equal(vector.expected.pageSealable, !code && data, vector.id);
  assert.equal(vector.expected.targetValidationAllowed, !code && !data, vector.id);
}

function protectString(value) {
  return /^[\t\r]/.test(value) || /^[=+\-@]/.test(value.trimStart()) ? "'" + value : value;
}
function csvRow(cells) {
  return cells.map(cell => /[,"\r\n]/.test(cell) || (cells.length === 1 && cell === '') ? '"' + cell.replace(/"/g, '""') + '"' : cell).join(',') + '\r\n';
}
function csvArtifact(records, fields, columns) {
  const byId = Object.fromEntries(fields.map(field => [field.id, field]));
  const header = columns.map(id => protectString(byId[id].label));
  return csvRow(header) + records.map(record => csvRow(columns.map(id => {
    const value = record[id];
    if (value === null) return '';
    const text = String(value);
    return byId[id].type === 'string' ? protectString(text) : text;
  }))).join('');
}
assert.equal(csvArtifact(single.expected.typedRecords, template.fields, template.columns), bytes(single.expected.exports.csv).toString('utf8'));
const csvVectors = load('csv-formula-safety/vectors.json');
for (const vector of csvVectors.cases) {
  const input = vector.input;
  assert.equal(csvArtifact(input.typedRecords, input.fields, input.columns), bytes(vector.expected.csv).toString('utf8'), vector.id);
  assert.equal(JSON.stringify(input.typedRecords), bytes(vector.expected.json).toString('utf8'), vector.id);
  const value = input.typedRecords[0].value;
  const protection = input.fields[0].type === 'string' && typeof value === 'string' && protectString(value) !== value;
  assert.equal(protection, vector.expected.protectionApplied, vector.id);
  assert.deepEqual(vector.expected.cells, [value === null ? '' : protection ? protectString(String(value)) : String(value)], vector.id);
  if ('headerProtectionApplied' in vector.expected) assert.equal(protectString(input.fields[0].label) !== input.fields[0].label, vector.expected.headerProtectionApplied, vector.id);
}

const strict = load('strict-conversion/vectors.json');
for (const vector of strict.cases) {
  const field = vector.input.field;
  const raw = vector.expected.rawRecords[0].value;
  const token = field.transforms.includes('trim') ? raw.trim() : raw;
  let valid, value;
  if (field.type === 'number') {
    value = Number(token);
    valid = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(token) && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value));
  } else {
    valid = token === 'true' || token === 'false';
    value = token === 'true';
  }
  assert.equal(valid, vector.expected.pageSealable, vector.id);
  assert.deepEqual(valid ? [{ value }] : [], vector.expected.typedRecords, vector.id);
}
console.log(JSON.stringify({ fixtureIntegrity: 'verified', canonicalHash: template.contentHash, strictConversionVectors: strict.cases.length, strictUrlVectors: urls.cases.length, csvFormulaSafetyVectors: csvVectors.cases.length, status: 'planned', productResult: 'not-run', productConverterExecuted: false, chromeAcceptanceExecuted: false }));
