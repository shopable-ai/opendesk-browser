import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CONTROLLER_SOURCE_LIMIT,CONTROLLER_AUTHORING_LIMIT,TASK_PACKAGE_LIMIT,CONTROLLER_DRAFT_LIMIT} from '../../src/platform/source-budgets.js';
import {BUDGETS,digestUtf8} from '../../src/platform/protocol.js';
import {createTaskPackage,verifyTaskPackage} from '../../src/platform/tasks/contract.js';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {buildProgramProject} from '../../scripts/build-program-project.mjs';
import {validateProgramDraft} from '../../src/ui/program-source.js';
import {parseControllerClassicDependencies} from '../../src/scripting/user-scripts/controller-classic.js';
const sourceOf = size => 'async function main(){return 1;}/*'+'x'.repeat(size-36)+'*/';
async function task(source) {
  return createTaskPackage({format:'opendesk.task.v1',taskId:'source.budget',version:'1.0.0',title:'Budget',description:'Bounded source',author:'Test',source:'local-test',
    siteOrigins:['https://example.com'],permissions:['page.automation'],entryFormat:'async-main',program:{revision:1,sourceHash:await digestUtf8(source)},
    paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false}},source);
}
async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'controller-source-budget-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const pkg=JSON.parse(await readFile('examples/programs/local-controller/package.json','utf8'));
  await mkdir(join(root,'src'));await writeFile(join(root,'package.json'),JSON.stringify(pkg));
  return {root,pkg,file:join(root,'src/main.js')};
}
test('source-only limits admit small and 1.137 MB complete source without enlarging data frames',async()=>{
  assert.equal(CONTROLLER_SOURCE_LIMIT,2*1024*1024);assert.equal(BUDGETS.maxRawFrameBytes,131072);
  for(const size of [128,1137000,CONTROLLER_SOURCE_LIMIT]){
    const source=sourceOf(size);assert.equal(Buffer.byteLength(source),size);
    assert.deepEqual(parseControllerClassicDependencies(source),[]);
    assert.equal((await verifyTaskPackage(await task(source))).sourceUtf8,source);
  }
});
test('Task source and serialized UTF-8 envelope enforce independent finite ceilings',async()=>{
  await assert.rejects(task(sourceOf(CONTROLLER_SOURCE_LIMIT+1)),{code:'E_LIMIT'});
  assert.throws(()=>parseControllerClassicDependencies(sourceOf(CONTROLLER_SOURCE_LIMIT+1)),{code:'E_CONTROLLER_CLASSIC_SOURCE'});
  const escaped='async function main(){}/*'+'\u0001'.repeat(800000)+'*/';
  assert.ok(Buffer.byteLength(escaped)<CONTROLLER_SOURCE_LIMIT);
  await assert.rejects(task(escaped),{code:'E_LIMIT'});
  const unicode='async function main(){}/*'+'中'.repeat(720000)+'*/';
  assert.ok(unicode.length<CONTROLLER_SOURCE_LIMIT);await assert.rejects(task(unicode),{code:'E_LIMIT'});
  assert.equal(TASK_PACKAGE_LIMIT,4*1024*1024);assert.equal(CONTROLLER_DRAFT_LIMIT,12*1024*1024);
});
test('larger source does not relax source hash, closed permission schema or immutable identity',async()=>{
  const pkg=await task(sourceOf(1137000));
  await assert.rejects(verifyTaskPackage({...pkg,sourceUtf8:pkg.sourceUtf8+' '}),{code:'E_HASH'});
  await assert.rejects(verifyTaskPackage({...pkg,manifest:{...pkg.manifest,permissions:['page.automation','tabs']}}),{code:'E_PERMISSION'});
  await assert.rejects(verifyTaskPackage({...pkg,tabId:1}),{code:'E_SCHEMA'});
});
test('Controller 1.137 MB project survives original build, draft import and Task package creation',async t=>{
  const {root,file}=await fixture(t);
  const esm="export default async function main(){return '"+'x'.repeat(1137000)+"';}";
  await writeFile(file,esm);
  const checked=await validateProgramProject(root);assert.equal(checked.sources[0].bytes,Buffer.byteLength(esm));
  const out=join(root,'output');await buildProgramProject(root,{outputDirectory:out});
  const source=await readFile(join(out,'program.js'),'utf8');assert.ok(Buffer.byteLength(source)>1000000);
  const draft=JSON.parse(await readFile(join(out,'program.opendesk-draft.json'),'utf8'));
  assert.equal((await validateProgramDraft(draft)).sourceUtf8,source);
  assert.equal((await verifyTaskPackage(await task(source))).sourceUtf8,source);
  const overflow=structuredClone(draft);overflow.authoring.files[0].sourceUtf8=sourceOf(CONTROLLER_SOURCE_LIMIT+1);
  await assert.rejects(validateProgramDraft(overflow),{code:'E_LIMIT'});
});
test('project source file and authoring graph overflow reject before compilation; Page budget stays unchanged',async t=>{
  const {root,pkg,file}=await fixture(t);
  await writeFile(file,'/*'+'x'.repeat(CONTROLLER_SOURCE_LIMIT)+'*/export default async function main(){}');
  await assert.rejects(validateProgramProject(root),{code:'E_PROJECT_LIMIT'});
  const extra="/*"+'x'.repeat(1500000)+"*/export const value=1;";
  for(let i=0;i<3;i++)await writeFile(join(root,'src','module'+i+'.js'),extra);
  await writeFile(file,"import './module0.js';import './module1.js';import './module2.js';export default async function main(){}");
  assert.ok(3*Buffer.byteLength(extra)>CONTROLLER_AUTHORING_LIMIT);
  await assert.rejects(validateProgramProject(root),{code:'E_PROJECT_LIMIT'});
  const page=JSON.parse(await readFile('examples/programs/page-heading/package.json','utf8'));
  await writeFile(join(root,'package.json'),JSON.stringify(page));
  await writeFile(file,'/*'+'x'.repeat(140000)+'*/export default async function main(){}');
  await assert.rejects(validateProgramProject(root),{code:'E_PROJECT_LIMIT'});
});
test('large source revision storage keeps UTF-8, hash, CAS, namespace and revocation checks',async()=>{
  const {createStorageMethods}=await import('../../src/platform/storage/repository.js');
  let rows=new Map();
  const database={async transaction(names,mode,body){
    const copy=structuredClone(rows),store=name=>{assert.ok(names.includes(name));if(!copy.has(name))copy.set(name,new Map());return copy.get(name);};
    const tx={get:async(n,k)=>structuredClone(store(n).get(k)),put:async(n,v,k)=>store(n).set(k,structuredClone(v))};
    const result=await body(tx);if(mode==='readwrite')rows=copy;return result;
  }};
  const storage=createStorageMethods(database,{clock:{now:()=>1000}});
  const context={namespace:'budget-source',principal:'test',grantIncarnation:'grant',runId:'run',opId:'op',requestId:'request',resultId:'result',browserSessionIncarnation:'browser',opKey:'op-key',deadlineAt:2000,authorize:async()=>true,authorizeInTransaction:async()=>true};
  const source=sourceOf(1137000),input={scriptId:'budget',expectedRevision:0,sourceUtf8:source};
  const saved=await storage.commitScriptRevision(context,input);assert.equal(saved.sourceUtf8,source);assert.equal(saved.revision,1);
  await assert.rejects(storage.commitScriptRevision(context,input),{code:'E_REVISION'});
  await assert.rejects(storage.commitScriptRevision(context,{...input,expectedRevision:1,contentHash:'0'.repeat(64)}),{code:'E_HASH'});
  await assert.rejects(storage.commitScriptRevision(context,{...input,sourceUtf8:sourceOf(CONTROLLER_SOURCE_LIMIT+1)}),{code:'E_SCHEMA'});
  await assert.rejects(storage.commitScriptRevision(context,{...input,sourceUtf8:'\ud800'}),{code:'E_VALUE_SERIALIZATION'});
  await assert.rejects(storage.commitScriptRevision({...context,authorizeInTransaction:async()=>false},{...input,expectedRevision:1}),{code:'E_OWNER'});
  assert.equal((await storage.commitScriptRevision({...context,namespace:'other-source'},input)).revision,1);
});
