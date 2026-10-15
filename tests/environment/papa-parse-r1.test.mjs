// Official Papa Parse 5.7.0 vendor asset; Node checks are not Chrome proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {BUILTIN_ABI,BUILTIN_CATALOG,BUILTIN_RUNTIME_CATALOG,PAGE_OPTIONAL_LIBRARY_IDS} from '../../src/libs/catalog.js';
import {controllerSelectedPackagedLibrary} from '../../src/libs/loader.js';
import {pageSelectedPackagedLibrary,compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';
import {fakeBuiltinSource} from './builtin-support.mjs';

globalThis.crypto ||= webcrypto;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const row=BUILTIN_CATALOG.libraries.papaParse;
const code=await readFile(row.source,'utf8');
const license=await readFile(row.licenseSource,'utf8');
const asset={id:'papaParse',version:row.version,abi:BUILTIN_ABI,code,
  bytes:Buffer.byteLength(code),sha256:digest(code),catalogSha256:fakeBuiltinSource.catalogSha256};

test('official 5.7.0 is pinned with MIT license and Page-only opt-in',()=>{
  assert.equal(row.origin,'vendor');
  assert.equal(row.default,false);
  assert.deepEqual(row.worlds,['USER_SCRIPT']);
  assert.equal(row.version,'5.7.0');
  assert.equal(row.bytes,Buffer.byteLength(code));
  assert.equal(row.sha256,digest(code));
  assert.equal(row.licenseSha256,digest(license));
  assert.equal(BUILTIN_RUNTIME_CATALOG.libraries.papaParse.output,'libs/vendor/papaparse/5.7.0/papaparse.min.js');
  assert.equal(PAGE_OPTIONAL_LIBRARY_IDS['papa-parse'],'papaParse');
  assert.equal(pageSelectedPackagedLibrary('// @opendesk-lib papa-parse\nasync function main(){}'),'papa-parse');
  assert.throws(()=>controllerSelectedPackagedLibrary('// @opendesk-lib papa-parse\nasync function main(){}'),
    error=>error.code==='E_BUILTIN_DECLARATION');
  assert.match(code,/Papa Parse/);
  assert.match(license,/MIT License/);
});

test('real upstream parse/unparse roundtrip protects formulae, commas, quotes and Chinese',()=>{
  const realm=vm.createContext({});
  vm.runInContext(code,realm,{timeout:3000});
  assert.equal(typeof realm.Papa.parse,'function');
  assert.equal(typeof realm.Papa.unparse,'function');
  const csv=realm.Papa.unparse([
    {name:'苹果, "Pro"',price:18},
    {name:'=SUM(1,2)',price:0}
  ],{columns:['name','price'],newline:'\r\n',escapeFormulae:true});
  assert(csv.includes('\r\n'));
  assert(csv.includes('""Pro""'));
  assert(csv.includes("'=SUM(1,2)"),'dangerous formula cell must be text');
  const parsed=realm.Papa.parse(csv,{header:true,skipEmptyLines:true});
  assert.equal(parsed.errors.length,0);
  assert.equal(parsed.data.length,2);
  assert.equal(parsed.data[0].name,'苹果, "Pro"');
  assert.equal(parsed.data[1].name,"'=SUM(1,2)");
});

test('existing Page library declaration and verified compile execute real Papa',async()=>{
  const sourceUtf8="// @opendesk-lib papa-parse\nasync function main(){const csv=Papa.unparse([{name:'Book',price:18},{name:'Pen',price:3}],{columns:['name','price'],escapeFormulae:true});const result=Papa.parse(csv,{header:true});return {count:result.data.length,total:result.data.reduce((n,r)=>n+Number(r.price),0)}}";
  const compiled=await compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSource:asset});
  assert.equal(compiled.packagedOptionalId,'papaParse');
  assert.equal(compiled.packagedOptionalSha256,row.sha256);
  const scope=vm.createContext({});
  const result=await vm.runInContext(compiled.js[0].code,scope,{timeout:3000});
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{count:2,total:21});
  assert.equal(typeof scope.Papa.parse,'function');
  await assert.rejects(compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSource:{...asset,code:code+'\n// tampered'}}),
    error=>error.code==='E_DEPENDENCY_HASH');
  const collision=vm.createContext({Papa:{spoofed:true}});
  await assert.rejects(async()=>vm.runInContext(compiled.js[0].code,collision,{timeout:3000}),
    /E_BUILTIN_COLLISION/);
});

test('Page rejects missing Papa resource',async()=>{
  const sourceUtf8='// @opendesk-lib papa-parse\nasync function main(){return Papa.parse("a,b\\nc,d").data}';
  await assert.rejects(compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource}),error=>error.code==='E_BUILTIN_VERSION_UNAVAILABLE');
  assert.equal(BUILTIN_CATALOG.libraries.papaParse.methods.join(','),'parse,unparse');
});
