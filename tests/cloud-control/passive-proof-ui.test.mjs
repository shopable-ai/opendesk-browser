import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';

// COMPONENT only. HTTP responses are isolated observations, not a live Run.
const base=new URL('../../examples/cloud-control/mac24dev-demo/',import.meta.url);
const html=readFileSync(new URL('proof.html',base),'utf8');
const code=readFileSync(new URL('proof.js',base),'utf8');
const snapshot=()=>({sessionId:'11111111-1111-4111-8111-111111111111',
  proofLevel:'PASSIVE_ONLY',nativeIdentity:'NOT_OBSERVED',task:{taskId:'sample.form-fill',version:'1.0.0',
    manifestHash:'57598844f11f75d7566c5adeab283a3aaed0614d151590a6f34124e7abf3632a',
    sourceHash:'1f72cf17aa04e8a8597ef43e554ae5507f9da58b73e46d731373cd318f6dcf63'},documents:[]});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(answer){
  const {window,document}=parseHTML(html),calls=[],$=id=>document.getElementById(id);
  runInNewContext(code,{document,AbortController,setTimeout,clearTimeout,fetch:async(path,options)=>{
    calls.push({path,options});
    const data=await answer();return {ok:true,json:async()=>data};
  }});
  const submit=async()=>{$('proof-form').dispatchEvent(new window.Event('submit',{cancelable:true}));await tick();};
  const input=value=>{$('proof-name').value=value;$('proof-name').dispatchEvent(new window.Event('input'));};
  return {$,calls,submit,input,leave:()=>window.dispatchEvent(new window.Event('pagehide'))};
}

test('manual lookup preserves exact name and never calls submit/status/cancel or displays an empty match as success',async()=>{
  const f=fixture(snapshot);
  assert.equal(f.calls.length,0,'opening the page must not query or run anything');
  f.input(' Alice ');await f.submit();
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].path,'/__opendesk_cloud_proof/query');
  assert.deepEqual(JSON.parse(f.calls[0].options.body),{name:' Alice '});
  assert.equal(f.calls[0].options.credentials,'omit');
  assert.match(f.$('proof-summary').textContent,/没有匹配记录/);
  assert.match(f.$('proof-summary').textContent,/不要重新提交/);
});

test('duplicate submits and incomplete sequence stay visible; page text cannot execute as markup',async()=>{
  const data=snapshot();data.documents=[{documentInstance:'22222222-2222-4222-8222-222222222222',
    htmlSha256:'f'.repeat(64),submitCount:2,matchingSubmitCount:2,sequenceContinuous:false,
    events:[{eventSeq:2,receiveSeq:2,type:'submit',matchesName:true,done:null,completionRedacted:true},
      {eventSeq:3,receiveSeq:3,type:'done',at:'2026-10-30T08:00:00Z',receivedAt:'2026-10-30T08:00:00Z',
      matchesName:true,done:'<img src=x onerror=alert(1)>'}]}];
  const f=fixture(()=>data);f.input('Alice');await f.submit();
  assert.match(f.$('proof-documents').textContent,/全部提交：2 次/);
  assert.match(f.$('proof-documents').textContent,/不完整/);
  assert.match(f.$('proof-documents').textContent,/不一致，已隐藏/);
  assert.equal(f.$('proof-documents').querySelector('img'),null);
  assert.match(f.$('proof-documents').textContent,/<img/);
});

test('a response for another fixed source is rejected instead of rendered as the original package',async()=>{
  const data=snapshot();data.task.sourceHash='b'.repeat(64);
  const f=fixture(()=>data);f.input('Alice');await f.submit();
  assert.equal(f.$('proof-result').hidden,true);
  assert.match(f.$('proof-status').textContent,/未能确认/);
});

test('exact frozen packages render their own identity; mixed or unknown pins fail closed',async()=>{
  const tasks=[
    JSON.parse(readFileSync(new URL('../../tasks/form-fill.v1.opendesk-task.json',base),'utf8')),
    JSON.parse(readFileSync(new URL('form-fill.v1.0.1.opendesk-task.json',base),'utf8')),
    JSON.parse(readFileSync(new URL('form-fill.v1.0.2.opendesk-task.json',base),'utf8')),
  ].map(pkg=>({taskId:pkg.manifest.taskId,version:pkg.manifest.version,
    manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash}));
  for(const task of tasks){
    const f=fixture(()=>({...snapshot(),task}));f.input('Alice');await f.submit();
    assert.equal(f.$('proof-result').hidden,false);
    assert.deepEqual(JSON.parse(f.$('proof-identity').textContent).task,task);
  }
  for(const task of [
    {...tasks[1],version:'1.0.0'},
    {...tasks[1],manifestHash:tasks[0].manifestHash},
    {...tasks[1],sourceHash:tasks[0].sourceHash},
    {...tasks[1],version:'1.0.2'},
    {...tasks[2],version:'1.0.1'},
    {...tasks[2],version:'1.0.3'},
    {...tasks[1],taskId:'other.task'},
    {...tasks[1],sourceHash:'a'.repeat(64)},
  ]){
    const f=fixture(()=>({...snapshot(),task}));f.input('Alice');await f.submit();
    assert.equal(f.$('proof-result').hidden,true);
    assert.equal(f.$('proof-identity').textContent,'');
  }
});

test('changing the input invalidates a pending observation; failures clear the previous result',async()=>{
  let resolve;
  const pending=new Promise(r=>{resolve=r;});
  const f=fixture(()=>pending);f.input('Alice');await f.submit();
  f.input('Bob');resolve(snapshot());await tick();
  assert.equal(f.$('proof-result').hidden,true);
  assert.equal(f.$('proof-identity').textContent,'');
  let rejected=false;
  const g=fixture(()=>{if(rejected)throw Error('private diagnostic');return snapshot();});
  g.input('Alice');await g.submit();assert.equal(g.$('proof-result').hidden,false);
  rejected=true;await g.submit();
  assert.equal(g.$('proof-result').hidden,true);
  assert.equal(g.$('proof-identity').textContent,'');
  assert.doesNotMatch(g.$('proof-status').textContent,/private diagnostic/);
});


test('leaving the observation page clears private results and invalidates late responses',async()=>{
  const f=fixture(snapshot);f.input('Alice');await f.submit();
  assert.equal(f.$('proof-result').hidden,false);
  f.leave();
  assert.equal(f.$('proof-result').hidden,true);
  assert.equal(f.$('proof-identity').textContent,'');
  assert.doesNotMatch(f.$('proof-status').textContent,/已读取/);
  let resolve;
  const g=fixture(()=>new Promise(r=>{resolve=r;}));g.input('Alice');await g.submit();
  g.leave();resolve(snapshot());await tick();
  assert.equal(g.$('proof-result').hidden,true);
  assert.equal(g.$('proof-session').textContent,'');
  assert.doesNotMatch(g.$('proof-status').textContent,/已读取/);
});

test('redacted or non-boolean matches never reveal completion text',async()=>{
  for(const flags of [{matchesName:true,completionRedacted:true},{matchesName:'true'},{}]){
    const data=snapshot();data.documents=[{documentInstance:'document',htmlSha256:'f'.repeat(64),
      submitCount:1,matchingSubmitCount:1,sequenceContinuous:true,
      events:[{eventSeq:1,receiveSeq:1,type:'done',...flags,done:'other-private-name'}]}];
    const f=fixture(()=>data);f.input('Alice');await f.submit();
    assert.doesNotMatch(f.$('proof-documents').textContent,/other-private-name/);
  }
});

test('identity details project only the reviewed task fields',async()=>{
  const data=snapshot();data.task.error={stack:'private diagnostic',token:'private credential'};
  const f=fixture(()=>data);f.input('Alice');await f.submit();
  assert.equal(f.$('proof-result').hidden,false);
  assert.deepEqual(JSON.parse(f.$('proof-identity').textContent).task,snapshot().task);
  assert.doesNotMatch(f.$('proof-identity').textContent,/private/);
});
