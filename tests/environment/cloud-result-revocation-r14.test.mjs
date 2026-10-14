import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudHosting} from '../../src/ui/cloud-hosting.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
const taskId='sample.form-fill';
const version='1.0.0';
const manifestHash='a'.repeat(64);
const sourceHash='b'.repeat(64);
const installationId='install-one';
const generation=1;
const taskKey=[taskId,version,manifestHash,sourceHash,installationId,generation].join('|');

test('acknowledged revoke stays unchecked when subsequent status read fails',async()=>{
  let revoked=false;
  const f=fixture({
    revoke:async()=>{revoked=true;},
    readStatus:status=>{
      if(revoked)throw {code:'E_OFFLINE'};
      return status;
    }
  });
  try{
    await f.ready();
    f.uncheckResult();
    await flush();await flush();
    const input=f.resultInput();
    assert.equal(input.checked,false);
    assert.equal(input.disabled,false);
    assert.equal(f.status.enabled,true);
    assert.deepEqual(f.calls,[{taskId}]);
    assert.match(f.get('cloud-status').textContent,/结果回传授权已撤销/);
  }finally{f.control.dispose();}
});

test('output consent stays disabled until pending revocation and status refresh settle',async()=>{
  let release;
  const pending=new Promise(resolve=>{release=resolve;});
  const f=fixture({revoke:()=>pending});
  try{
    await f.ready();
    f.uncheckResult();
    assert.equal(f.get('cloud-result-consent').disabled,true);
    await f.control.refresh();
    assert.equal(f.get('cloud-result-consent').disabled,true);
    assert.equal(f.status.enabled,true);
    release();await flush();await flush();
    const input=f.resultInput();
    assert.deepEqual(f.calls,[{taskId}]);
    assert.equal(input.checked,false);
    assert.equal(input.disabled,true);
  }finally{release();f.control.dispose();}
});

test('revocation uses only the selected task row result entry',async()=>{
  const f=fixture();
  try{
    await f.ready();
    const input=f.resultInput();
    assert.equal(input.checked,true);
    assert.equal(input.disabled,false);
    f.uncheckResult(input);
    await flush();await flush();
    const next=f.resultInput();
    assert.deepEqual(f.calls,[{taskId}]);
    assert.equal(f.status.enabled,true);
    assert.equal(next.checked,false);
    assert.equal(next.disabled,true);
  }finally{f.control.dispose();}
});

test('a disabled row cannot restore result delivery or send revocation',async()=>{
  const f=fixture({resultAllowed:false});
  try{
    await f.ready();
    const input=f.resultInput();
    assert.equal(input.disabled,true);
    f.change({dataset:{cloudResultKey:taskKey},checked:true});
    await f.control.refresh();
    assert.equal(f.status.tasks[0].resultAllowed,false);
    assert.equal(f.resultInput().checked,false);
    assert.deepEqual(f.calls,[]);
  }finally{f.control.dispose();}
});

test('output changes before hosting are approval choices and do not send revocation',async()=>{
  const f=fixture({enabled:false,resultAllowed:false});
  try{
    await f.ready();
    const input=f.resultInput();
    input.checked=true;
    f.change(input);
    await flush();
    assert.deepEqual(f.calls,[]);
    assert.equal(f.resultInput().disabled,false);
  }finally{f.control.dispose();}
});

test('a changed task selection cannot revoke another approved task and disposal removes change listener',async()=>{
  const f=fixture();
  try{
    await f.ready();
    f.change({dataset:{cloudResultKey:'other-task|1|hash|source|install|1'},checked:false});
    await flush();
    assert.deepEqual(f.calls,[]);
  }finally{f.control.dispose();}
  assert.equal(f.get('cloud-task-list').events.has('change'),false);
});

test('failed revocation keeps the stored permission visible and sanitizes transport errors',async()=>{
  const f=fixture({revoke:async()=>{throw {code:'E_SECRET',message:'credential-secret'};}});
  try{
    await f.ready();
    f.uncheckResult();
    await flush();await flush();
    assert.equal(f.status.tasks[0].resultAllowed,true);
    assert.equal(f.status.tasks[0].resultAllowed,true);
    assert.match(f.get('cloud-status').textContent,/操作未完成/);
    assert.doesNotMatch(f.get('cloud-status').textContent,/credential-secret/);
  }finally{f.control.dispose();}
});

function fixture({enabled=true,resultAllowed=true,revoke,readStatus}={}){
  const nodes=new Map();
  const node=()=>({
    textContent:'',
    className:'',
    value:'',
    checked:false,
    disabled:false,
    hidden:false,
    open:false,
    type:'',
    children:[],
    dataset:{},
    events:new Map(),
    addEventListener(type,fn){this.events.set(type,fn);},
    removeEventListener(type){this.events.delete(type);},
    replaceChildren(){this.children=[];},
    append(...values){this.children.push(...values);},
    focus(){},
    click(){}
  });
  const get=id=>{
    if(!nodes.has(id))nodes.set(id,node());
    return nodes.get(id);
  };
  get('task-installed-list').value=taskId;
  const document={
    documentElement:{dataset:{opendeskTab:'cloud'}},
    getElementById:get,
    createElement:node
  };
  const status={
    provider:{providerId:'provider-one'},
    enabled,
    online:true,
    reconciled:true,
    connection:'authenticated',
    hostReady:true,
    slotAvailable:false,
    slotState:'cloud-running',
    pendingResources:false,
    siteAuthorization:'granted',
    tasks:[approvedTask(resultAllowed)],
    requests:[],
    requestTotal:0
  };
  const catalog={
    catalog:[{
      taskId,
      version,
      manifestHash,
      stage:'available',
      verification:{manifestHash,sourceHash},
      manifest:{
        title:'Sample Form Fill',
        description:'Test task',
        program:{sourceHash},
        siteOrigins:['https://example.test'],
        paramsSchema:{type:'object',properties:{},required:[]}
      }
    }],
    installed:[{taskId,version,manifestHash,installationId,generation,enabled:true}]
  };
  const calls=[];
  const forbidden=()=>assert.fail('output revocation must not stop, approve, claim or execute');
  const cloud={
    cloudStatus:async()=>readStatus?readStatus(status):status,
    cloudNext:forbidden,
    cloudResolve:forbidden,
    cloudApprove:forbidden,
    cloudStop:forbidden,
    cloudUnpair:forbidden,
    cloudPair:forbidden,
    cloudRevokeResults:async request=>{
      calls.push(request);
      if(revoke)await revoke(request);
      status.tasks[0]=approvedTask(false);
      return status;
    }
  };
  const client={cloud,request:(name,args)=>{
    assert.equal(name,'listTaskCatalog');
    assert.deepEqual(args,{});
    return catalog;
  }};
  const control=createCloudHosting({document,client,host:{executionPending:true,start:forbidden},api:{}});
  return {
    control,
    status,
    calls,
    get,
    async ready(){
      await control.refresh();
      await flush();await flush();
      assert.equal(this.resultInput().dataset.cloudResultKey,taskKey);
    },
    resultInput(){
      const found=find(get('cloud-task-list'),item=>item?.dataset?.cloudResultKey===taskKey);
      assert.ok(found,'expected rendered task row result checkbox');
      return found;
    },
    change(target){
      get('cloud-task-list').events.get('change')({target});
    },
    uncheckResult(target=this.resultInput()){
      target.checked=false;
      this.change(target);
    }
  };
}

function approvedTask(resultAllowed){
  return {
    taskId,
    version,
    manifestHash,
    sourceHash,
    siteOrigins:['https://example.test'],
    installationId,
    generation,
    resultAllowed
  };
}

function find(value,predicate){
  if(predicate(value))return value;
  for(const child of value?.children??[]){
    const found=find(child,predicate);
    if(found)return found;
  }
  return null;
}
