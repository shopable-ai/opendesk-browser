import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudHosting,projectCloudInstalledTasks} from '../../src/ui/cloud-hosting.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
const pin={taskId:'demo',version:'1.0.0',manifestHash:'a'.repeat(64),sourceHash:'b'.repeat(64),
  installationId:'install-a',generation:2,siteOrigins:['https://example.com'],resultAllowed:false};
const installed={...pin,enabled:true};
const catalog={installed:[installed],catalog:[{taskId:pin.taskId,version:pin.version,
  manifestHash:pin.manifestHash,stage:'available',verification:{manifestHash:pin.manifestHash,sourceHash:pin.sourceHash},
  manifest:{title:'受控测试任务',siteOrigins:pin.siteOrigins,program:{sourceHash:pin.sourceHash},
    paramsSchema:{type:'object',properties:{name:{type:'string'}},required:['name']}}}]};
async function fixture(t,{enabled=false,paired=true,requests=[],clients=[],onOpenRun}={}){
  let model,grantResponse,pairResponse,revokeResponse,failStatus=false;
  const clientRecords=structuredClone(clients);
  const calls=[],status={provider:paired?{providerId:'local'}:null,enabled,online:false,reconciled:false,
    connection:'offline',hostReady:true,slotAvailable:true,slotState:'available',
    pendingResources:false,siteAuthorization:'granted',tasks:enabled?[{...pin,resultAllowed:true}]:[],
    requests,requestTotal:requests.length};
  const cloud={
    cloudStatus:async query=>{
      calls.push(['status',query]);if(failStatus)throw {code:'E_AUTH'};
      if(query.includeRequests===false)return {...status,requests:[]};
      const offset=query.offset??0,limit=query.limit,end=Math.max(0,status.requests.length-offset);
      const page=status.requests.slice(Math.max(0,end-limit),end);
      return {...status,requests:page,requestTotal:status.requests.length,
        requestPage:{offset,limit,nextOffset:offset+page.length<status.requests.length?offset+page.length:null}};
    },
    cloudNext:async()=>{calls.push(['claim']);return null;},
    cloudApprove:async input=>{calls.push(['approve',input]);status.enabled=true;status.tasks=input.tasks;},
    cloudStop:async()=>{calls.push(['stop']);status.enabled=false;status.tasks=[];},
    cloudRevokeResults:async input=>{calls.push(['revokeResults',input]);status.tasks=status.tasks.map(p=>({...p,resultAllowed:false}));},
    cloudClientGrant:async input=>{calls.push(['grantClient',input]);return grantResponse??{credential:'c'.repeat(64)};},
    cloudClients:async query=>{calls.push(['clients',query]);return {clients:structuredClone(clientRecords),total:clientRecords.length,nextOffset:null};},
    cloudClientRevoke:async input=>{
      calls.push(['revokeClient',input]);await revokeResponse;
      const index=clientRecords.findIndex(row=>row.clientId===input.clientId);
      assert.notEqual(index,-1);clientRecords.splice(index,1);
    },
    cloudPair:async input=>{calls.push(['pair',input]);await pairResponse;status.provider={providerId:input.providerId};},
    cloudUnpair:async()=>{calls.push(['unpair']);status.provider=null;status.enabled=false;status.tasks=[];}
  };
  const control=createCloudHosting({client:{cloud,request:async(type)=>{
    assert.equal(type,'listTaskCatalog');return structuredClone(catalog);
  }},host:{executionPending:false},document:{documentElement:{dataset:{opendeskTab:'cloud'}},
    getElementById:()=>null},api:{},onOpenRun,reactUI:{cloudPageMounted:true,renderCloudPage(next){model=next;}}});
  t.after(()=>control.dispose());await flush();await flush();
  return {control,calls,status,model:()=>model,
    deferGrant(value){grantResponse=value;},deferPair(value){pairResponse=value;},
    deferRevoke(value){revokeResponse=value;},failStatus(){failStatus=true;}};
}

test('Pair forwards the reviewed fields and clears the code before the RPC settles',async t=>{
  const f=await fixture(t,{paired:false});
  assert.equal(f.model().pairing.canPair,true);
  f.model().pairing.onField('url','http://127.0.0.1:43111');
  f.model().pairing.onField('providerId','  local-provider  ');
  f.model().pairing.onField('pairingCode','  test-pair-code  ');
  f.model().pairing.onField('loopback',true);
  let finish;f.deferPair(new Promise(resolve=>{finish=resolve;}));
  const start=f.calls.length,pending=f.model().pairing.onPair();
  assert.deepEqual(f.calls.slice(start),[['pair',{url:'http://127.0.0.1:43111',
    providerId:'local-provider',pairingCode:'test-pair-code',allowLoopback:true}]]);
  assert.equal(f.model().pairing.pairingCode,'');
  assert.equal(f.model().pairing.busy,true);
  finish();await pending;
  assert.deepEqual(f.calls.slice(start+1),[['status',{limit:5}]]);
  assert.equal(f.model().pairing.pairingCode,'');
  assert.equal(f.model().pairing.canPair,false);
  assert.equal(f.model().pairing.canUnpair,true);
  assert.equal(f.model().setup.visible,false);
});

test('Rejected pairing clears the code and projects only the trusted error',async t=>{
  const f=await fixture(t,{paired:false});
  f.model().pairing.onField('url','https://cloud.example.test');
  f.model().pairing.onField('providerId','test-provider');
  f.model().pairing.onField('pairingCode','private-test-code');
  let reject;f.deferPair(new Promise((resolve,fail)=>{reject=fail;}));
  const start=f.calls.length,pending=f.model().pairing.onPair();
  assert.equal(f.model().pairing.pairingCode,'');
  reject({code:'E_AUTH',message:'remote failure with private-test-code'});await pending;
  assert.deepEqual(f.calls.slice(start),[['pair',{url:'https://cloud.example.test',
    providerId:'test-provider',pairingCode:'private-test-code',allowLoopback:false}]],'Pair failure is not retried');
  assert.equal(f.model().pairing.pairingCode,'');
  assert.match(f.model().pairing.status,/E_AUTH/);
  assert.doesNotMatch(f.model().pairing.status,/private-test-code|remote failure/);
  assert.equal(f.model().pairing.canPair,true);
  assert.equal(f.model().setup.visible,true);
});

test('Cloud React approval binds fixed installation and separates execution/result consent',async t=>{
  const f=await fixture(t),key=f.model().authorization.tasks[0].key;
  f.model().authorization.onSelection(key,true);
  await f.model().authorization.onApprove();
  assert.equal(f.calls.some(c=>c[0]==='approve'),false);
  assert.match(f.model().pairing.status,/请先核对/);
  f.model().authorization.onConsent(true);
  f.model().authorization.onResultSelection(key,true);
  assert.equal(f.model().authorization.consent,false,'Scope changes reset approval');
  f.model().authorization.onConsent(true);
  await f.model().authorization.onApprove();
  assert.equal(f.calls.some(c=>c[0]==='approve'),false,'Result body requires separate consent');
  f.model().authorization.onConsent(true);f.model().authorization.onResultConsent(true);
  await f.model().authorization.onApprove();
  assert.deepEqual(f.calls.find(c=>c[0]==='approve')[1],{tasks:[{...pin,resultAllowed:true}]});
  assert.equal(f.model().authorization.tasks[0].selected,true,'Active approval remains visibly checked');
  assert.equal(f.model().authorization.consent,false);
  await f.model().authorization.onResultSelection(key,false);
  assert.deepEqual(f.calls.find(c=>c[0]==='revokeResults'),['revokeResults',{taskId:pin.taskId}]);
  assert.equal(f.model().authorization.tasks[0].resultAllowed,false);
  assert.equal(f.status.enabled,true,'Result revocation preserves execution approval');
  await f.model().authorization.onStop();
  assert.equal(f.status.enabled,false);assert.deepEqual(f.status.tasks,[]);
});

test('Changed installation identity is never displayed as already approved',()=>{
  const [task]=projectCloudInstalledTasks(catalog,[{...pin,installationId:'other-install'}]);
  assert.equal(task.approved,false);assert.equal(task.requiresReapproval,true);
});

test('One-time credential is cleared on hide and a late response cannot redisplay it',async t=>{
  const f=await fixture(t,{enabled:true});
  f.model().clients.onField('name','受控演示');
  await f.model().clients.onCreate();
  assert.equal(f.model().clients.token,'c'.repeat(64));
  f.model().pairing.onField('pairingCode','private-test-code');
  f.model().onHide();assert.equal(f.model().clients.token,'');
  assert.equal(f.model().pairing.pairingCode,'');
  let finish;f.deferGrant(new Promise(resolve=>{finish=resolve;}));
  const pending=f.model().clients.onCreate();await flush();
  f.model().onHide();finish({credential:'d'.repeat(64)});await pending;
  assert.equal(f.model().clients.token,'');
  assert.equal(f.calls.filter(c=>c[0]==='grantClient').length,2,'No unknown-result retry');
});

test('Credential copy writes the one-time token through navigator clipboard and respects dismissal',async t=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator'),writes=[];
  let finish;
  const clipboard={writeText(value){assert.equal(this,clipboard);writes.push(value);
    return new Promise(resolve=>{finish=resolve;});}};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard}});
  t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;});
  const f=await fixture(t,{enabled:true});
  f.model().clients.onField('name','  受控测试应用  ');
  f.model().clients.onField('resultAllowed',true);
  await f.model().clients.onCreate();
  assert.deepEqual(f.calls.filter(c=>c[0]==='grantClient'),[
    ['grantClient',{label:'受控测试应用',taskId:pin.taskId,allowResult:true}]]);
  const pending=f.model().clients.onCopy();
  assert.deepEqual(writes,['c'.repeat(64)]);
  assert.equal(f.model().clients.busy,true,'Copy waits for the clipboard promise');
  finish();await pending;
  assert.match(f.model().clients.status,/密钥已复制/);
  assert.equal(f.model().clients.token,'c'.repeat(64));
  f.model().clients.onDismissToken();await f.model().clients.onCopy();
  assert.equal(f.model().clients.token,'');
  assert.deepEqual(writes,['c'.repeat(64)],'Dismissed credentials cannot be copied again');
  assert.equal(f.calls.filter(c=>c[0]==='grantClient').length,1,'Copy never issues another credential');
});

test('Client revocation requires two clicks, sends the selected ID, and refreshes the list',async t=>{
  const clientId='1'.repeat(32),otherId='2'.repeat(32);
  const f=await fixture(t,{enabled:true,clients:[
    {clientId,label:'要撤销的应用',tasks:[pin]},
    {clientId:otherId,label:'保留的应用',tasks:[pin]}
  ]});
  await f.model().clients.onRefresh();
  assert.deepEqual(f.calls.find(c=>c[0]==='clients'),['clients',{offset:0,limit:20}]);
  assert.equal(f.model().clients.rows[0].tasksText,'受控测试任务');
  assert.equal(f.model().clients.count,'2 个有效授权');
  const start=f.calls.length;
  f.model().clients.onRevoke(clientId);
  assert.equal(f.model().clients.rows[0].confirming,true);
  assert.notEqual(f.model().clients.rows[1].confirming,true);
  assert.deepEqual(f.calls.slice(start),[],'First click only asks for confirmation');
  f.model().pairing.onField('pairingCode','private-test-code');
  let finish;f.deferRevoke(new Promise(resolve=>{finish=resolve;}));
  f.model().clients.onRevoke(clientId);
  assert.deepEqual(f.calls.slice(start),[['revokeClient',{clientId}]]);
  assert.equal(f.model().clients.busy,true);
  finish();await flush();
  assert.deepEqual(f.calls.slice(start),[
    ['revokeClient',{clientId}],['clients',{offset:0,limit:20}],['status',{limit:5}]]);
  assert.deepEqual(f.model().clients.rows.map(row=>row.clientId),[otherId]);
  assert.equal(f.model().clients.count,'1 个有效授权');
  assert.match(f.model().clients.status,/凭据已撤销/);
  assert.equal(f.model().clients.busy,false);
  assert.equal(f.model().pairing.pairingCode,'');
  assert.equal(f.status.enabled,true,'Revoking a client preserves hosting approval');
  assert.deepEqual(f.calls.filter(c=>c[0]==='grantClient'),[],'Revocation never creates credentials');
});

test('Client revocation hides the visible one-time credential before the RPC settles',async t=>{
  const clientId='1'.repeat(32);
  const f=await fixture(t,{enabled:true,clients:[{clientId,label:'受控测试应用',tasks:[pin]}]});
  f.model().clients.onField('name','受控测试应用');
  await f.model().clients.onCreate();
  assert.equal(f.model().clients.token,'c'.repeat(64));
  let finish;f.deferRevoke(new Promise(resolve=>{finish=resolve;}));
  f.model().clients.onRevoke(clientId);
  f.model().clients.onRevoke(clientId);
  try{
    assert.deepEqual(f.calls.filter(c=>c[0]==='revokeClient'),[['revokeClient',{clientId}]]);
    assert.equal(f.model().clients.token,'','The revoked credential must not remain in the visible model');
  }finally{finish();await flush();}
});

test('Read failure disables approval and clears pending pairing code',async t=>{
  const f=await fixture(t);f.model().pairing.onField('pairingCode','test-code');
  f.failStatus();await f.model().onRefresh();
  assert.equal(f.model().pairing.pairingCode,'');
  assert.equal(f.model().authorization.canApprove,false);
  assert.equal(f.model().pairing.canPair,false);
});

test('Request details open the original Run read-only',async t=>{
  const runId='12a45678-1234-1234-1234-123456789012',opened=[];
  const f=await fixture(t,{requests:[{taskId:pin.taskId,runId,taskTitle:'原始任务',
    state:'finished',runState:'completed',retirementState:'released',receipt:{id:'receipt'}}],
    onOpenRun:id=>opened.push(id)});
  f.model().requests.onDetail(0);
  assert.equal(f.model().requests.detail.runId,runId);
  await f.model().requests.onOpenResult();
  assert.deepEqual(opened,[runId]);
  f.model().requests.onClose();assert.equal(f.model().requests.detail,null);
  assert.equal(f.calls.some(call=>call[0]==='claim'),false);
});

test('Request pages use cloudStatus offsets and map each detail to that page original Run',async t=>{
  const requests=Array.from({length:12},(_,index)=>({taskTitle:'请求 '+(index+1),
    runId:'00000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),
    state:'finished',runState:'completed',retirementState:'released',receipt:true})),opened=[];
  const f=await fixture(t,{requests,onOpenRun:id=>opened.push(id)});
  const initialCalls=f.calls.length;
  assert.equal(f.model().requests.pageText,'第 1–5 条 / 共 12 条');
  assert.equal(f.model().requests.canPrev,false);
  assert.equal(f.model().requests.canNext,true);
  assert.deepEqual(f.model().requests.rows.map(row=>row.title),[12,11,10,9,8].map(n=>'请求 '+n+' · 已完成 · 已完成'));
  f.model().requests.onDetail(0);
  assert.equal(f.model().requests.detail.title,'请求 12');
  assert.equal(f.model().requests.detail.runId,requests[11].runId);
  await f.model().requests.onNext();
  assert.deepEqual(f.calls.at(-1),['status',{limit:5,offset:5}]);
  assert.equal(f.model().requests.detail,null,'Changing page clears the old detail');
  assert.equal(f.model().requests.pageText,'第 6–10 条 / 共 12 条');
  assert.equal(f.model().requests.canPrev,true);
  assert.equal(f.model().requests.canNext,true);
  assert.deepEqual(f.model().requests.rows.map(row=>row.key),['5','6','7','8','9']);
  assert.deepEqual(f.model().requests.rows.map(row=>row.title),[7,6,5,4,3].map(n=>'请求 '+n+' · 已完成 · 已完成'));
  f.model().requests.onDetail(1);
  assert.equal(f.model().requests.detail.key,'6');
  assert.equal(f.model().requests.detail.title,'请求 6');
  assert.equal(f.model().requests.detail.state,'已完成 · 已完成');
  assert.equal(f.model().requests.detail.facts,'结果已保存 · 资源已释放 · 回执已确认');
  assert.equal(f.model().requests.detail.reason,'暂无其他状态信息。');
  assert.equal(f.model().requests.detail.runId,requests[5].runId);
  assert.equal(f.model().requests.detail.canOpenRun,true);
  await f.model().requests.onOpenResult();
  assert.deepEqual(opened,[requests[5].runId]);
  await f.model().requests.onNext();
  assert.deepEqual(f.calls.at(-1),['status',{limit:5,offset:10}]);
  assert.equal(f.model().requests.detail,null);
  assert.equal(f.model().requests.pageText,'第 11–12 条 / 共 12 条');
  assert.equal(f.model().requests.canNext,false);
  assert.deepEqual(f.model().requests.rows.map(row=>row.title),[2,1].map(n=>'请求 '+n+' · 已完成 · 已完成'));
  f.model().requests.onDetail(1);
  assert.equal(f.model().requests.detail.runId,requests[0].runId);
  await f.model().requests.onPrev();
  assert.deepEqual(f.calls.at(-1),['status',{limit:5,offset:5}]);
  assert.equal(f.model().requests.detail,null);
  assert.equal(f.model().requests.rows[0].title,'请求 7 · 已完成 · 已完成');
  await f.model().requests.onPrev();
  assert.deepEqual(f.calls.at(-1),['status',{limit:5}]);
  assert.equal(f.model().requests.canPrev,false);
  assert.equal(f.model().requests.rows[0].title,'请求 12 · 已完成 · 已完成');
  assert.deepEqual(f.calls.slice(initialCalls).filter(c=>c[0]==='status'),[
    ['status',{limit:5,offset:5}],['status',{limit:5,offset:5}],
    ['status',{limit:5,offset:10}],['status',{limit:5,offset:5}],['status',{limit:5}]]);
  assert.equal(f.calls.some(call=>call[0]==='claim'),false,'Browsing never claims a cloud request');
});
