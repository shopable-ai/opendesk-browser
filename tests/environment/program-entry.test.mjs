import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';

async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'opendesk-entry-alias-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'src'));
  const pkg=JSON.parse(await readFile('examples/programs/page-heading/package.json','utf8'));
  pkg.name='entry-alias-fixture';pkg.opendesk.id='test.entry-alias';
  await writeFile(join(root,'package.json'),JSON.stringify(pkg));
  const put=(file,source)=>writeFile(join(root,'src',file),source);
  return {root,put};
}

test('equivalent static function defaults include declarations, local aliases and local re-exports',async t=>{
  const {root,put}=await fixture(t);
  const cases=[
    ["export default async function main(){return 42;}","export const x=0;"],
    ["async function main(){return 42;}\nexport default main;","export const x=0;"],
    ["const main=async()=>42;\nexport default main;","export const x=0;"],
    ["function main(){return 42;}\nexport {main as default};","export const x=0;"],
    ["export {default} from './task.js';","export default async function task(){return 42;}"],
    ["export {run as default} from './task.js';","export const run=()=>42;"],
    ["import {run} from './task.js';\nexport default run;","export function run(){return 42;}"]
  ];
  for(const [entry,task] of cases){
    await put('main.js',entry);await put('task.js',task);
    const result=await validateProgramProject(root);
    assert.equal(result.entry,'src/main.js');
  }
  for(const [entry,task] of cases.slice(1,6)){
    await put('main.js',entry);await put('task.js',task);
    const compiled=await buildProgramProjectInMemory(root);
    const outcome=await vm.runInNewContext(compiled.sourceUtf8+'\nmain()', {document:{}});
    assert.equal(outcome,42);
  }
});

test('entry inspection never executes authoring code and rejects unknown or mutable defaults',async t=>{
  const {root,put}=await fixture(t);
  await put('task.js','throw new Error("must not execute during validation");\nexport function run(){return 42;}');
  await put('main.js',"export {run as default} from './task.js';");
  assert.equal((await validateProgramProject(root)).entry,'src/main.js');
  for(const code of ['export default 42;','const main = 42; export default main;',
    'let main = () => 1; export {main as default};',
    'const main = load(); export default main;',
    'export const run = () => 1;']){
    await put('main.js',code);
    await assert.rejects(validateProgramProject(root),{code:'E_PROJECT_ENTRY'});
  }
});

test('cyclic and ambiguous re-exports give distinct entry diagnostics with relative dependency chain',async t=>{
  const {root,put}=await fixture(t);
  await put('main.js',"export {default} from './task.js';");
  await put('task.js',"export {default} from './main.js';");
  await assert.rejects(validateProgramProject(root),error=>{
    assert.equal(error.code,'E_PROJECT_ENTRY_CYCLE');
    assert.ok(error.importChain.some(x=>x.includes('task.js')));
    assert.ok(error.importChain.every(x=>!x.startsWith(root)));
    return true;
  });
  await put('main.js',"export {run as default} from './task.js';");
  await put('task.js',"export * from './a.js';\nexport * from './b.js';");
  await put('a.js','export function run(){}');
  await put('b.js','export function run(){}');
  await assert.rejects(validateProgramProject(root),{code:'E_PROJECT_ENTRY_AMBIGUOUS'});
});
