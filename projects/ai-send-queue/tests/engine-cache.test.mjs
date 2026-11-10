import test from 'node:test';
import assert from 'node:assert/strict';
import {createQueueEngine} from '../src/page/engine.js';

const route='c/12345678-abcd';
const row=(id='q1',text='message',state='queued')=>({id,text,state});
const record=(items=[row()],patch={})=>({version:1,route,items,inFlight:null,expanded:true,...patch});
function fixture(){
  const calls={prepare:0,commit:0,stop:0,checkpoints:[],events:[]};
  let now=0,save=()=>true;
  const snap={ok:true,route,busy:false,idle:true,rich:false,composing:false,draft:'',
    users:[],assistants:[],answerComplete:true,stopButton:{},ack:false};
  const site={normal:text=>text.trim(),inspect:()=>snap,confirm:()=>snap.ack,
    prepare(text){calls.prepare++;calls.events.push('prepare');return {ok:true,token:{text,before:{route}}};},
    commit(){calls.commit++;calls.events.push('commit');return {ok:true,before:{route}};},
    stop(){calls.stop++;calls.events.push('stop');return true;}};
  const engine=createQueueEngine({site,clock:()=>now,
    change(){calls.events.push('emit');},
    checkpoint(){calls.checkpoints.push(engine.view());calls.events.push('checkpoint');return save();}});
  return {engine,calls,snap,save(fn){save=fn;},step(time,options){now=time;engine.tick(options);},
    prepare(){engine.enqueue('  original\nmessage  ',route);engine.tick();now=1100;engine.tick();}};
}

test('cache restore pauses all unsent rows and preserves raw text, order, expanded and ID sequence',()=>{
  const h=fixture(),text=' \n raw\u00a0text 😀 \n ';
  const data=record([row('q9',text),row('q2','second','paused')]);
  assert.equal(h.engine.restoreCache(data,route),true);
  assert.deepEqual(h.engine.view().items,[row('q9',text,'paused'),row('q2','second','paused')]);
  assert.equal(h.engine.view().expanded,true);
  h.step(0);h.step(100000);assert.equal(h.calls.prepare,0);
  assert.equal(h.engine.requestNow('q9').ok,false);
  assert.equal(h.engine.enqueue('new',route),true);
  assert.equal(h.engine.view().items.at(-1).id,'q10');
  assert.equal(h.engine.resume('q9'),true);
  h.step(100001);h.step(101101);assert.equal(h.calls.prepare,1);
  assert.equal(data.items[0].state,'queued','input record is not mutated');
});

for(const mode of ['sending','waiting','unknown','queued flight','paused flight']){
  test(`cache restore locks interrupted ${mode} without trusting DOM proof or replaying`,()=>{
    const h=fixture(),state=mode.split(' ')[0];
    const data=record([row('q4','preserve exact text',state),row('q7','next')],{
      inFlight:mode.includes('flight')?{id:'q4',token:{before:{route}},before:{route}}:null,
      answerGate:{before:{route},confirmedUser:{}}});
    assert.equal(h.engine.restoreCache(data,route),true);
    assert.deepEqual(h.engine.view().inFlight,{id:'q4',phase:'unknown'});
    assert.equal(h.engine.view().answerGate,null);
    assert.equal(h.engine.view().items[0].state,'unknown');
    assert.equal(h.engine.view().items[1].state,'paused');
    assert.match(h.engine.view().reason,/刷新.*未知/);
    h.snap.ack=true;h.step(0);h.step(100000);h.step(200000,{canSubmit:true});
    assert.equal(h.engine.view().items.length,2,'even confirm=true cannot replace lost DOM proof');
    assert.equal(h.engine.resume('q4'),false);assert.equal(h.engine.resume('q7'),false);
    assert.equal(h.engine.reclaimPrepared('q4'),false);
    assert.equal(h.engine.requestNow('q4').ok,false);
    assert.equal(h.calls.prepare+h.calls.commit+h.calls.stop,0);
  });
}

test('cache rejects malformed records atomically and can accept a valid record afterward',()=>{
  const invalid=[null,{},record([],{version:undefined}),record([],{version:2}),record([],{version:'1'}),record([],{route:'c/87654321'}),record([],{expanded:'yes'}),
    record(Array.from({length:21},(_,i)=>row('q'+(i+1)))),record([row('q1','')]),
    record([row('q1',' \n ')]),record([row('q1','x'.repeat(8193))]),
    record([row('bad')]),record([row('q0')]),record([row('q01')]),record([row('q1234567890123456')]),record([row('q9007199254740992')]),record([row(),row()]),
    record([row('q1','one','confirmed')]),record([null]),
    record([row()],{inFlight:{id:'missing'}}),record([row()],{inFlight:'q1'}),
    record([row('q1','one','unknown'),row('q2','two','sending')]),
    record([row('q1','one','unknown'),row('q2')],{inFlight:{id:'q2'}})];
  for(const data of invalid){
    const h=fixture(),before=h.engine.view();
    assert.equal(h.engine.restoreCache(data,route),false,JSON.stringify(data));
    assert.deepEqual(h.engine.view(),before);
    assert.equal(h.engine.restoreCache(record(),route),true);
  }
  for(const badRoute of ['', 'c/short', 'c/ABCDEF12','c/12345678/extra','c/'+'a'.repeat(257)]){
    const h=fixture();assert.equal(h.engine.restoreCache(record([],{route:badRoute}),badRoute),false);
  }
});

test('cache never overwrites an active queue or an empty queue with an answer gate',()=>{
  for(const mode of ['queued','flight','answer gate']){
    const h=fixture();h.engine.enqueue('existing',route);
    if(mode!=='queued')h.prepare();
    if(mode==='answer gate'){
      h.snap.ack=true;h.step(1200);
      h.engine.remove('q2');
      assert.equal(h.engine.view().items.length,0);
      assert.ok(h.engine.view().answerGate);
    }
    const before=h.engine.view();
    assert.equal(h.engine.restoreCache(record(),route),false,mode);
    assert.deepEqual(h.engine.view(),before);
  }
});

test('SPA restores conversation B after conversation A queue is removed',()=>{
  const h=fixture(),nextRoute='c/87654321-abcd';
  h.engine.enqueue('conversation A',route);h.engine.remove('q1');
  h.engine.wait('waiting for a conversation');
  assert.equal(h.engine.view().route,null);
  assert.equal(h.engine.restoreCache(record([row('q8','conversation B')],{route:nextRoute}),nextRoute),true);
  assert.equal(h.engine.view().route,nextRoute);
  assert.deepEqual(h.engine.view().items,[row('q8','conversation B','paused')]);
  assert.equal(h.engine.enqueue('new B',nextRoute),true);
  assert.equal(h.engine.view().items.at(-1).id,'q9');
  assert.equal(h.calls.prepare+h.calls.commit+h.calls.stop,0);
});

for(const mode of ['expanded','wait reason','draft-only restore']){
  test(`cache can load in a truly empty engine after ${mode}`,()=>{
    const h=fixture();
    if(mode==='expanded')h.engine.toggleExpanded();
    if(mode==='wait reason')h.engine.wait('temporary UI reason');
    if(mode==='draft-only restore'){
      assert.equal(h.engine.restoreCache(record([],{draft:{text:'preserved draft'}}),route),true);
    }
    assert.equal(h.engine.restoreCache(record(),route),true);
    assert.deepEqual(h.engine.view().items,[row('q1','message','paused')]);
  });
}

test('cache accepts exact count/text bounds and restores collapsed display',()=>{
  const h=fixture();
  assert.equal(h.engine.restoreCache(record(Array.from({length:20},(_,i)=>row('q'+(i+1),'x'.repeat(8192))),{expanded:false}),route),true);
  assert.equal(h.engine.view().items.length,20);assert.equal(h.engine.view().expanded,false);
});

for(const failure of ['false','throw']){
  const fail=()=>{if(failure==='throw')throw new Error('storage unavailable');return false;};
  test(`checkpoint ${failure} blocks prepare after emitting preparing and retains original text`,()=>{
    const h=fixture();h.save(fail);h.prepare();
    assert.equal(h.calls.prepare,0);assert.equal(h.calls.commit,0);
    assert.equal(h.calls.checkpoints[0].inFlight.phase,'preparing');
    assert.equal(h.calls.checkpoints[0].items[0].state,'sending');
    assert.deepEqual(h.calls.events.slice(-3),['emit','checkpoint','emit']);
    assert.equal(h.engine.view().inFlight,null);
    assert.equal(h.engine.view().items[0].state,'queued');
    assert.equal(h.engine.view().items[0].text,'  original\nmessage  ');
    assert.match(h.engine.view().reason,/缓存.*失败/);
    h.save(()=>true);h.step(1200);h.step(2300);assert.equal(h.calls.prepare,1);
  });
  test(`checkpoint ${failure} blocks commit without extending the prepared deadline`,()=>{
    const h=fixture();h.prepare();h.save(fail);
    h.step(2000);h.step(6000);
    assert.equal(h.calls.commit,0);
    assert.deepEqual(h.engine.view().inFlight,{id:'q1',phase:'await-native-ready'});
    assert.match(h.engine.view().reason,/缓存.*失败/);
    h.save(()=>true);h.step(7101);
    assert.equal(h.engine.view().inFlight.phase,'unknown');
    assert.equal(h.calls.commit,0,'original 6000ms deadline still applies');
    assert.equal(h.engine.view().items[0].text,'  original\nmessage  ');
  });
  test(`checkpoint ${failure} blocks Stop with no side effect and allows a later explicit retry`,()=>{
    const h=fixture();h.engine.enqueue('first',route);h.engine.enqueue('second',route);
    h.snap.busy=true;h.save(fail);
    const rejected=h.engine.requestNow('q2');
    assert.equal(rejected.ok,false);assert.match(rejected.reason,/缓存.*失败/);
    assert.equal(h.engine.confirmForceStop('q2'),false);
    assert.equal(h.calls.stop,0);assert.equal(h.engine.view().inFlight,null);
    assert.deepEqual(h.engine.view().items,[row('q1','first'),row('q2','second')]);
    assert.match(h.engine.view().reason,/缓存.*失败/);
    h.save(()=>true);assert.equal(h.engine.requestNow('q2').ok,true);
    assert.equal(h.calls.stop,1);assert.equal(h.engine.view().inFlight.phase,'await-stop');
  });
}

test('successful checkpoints run before prepare, commit and Stop',()=>{
  const h=fixture();h.prepare();h.step(1200);
  for(const effect of ['prepare','commit']){
    const i=h.calls.events.indexOf(effect);assert.equal(h.calls.events[i-1],'checkpoint');
  }
  const stop=fixture();stop.engine.enqueue('message',route);stop.snap.busy=true;
  assert.equal(stop.engine.requestNow('q1').ok,true);
  assert.equal(stop.calls.events[stop.calls.events.indexOf('stop')-1],'checkpoint');
});

test('commit proceeds after transient checkpoint failure within the original deadline',()=>{
  const h=fixture();h.prepare();h.save(()=>false);h.step(1200);
  assert.equal(h.calls.commit,0);
  h.save(()=>true);h.step(1300);
  assert.equal(h.calls.prepare,1);assert.equal(h.calls.commit,1);
  assert.equal(h.engine.view().inFlight.phase,'await-confirm');
});
