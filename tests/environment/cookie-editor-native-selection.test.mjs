import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const driver=fileURLToPath(new URL('../framework/cookie-editor-r33-native.mjs',import.meta.url));
function plan(cases,stage='import-export'){
  const env={...process.env};
  for(const key of Object.keys(env))if(key.startsWith('COOKIE_NATIVE_'))delete env[key];
  env.COOKIE_NATIVE_STAGE=stage;
  if(cases!==undefined)env.COOKIE_NATIVE_CASES=cases;
  return spawnSync(process.execPath,[driver,'--list-cases'],{env,encoding:'utf8'});
}
test('a selected JSON import plans without browser paths, seed CRUD or a sensitive grant',()=>{
  const result=plan('import-json-auto');assert.equal(result.status,0,result.stderr);
  const data=JSON.parse(result.stdout);assert.deepEqual(data.selected,['import-json-auto']);
  assert(!data.prerequisites.includes('gap-seed-import'));assert.equal(data.valuesGrant,false);
  assert(data.excluded.includes('continuous-CRUD'));assert(data.excluded.includes('observe'));
  assert(data.excluded.includes('clear'));assert(data.excluded.includes('lifecycle'));
});
test('metadata export needs the shared UI import but never a sensitive grant',()=>{
  const result=plan('export-metadata-json');assert.equal(result.status,0,result.stderr);
  const data=JSON.parse(result.stdout);assert(data.prerequisites.includes('gap-seed-import'));
  assert.equal(data.valuesGrant,false);assert.deepEqual(data.selected,['export-metadata-json']);
});
test('sensitive denial precedes the grant when combined with a value export',()=>{
  const result=plan('export-header,export-sensitive-denied');assert.equal(result.status,0,result.stderr);
  const data=JSON.parse(result.stdout);assert.equal(data.valuesGrant,true);
  assert.deepEqual(data.selected,['export-sensitive-denied','export-header']);
});
test('unknown and empty case filters fail before native configuration',()=>{
  for(const filter of ['export-typo','',',export-json']){
    const result=plan(filter);assert.notEqual(result.status,0);assert.match(result.stderr,/Unknown COOKIE_NATIVE_CASES/);
    assert(!result.stderr.includes('COOKIE_NATIVE_EXTENSION is required'));
  }
});
test('duplicate filters and filters on a broad legacy stage are rejected',()=>{
  assert.match(plan('export-json,export-json').stderr,/Duplicate COOKIE_NATIVE_CASES/);
  assert.match(plan('export-json','advanced').stderr,/COOKIE_NATIVE_CASES requires import-export/);
});
test('unknown stages fail instead of reporting an empty native suite as complete',()=>{
  const result=plan(undefined,'improt-export');assert.notEqual(result.status,0);
  assert.match(result.stderr,/Unknown COOKIE_NATIVE_STAGE/);
});
