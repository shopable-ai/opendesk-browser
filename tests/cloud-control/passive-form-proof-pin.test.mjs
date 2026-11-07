import assert from 'node:assert/strict';
import test,{mock} from 'node:test';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createTaskPackage} from '../../src/platform/tasks/contract.js';

// Exercise the actual service handler and session persistence without binding
// any socket or starting an observation service alongside the parent's work.
const handlers=[];
mock.module('node:http',{exports:{createServer:handler=>{
  handlers.push(handler);
  return Object.assign(new EventEmitter(),{
    listen(_port,_host,ready){ready();},
    address(){return {port:43111};},
    close(done){done();},
  });
}}});
const {startPassiveFormProof}=await import('./passive-form-proof.mjs');
const oldFile=new URL('../../examples/tasks/form-fill.v1.opendesk-task.json',import.meta.url);
const newFile=new URL('../../examples/cloud-control/mac24dev-demo/form-fill.v1.0.1.opendesk-task.json',import.meta.url);
const oldBytes=await readFile(oldFile,'utf8'),newBytes=await readFile(newFile,'utf8');
const pin=bytes=>{
  const pkg=JSON.parse(bytes);
  return {taskId:pkg.manifest.taskId,version:pkg.manifest.version,
    manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash};
};
async function query(handler){
  const req=Readable.from([Buffer.from(JSON.stringify({name:'Alice'}))]);
  Object.assign(req,{method:'POST',url:'/__opendesk_cloud_proof/query',
    headers:{host:'127.0.0.1:43111',origin:'http://127.0.0.1:43111'}});
  return new Promise((resolve,reject)=>handler(req,{
    writeHead(status){assert.equal(status,200);},
    end(body){try{resolve(JSON.parse(body));}catch(error){reject(error);}},
    destroy:reject,
  }));
}
async function temporary(t){
  const directory=await mkdtemp(path.join(tmpdir(),'od-passive-pin-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));return directory;
}

test('new sessions bind the selected exact package once; old session files and queries keep their pin',async t=>{
  const root=await temporary(t),oldDirectory=path.join(root,'old'),newDirectory=path.join(root,'new');
  const oldSession=await startPassiveFormProof({directory:oldDirectory});
  t.after(()=>oldSession.close());const oldHandler=handlers.at(-1);
  const savedOld=await readFile(path.join(oldDirectory,'session.json'),'utf8');
  assert.deepEqual(JSON.parse(savedOld).task,pin(oldBytes));
  const selected=path.join(root,'selected.json');await writeFile(selected,newBytes);
  const newSession=await startPassiveFormProof({directory:newDirectory,taskPackage:selected});
  t.after(()=>newSession.close());const newHandler=handlers.at(-1);
  const savedNew=await readFile(path.join(newDirectory,'session.json'),'utf8');
  assert.deepEqual(JSON.parse(savedNew).task,pin(newBytes));
  assert.notEqual(newSession.sessionId,oldSession.sessionId);
  // A later file/config selection must not retroactively change either session.
  await writeFile(selected,oldBytes);
  for(const [handler,session,expected] of [[oldHandler,oldSession,pin(oldBytes)],[newHandler,newSession,pin(newBytes)]]){
    const result=await query(handler);
    assert.equal(result.sessionId,session.sessionId);assert.deepEqual(result.task,expected);
    assert.equal(result.proofLevel,'PASSIVE_ONLY');assert.equal(result.nativeIdentity,'NOT_OBSERVED');
    assert.deepEqual(result.documents,[]);
  }
  await assert.rejects(startPassiveFormProof({directory:oldDirectory,taskPackage:newFile}),{code:'EEXIST'});
  assert.equal(await readFile(path.join(oldDirectory,'session.json'),'utf8'),savedOld);
  assert.equal(await readFile(path.join(newDirectory,'session.json'),'utf8'),savedNew);
});

test('unknown or rehashed packages are rejected before creating evidence or an HTTP handler',async t=>{
  const root=await temporary(t),pkg=JSON.parse(newBytes),initialHandlers=handlers.length;
  const changedSource=pkg.sourceUtf8+'\n// changed\n';
  const candidates=[
    {...pkg,manifestHash:'a'.repeat(64)},
    await createTaskPackage({...pkg.manifest,version:'1.0.2'},pkg.sourceUtf8),
    await createTaskPackage({...pkg.manifest,program:{...pkg.manifest.program,
      sourceHash:createHash('sha256').update(changedSource).digest('hex')}},changedSource),
  ];
  for(const [index,candidate] of candidates.entries()){
    const file=path.join(root,index+'.json'),directory=path.join(root,'session-'+index);
    await writeFile(file,JSON.stringify(candidate));
    await assert.rejects(startPassiveFormProof({directory,taskPackage:file}));
    await assert.rejects(stat(directory),{code:'ENOENT'});
  }
  assert.equal(handlers.length,initialHandlers);
  assert.equal(await readFile(oldFile,'utf8'),oldBytes);
  assert.equal(await readFile(newFile,'utf8'),newBytes);
});
