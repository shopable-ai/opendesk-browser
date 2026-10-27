import test from 'node:test';
import assert from 'node:assert/strict';
import {showChatGPTExecutionPage} from '../../src/native-agent/chatgpt-execution-page.js';

function harness(){
  const target={tabId:42,frameId:0,documentId:'target-document',mode:'owned',
    allowedOrigin:'http://127.0.0.1:43111',targetSessionId:'session',targetVersion:1};
  const frame={tabId:42,frameId:0,documentId:target.documentId,
    documentLifecycle:'active',url:'http://127.0.0.1:43111/demo-form.html'};
  const run={runId:'run-exact',state:'running',target},updates=[];
  const host={currentRun:run.runId};let permission=true,active=true,onFrames=()=>{};
  const events=[];
  const event=()=>{const listeners=new Set();events.push(listeners);return {
    addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),
    emit:(...args)=>{for(const fn of listeners)fn(...args);}};};
  const navigation=event();
  const api={tabs:{get:async()=>({id:42,url:frame.url,incognito:false}),
    update:async(id,options)=>{updates.push({id,...options});return {id,url:frame.url,active:true};},
    onRemoved:event(),onDetached:event(),onReplaced:event()},
    webNavigation:{getAllFrames:async()=>{onFrames();return [frame];},onBeforeNavigate:navigation,onCommitted:event()},
    permissions:{contains:async()=>permission}};
  const client={controller:{snapshotControllerRun:async()=>({run})}};
  const args={api,client,host,runId:run.runId,assertActive:async()=>{
    if(!active)throw Object.assign(new Error('source revoked'),{code:'E_BRIDGE_REVOKED'});
  }};
  return {args,run,frame,host,updates,deny:()=>{permission=false;},cancel:()=>{active=false;},
    onFrames:fn=>{onFrames=fn;},navigation,events};
}
test('view activates only the Authority-owned running target without creating or navigating a tab',async()=>{
  const h=harness();
  assert.deepEqual(await showChatGPTExecutionPage(h.args),{runId:'run-exact',tabId:42,shown:true});
  assert.deepEqual(h.updates,[{id:42,active:true}]);
  assert.ok(h.events.every(listeners=>listeners.size===0));
});
test('view refuses completed, unrelated, borrowed, replaced and revoked targets before activation',async()=>{
  for(const kind of ['completed','unrelated','borrowed','document','permission','cancel']){
    const h=harness();
    if(kind==='completed')h.run.state='completed';
    if(kind==='unrelated')h.host.currentRun='other-run';
    if(kind==='borrowed')h.run.target.mode='borrowed';
    if(kind==='document')h.frame.documentId='replacement';
    if(kind==='permission')h.deny();
    if(kind==='cancel')h.cancel();
    await assert.rejects(showChatGPTExecutionPage(h.args),undefined,kind);
    assert.deepEqual(h.updates,[],kind);
  }
});
test('view rechecks settlement and cancellation after asynchronous browser observation',async()=>{
  for(const cancel of [false,true]){
    const h=harness();h.onFrames(()=>{if(cancel)h.cancel();else h.run.state='completed';});
    await assert.rejects(showChatGPTExecutionPage(h.args));assert.deepEqual(h.updates,[]);
  }
});
test('view refuses a target document changed while observing the browser',async()=>{
  const h=harness();h.onFrames(()=>{h.run.target.documentId='new-document';});
  await assert.rejects(showChatGPTExecutionPage(h.args));assert.deepEqual(h.updates,[]);
});
test('same-URL reload during the final asynchronous authorization check cannot activate the replacement',async()=>{
  for(const committed of [false,true]){
    const h=harness();let checks=0;
    h.args.assertActive=async()=>{
      if(++checks===3){
        h.navigation.emit({tabId:42,frameId:0,url:h.frame.url});
        if(committed)h.frame.documentId='same-url-new-document';
      }
    };
    await assert.rejects(showChatGPTExecutionPage(h.args));
    assert.deepEqual(h.updates,[]);
    assert.ok(h.events.every(listeners=>listeners.size===0));
  }
});
