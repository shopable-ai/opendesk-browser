import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
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
  const nodes=new Map();
  const node=()=>({textContent:'',value:'',checked:false,disabled:false,cloudCanApprove:false,
    dataset:{},children:[],events:new Map(),append(...children){this.children.push(...children);},
    replaceChildren(){this.children=[];},
    addEventListener(event,fn){this.events.set(event,fn);},
    removeEventListener(event){this.events.delete(event);}});
  const getElementById=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
  return {nodes,doc:{documentElement:{dataset:{opendeskTab:'cloud'}},getElementById,createElement:node}};
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
  const {nodes,doc}=surface(),approved=[],calls=[];
  const cloud={cloudStatus:async()=>({provider:{providerId:'p'},enabled:false,
    online:false,reconciled:false,connection:'offline',tasks:[],hostReady:true,
    slotAvailable:true,requestTotal:0,requests:[]}),
    cloudApprove:async body=>{approved.push(body);return {};}};
  const client={cloud,request:async(name)=>{assert.equal(name,'listTaskCatalog');calls.push(name);return {catalog,installed};}};
  const control=createCloudHosting({client,host:{executionPending:false},document:doc,api:{}});
  try{
    for(let i=0;i<5;i++)await setImmediate();
    assert.ok(calls.length>=1);
    const sections=nodes.get('cloud-task-list').children;
    assert.equal(sections.length,3);
    assert.match(sections[0].children[2].textContent,/参数许可/);
    for(let i=0;i<2;i++){
      const first=sections[i].children[0].children[0],
        result=sections[i].children[3].children[0];
      assert.equal(first.disabled,false);
      first.checked=true;
      nodes.get('cloud-task-list').events.get('change')({target:first});
      if(i===0){result.checked=true;nodes.get('cloud-task-list').events.get('change')({target:result});}
    }
    assert.equal(sections[2].children[0].children[0].disabled,true);
    assert.equal(nodes.get('cloud-approval-review').hidden,false);
    const reviewItems=nodes.get('cloud-review-items').children;
    assert.equal(reviewItems.length,2);
    assert.match(reviewItems[0].textContent,/表单提交 · v1.0.0.*example.org.*结果正文：允许/);
    assert.match(reviewItems[1].textContent,/Locator 搜索 · v1.0.0.*结果正文：不回传/);
    assert.doesNotMatch(reviewItems.map(r=>r.textContent).join(' '),/install-0|[a-f0-9]{64}/);
    // A scope change after human confirmation must invalidate both checkboxes.
    doc.getElementById('cloud-consent').checked=true;
    doc.getElementById('cloud-result-consent').checked=true;
    const searchResult=sections[1].children[3].children[0];
    searchResult.checked=true;
    nodes.get('cloud-task-list').events.get('change')({target:searchResult});
    assert.equal(doc.getElementById('cloud-consent').checked,false);
    assert.equal(doc.getElementById('cloud-result-consent').checked,false);
    assert.match(nodes.get('cloud-review-items').children[1].textContent,/结果正文：允许/);
    searchResult.checked=false;
    nodes.get('cloud-task-list').events.get('change')({target:searchResult});
    assert.match(nodes.get('cloud-review-items').children[1].textContent,/结果正文：不回传/);
    doc.getElementById('cloud-consent').checked=true;
    doc.getElementById('cloud-result-consent').checked=true;
    assert.equal(nodes.get('cloud-approve').disabled,false);
    nodes.get('cloud-approve').events.get('click')();
    for(let i=0;i<5;i++)await setImmediate();
    assert.equal(approved.length,1);
    assert.equal(approved[0].tasks.length,2);
    assert.deepEqual(approved[0].tasks.map(t=>t.taskId),
      ['sample.form-fill','sample.modern-search']);
    assert.deepEqual(approved[0].tasks.map(t=>t.resultAllowed),[true,false]);
    assert.deepEqual(approved[0].tasks.map(t=>t.generation),[1,3]);
    assert.deepEqual(approved[0].tasks.map(t=>t.manifestHash),[sha('a'),sha('b')]);
    assert.equal(nodes.get('cloud-consent').checked,false);
    assert.equal(nodes.get('cloud-result-consent').checked,false);
  }finally{control.dispose();}
});
