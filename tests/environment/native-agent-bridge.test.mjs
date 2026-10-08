import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeAgentService} from '../../src/native-agent/service-worker.js';
import {AGENT_LEDGER_KEY,AGENT_ENABLED_KEY} from '../../src/native-agent/protocol.js';

const drain=()=>new Promise(resolve=>setTimeout(resolve,0));
function mock(){
  const stored={[AGENT_ENABLED_KEY]:true}, requests=[],responses=[];
  let native;
  const event=()=>{const listeners=new Set();return {
    addListener:l=>listeners.add(l),removeListener:l=>listeners.delete(l),fire:(...args)=>{for(const l of listeners)l(...args);}
  };};
  const api={
    runtime:{id:'abcdefghijklmnopabcdefghijklmnop',getManifest:()=>({version:'0.1.0'}),
      connectNative:()=>{native={onMessage:event(),onDisconnect:event(),
        postMessage:msg=>responses.push(msg),disconnect(){this.onDisconnect.fire();}};return native;}},
    permissions:{contains:async()=>true,onRemoved:event()},
    storage:{local:{get:async key=>({[key]:structuredClone(stored[key])}),
      set:async values=>Object.assign(stored,structuredClone(values))}}
  };
  const port={registrationId:'registration-1',postMessage:msg=>requests.push(msg)};
  const hostPorts=new Map([['doc-1',port]]);
  const service=createNativeAgentService({api,hostPorts});
  return {api,stored,requests,responses,port,hostPorts,service,native:()=>native};
}
const message=(requestId,method,params={})=>({v:1,kind:'request',requestId,method,params});
test('bridge remains disabled before explicit settings permission and storage opt-in',async t=>{
  const f=mock();t.after(()=>f.service.dispose());
  await f.service.ready;
  assert.ok(f.native());
  f.native().onMessage.fire({v:1,kind:'hello'});
  assert.equal(f.responses[0].kind,'welcome');
  f.native().onMessage.fire(message('s1','bridge.status'));
  await drain();assert.equal(f.responses.at(-1).result.nativeConnected,true);
});
test('request hash journal deduplicates after real Host admission; conflicting bytes fail',async t=>{
  const f=mock();t.after(()=>f.service.dispose());await f.service.ready;
  f.native().onMessage.fire({v:1,kind:'hello'});
  const payload={registrationId:'registration-1',source:{kind:'draft',sourceUtf8:'async function main(){}'},
    target:{windowId:1,tabId:2,frameId:0,documentId:'d',url:'https://example.test',origin:'https://example.test'},
    params:{}};
  f.native().onMessage.fire(message('call-1','run.start',payload));
  await drain();await drain();
  assert.equal(f.requests.length,1);
  const forwarded=f.requests[0];
  f.service.acceptHostResponse(f.port,{type:'native-agent.response',registrationId:'registration-1',
    requestId:forwarded.request.requestId,result:{runId:'run-1',state:'running'}});
  await drain();await drain();
  assert.equal(f.responses.at(-1).result.runId,'run-1');
  assert.equal(f.stored[AGENT_LEDGER_KEY]['call-1'].runId,'run-1');
  f.native().onMessage.fire(message('call-1','run.start',payload));
  await drain();await drain();
  assert.equal(f.requests.length,1,'identical call never executes twice');
  assert.equal(f.responses.at(-1).result.runId,'run-1');
  f.native().onMessage.fire(message('call-1','run.start',{...payload,source:{kind:'draft',sourceUtf8:'DIFFERENT'}}));
  await drain();await drain();
  assert.equal(f.responses.at(-1).error.code,'E_REQUEST_CONFLICT');
});
test('dispatched but unanswered calls are never retried, even if same id reappears',async t=>{
  const f=mock();t.after(()=>f.service.dispose());await f.service.ready;f.native().onMessage.fire({v:1,kind:'hello'});
  const p={registrationId:'registration-1',scriptId:'s',sourceUtf8:'async function main(){}',expectedRevision:0};
  f.native().onMessage.fire(message('save-1','script.save',p));
  await drain();await drain();assert.equal(f.requests.length,1);
  f.native().onDisconnect.fire();
  f.native().onMessage.fire(message('save-1','script.save',p));
  await drain();assert.equal(f.requests.length,1);
  assert.equal(f.stored[AGENT_LEDGER_KEY]['save-1'].state,'OUTCOME_UNKNOWN');
});
test('no live registered Host means no run reservation or Worker execution',async t=>{
  const f=mock();t.after(()=>f.service.dispose());await f.service.ready;f.native().onMessage.fire({v:1,kind:'hello'});
  f.hostPorts.clear();
  f.native().onMessage.fire(message('n1','run.start',{source:{kind:'draft',sourceUtf8:'x'},params:{}}));
  await drain();assert.equal(f.responses.at(-1).error.code,'E_HOST_NOT_READY');
  assert.equal(f.stored[AGENT_LEDGER_KEY],undefined);
});
test('run.get and run.stop cannot inspect arbitrary Sidebar-owned Run records',async t=>{
  const f=mock();t.after(()=>f.service.dispose());await f.service.ready;f.native().onMessage.fire({v:1,kind:'hello'});
  f.native().onMessage.fire(message('peek','run.get',{runId:'UI-OWNED'}));
  await drain();assert.equal(f.responses.at(-1).error.code,'E_PERMISSION');
  assert.equal(f.requests.length,0);
});
