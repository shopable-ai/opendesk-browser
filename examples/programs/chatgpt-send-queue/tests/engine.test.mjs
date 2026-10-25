import test from 'node:test';
import assert from 'node:assert/strict';
import {createQueueEngine} from '../src/engine.js';

function fixture() {
  const state={now:0,route:'c/12345678-1234-1234-1234-123456789abc',
    busy:true,complete:false,answers:1,users:0,ack:false,clicks:0,
    prepareCount:0,failClick:false,changed:false,draft:''};
  const site={
    normal:x=>String(x??'').trim(),
    inspect:()=>state.changed?{ok:false,reason:'目标网页已变化'}:{
      ok:true,route:state.route,busy:state.busy,idle:!state.busy,
      rich:false,draft:state.draft,answerComplete:state.complete,
      assistants:Array(state.answers).fill(null)},
    prepare:(text,snapshot)=>{
      assert.equal(snapshot.route,state.route);
      state.prepareCount++;
      return {ok:true,token:{text,route:snapshot.route,before:{
        route:snapshot.route,assistantCount:state.answers,users:Array(state.users).fill(null)
      }}};
    },
    commit:token=>{
      state.clicks++;
      if(state.failClick)return {ok:false,stage:'after-click'};
      return {ok:true,before:token.before};
    },
    confirm:()=>state.ack,
    stop:()=>true
  };
  const engine=createQueueEngine({site,clock:()=>state.now});
  const step=(t,patch={})=>{Object.assign(state,patch);state.now=t;engine.tick();};
  return {state,engine,step};
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
