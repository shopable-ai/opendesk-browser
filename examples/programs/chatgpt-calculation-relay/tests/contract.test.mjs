import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {calculationInput,validateParams} from '../src/contract.js';
import {validateTaskParams} from '../../../../src/platform/tasks/contract.js';

const metadata=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const schema=metadata.opendesk.paramsSchema;

test('Task schema uses the same arithmetic defaults and integer bounds as the real entry', () => {
  assert.equal(metadata.version,'0.2.0');
  assert.equal(metadata.opendesk.id,'opendesk.chatgpt-calculation-relay');
  assert.deepEqual(calculationInput(validateTaskParams(schema,{})),calculationInput({}));
  for (const value of [-1000000,0,1000000]) {
    const input={addend:value,secondAddend:value,multiplier:value};
    validateParams(input);
    assert.deepEqual(calculationInput(validateTaskParams(schema,input)),input);
  }
  for (const key of ['addend','secondAddend','multiplier']) {
    for (const value of [-1000001,1000001,0.5,null,'17']) {
      assert.throws(() => validateTaskParams(schema,{[key]:value}));
      assert.throws(() => validateParams({[key]:value}),/E_RELAY_PARAMS/);
    }
  }
});

test('entry validates closed params and runId alphabet before any side effect', () => {
  for (const input of [null,[],17,{extra:true},{operation:null},{operation:'retry'},
    {runId:12345678},{runId:'short'},{runId:'unsafe id'},{runId:'a'.repeat(81)}])
    assert.throws(() => validateParams(input),/E_RELAY_PARAMS/);
});
