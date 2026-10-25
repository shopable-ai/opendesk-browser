import test from 'node:test';
import assert from 'node:assert/strict';
import {createQueueEngine} from '../src/engine.js';

function fixture() {
  const state={now:0,route:'c/12345678-1234-1234-1234-123456789abc',
    busy:true,complete:false,answers:1,users:0,ack:false,clicks:0,
    prepareCount:0,replyAllowed:true,replyChecks:[],failClick:false,failStop:false,stops:0,changed:false,draft:''};
  const userNodes=[],assistantNodes=[];
  const nodes=(cache,count)=>Array.from({length:count},(_,i)=>cache[i]??={id:i});
  const site={
    normal:x=>String(x??'').trim(),
    inspect:()=>state.changed?{ok:false,reason:'目标网页已变化'}:{
      ok:true,route:state.route,busy:state.busy,idle:!state.busy,
      rich:false,draft:state.draft,stopButton:{},answerComplete:state.complete,
      users:nodes(userNodes,state.users),assistants:nodes(assistantNodes,state.answers)},
    prepare:(text,snapshot)=>{
      assert.equal(snapshot.route,state.route);
      state.prepareCount++;
      return {ok:true,token:{text,route:snapshot.route,before:{
        route:snapshot.route,assistantCount:state.answers,
        users:snapshot.users,assistants:snapshot.assistants
      }}};
    },
    commit:token=>{
      state.clicks++;
      if(state.failClick)return {ok:false,stage:'after-click'};
      return {ok:true,before:token.before};
    },
    confirm:()=>state.ack,
    replyComplete:(before,confirmedUser,snapshot)=>{
      state.replyChecks.push({before,confirmedUser,snapshot});
      return state.replyAllowed && snapshot.users.length===before.users.length+1 &&
        snapshot.users.at(-1)===confirmedUser &&
        snapshot.assistants.length===before.assistants.length+1 &&
        snapshot.answerComplete && !snapshot.busy;
    },
    stop:()=>{state.stops++;if(state.throwStop)throw new Error('stop result unknown');return !state.failStop;}
  };
  const engine=createQueueEngine({site,clock:()=>state.now});
  const step=(t,patch={})=>{Object.assign(state,patch);state.now=t;engine.tick();};
  return {state,site,engine,step};
}

test('two queued messages require separate assistant completion gates and each message acknowledgement',()=>{
  const {state,engine,step}=fixture();
  assert.equal(engine.enqueue('first',state.route),true);
  assert.equal(engine.enqueue('second',state.route),true);
  step(0);
  assert.equal(state.clicks,0);
  step(100,{busy:false,complete:true});
  step(1300);
  assert.equal(state.prepareCount,1);
  assert.equal(state.clicks,0);
  step(2000);
  assert.equal(state.clicks,1);
  step(2100,{ack:true,users:1});
  assert.equal(engine.view().items.length,1);
  step(2300,{ack:false,busy:true,complete:false});
  step(3100,{busy:false,complete:true,answers:2});
  step(4500);
  assert.equal(state.clicks,1);
  step(5700);
  assert.equal(state.prepareCount,2);
  step(6400);
  assert.equal(state.clicks,2);
  step(6600,{ack:true,users:2});
  assert.equal(engine.view().items.length,0);
  assert.equal(engine.view().lastConfirmed,'q2');
});
test('unknown post-click outcome remains queued without auto-retry',()=>{
  const {state,engine,step}=fixture();
  engine.enqueue('potential duplicate',state.route);
  step(100,{busy:false,complete:true});
  step(1400);
  step(2100,{failClick:true});
  assert.equal(state.clicks,1);
  assert.equal(engine.view().items[0].state,'unknown');
  assert.equal(engine.view().paused,true);
  assert.equal(engine.resume(),false);
  step(10000);
  assert.equal(state.clicks,1);
});
test('a replaced editor or navigation pauses without sending',()=>{
  const {state,engine,step}=fixture();
  engine.enqueue('original conversation only',state.route);
  step(100,{busy:false,complete:true});
  step(1400,{changed:true});
  assert.equal(state.clicks,0);
  assert.equal(engine.view().paused,true);
});
test('acknowledgement timeout never causes duplicate click',()=>{
  const {state,engine,step}=fixture();
  engine.enqueue('one',state.route);
  step(100,{busy:false,complete:true});
  step(1400);
  step(2100);
  step(19000);
  assert.equal(state.clicks,1);
  assert.equal(engine.view().paused,true);
  assert.equal(engine.view().items[0].state,'unknown');
});

test('edit reclaims just the selected queued item without sending it',()=>{
  const {state,engine,step}=fixture();
  assert.equal(engine.enqueue('message A',state.route),true);
  assert.equal(engine.enqueue('message B',state.route),true);
  assert.equal(engine.reclaim('q1'),true);
  assert.deepEqual(engine.view().items.map(x=>x.text),['message B']);
  assert.equal(engine.reclaim('q1'),false);
  assert.equal(state.clicks,0,'reclaim must not invoke the website send button');
  step(100);
  assert.equal(state.clicks,0,'remaining queue stays waiting during assistant reply');
});
test('reclaim of the only item empties the queue without a hidden editor mode',()=>{
  const {state,engine}=fixture();
  engine.enqueue('only message',state.route);
  assert.equal(engine.reclaim('q1'),true);
  assert.deepEqual(engine.view().items,[]);
  assert.equal(engine.view().route,null);
  assert.equal(engine.view().editing,undefined);
  assert.equal(state.clicks,0);
});
test('sending and unknown-outcome messages cannot be reclaimed as editable drafts',()=>{
  const {state,engine,step}=fixture();
  engine.enqueue('maybe sent',state.route);
  step(100,{busy:false,complete:true});
  step(1400);
  assert.equal(engine.reclaim('q1'),false,'prepared/in-flight message must stay queued');
  step(2100,{failClick:true});
  assert.equal(engine.view().items[0].state,'unknown');
  assert.equal(engine.reclaim('q1'),false,'potential duplicate must not be reclaimed');
  assert.equal(engine.view().items[0].text,'maybe sent');
  assert.equal(state.clicks,1);
});

test('pause before native commit blocks clicks until explicit resume',()=>{
  const {state,engine,step}=fixture();
  engine.enqueue('one',state.route);
  step(100,{busy:false,complete:true});
  step(1400);
  engine.pause();
  step(2100);
  assert.equal(state.clicks,0);
  assert.equal(engine.view().inFlight.phase,'await-native-ready');
  assert.equal(engine.resume(),true);
  step(2200);
  assert.equal(state.clicks,1);
});

test('returning to original conversation cannot bypass the navigation pause',()=>{
  const {state,engine,step}=fixture(),route=state.route;
  engine.enqueue('one',route);
  step(100,{busy:false,complete:true});
  step(1400);
  step(2000,{route:'c/another-conversation'});
  step(2100,{route});
  assert.equal(state.clicks,0);
  assert.equal(engine.view().paused,true);
});

test('paused post-click flight still reads confirmation without sending the next item',()=>{
  const {state,engine,step}=fixture();
  engine.enqueue('one',state.route);
  engine.enqueue('two',state.route);
  step(100,{busy:false,complete:true});
  step(1400);
  step(2100);
  engine.pause();
  step(2200,{ack:true,users:1});
  assert.equal(engine.view().lastConfirmed,'q1');
  assert.equal(engine.view().paused,true);
  assert.deepEqual(engine.view().items.map(item=>item.id),['q2']);
  step(2300,{ack:false,answers:2});
  step(3600);
  step(5000);
  assert.equal(state.prepareCount,1);
  assert.equal(state.clicks,1);
});

for(const unavailable of [null,'navigation','editor']) {
  test(`paused post-click timeout remains unknown without retry (${unavailable||'original page'})`,()=>{
    const {state,engine,step}=fixture();
    engine.enqueue('one',state.route);
    step(100,{busy:false,complete:true});
    step(1400);
    step(2100);
    engine.pause();
    step(19000,unavailable==='navigation'?{route:'c/another-conversation'}:
      unavailable==='editor'?{changed:true}:{});
    assert.equal(engine.view().items[0].state,'unknown');
    assert.equal(engine.resume(),false);
    assert.equal(engine.requestNow('q1').ok,false);
    step(20000);
    assert.equal(state.clicks,1);
  });
}

for(const draft of ['user text',' ','\n','\u00a0']) {
  test(`native draft ${JSON.stringify(draft)} blocks automatic preparation`,()=>{
    const {state,engine,step}=fixture();
    engine.enqueue('one',state.route);
    step(100,{busy:false,complete:true,draft});
    step(1400);
    assert.equal(state.prepareCount,0);
    assert.equal(state.clicks,0);
    step(2000,{draft:''});
    step(3200);
    assert.equal(state.prepareCount,1);
  });
}

test('force-stop completion also preserves a whitespace native draft',()=>{
  const {state,engine,step}=fixture();
  engine.enqueue('one',state.route);
  assert.equal(engine.confirmForceStop('q1'),true);
  step(100,{busy:false,complete:true,draft:' '});
  step(1400);
  assert.equal(state.prepareCount,0);
  assert.equal(state.clicks,0);
  assert.equal(engine.view().items.length,1);
});

test('unknown stop stays attached to its item and locks every send entry',()=>{
  const {state,engine,step}=fixture();
  engine.enqueue('one',state.route);
  state.failStop=true;
  assert.equal(engine.confirmForceStop('q1'),false);
  assert.deepEqual(engine.view().inFlight,{id:'q1',phase:'unknown'});
  assert.equal(engine.view().items[0].state,'unknown');
  assert.equal(engine.view().phase,'unknown');
  assert.equal(engine.resume(),false);
  step(100,{busy:false,complete:true});
  assert.equal(engine.requestNow('q1').ok,false);
  step(1400);
  assert.equal(state.prepareCount,0);
  state.busy=true;
  state.failStop=false;
  assert.equal(engine.confirmForceStop('q1'),false);
  assert.equal(state.stops,1);
  assert.equal(state.clicks,0);
});

for(const deleteRemaining of [false,true]) {
  test(`empty queue retains the next assistant gate (${deleteRemaining?'delete remaining':'last item confirmed'})`,()=>{
    const {state,engine,step}=fixture(),route=state.route;
    engine.enqueue('one',route);
    if(deleteRemaining)engine.enqueue('discard',route);
    step(100,{busy:false,complete:true});
    step(1400);
    step(2100);
    step(2200,{ack:true,users:1});
    if(deleteRemaining)assert.equal(engine.remove('q2'),true);
    assert.equal(engine.view().items.length,0);
    assert.equal(engine.view().route,route);
    assert.ok(engine.view().answerGate);
    engine.enqueue('new item',route);
    step(2300,{ack:false});
    step(4000);
    step(5300);
    assert.equal(state.clicks,1,'old completed assistant cannot release a new send');
    assert.equal(state.prepareCount,1);
    assert.equal(engine.requestNow(deleteRemaining?'q3':'q2').ok,false);
    step(6000,{answers:2});
    step(7200);
    step(8400);
    step(8500);
    assert.equal(state.clicks,2,'a distinct completed assistant releases the next item');
  });
}

test('an empty answer gate releases its conversation only after the new answer completes',()=>{
  const {state,engine,step}=fixture(),route=state.route;
  engine.enqueue('one',route);
  step(100,{busy:false,complete:true});
  step(1400);
  step(2100);
  step(2200,{ack:true,users:1});
  assert.equal(engine.enqueue('wrong route','c/another-conversation'),false);
  step(2300,{ack:false,answers:2});
  step(3500);
  assert.equal(engine.view().answerGate,null);
  assert.equal(engine.view().route,null);
  assert.equal(engine.view().paused,true,'completion must not undo a prior safety pause');
  assert.equal(state.clicks,1);
});

for(const throws of [false,true]) {
  test(`unknown stop of nonhead item permits checked deletion but leaves other items paused (${throws?'throw':'false'})`,()=>{
    const {state,engine,step}=fixture();
    engine.enqueue('first',state.route);
    engine.enqueue('selected',state.route);
    state.failStop=true;
    state.throwStop=throws;
    assert.equal(engine.confirmForceStop('q2'),false);
    assert.deepEqual(engine.view().inFlight,{id:'q2',phase:'unknown'});
    assert.deepEqual(engine.view().items.map(item=>item.state),['queued','unknown']);
    assert.equal(engine.resume(),false);
    assert.equal(engine.remove('q2'),true,'the UI requires manual website check before this deletion');
    assert.equal(engine.view().paused,true);
    assert.equal(engine.view().phase,'waiting');
    step(100,{busy:false,complete:true});
    step(1400);
    assert.equal(state.clicks,0);
    assert.equal(state.prepareCount,0);
    assert.equal(engine.resume(),true,'only explicit recovery after checked deletion can proceed');
    step(1500);
    step(2700);
    step(2800);
    assert.equal(state.clicks,1);
  });
}

function confirmFirst(f) {
  f.engine.enqueue('first',f.state.route);
  f.engine.enqueue('second',f.state.route);
  f.step(100,{busy:false,complete:true});
  f.step(1400);
  f.step(2100);
  const before=f.engine.view().inFlight;
  assert.equal(before.phase,'await-confirm');
  const snapshot=f.site.inspect();
  f.step(2200,{ack:true,users:f.state.users+1});
  return snapshot;
}

test('another user turn cannot release the confirmed message reply gate',()=>{
  const f=fixture();
  confirmFirst(f);
  f.step(2300,{ack:false,users:2,answers:2});
  f.step(4000);
  f.step(5300);
  f.step(5400);
  assert.ok(f.engine.view().answerGate,'unrelated completed reply must keep the gate');
  assert.equal(f.state.prepareCount,1);
  assert.equal(f.state.clicks,1);
  assert.equal(f.engine.requestNow('q2').ok,false);
});

test('only this turn completion followed by stable idle releases the next send',()=>{
  const f=fixture();
  confirmFirst(f);
  f.step(2300,{ack:false,answers:2,replyAllowed:false});
  f.step(4000);
  f.step(5300);
  assert.ok(f.engine.view().answerGate);
  assert.equal(f.state.prepareCount,1);
  f.step(6000,{replyAllowed:true});
  f.step(7000);
  assert.ok(f.engine.view().answerGate,'completion still needs stable idle');
  f.step(7100,{busy:true});
  f.step(7200,{busy:false});
  f.step(8200);
  assert.ok(f.engine.view().answerGate,'busy must reset the idle timer');
  f.step(8300);
  assert.equal(f.engine.view().answerGate,null);
  assert.equal(f.state.prepareCount,1,'next send retains its existing idle fence');
  f.step(9400);
  f.step(9500);
  assert.equal(f.state.prepareCount,2);
  assert.equal(f.state.clicks,2);
});

test('reply checks retain prepare baseline and the user node captured at acknowledgement',()=>{
  const f=fixture();
  f.state.users=1;
  const baseline=confirmFirst(f);
  const confirmedUser=f.site.inspect().users.at(-1);
  f.step(2300,{ack:false,users:3,answers:2});
  f.step(4000);
  assert.equal(f.state.replyChecks.length,2);
  for(const check of f.state.replyChecks) {
    assert.deepEqual(check.before.users,baseline.users);
    assert.deepEqual(check.before.assistants,baseline.assistants);
    assert.equal(check.before.assistantCount,baseline.assistants.length);
    assert.equal(check.before.route,baseline.route);
    assert.equal(check.confirmedUser,confirmedUser);
    assert.notEqual(check.confirmedUser,check.snapshot.users.at(-1),
      'later user nodes must never replace the acknowledged identity');
  }
});

for(const result of [undefined,false,'complete']) {
  test(`reply verifier ${String(result)} cannot bypass the answer gate`,()=>{
    const f=fixture();
    confirmFirst(f);
    if(result===undefined)delete f.site.replyComplete;
    else f.site.replyComplete=()=>result;
    f.step(2300,{ack:false,answers:2});
    f.step(4000);
    f.step(5300);
    f.step(5400);
    assert.ok(f.engine.view().answerGate);
    assert.equal(f.state.prepareCount,1);
    assert.equal(f.state.clicks,1);
  });
}
