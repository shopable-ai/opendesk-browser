import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTimeReviewService,installTimeReviewService} from '../../src/time-review/service.js';
import {emptyReview,readReview,settleReview,reviewSummary,reviewHost,reviewSettings,reviewExport,TIME_REVIEW_KEY,localDay} from '../../src/time-review/model.js';
import {TIME_REVIEW_PROTOCOL,TIME_REVIEW_ALARM,TIME_REVIEW_SESSION,timeReviewPackageHash} from '../../src/time-review/policy.js';
import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {recordToolUninstall,cleanupUninstalledToolLocked,installReviewedSidebarTool} from '../../src/ui/sidebar-tools/installation.js';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
const event=()=>{const listeners=new Set();return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),emit(...args){for(const fn of listeners)fn(...args);},listeners};};
const lockManager=()=>{const work=new Map();return {request(name,fn){const next=(work.get(name)||Promise.resolve()).catch(()=>{}).then(fn);work.set(name,next);return next;}};};
async function fixture(){
  let at=new Date(2026,9,11,12).getTime(),idle='active',permission=true,origin=true,focused=true,incognito=false;
  let tab={id:11,windowId:2,active:true,url:'https://example.com/path?secret=never-store'};
  const tool=await createSidebarToolPackage('examples/sidebar-tools/time-review');
  const initialHash=await timeReviewPackageHash(tool);
  // Legacy behavioral fixtures begin with a separately consented site scope.
  // R1.5 zero-consent migration and refusal cases live in time-review-r15-site-grants.
  const local={[SIDEBAR_TOOL_STORE]:[structuredClone(tool)],
    [TIME_REVIEW_KEY]:{...emptyReview(),siteGrants:{allSites:true,origins:[]}}},session={},downloads=[],alarms=new Map();
  const area=data=>({async get(keys){return structuredClone(keys===null?data:Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,data[key]])));},async set(rows){Object.assign(data,structuredClone(rows));},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete data[key];}});
  const sender={id:'abcdefghijklmnopabcdefghijklmnop',url:'chrome-extension://abcdefghijklmnopabcdefghijklmnop/ui/tool.html?hostInstanceId=11111111-1111-4111-8111-111111111111&toolId=time-review',documentId:'doc-1',frameId:0,documentLifecycle:'active',tab:{id:99,incognito:false}};
  let contexts=[{contextType:'TAB',documentUrl:sender.url,documentId:sender.documentId,tabId:99,frameId:0,incognito:false}];
  const api={runtime:{id:sender.id,getURL:path=>'chrome-extension://'+sender.id+'/'+path,onMessage:event(),onStartup:event(),async getContexts(){return contexts;}},storage:{local:area(local),session:area(session),onChanged:event()},
    idle:{queryState:async()=>idle,setDetectionInterval:()=>{},onStateChanged:event()},
    permissions:{contains:async query=>query.permissions?permission:origin,onRemoved:event(),onAdded:event()},
    windows:{getLastFocused:async()=>({id:2,type:'normal',focused,incognito}),onFocusChanged:event()},
    tabs:{query:async()=>[{...tab,incognito}],onActivated:event(),onUpdated:event(),onRemoved:event()},
    alarms:{get:async name=>alarms.get(name),create:async(name,value)=>alarms.set(name,value),clear:async name=>alarms.delete(name),onAlarm:event()},
    downloads:{download:async options=>{downloads.push(options);return downloads.length;}}};
  const locks=lockManager(),newService=()=>createTimeReviewService({api,lockManager:locks,now:()=>at});
  let service=newService();
  const call=async(operation,payload={},overrides={})=>service.dispatch({protocol:TIME_REVIEW_PROTOCOL,toolId:'time-review',operation,payload,packageHash:initialHash,installEpoch:null,...overrides},sender);
  return {api,locks,local,session,tool,sender,downloads,alarms,call,newService,invalidate:options=>service.invalidate(options),advance:ms=>at+=ms,get at(){return at;},tick:options=>service.tick(options),restart(){service=newService();},set(values){if('idle'in values)idle=values.idle;if('permission'in values)permission=values.permission;if('origin'in values)origin=values.origin;if('focused'in values)focused=values.focused;if('incognito'in values)incognito=values.incognito;if('tab'in values)tab={...tab,...values.tab};if('contexts'in values)contexts=values.contexts;}};
}
test('domain-only privacy, HTTP(S) and settings boundaries',()=>{
  assert.equal(reviewHost('https://example.com/private?q=secret#token'),'example.com');
  for(const url of ['chrome://settings','file:///tmp/private','https://user:secret@example.com','about:blank'])assert.equal(reviewHost(url),null);
  assert.throws(()=>reviewSettings({idleSeconds:14,retentionDays:90,excludedHosts:[]}));
  assert.throws(()=>reviewSettings({idleSeconds:60,retentionDays:90,excludedHosts:['example.com/path']}));
});
test('exact millisecond conservation and midnight split',()=>{
  const start=new Date(2026,9,11,23,59,50).getTime(),state=emptyReview();
  state.checkpoint={host:'example.com',at:start,session:'s',offset:new Date(start).getTimezoneOffset(),tabId:1,windowId:1};
  const result=settleReview(state,start+20000,{session:'s'});
  assert.equal(result.days['2026-10-11']['example.com'],10000);assert.equal(result.days['2026-10-12']['example.com'],10000);
  assert.equal(reviewSummary(result,start+20000).weekMs,20000);
});
test('sleep, browser restart, clock rollback and timezone changes do not invent activity',()=>{
  const at=Date.now(),base=emptyReview();base.checkpoint={host:'example.com',at,session:'s',offset:new Date(at).getTimezoneOffset(),tabId:1,windowId:1};
  for(const [end,session] of [[at+60000,'s'],[at+10000,'new'],[at-10000,'s']])assert.deepEqual(settleReview(base,end,{session}).days,{});
  base.checkpoint.offset+=60;assert.deepEqual(settleReview(base,at+1000,{session:'s'}).days,{});
});
test('reserved hostname keys remain numeric and CSV does not execute formulas',()=>{
  const state=emptyReview(),at=Date.now();state.checkpoint={host:'constructor',at,session:'s',offset:new Date(at).getTimezoneOffset(),tabId:1,windowId:1};
  const next=settleReview(state,at+1234,{session:'s'});assert.equal(reviewSummary(next,at+1234).todayMs,1234);
  next.days[localDay(at)]['=example.com']=5;assert.match(reviewExport(next,'csv').text,/"'=example.com"/);
});
test('retention, corrupt records and unknown export format fail safely',()=>{
  const state=emptyReview();state.days={'2020-01-01':{'example.com':100}};
  assert.deepEqual(settleReview(state,Date.now(),{session:'s'}).days,{});
  assert.throws(()=>readReview({...state,discardedMs:-1}));assert.throws(()=>reviewExport(state,'html'));
});
test('install and status do not authorize or run background tracking',async()=>{
  const f=await fixture(),result=await f.call('time.status');assert.equal(result.paused,true);assert.equal(result.authorized,false);assert.equal(f.alarms.size,0);assert.equal(f.local[TIME_REVIEW_KEY].checkpoint,null);
});
test('30 second checkpoints track the selected website without storing URLs',async()=>{
  const f=await fixture();await f.call('time.start');f.advance(30000);await f.tick();f.advance(1234);
  const result=await f.call('time.status');assert.equal(result.todayMs,31234);assert.equal(result.trackingHost,'example.com');
  assert.equal(f.alarms.get(TIME_REVIEW_ALARM).periodInMinutes,0.5);assert(!JSON.stringify(f.local[TIME_REVIEW_KEY]).includes('secret'));
});
test('non-default HTTP(S) ports use Chrome valid host patterns with no wildcard-origin expansion',async()=>{
  for(const url of ['http://127.0.0.1:43111/activity','https://example.com:8443/path']){
    const f=await fixture(),seen=[],realContains=f.api.permissions.contains;
    f.set({tab:{url}});
    f.api.permissions.contains=async query=>{
      if(query.origins){
        seen.push(query.origins[0]);
        if(/:(?:43111|8443)\//.test(query.origins[0]))throw Error('Invalid Chrome host match pattern with port');
      }
      return realContains(query);
    };
    await f.call('time.start');
    f.advance(900);
    const state=await f.call('time.status');
    assert.equal(state.todayMs,900,'actual port must not lose activity');
    assert.ok(seen.length>0);
    assert.deepEqual([...new Set(seen)],[new URL(url).protocol+'//'+new URL(url).hostname+'/*']);
    assert(!seen[0].includes('*://*'),'never permit a broader all-host pattern');
  }
});

test('tab switches and same-tab navigation settle previous domains exactly once',async()=>{
  const f=await fixture();await f.call('time.start');f.advance(10000);f.set({tab:{id:12,url:'https://other.example/'}});await f.tick();f.advance(20000);f.set({tab:{url:'https://third.example/'}});await f.tick();
  const result=await f.call('time.status');assert.deepEqual(result.todaySites,[{host:'other.example',ms:20000},{host:'example.com',ms:10000}]);
});
test('idle/locked and unfocused windows stop checkpoints and resume from new input',async()=>{
  for(const change of [{idle:'idle'},{idle:'locked'},{focused:false},{incognito:true},{tab:{url:'chrome://settings'}}]){
    const f=await fixture();await f.call('time.start');f.advance(10000);f.set(change);await f.tick();f.advance(20000);assert.equal((await f.call('time.status')).todayMs,10000);
    f.set({idle:'active',focused:true,incognito:false,tab:{url:'https://example.com/'}});await f.tick();f.advance(5000);assert.equal((await f.call('time.status')).todayMs,15000);
  }
});
test('pause and explicit resume preserve statistics but exclude paused time',async()=>{
  const f=await fixture();await f.call('time.start');f.advance(8000);await f.call('time.pause');f.advance(10000);await f.call('time.start');f.advance(2000);assert.equal((await f.call('time.status')).todayMs,10000);
});
test('SW restart uses same browser-session bounded live checkpoint; long gaps excluded',async()=>{
  const f=await fixture();await f.call('time.start');f.advance(20000);f.restart();await f.tick({boot:true});assert.equal((await f.call('time.status')).todayMs,20000);
  f.advance(60000);f.restart();await f.tick({boot:true});assert.equal((await f.call('time.status')).todayMs,20000);assert.equal(f.local[TIME_REVIEW_KEY].discardedMs,60000);
});
test('browser session restart preserves totals but does not credit downtime',async()=>{
  const f=await fixture();await f.call('time.start');f.advance(10000);await f.tick();delete f.session[TIME_REVIEW_SESSION];f.advance(10000);f.restart();await f.tick({boot:true});assert.equal((await f.call('time.status')).todayMs,10000);
});
test('different live tab at SW boot is conservatively excluded',async()=>{
  const f=await fixture();await f.call('time.start');f.advance(10000);f.set({tab:{id:12,url:'https://other.example'}});f.restart();await f.tick({boot:true});assert.equal((await f.call('time.status')).todayMs,0);
});
test('browser idle permission revocation stops and does not auto-resume on regrant',async()=>{
  const f=await fixture();await f.call('time.start');f.advance(5000);await f.tick();f.set({permission:false});await f.tick();assert.equal(f.local[TIME_REVIEW_KEY].paused,true);assert.equal(f.alarms.size,0);
  await assert.rejects(f.call('time.start'),{code:'E_TIME_PERMISSION'});f.set({permission:true});assert.equal((await f.call('time.status')).paused,true);
});
test('site permission loss excludes inaccessible pages and future time',async()=>{
  const f=await fixture();await f.call('time.start');f.advance(5000);f.set({origin:false});await f.tick();f.advance(10000);assert.equal((await f.call('time.status')).todayMs,5000);assert.equal(f.local[TIME_REVIEW_KEY].checkpoint,null);
});
test('disabled tool and package update revoke old tracking authority',async()=>{
  const f=await fixture();await f.call('time.start');f.local[SIDEBAR_TOOL_ENABLE_STORE]={'time-review':false};await f.tick();assert.equal(f.local[TIME_REVIEW_KEY].authorizedHash,null);
  await assert.rejects(f.call('time.start'),{code:'E_TOOL_CHANGED'});f.local[SIDEBAR_TOOL_ENABLE_STORE]={};await f.call('time.start');f.local[SIDEBAR_TOOL_STORE][0].js+='\n// update';await f.tick();assert.equal(f.local[TIME_REVIEW_KEY].paused,true);await assert.rejects(f.call('time.status'),{code:'E_TOOL_CHANGED'});
});
test('forged sender, document, package, install generation and arbitrary operations rejected',async()=>{
  const f=await fixture(),message={protocol:TIME_REVIEW_PROTOCOL,toolId:'time-review',operation:'time.start',payload:{},packageHash:await timeReviewPackageHash(f.tool),installEpoch:null};
  for(const sender of [{...f.sender,id:'foreign'},{...f.sender,url:'https://example.com'},{...f.sender,frameId:1},{...f.sender,documentId:'old'},{...f.sender,tab:{id:99,incognito:true}}])await assert.rejects(f.newService().dispatch(message,sender));
  await assert.rejects(f.call('time.status',{}, {packageHash:'0'.repeat(64)}));await assert.rejects(f.call('time.status',{}, {installEpoch:'old'}));await assert.rejects(f.call('time.inject'));
  assert.deepEqual(f.local[TIME_REVIEW_KEY],{...emptyReview(),siteGrants:{allSites:true,origins:[]}});
});
test('date totals and export use explicit clear confirmation and actual download request',async()=>{
  const f=await fixture();await f.call('time.start');f.advance(1000);await f.call('time.pause');
  await assert.rejects(f.call('time.clear'),{code:'E_TIME_CONFIRM'});const result=await f.call('time.export',{format:'csv'});assert.equal(result.downloadId,1);assert.match(decodeURIComponent(f.downloads[0].url),/example.com/);
  assert.match(f.downloads[0].url,/^data:text\/csv;name=time-review\.csv;charset=utf-8,/);
  assert.equal(f.downloads[0].filename,'time-review.csv');
  assert.equal(f.downloads[0].saveAs,false);
  assert.equal(f.downloads[0].conflictAction,'uniquify');
  await f.call('time.export',{format:'json'});
  assert.match(f.downloads[1].url,/^data:application\/json;name=time-review\.json;charset=utf-8,/);
  assert.equal(f.downloads[1].filename,'time-review.json');
  assert.equal((await f.call('time.clear',{confirm:true})).todayMs,0);assert.equal(f.local[TIME_REVIEW_KEY].paused,true);
});
test('concurrent export requests stay serialized, use safe filenames and never claim a completed disk download',async()=>{
  const f=await fixture();const requests=await Promise.all([
    f.call('time.export',{format:'json'}),f.call('time.export',{format:'csv'})
  ]);
  assert.deepEqual(requests.map(row=>row.state),['requested','requested']);
  assert.deepEqual(f.downloads.map(row=>row.filename),['time-review.json','time-review.csv']);
  assert.ok(f.downloads.every(row=>row.saveAs===false&&row.conflictAction==='uniquify'));
  f.api.downloads.download=async()=>{throw Error('browser rejected download');};
  await assert.rejects(f.call('time.export',{format:'json'}),/browser rejected download/);
});
test('excluded domains include subdomains and settings change settlement preserves prior time',async()=>{
  const f=await fixture();await f.call('time.start');f.advance(5000);await f.call('time.settings',{idleSeconds:15,retentionDays:7,excludedHosts:['example.com']});f.set({tab:{url:'https://sub.example.com'}});await f.tick();f.advance(5000);assert.equal((await f.call('time.status')).todayMs,5000);
});
test('uninstall cleanup removes durable records and tick never resurrects them',async()=>{
  const f=await fixture();await f.call('time.start');await recordToolUninstall(f.api,f.tool);f.local[SIDEBAR_TOOL_STORE]=[];await cleanupUninstalledToolLocked(f.api,'time-review');await f.tick();assert.equal(f.local[TIME_REVIEW_KEY],undefined);assert.equal(f.alarms.size,0);
  await installReviewedSidebarTool({api:f.api,lockManager:f.locks,candidate:f.tool,baseline:null,reviewApproved:true});assert.equal((await f.call('time.status',{}, {installEpoch:f.local[TOOL_REVOCATION_EPOCHS_STORE]['time-review']})).authorized,false);
});
test('serialized concurrent reads do not double-count an interval',async()=>{
  const f=await fixture();await f.call('time.start');f.advance(10000);await Promise.all([f.tick(),f.call('time.status'),f.tick()]);assert.equal((await f.call('time.status')).todayMs,10000);
});
test('failed storage write protects existing records and does not fabricate success',async()=>{
  const f=await fixture();f.api.storage.local.set=async()=>{throw new Error('disk write failure');};await assert.rejects(f.call('time.start'),{code:'E_HOST_STORAGE_WRITE'});assert.deepEqual(f.local[TIME_REVIEW_KEY],{...emptyReview(),siteGrants:{allSites:true,origins:[]}});
});
test('listener lifecycle attaches synchronously and disposes without duplicate handlers',async()=>{
  const f=await fixture(),service=installTimeReviewService({api:f.api,lockManager:f.locks,now:()=>f.at});assert.equal(f.api.runtime.onMessage.listeners.size,1);assert.equal(f.api.alarms.onAlarm.listeners.size,1);service.dispose();assert.equal(f.api.runtime.onMessage.listeners.size,0);assert.equal(f.api.tabs.onActivated.listeners.size,0);
});
test('unrelated tool installation never revokes an active Time Review checkpoint',async()=>{
  const f=await fixture();
  await f.call('time.start');
  const hosted=installTimeReviewService({api:f.api,lockManager:f.locks,now:()=>f.at});
  await hosted.service.tick();
  const before=structuredClone(f.local[SIDEBAR_TOOL_STORE]);
  const other={...f.tool,id:'other-tool',title:'Another tool'};
  f.local[SIDEBAR_TOOL_STORE]=[...before,other];
  f.api.storage.onChanged.emit({[SIDEBAR_TOOL_STORE]:{
    oldValue:before,newValue:f.local[SIDEBAR_TOOL_STORE]
  }},'local');
  f.advance(2000);
  await hosted.service.tick();
  const state=await f.call('time.status');
  assert.equal(state.paused,false,'unrelated install may not revoke this tool');
  assert.equal(state.todayMs,2000);
  assert.equal(state.trackingHost,'example.com');
  const current=structuredClone(f.local[SIDEBAR_TOOL_STORE]);
  f.local[SIDEBAR_TOOL_STORE][0].js+='\\n// updated Time Review';
  f.api.storage.onChanged.emit({[SIDEBAR_TOOL_STORE]:{
    oldValue:current,newValue:f.local[SIDEBAR_TOOL_STORE]
  }},'local');
  await hosted.service.tick();
  assert.equal(f.local[TIME_REVIEW_KEY].paused,true,
    'changing this exact installed package must retire tracking');
  assert.equal(f.local[TIME_REVIEW_KEY].checkpoint,null);
  hosted.dispose();
});
test('official tool uses reviewed capability and optional catalog; MV3 permissions and fixed host',async()=>{
  const tool=validateSidebarToolPackage(await createSidebarToolPackage('examples/sidebar-tools/time-review'));assert.deepEqual(tool.capabilities,['time.review','user.export']);
  const catalog=JSON.parse(await readFile('official-tools/catalog.json','utf8'));assert.equal(catalog.tools.find(row=>row.id==='time-review').installationPolicy,'optional');
  const manifest=JSON.parse(await readFile('manifest.json','utf8'));assert(manifest.permissions.includes('alarms'));assert(manifest.optional_permissions.includes('idle'));assert(!manifest.permissions.includes('idle'));
});
test('durable authorization binds revocation epoch even if uninstall fails before registry removal',async()=>{
  const f=await fixture();await f.call('time.start');f.local[TOOL_REVOCATION_EPOCHS_STORE]={'time-review':'new-epoch'};await f.tick();assert.equal(f.local[TIME_REVIEW_KEY].paused,true);assert.equal(f.local[TIME_REVIEW_KEY].authorizedHash,null);assert.equal(f.local[TIME_REVIEW_KEY].checkpoint,null);
});
test('clock rollback and later correction never double-count previously settled time',async()=>{
  const f=await fixture();await f.call('time.start');f.advance(10000);await f.tick();f.advance(-5000);await f.tick();assert.equal(f.local[TIME_REVIEW_KEY].checkpoint,null);f.advance(15000);assert.equal((await f.call('time.status')).todayMs,10000);f.advance(5000);assert.equal((await f.call('time.status')).todayMs,15000);
});
test('host disappearing during browser observation rejects mutation before storage write',async()=>{
  const f=await fixture(),query=f.api.tabs.query;f.api.tabs.query=async()=>{f.set({contexts:[]});return query();};await assert.rejects(f.call('time.start'),{code:'E_TIME_AUTHORITY'});assert.deepEqual(f.local[TIME_REVIEW_KEY],{...emptyReview(),siteGrants:{allSites:true,origins:[]}});
});
test('invalidated async observation cannot authorize or create stale checkpoint',async()=>{
  const f=await fixture(),query=f.api.tabs.query;f.api.tabs.query=async()=>{f.invalidate();f.set({idle:'idle'});f.advance(10000);return query();};await assert.rejects(f.call('time.start'),{code:'E_TIME_OBSERVATION'});assert.deepEqual(f.local[TIME_REVIEW_KEY],{...emptyReview(),siteGrants:{allSites:true,origins:[]}});
});
test('revocation remains latched after a quick regrant and requires explicit new start',async()=>{
  const f=await fixture();await f.call('time.start');f.invalidate({revoke:true});f.set({permission:true});await f.tick();assert.equal(f.local[TIME_REVIEW_KEY].authorizedHash,null);assert.equal(f.local[TIME_REVIEW_KEY].paused,true);await f.call('time.start');assert.equal(f.local[TIME_REVIEW_KEY].paused,false);
});
test('activity change during slow durable write retires checkpoint before next settlement',async()=>{
  const f=await fixture();await f.call('time.start');f.advance(1000);const write=f.api.storage.local.set;let once=true;
  f.api.storage.local.set=async rows=>{if(once){once=false;f.invalidate();f.set({idle:'idle'});f.advance(10000);}await write(rows);};
  await f.tick();assert.equal(f.local[TIME_REVIEW_KEY].checkpoint,null);assert.equal((await f.call('time.status')).todayMs,1000);
});
test('runtime startup listener restores alarm path and is disposed',async()=>{
  const f=await fixture();await f.call('time.start');const installed=installTimeReviewService({api:f.api,lockManager:f.locks,now:()=>f.at});await installed.service.tick();f.alarms.clear();assert.equal(f.api.runtime.onStartup.listeners.size,1);f.api.runtime.onStartup.emit();await new Promise(resolve=>setTimeout(resolve,0));await installed.service.tick();assert.equal(f.alarms.get(TIME_REVIEW_ALARM).periodInMinutes,0.5);installed.dispose();assert.equal(f.api.runtime.onStartup.listeners.size,0);
});
test('real Side Panel sender without documentId resolves a unique native context',async()=>{
  const f=await fixture();delete f.sender.tab;delete f.sender.documentId;
  f.set({contexts:[{contextType:'SIDE_PANEL',documentUrl:f.sender.url,documentId:'side-doc',frameId:0,incognito:false,tabId:-1}]});
  assert.equal((await f.call('time.start')).authorized,true);
  assert.ok(f.local[TIME_REVIEW_KEY].checkpoint);
});
test('resolved Side Panel document remains pinned across asynchronous observation',async()=>{
  const f=await fixture();delete f.sender.tab;delete f.sender.documentId;
  const context={contextType:'SIDE_PANEL',documentUrl:f.sender.url,documentId:'side-doc',frameId:0,incognito:false,tabId:-1};
  f.set({contexts:[context]});
  const query=f.api.tabs.query;f.api.tabs.query=async()=>{f.set({contexts:[{...context,documentId:'replacement'}]});return query();};
  await assert.rejects(f.call('time.start'),/文档已变化/);
  assert.deepEqual(f.local[TIME_REVIEW_KEY],{...emptyReview(),siteGrants:{allSites:true,origins:[]}});
});
