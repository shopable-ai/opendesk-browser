import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../../scripts/build-sidebar-tool.mjs';
import {createGlobalVideoSpeedService,restoreControlledVideoSpeed,readRestoredVideoSpeed} from '../trusted/service.js';
import {pageVideoSpeed} from '../trusted/host.js';
import {admitsOfficialVideoSpeed,VIDEO_SPEED_VERSION,VIDEO_SPEED_MARKET_ID} from '../trusted/admission.js';
import {VIDEO_SPEED_ID as ID,VIDEO_SPEED_GLOBAL_STORE as STORE,VIDEO_SPEED_GLOBAL_PROTOCOL as PROTOCOL} from '../trusted/policy.js';
import {SIDEBAR_TOOL_STORE} from '../../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../../src/ui/sidebar-tools/lifecycle.js';
import {MARKET_PROVENANCE_STORE} from '../../../src/ui/sidebar-tools/installation.js';
import {OFFICIAL_CATALOG_PATH,OFFICIAL_RELEASE_SCHEMA,OFFICIAL_SOURCE_REPOSITORY,officialPackagePath} from '../../../src/sidebar-tools/official-catalog.js';

// Ownership: this file only. These are Node service regressions, not Chrome
// installation evidence. Build in memory; never replace the official JSON.
const tool=await createSidebarToolPackage('projects/video-speed-controller');
const bytes=encodeSidebarToolPackage(tool);
const sha256=createHash('sha256').update(bytes).digest('hex');
const release={id:VIDEO_SPEED_MARKET_ID,toolId:ID,kind:'sidebar-tool',installationPolicy:'optional',
  version:VIDEO_SPEED_VERSION,packageTitle:tool.title,description:tool.description,
  capabilities:tool.capabilities,packagePath:officialPackagePath(ID),bytes:bytes.length,sha256};
const clone=value=>structuredClone(value);
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
async function until(predicate,label){
  for(let i=0;i<1000;i++){if(predicate())return;await delay(1);}
  assert.fail('Timed out: '+label);
}
function video(source='https://cdn.example/a.mp4',rate=1){
  let speed=rate;
  return {currentSrc:source,src:source,isConnected:true,paused:false,ended:false,
    writes:[],throwOnSet:false,ignoreSet:false,
    get playbackRate(){return speed;},
    set playbackRate(value){this.writes.push(value);if(this.throwOnSet)throw Error('hostile setter');if(!this.ignoreSet)speed=value;},
    override(value){speed=value;},getBoundingClientRect:()=>({width:800,height:450})};
}
function fixture(t){
  const epoch='video-install-epoch',extensionId='a'.repeat(32);
  const url=path=>'chrome-extension://'+extensionId+'/'+path;
  const host={id:extensionId,url:url('sidepanel.html?hostInstanceId=00000000-0000-4000-8000-000000000001&toolId='+ID),
    documentId:'host-document',frameId:0};
  const contexts=[{contextType:'SIDE_PANEL',documentUrl:host.url,documentId:host.documentId,frameId:0,tabId:-1,incognito:false}];
  const tab={id:4,windowId:1,url:'https://media.example/watch',active:true,incognito:false};
  const frames=[{frameId:0,documentId:'top-document',url:tab.url,documentLifecycle:'active'}];
  const docs=new Map([[frames[0].documentId,{nodes:[],querySelectorAll(){return this.nodes;}}]]);
  const data={
    [SIDEBAR_TOOL_STORE]:[clone(tool)],[SIDEBAR_TOOL_ENABLE_STORE]:{},
    [TOOL_REVOCATION_EPOCHS_STORE]:{[ID]:epoch},
    [MARKET_PROVENANCE_STORE]:{[ID]:{marketId:VIDEO_SPEED_MARKET_ID,version:VIDEO_SPEED_VERSION,sha256}}
  };
  const calls=[],sets=[],messages=[],storageEvents=[],locks=[];
  let sequence=Promise.resolve(),lockWork=0,activity=0,service;
  const f={data,host,contexts,tab,frames,docs,calls,sets,messages,storageEvents,locks,
    permission:true,unknownStorage:false,lostStorageAck:false,beforeScript:null,beforeGet:null,onSet:null};
  const touch=()=>{activity++;};
  const lockManager={request(name,work){
    assert.equal(name,'opendesk.sidebar-tools:tool:'+ID);locks.push(name);lockWork++;touch();
    const result=sequence.then(work);sequence=result.catch(()=>{});
    return result.finally(()=>{lockWork--;touch();});
  }};
  const api={runtime:{id:extensionId,getURL:url,getContexts:async query=>{
    touch();return clone(contexts.filter(row=>query.documentUrls.includes(row.documentUrl)&&query.contextTypes.includes(row.contextType)));
  }},storage:{local:{get:async keys=>{
    touch();await f.beforeGet?.(keys);
    if(f.unknownStorage&&typeof keys==='string')throw Error('readback unavailable');
    return clone(Object.fromEntries((typeof keys==='string'?[keys]:keys).filter(key=>Object.hasOwn(data,key)).map(key=>[key,data[key]])));
  },set:async values=>{
    touch();sets.push(clone(values));const changes={};
    for(const [key,value] of Object.entries(values)){changes[key]={oldValue:clone(data[key]),newValue:clone(value)};data[key]=clone(value);}
    storageEvents.push(changes);await f.onSet?.(changes);
    if(f.lostStorageAck)throw Error('set acknowledgement lost');
  }}},permissions:{contains:async()=>{touch();return f.permission;}},
  tabs:{get:async id=>{touch();assert.equal(id,tab.id);return clone(tab);},
    query:async query=>{touch();return !query.active||tab.active?[clone(tab)]:[];},
    sendMessage:async(id,message)=>{touch();messages.push({id,message:clone(message)});}},
  webNavigation:{getFrame:async({tabId,frameId})=>{touch();assert.equal(tabId,tab.id);return clone(frames.find(row=>row.frameId===frameId)??null);},
    getAllFrames:async({tabId})=>{touch();assert.equal(tabId,tab.id);return clone(frames);}},
  scripting:{executeScript:async request=>{
    touch();calls.push(request);await f.beforeScript?.(request);
    assert.equal(request.target.tabId,tab.id);assert.equal(request.target.documentIds.length,1);
    const id=request.target.documentIds[0],frame=frames.find(row=>row.documentId===id);
    assert.ok(frame,'injection must bind a currently live document');
    if(request.files){assert.deepEqual(request.files,['agents/page-relay.js']);return [];}
    assert.equal(request.world,'ISOLATED');
    assert.ok([pageVideoSpeed,restoreControlledVideoSpeed,readRestoredVideoSpeed].includes(request.func),'only fixed compiled functions');
    assert.ok(docs.has(id));
    const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
    Object.defineProperty(globalThis,'document',{value:docs.get(id),configurable:true,writable:true});
    try{
      // Chrome serializes fixed functions without their module closure. No await
      // while document is installed: concurrent probes cannot borrow a DOM.
      const run=Function('return ('+request.func.toString()+')')();
      return [{frameId:frame.frameId,documentId:id,result:run(...(request.args??[]))}];
    }finally{
      if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;
    }
  }}};
  const fetcher=async address=>{touch();assert.equal(address,url(OFFICIAL_CATALOG_PATH));return {ok:true,json:async()=>clone({
    schema:OFFICIAL_RELEASE_SCHEMA,sourceRepository:OFFICIAL_SOURCE_REPOSITORY,apps:[release]})};};
  f.restart=()=>{service=createGlobalVideoSpeedService({api,fetcher,lockManager});return service;};
  f.restart();
  f.service=()=>service;
  f.addVideo=(frameId=0,node=video())=>{docs.get(frames.find(row=>row.frameId===frameId).documentId).nodes.push(node);return node;};
  f.addFrame=()=>{
    const frame={frameId:2,documentId:'iframe-document',url:'https://player.example/embed',documentLifecycle:'active'};
    frames.push(frame);docs.set(frame.documentId,{nodes:[],querySelectorAll(){return this.nodes;}});return frame;
  };
  f.sender=(frameId=0)=>{const frame=frames.find(row=>row.frameId===frameId);return {id:extensionId,tab:clone(tab),
    frameId,documentId:frame.documentId,url:frame.url,documentLifecycle:'active'};};
  f.apply=sender=>service.dispatch({protocol:PROTOCOL,operation:'page.apply'},sender??f.sender());
  f.command=async(operation,payload,sender=host,installEpoch=epoch,withRevision=true)=>{
    // Capture when the host issues the command, before any admission/lock await.
    // Explicit CAS values win; schema tests can opt out of this valid default.
    if(operation==='configure'&&withRevision&&payload&&typeof payload==='object'&&!Array.isArray(payload))
      payload={expectedRevision:data[STORE]?.revision||'',...payload};
    const before=messages.length;
    const result=await service.dispatch({protocol:PROTOCOL,toolId:ID,installEpoch,
      operation:'videoSpeed.global.'+operation,...(payload===undefined?{}:{payload})},sender);
    // Successful ON writes launch repair without awaiting it. Its terminal
    // broadcast is the completion barrier, including native SHA digest awaits.
    if(['configure','sync'].includes(operation)&&result.enabled&&!result.superseded)
      await until(()=>messages.length>before,'automatic repair broadcast');
    return result;
  };
  f.drain=async()=>{
    // repair is intentionally fire-and-forget and performs digest awaits outside
    // the tool lock. Drain both lock work and API activity before the next test.
    let stable=0,last=-1;
    await until(()=>{if(lockWork===0&&activity===last)stable++;else stable=0;last=activity;return stable>=8;},'service async work drained');
  };
  f.configure=async(enabled,speed=2)=>{
    const result=await f.command('configure',{enabled,speed});
    await f.drain();return result;
  };
  f.seed=(speed=2,revision='revision-A')=>{data[STORE]={enabled:true,speed,revision,epoch,packageHash:sha256};};
  f.changed=changes=>service.invalidate(changes);
  f.writes=()=>[...docs.values()].flatMap(doc=>doc.nodes.flatMap(node=>node.writes));
  t.after(async()=>{f.beforeScript=null;f.beforeGet=null;f.onSet=null;await f.drain();});
  return f;
}

test('current package passes real SHA/release/provenance admission and trusted host status',async t=>{
  const f=fixture(t);
  assert.equal(tool.version,VIDEO_SPEED_VERSION);
  assert.equal(await admitsOfficialVideoSpeed({tool,release,installed:f.data[SIDEBAR_TOOL_STORE],
    provenance:f.data[MARKET_PROVENANCE_STORE],enableRecords:f.data[SIDEBAR_TOOL_ENABLE_STORE],
    epochs:f.data[TOOL_REVOCATION_EPOCHS_STORE],expectedEpoch:'video-install-epoch'}),true);
  assert.deepEqual(await f.command('status'),{enabled:true,speed:1,revision:''});
  assert.equal(f.sets.length,0);
});

test('first use applies the default global speed without opening or configuring the tool',async t=>{
  const f=fixture(t),node=f.addVideo(0,video('https://cdn.example/a.mp4',1.5));
  assert.equal((await f.apply()).verified,true);
  assert.deepEqual(node.writes,[1]);
  assert.equal(f.sets.length,0,'the default does not manufacture saved consent or preferences');
});

test('an explicitly disabled global preference remains off after service restart',async t=>{
  const f=fixture(t);await f.configure(false);
  f.restart();const node=f.addVideo();
  assert.equal((await f.command('status')).enabled,false);
  assert.equal((await f.apply()).status,'stopped');
  assert.deepEqual(node.writes,[]);
});

test('persisted preference survives service restart and applies to new video, source and iframe signals',async t=>{
  const f=fixture(t),state=await f.configure(true,2.5);
  assert.equal(f.calls.filter(row=>row.files).length,1);
  assert.equal(f.writes().length,0,'saving without video does not fabricate a page mutation');
  f.restart();assert.deepEqual(await f.command('status'),state);
  const first=f.addVideo();assert.equal((await f.apply()).verified,true);
  assert.deepEqual(first.writes,[2.5]);
  f.restart();
  await f.apply();assert.deepEqual(first.writes,[2.5]);
  first.currentSrc='https://cdn.example/b.mp4';await f.apply();assert.deepEqual(first.writes,[2.5,2.5]);
  first.paused=true;const next=f.addVideo();await f.apply();assert.deepEqual(next.writes,[2.5]);
  next.paused=true;f.addFrame();const inner=f.addVideo(2);await f.apply(f.sender(2));
  assert.deepEqual(inner.writes,[2.5]);
  assert.ok(f.calls.some(row=>row.args?.[0]==='read'&&row.target.documentIds[0]==='iframe-document'));
  assert.equal(f.sets.length,1,'page events never rewrite persistent preferences');
});

for(const reason of ['modified-package','provenance','disabled','uninstalled','duplicate-install'])
test('authority rejects '+reason+' before storage or media writes',async t=>{
  const f=fixture(t);f.seed();f.addVideo();
  if(reason==='modified-package')f.data[SIDEBAR_TOOL_STORE][0].html+='<p>tampered</p>';
  if(reason==='provenance')f.data[MARKET_PROVENANCE_STORE][ID].sha256='0'.repeat(64);
  if(reason==='disabled')f.data[SIDEBAR_TOOL_ENABLE_STORE][ID]=false;
  if(reason==='uninstalled')f.data[SIDEBAR_TOOL_STORE]=[];
  if(reason==='duplicate-install')f.data[SIDEBAR_TOOL_STORE].push(clone(tool));
  await assert.rejects(f.command('configure',{enabled:true,speed:3}),{code:'E_VIDEO_TRUST'});
  await assert.rejects(f.apply(),{code:'E_VIDEO_TRUST'});
  assert.equal(f.sets.length,0);assert.deepEqual(f.writes(),[]);
});

test('changed installation epoch and package hash cannot revive a persisted enabled preference',async t=>{
  const f=fixture(t);f.seed();f.addVideo();
  f.data[TOOL_REVOCATION_EPOCHS_STORE][ID]='new-epoch';
  await assert.rejects(f.command('configure',{enabled:true,speed:3}),{code:'E_VIDEO_REVOKED'});
  assert.equal((await f.apply()).status,'stopped');
  f.data[TOOL_REVOCATION_EPOCHS_STORE][ID]='video-install-epoch';f.data[STORE].packageHash='0'.repeat(64);
  assert.equal((await f.apply()).status,'stopped');assert.deepEqual(f.writes(),[]);assert.equal(f.sets.length,0);
});

for(const reason of ['permission','navigation','pending-navigation','inactive','incognito','frame-source','frame-document','frame-lifecycle'])
test('page signal rejects '+reason+' without media/storage writes',async t=>{
  const f=fixture(t);f.seed();f.addVideo();const sender=f.sender();
  if(reason==='permission')f.permission=false;
  if(reason==='navigation')f.frames[0].documentId='new-document';
  if(reason==='pending-navigation')f.tab.pendingUrl='https://elsewhere.example/';
  if(reason==='inactive')f.tab.active=false;
  if(reason==='incognito')f.tab.incognito=true;
  if(reason==='frame-source')sender.url='https://forged.example/';
  if(reason==='frame-document')sender.documentId='old-document';
  if(reason==='frame-lifecycle')f.frames[0].documentLifecycle='cached';
  await assert.rejects(f.apply(sender));assert.deepEqual(f.writes(),[]);assert.equal(f.sets.length,0);
});

for(const reason of ['foreign-id','missing-tab','bad-frame','missing-document','bad-lifecycle'])
test('malformed page sender '+reason+' has no effect',async t=>{
  const f=fixture(t);f.seed();f.addVideo();const sender=f.sender();
  if(reason==='foreign-id')sender.id='b'.repeat(32);
  if(reason==='missing-tab')delete sender.tab;
  if(reason==='bad-frame')sender.frameId=-1;
  if(reason==='missing-document')delete sender.documentId;
  if(reason==='bad-lifecycle')sender.documentLifecycle='prerender';
  await assert.rejects(f.apply(sender),{code:'E_VIDEO_SENDER'});assert.deepEqual(f.writes(),[]);assert.equal(f.sets.length,0);
});

for(const reason of ['website-url','foreign-id','wrong-tool','missing-context','missing-tab-document','wrong-document','incognito-context','duplicate-context','subframe','incognito-tab'])
test('untrusted host '+reason+' cannot read status or configure',async t=>{
  const f=fixture(t);f.seed();f.addVideo();const sender=clone(f.host);
  if(reason==='website-url')sender.url='https://media.example/sidepanel.html';
  if(reason==='foreign-id')sender.id='b'.repeat(32);
  if(reason==='wrong-tool')sender.url=sender.url.replace(ID,'another-tool');
  if(reason==='missing-context')f.contexts.length=0;
  if(reason==='missing-tab-document'){delete sender.documentId;sender.tab={id:9};}
  if(reason==='wrong-document')f.contexts[0].documentId='closed-host';
  if(reason==='incognito-context')f.contexts[0].incognito=true;
  if(reason==='duplicate-context')f.contexts.push(clone(f.contexts[0]));
  if(reason==='subframe')sender.frameId=2;
  if(reason==='incognito-tab')sender.tab={id:9,incognito:true};
  const expected=reason==='missing-document'?{code:'E_VIDEO_SENDER'}:undefined;
  await assert.rejects(f.command('status',undefined,sender),expected);
  await assert.rejects(f.command('configure',{enabled:true,speed:3},sender),expected);
  assert.deepEqual(f.writes(),[]);assert.equal(f.sets.length,0);
});

test('Side Panel omitted sender metadata resolves one live document and rejects a reload before save',async t=>{
  const f=fixture(t),sender=clone(f.host);delete sender.documentId;delete sender.frameId;
  assert.deepEqual(await f.command('status',undefined,sender),{enabled:true,speed:1,revision:''});
  let changed=false;
  f.beforeGet=async()=>{if(!changed){changed=true;f.contexts[0].documentId='reloaded-host';}};
  await assert.rejects(f.command('configure',{enabled:true,speed:2},sender),{code:'E_DOCUMENT_STALE'});
  assert.equal(f.sets.length,0);assert.deepEqual(f.writes(),[]);
});

test('revision A to B replaces the element record; a website override at B is never fought',async t=>{
  const f=fixture(t);f.seed();const node=f.addVideo();await f.apply();
  const next=await f.configure(true,3);assert.notEqual(next.revision,'revision-A');await f.apply();
  assert.deepEqual(node.writes,[2,3]);node.override(1.25);
  for(let i=0;i<3;i++)assert.equal((await f.apply()).verified,false);
  assert.deepEqual(node.writes,[2,3]);assert.equal(node.playbackRate,1.25);
  const records=[...f.docs.get('top-document').__opendeskVideoSpeedControlled_v1.values()];
  assert.equal(records.length,1);assert.equal(records[0].revision,next.revision);
});

test('throwing setter records attempt before failure and same revision events never retry',async t=>{
  const f=fixture(t);f.seed();const node=f.addVideo();node.throwOnSet=true;
  await assert.rejects(f.apply());
  const records=f.docs.get('top-document').__opendeskVideoSpeedControlled_v1;
  assert.equal(records.size,1);assert.equal([...records.values()][0].revision,'revision-A');
  node.throwOnSet=false;await f.apply();await f.apply();assert.deepEqual(node.writes,[2]);assert.equal(node.playbackRate,1);
});

test('delayed own storage event during OFF does not interrupt restoring controlled media',async t=>{
  const f=fixture(t);f.seed();const first=f.addVideo();await f.apply();
  first.paused=true;f.addFrame();const second=f.addVideo(2);await f.apply(f.sender(2));
  let delivered=false;
  f.beforeScript=async request=>{
    if(request.func===restoreControlledVideoSpeed&&!delivered){delivered=true;f.changed(f.storageEvents.at(-1));}
  };
  const stopped=await f.configure(false);
  assert.equal(delivered,true);assert.equal(stopped.enabled,false);
  assert.deepEqual(stopped.restore,{status:'requested',restored:2,failed:0,unverified:0});
  assert.deepEqual(first.writes,[2,1]);assert.deepEqual(second.writes,[2,1]);
});

for(const change of ['new-element','new-iframe'])
test('same-tab busy '+change+' signal is eventually rechecked, not dropped',async t=>{
  const f=fixture(t);f.seed();const first=f.addVideo(),entered=deferred(),resume=deferred();
  let held=false;
  f.beforeScript=async request=>{if(request.args?.[0]==='read'&&!held){held=true;entered.resolve();await resume.promise;}};
  const running=f.apply();t.after(()=>resume.resolve());await entered.promise;
  first.paused=true;let next;
  if(change==='new-element')next=f.addVideo();else{f.addFrame();next=f.addVideo(2);}
  const busy=await f.apply(f.sender(change==='new-element'?0:2));assert.equal(busy.status,'busy');
  resume.resolve();await running;await f.drain();
  assert.deepEqual(first.writes,[2]);assert.deepEqual(next.writes,[2],'pending event must apply to the newly selected media');
});

test('explicit stop prevents later signals, repair and stale sync from automatically writing',async t=>{
  const f=fixture(t);f.seed();const node=f.addVideo();await f.apply();
  const stopped=await f.configure(false);assert.equal(node.playbackRate,1);
  const count=node.writes.length;f.addFrame();const inner=f.addVideo(2);
  const sync=await f.command('sync',{expectedRevision:'revision-A',speed:3});
  assert.equal(sync.enabled,false);assert.equal(sync.superseded,true);
  await f.service().repair();await f.apply();await f.apply(f.sender(2));await f.drain();
  assert.equal(node.writes.length,count);assert.deepEqual(inner.writes,[]);
  assert.equal(f.data[STORE].revision,stopped.revision);assert.equal(f.sets.length,1);
});

test('sync only updates an enabled matching revision under the existing tool lock',async t=>{
  const f=fixture(t);f.seed();
  const current=await f.command('sync',{expectedRevision:'revision-A',speed:2.25});await f.drain();
  assert.equal(current.enabled,true);assert.equal(current.speed,2.25);assert.notEqual(current.revision,'revision-A');
  const stale=await f.command('sync',{expectedRevision:'revision-A',speed:3});
  assert.equal(stale.superseded,true);assert.equal(stale.revision,current.revision);assert.equal(f.sets.length,1);
  assert.ok(f.locks.length>=2);
});

test('restore failure remains recorded and later page events do not retry while OFF',async t=>{
  const f=fixture(t);f.seed();const node=f.addVideo();await f.apply();node.throwOnSet=true;
  const stopped=await f.configure(false);
  assert.equal(stopped.restore.status,'partial');assert.equal(stopped.restore.failed,1);
  assert.equal(f.docs.get('top-document').__opendeskVideoSpeedControlled_v1.size,1,'failed restore must retain ownership evidence');
  node.throwOnSet=false;await f.apply();await f.service().repair();await f.drain();
  assert.deepEqual(node.writes,[2,1]);assert.equal(node.playbackRate,2);
});

test('stop preserves a website override and does not reset unrelated videos',async t=>{
  const f=fixture(t);f.seed();const controlled=f.addVideo();await f.apply();controlled.override(1.5);
  const unrelated=f.addVideo(0,video('https://cdn.example/other.mp4',1.75));
  const stopped=await f.configure(false);
  assert.equal(stopped.restore.status,'partial');assert.equal(stopped.restore.restored,0);
  assert.deepEqual(controlled.writes,[2]);assert.deepEqual(unrelated.writes,[]);
});

test('unknown storage outcome performs one set, no automatic retry or media effect',async t=>{
  const f=fixture(t);f.seed();f.addVideo();f.unknownStorage=true;f.lostStorageAck=true;
  await assert.rejects(f.command('configure',{enabled:true,speed:3}),{code:'E_OUTCOME_UNKNOWN'});
  await f.drain();assert.equal(f.sets.length,1);assert.deepEqual(f.writes(),[]);assert.equal(f.calls.length,0);
  f.unknownStorage=false;const status=await f.command('status');assert.equal(status.speed,3);
  await f.drain();assert.equal(f.sets.length,1);assert.deepEqual(f.writes(),[]);
});

test('lost storage acknowledgement confirmed by readback succeeds without repeating set',async t=>{
  const f=fixture(t);f.lostStorageAck=true;
  const state=await f.configure(true,2);assert.equal(state.enabled,true);assert.equal(f.sets.length,1);
  assert.equal((await f.command('status')).revision,state.revision);
});

for(const reason of ['permission','navigation','incognito','epoch','uninstalled','disabled'])
test('in-flight '+reason+' after probe is revalidated before the setter',async t=>{
  const f=fixture(t);f.seed();const node=f.addVideo();let invalidated=false;
  f.beforeScript=async request=>{
    if(request.args?.[0]!=='probe'||invalidated)return;
    invalidated=true;
    if(reason==='permission')f.permission=false;
    if(reason==='navigation')f.tab.pendingUrl='https://new.example/';
    if(reason==='incognito')f.tab.incognito=true;
    if(reason==='epoch')f.data[TOOL_REVOCATION_EPOCHS_STORE][ID]='new-epoch';
    if(reason==='uninstalled')f.data[SIDEBAR_TOOL_STORE]=[];
    if(reason==='disabled')f.data[SIDEBAR_TOOL_ENABLE_STORE][ID]=false;
  };
  await assert.rejects(f.apply());assert.equal(invalidated,true);
  assert.deepEqual(node.writes,[]);assert.equal(f.sets.length,0);
  assert.equal(f.calls.filter(row=>row.args?.[0]==='set').length,0,'reject before effect, not just after readback');
});

test('lost media receipt does not cause a repeated setter on the next same-revision event',async t=>{
  const f=fixture(t);f.seed();const node=f.addVideo();let lost=false;
  f.beforeScript=async request=>{
    if(request.args?.[0]==='read'&&!lost){lost=true;throw Error('injection receipt lost');}
  };
  await assert.rejects(f.apply());assert.deepEqual(node.writes,[2]);
  node.override(1.25);await f.apply();await f.apply();
  assert.deepEqual(node.writes,[2]);assert.equal(node.playbackRate,1.25);
});

test('queued sync observed before STOP cannot revive OFF after acquiring the tool lock',async t=>{
  const f=fixture(t);f.seed();const node=f.addVideo();await f.apply();
  const entered=deferred(),resume=deferred();let blocked=false;
  f.onSet=async()=>{if(!blocked){blocked=true;entered.resolve();await resume.promise;}};
  const stopping=f.command('configure',{enabled:false,speed:2});t.after(()=>resume.resolve());
  await entered.promise;
  const syncing=f.command('sync',{expectedRevision:'revision-A',speed:3});
  resume.resolve();const stopped=await stopping,synced=await syncing;await f.drain();
  assert.equal(synced.enabled,false);assert.equal(synced.superseded,true);
  assert.equal(synced.revision,stopped.revision);assert.equal(f.data[STORE].enabled,false);
  assert.equal(f.sets.length,1);assert.deepEqual(node.writes,[2,1]);
});

test('pending busy media event cannot outlive an explicit stop queued under the same lock',async t=>{
  const f=fixture(t);f.seed();const first=f.addVideo(),entered=deferred(),resume=deferred();let held=false;
  f.beforeScript=async request=>{
    if(request.args?.[0]==='read'&&!held){held=true;entered.resolve();await resume.promise;}
  };
  const applying=f.apply();t.after(()=>resume.resolve());await entered.promise;
  first.paused=true;const next=f.addVideo();assert.equal((await f.apply()).status,'busy');
  const lockCount=f.locks.length,stopping=f.command('configure',{enabled:false,speed:2});
  await until(()=>f.locks.length>lockCount,'STOP queued behind active apply');
  resume.resolve();await applying;const stopped=await stopping;await f.drain();
  assert.equal(stopped.enabled,false);assert.deepEqual(first.writes,[2,1]);assert.deepEqual(next.writes,[]);
  await f.apply();await f.drain();assert.deepEqual(next.writes,[]);
});

for(const payload of [null,{},
  {expectedRevision:'revision-A',speed:3,enabled:true},
  {expectedRevision:'revision-A',speed:3,tabId:4},
  {expectedRevision:1,speed:3},
  {expectedRevision:'revision-A',speed:9}])
test('private sync rejects invalid CAS payload '+JSON.stringify(payload),async t=>{
  const f=fixture(t);f.seed();f.addVideo();
  await assert.rejects(f.command('sync',payload),{code:'E_SCHEMA'});
  assert.equal(f.sets.length,0);assert.deepEqual(f.writes(),[]);
});

test('host context closing during admission rejects configure before storage write',async t=>{
  const f=fixture(t);f.seed();f.addVideo();
  f.beforeGet=async()=>{f.contexts.length=0;};
  await assert.rejects(f.command('configure',{enabled:true,speed:3}),{code:'E_DOCUMENT_STALE'});
  assert.equal(f.sets.length,0);assert.deepEqual(f.writes(),[]);
});

test('older own ON=A storage notification arriving during OFF=B cannot interrupt restoration',async t=>{
  const f=fixture(t);const on=await f.configure(true,2),onEvent=clone(f.storageEvents[0]);
  const first=f.addVideo();await f.apply();first.paused=true;
  f.addFrame();const second=f.addVideo(2);await f.apply(f.sender(2));
  let delivered=false;
  f.beforeScript=async request=>{
    if(request.func===restoreControlledVideoSpeed&&!delivered){
      delivered=true;f.changed(onEvent);
    }
  };
  const stopped=await f.configure(false);
  assert.equal(delivered,true);assert.notEqual(stopped.revision,on.revision);
  assert.equal(f.data[STORE].enabled,false);
  assert.deepEqual(stopped.restore,{status:'requested',restored:2,failed:0,unverified:0},
    'an older own notification must not revoke the ongoing OFF restore');
  assert.deepEqual(first.writes,[2,1]);assert.deepEqual(second.writes,[2,1]);
});

test('own revision notification mixed with another authority key still invalidates an in-flight apply',async t=>{
  const f=fixture(t);await f.configure(true,2);const node=f.addVideo();let delivered=false;
  f.beforeScript=async request=>{
    if(request.args?.[0]==='probe'&&!delivered){
      delivered=true;
      f.changed({...clone(f.storageEvents[0]),[SIDEBAR_TOOL_ENABLE_STORE]:{oldValue:{},newValue:{}}});
    }
  };
  await assert.rejects(f.apply(),{code:'E_VIDEO_REVOKED'});assert.equal(delivered,true);
  assert.deepEqual(node.writes,[]);assert.equal(f.sets.length,1);
});

test('delayed ON configure observed before STOP cannot revive OFF after acquiring the lock',async t=>{
  const f=fixture(t);f.seed();const node=f.addVideo();await f.apply();
  const entered=deferred(),resume=deferred();let held=false;
  f.onSet=async()=>{if(!held){held=true;entered.resolve();await resume.promise;}};
  const stopping=f.command('configure',{enabled:false,speed:2});t.after(()=>resume.resolve());
  await entered.promise;
  const lockCount=f.locks.length;
  const enabling=f.command('configure',{enabled:true,speed:3,expectedRevision:'revision-A'});
  await until(()=>f.locks.length>lockCount,'stale ON queued behind STOP');
  resume.resolve();const stopped=await stopping,enabled=await enabling;await f.drain();
  assert.equal(enabled.enabled,false);assert.equal(enabled.superseded,true);
  assert.equal(enabled.revision,stopped.revision);assert.equal(f.data[STORE].enabled,false);
  assert.equal(f.sets.length,1);assert.deepEqual(node.writes,[2,1]);
  await f.apply();await f.drain();assert.deepEqual(node.writes,[2,1]);
});

test('ON configure with stale revision is superseded without storage or media writes',async t=>{
  const f=fixture(t);f.seed();f.addVideo();
  const result=await f.command('configure',{enabled:true,speed:3,expectedRevision:'older-revision'});
  assert.deepEqual(result,{enabled:true,speed:2,revision:'revision-A',superseded:true});
  assert.equal(f.sets.length,0);assert.deepEqual(f.writes(),[]);
});

test('OFF configure stops unconditionally even when its expected revision is stale',async t=>{
  const f=fixture(t);f.seed();const node=f.addVideo();await f.apply();
  const result=await f.command('configure',{enabled:false,speed:2,expectedRevision:'older-revision'});
  assert.equal(result.enabled,false);assert.equal(result.superseded,undefined);
  assert.equal(f.data[STORE].enabled,false);assert.equal(f.sets.length,1);assert.deepEqual(node.writes,[2,1]);
});

for(const payload of [null,{},
  {enabled:true,speed:2},
  {enabled:false,speed:2},
  {enabled:true,speed:2,expectedRevision:4},
  {enabled:true,speed:2,expectedRevision:'revision-A',tabId:4}])
test('public configure rejects invalid CAS payload '+JSON.stringify(payload),async t=>{
  const f=fixture(t);f.seed();f.addVideo();
  await assert.rejects(f.command('configure',payload,f.host,'video-install-epoch',false),{code:'E_SCHEMA'});
  assert.equal(f.sets.length,0);assert.deepEqual(f.writes(),[]);
});

for(const changed of [{speed:3},{enabled:false},{epoch:'other-install'},{packageHash:'0'.repeat(64)},{unexpected:true}])
test('own revision with altered raw '+Object.keys(changed)[0]+' still invalidates apply',async t=>{
  const f=fixture(t);await f.configure(true,2);const node=f.addVideo();let delivered=false;
  const event=clone(f.storageEvents[0]);Object.assign(event[STORE].newValue,changed);
  f.beforeScript=async request=>{
    if(request.args?.[0]==='probe'&&!delivered){delivered=true;f.changed(event);}
  };
  await assert.rejects(f.apply(),{code:'E_VIDEO_REVOKED'});assert.equal(delivered,true);
  assert.deepEqual(node.writes,[]);assert.equal(f.sets.length,1);
});
