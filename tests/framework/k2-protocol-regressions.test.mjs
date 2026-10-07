import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validate,canonical} from '../../src/platform/protocol.js';
import {encodeValue,decodeValue} from '../../src/platform/page-port/codec.js';
import schema from '../../src/platform/schema.js';

// K2 regression oracles. These cover the recorded R1/R2/R7 defects; they do
// not claim native IndexedDB, browser sender, or product migration acceptance.
const fixture = async name => JSON.parse(await readFile(
  new URL(`../../contracts/fixtures/${name}.json`, import.meta.url), 'utf8'));

test('typed wire wrapper depth does not shorten the declared value depth budget', () => {
  let value = {present:undefined,zero:0,falseValue:false};
  for (let i=0;i<11;i++) value = {nested:value};
  const wire = encodeValue(value);
  assert.throws(() => canonical({paramsWire:wire}),error => error.code === 'E_SCHEMA');
  const json = canonical({paramsWire:wire},{maxDepth:48});
  assert.deepEqual(decodeValue(JSON.parse(json).paramsWire),value);
  assert.throws(() => encodeValue({tooDeep:value}),error => error.code === 'E_VALUE_SERIALIZATION');
  for (const maxDepth of [-1,49,Infinity,'48'])
    assert.throws(() => canonical({}, {maxDepth}),error => error.code === 'E_SCHEMA');
});

test('R1: cyclic and malformed local schema references produce bounded typed rejection', () => {
  const names = ['CycleA','CycleB','BadReference'];
  try {
    schema.$defs.CycleA = {$ref:'#/$defs/CycleB'};
    schema.$defs.CycleB = {$ref:'#/$defs/CycleA'};
    assert.throws(() => validate('CycleA',{}), error => error.code === 'E_SCHEMA' && /cyclic/.test(error.message));
    for (const reference of [null,'','#/$defs/missing','https://foreign/schema','#/$defs/bad~2token']) {
      schema.$defs.BadReference = {$ref:reference};
      assert.throws(() => validate('BadReference',{}),error => error.code === 'E_SCHEMA');
    }
  } finally { for (const name of names) delete schema.$defs[name]; }
});
test('R1: long acyclic reference chains have a schema traversal depth budget', () => {
  try {
    for (let i=0;i<140;i++) schema.$defs[`Depth${i}`] = i === 139 ? {type:'object'} : {$ref:`#/$defs/Depth${i+1}`};
    assert.throws(() => validate('Depth0',{}),error => error.code === 'E_SCHEMA' && /budget/.test(error.message));
  } finally { for (let i=0;i<140;i++) delete schema.$defs[`Depth${i}`]; }
});

test('R1: the inherited RulePlan resolves its nested local JSON pointer', async () => {
  const {plan} = await fixture('read-command');
  assert.equal(validate('RulePlan', plan), plan);
  assert.throws(() => validate('RulePlan', {...plan, list: {selector: ''}}),
    error => error.code === 'E_SCHEMA');
});

test('R2: closed shapes reject names inherited by the schema properties object', async () => {
  const template = await fixture('transaction-template');
  for (const name of ['toString', 'valueOf', 'hasOwnProperty']) {
    assert.throws(() => validate('TemplateRevision', {...template, [name]: true}),
      error => error.code === 'E_SCHEMA', name);
  }
  assert.equal(validate('TemplateRevision', template), template);
});

test('R7: durable timestamps require an actual calendar date and explicit timezone', () => {
  const receipt = {
    attemptId: 'attempt-1', downloadId: 1, observedState: 'complete',
    observedAt: '2026-10-02T00:00:00.000Z', evidence: 'search',
    byExtensionId: 'extension-1', late: false, browserDownloadComplete: true,
    diskHashVerified: false, interruptReason: null
  };
  for (const observedAt of ['2024-02-29T00:00:00Z', '2026-10-02T15:00:00+05:30']) {
    const value = {...receipt, observedAt};
    assert.equal(validate('Receipt', value), value);
  }
  for (const observedAt of [
    '2025-02-29T00:00:00Z', '2026-04-31T00:00:00Z',
    '2026-10-02T24:00:00Z', '2026-10-02T15:00:00'
  ]) {
    assert.throws(() => validate('Receipt', {...receipt, observedAt}),
      error => error.code === 'E_SCHEMA', observedAt);
  }
});

test('build schema compaction retains the full canonical contract deterministically', async () => {
  const {compactSchemaSource} = await import('../../scripts/compact-schema.mjs');
  const source = await readFile(new URL('../../src/platform/schema.js', import.meta.url), 'utf8');
  const original = JSON.parse(await readFile(new URL('../../docs/contracts/schema.json', import.meta.url), 'utf8'));
  const code = compactSchemaSource(source);
  // Evaluate the real build transform in an isolated Node module, never privileged browser code.
  const {default: compacted} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  assert.deepEqual(schema, original);
  assert.deepEqual(compacted, original);
  assert.equal(compactSchemaSource(source), code);
  assert.ok(code.length < source.length - 3000);
});

test('schema compaction rejects missing export and preserves object-looking strings as data', async () => {
  const {compactSchemaSource} = await import('../../scripts/compact-schema.mjs');
  assert.throws(() => compactSchemaSource('globalThis.schema = {}'), /Expected generated schema default export/);
  const objectText = JSON.stringify({type:'string',minLength:1,maxLength:128,pattern:'^[A-Za-z0-9._:-]+$'});
  const fixture = 'export default ' + JSON.stringify({literal:objectText}) + ';\n';
  const code = compactSchemaSource(fixture);
  const {default: value} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  assert.deepEqual(value, {literal:objectText});
});
