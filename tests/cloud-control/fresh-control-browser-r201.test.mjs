import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createCloudService} from '../../src/cloud-control/service.js';
import {installedKey,taskScriptId} from '../../src/platform/tasks/contract.js';
import {BUILTIN_ABI} from '../../src/libs/runtime-contract.js';

// Browser service component tests. No network listener, browser or native effects.
const pkg=JSON.parse(await readFile(new URL('../../examples/tasks/form-fill.v1.opendesk-task.json',import.meta.url),'utf8'));
const KV='frameworkKV',CONFIG='cloud:config';
function memoryStorage(){
  let data=new Map(),tail=Promise.resolve();
  return {transaction(names,mode,body){
    const next=tail.then(async()=>{
      const copy=structuredClone(data),store=name=>{assert.ok(names.includes(name));if(!copy.has(name))copy.set(name,new Map());return copy.get(name);};
      const tx={get:async(n,k)=>structuredClone(store(n).get(k)),put:async(n,v,k)=>{store(n).set(k,structuredClone(v));},
        delete:async(n,k)=>store(n).delete(k),all:async n=>[...store(n).values()].map(v=>structuredClone(v))};
      const value=await body(tx);if(mode==='readwrite')data=copy;return value;
    });tail=next.catch(()=>{});return next;
  }};
}
async function fixture({legacy=false}={}){
  const storage=memoryStorage(),namespace='tool:fresh-control-test',runId=randomUUID(),requestId='cloud:'+randomUUID();
  let now=10000,onReply=async()=>{},transportFailure=false;
  const binding={providerId:randomUUID(),executorId:randomUUID(),pairingId:randomUUID(),pairingGeneration:1,
    attemptEpoch:1,claimId:randomUUID(),jobId:randomUUID(),assignmentId:requestId.slice(6)};
  const protocol=legacy?{}:{controlProtocol:2,controlGeneration:randomUUID()};
  const authorization={tag:'task-install-authorization-v1',installationId:randomUUID(),generation:1,
    scope:{capabilities:pkg.manifest.permissions,siteOrigins:pkg.manifest.siteOrigins,networkOrigins:[]}};
  const task={taskId:pkg.manifest.taskId,version:pkg.manifest.version,manifestHash:pkg.manifestHash,
    scriptId:taskScriptId(pkg.manifest.taskId,pkg.manifest.version),contentHash:pkg.manifest.program.sourceHash,
    manifest:pkg.manifest,installationId:authorization.installationId,generation:1};
  const runRef={runId,resultId:randomUUID(),requestId,sourceHash:task.contentHash,manifestHash:task.manifestHash,grantId:randomUUID()};
  const key='cloud:request:'+requestId,installKey=installedKey(namespace,task.taskId);
  const row={tag:'cloud-request-v1',requestId,namespace,task,grantId:runRef.grantId,runId,runRef,state:'prepared',
    identity:{pairing:Object.fromEntries(['providerId','executorId','pairingId','pairingGeneration'].map(k=>[k,binding[k]])),
      ...Object.fromEntries(['jobId','claimId','assignmentId','attemptEpoch'].map(k=>[k,binding[k]]))},
    assignment:{...binding,...protocol,leaseUntil:now+90000}};
  const run={tag:'controller-run',runId,resultId:runRef.resultId,requestId:randomUUID(),cloudRequestId:requestId,cloudRequestKey:key,
    namespace,scriptId:task.scriptId,builtinAbi:BUILTIN_ABI,contentHash:task.contentHash,
    installedTaskAuthorization:{taskId:task.taskId,version:task.version,manifestHash:task.manifestHash,authorization},
    ...(legacy?{}:{cloudControlProtocol:2,cloudControlGeneration:protocol.controlGeneration}),
    state:'preparing',cancelSeq:0,deadlineAt:now+60000};
  const requests=[];
  const service=createCloudService({storage,api:{runtime:{id:'fresh-control-test'},permissions:{contains:async()=>true}},clock:{now:()=>now},
    assertHost:async()=>({namespace}),currentHost:async()=>({namespace}),resolveTask:async()=>task,emitToHost:async()=>{},
    fetcher:async(url,options)=>{
      const path=url.split('/').at(-1),body=JSON.parse(options.body);requests.push({path,body});
      if(transportFailure)throw TypeError('reply lost');
      let reply;
      if(path==='admission')reply={...binding,...protocol,runRef,permitId:randomUUID(),leaseUntil:row.assignment.leaseUntil};
      else if(path==='start-ticket')reply={...body.binding,runRef:body.runRef,permitId:body.permitId,...protocol,
        startId:body.startId,challenge:body.challenge,ticketId:randomUUID(),issuedAt:now,expiresAt:now+5000};
      else if(path==='control-fence'){
        const {binding:flat,...rest}=body;reply={...flat,...rest,...protocol,fenceId:randomUUID(),issuedAt:now,expiresAt:now+2000};
      }else if(path==='suspend')reply={suspended:true};
      else throw Error('Unexpected route '+path);
      await onReply(path,reply,body);return new Response(JSON.stringify(reply));
    }});
  await storage.transaction([KV,'runs'],'readwrite',async tx=>{
    await tx.put(KV,{...binding,url:'http://provider.invalid',credential:'test',namespace,enabled:true,grantId:runRef.grantId,tasks:[task]},CONFIG);
    await tx.put(KV,row,key);await tx.put('runs',run,runId);
    await tx.put(KV,{tag:'task-installed-v1',enabled:true,scriptId:task.scriptId,version:task.version,manifestHash:task.manifestHash,authorization},installKey);
  });
  await service.permit(run);
  const read=(n,k)=>storage.transaction([n],'readonly',tx=>tx.get(n,k));
  const update=(n,k,fn)=>storage.transaction([n],'readwrite',async tx=>{const value=await tx.get(n,k);fn(value);await tx.put(n,value,k);});
  return {service,storage,run,requests,key,installKey,read,update,now:()=>now,tick:ms=>{now+=ms;},
    reply:fn=>{onReply=fn;},loseReply:()=>{transportFailure=true;},
    expected:(extra={})=>({requestId:randomUUID(),requestDigest:'a'.repeat(64),effectId:randomUUID(),kind:'owned-create',...extra})};
}

test('R20.1 service persists the original start intent and ticket without a second request',async()=>{
  const f=await fixture();await f.service.start(f.run);
  const before=await f.read(KV,f.key),stored=await f.read('runs',f.run.runId);
  assert.equal(stored.cloudStartTicketId,before.startTicket.ticketId);
  assert.deepEqual(before.startIntent,{startId:f.run.requestId,challenge:before.startTicket.challenge});
  await f.service.start(f.run);
  assert.deepEqual(await f.read(KV,f.key),before);
  assert.equal(f.requests.filter(r=>r.path==='start-ticket').length,1);
});
const invalidProofs=[
  ['missing identity',p=>{delete p.ticketId;delete p.fenceId;},'E_CONTROL_FENCE'],
  ['wrong Run',p=>{p.runRef={...p.runRef,runId:randomUUID()};},'E_CONTROL_FENCE'],
  ['wrong generation',p=>{p.controlGeneration=randomUUID();},'E_CONTROL_PROTOCOL'],
  ['wrong binding',p=>{p.assignmentId=randomUUID();},'E_CONTROL_FENCE'],
  ['wrong challenge',p=>{p.challenge=randomUUID();},'E_CONTROL_FENCE'],
  ['expired proof',p=>{p.issuedAt-=5000;p.expiresAt=p.issuedAt+1;},'E_CONTROL_FENCE'],
  ['future issuance',p=>{p.issuedAt++;},'E_CONTROL_FENCE'],
  ['excess lifetime',p=>{p.expiresAt++;},'E_CONTROL_FENCE']
];
for(const [name,change,code] of invalidProofs)test('R20.1 service rejects start ticket with '+name,async()=>{
  const f=await fixture();f.reply((path,p)=>{if(path==='start-ticket')change(p);});
  await assert.rejects(f.service.start(f.run),{code});
  assert.equal((await f.read('runs',f.run.runId)).cloudStartTicketId,undefined);
  assert.equal((await f.read(KV,f.key)).startTicket,undefined);
});
for(const stage of ['start-ticket','control-fence'])for(const mode of ['Stop','installation generation','cancel sequence','connection epoch','late reply'])
  test(`R20.1 service rejects ${stage} when ${mode} changes before reply`,async()=>{
    const f=await fixture();if(stage==='control-fence')await f.service.start(f.run);
    f.reply(async(path,p)=>{
      if(path!==stage)return;
      if(mode==='Stop')await f.service.cloudStop({},{});
      else if(mode==='installation generation')await f.update(KV,f.installKey,r=>{r.authorization.generation++;});
      else if(mode==='cancel sequence')await f.update('runs',f.run.runId,r=>{r.cancelSeq++;});
      else if(mode==='connection epoch')f.service.invalidate();
      else {f.tick(stage==='start-ticket'?5000:2000);p.issuedAt=f.now();p.expiresAt=f.now()+(stage==='start-ticket'?5000:2000);}
    });
    const action=stage==='start-ticket'?()=>f.service.start(f.run):()=>f.service.controlFence(f.run,f.expected());
    const code=mode==='installation generation'?'E_PERMISSION':mode==='cancel sequence'?'E_CLOUD_FENCED':mode==='connection epoch'||mode==='Stop'?(stage==='start-ticket'?'E_CLOUD_FENCED':'E_CONTROL_FENCE'):'E_CONTROL_FENCE';
    await assert.rejects(action(),{code});
    if(stage==='start-ticket')assert.equal((await f.read('runs',f.run.runId)).cloudStartTicketId,undefined);
  });
for(const [name,change,code] of invalidProofs)test('R20.1 service rejects control fence with '+name,async()=>{
  const f=await fixture();await f.service.start(f.run);
  f.reply((path,p)=>{if(path==='control-fence')change(p);});
  await assert.rejects(f.service.controlFence(f.run,f.expected()),{code});
});
test('R20.1 service requires a start ticket before requesting a control fence',async()=>{
  const f=await fixture();await assert.rejects(f.service.controlFence(f.run,f.expected()),{code:'E_CONTROL_FENCE'});
  assert.equal(f.requests.some(r=>r.path==='control-fence'),false);
});
test('R20.1 service binds each fence to its exact request digest and effect',async()=>{
  const f=await fixture();await f.service.start(f.run);const expected=f.expected(),proof=await f.service.controlFence(f.run,expected);
  const check=value=>f.storage.transaction([KV,'runs'],'readonly',tx=>f.service.assertControlFence(tx,f.run,proof,value));
  await check(expected);
  for(const key of ['requestId','requestDigest','effectId'])await assert.rejects(check({...expected,[key]:randomUUID()}),{code:'E_CONTROL_FENCE'});
  const body=f.requests.find(r=>r.path==='control-fence').body;
  assert.deepEqual(Object.keys(body).sort(),['binding','runRef','permitId','ticketId','controlGeneration','requestId','requestDigest','effectId','challenge'].sort());
});
test('R20.1 service rechecks expiry at fence consumption',async()=>{
  const f=await fixture();await f.service.start(f.run);const expected=f.expected(),proof=await f.service.controlFence(f.run,expected);
  f.tick(2000);await assert.rejects(f.storage.transaction([KV,'runs'],'readonly',tx=>f.service.assertControlFence(tx,f.run,proof,expected)),{code:'E_CONTROL_FENCE'});
});
test('R20.1 service leaves legacy permit-only runs on their original protocol',async()=>{
  const f=await fixture({legacy:true});await f.service.start(f.run);
  assert.equal(await f.service.controlFence(f.run,f.expected()),null);
  assert.deepEqual(f.requests.map(r=>r.path),['admission']);
  assert.equal((await f.read(KV,f.key)).startTicket,undefined);
});
