// Bounded Host/collector races; native Chrome execution is not claimed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {parse} from 'acorn';
import {installAnalyticsHost} from '../../src/analytics/host.js';
import {ANALYTICS_PROTOCOL,ANALYTICS_PAGE_SCOPE_CHECK,ANALYTICS_STATE_KEY} from '../../src/analytics/contract.js';
import {initPromptShortcuts} from '../../examples/sidebar-tools/prompt-shortcuts/trusted/page.js';
import {SIDEBAR_TOOL_STORE,sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const event={event:'prompt.inserted',toolId:'prompt-shortcuts',source:'page_adapter',channel:'page_button'};
const message={protocol:ANALYTICS_PROTOCOL,kind:'event.page_report',event:event.event,
  toolId:event.toolId,channel:event.channel};
const sender=()=>({id:'scope-extension',frameId:0,documentId:'document-one',
  url:'https://chatgpt.com/c/private?draft=secret#body',
  tab:{id:17,incognito:false,url:'https://chatgpt.com/c/private?draft=secret#body'}});
function harness({url=sender().url,fetcher}={}){
  const values=new Map(),listeners=[],writes=[],probes=[],frames=[],tabs=[],order=[];
  const source={...sender(),url,tab:{...sender().tab,url}};
  const control={permitted:true,documentId:'document-one',url};
  const api={runtime:{id:'scope-extension',getURL:path=>'chrome-extension://scope-extension/'+path,
    onMessage:{addListener:fn=>listeners.push(fn)}},
    storage:{local:{async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys])
      .map(key=>[key,structuredClone(values.get(key))]));},
      async set(data){writes.push(structuredClone(data));for(const [key,value] of Object.entries(data))values.set(key,structuredClone(value));}}},
    tabs:{async sendMessage(tabId,payload,target){
      probes.push({tabId,payload,target});order.push('probe');
      assert.equal(tabId,17);
      assert.deepEqual(target,{frameId:0,documentId:'document-one'});
      assert.deepEqual(payload,{protocol:ANALYTICS_PROTOCOL,kind:ANALYTICS_PAGE_SCOPE_CHECK,expectedUrl:url});
      return control.probe?control.probe(payload,target):control.permitted;
    },async get(tabId){
      tabs.push(tabId);order.push('tab');assert.equal(tabId,17);
      return control.tab?control.tab():{id:17,url:control.url,incognito:false};
    }},
    webNavigation:{async getFrame(target){
      frames.push(target);order.push('frame');assert.deepEqual(target,{tabId:17,frameId:0});
      return control.frame?control.frame():{documentId:control.documentId,url:control.url,
        documentLifecycle:'active',errorOccurred:false};
    }}};
  const collector=installAnalyticsHost({api,endpoint:'https://telemetry.example/v1/events',fetcher});
  const send=(payload=message,actualSender=source)=>new Promise(resolve=>{
    assert.equal(listeners[0](payload,actualSender,resolve),true);
  });
  // Startup inventory is independent of page authorization.
  const queue=()=>(values.get(ANALYTICS_STATE_KEY)?.queue||[]).filter(row=>row.event!=='app.inventory');
  return {api,values,control,collector,send,queue,writes,probes,frames,tabs,order,source};
}

test('Analytics SW import graph passes the unchanged provenance boundary without Prompt business code',async()=>{
  const modules={};
  const visit=async path=>{
    if(modules[path])return;
    const source=await readFile(path,'utf8');
    modules[path]={renderedLength:source.length,originalLength:source.length};
    const tree=parse(source,{ecmaVersion:'latest',sourceType:'module'});
    for(const node of tree.body){
      if(node.source?.value?.startsWith('.'))await visit(resolve(dirname(path),node.source.value));
    }
  };
  await visit(resolve('src/analytics/host.js'));
  const evidence=describeBundle({chunk:{fileName:'sw.js',modules},lock:{packages:{}}});
  assert(evidence.modules.some(row=>row.path==='src/analytics/host.js'));
  assert(!evidence.modules.some(row=>row.path.includes('examples/sidebar-tools/prompt-shortcuts/')));
  const pagePath=resolve('examples/sidebar-tools/prompt-shortcuts/trusted/page.js');
  const pageEvidence=describeBundle({chunk:{fileName:'agents/page-relay.js',modules:{[pagePath]:{}}},lock:{}});
  assert.match(pageEvidence.modules[0].reviewedFirstPartyBlob,/^[a-f0-9]{40}$/);
  for(const file of ['policy.js','model.js','page.js'])assert.throws(()=>describeBundle({
    chunk:{fileName:'sw.js',modules:{[resolve('examples/sidebar-tools/prompt-shortcuts/trusted/'+file)]:{}}},lock:{}
  }),/cannot enter a privileged fixed bundle/);
});

test('Host rejects invalid sender, frame, document, tab and complete URL before probing',async()=>{
  const h=harness();await h.collector.setConsent(true);
  const good=sender();
  for(const bad of [
    {...good,id:'other-extension'},{...good,frameId:1},{...good,frameId:undefined},
    ...['cached','prerender','pending_deletion','unknown',null].map(documentLifecycle=>({...good,documentLifecycle})),
    {...good,tab:{...good.tab,pendingUrl:good.url+'/next'}},
    {...good,documentId:undefined},{...good,documentId:''},{...good,incognito:true},
    {...good,tab:undefined},{...good,tab:{...good.tab,id:-1}},
    {...good,tab:{...good.tab,incognito:true}},{...good,tab:{...good.tab,incognito:undefined}},
    {...good,tab:{...good.tab,url:good.url+'changed'}},
    ...['https://user:secret@chatgpt.com/','file:///tmp/private','https://','not a URL'].map(url=>({
      ...good,url,tab:{...good.tab,url}}))
  ])assert.equal((await h.send(message,bad)).code,'E_SENDER');
  assert.equal(h.probes.length,0);assert.equal(h.queue().length,0);
});

test('each successful action and engagement requires its own exact document probe; no URL in persisted events',async()=>{
  const h=harness();await h.collector.setConsent(true);
  assert.equal((await h.send()).data.recorded,true);
  assert.equal(h.probes.length,2);assert.equal(h.frames.length,4);assert.equal(h.tabs.length,4);
  assert.deepEqual(h.order,['frame','tab','probe','frame','tab','frame','tab','probe','frame','tab']);
  assert.deepEqual(h.queue().map(row=>row.event),['prompt.inserted','tool.engaged']);
  assert(!JSON.stringify(h.writes).includes(sender().url));
  h.control.probe=()=>{h.control.permitted=false;return h.probes.length===3;};
  assert.equal((await h.send()).data.recorded,true);
  assert.deepEqual(h.queue().map(row=>row.event),['prompt.inserted','tool.engaged','prompt.inserted'],
    'the second record must not reuse the first authorization');
});

for(const failure of ['scope-denied','nonboolean','probe-throw','probe-timeout','frame-timeout','frame-throw',
  'missing-tabs','missing-navigation','new-document','new-url']){
  test('page scope fails closed: '+failure,async()=>{
    const h=harness();await h.collector.setConsent(true);
    if(failure==='scope-denied')h.control.permitted=false;
    if(failure==='nonboolean')h.control.probe=()=>({ok:true});
    if(failure==='probe-throw')h.control.probe=()=>{throw Error('unloaded');};
    if(failure==='probe-timeout')h.control.probe=()=>new Promise(()=>{});
    if(failure==='frame-timeout')h.control.frame=()=>new Promise(()=>{});
    if(failure==='frame-throw')h.control.frame=()=>{throw Error('closed');};
    if(failure==='missing-tabs')delete h.api.tabs;
    if(failure==='missing-navigation')delete h.api.webNavigation;
    if(failure==='new-document')h.control.documentId='document-two';
    if(failure==='new-url')h.control.url+='changed';
    assert.equal((await h.send()).data.recorded,false);
    assert.equal(h.queue().length,0);
  });
}

test('navigation during page probe rejects the old sender document',async()=>{
  const h=harness(),started=deferred(),reply=deferred();await h.collector.setConsent(true);
  h.control.probe=()=>{started.resolve();return reply.promise;};
  const pending=h.send();await started.promise;
  h.control.documentId='replacement-document';reply.resolve(true);
  assert.equal((await pending).data.recorded,false);assert.equal(h.queue().length,0);
});

test('queued record probes current scope only after the earlier serial record finishes',async()=>{
  const h=harness(),started=deferred(),release=deferred();await h.collector.setConsent(true);
  const blocker=h.collector.record(event,{authorize:()=>{started.resolve();return release.promise;}});
  await started.promise;
  const pending=h.send();
  h.control.permitted=false;release.resolve(false);
  await blocker;
  assert.equal((await pending).data.recorded,false);assert.equal(h.probes.length,1);assert.equal(h.queue().length,0);
});

for(const mode of ['revoke','storage-revoke','new-install']){
  test('consent changes while authorizing never persist the pending action: '+mode,async()=>{
    const h=harness(),started=deferred(),release=deferred();await h.collector.setConsent(true);
    h.control.probe=()=>{started.resolve();return release.promise;};
    const pending=h.send();await started.promise;
    let revoke;
    if(mode==='revoke')revoke=h.collector.setConsent(false);
    else{
      const state=h.values.get(ANALYTICS_STATE_KEY);
      h.values.set(ANALYTICS_STATE_KEY,{...state,...(mode==='storage-revoke'?{consent:false}:{installId:randomUUID()})});
    }
    const writes=h.writes.length;release.resolve(true);
    assert.equal((await pending).data.recorded,false);
    assert(!h.writes.slice(writes).some(row=>row[ANALYTICS_STATE_KEY].queue.some(entry=>entry.event!=='app.inventory')));
    await revoke;
    assert.equal(h.queue().length,0);
  });
}

test('consent revoke then re-enable cannot revive records already waiting in the queue',async()=>{
  const h=harness(),started=deferred(),release=deferred();await h.collector.setConsent(true);
  const blocking=h.collector.record(event,{authorize:()=>{started.resolve();return release.promise;}});
  await started.promise;
  const old=h.collector.record(event,{authorize:()=>{throw Error('old queued authorization ran');}});
  const revoke=h.collector.setConsent(false),enable=h.collector.setConsent(true);
  const late=h.collector.record(event);
  release.resolve(true);
  assert.equal((await blocking).recorded,false);assert.equal((await old).recorded,false);
  await revoke;await enable;assert.equal((await late).recorded,false);assert.equal(h.queue().length,0);
  assert.equal((await h.collector.record(event,{authorize:()=>true})).recorded,true);
});

const liveFrame=h=>({documentId:h.control.documentId,url:h.control.url,documentLifecycle:'active',errorOccurred:false});
const liveTab=h=>({id:17,url:h.control.url,incognito:false});
const invalidFrames=[
  ['cached',{documentLifecycle:'cached'}],['prerender',{documentLifecycle:'prerender'}],
  ['unknown-lifecycle',{documentLifecycle:undefined}],['error',{errorOccurred:true}],
  ['unknown-error',{errorOccurred:undefined}],['document',{documentId:'replacement-document'}],
  ['full-url',{url:sender().url+'changed'}]
];
const invalidTabs=[
  ['id',{id:18}],['full-url',{url:sender().url+'changed'}],
  ['incognito',{incognito:true}],['unknown-incognito',{incognito:undefined}],
  ['pending-navigation',{pendingUrl:'https://chatgpt.com/c/another?draft=new#body'}]
];
for(const phase of ['before','after']){
  for(const [kind,cases] of [['frame',invalidFrames],['tab',invalidTabs]]){
    for(const [name,patch] of cases){
      test('live '+kind+' '+name+' rejected '+phase+' probe',async()=>{
        const h=harness();await h.collector.setConsent(true);
        const invalidate=()=>{h.control[kind]=()=>({... (kind==='frame'?liveFrame(h):liveTab(h)),...patch});};
        if(phase==='before')invalidate();
        else h.control.probe=()=>{invalidate();return h.control.permitted;};
        assert.equal((await h.send()).data.recorded,false);
        assert.equal(h.queue().length,0);
        assert.equal(h.probes.length,phase==='before'?0:1,'preflight must finish before any page probe');
        assert.equal(h.frames.length,phase==='before'?1:2);assert.equal(h.tabs.length,h.frames.length);
      });
    }
  }
}
for(const [owner,method] of [['tabs','get'],['tabs','sendMessage'],['webNavigation','getFrame']]){
  test('missing required live API fails closed: '+owner+'.'+method,async()=>{
    const h=harness();await h.collector.setConsent(true);delete h.api[owner][method];
    assert.equal((await h.send()).data.recorded,false);assert.equal(h.probes.length,0);assert.equal(h.queue().length,0);
  });
}
for(const phase of ['before','after']){
  for(const kind of ['frame','tab']){
    test('navigation while awaiting '+phase+' '+kind+' read rejects the event',async()=>{
      const h=harness(),entered=deferred(),release=deferred();await h.collector.setConsent(true);
      let calls=0;
      h.control[kind]=async()=>{
        if(++calls===(phase==='before'?1:2)){entered.resolve();await release.promise;}
        return kind==='frame'?{...liveFrame(h),documentLifecycle:h.control.cached?'cached':'active'}:
          {...liveTab(h),...(h.control.pending?{pendingUrl:'https://chatgpt.com/c/next'}:{})};
      };
      const pending=h.send();await entered.promise;
      if(kind==='frame')h.control.cached=true;else h.control.pending=true;
      release.resolve();assert.equal((await pending).data.recorded,false);assert.equal(h.queue().length,0);
      assert.equal(h.probes.length,phase==='before'?0:1);
    });
  }
}
for(const phase of ['before','after']){
  for(const outcome of ['throw','timeout','missing']){
    test('tabs.get '+outcome+' '+phase+' probe fails closed',async()=>{
      const h=harness();await h.collector.setConsent(true);
      const invalidate=()=>{h.control.tab=()=>{
        if(outcome==='throw')throw Error('tab closed');
        if(outcome==='timeout')return new Promise(()=>{});
        return undefined;
      };};
      if(phase==='before')invalidate();else h.control.probe=()=>{invalidate();return h.control.permitted;};
      assert.equal((await h.send()).data.recorded,false);assert.equal(h.queue().length,0);
    });
  }
}
for(const phase of ['sender','before','after']){
  test('same-URL pending navigation is rejected at '+phase,async()=>{
    const h=harness();await h.collector.setConsent(true);
    const source={...h.source,documentLifecycle:'active'};
    if(phase==='sender')source.tab={...source.tab,pendingUrl:source.url};
    const pendingTab=()=>{h.control.tab=()=>({...liveTab(h),pendingUrl:h.control.url});};
    if(phase==='before')pendingTab();
    if(phase==='after')h.control.probe=()=>{pendingTab();return h.control.permitted;};
    const result=await h.send(message,source);
    if(phase==='sender')assert.equal(result.code,'E_SENDER');
    else assert.equal(result.data.recorded,false);
    assert.equal(h.queue().length,0);
    assert.equal(h.probes.length,phase==='after'?1:0);
    assert.equal(h.frames.length,phase==='sender'?0:phase==='before'?1:2);
    assert.equal(h.tabs.length,h.frames.length);
  });
}

test('live Host checks preserve real custom-site failure/fallback policy without editor or content upload',async t=>{
  const url='https://scope.example/compose/private?draft=secret#body',wire=[];
  const h=harness({url,fetcher:async(_url,options)=>{
    const batch=JSON.parse(options.body);wire.push(batch);
    return {ok:true,json:async()=>({ok:true,accepted:batch.events.map(row=>row.eventId),duplicates:[]})};
  }});
  const id='prompt-shortcuts',dataKey=sidebarToolStorageKey(id);
  const pkg=JSON.parse(await readFile('examples/sidebar-tools/prompt-shortcuts/prompt-shortcuts.opendesk-tool.json','utf8'));
  h.values.set(SIDEBAR_TOOL_STORE,[pkg]);h.values.set(SIDEBAR_TOOL_ENABLE_STORE,{});
  h.values.set(TOOL_REVOCATION_EPOCHS_STORE,{[id]:'current-install'});
  h.values.set(dataKey,{library:{schema:1,items:[],settings:{webButtons:false}},sites:{schema:1,rules:[{
    origin:'https://scope.example',pathScope:'/compose',containerSelector:'main',editorSelector:'textarea',enabled:true
  }]}});
  const messages=new Set(),changes=new Set();
  const api={...h.api,runtime:{...h.api.runtime,getManifest:()=>({background:{service_worker:'background.js'}}),
    onMessage:{addListener:fn=>messages.add(fn),removeListener:fn=>messages.delete(fn)}},
    storage:{...h.api.storage,onChanged:{addListener:fn=>changes.add(fn),removeListener:fn=>changes.delete(fn)}}};
  // No editor or rendered UI. Only the real fixed scope listener is exercised.
  const doc={addEventListener(){},removeEventListener(){}};
  const win={location:{href:url},addEventListener(){},removeEventListener(){},
    setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout};win.top=win;
  const page=initPromptShortcuts({api,doc,win});assert(page);t.after(()=>page.dispose());
  h.control.probe=payload=>new Promise(resolve=>{
    let accepted=false,responded=false;
    for(const fn of messages)if(fn(payload,{id:api.runtime.id,url:api.runtime.getURL('background.js')},
      value=>{responded=true;resolve(value);})===true)accepted=true;
    assert(accepted||responded,'the real fixed adapter must handle the exact probe');
  });
  await h.collector.setConsent(true);
  const failed={...message,event:'prompt.failed',reason:'editor_unavailable'};
  assert.equal((await h.send(failed)).data.recorded,true);
  assert.equal((await h.send({...message,event:'prompt.fallback_copied',channel:'fallback'})).data.recorded,true);
  assert.deepEqual(h.queue().map(row=>row.event),['prompt.failed','prompt.fallback_copied','tool.engaged']);
  assert.equal(h.probes.length,3);assert.equal(h.frames.length,6);assert.equal(h.tabs.length,6);
  const count=h.values.get(ANALYTICS_STATE_KEY).queue.length;
  assert.equal((await h.collector.flush()).sent,count);
  for(const data of [h.writes,wire]){
    assert(!JSON.stringify(data).includes(url));assert(!JSON.stringify(data).includes('secret'));
  }
  h.values.set(SIDEBAR_TOOL_ENABLE_STORE,{[id]:false});
  for(const changed of changes)changed({[SIDEBAR_TOOL_ENABLE_STORE]:{}},'local');
  assert.equal((await h.send(failed)).data.recorded,false);assert.equal(h.queue().length,0);
});
