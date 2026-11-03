import test from 'node:test';
import assert from 'node:assert/strict';
import {createGenericTaskAdapter} from '../../src/page-events/generic-task-adapter.js';
import {startSiteRuntime} from '../../src/page-events/content-runtime.js';

const valid=JSON.stringify({protocol:'webflow.task.intent.v1',candidateId:'candidate-123',
  taskId:'search',targetUrl:'https://example.com/',args:{query:'OpenDesk'}});
function event(detail){const e=new Event('opendesk:task-intent');Object.defineProperty(e,'detail',{value:detail});return e;}

test('generic event yields only a validated candidate, and disposal ends observation',()=>{
  const win=new EventTarget(),seen=[];
  const adapter=createGenericTaskAdapter({win,onCandidate:candidate=>seen.push(candidate)});
  const session=adapter.start({profile:{protocols:['webflow.task.intent.v1']}});
  win.dispatchEvent(event(valid));
  assert.equal(seen.length,1);assert.equal(seen[0].taskId,'search');
  win.dispatchEvent(event('{"protocol":"webflow.task.intent.v1"}'));
  win.dispatchEvent(event({text:valid}));
  win.dispatchEvent(event(valid.replace('"taskId":"search"','"taskId":"search","taskId":"other"')));
  assert.equal(seen.length,1);
  session.dispose();win.dispatchEvent(event(valid));assert.equal(seen.length,1);
});


test('two ordinary site profiles use the same real generic observer',()=>{
  const profiles=['a','b'].map(id=>({id,version:'1.0.0',origin:`https://${id}.test`,
    adapter:'generic',adapterVersion:'1.0.0',protocols:['webflow.task.intent.v1'],enabled:true}));
  for(const profile of profiles){
    const win=new EventTarget();win.top=win;win.location={href:profile.origin+'/page'};
    const seen=[];
    const adapter=createGenericTaskAdapter({win,onCandidate:value=>seen.push(value)});
    const session=startSiteRuntime({win,profiles,adapters:{generic:adapter},protocolIds:['webflow.task.intent.v1']});
    win.dispatchEvent(event(valid));
    assert.equal(seen.length,1);assert.equal(seen[0].candidateId,'candidate-123');
    session.dispose();
  }
});


test('a profile that does not list the intent protocol cannot observe it',()=>{
  const win=new EventTarget(),seen=[];
  const session=createGenericTaskAdapter({win,onCandidate:value=>seen.push(value)})
    .start({profile:{protocols:['other.protocol.v1']}});
  win.dispatchEvent(event(valid));assert.equal(seen.length,0);session.dispose();
});

test('one document cannot have two generic listeners in this runtime, and can restart after dispose',()=>{
  const win=new EventTarget(),seen=[];
  const first=createGenericTaskAdapter({win,onCandidate:value=>seen.push(value)});
  const second=createGenericTaskAdapter({win,onCandidate:value=>seen.push(value)});
  const context={profile:{protocols:['webflow.task.intent.v1']}};
  const session=first.start(context);
  assert.throws(()=>first.start(context),{code:'E_SITE_ADAPTER_ACTIVE'});
  assert.throws(()=>second.start(context),{code:'E_SITE_ADAPTER_ACTIVE'});
  win.dispatchEvent(event(valid));assert.equal(seen.length,1);
  session.dispose();session.dispose();
  const restarted=second.start(context);
  win.dispatchEvent(event(valid));assert.equal(seen.length,2);
  restarted.dispose();
});
