// R16.6 multi-bundle compilation checks (L2; never a native receipt).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {BUILTIN_ABI,BUILTIN_RUNTIME_CATALOG as catalog} from '../../src/libs/runtime-contract.js';
import {PAGE_FRAMEWORK_RUNTIMES} from '../../src/libs/page-frameworks/contract.js';
import {pageSelectedPackagedLibraries,compileLockedPageSource,PAGE_COMPILED_SOURCE_LIMIT}
  from '../../src/scripting/user-scripts/execution-source.js';
import {fakeBuiltinSource} from './builtin-support.mjs';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
globalThis.crypto ||= webcrypto;
const sha=s=>createHash('sha256').update(s).digest('hex');
const source='// @opendesk-lib axios\n// @opendesk-lib query-string\nasync function main(){return axios(queryString.parse("id=42").id)}';
const axCode='Object.defineProperty(globalThis,"axios",{value:Object.assign(id=>Number(id),{create(){},interceptors:{request:{use(){}}}})});';
const qsCode='Object.defineProperty(globalThis,"queryString",{value:{parse:raw=>({id:raw.split("=")[1]}),stringify(){}}});';
const asset=(id,code)=>({id,version:catalog.libraries[id].version,abi:BUILTIN_ABI,code,bytes:Buffer.byteLength(code),
  sha256:sha(code),catalogSha256:fakeBuiltinSource.catalogSha256});

test('declarations preserve order, deduplicate, block unsafe conflicts and ignore late comments',()=>{
  const selected=pageSelectedPackagedLibraries('// @opendesk-lib react\n// @opendesk-lib axios\n// @opendesk-lib axios\n// @opendesk-lib query-string\nasync function main(){}');
  assert.deepEqual([...selected],['react','axios','query-string']);
  assert(Object.isFrozen(selected));
  assert.deepEqual([...pageSelectedPackagedLibraries('// ==UserScript==\n// @opendesk-lib axios\n// @opendesk-lib query-string\n// ==/UserScript==\nasync function main(){}')],['axios','query-string']);
  assert.deepEqual([...pageSelectedPackagedLibraries('const text="// @opendesk-lib axios";\n// @opendesk-lib jquery')],[]);
  assert.throws(()=>pageSelectedPackagedLibraries('// @opendesk-lib react\n// @opendesk-lib vue\nasync function main(){}'),e=>e.code==='E_BUILTIN_CONFLICT');
  assert.throws(()=>pageSelectedPackagedLibraries('// @opendesk-lib unknown\nasync function main(){}'),e=>e.code==='E_BUILTIN_DECLARATION');
  assert.throws(()=>pageSelectedPackagedLibraries('// ==UserScript==\n// @require https://example.com/a.js\n// @opendesk-lib axios\n// ==/UserScript==\nasync function main(){}'),e=>e.code==='E_BUILTIN_CONFLICT');
  assert.throws(()=>pageSelectedPackagedLibraries(Array.from({length:7},()=> '// @opendesk-lib axios').join('\n')+'\nasync function main(){}'),e=>e.code==='E_BUILTIN_DECLARATION');
});

test('two SHA-verified bundles run in order with zero-argument main()',async()=>{
  const ax=asset('axios',axCode),qs=asset('queryString',qsCode);
  const compiled=await compileLockedPageSource({sourceUtf8:source,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSources:[ax,qs]});
  assert.equal(compiled.js.length,1);
  assert.deepEqual([...compiled.packagedOptionals],[{id:'axios',sha256:ax.sha256},{id:'queryString',sha256:qs.sha256}]);
  assert(compiled.js[0].code.indexOf(axCode)<compiled.js[0].code.indexOf(qsCode));
  assert.equal(await vm.runInNewContext(compiled.js[0].code,{}),42);
  await assert.rejects(()=>compileLockedPageSource({sourceUtf8:source,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSources:[qs,ax]}),e=>e.code==='E_BUILTIN_VERSION_UNAVAILABLE');
  await assert.rejects(()=>compileLockedPageSource({sourceUtf8:source,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSources:[ax,{...qs,code:qs.code+'//tampered'}]}),e=>e.code==='E_DEPENDENCY_HASH');
  await assert.rejects(()=>compileLockedPageSource({sourceUtf8:source,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSources:[ax]}),e=>e.code==='E_BUILTIN_VERSION_UNAVAILABLE');
});

test('React+Axios+query-string link real pinned React/ReactDOM exactly once',async()=>{
  const framework=PAGE_FRAMEWORK_RUNTIMES.react,code=await readFile(framework.source,'utf8');
  const compiled=await compileLockedPageSource({sourceUtf8:'// @opendesk-lib react\n'+source,
    entryFormat:'async-main',builtinSource:fakeBuiltinSource,
    optionalSources:[asset('axios',axCode),asset('queryString',qsCode)],
    frameworkSource:{id:'react',version:framework.version,sha256:framework.sha256,code}});
  assert.equal(compiled.packagedFrameworkId,'react');
  assert.deepEqual(compiled.packagedOptionals.map(item=>item.id),['axios','queryString']);
  assert.equal(compiled.js.length,1);
  assert.equal(compiled.js[0].code.split(code).length,2,'React/ReactDOM must occur only once');
  assert(compiled.js[0].code.indexOf(code)<compiled.js[0].code.indexOf(axCode));
  assert(Buffer.byteLength(compiled.js[0].code)<=PAGE_COMPILED_SOURCE_LIMIT);
});

// Project JSON is the author's long-lived declaration; the Webpack output
// must preserve it as executable Page metadata without user-added @require.
test('multi-file managed React demo emits framework plus optional library IDs',async()=>{
  const root='examples/programs/page-ui-react-axios-query';
  const checked=await validateProgramProject(root);
  assert.equal(checked.framework,'react');
  assert.deepEqual(checked.libraries,['axios','query-string']);
  const built=await buildProgramProjectInMemory(root,{mode:'production'});
  assert.deepEqual([...pageSelectedPackagedLibraries(built.sourceUtf8)],['react','axios','query-string']);
  assert(built.sourceUtf8.includes('createRoot'));
  assert(built.sourceUtf8.includes('queryString.parse'));
  assert(built.sourceUtf8.includes('axios.get'));
  assert(built.sourceBytes<128*1024);
});
