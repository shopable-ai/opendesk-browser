import test from 'node:test';
import assert from 'node:assert/strict';
import {createQueueEngine} from '../src/engine.js';
import {createChatGPTSite} from '../src/site.js';

function fixture() {
  const state={now:0,route:'c/12345678-1234-1234-1234-123456789abc',
    busy:true,complete:false,answers:1,users:0,ack:false,clicks:0,
    prepareCount:0,commitCount:0,replyAllowed:true,replyChecks:[],failClick:false,failStop:false,stops:0,changed:false,draft:''};
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
      state.commitCount++;
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
// external pause notifications must not replace the manual-check instruction.
function assertUnknownLocked(f,counts) {
  const {engine,state,step}=f;
  const unknown=engine.view();
  assert.equal(unknown.phase,'unknown');
  assert.equal(unknown.items.find(item=>item.id==='q1').state,'unknown');
  assert.equal(unknown.items.find(item=>item.id==='q1').text,' A\u00a0\n');
  assert.equal(unknown.inFlight.phase,'unknown');
  assert.equal(unknown.paused,true);
  assert.ok(unknown.reason);
  for(const patch of [{changed:true},{changed:false,route:'c/elsewhere'},
    {route:'c/12345678-1234-1234-1234-123456789abc',busy:true},{busy:false,draft:''}]) {
    step(state.now+20000,patch);
    engine.pause('snapshot or website notification');
    assert.equal(engine.view().reason,unknown.reason);
    assert.equal(engine.resume(),false);
    for(const id of ['q1','q2']) {
      assert.equal(engine.requestNow(id).ok,false);
      assert.equal(engine.confirmForceStop(id),false);
    }
  }
  assert.deepEqual([state.prepareCount,state.commitCount,state.stops],counts);
  assert.equal(engine.remove('q1'),true,'manual website check precedes this deletion in the UI');
  assert.equal(engine.view().paused,true);
  assert.deepEqual(engine.view().items.map(item=>item.text),['B']);
  step(state.now+20000);
  step(state.now+20000);
  assert.deepEqual([state.prepareCount,state.commitCount,state.stops],counts);
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
    assert.equal(f.state.clicks,0);
  });
}

for(const unavailable of ['original page','navigation','editor']) {
  for(const paused of [false,true]) {
    const patch=unavailable==='navigation'?{route:'c/elsewhere'}:
      unavailable==='editor'?{changed:true}:{};
    test(`prepared timeout becomes unknown (${unavailable}, paused=${paused})`,()=>{
      const f=fixture();
      f.engine.enqueue(' A\u00a0\n',f.state.route);
      f.engine.enqueue('B',f.state.route);
      f.step(100,{busy:false,complete:true});
      f.step(1400);
      f.site.commit=()=>{f.state.commitCount++;return {ok:false,retry:true};};
      f.step(1500);
      if(paused)f.engine.pause();
      if(unavailable!=='original page')f.step(2000,patch);
      f.step(7401);
      assertUnknownLocked(f,[1,1,0]);
      assert.equal(f.state.clicks,0);
    });
    test(`stop timeout precedes snapshot early returns (${unavailable}, paused=${paused})`,()=>{
      const f=fixture();
      f.engine.enqueue(' A\u00a0\n',f.state.route);
      f.engine.enqueue('B',f.state.route);
      assert.equal(f.engine.confirmForceStop('q1'),true);
      if(paused)f.engine.pause();
      f.step(100,patch);
      f.step(12001);
      assertUnknownLocked(f,[0,0,1]);
      assert.equal(f.state.clicks,0);
    });
  }
}

test('prepare failure proven before clicking retains explicit resume behavior',()=>{
  const f=fixture();
  f.engine.enqueue(' A\u00a0\n',f.state.route);
  f.site.prepare=()=>{f.state.prepareCount++;return {ok:false,reason:'no write, no click'};};
  f.step(100,{busy:false,complete:true});
  f.step(1400);
  assert.equal(f.engine.view().phase,'failed');
  assert.equal(f.engine.view().inFlight,null);
  assert.equal(f.engine.view().items[0].text,' A\u00a0\n');
  assert.equal(f.engine.resume(),true);
  assert.equal(f.state.commitCount,0);
  assert.equal(f.state.clicks,0);
});

test('unknown send failure keeps its instruction across unavailable snapshots',()=>{
  const f=fixture();
  f.engine.enqueue(' A\u00a0\n',f.state.route);
  f.engine.enqueue('B',f.state.route);
  f.step(100,{busy:false,complete:true});
  f.step(1400);
  f.step(2100,{failClick:true});
  assertUnknownLocked(f,[1,1,0]);
  assert.equal(f.state.clicks,1);
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
  assert.equal(engine.resume(),false);
  assert.equal(engine.requestNow('q1').ok,false);
  assert.equal(engine.confirmForceStop('q1'),false);
  step(20000);step(22000);
  assert.deepEqual([prepareCount,commitCount,stops,clicks],[1,1,0,1]);
  assert.equal(engine.remove('q1'),true);
  step(24000);step(26000);
  assert.equal(engine.view().paused,true);
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
    assert.equal(f.state.clicks,0);
  });
}
