import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {requiredAssertions, savedSource} from './f3-api48-cases.mjs';

const definition = {id: 'F3-API99-ERR'};

function error(code, message = code, cause) {
  const value = new Error(message);
  value.name = 'PageError';
  value.code = code;
  if (cause !== undefined) value.cause = cause;
  return value;
}

async function run(recipe, overrides = {}) {
  const source = savedSource(definition, recipe);
  const file = {name: 'filename.jpg', type: 'image/jpeg', arrayBuffer: async () => new Uint8Array([97, 98, 99]).buffer};
  const context = {
    params: {},
    page: {
      waitForTimeout: async () => undefined,
      value: async () => 42,
      evaluate: async fn => fn(),
      fail(code, message, cause) { throw error(code, message, cause); },
      ...overrides
    },
    document: {querySelector: selector => selector === '#file' ? {files: [file]} : null},
    Error,
    JSON,
    Uint8Array
  };
  return vm.runInNewContext(`(async()=>{${source}})()`, context);
}

const checkNames = result => Array.from(result.checks, check => check.name);

test('F3 API48 assertion inventory projects generated reject, cause, eq and files labels', async () => {
  const recipe = {body: `eq('value',await page.value(),42);await reject('with-cause',()=>page.fail('E_FAIL','contains needle',{detail:'needle'}),['E_FAIL'],'needle');await reject('without-cause',()=>page.fail('E_OTHER'),['E_OTHER']);await files('uploaded');`};
  assert.deepEqual(requiredAssertions(recipe), ['value', 'with-cause-rejected', 'with-cause-code', 'with-cause-cause', 'without-cause-rejected', 'without-cause-code', 'uploaded']);
  const result = await run(recipe);
  assert.equal(result.failure, null);
  assert.deepEqual(checkNames(result), requiredAssertions(recipe));
});

test('F3 API48 generated savedSource records reject artifacts and file assertions', async () => {
  const result = await run({body: `await reject('projected',()=>page.fail('E_PROJECTED','projected message'),['E_PROJECTED']);await files('exact-file');`});
  assert.equal(result.failure, null);
  assert.equal(result.artifacts.projected.code, 'E_PROJECTED');
  assert.deepEqual(checkNames(result), ['projected-rejected', 'projected-code', 'exact-file']);
});

test('F3 API48 null source recipes remain blocked with no required assertions', () => {
  assert.equal(savedSource(definition, {body: null}), null);
  assert.deepEqual(requiredAssertions({body: null}), []);
});

test('F3 API48 duplicate labels are inventoried once while generated checks still execute', async () => {
  const recipe = {body: `eq('same',1,1);eq('same',1,1);await reject('dup',()=>page.fail('E_DUP'),['E_DUP']);await reject('dup',()=>page.fail('E_DUP'),['E_DUP']);`};
  assert.deepEqual(requiredAssertions(recipe), ['same', 'dup-rejected', 'dup-code']);
  const result = await run(recipe);
  assert.equal(result.failure, null);
  assert.deepEqual(checkNames(result), ['same', 'same', 'dup-rejected', 'dup-code', 'dup-rejected', 'dup-code']);
});

test('F3 API48 assertion inventory fails closed for dynamic labels or causes', () => {
  assert.throws(() => requiredAssertions({body: `const name='dynamic';eq(name,1,1);`}), /Cannot determine eq assertion label/);
  assert.throws(() => requiredAssertions({body: `const cause='dynamic';await reject('dynamic-cause',()=>page.fail('E'),['E'],cause);`}), /Cannot determine reject cause assertion label/);
  assert.throws(() => requiredAssertions({body: `await reject(`}), /Cannot determine required assertions/);
});
