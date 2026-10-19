import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {readFile} from 'node:fs/promises';
import {projectCloudInstalledTasks,createCloudHosting} from '../../src/ui/cloud-hosting.js';

const sha=a=>a.repeat(64);
const tasks=[
  {taskId:'sample.form-fill',version:'1.0.0',manifestHash:sha('a'),hash:sha('1'),
    title:'表单提交',generation:1},
  {taskId:'sample.modern-search',version:'1.0.0',manifestHash:sha('b'),hash:sha('2'),
    title:'Locator 搜索',generation:3},
  {taskId:'disabled.task',version:'1.0.0',manifestHash:sha('c'),hash:sha('3'),
    title:'停用项',generation:2}
];
const catalog=tasks.map(t=>({taskId:t.taskId,version:t.version,manifestHash:t.manifestHash,
  stage:'available',verification:{manifestHash:t.manifestHash,sourceHash:t.hash},
  manifest:{title:t.title,program:{sourceHash:t.hash},siteOrigins:['https://example.org']}}));
const installed=tasks.map((t,i)=>({taskId:t.taskId,version:t.version,
  manifestHash:t.manifestHash,enabled:i<2,installationId:'install-'+i,generation:t.generation}));
function surface(){
  let snapshot=null;
  return {
    doc:{documentElement:{dataset:{opendeskTab:'cloud'}},getElementById:()=>null},
    reactUI:{cloudPageMounted:true,renderCloudPage(model){snapshot=model;}},
    model:()=>snapshot
  };
}
test('Cloud catalog allows multiple verified installed identities but neither disabled nor new generations',()=>{
  const projected=projectCloudInstalledTasks({catalog,installed},[{taskId:tasks[0].taskId,
    version:tasks[0].version,manifestHash:tasks[0].manifestHash,
    sourceHash:tasks[0].hash,installationId:'install-0',generation:1,resultAllowed:true}]);
  assert.deepEqual(projected.map(row=>row.eligible),[true,true,false]);
  assert.deepEqual(projected.map(row=>row.approved),[true,false,false]);
  assert.equal(projected[0].resultAllowed,true);
  assert.equal(projected[0].requiresReapproval,false);
  const revoked=projectCloudInstalledTasks({catalog,installed:[
    {...installed[0],generation:2}]},[{taskId:tasks[0].taskId,
    version:tasks[0].version,manifestHash:tasks[0].manifestHash,
    sourceHash:tasks[0].hash,installationId:'install-0',generation:1,resultAllowed:true}]);
  assert.equal(revoked[0].approved,false,'Same version with new installation generation must not appear approved');
  assert.equal(revoked[0].requiresReapproval,true,
    'Old grant for the same TaskId must visibly require a new approval');
  const upgraded=projectCloudInstalledTasks({catalog,installed:[
    {...installed[0],version:'2.0.0',generation:2}]},[]);
  assert.equal(upgraded[0].eligible,false,'Upgrade requires a new local verification and approval');
});
test('Side Panel approves two distinct pinned Tasks with individual result scope, never the disabled third Task',async()=>{
  const {doc,reactUI,model}=surface(),approved=[],calls=[];
  const cloud={cloudStatus:async()=>({provider:{providerId:'p'},enabled:false,
    online:false,reconciled:false,connection:'offline',tasks:[],hostReady:true,
    slotAvailable:true,requestTotal:0,requests:[]}),
    cloudApprove:async body=>{approved.push(body);return {};}};
  const client={cloud,request:async(name)=>{
    assert.equal(name,'listTaskCatalog');calls.push(name);return {catalog,installed};
  }};
  const control=createCloudHosting({client,host:{executionPending:false},
    document:doc,api:{},reactUI});
  try{
    for(let i=0;i<5;i++)await setImmediate();
    assert.ok(calls.length>=1);
    const items=()=>model().authorization.tasks;
    assert.equal(items().length,3);
    assert.deepEqual(items().map(row=>row.eligible),[true,true,false]);
    assert.deepEqual(items().map(row=>row.siteOrigins),[
      ['https://example.org'],['https://example.org'],['https://example.org']]);
    assert.deepEqual(items().map(row=>row.title),['表单提交','Locator 搜索','停用项']);
    assert.deepEqual(items().map(row=>row.version),['1.0.0','1.0.0','1.0.0']);
    assert.match(await readFile('src/ui/react/tabs/cloud-authorization.tsx','utf8'),
      /参数许可（固定 Schema）/);

    for(let i=0;i<2;i++){
      const key=items()[i].key;
      model().authorization.onSelection(key,true);
      if(i===0)model().authorization.onResultSelection(key,true);
    }
    assert.equal(items()[2].selected,false,'Disabled Task must not be selected');
    assert.deepEqual(items().map(row=>row.selected),[true,true,false]);
    assert.deepEqual(items().map(row=>row.resultSelected),[true,false,false]);
    assert.equal(model().authorization.consent,false);
    assert.equal(model().authorization.resultConsent,false);

    model().authorization.onConsent(true);
    model().authorization.onResultConsent(true);
    assert.equal(model().authorization.consent,true);
    assert.equal(model().authorization.resultConsent,true);
    // Changing result scope after consent must invalidate both approvals.
    const searchKey=items()[1].key;
    model().authorization.onResultSelection(searchKey,true);
    assert.equal(model().authorization.consent,false);
    assert.equal(model().authorization.resultConsent,false);
    assert.equal(items()[1].resultSelected,true);
    model().authorization.onResultSelection(searchKey,false);
    assert.equal(items()[1].resultSelected,false);
    model().authorization.onConsent(true);
    model().authorization.onResultConsent(true);
    assert.equal(model().authorization.canApprove,true);

    await model().authorization.onApprove();
    assert.equal(approved.length,1);
    assert.equal(approved[0].tasks.length,2);
    assert.deepEqual(approved[0].tasks.map(t=>t.taskId),
      ['sample.form-fill','sample.modern-search']);
    assert.deepEqual(approved[0].tasks.map(t=>t.resultAllowed),[true,false]);
    assert.deepEqual(approved[0].tasks.map(t=>t.generation),[1,3]);
    assert.deepEqual(approved[0].tasks.map(t=>t.manifestHash),[sha('a'),sha('b')]);
    assert.deepEqual(approved[0].tasks.map(t=>t.siteOrigins),[
      ['https://example.org'],['https://example.org']]);
    assert.equal(model().authorization.consent,false);
    assert.equal(model().authorization.resultConsent,false);
  }finally{control.dispose();}
});
