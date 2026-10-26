import test from 'node:test';
import assert from 'node:assert/strict';
import {createQueueEngine} from '../src/engine.js';
import {createChatGPTSite} from '../src/site.js';

function fixture() {
  const state={now:0,route:'c/12345678-1234-1234-1234-123456789abc',
    busy:true,complete:false,answers:1,users:0,ack:false,clicks:0,
    prepareCount:0,commitCount:0,preparedTexts:[],committedTexts:[],replyAllowed:true,replyChecks:[],failClick:false,failStop:false,stops:0,changed:false,draft:''};
  const userNodes=[],assistantNodes=[];
  const nodes=(cache,count)=>Array.from({length:count},(_,i)=>cache[i]??={id:i});
  const site={
    normal:x=>String(x??'').trim(),
    inspect:()=>state.changed?{ok:false,reason:'目标网页已变化'}:{
      ok:true,route:state.route,busy:state.busy,idle:state.idle??!state.busy,
      rich:!!state.rich,composing:!!state.composing,draft:state.draft,
      stopButton:state.noStop?null:{},answerComplete:state.complete,
      users:nodes(userNodes,state.users),assistants:nodes(assistantNodes,state.answers)},
    prepare:(text,snapshot)=>{
      assert.equal(snapshot.route,state.route);
      state.prepareCount++;
      state.preparedTexts.push(text);
      return {ok:true,token:{text,route:snapshot.route,before:{
        route:snapshot.route,assistantCount:state.answers,
        users:snapshot.users,assistants:snapshot.assistants,history:snapshot.history
      }}};
    },
    commit:token=>{
      state.commitCount++;
      state.committedTexts.push(token.text);
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
  const step=(t,patch={},options)=>{Object.assign(state,patch);state.now=t;engine.tick(options);};
  return {state,site,engine,step,defaults:{prepare:site.prepare,commit:site.commit}};
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
  step(10000);
  assert.equal(state.clicks,1);
});
test('a replaced editor prevents sending while unavailable',()=>{
  const {state,engine,step}=fixture();
  engine.enqueue('original conversation only',state.route);
  step(100,{busy:false,complete:true});
  step(1400,{changed:true});
  assert.equal(state.clicks,0);
});
test('acknowledgement timeout never causes duplicate click',()=>{
  const {state,engine,step}=fixture();
  engine.enqueue('one',state.route);
  step(100,{busy:false,complete:true});
  step(1400);
  step(2100);
  step(19000);
  assert.equal(state.clicks,1);
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

test('unavailable submission still confirms an already clicked message',()=>{
  const {state,engine,step}=fixture();
  engine.enqueue('one',state.route);
  engine.enqueue('two',state.route);
  step(100,{busy:false,complete:true});step(1400);step(2100);
  step(2200,{ack:true,users:1},{canSubmit:false});
  assert.equal(engine.view().lastConfirmed,'q1');
  assert.deepEqual(engine.view().items.map(item=>item.id),['q2']);
  step(2300,{ack:false,answers:2},{canSubmit:false});
  step(3600,{}, {canSubmit:false});step(5000,{}, {canSubmit:false});
  assert.equal(state.prepareCount,1);
  assert.equal(state.clicks,1);
});

for(const unavailable of ['original page','navigation','editor']) {
  test(`unavailable submission preserves acknowledgement timeout (${unavailable})`,()=>{
    const {state,engine,step}=fixture();
    engine.enqueue('one',state.route);
    step(100,{busy:false,complete:true});step(1400);step(2100);
    const patch=unavailable==='navigation'?{route:'c/elsewhere'}:
      unavailable==='editor'?{changed:true}:{};
    step(17100,patch,{canSubmit:false});
    assert.equal(engine.view().items[0].state,'sending','15s deadline is inclusive');
    step(17101,{}, {canSubmit:false});
    assert.equal(engine.view().items[0].state,'unknown');
    assert.equal(engine.requestNow('q1').ok,false);
    step(20000,{}, {canSubmit:false});
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
  assert.equal(engine.view().reason,'','rejected enqueue must not leave a stale wait reason');
  assert.equal(state.clicks,1);
});

for(const throws of [false,true]) {
  test(`unknown nonhead stop requires checked deletion then empty draft and completed reply (${throws?'throw':'false'})`,()=>{
    const f=fixture(),{state,engine,step}=f;
    engine.enqueue(' A\u00a0\n',state.route);
    engine.enqueue('B',state.route);
    state.failStop=true;
    state.throwStop=throws;
    assert.equal(engine.confirmForceStop('q2'),false);
    assert.deepEqual(engine.view().inFlight,{id:'q2',phase:'unknown'});
    assert.deepEqual(engine.view().items.map(item=>item.state),['queued','unknown']);
    step(100,{busy:false,complete:true});step(1400);
    assert.equal(state.prepareCount,0);
    assert.equal(engine.requestNow('q1').ok,false);
    assert.equal(engine.remove('q2'),true,'the UI requires website inspection before deletion');
    assert.equal(engine.view().reason,'');
    state.draft='B';
    step(1500);step(3000);
    assert.equal(state.prepareCount,0,'checked deletion must not overwrite the unknown draft');
    step(3100,{draft:'',busy:true,complete:false});step(4500);
    assert.equal(state.prepareCount,0);
    step(4600,{busy:false,complete:false});step(6000);
    assert.equal(state.prepareCount,0,'idle alone cannot bypass reply completion');
    step(6100,{complete:true});step(7100);
    assert.equal(state.prepareCount,0);
    step(7200);step(7300);
    assert.equal(state.clicks,1);
    assert.deepEqual(state.committedTexts,[' A\u00a0\n']);
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

test('requestNow stops the queued prior reply and sends the selected nonhead item exactly once',()=>{
  const f=fixture(),{state,engine,step}=f;
  confirmFirst(f);
  engine.enqueue('selected',state.route);
  step(2300,{ack:false,busy:true,complete:false,answers:2});
  const gate=engine.view().answerGate;
  assert.deepEqual(engine.requestNow('q3'),{ok:true});
  assert.equal(state.stops,1);
  assert.deepEqual(engine.view().inFlight,{id:'q3',phase:'await-stop'});
  assert.equal(engine.view().answerGate,gate,'stop alone must not clear the old gate');
  assert.deepEqual(engine.view().items.map(item=>item.id),['q3','q2']);
  assert.equal(engine.requestNow('q2').ok,false);
  step(3500,{complete:true});
  assert.equal(state.prepareCount,1,'completed marker while busy cannot release stop');
  step(3600,{busy:false});step(4600);
  assert.equal(state.prepareCount,1);
  step(4700,{busy:true});step(4800,{busy:false});step(5800);
  assert.equal(state.prepareCount,1,'busy resets the real idle observation');
  step(5900);
  assert.equal(state.prepareCount,2);
  assert.equal(engine.view().answerGate,null);
  assert.equal(engine.view().inFlight.phase,'await-native-ready');
  assert.equal(engine.requestNow('q3').ok,false);
  step(6000);
  assert.equal(engine.view().inFlight.phase,'await-confirm');
  assert.equal(engine.requestNow('q2').ok,false);
  step(6100,{ack:true,users:2});
  assert.equal(engine.view().lastConfirmed,'q3');
  step(6200,{ack:false});step(7500);step(9000);
  assert.deepEqual(state.committedTexts,['first','selected']);
  assert.equal(state.stops,1);
  assert.ok(engine.view().answerGate,'stopped reply completion cannot release the newly sent turn');
});

for(const patch of [{draft:' '},{rich:true},{composing:true},{route:'c/elsewhere'},
  {changed:true},{noStop:true},{users:2}]) {
  test(`requestNow cannot stop through an unsafe snapshot ${JSON.stringify(patch)}`,()=>{
    const f=fixture();confirmFirst(f);
    f.step(2300,{ack:false,busy:true,complete:false,answers:2,...patch});
    const before=f.engine.view();
    assert.equal(f.engine.requestNow('q2').ok,false);
    assert.deepEqual(f.engine.view(),before);
    assert.deepEqual([f.state.stops,f.state.prepareCount,f.state.clicks],[0,1,1]);
  });
}

for(const field of ['draft','rich','composing']) {
  test(`idle requestNow preflight rejects ${field} without reordering or sending`,()=>{
    const {state,engine}=fixture();
    engine.enqueue('first',state.route);engine.enqueue('selected',state.route);
    Object.assign(state,{busy:false,complete:true,[field]:field==='draft'?' ':true});
    const before=engine.view();
    assert.equal(engine.requestNow('q2').ok,false);
    assert.deepEqual(engine.view(),before);
    assert.deepEqual([state.stops,state.prepareCount,state.clicks],[0,0,0]);
  });

  test(`force-stop waits for ${field} protection to clear and observes fresh idle`,()=>{
    const f=fixture();confirmFirst(f);
    f.step(2300,{ack:false,busy:true,complete:false,answers:2});
    assert.equal(f.engine.requestNow('q2').ok,true);
    f.step(2400,{busy:false,complete:true,[field]:field==='draft'?' ':true});
    f.step(4000);
    assert.equal(f.state.prepareCount,1);
    assert.equal(f.engine.view().inFlight.phase,'await-stop');
    f.step(4100,{[field]:field==='draft'?'':false});f.step(5100);
    assert.equal(f.state.prepareCount,1);
    f.step(5200);f.step(5300);
    assert.deepEqual(f.state.committedTexts,['first','second']);
  });
}

for(const blocked of ['old answer','wrong turn','verifier missing','not idle','submission unavailable']) {
  test(`force-stop cannot pass ${blocked} and times out unknown`,()=>{
    const f=fixture();confirmFirst(f);
    f.step(2300,{ack:false,busy:true,complete:false});
    assert.equal(f.engine.requestNow('q2').ok,true);
    if(blocked==='verifier missing')delete f.site.replyComplete;
    const patch={busy:false,complete:true,answers:blocked==='old answer'?1:2};
    if(blocked==='wrong turn')patch.users=2;
    if(blocked==='not idle')patch.idle=false;
    const options={canSubmit:blocked!=='submission unavailable'};
    f.step(2400,patch,options);f.step(4000,{},options);
    assert.equal(f.state.prepareCount,1);
    assert.ok(f.engine.view().answerGate);
    f.step(14301,{},options);
    assert.equal(f.engine.view().phase,'unknown');
    assert.equal(f.engine.requestNow('q2').ok,false);
    assert.equal(f.engine.confirmForceStop('q2'),false);
    f.step(16000,{users:1,answers:2,idle:true});
    assert.deepEqual([f.state.prepareCount,f.state.clicks,f.state.stops],[1,1,1]);
  });
}

for(const throws of [false,true]) {
  test(`requestNow stop ${throws?'throw':'false'} locks the selected item unknown`,()=>{
    const f=fixture();confirmFirst(f);
    f.step(2300,{ack:false,busy:true,complete:false,answers:2,failStop:true,throwStop:throws});
    assert.equal(f.engine.requestNow('q2').ok,false);
    assert.deepEqual(f.engine.view().inFlight,{id:'q2',phase:'unknown'});
    f.step(2400,{busy:false,complete:true});f.step(4000);
    assert.equal(f.engine.requestNow('q2').ok,false);
    assert.deepEqual([f.state.prepareCount,f.state.clicks,f.state.stops],[1,1,1]);
  });
}

test('requestNow also stops a busy external reply without a second confirmation',()=>{
  const {state,engine,step}=fixture();
  engine.enqueue('selected',state.route);
  assert.deepEqual(engine.requestNow('q1'),{ok:true});
  step(100,{busy:false,complete:true});step(1200);step(1300);
  assert.deepEqual([state.stops,state.prepareCount,state.clicks],[1,1,1]);
});

test('requestNow cannot interrupt synchronous preparing or replace its chosen flight',()=>{
  const f=fixture();
  f.engine.enqueue('first',f.state.route);f.engine.enqueue('second',f.state.route);
  f.site.prepare=(...args)=>{
    assert.equal(f.engine.view().inFlight.phase,'preparing');
    assert.equal(f.engine.requestNow('q2').ok,false);
    return f.defaults.prepare(...args);
  };
  f.step(100,{busy:false,complete:true});f.step(1200);f.step(1300);
  assert.equal(f.engine.requestNow('q2').ok,false);
  assert.deepEqual(f.state.committedTexts,['first']);
  assert.equal(f.state.stops,0);
});

for(const historyChange of ['detached prefix','connected prefix missing','tail replaced','all anchors lost']) {
  test(`force-stop retains real r6 reply identity checks (${historyChange})`,()=>{
    const f=fixture();
    const u0={isConnected:true},a0={isConnected:true},u1={isConnected:true},a1={isConnected:true};
    const confirmed={isConnected:true,compareDocumentPosition:()=>4},reply={isConnected:true};
    let users=[u0,u1],assistants=[a0,a1],history=[u0,a0,u1,a1];
    const inspect=f.site.inspect;
    f.site.inspect=()=>({...inspect(),users,assistants,history});
    // Use the production verifier, including exact nodes, order and detached-prefix rules.
    f.site.replyComplete=createChatGPTSite({doc:{},win:{}}).replyComplete;
    f.engine.enqueue('first',f.state.route);f.engine.enqueue('second',f.state.route);
    f.step(100,{busy:false,complete:true});f.step(1200);f.step(1300);
    users=[u0,u1,confirmed];history=[u0,a0,u1,a1,confirmed];
    f.step(1400,{ack:true});
    assistants=[a0,a1,reply];history=[...history,reply];
    f.step(1500,{ack:false,busy:true,complete:false});
    assert.equal(f.engine.requestNow('q2').ok,true);
    if(historyChange==='detached prefix'){
      u0.isConnected=false;a0.isConnected=false;
      users=[u1,confirmed];assistants=[a1,reply];history=[u1,a1,confirmed,reply];
    }else if(historyChange==='connected prefix missing'){
      users=[u1,confirmed];assistants=[a1,reply];history=[u1,a1,confirmed,reply];
    }else if(historyChange==='tail replaced'){
      const replacement={isConnected:true};
      users=[u0,replacement,confirmed];history=[u0,a0,replacement,a1,confirmed,reply];
    }else{
      for(const node of [u0,a0,u1,a1])node.isConnected=false;
      users=[confirmed];assistants=[reply];history=[confirmed,reply];
    }
    f.step(1600,{busy:false,complete:true});f.step(2700);f.step(2800);
    if(historyChange==='detached prefix'){
      assert.deepEqual(f.state.committedTexts,['first','second']);
      assert.equal(f.engine.view().inFlight.phase,'await-confirm');
    }else{
      assert.deepEqual(f.state.committedTexts,['first']);
      assert.equal(f.engine.view().inFlight.phase,'await-stop');
      f.step(13501);
      assert.equal(f.engine.view().phase,'unknown');
    }
  });
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

test('preflight rejects full, oversized and mismatched queues without mutating state',()=>{
  const {engine,state}=fixture();
  const initial=engine.view();
  assert.equal(engine.checkEnqueue(' ',state.route).ok,false);
  assert.equal(engine.checkEnqueue('x'.repeat(8193),state.route).ok,false);
  assert.equal(engine.checkEnqueue('valid','c/wrong-route').ok,true);
  assert.deepEqual(engine.view(),initial);
  assert.equal(engine.enqueue('first',state.route),true);
  assert.equal(engine.checkEnqueue('another','c/wrong-route').ok,false);
  for(let i=1;i<20;i++)assert.equal(engine.enqueue('item '+i,state.route),true);
  assert.equal(engine.checkEnqueue('overflow',state.route).ok,false);
  assert.equal(engine.view().items.length,20);
});

// Every uncertain flight keeps its exact original text and closes all send
// entries, including calls for a different queued item. Snapshot refreshes and
// external wait notifications must not replace the manual-check instruction.
function assertUnknownLocked(f,counts) {
  const {engine,state,step}=f;
  const unknown=engine.view();
  assert.equal(unknown.phase,'unknown');
  assert.equal(unknown.items.find(item=>item.id==='q1').state,'unknown');
  assert.equal(unknown.items.find(item=>item.id==='q1').text,' A\u00a0\n');
  assert.equal(unknown.inFlight.phase,'unknown');
  assert.equal('paused' in unknown,false);
  assert.ok(unknown.reason);
  for(const patch of [{changed:true},{changed:false,route:'c/elsewhere'},
    {route:'c/12345678-1234-1234-1234-123456789abc',busy:true},{busy:false,draft:''}]) {
    step(state.now+20000,patch);
    engine.wait('snapshot or website notification');
    assert.equal(engine.view().reason,unknown.reason);
    for(const id of ['q1','q2']) {
      assert.equal(engine.requestNow(id).ok,false);
      assert.equal(engine.confirmForceStop(id),false);
    }
  }
  assert.deepEqual([state.prepareCount,state.commitCount,state.stops],counts);
  assert.equal(engine.remove('q1'),true,'manual website check precedes this deletion in the UI');
  assert.equal(engine.view().reason,'','checked deletion clears the unknown instruction');
  assert.deepEqual(engine.view().items.map(item=>item.text),['B']);
  // Inspection/deletion is not permission to overwrite the original unknown draft.
  state.draft=' A\u00a0\n';
  step(state.now+20000);
  step(state.now+20000);
  assert.deepEqual([state.prepareCount,state.commitCount,state.stops],counts);
  step(state.now+100,{draft:'',busy:true,complete:false});
  step(state.now+20000);
  assert.deepEqual([state.prepareCount,state.commitCount,state.stops],counts);
  step(state.now+100,{busy:false,complete:false});
  step(state.now+20000);
  assert.deepEqual([state.prepareCount,state.commitCount,state.stops],counts);
  Object.assign(f.site,f.defaults);
  state.failClick=false;
  step(state.now+100,{complete:true});
  step(state.now+1000);
  assert.equal(state.prepareCount,counts[0],'completed reply still requires stable idle');
  step(state.now+100);
  assert.equal(state.prepareCount,counts[0]+1);
  step(state.now+100);
  assert.deepEqual([state.prepareCount,state.commitCount,state.stops],[counts[0]+1,counts[1]+1,counts[2]]);
  assert.equal(state.preparedTexts.at(-1),'B');
  assert.equal(state.committedTexts.at(-1),'B');
  step(state.now+100,{ack:true,users:state.users+1});
  assert.equal(engine.view().lastConfirmed,'q2');
  assert.deepEqual(engine.view().items,[]);
}

for(const issue of ['identity/draft changed','other reply started']) {
  test(`prepared before-click rejection requires manual check (${issue})`,()=>{
    const f=fixture();
    f.engine.enqueue(' A\u00a0\n',f.state.route);
    f.engine.enqueue('B',f.state.route);
    f.step(100,{busy:false,complete:true});
    f.step(1400);
    f.site.commit=()=>{
      f.state.commitCount++;
      return {ok:false,stage:'before-click',reason:issue};
    };
    f.step(2100);
    assertUnknownLocked(f,[1,1,0]);
    assert.equal(f.state.clicks,1,'only the remaining item is clicked after checked deletion');
  });
}

test('prepared timeout retains the last readiness reason without another click',()=>{
  const f=fixture();
  f.engine.enqueue('queued',f.state.route);
  f.step(100,{busy:false,complete:true});f.step(1400);
  f.site.commit=()=>{f.state.commitCount++;return {ok:false,retry:true,reason:'原生发送按钮尚未启用'};};
  f.step(2100);f.step(7401);
  assert.equal(f.engine.view().phase,'unknown');
  assert.match(f.engine.view().reason,/原生发送按钮尚未启用/);
  assert.equal(f.state.commitCount,1);assert.equal(f.state.clicks,0);
});

for(const unavailable of ['original page','navigation','editor']) {
  for(const canSubmit of [true,false]) {
    const patch=unavailable==='navigation'?{route:'c/elsewhere'}:
      unavailable==='editor'?{changed:true}:{};
    test(`prepared timeout becomes unknown (${unavailable}, canSubmit=${canSubmit})`,()=>{
      const f=fixture();
      f.engine.enqueue(' A\u00a0\n',f.state.route);
      f.engine.enqueue('B',f.state.route);
      f.step(100,{busy:false,complete:true});
      f.step(1400);
      f.site.commit=()=>{f.state.commitCount++;return {ok:false,retry:true};};
      f.step(1500);
      if(unavailable!=='original page')f.step(2000,patch,{canSubmit});
      f.step(7400,{}, {canSubmit:false});
      assert.equal(f.engine.view().inFlight.phase,'await-native-ready');
      f.step(7401,{}, {canSubmit});
      assertUnknownLocked(f,[1,1,0]);
      assert.equal(f.state.clicks,1,'checked deletion releases only the remaining item');
    });
    test(`stop timeout precedes snapshot early returns (${unavailable}, canSubmit=${canSubmit})`,()=>{
      const f=fixture();
      f.engine.enqueue(' A\u00a0\n',f.state.route);
      f.engine.enqueue('B',f.state.route);
      assert.equal(f.engine.confirmForceStop('q1'),true);
      f.step(100,patch,{canSubmit});
      f.step(12000,{}, {canSubmit});
      assert.equal(f.engine.view().inFlight.phase,'await-stop');
      f.step(12001,{}, {canSubmit});
      assertUnknownLocked(f,[0,0,1]);
      assert.equal(f.state.clicks,1,'checked deletion releases only the remaining item');
    });
  }
}

test('prepare failure proven before writing automatically retries only after stable idle',()=>{
  const f=fixture();
  f.engine.enqueue(' A\u00a0\n',f.state.route);
  f.site.prepare=()=>{f.state.prepareCount++;return {ok:false,reason:'no write, no click'};};
  f.step(100,{busy:false,complete:true});f.step(1400);
  assert.equal(f.engine.view().inFlight,null);
  assert.equal(f.engine.view().items[0].text,' A\u00a0\n');
  assert.match(f.engine.view().reason,/no write, no click/);
  assert.equal(f.state.commitCount,0);
  assert.equal(f.state.clicks,0);
  Object.assign(f.site,f.defaults);
  f.step(1500);f.step(2500);
  assert.equal(f.state.prepareCount,1);
  f.step(2600);f.step(2700);
  assert.equal(f.state.prepareCount,2);
  assert.equal(f.state.clicks,1);
  assert.deepEqual(f.state.committedTexts,[' A\u00a0\n']);
});

test('unknown send failure keeps its instruction across unavailable snapshots',()=>{
  const f=fixture();
  f.engine.enqueue(' A\u00a0\n',f.state.route);
  f.engine.enqueue('B',f.state.route);
  f.step(100,{busy:false,complete:true});
  f.step(1400);
  f.step(2100,{failClick:true});
  assertUnknownLocked(f,[1,1,0]);
  assert.equal(f.state.clicks,2,'one unknown click and one checked remaining send');
});

// Uses the unchanged real site.prepare/commit methods with an offline DOM
// double. The manual website send occurs between those two engine polls.
// This is adapter/engine evidence, never a real ChatGPT send.
test('real adapter manual send after prepare never permits a second prepare or commit',()=>{
  let now=0,prepareCount=0,commitCount=0,stops=0,clicks=0;
  const users=[],text=' A\u00a0\n';
  class Textarea {
    constructor(){this.current='';this.tagName='TEXTAREA';this.isConnected=true;}
    get value(){return this.current;}
    set value(value){this.current=value;}
    closest(selector){return selector==='form'?form:null;}
    getAttribute(){return null;}
    querySelector(){return null;}
    getClientRects(){return [{}];}
    focus(){}
    dispatchEvent(){}
  }
  const editor=new Textarea();
  const send={isConnected:true,disabled:false,closest:()=>null,getClientRects:()=>[{}],
    getAttribute:name=>name==='data-testid'?'send-button':null,matches:()=>false,
    click:()=>{clicks++;users.push({parentElement:null,querySelector:()=>null,innerText:editor.value});editor.value='';}};
  const form={isConnected:true,hasAttribute:()=>false,querySelectorAll:()=>[send],querySelector:()=>null};
  const win={location:{origin:'https://chatgpt.com',pathname:'/c/12345678'},
    getComputedStyle:()=>({display:'block',visibility:'visible'}),HTMLTextAreaElement:Textarea,InputEvent:class {}};
  win.top=win;
  const doc={querySelectorAll:selector=>selector.startsWith('#prompt-textarea')?[editor]:
    selector.startsWith('[data-message-author-role="user"]')?users:[]};
  const adapter=createChatGPTSite({doc,win});
  const site={...adapter,
    prepare:(...args)=>{prepareCount++;return adapter.prepare(...args);},
    commit:(...args)=>{commitCount++;const result=adapter.commit(...args);assert.equal(result.stage,'before-click');return result;},
    stop:(...args)=>{stops++;return adapter.stop(...args);}};
  const engine=createQueueEngine({site,clock:()=>now});
  const step=t=>{now=t;engine.tick();};
  engine.enqueue(text,site.inspect().route);
  engine.enqueue('B',site.inspect().route);
  step(100);step(1400);
  assert.equal(editor.value,text);
  send.click(); // The user's native send, not an engine action.
  assert.equal(users[0].innerText,text);
  step(2100);
  assert.equal(engine.view().phase,'unknown');
  assert.equal(engine.view().items[0].text,text);
  assert.equal(engine.requestNow('q1').ok,false);
  assert.equal(engine.confirmForceStop('q1'),false);
  step(20000);step(22000);
  assert.deepEqual([prepareCount,commitCount,stops,clicks],[1,1,0,1]);
  assert.equal(engine.remove('q1'),true);
  assert.equal(engine.view().reason,'');
  editor.value=text; // The inspected unknown draft remains owned by the user.
  step(24000);step(26000);
  assert.deepEqual([prepareCount,commitCount,stops,clicks],[1,1,0,1]);
});

for(const failure of ['mayHaveWritten','throw']) {
  test(`uncertain prepare failure locks every send entry (${failure})`,()=>{
    const f=fixture();
    f.engine.enqueue(' A\u00a0\n',f.state.route);
    f.engine.enqueue('B',f.state.route);
    f.site.prepare=()=>{
      f.state.prepareCount++;
      f.state.draft=' A\u00a0\n';
      if(failure==='throw')throw new Error('write cannot be excluded');
      return {ok:false,mayHaveWritten:true,reason:'prepare may have written'};
    };
    f.step(100,{busy:false,complete:true});
    f.step(1400);
    assertUnknownLocked(f,[1,0,0]);
    assert.equal(f.state.clicks,1,'only the remaining item is sent after inspection');
  });
}


test('submission availability blocks prepare and commit without a pause API',()=>{
  const {state,engine,step}=fixture();
  engine.enqueue('one',state.route);
  step(100,{busy:false,complete:true},{canSubmit:false});
  step(1400,{}, {canSubmit:false});
  assert.equal(state.prepareCount,0);
  step(1500);
  step(2700);
  assert.equal(state.prepareCount,1);
  step(2800,{}, {canSubmit:false});
  assert.equal(state.commitCount,0);
  step(2900);
  assert.equal(state.clicks,1);
  assert.equal('paused' in engine.view(),false);
  assert.equal(engine.pause,undefined);
  assert.equal(engine.resume,undefined);
});

for(const unavailable of ['navigation','editor']) {
  test(`temporary ${unavailable} loss resets idle and automatically recovers`,()=>{
    const {state,engine,step}=fixture(),route=state.route;
    engine.enqueue('original conversation only',route);
    step(100,{busy:false,complete:true});
    step(1000,unavailable==='navigation'?{route:'c/elsewhere'}:{changed:true});
    step(1400,{route,changed:false});
    assert.equal(state.prepareCount,0,'time away cannot count as stable idle');
    step(2400);
    assert.equal(state.prepareCount,0);
    step(2500);
    assert.equal(state.prepareCount,1);
    step(2600);
    assert.equal(state.clicks,1);
  });
}


test('wait records the current reason without changing queue identity or sending',()=>{
  const {engine,state,step}=fixture();
  engine.enqueue(' A\u00a0\n',state.route);
  step(100,{busy:false,complete:true});
  const before=engine.view();
  engine.wait('原生控件暂不可用');
  const waiting=engine.view();
  assert.equal(waiting.reason,'原生控件暂不可用');
  assert.deepEqual({...waiting,reason:before.reason},before);
  assert.equal(state.prepareCount,0);
  step(1000);
  assert.equal(state.prepareCount,0,'wait resets the idle observation');
  step(2000);
  assert.equal(state.prepareCount,0);
  step(2100);step(2200);
  assert.equal(state.clicks,1,'normal polls recover automatically');
  assert.deepEqual(state.committedTexts,[' A\u00a0\n']);
});

test('unsafe reclaim uncertainty binds the exact item and preserves the original draft',()=>{
  const f=fixture(),{engine,state}=f;
  engine.enqueue(' A\u00a0\n',state.route);
  engine.enqueue('B',state.route);
  const before=engine.view();
  assert.equal(engine.uncertain('missing','not an item'),false);
  assert.deepEqual(engine.view(),before);
  assert.equal(engine.uncertain('q1','回填结果未知，请检查后删除'),true);
  assert.deepEqual(engine.view().inFlight,{id:'q1',phase:'unknown'});
  assert.equal(engine.view().reason,'回填结果未知，请检查后删除');
  assert.equal(engine.uncertain('q2','must not replace unknown identity'),false);
  assert.equal(engine.reclaim('q1'),false);
  assert.equal(engine.reclaim('q2'),false);
  assertUnknownLocked(f,[0,0,0]);
  assert.equal(state.clicks,1);
});

test('uncertain cannot replace an active prepared flight',()=>{
  const {engine,state,step}=fixture();
  engine.enqueue('one',state.route);engine.enqueue('two',state.route);
  step(100,{busy:false,complete:true});step(1400);
  const before=engine.view();
  assert.equal(engine.uncertain('q2','unsafe reclaim'),false);
  assert.deepEqual(engine.view(),before);
  step(2100);
  assert.deepEqual(state.committedTexts,['one']);
});

test('checked deletion after an uncertain reclaim retains the manually sent turn reply gate',()=>{
  const {engine,state,site,step}=fixture();
  engine.enqueue('first',state.route);engine.enqueue('second',state.route);
  Object.assign(state,{busy:false,complete:true});
  const before=site.inspect();
  assert.equal(engine.uncertain('q1','取回状态未知',before),true);
  step(100,{ack:true,users:1}); // User sends the reclaimed draft outside the engine.
  assert.equal(state.clicks,0);
  assert.equal(engine.remove('q1'),true);
  assert.ok(engine.view().answerGate);
  step(200,{ack:false});step(1500);step(2800);
  assert.equal(state.prepareCount,0,'an old completed assistant cannot release second');
  step(3000,{answers:2});step(4200);step(5400);step(5500);
  assert.deepEqual(state.committedTexts,['second']);
  assert.equal(state.clicks,1);
});

test('stopped reply cannot prepare while submission is unavailable and recovers after stable idle',()=>{
  const {engine,state,step}=fixture();
  engine.enqueue('one',state.route);
  assert.equal(engine.confirmForceStop('q1'),true);
  step(100,{busy:false,complete:true},{canSubmit:false});
  step(1400,{}, {canSubmit:false});
  assert.equal(state.prepareCount,0);
  assert.equal(state.commitCount,0);
  assert.equal(state.stops,1);
  step(1500);step(2500);
  assert.equal(state.prepareCount,0);
  step(2600);step(2700);
  assert.equal(state.clicks,1);
  assert.deepEqual(state.committedTexts,['one']);
});
