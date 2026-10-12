// R16.4: prove the public no-argument main() authoring contract using real
// ESM Webpack compilation and the existing Controller/Page compilers.
// Node VM component evidence (L2) must NOT be reported as Mac Chrome native.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
import {controllerProgramBody} from '../../src/scripting/sandbox/worker-runtime.js';
import {compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';
import {registerLodash} from '../../src/libs/packages/lodash.js';
import {registerDayjs} from '../../src/libs/packages/dayjs.js';
import {installBuiltinLibraries} from '../../src/libs/core.js';
import {BUILTIN_ABI} from '../../src/libs/runtime-contract.js';

async function withRealBuiltins(scope) {
  const bootstrap=await readFile('src/libs/runtime/bootstrap.js','utf8');
  const myUtils=await readFile('src/libs/vendor/my-utils/1.0.0/index.js','utf8');
  vm.runInContext(bootstrap,scope);
  registerLodash(scope);
  registerDayjs(scope);
  vm.runInContext(myUtils,scope);
  return installBuiltinLibraries(scope);
}

test('zero-argument Controller ESM captures trusted page and real preinstalled _/dayjs without main({page})', async()=>{
  const path='examples/programs/controller-globals-zero-arg';
  const authoring=await readFile(path+'/src/main.js','utf8');
  assert.match(authoring,/export default async function main\(\)/);
  assert.doesNotMatch(authoring,/main\(\{page|main\(page|import\s+.*\b(?:lodash|dayjs)\b/);
  const built=await buildProgramProjectInMemory(path);
  assert.equal(built.project.runtimeKind,'controller');
  assert.equal(built.project.sourceFormat,'esm');
  const scope=vm.createContext({});
  await withRealBuiltins(scope);
  const InternalAsyncFunction=vm.runInContext('Object.getPrototypeOf(async function(){}).constructor',scope);
  const callback=new InternalAsyncFunction('page','params','axiosx','AppStorage','AppLocal','storage',controllerProgramBody(built.sourceUtf8));
  const page=Object.freeze({title:async()=> 'OpenDesk Browser Test Lab',url:async()=> 'http://127.0.0.1:43111/demo-form.html'});
  const output=await callback(page,{},undefined,undefined,undefined,undefined);
  const value=JSON.parse(JSON.stringify(output));
  assert.equal(value.title,'OpenDesk Browser Test Lab');
  assert.equal(value.url,'http://127.0.0.1:43111/demo-form.html');
  assert.deepEqual(value.words,['OpenDesk','Browser','Test','Lab']);
  assert.match(value.date,/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(vm.runInContext('typeof document',scope),'undefined');
  assert.equal(vm.runInContext('OpenDeskLibs.abi',scope),BUILTIN_ABI);
  assert.equal(vm.runInContext('typeof globalThis.page',scope),'undefined','page is Worker lexical binding, not globalThis');
});

test('zero-argument Page ESM uses document and the same REAL approved builtin facades, not Controller page',async()=>{
  const path='examples/programs/page-globals-zero-arg';
  const authoring=await readFile(path+'/src/main.js','utf8');
  assert.match(authoring,/export default async function main\(\)/);
  assert.doesNotMatch(authoring,/main\(\{|\bpage\.title\(/);
  const built=await buildProgramProjectInMemory(path);
  assert.equal(built.project.runtimeKind,'page-userscript');
  const compiled=await compileLockedPageSource({sourceUtf8:built.sourceUtf8,entryFormat:'async-main',entries:[]});
  assert.equal(compiled.world,'USER_SCRIPT');
  const scope=vm.createContext({document:{
    title:'OpenDesk Browser Test Lab',
    querySelector:selector=>selector==='h1'?{textContent:'  Heading One  '}:null
  }});
  await withRealBuiltins(scope);
  const output=await vm.runInContext(compiled.js[0].code,scope);
  const value=JSON.parse(JSON.stringify(output));
  assert.equal(value.title,'OpenDesk Browser Test Lab');
  assert.equal(value.heading,'Heading One');
  assert.deepEqual(value.words,['OpenDesk','Browser','Test','Lab']);
  assert.match(value.date,/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(vm.runInContext('typeof page',scope),'undefined');
  assert.equal(vm.runInContext('typeof axiosx',scope),'undefined');
  assert.equal(vm.runInContext('typeof params',scope),'undefined');
});

test('canonical docs explicitly distinguish lexical Controller context from other worlds and single-file syntax',async()=>{
  const [guide,controller]=await Promise.all([
    readFile('docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md','utf8'),
    readFile('docs/api/controller.zh-CN.md','utf8')
  ]);
  for(const word of ['export default async function main()','async function main()','USER_SCRIPT','Side Panel','Background','globalThis.page','OpenDeskLibs','NATIVE_UNVERIFIED'])
    assert(guide.includes(word),'canonical guide missing '+word);
  assert(controller.includes('export default async function main()'));
  assert(controller.includes('runtime-globals-and-preinstalled-libraries.zh-CN.md'));
});
