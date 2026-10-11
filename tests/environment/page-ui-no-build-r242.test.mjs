import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
import {loadPackagedPageFramework} from '../../src/libs/page-frameworks/loader.js';
import {PAGE_FRAMEWORK_RUNTIMES,PAGE_FRAMEWORK_RESOURCE_LIMIT} from '../../src/libs/page-frameworks/contract.js';
import {compileLockedPageSource,pageSelectedPackagedLibrary} from '../../src/scripting/user-scripts/execution-source.js';
globalThis.crypto ||= webcrypto;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('R24.2 fixed opt-in React and Vue runtime sources are pinned and self-contained',async()=>{
  for(const row of Object.values(PAGE_FRAMEWORK_RUNTIMES)){
    const bytes=await readFile(row.source);
    assert.equal(bytes.length,row.bytes);
    assert.equal(sha(bytes),row.sha256);
    assert.ok(bytes.length<=PAGE_FRAMEWORK_RESOURCE_LIMIT);
    const text=bytes.toString('utf8');
    assert.ok(text.startsWith('(function(){'));
    assert.match(text,new RegExp('OpenDeskPage'+row.id[0].toUpperCase()+row.id.slice(1)));
    assert.doesNotMatch(text,/\beval\s*\(|\bnew\s+Function\s*\(|\bimport\s*\(/);
    assert.ok((await readFile(row.licenseSource,'utf8')).includes('Permission is hereby granted'));
  }
});

test('R24.2 trusted package loader rejects byte, URL and identity drift',async()=>{
  for(const row of Object.values(PAGE_FRAMEWORK_RUNTIMES)){
    const code=await readFile(row.source,'utf8'),url='chrome-extension://test/'+row.output;
    const runtime={id:'test',getURL:p=>'chrome-extension://test/'+p};
    const fetchImpl=async input=>({ok:true,redirected:false,url:input,text:async()=>code});
    const a=await loadPackagedPageFramework(row.id,{runtime,fetchImpl});
    assert.equal(a.version,row.version);assert.equal(a.sha256,row.sha256);assert.equal(a.code,code);
    await assert.rejects(loadPackagedPageFramework(row.id,{runtime,fetchImpl:async()=>({
      ok:true,url,redirected:false,text:async()=>code+'changed'
    })}),{code:'E_DEPENDENCY_HASH'});
    await assert.rejects(loadPackagedPageFramework(row.id,{runtime,fetchImpl:async()=>({
      ok:true,url:'https://evil.example/runtime.js',text:async()=>code
    })}),{code:'E_RESOURCE_UNAVAILABLE'});
  }
  await assert.rejects(loadPackagedPageFramework('unknown'),{code:'E_PAGE_FRAMEWORK_UNKNOWN'});
});

test('R24.2 no-build JSX-free Page projects auto build with the original resolver and preserve URL rules',async()=>{
  for(const id of ['react','vue']){
    const directory='examples/programs/page-ui-'+id+'-direct';
    const validated=await validateProgramProject(directory);
    assert.equal(validated.runtimeKind,'page-userscript');
    assert.deepEqual(validated.npmDependencies,[]);
    const input=await buildProgramProjectInMemory(directory,{mode:'production'});
    assert.ok(input.sourceBytes<100000,'Only user source is under the Page budget');
    assert.match(input.sourceUtf8,new RegExp('// @opendesk-lib '+id));
    assert.equal(pageSelectedPackagedLibrary(input.sourceUtf8),id);
    assert.match(input.sourceUtf8,/async function main\(\)/);
    const row=PAGE_FRAMEWORK_RUNTIMES[id],frameworkSource={
      id:row.id,version:row.version,sha256:row.sha256,code:await readFile(row.source,'utf8')
    };
    const compiled=await compileLockedPageSource({sourceUtf8:input.sourceUtf8,
      entryFormat:'async-main',entries:[],frameworkSource});
    assert.equal(compiled.packagedFrameworkId,id);
    assert.equal(compiled.packagedFrameworkSha256,row.sha256);
    assert.equal(compiled.world,'USER_SCRIPT');
    assert.equal(compiled.js.length,1);
    assert.ok(compiled.js[0].code.includes(row.global));
    await assert.rejects(compileLockedPageSource({sourceUtf8:input.sourceUtf8,
      entryFormat:'async-main',entries:[]}),{code:'E_PAGE_FRAMEWORK_IDENTITY'});
    await assert.rejects(compileLockedPageSource({sourceUtf8:input.sourceUtf8,
      entryFormat:'async-main',entries:[],frameworkSource:{...frameworkSource,sha256:'0'.repeat(64)}}),
      {code:'E_PAGE_FRAMEWORK_IDENTITY'});
  }
});

test('R24.2 framework opt-in rejects unsupported directives and multiple dependencies',()=>{
  for(const value of ['react','vue','jquery'])
    assert.equal(pageSelectedPackagedLibrary('// @opendesk-lib '+value+'\nasync function main(){}'),value);
  assert.throws(()=>pageSelectedPackagedLibrary('// @opendesk-lib react\n// @opendesk-lib vue\nasync function main(){}'),
    {code:'E_BUILTIN_DECLARATION'});
  assert.throws(()=>pageSelectedPackagedLibrary('// @opendesk-lib angular\nasync function main(){}'),
    {code:'E_BUILTIN_DECLARATION'});
});
