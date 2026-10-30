import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {buildProgramProject} from '../../scripts/build-program-project.mjs';
import {verifyTaskPackage} from '../../src/platform/tasks/contract.js';

test('Task project validates closed permissions/deadline and builds the same reviewed manifest',async t=>{
  const root=await mkdtemp(join(tmpdir(),'opendesk-task-storage-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'src'));
  await writeFile(join(root,'src/main.js'),'export default async function main(){await AppStorage.setItem("journal","saved");return await page.title();}');
  const pkg={name:'task-storage-fixture',version:'1.0.0',private:true,type:'module',description:'Task storage fixture',
    opendesk:{format:'opendesk.project.v1',id:'task.storage-fixture',runtimeKind:'controller',sourceFormat:'esm',
      entry:'src/main.js',siteOrigins:['https://example.test'],permissions:['page.automation','storage.persistent'],
      deadlineMs:120000,paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false}}};
  const save=()=>writeFile(join(root,'package.json'),JSON.stringify(pkg));
  await save();await validateProgramProject(root);
  const out=join(root,'out'),built=await buildProgramProject(root,{outputDirectory:out});
  assert.deepEqual(built.permissions,pkg.opendesk.permissions);assert.equal(built.deadlineMs,120000);
  const candidate=await verifyTaskPackage(JSON.parse(await readFile(join(out,'program.opendesk-task.json'),'utf8')));
  assert.deepEqual(candidate.manifest.permissions,pkg.opendesk.permissions);assert.equal(candidate.manifest.deadlineMs,120000);
  for(const deadlineMs of [999,120001,1.5,null,'120000']){
    pkg.opendesk.deadlineMs=deadlineMs;await save();
    await assert.rejects(validateProgramProject(root),{code:'E_PROJECT_SCHEMA'});
  }
  delete pkg.opendesk.deadlineMs;
  for(const permissions of [['page.automation','network'],['page.automation','storage.persistent','network'],
    ['page.automation','network','storage.persistent']]){
    pkg.opendesk.permissions=permissions;await save();await validateProgramProject(root);
    const networkOut=join(root,'out-'+permissions.join('-'));
    const networkBuilt=await buildProgramProject(root,{outputDirectory:networkOut});
    assert.deepEqual(networkBuilt.permissions,permissions);
    const networkCandidate=await verifyTaskPackage(JSON.parse(await readFile(join(networkOut,'program.opendesk-task.json'),'utf8')));
    assert.deepEqual(networkCandidate.manifest.permissions,permissions);
  }
  for(const permissions of [['network','page.automation'],['storage.persistent'],['page.automation','storage.session'],
    ['page.automation','network','network'],['page.automation','storage.persistent','network','network'],
    ['page.automation','page.automation']]){
    pkg.opendesk.permissions=permissions;await save();
    await assert.rejects(validateProgramProject(root),{code:'E_PROJECT_PERMISSION'});
  }
  pkg.opendesk.permissions=['page.automation'];await save();await validateProgramProject(root);
});

test('Task storage uses namespace plus taskId and rolls back effects when transaction authorization is revoked',async()=>{
  const {createStorageMethods}=await import('../../src/platform/storage/repository.js');
  const {decodeValue}=await import('../../src/platform/page-port/codec.js');
  let rows=new Map(),serial=0;
  const database={async transaction(names,mode,body){
    const copy=structuredClone(rows);
    const store=name=>{assert(names.includes(name));if(!copy.has(name))copy.set(name,new Map());return copy.get(name);};
    const tx={get:async(n,k)=>structuredClone(store(n).get(k)),
      put:async(n,v,k)=>store(n).set(k,structuredClone(v)),delete:async(n,k)=>store(n).delete(k),
      all:async n=>[...store(n).values()].map(v=>structuredClone(v))};
    const result=await body(tx);if(mode==='readwrite')rows=copy;return result;
  }};
  const storage=createStorageMethods(database,{clock:{now:()=>1000}});
  const call=async(namespace,taskId,method,args,{revokeAtCommit=false}={})=>{
    const id=String(++serial),binding={namespace,principal:'test',grantIncarnation:'grant',runId:'run-'+id,
      opId:'op-'+id,requestId:'request-'+id,resultId:'result-'+id,browserSessionIncarnation:'browser'};
    const opKey=binding.opId;
    await database.transaction(['commandJournal'],'readwrite',tx=>tx.put('commandJournal',{
      ...binding,tag:'controller-operation',state:'dispatched',method,requestDigest:id},opKey));
    let checks=0;
    return storage.executeSdk(method,args,{...binding,lifecycle:'controller',taskId,opKey,method,deadlineAt:2000,
      authorize:async()=>true,authorizeInTransaction:async()=>!revokeAtCommit||++checks<2});
  };
  await call('namespace-a','same-task','APPSTORAGE_SETITEM',{key:'journal',value:'a'});
  await call('namespace-b','same-task','APPSTORAGE_SETITEM',{key:'journal',value:'b'});
  await call('namespace-a','other-task','APPSTORAGE_SETITEM',{key:'journal',value:'other'});
  await assert.rejects(call('namespace-a','same-task','APPSTORAGE_SETITEM',{key:'journal',value:'revoked'},
    {revokeAtCommit:true}),{code:'E_OWNER'});
  assert.equal(await call('namespace-a','same-task','APPSTORAGE_GETITEM',{key:'journal'}),'a');
  await call('namespace-a','same-task','APPSTORAGE_CLEAR',{});
  assert.equal(await call('namespace-b','same-task','APPSTORAGE_GETITEM',{key:'journal'}),'b');
  assert.equal(await call('namespace-a','other-task','APPSTORAGE_GETITEM',{key:'journal'}),'other');
  const remaining=await database.transaction(['frameworkKV'],'readonly',tx=>tx.all('frameworkKV'));
  assert.deepEqual(remaining.map(row=>decodeValue(row.valueWire)).sort(),['b','other']);
});
