import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';
import {globalVideoSpeedState} from '../trusted/policy.js';

const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const pref=(enabled=false,speed=1,revision='r1')=>({enabled,speed,revision});
function fixture({state=globalVideoSpeedState(undefined,'installed','official-hash'),actual=1,handlers={}}={}){
  const {document,window}=parseHTML('<html><body>'+html+'</body></html>');
  const root=document.querySelector('main'),calls=[];
  let current=actual,shared=state,revision=1;
  const request=async(op,args)=>{
    calls.push({op,args});
    if(handlers[op])return handlers[op](args);
    if(op==='videoSpeed.global.status')return shared;
    if(op==='videoSpeed.global.configure'){
      if(args.enabled&&args.expectedRevision!==shared.revision)return {...shared,superseded:true};
      shared=pref(args.enabled,args.speed,'r'+(++revision));return {...shared,restore:{status:'requested'}};
    }
    if(op==='videoSpeed.status')return current===null?{status:'no-video'}:{status:'available',speed:current};
    if(op==='videoSpeed.set'){current=args.speed;return {status:'available',speed:current};}
    if(op==='storage.get')return {value:true};
    if(op==='videoSpeed.shortcuts.enable')return {enabled:true};
    if(op==='videoSpeed.shortcuts.disable'||op==='storage.set')return {};
    throw Error(op);
  };
  runInNewContext(source,{document,window,OpenDeskTool:{root,request}});
  const get=id=>root.querySelector('#speed-'+id);
  const click=id=>{const element=get(id);if(!element.disabled)element.click();};
  return {root,window,handlers,calls,get,click,
    ops:()=>calls.filter(c=>c.op.startsWith('videoSpeed.')&&!c.op.includes('shortcuts')).map(c=>c.op),
    writes:()=>calls.filter(c=>c.op==='videoSpeed.set'||c.op==='videoSpeed.global.configure'),
    value:()=>get('current').textContent,
    preset(speed){const button=root.querySelector(`[data-speed="${speed}"]`);if(!button.disabled)button.click();},
    send(next,parent=true){const event=new window.Event('message');event.source=parent?window.parent:{};
      event.data={protocol:'opendesk.video-speed.global.v1',kind:'preference',state:next};window.dispatchEvent(event);},
    key(key){const event=new window.Event('keydown',{bubbles:true,cancelable:true});event.key=key;document.dispatchEvent(event);}
  };
}

test('saved OFF preserves single-page set, unique 1x and explicit refresh readback',async()=>{
  const f=fixture({state:pref(false)});assert.equal(f.get('global-toggle').getAttribute('aria-checked'),'false');await flush();
  assert.equal(f.root.querySelectorAll('[data-speed="1"]').length,1);
  f.preset(2);await flush();assert.deepEqual(f.writes().map(c=>c.op),['videoSpeed.set']);assert.equal(f.value(),'2.00');
  assert.deepEqual({...f.writes()[0].args},{speed:2});
  f.click('refresh');await flush();assert.equal(f.value(),'2.00');
});
test('first use opens with global mode on and can save a target without a current video',async()=>{
  const f=fixture({actual:null});await flush();
  assert.equal(f.get('global-toggle').getAttribute('aria-checked'),'true');
  assert.equal(f.get('global-note').hidden,true);
  f.preset(2);await flush();
  assert.deepEqual(f.writes().map(c=>c.op),['videoSpeed.global.configure']);
  assert.equal(f.writes()[0].args.speed,2);assert.equal(f.value(),'—');
  assert.equal(f.get('global-note').hidden,false);
});
for(const actual of [1.5,null,8])test(`enable selects valid actual or saved target: ${actual}`,async()=>{
  const f=fixture({actual,state:pref(false,2)});await flush();f.click('global-toggle');await flush();
  assert.equal(f.writes()[0].args.speed,actual===1.5?1.5:2);assert.equal(f.writes()[0].args.enabled,true);
  assert.equal(f.get('global-toggle').getAttribute('aria-checked'),'true');
});
test('global presets configure first, retain old actual while set awaits independent readback',async()=>{
  const configure=deferred(),set=deferred();
  const f=fixture({state:pref(true,1),handlers:{'videoSpeed.global.configure':()=>configure.promise,'videoSpeed.set':()=>set.promise}});
  await flush();f.preset(2);assert.equal(f.writes().length,1);assert.equal(f.value(),'1.00');
  configure.resolve(pref(true,2,'r2'));await flush();assert.deepEqual(f.writes().map(c=>c.op),['videoSpeed.global.configure','videoSpeed.set']);
  assert.deepEqual({...f.writes()[0].args},{enabled:true,speed:2,expectedRevision:'r1'});
  assert.deepEqual({...f.writes()[1].args},{speed:2,expectedRevision:'r2'});
  assert.equal(f.get('global-note').hidden,true);assert.equal(f.value(),'1.00');
  set.resolve({status:'available',speed:1.5,requested:2,verified:false});await flush();
  assert.equal(f.value(),'1.50');assert.equal(f.get('verification').textContent,'未生效');
});
test('no video can save global target without showing it as actual or sending page set',async()=>{
  const f=fixture({actual:null,state:pref(true,1)});await flush();f.preset(3);await flush();
  assert.equal(f.writes().length,1);assert.equal(f.writes()[0].args.speed,3);assert.equal(f.value(),'—');
  assert.equal(f.get('verification').textContent,'无视频');
  f.click('plus');await flush();assert.equal(f.writes()[1].args.speed,3.25);assert.equal(f.value(),'—');
});
for(const trigger of ['global-toggle'])for(const status of ['requested','partial',undefined])
test(`${trigger} disables automatic application and truthfully reports restore ${status}`,async()=>{
  const f=fixture({state:pref(true,2),actual:2,handlers:{'videoSpeed.global.configure':args=>({...pref(args.enabled,args.speed,'r2'),restore:status?{status}:undefined})}});
  await flush();f.click(trigger);await flush();assert.equal(f.writes().length,1);assert.equal(f.writes()[0].args.enabled,false);
  assert.equal(f.writes()[0].args.expectedRevision,'r1');
  assert.equal(f.get('global-toggle').getAttribute('aria-checked'),'false');
  assert.match(f.get('global-note').textContent,status==='requested'?/尚未确认/:/未知/);
  assert.equal(f.value(),'2.00','the page readback, not a claimed restore, supplies actual');
  f.preset(1);await flush();assert.equal(f.writes()[1].op,'videoSpeed.set');
});
test('configure failure never falls through to page set or auto-retries',async()=>{
  const f=fixture({state:pref(true,1),handlers:{'videoSpeed.global.configure':()=>{throw Error('unknown result');}}});
  await flush();f.preset(2);await flush();assert.equal(f.writes().length,1);assert.equal(f.value(),'—');
  assert.match(f.get('message').textContent,/unknown/);await flush();assert.equal(f.writes().length,1);
});
test('failed stop keeps confirmed state and reports unknown restoration',async()=>{
  const f=fixture({state:pref(true,2),handlers:{'videoSpeed.global.configure':()=>{throw Error('offline');}}});
  await flush();f.click('global-toggle');await flush();assert.equal(f.get('global-toggle').getAttribute('aria-checked'),'true');
  assert.match(f.get('global-note').textContent,/未知/);assert.equal(f.writes().length,1);
});
test('global sidebar S/D/R synchronizes target before each current-video set',async()=>{
  const f=fixture({state:pref(true,2),actual:2});await flush();
  let revision=1;
  for(const [key,speed] of [['d',2.25],['s',2],['r',1]]){
    f.key(key);await flush();const writes=f.writes().slice(-2);
    assert.deepEqual(writes.map(c=>c.op),['videoSpeed.global.configure','videoSpeed.set']);
    assert.equal(writes[0].args.speed,speed);assert.equal(writes[1].args.speed,speed);
    assert.equal(writes[0].args.expectedRevision,'r'+revision);
    assert.equal(writes[1].args.expectedRevision,'r'+(++revision));
  }
});
test('external preference wins over stale initial status; malformed/foreign events do nothing',async()=>{
  const pending=deferred(),f=fixture({handlers:{'videoSpeed.global.status':()=>pending.promise}});await flush();
  f.send(pref(true,3,'r3'),false);f.send({enabled:true,speed:99,revision:'bad'});
  assert.equal(f.get('global-toggle').getAttribute('aria-checked'),'false');
  f.send(pref(true,2,'r2'));await flush();pending.resolve(pref(false,1));await flush();
  assert.equal(f.get('global-toggle').getAttribute('aria-checked'),'true');
  assert.equal(f.value(),'1.00');assert.equal(f.writes().length,0);
});
test('preference during configure supersedes older response and prevents stale page write',async()=>{
  const pending=deferred(),f=fixture({state:pref(true,1),handlers:{'videoSpeed.global.configure':()=>pending.promise}});
  await flush();f.preset(2);f.send(pref(false,3,'r3'));pending.resolve(pref(true,2,'r2'));await flush();
  assert.equal(f.writes().length,1);assert.equal(f.get('global-toggle').getAttribute('aria-checked'),'false');
  assert.equal(f.value(),'1.00');
});
for(const enabled of [false,true])test(`late configure CAS response projects current state without page set: enabled=${enabled}`,async()=>{
  const pending=deferred(),f=fixture({state:pref(true,1),handlers:{'videoSpeed.global.configure':()=>pending.promise}});
  await flush();f.preset(2);
  // No preference event: the response itself must reveal the intervening STOP/change.
  pending.resolve({...pref(enabled,2,'r3'),superseded:true});await flush();
  assert.equal(f.get('global-toggle').getAttribute('aria-checked'),String(enabled));
  assert.equal(f.value(),'1.00');assert.equal(f.writes().length,1);
  assert.match(f.get('global-note').textContent,/未应用/);
  assert.equal(f.get('refresh').disabled,false);
  const calls=f.calls.length;await flush();assert.equal(f.calls.length,calls,'no retry or polling after superseded');
});
test('superseded enable updates projection without claiming the requested target was applied',async()=>{
  const f=fixture({state:pref(false,3),actual:1.5,handlers:{
    'videoSpeed.global.configure':()=>({...pref(false,2,'stopped'),superseded:true})
  }});
  await flush();f.click('global-toggle');await flush();
  assert.equal(f.writes()[0].args.expectedRevision,'r1');
  assert.equal(f.get('global-toggle').getAttribute('aria-checked'),'false');
  assert.match(f.get('global-note').textContent,/未应用/);
  assert.equal(f.value(),'1.50');assert.equal(f.writes().length,1);
});
test('newer preference with the same target still invalidates an older configure revision',async()=>{
  const pending=deferred(),f=fixture({state:pref(true,1),handlers:{'videoSpeed.global.configure':()=>pending.promise}});
  await flush();f.preset(2);f.send(pref(true,2,'r3'));
  pending.resolve(pref(true,2,'r2'));await flush();
  assert.equal(f.writes().length,1);assert.equal(f.value(),'1.00');
  assert.match(f.get('global-note').textContent,/未应用/);
});
test('STOP before locked page set rejects its revision without a late media write or retry',async()=>{
  const pending=deferred();let shared=pref(true,1),actual=1,mediaWrites=0;
  const f=fixture({state:shared,handlers:{
    'videoSpeed.global.configure':args=>{shared=pref(args.enabled,args.speed,'configured');return shared;},
    'videoSpeed.set':async args=>{
      await pending.promise;
      // Simulate Host validation when the queued operation acquires its tool lock.
      if(Object.hasOwn(args,'expectedRevision')&&(!shared.enabled||shared.revision!==args.expectedRevision||shared.speed!==args.speed))
        throw Object.assign(Error('全局设置已变化，请重新检测'),{code:'E_VIDEO_CHANGED'});
      mediaWrites++;actual=args.speed;return {status:'available',speed:actual};
    },
    'videoSpeed.status':()=>({status:'available',speed:actual})
  }});
  await flush();f.preset(2);await flush();
  assert.deepEqual({...f.writes()[1].args},{speed:2,expectedRevision:'configured'});
  shared=pref(false,2,'stopped');actual=1;pending.resolve();await flush();
  assert.equal(mediaWrites,0);assert.equal(f.value(),'—');
  assert.match(f.get('message').textContent,/重新检测/);
  assert.equal(f.writes().length,2);await flush();assert.equal(f.writes().length,2);
  f.send(shared);await flush();
  assert.equal(f.get('global-toggle').getAttribute('aria-checked'),'false');assert.equal(f.value(),'1.00');
  assert.match(f.get('global-note').textContent,/未确认/);assert.equal(mediaWrites,0);
});
test('STOP sends the known revision but accepts unconditional stop after an unseen change',async()=>{
  let shared=pref(true,3,'unseen');
  const f=fixture({state:pref(true,2),handlers:{'videoSpeed.global.configure':args=>{
    assert.equal(args.enabled,false);assert.equal(args.expectedRevision,'r1');
    assert.notEqual(args.expectedRevision,shared.revision);
    shared=pref(false,args.speed,'stopped');return {...shared,restore:{status:'partial'}};
  }}});
  await flush();f.click('global-toggle');await flush();
  assert.equal(f.get('global-toggle').getAttribute('aria-checked'),'false');
  assert.match(f.get('global-note').textContent,/未知/);assert.equal(f.writes().length,1);
});
test('preference during page set waits to reread; old read cannot replace final actual',async()=>{
  const pending=deferred(),read=deferred(),f=fixture({state:pref(true,1),handlers:{'videoSpeed.set':()=>pending.promise}});
  await flush();f.preset(2);await flush();const readsBefore=f.calls.filter(c=>c.op==='videoSpeed.status').length;
  f.send(pref(true,3,'r3'));assert.equal(f.get('global-toggle').getAttribute('aria-checked'),'true');
  assert.equal(f.calls.filter(c=>c.op==='videoSpeed.status').length,readsBefore);
  f.handlers['videoSpeed.status']=()=>read.promise;pending.resolve({status:'available',speed:2});await flush();
  assert.equal(f.get('refresh').disabled,true);read.resolve({status:'available',speed:3});await flush();
  assert.equal(f.value(),'3.00');assert.equal(f.writes().length,2);assert.equal(f.get('refresh').disabled,false);
  await flush();assert.equal(f.calls.filter(c=>c.op==='videoSpeed.status').length,readsBefore+1,'no polling');
});
test('own preference notification during configure permits exactly one page set',async()=>{
  const pending=deferred(),f=fixture({state:pref(true,1),handlers:{'videoSpeed.global.configure':()=>pending.promise}});
  await flush();f.preset(2);f.send(pref(true,2,'r2'));pending.resolve(pref(true,2,'r2'));await flush();
  assert.equal(f.writes().length,2);assert.equal(f.value(),'2.00');
});
test('pagehide invalidates delayed configure and preference without replay',async()=>{
  const pending=deferred(),f=fixture({state:pref(true,1),handlers:{'videoSpeed.global.configure':()=>pending.promise}});
  await flush();f.preset(2);f.window.dispatchEvent(new f.window.Event('pagehide'));
  pending.resolve(pref(true,2,'r2'));f.send(pref(true,3,'r3'));await flush();assert.equal(f.writes().length,1);
});
test('global shortcut adjusts the actual video and synchronizes shared target; OFF suppresses writes',async()=>{
  const f=fixture({state:pref(true,3),actual:1.5});await flush();f.key('d');await flush();
  assert.equal(f.writes()[0].args.speed,1.75);assert.equal(f.value(),'1.75');
  f.click('shortcut-toggle');await flush();const before=f.writes().length;
  f.key('d');f.key('r');await flush();assert.equal(f.writes().length,before);
});
test('navigation during configure prevents a stale page set and preserves the new read',async()=>{
  const config=deferred(),fresh=deferred();
  const f=fixture({state:pref(true,1),handlers:{'videoSpeed.global.configure':()=>config.promise}});
  await flush();f.preset(2);f.handlers['videoSpeed.status']=()=>fresh.promise;
  f.root.dispatchEvent(new f.window.Event('opendesk-page-changed'));
  config.resolve(pref(true,2,'r2'));await flush();assert.equal(f.writes().length,1);assert.equal(f.get('refresh').disabled,true);
  fresh.resolve({status:'available',speed:1.25});await flush();assert.equal(f.value(),'1.25');
});
