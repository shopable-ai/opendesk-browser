import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTimeReviewService,installTimeReviewService} from '../../src/time-review/service.js';
import {TIME_REVIEW_KEY,emptyReview,readReview} from '../../src/time-review/model.js';
import {TIME_REVIEW_PROTOCOL,TIME_REVIEW_HOST_API,timeReviewPackageHash,timeReviewSiteOrigin,
  changeTimeReviewSiteGrants,requireTimeReviewSiteGrants} from '../../src/time-review/policy.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {createTimeReviewPermissionControls} from '../../src/time-review/host-controls.js';
import {makeTimeReviewDOM,TIME_CONTROL_IDS} from './time-review-host-controls-fixture.mjs';

function lockManager(){
  const queue=new Map();
  return {request(key,fn){
    const result=(queue.get(key)||Promise.resolve()).then(fn);
    queue.set(key,result.catch(()=>{}));return result;
  }};
}
function area(data){
  return {
    async get(keys){return structuredClone(keys===null?data:Object.fromEntries(
      (Array.isArray(keys)?keys:[keys]).map(key=>[key,data[key]])));},
    async set(value){Object.assign(data,structuredClone(value));},
    async remove(key){delete data[key];}
  };
}
async function fixture({preexisting}={}){
  let at=new Date(2026,9,13,12).getTime(),url='https://alpha.example/article?search=secret';
  const tool=await createSidebarToolPackage('examples/sidebar-tools/time-review');
  const hash=await timeReviewPackageHash(tool);
  const local={[SIDEBAR_TOOL_STORE]:[tool]},session={},alarms=new Map();
  if(preexisting)local[TIME_REVIEW_KEY]=structuredClone(preexisting);
  const sender={
    id:'abcdefghijklmnopabcdefghijklmnop',
    url:'chrome-extension://abcdefghijklmnopabcdefghijklmnop/ui/tool.html?hostInstanceId=11111111-1111-4111-8111-111111111111&toolId=time-review',
    documentId:'real-doc',frameId:0,documentLifecycle:'active',tab:{id:99,incognito:false}
  };
  const api={
    runtime:{id:sender.id,getURL:p=>'chrome-extension://'+sender.id+'/'+p,
      async getContexts(){return [{contextType:'TAB',documentUrl:sender.url,documentId:sender.documentId,
        tabId:99,frameId:0,incognito:false}];}},
    storage:{local:area(local),session:area(session)},
    // Simulate a manifest with <all_urls> and an already approved Chrome idle grant.
    // Neither one authorizes this specific tool to collect a website.
    permissions:{async contains(){return true;}},
    idle:{setDetectionInterval(){},async queryState(){return 'active';}},
    windows:{async getLastFocused(){return {id:2,focused:true,type:'normal',incognito:false};}},
    tabs:{async query(){return [{id:5,windowId:2,url,active:true,incognito:false}];}},
    alarms:{async create(id,data){alarms.set(id,data);},async get(id){return alarms.get(id);},
      async clear(id){alarms.delete(id);}}
  };
  const service=createTimeReviewService({api,lockManager:lockManager(),now:()=>at});
  const call=(operation,payload={})=>service.dispatch({protocol:TIME_REVIEW_PROTOCOL,toolId:'time-review',
    packageHash:hash,installEpoch:null,operation,payload},sender);
  return {api,local,alarms,call,service,tool,hash,advance(ms){at+=ms;},site(next){url=next;}};
}

test('R1.5 old v1 data stays intact and defaults to ZERO site collection authority',async()=>{
  const state=emptyReview();delete state.siteGrants;
  state.days['2026-10-12']={'alpha.example':4200};
  const restored=readReview(state);
  assert.deepEqual(restored.siteGrants,{allSites:false,origins:[]});
  assert.equal(restored.days['2026-10-12']['alpha.example'],4200);
  const f=await fixture({preexisting:state});
  assert.equal((await f.call('time.status')).todayMs,0);
  await assert.rejects(f.call('time.start'),{code:'E_TIME_SITE_GRANT'});
  assert.equal(f.local[TIME_REVIEW_KEY].checkpoint,null);
  assert.equal(f.alarms.size,0);
});
test('R1.5 even with manifest all_urls only a separately granted precise origin accrues time',async()=>{
  const f=await fixture();
  const first=await f.call('time.siteGrant',{mode:'site',origin:'https://alpha.example',allow:true});
  assert.deepEqual(first.siteGrants,{allSites:false,origins:['https://alpha.example']});
  assert.equal(first.hostApiVersion,TIME_REVIEW_HOST_API);
  await f.call('time.start');
  f.advance(8000);await f.service.tick();
  f.site('https://beta.example/?key=do-not-save');await f.service.tick();
  f.advance(11000);
  let status=await f.call('time.status');
  assert.equal(status.todayMs,8000);
  assert.equal(status.trackingHost,null);
  assert.equal(status.waitingReason,'site-not-authorized');
  assert.equal(JSON.stringify(f.local[TIME_REVIEW_KEY]).includes('do-not-save'),false);
  f.site('https://alpha.example/other?q=secret');
  await f.service.tick();f.advance(2300);
  status=await f.call('time.status');
  assert.equal(status.todayMs,10300);
  assert.equal(status.trackingHost,'alpha.example');
});
test('R1.5 revoking an individual site retires checkpoint immediately and preserves past time',async()=>{
  const f=await fixture();
  await f.call('time.siteGrant',{mode:'site',origin:'https://alpha.example',allow:true});
  await f.call('time.start');
  f.advance(3000);
  const revoked=await f.call('time.siteGrant',{mode:'site',origin:'https://alpha.example',allow:false});
  assert.equal(revoked.todayMs,3000);
  assert.deepEqual(revoked.siteGrants,{allSites:false,origins:[]});
  assert.equal(revoked.paused,true);
  assert.equal(f.local[TIME_REVIEW_KEY].checkpoint,null);
  f.advance(9000);
  assert.equal((await f.call('time.status')).todayMs,3000);
  await assert.rejects(f.call('time.start'),{code:'E_TIME_SITE_GRANT'});
});
test('R1.5 all-site consent is distinct, explicit, reversible, and never implied by update',async()=>{
  const f=await fixture();
  await f.call('time.siteGrant',{mode:'all',enabled:true});
  await f.call('time.start');
  f.advance(4000);await f.service.tick();
  f.site('http://beta.example/path');
  await f.service.tick();f.advance(5000);
  assert.equal((await f.call('time.status')).todayMs,9000);
  const revoked=await f.call('time.siteGrant',{mode:'all',enabled:false});
  assert.equal(revoked.paused,true);
  assert.equal(revoked.siteGrants.allSites,false);
  const saved=readReview(f.local[TIME_REVIEW_KEY]);
  assert.equal(saved.days['2026-10-13']['alpha.example'],4000);
  assert.equal(saved.days['2026-10-13']['beta.example'],5000);
});
test('R1.5 site grant payloads are bounded and malformed legacy grants fail closed',()=>{
  assert.equal(timeReviewSiteOrigin('chrome://settings'),null);
  assert.equal(timeReviewSiteOrigin('https://user:password@example.com'),null);
  assert.equal(timeReviewSiteOrigin('https://example.com/private?q=do-not-save'),'https://example.com');
  assert.throws(()=>changeTimeReviewSiteGrants(undefined,{mode:'site',origin:'https://example.com/private',allow:true}),{code:'E_TIME_SITE_GRANT'});
  assert.throws(()=>changeTimeReviewSiteGrants(undefined,{mode:'all',enabled:'true'}),{code:'E_TIME_SITE_GRANT'});
  assert.throws(()=>requireTimeReviewSiteGrants({allSites:true,origins:['https://example.com']}),{code:'E_TIME_SITE_GRANT'});
  const state=emptyReview();state.siteGrants={allSites:true,origins:['https://example.com']};
  assert.throws(()=>readReview(state),{code:'E_TIME_SITE_GRANT'});
});
test('R1.5 changing installed tool enabled flag fences business RPC',async()=>{
  const f=await fixture();
  await f.call('time.siteGrant',{mode:'all',enabled:true});
  await f.call('time.start');
  f.local[SIDEBAR_TOOL_ENABLE_STORE]={'time-review':false};
  await assert.rejects(f.call('time.status'),{code:'E_TOOL_CHANGED'});
});
function find(root,id){
  if(root.id===id)return root;
  for(const child of root.children){const found=find(child,id);if(found)return found;}
  return null;
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('R1.5 trusted host requires reviewed site / all-site clicks and never stores URL paths',async()=>{
  const {root,doc}=makeTimeReviewDOM(),actions=[],messages=[];
  let tab='https://alpha.example/search?q=do-not-store';
  let grants={allSites:false,origins:[]};
  const api={
    windows:{getLastFocused:async()=>({id:2,type:'normal',focused:true,incognito:false})},
    tabs:{query:async()=>[{id:4,url:tab,incognito:false}]},
    storage:{local:{get:async()=>({[TIME_REVIEW_KEY]:{siteGrants:grants}})}},
    permissions:{request:async()=>true,remove:async()=>true}
  };
  const c=createTimeReviewPermissionControls({api,doc,container:root,
    notice:(message,problem)=>messages.push({message,problem}),
    runOperation:async(op,payload)=>{
      actions.push([op,payload]);
      if(op==='time.siteGrant')grants=changeTimeReviewSiteGrants(grants,payload);
      return {siteGrants:grants};
    }});
  c.render({id:'time-review',capabilities:['time.review']});
  await flush();
  const open=find(root,'time-review-site-current-open'),confirm=find(root,'time-review-site-current-approve');
  open.emit('click',false);await flush();assert.equal(find(root,'time-review-site-confirm').hidden,true);
  open.emit('click',true);await flush();
  assert.equal(find(root,'time-review-site-confirm').hidden,false);
  assert(!find(root,'time-review-site-confirm').children[0].textContent.includes('do-not-store'));
  tab='https://beta.example/';
  confirm.emit('click',true);await flush();
  assert.deepEqual(actions,[],'website changed after review: consent must not be applied');
  tab='https://alpha.example/';
  open.emit('click',true);await flush();
  confirm.emit('click',false);await flush();assert.equal(actions.length,0);
  confirm.emit('click',true);await flush();
  assert.deepEqual(actions,[['time.siteGrant',{mode:'site',origin:'https://alpha.example',allow:true}]]);
  const all=find(root,'time-review-site-all-open'),allApprove=find(root,'time-review-site-all-approve');
  all.emit('click',true);await flush();
  allApprove.emit('click',false);await flush();assert.equal(actions.length,1);
  allApprove.emit('click',true);await flush();
  assert.deepEqual(actions[1],['time.siteGrant',{mode:'all',enabled:true}]);
  c.render({id:'other-tool',capabilities:['time.review']});
  assert.equal(root.children[0].hidden,true);
  assert.ok(messages.some(m=>m.problem));
});
test('R1.5 sandbox cannot grant website or all-sites permissions',async()=>{
  const source=await readFile('src/ui/sidebar-tools.js','utf8');
  const i=source.indexOf('if(TIME_REVIEW_OPERATIONS.includes(operation)){');
  const block=source.slice(i,source.indexOf("if(operation==='knowledge.editorState')",i));
  assert.match(block,/operation==='time\.siteGrant'/);
  assert.match(block,/E_TIME_TRUSTED_CLICK/);
  assert.match(source,/!\['time\.start','time\.clear','time\.minuteConsent','time\.siteGrant'\]\.includes\(operation\)/);
});

test('R1.5 static trusted permission elements are part of the real tool host HTML',async()=>{
  const html=await readFile('src/ui/tool.html','utf8');
  for(const id of ['time-review-permission-settings','time-review-site-grants-list',
    'time-review-site-grants-status','time-review-site-confirm','time-review-site-all-confirm',
    'time-review-inline-clear-review','time-review-minute-delete-review',
    ...TIME_CONTROL_IDS]){
    assert.match(html,new RegExp('id="'+id+'"'),'missing trusted control '+id);
  }
  const css=await readFile('src/ui/tool-shell.css','utf8');
  assert.match(css,/\.time-review-trusted-actions\[hidden\]\{display:none!important\}/);
});

test('R1.5 missing trusted HTML fails closed only for Time Review, not unrelated tools',()=>{
  const controls=createTimeReviewPermissionControls({
    api:{},doc:{getElementById:()=>null},container:null,
    notice:()=>{},runOperation:async()=>{throw Error('should not run');}
  });
  assert.doesNotThrow(()=>controls.render({id:'quick-notes',capabilities:[]}));
  assert.throws(()=>controls.render({id:'time-review',capabilities:['time.review']}),
    /trusted controls are missing/);
});

test('R1.5 unrelated Chrome origin removal does not revoke Time Review site consent',async()=>{
  const f=await fixture();
  await f.call('time.siteGrant',{mode:'site',origin:'https://alpha.example',allow:true});
  await f.call('time.start');
  const emitter=()=>{
    const listeners=new Set();
    return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),
      emit:(...args)=>{for(const fn of listeners)fn(...args);}};
  };
  f.api.runtime.onMessage=emitter();f.api.runtime.onStartup=emitter();
  f.api.tabs.onActivated=emitter();f.api.tabs.onUpdated=emitter();f.api.tabs.onRemoved=emitter();
  f.api.windows.onFocusChanged=emitter();
  f.api.idle.onStateChanged=emitter();f.api.alarms.onAlarm=emitter();
  f.api.permissions.onRemoved=emitter();f.api.permissions.onAdded=emitter();
  f.api.storage.onChanged=emitter();
  const installed=installTimeReviewService({api:f.api,lockManager:lockManager(),
    now:()=>new Date(2026,9,13,12).getTime()});
  try{
    await installed.service.tick();
    f.api.permissions.onRemoved.emit({origins:['https://unrelated.example/*'],permissions:[]});
    await installed.service.tick();
    const unchanged=await f.call('time.status');
    assert.equal(unchanged.paused,false,'unrelated tools must not stop an approved Time Review');
    assert.deepEqual(unchanged.siteGrants,{allSites:false,origins:['https://alpha.example']});
    assert.equal(unchanged.trackingHost,'alpha.example');
    f.api.permissions.onRemoved.emit({permissions:['idle'],origins:[]});
    await installed.service.tick();
    const revoked=await f.call('time.status');
    assert.equal(revoked.paused,true,'idle removal must still fail closed');
    assert.equal(revoked.authorized,false);
  }finally{installed.dispose();}
});

test('R1.5.1 official tool package version advances without changing the trusted Host API',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/time-review');
  assert.equal(pkg.version,'1.5.2');
  assert.equal(TIME_REVIEW_HOST_API,'time.review/1.5.0');
});
