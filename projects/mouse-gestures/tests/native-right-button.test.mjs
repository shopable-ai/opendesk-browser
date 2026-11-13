import assert from 'node:assert/strict';
import test from 'node:test';
import {NATIVE_ADAPTER,FIXTURE_IDENTITY_FIELDS,createOfflineHoldModel}
  from '../experiments/native-right-button.mjs';

// Deliberately fabricated: these values cannot authorize OS interception.
const binding=Object.freeze(Object.fromEntries(FIXTURE_IDENTITY_FIELDS.map(k=>[k,
  k==='url'?'https://example.test/page':k==='origin'?'https://example.test':`fixture-${k}`])));
const event=(type,at,more={})=>({type,at,x:200,y:200,buttons:type==='rightUp'?0:2,
  source:'physical',authorized:true,binding,...more});
function fixture(options={}){
  const model=createOfflineHoldModel({simulate:true,...options});
  const down=model.step(event('rightDown',0));
  const approve=(more={})=>model.step(event('authorization',80,{generation:down.generation,...more}));
  return {model,down,approve};
}

test('native adapter and ordinary default cannot capture or deliver input',()=>{
  assert.equal(NATIVE_ADAPTER.enabled,false);
  assert.equal(NATIVE_ADAPTER.atomicDocumentDelivery,'NOT_IMPLEMENTED');
  assert.equal(createOfflineHoldModel().step(event('rightDown',0)).decision,'pass');
});

test('short click and sub-intent jitter propose one click at original coordinates, never menu success',()=>{
  for(const jitter of [0,7,11]){
    const {model,approve}=fixture();
    model.step(event('rightDrag',20,{x:200+jitter}));
    assert.equal(model.step(event('rightUp',40,{x:200+jitter})).reason,'fresh-authorization-required');
    const result=approve();
    assert.deepEqual(result.proposal,{kind:'original-click',x:200,y:200});
    assert.equal(result.delivery,'NOT_IMPLEMENTED');
    assert.equal(result.menuVisible,'NOT_TESTED');
    assert.equal(approve().decision,'ignore');
    assert.equal(model.step(event('rightUp',90)).decision,'pass');
  }
});

test('four directions reuse actual segmentation, propose exactly once after release and fresh authorization',()=>{
  for(const [action,x,y] of [['left',120,200],['right',280,200],['up',200,120],['down',200,280]]){
    const {model,approve}=fixture();
    assert.equal(model.step(event('rightDrag',20,{x,y})).decision,'suppress');
    assert.equal(model.inspect().state,'holding');
    model.step(event('rightUp',40,{x,y}));
    assert.equal(model.inspect().state,'awaiting-authorization');
    assert.deepEqual(approve().proposal,{kind:'gesture',action});
    assert.equal(approve().decision,'ignore');
  }
});

test('12px intent alone, short, diagonal, reversed, incomplete and unmapped tracks propose nothing',()=>{
  for(const points of [
    [[212,200]],[[230,200]],[[260,260]],[[120,200],[145,200]],
    [[120,200],[120,220]],[[120,200],[120,280]]
  ]){
    const {model,approve}=fixture();let at=10;
    for(const [x,y] of points)model.step(event('rightDrag',at++,{x,y}));
    const [x,y]=points.at(-1);
    assert.equal(model.step(event('rightUp',40,{x,y})).reason,'no-action');
    assert.equal(approve().decision,'ignore');
  }
});

test('excluded targets, selections and modified clicks pass without holding',()=>{
  for(const more of [{excluded:true},{ctrlKey:true},{altKey:true},{shiftKey:true},
    {metaKey:true},{source:'replay'},{authorized:false},{buttons:3},{binding:null},
    {binding:{...binding,url:'chrome://settings',origin:'chrome://settings'}}]){
    const model=createOfflineHoldModel({simulate:true});
    assert.equal(model.step(event('rightDown',0,more)).decision,'pass');
    assert.notEqual(model.inspect().state,'holding');
  }
});

test('every identity change cancels held sequence, including same-URL document replacement and hit-test drift',()=>{
  for(const field of FIXTURE_IDENTITY_FIELDS){
    const {model,approve}=fixture();
    const changed={...binding,[field]:`changed-${binding[field]}`};
    assert.equal(model.step(event('rightDrag',20,{binding:changed})).reason,'target-or-input-changed');
    assert.equal(model.step(event('rightUp',40,{binding:changed})).reason,'drain-original-up');
    assert.equal(approve().decision,'ignore');
    assert.equal(model.inspect().draining,false);
  }
});

test('cancellation while holding drains the original up; ordinary left/menu/control input still passes',()=>{
  for(const type of ['escape','blur','hidden','off','revoked','navigation','disconnect','timeout',
    'leftDown','middleDown','keyboardMenu','controlClick']){
    const {model,approve}=fixture();
    const result=model.step(event(type,20));
    if(['leftDown','middleDown','keyboardMenu','controlClick'].includes(type))assert.equal(result.decision,'pass');
    assert.equal(model.step(event('rightDrag',30)).reason,'drain-original-drag');
    assert.equal(model.step(event('rightUp',40)).reason,'drain-original-up');
    assert.equal(approve().decision,'ignore');
  }
});

test('pending authorization is invalidated by cancellation or new click; no late proposal',()=>{
  for(const type of ['escape','blur','hidden','off','revoked','navigation','disconnect','timeout','leftDown','rightDown']){
    const {model,approve}=fixture();
    model.step(event('rightDrag',20,{x:120}));
    model.step(event('rightUp',40,{x:120}));
    model.step(event(type,60));
    assert.equal(approve().decision,'ignore');
  }
});

test('fresh denied or changed-document authorization cannot produce even a proposed click',()=>{
  for(const change of [{authorized:false},{binding:{...binding,document:'new-document'}}]){
    const {model,approve}=fixture();model.step(event('rightUp',40));
    assert.equal(approve(change).decision,'cancel');
    assert.equal(approve().decision,'ignore');
  }
});

test('watchdog and lost tap do not replay; missing release and broken sequences stay bounded',()=>{
  const {model,approve}=fixture({maxHoldMs:30});
  assert.equal(model.step(event('rightUp',40)).reason,'watchdog-up');
  assert.equal(model.inspect().draining,false);
  assert.equal(approve().decision,'ignore');
  const lost=fixture();
  assert.equal(lost.model.step(event('tapLost',20)).reason,'tap-lost-no-replay');
  assert.equal(lost.model.inspect().state,'unknown');
  assert.equal(lost.approve().reason,'stream-unknown-recreate-model');
  assert.equal(lost.model.step(event('rightDown',90)).reason,'stream-unknown-recreate-model');
  const broken=fixture();
  assert.equal(broken.model.step(event('rightDown',20)).decision,'suppress');
  assert.equal(broken.model.step(event('rightUp',40)).reason,'drain-original-up');
});

test('OFF, revocation and disconnect close admission for the entire instance',()=>{
  for(const type of ['off','revoked','disconnect']){
    const {model}=fixture();
    model.step(event(type,20));
    model.step(event('rightUp',40));
    assert.equal(model.step(event('rightDown',60)).decision,'pass');
    assert.equal(model.inspect().admissionClosed,true);
  }
});

test('replay release cannot discharge the physical up in cancel, watchdog or validation paths',()=>{
  for(const path of ['escape','watchdog','validation']){
    const {model}=fixture({maxHoldMs:30});
    if(path==='escape')model.step(event('escape',10));
    if(path==='validation')model.step(event('rightDrag',10,{authorized:false}));
    assert.equal(model.step(event('rightUp',40,{source:'replay'})).decision,'pass');
    assert.equal(model.step(event('rightUp',45,{buttons:2})).decision,'suppress');
    assert.equal(model.inspect().draining,true);
    assert.equal(model.step(event('rightUp',50)).decision,'suppress');
    assert.equal(model.inspect().draining,false);
  }
});

test('pending proposal retires on observed invalidation or a broken physical sequence',()=>{
  for(const more of [
    {type:'observation',binding:{...binding,document:'new-document'}},
    {type:'observation',authorized:false},{type:'observation',excluded:true},
    {type:'rightDrag',authorized:false,binding:{...binding,document:'new-document'}},
    {type:'rightUp'}
  ]){
    const {model,approve}=fixture();model.step(event('rightUp',40));
    assert.equal(model.step(event(more.type,60,more)).decision,'cancel');
    assert.equal(approve().decision,'ignore');
  }
});

test('fresh exclusion or modifier evidence rejects both proposed clicks and gestures',()=>{
  for(const drag of [false,true])for(const change of [{excluded:true},{ctrlKey:true}]){
    const {model,approve}=fixture();
    if(drag)model.step(event('rightDrag',20,{x:120}));
    model.step(event('rightUp',40,{x:drag?120:200}));
    assert.equal(approve(change).decision,'cancel');
    assert.equal(approve().decision,'ignore');
  }
});

test('unchanged observations cannot bypass the deadline while holding or awaiting authorization',()=>{
  for(const pending of [false,true]){
    const {model}=fixture({maxHoldMs:30});
    if(pending)model.step(event('rightUp',20));
    assert.equal(model.step(event('observation',30)).reason,'watchdog');
    assert.equal(model.inspect().state,'canceled');
    assert.equal(model.inspect().draining,!pending);
    assert.equal(model.step(event('observation',10000)).decision,'pass');
    if(!pending){
      assert.equal(model.step(event('rightUp',10001)).reason,'drain-original-up');
      assert.equal(model.inspect().draining,false);
    }
  }
});

test('old authorization timestamps cannot cancel or poison a newly held physical sequence',()=>{
  for(const replyAt of [50,100000]){
    const {model,down}=fixture();
    model.step(event('rightUp',40));
    const next=model.step(event('rightDown',60));
    const before=model.inspect();
    assert.equal(model.step(event('authorization',replyAt,{generation:down.generation})).decision,'ignore');
    assert.deepEqual(model.inspect(),before);
    assert.equal(model.step(event('rightDrag',80,{x:120})).reason,'fixture-tracking');
    model.step(event('rightUp',100,{x:120}));
    assert.deepEqual(model.step(event('authorization',120,{generation:next.generation})).proposal,
      {kind:'gesture',action:'left'});
  }
});

test('counterexample: target.current check then PID dispatch can reach a new same-URL document',()=>{
  const original={...binding};
  const checked={...original};
  assert.equal(checked.document,original.document); // successful snapshot check
  const recipientAtPost={...checked,document:'same-url-new-document'};
  assert.equal(recipientAtPost.pid,original.pid);
  assert.equal(recipientAtPost.nativeWindow,original.nativeWindow);
  assert.equal(recipientAtPost.tab,original.tab);
  assert.equal(recipientAtPost.url,original.url);
  assert.notEqual(recipientAtPost.document,original.document);
  // Even a valid offline proposal supplies no atomic delivery capability.
  const {model,approve}=fixture();model.step(event('rightUp',40));
  assert.equal(approve().delivery,'NOT_IMPLEMENTED');
  assert.equal(NATIVE_ADAPTER.enabled,false);
});
