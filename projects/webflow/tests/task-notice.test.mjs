import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const context={};
vm.runInNewContext(readFileSync(new URL('../src/ui/model.js',import.meta.url),'utf8'),context);
const M=context.OpenDeskWebFlowModel;
const pin={taskId:'baidu.search.top3',title:'百度搜索',version:'1.1.5'};
const id='webflow:original';
const running={clientRequestId:id,taskId:pin.taskId,runId:'run-original',state:'running'};
const completed={...running,resultId:'result-original',state:'completed',retirementState:'released',
  value:{status:'success',results:[{title:'网页原文',url:'https://example.test'}],count:1},
  result:{tag:'controller-result',runId:'run-original',resultId:'result-original',
    state:'completed',outcome:{ok:true}}};
const tick=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};

test('only verified Run/Result states produce a presentation event; completed is never business success',()=>{
  assert.equal(M.taskNotice({clientRequestId:id,state:'ready'},pin),null);
  assert.equal(M.taskNotice({clientRequestId:id,state:'running'},pin),null,'a UI draft is not an admitted Run');
  assert.equal(M.taskNotice({...running,semantic:'NOT_SUBMITTED_FENCED'},pin),null);
  assert.equal(M.taskNotice({...running,taskId:'unrelated'},pin),null);
  assert.equal(M.taskNotice(running,pin).phase,'running');
  assert.equal(M.taskNotice(completed,pin).phase,'completed');
  assert.equal(M.taskNotice(completed,pin).options.type,'success');
  assert.match(M.taskNotice(completed,pin).options.message,/仅脚本执行/);
  assert.doesNotMatch(M.taskNotice(completed,pin).options.message,/业务成功|已回传/);
  assert.equal(M.taskNotice({...completed,resultId:'other'},pin).phase,'unverified');
  assert.equal(M.taskNotice({...completed,retirementState:'retiring'},pin).phase,'unverified');
  assert.equal(M.taskNotice({...completed,result:{...completed.result,outcome:{ok:false}}},pin).phase,'failed');
  assert.equal(M.taskNotice({...running,state:'unknown',semantic:'UNKNOWN'},pin).phase,'unknown');
  assert.match(M.taskNotice({...running,state:'unknown',semantic:'UNKNOWN'},pin).options.message,/禁止自动重试/);
  assert.equal(M.taskNotice({...completed,state:'stopped'},pin).phase,'retirement-pending');
  assert.equal(M.taskNotice({...completed,state:'stopped',result:{...completed.result,state:'stopped',outcome:{ok:false}}},pin).phase,'stopped');
  assert.equal(M.taskNotice({...completed,result:{...completed.result,state:'failed',outcome:{ok:true}}},pin).phase,'unverified');
  assert.equal(M.taskNotice({...completed,value:{status:'blocked'}},pin).phase,'reported-issue');
  assert.match(M.taskNotice({...completed,value:{status:'blocked'}},pin).options.message,/脚本报告网站验证阻断/);
});

test('failed execution includes only bounded structured codes, not arbitrary webpage text',()=>{
  const bad={...completed,state:'failed',result:{...completed.result,state:'failed',outcome:{ok:false,error:{
    code:'<script>alert(1)</script>',message:'malicious untrusted HTML'}}}};
  const notice=M.taskNotice(bad,pin);
  assert.equal(notice.phase,'failed');
  assert.equal(notice.options.type,'error');
  assert.doesNotMatch(JSON.stringify(notice),/script|malicious|HTML/);
  const valid=M.taskNotice({...bad,result:{...bad.result,outcome:{ok:false,error:{code:'E_PERMISSION'}}}},pin);
  assert.match(valid.options.caption,/E_PERMISSION/);
});

test('one original Run uses one R1.2 handle and updates without triggering SDK requests',async()=>{
  const opens=[],updates=[],dismisses=[];
  const notify={open(value){
    opens.push(value);
    return {ready:Promise.resolve({status:'accepted'}),
      update(next){updates.push(next);return Promise.resolve({status:'accepted'});},
      dismiss(){dismisses.push(true);return Promise.resolve({status:'accepted'});}};
  }};
  const publisher=M.createTaskNoticePublisher(notify);
  publisher.publish(id,running,pin);await tick();
  for(let i=0;i<8;i++)publisher.publish(id,running,pin);
  assert.equal(opens.length,1);assert.equal(updates.length,0);
  publisher.publish(id,completed,pin);await tick();
  publisher.publish(id,completed,pin);await tick();
  assert.equal(opens.length,1);
  assert.equal(updates.length,1);
  assert.match(updates[0].message,/脚本执行完成/);
  publisher.dispose();await tick();
  assert.equal(dismisses.length,1);
  publisher.publish('webflow:other',{...running,clientRequestId:'webflow:other'},pin);
  assert.equal(opens.length,1,'disposed handles never resurrect');
});

test('completion arriving before Host ready is replayed only as a notice update, never as a new Run',async()=>{
  let resolve;const ready=new Promise(r=>{resolve=r;});
  const opens=[],updates=[];
  const publisher=M.createTaskNoticePublisher({open(value){opens.push(value);
    return {ready,update(value){updates.push(value);return Promise.resolve({status:'accepted'});},
      dismiss(){return Promise.resolve({status:'accepted'});}};
  }});
  publisher.publish(id,running,pin);
  publisher.publish(id,completed,pin);
  assert.equal(updates.length,0);
  resolve({status:'accepted'});await tick();
  assert.equal(opens.length,1);assert.equal(updates.length,1);
  publisher.dispose();
});

test('unsupported, rejected or expired Host feedback never causes extra notification or script replay',async()=>{
  const unsupported=M.createTaskNoticePublisher(undefined);
  assert.doesNotThrow(()=>unsupported.publish(id,running,pin));
  unsupported.dispose();
  let opens=0,updates=0;
  const publisher=M.createTaskNoticePublisher({open(){
    opens++;return {ready:Promise.resolve({status:'rejected',reason:'unavailable'}),
      update(){updates++;return Promise.resolve({status:'accepted'});},
      dismiss(){return Promise.resolve({status:'accepted'});}};
  }});
  publisher.publish(id,running,pin);await tick();
  publisher.publish(id,completed,pin);await tick();
  assert.equal(opens,1);assert.equal(updates,0);
  publisher.dispose();
});

test('a single handle never exceeds R1.2 twelve-update budget',async()=>{
  let updates=0,opens=0;
  const publisher=M.createTaskNoticePublisher({open(){
    opens++;return {ready:Promise.resolve({status:'accepted'}),
      update(){updates++;return Promise.resolve({status:'accepted'});},
      dismiss(){return Promise.resolve({status:'accepted'});}};
  }});
  publisher.publish(id,running,pin);await tick();
  for(let n=0;n<30;n++)publisher.publish(id,running,{...pin,title:'第'+n+'次状态'});
  await tick();
  assert.equal(opens,1);assert.equal(updates,12);
  publisher.dispose();
});
