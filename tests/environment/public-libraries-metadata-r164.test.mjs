import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {parseUserScriptDependencies,assertUserScriptExecutable} from '../../src/scripting/user-scripts/dependency-metadata.js';
import {compileLockedPageSource,pageSelectedPackagedLibrary,pageSelectedPackagedLibraries} from '../../src/scripting/user-scripts/execution-source.js';
import {BUILTIN_ABI,BUILTIN_RUNTIME_CATALOG} from '../../src/libs/runtime-contract.js';
import {fakeBuiltinSource} from './builtin-support.mjs';

globalThis.crypto ||= webcrypto;
const libraries=[['js-cookie','jsCookie'],['crypto-js','cryptoJs'],['file-saver','fileSaver'],
  ['query-string','queryString'],['axios','axios'],['store','store'],['cheerio','cheerio'],
  ['fingerprintjs','fingerprintjs'],['papa-parse','papaParse']];
const header=lines=>['// ==UserScript==',...lines.map(line=>'// '+line),
  '// ==/UserScript==','async function main(){return true;}'].join('\n');
const compile=(sourceUtf8,options={})=>compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
  builtinSource:fakeBuiltinSource,...options});
const rejects=code=>error=>error.code===code;

for(const [name,id] of libraries){
  test('complete UserScript metadata admits and compiles the single packaged '+name+' declaration',async()=>{
    const source=header(['@opendesk-lib '+name]),parsed=parseUserScriptDependencies(source);
    for(const phase of ['preview','registration'])
      assert.equal(assertUserScriptExecutable(parsed,{phase,dependenciesLocked:true}).status,'executable');
    assert.equal(pageSelectedPackagedLibrary(source),name);
    assert.equal(pageSelectedPackagedLibrary('// @opendesk-lib '+name+'\nasync function main(){}'),name);
    const code='/* fixed optional resource '+id+' */',library=BUILTIN_RUNTIME_CATALOG.libraries[id];
    const optionalSource={id,version:library.version,abi:BUILTIN_ABI,code,bytes:Buffer.byteLength(code),
      sha256:createHash('sha256').update(code).digest('hex'),catalogSha256:fakeBuiltinSource.catalogSha256};
    const result=await compile(source,{optionalSource});
    assert.equal(result.packagedOptionalId,id);
    assert.equal(result.packagedOptionalSha256,optionalSource.sha256);
    assert(result.js[0].code.includes(code));
  });
}

test('metadata admission and compilation reject unknown and remote-mixed declarations',async()=>{
  for(const [lines,code] of [
    [['@opendesk-lib unreviewed'],'E_BUILTIN_DECLARATION'],
    [['@opendesk-lib cheerio','@require https://cdn.example/library.js'],'E_BUILTIN_CONFLICT']
  ]){
    const source=header(lines),parsed=parseUserScriptDependencies(source);
    for(const phase of ['preview','registration'])
      assert.throws(()=>assertUserScriptExecutable(parsed,{phase,dependenciesLocked:true}),rejects(code));
    await assert.rejects(()=>compile(source),rejects(code));
  }
});

test('metadata preserves the current multi-library and deduplication contract',async()=>{
  const source=header(['@opendesk-lib fingerprintjs','@opendesk-lib js-cookie','@opendesk-lib fingerprintjs']);
  const parsed=parseUserScriptDependencies(source);
  for(const phase of ['preview','registration'])
    assert.equal(assertUserScriptExecutable(parsed,{phase,dependenciesLocked:true}).status,'executable');
  assert.deepEqual([...pageSelectedPackagedLibraries(source)],['fingerprintjs','js-cookie']);
  const optionalSources=['fingerprintjs','jsCookie'].map(id=>{
    const code='/* fixed optional resource '+id+' */',library=BUILTIN_RUNTIME_CATALOG.libraries[id];
    return {id,version:library.version,abi:BUILTIN_ABI,code,bytes:Buffer.byteLength(code),
      sha256:createHash('sha256').update(code).digest('hex'),catalogSha256:fakeBuiltinSource.catalogSha256};
  });
  const result=await compile(source,{optionalSources});
  assert.deepEqual(result.packagedOptionals.map(row=>row.id),['fingerprintjs','jsCookie']);
  for(const resource of optionalSources)
    assert.equal(result.js[0].code.split(resource.code).length-1,1);
});

test('React and Vue remain conflicting in admission and compilation',async()=>{
  const source=header(['@opendesk-lib react','@opendesk-lib vue']),parsed=parseUserScriptDependencies(source);
  for(const phase of ['preview','registration'])
    assert.throws(()=>assertUserScriptExecutable(parsed,{phase,dependenciesLocked:true}),rejects('E_BUILTIN_DECLARATION'));
  await assert.rejects(()=>compile(source),rejects('E_BUILTIN_DECLARATION'));
});

test('an undeclared optional resource remains unavailable to the Page compiler',async()=>{
  await assert.rejects(()=>compile(header([]),{optionalSource:{id:'fingerprintjs'}}),
    rejects('E_BUILTIN_VERSION_UNAVAILABLE'));
});
