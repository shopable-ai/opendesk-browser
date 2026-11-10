import test from 'node:test';
import assert from 'node:assert/strict';
import {registerPageStatus} from '../src/page/status.js';

function fixture({inspectError,layoutError}={}){
  let handler,dispose,active=true,placed=true,stopped=0;
  const snap={ok:true,route:'c/12345678',draft:'private draft'};
  registerPageStatus({bridge:{onRequest(fn){handler=fn;return ()=>stopped++;}},
    owner:{active:()=>active,onDispose(fn){dispose=fn;}},
    site:{inspect:()=>{if(inspectError)throw inspectError;return snap;}},
    view:{isPlaced:()=>{if(layoutError)throw layoutError;return placed;}},version:'0.1.26'});
  return {snap,read:payload=>handler({operation:'queue.status',payload:payload??{}}),
    invoke:request=>handler(request),hide(){placed=false;},
    stop(){active=false;dispose();},stopped:()=>stopped};
}
test('health reports only placed UI and conversation readiness without private content',()=>{
  const h=fixture();
  assert.deepEqual(h.read(),{status:'ready',version:'0.1.26'});
  h.snap.route=null;h.snap.newConversation=true;
  assert.deepEqual(h.read(),{status:'new-conversation',version:'0.1.26'});
  h.hide();assert.equal(h.read().status,'composer-unavailable');
  h.snap.ok=false;assert.equal(h.read().status,'composer-unavailable');
  assert.equal(h.snap.draft,'private draft');
});
test('dispose unregisters the handler and stale callbacks cannot report ready',()=>{
  const h=fixture();h.stop();assert.equal(h.stopped(),1);
  assert.deepEqual(h.read(),{status:'stopped',version:'0.1.26'});
});
test('status channel rejects queue controls and unexpected payload fields',()=>{
  const h=fixture();
  for(const request of [{operation:'remove',payload:{}},{operation:'queue.status',payload:[]},
    {operation:'queue.status',payload:{id:'q1'}}])assert.throws(()=>h.invoke(request));
});
for(const [stage,option] of [['INSPECT','inspectError'],['LAYOUT','layoutError']]){
  test(`probe ${stage} failure is explicit and does not disclose exception text`,()=>{
    const h=fixture({[option]:Error('private draft and exception details')});
    assert.throws(()=>h.read(),error=>error.code==='E_QUEUE_STATUS_'+stage&&
      error.message.includes(stage)&&!error.message.includes('private'));
    assert.equal(h.snap.draft,'private draft');
  });
}
