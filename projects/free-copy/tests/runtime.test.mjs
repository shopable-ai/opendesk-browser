import assert from 'node:assert/strict';
import test from 'node:test';
import {createFreeCopyRuntime,effectiveFreeCopy,normalizeFreeCopySettings} from '../src/page/runtime.js';

function fixture(){
  let closed=false,revoked=false,value=null,timerId=0;
  const timers=new Map(),disposers=[],requests=[];
  const win={location:{href:'https://example.com/one'},
    setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},
    clearTimeout(id){timers.delete(id);}};
  const doc={defaultView:win};
  const ui={active:()=>!closed,onDispose(fn){disposers.push(fn);},on(){},
    destroy(){if(!closed){closed=true;for(const fn of disposers)fn();}}};
  const bridge={async readContext(){if(revoked)throw Error('E_AUTHORIZATION');},
    storage:{async get({key,withEtag}){assert.equal(key,'preferences');assert.equal(withEtag,true);
      return {value,etag:'v1'};}},
    onRequest(fn){requests.push(fn);return ()=>requests.splice(requests.indexOf(fn),1);}};
  const state={active:false};
  const mount=({enabled})=>({isActive:()=>state.active,setEnabled(next){state.active=next;}});
  const runtime=createFreeCopyRuntime({ui,bridge,doc,win,mount});
  return {runtime,ui,state,requests,timers,win,
    set(v){value=v;},revoke(){revoked=true;},isClosed:()=>closed};
}
test('defaults to enabled after authorized installation; origin exception takes precedence',async()=>{
  const f=fixture();
  assert.deepEqual(await f.runtime.ready,{state:'ready',enabled:true});
  assert.equal(f.state.active,true);
  f.set({enabled:true,disabledOrigins:['https://example.com']});
  assert.equal((await f.requests[0]({operation:'copy.refresh'})).enabled,false);
  assert.equal(f.state.active,false);
  f.win.location.href='https://different.example/path';
  assert.equal((await f.requests[0]({operation:'copy.refresh'})).enabled,true);
  f.set({enabled:false,disabledOrigins:[]});
  assert.equal((await f.requests[0]({operation:'copy.refresh'})).enabled,false);
  f.ui.destroy();assert.equal(f.timers.size,0);assert.equal(f.requests.length,0);
});
test('malformed settings are not silently treated as permission to run',()=>{
  assert.deepEqual(normalizeFreeCopySettings(null),{enabled:true,disabledOrigins:[]});
  assert.equal(effectiveFreeCopy(null,'https://example.com/'),true);
  assert.throws(()=>normalizeFreeCopySettings({enabled:'yes'}),/E_FREE_COPY_SETTINGS/);
  assert.throws(()=>normalizeFreeCopySettings({disabledOrigins:['javascript:alert(1)']}),/E_FREE_COPY_SETTINGS/);
  assert.equal(effectiveFreeCopy({disabledOrigins:['https://example.com']},'https://example.com/a'),false);
});
test('unsupported operations fail, and revoked authority destroys the page instance',async()=>{
  const f=fixture();await f.runtime.ready;
  await assert.rejects(f.requests[0]({operation:'other.action'}),/E_FREE_COPY_OPERATION/);
  f.revoke();await assert.rejects(f.runtime.readPolicy(),/E_AUTHORIZATION/);
  assert.equal(f.isClosed(),true);assert.equal(f.state.active,false);
  assert.equal(f.timers.size,0);
});
test('timer rereads current saved settings, and stale disposed instance cannot resume',async()=>{
  const f=fixture();await f.runtime.ready;
  const [id,timer]=[...f.timers.entries()][0];
  assert.equal(timer.ms,1200);
  f.timers.delete(id);f.set({enabled:false});
  await timer.fn();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.state.active,false);
  assert.equal(f.timers.size,1);
  f.runtime.dispose();
  assert.equal(f.timers.size,0);
  f.set({enabled:true});
  assert.equal(await f.runtime.readPolicy(),false);
  assert.equal(f.state.active,false);
});
