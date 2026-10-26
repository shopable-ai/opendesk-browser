import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMarketHandoff} from '../../src/marketplace/external.js';
import {createMarketPanelHost,registerMarketPanelHost,MARKET_PANEL_PROTOCOL,requestPendingMarketReviews,claimMarketReview} from '../../src/marketplace/panel.js';
import {MARKET_INTENT_PROTOCOL,MARKET_INTENTS_STORE,MARKET_INTENT_TTL,readMarketIntentStore,consumeReviewIntent,loadReviewIntent} from '../../src/marketplace/intent.js';
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';
import {MARKET_OPERATIONS_STORE,installReviewedSidebarTool} from '../../src/ui/sidebar-tools/installation.js';

function fixture(){
  const origin='http://127.0.0.1:43132',id='a'.repeat(32),values={},opened=[],created=[];
  const source={id:1,windowId:10,url:origin+'/apps/',incognito:false};
  const sender={url:source.url,origin,frameId:0,documentId:'1'.repeat(32),documentLifecycle:'active',tab:{...source}};
  let top={documentId:sender.documentId,parentFrameId:-1,documentLifecycle:'active',url:source.url};
  const contexts=[],listeners=new Set();
  const api={runtime:{id,getURL:path=>'chrome-extension://'+id+'/'+path,
    async getContexts(){return structuredClone(contexts);},
    onMessage:{addListener:l=>listeners.add(l),removeListener:l=>listeners.delete(l)}},
    storage:{local:{async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,structuredClone(values[k])]));},
      async set(rows){Object.assign(values,structuredClone(rows));}}},
    tabs:{async get(tabId){return tabId===source.id?structuredClone(source):undefined;},async query(){return [source];},
      async create(options){created.push(options);return {id:2,windowId:10,...options};},async update(){throw Error('Unexpected focus');}},
    windows:{async create(){throw Error('No popup allowed');},async update(){}},
    sidePanel:{async open(options){opened.push(options);}},
    webNavigation:{async getFrame(){return structuredClone(top);}}};
  // A serial lock exposes nested CLAIM/consume deadlocks rather than hiding them.
  const tails=new Map(),lockManager={request(name,work){const result=(tails.get(name)||Promise.resolve()).then(work);tails.set(name,result.catch(()=>{}));return result;}};
  const channel={enabled:true,extensionId:id,origin};
  const restart=()=>createMarketHandoff({api,channel,lockManager});
  const panel=createMarketPanelHost({api,lockManager});
  const panelSender={id,url:api.runtime.getURL('sidepanel.html')+'?hostInstanceId='+randomUUID(),frameId:0,documentId:'2'.repeat(32),documentLifecycle:'active'};
  const context={contextType:'SIDE_PANEL',documentId:panelSender.documentId,documentUrl:panelSender.url,frameId:0,windowId:10,tabId:-1,incognito:false};
  const request={protocol:MARKET_INTENT_PROTOCOL,action:'OPEN_INSTALL_REVIEW',intentId:randomUUID(),subject:{kind:'app',marketId:'opendesk/example-app',version:'1.0.0'}};
  const host=restart();
  const row=()=>values[MARKET_INTENTS_STORE].intents[0];
  const claim=(who=panelSender)=>panel.handle({protocol:MARKET_PANEL_PROTOCOL,action:'CLAIM',reviewId:row().reviewId},who);
  const list=()=>panel.handle({protocol:MARKET_PANEL_PROTOCOL,action:'LIST'},panelSender);
  const consume=(options={})=>consumeReviewIntent({api,lockManager,reviewId:row().reviewId,operationId:row().operationId,subject:row().subject,...options});
  return {api,values,opened,created,source,sender,contexts,panelSender,context,request,host,restart,row,claim,list,consume,panel,lockManager,listeners,
    setTop:value=>{top=value;},top:()=>top};
}
test('native panel presentation starts synchronously before IO, without approval or package writes',async()=>{
  const h=fixture(),events=[];
  h.api.sidePanel.open=options=>{events.push(['open',options]);return Promise.resolve();};
  const get=h.api.storage.local.get;
  h.api.storage.local.get=async keys=>{events.push(['storage']);return get(keys);};
  const pending=h.host.handle(h.request,h.sender);
  assert.deepEqual(events,[['open',{windowId:10}]],'native activation is used in the external message call stack');
  await pending;
  assert.equal(h.row().consumedAt,null);
  assert.equal(h.values[SIDEBAR_TOOL_STORE],undefined);
  assert.equal(h.values[MARKET_OPERATIONS_STORE],undefined);
});
test('untrusted envelopes and read-only requests cannot trigger immediate panel presentation',async()=>{
  const h=fixture();
  await assert.rejects(h.host.handle(h.request,{...h.sender,origin:'https://foreign.invalid'}),{code:'E_ORIGIN'});
  await h.host.handle({protocol:MARKET_INTENT_PROTOCOL,action:'PROBE'},h.sender);
  await h.host.handle({protocol:MARKET_INTENT_PROTOCOL,action:'GET_APP_STATUS',subject:h.request.subject},h.sender);
  assert.deepEqual(h.opened,[]);
});
test('app open persists source target; failed activation requires toolbar, successful call alone remains pending',async()=>{
  const h=fixture();h.api.sidePanel.open=async()=>{throw Error('User gesture required');};
  const first=await h.host.handle(h.request,h.sender);
  assert.equal(first.status,'PANEL_REQUIRED');assert.match(first.message,/工具栏/);
  const original=structuredClone(h.row());
  assert.deepEqual(original.panelTarget,{tabId:1,windowId:10,documentId:h.sender.documentId,owner:null});
  assert.equal(original.tabId,null);assert.equal(original.consumedAt,null);
  h.api.sidePanel.open=async options=>h.opened.push(options);
  assert.equal((await h.restart().handle({...h.request,intentId:randomUUID()},h.sender)).status,'REVIEW_PENDING');
  assert.equal(h.row().reviewId,original.reviewId);assert.equal(h.row().operationId,original.operationId);
  h.contexts.push(h.context);
  assert.equal((await h.restart().handle(h.request,h.sender)).status,'REVIEW_OPENED');
  assert.deepEqual(h.opened,[{windowId:10},{windowId:10}]);assert.deepEqual(h.created,[]);
  assert.equal(h.values[MARKET_OPERATIONS_STORE],undefined);
});
for(const mutation of [c=>c.contextType='TAB',c=>c.windowId=11,c=>c.frameId=1,c=>c.incognito=true,c=>c.documentUrl+='?fake',c=>c.documentId='fake'])
  test('open does not report REVIEW_OPENED for a wrong native context '+mutation,async()=>{
    const h=fixture(),context={...h.context};mutation(context);h.contexts.push(context);
    assert.equal((await h.host.handle(h.request,h.sender)).status,'REVIEW_PENDING');
  });
test('closing panel never cancels app; collections still create and track their review tab',async()=>{
  const h=fixture();await h.host.handle(h.request,h.sender);h.row().tabId=99;
  const status=await h.host.handle({...h.request,action:'GET_INSTALL_STATUS'},h.sender);
  assert.equal(status.installation,'review');
  const request={...h.request,intentId:randomUUID(),subject:{kind:'collection',collectionId:'starter-kit',revision:1}};
  assert.equal((await h.host.handle(request,h.sender)).status,'REVIEW_OPENED');
  assert.equal(h.created.length,1);assert.match(h.created[0].url,/ui\/marketplace.html\?intent=/);
  const collection=h.values[MARKET_INTENTS_STORE].intents[1];assert.equal(collection.panelTarget,undefined);
  assert.equal((await h.host.handle({...request,action:'GET_INSTALL_STATUS'},h.sender)).installation,'cancelled');
});
for(const changes of [{id:'b'.repeat(32)},{frameId:1},{url:'https://foreign.invalid/'},{documentId:'3'.repeat(32)},{documentLifecycle:'prerender'}])
  test('panel LIST/CLAIM rejects forged sender '+JSON.stringify(changes),async()=>{
    const h=fixture();await h.host.handle(h.request,h.sender);h.contexts.push(h.context);
    const before=structuredClone(h.values);
    for(const action of ['LIST','CLAIM'])await assert.rejects(h.panel.handle({protocol:MARKET_PANEL_PROTOCOL,action,
      ...(action==='CLAIM'?{reviewId:h.row().reviewId}:{})},{...h.panelSender,...changes}),{code:'E_PANEL_OWNER'});
    assert.deepEqual(h.values,before);
  });
test('ordinary sidepanel tab is rejected even with exact URL and document identity',async()=>{
  const h=fixture();await h.host.handle(h.request,h.sender);h.contexts.push({...h.context,contextType:'TAB'});
  await assert.rejects(h.list(),{code:'E_PANEL_OWNER'});await assert.rejects(h.claim(),{code:'E_PANEL_OWNER'});
});
test('owner rebind requires old owner absent; an old active document cannot steal back or consume',async()=>{
  const h=fixture();await h.host.handle(h.request,h.sender);h.contexts.push(h.context);
  assert.equal((await h.claim()).handoff.panelTarget.owner.documentId,h.panelSender.documentId);
  const newer={...h.panelSender,documentId:'3'.repeat(32)},newContext={...h.context,documentId:newer.documentId};
  h.contexts.push(newContext);
  await assert.rejects(h.claim(newer),{code:'E_PANEL_OWNER'});
  h.contexts.shift();assert.equal((await h.claim(newer)).handoff.panelTarget.owner.documentId,newer.documentId);
  h.contexts.push(h.context);
  await assert.rejects(h.claim(),{code:'E_PANEL_OWNER'});
  await assert.rejects(h.consume({panelOwnerDocumentId:h.panelSender.documentId}),{code:'E_PANEL_OWNER'});
  assert.equal(h.row().consumedAt,null);
});
for(const change of [h=>h.setTop({...h.top(),documentId:'4'.repeat(32)}),h=>h.source.windowId=11,
  h=>h.source.url='https://foreign.invalid/',h=>h.source.pendingUrl=h.source.url+'next',h=>h.setTop({...h.top(),documentLifecycle:'cached'}),h=>h.source.id=99])
  test('source freshness rejects unsubmitted CLAIM and consume '+change,async()=>{
    const h=fixture();await h.host.handle(h.request,h.sender);h.contexts.push(h.context);await h.claim();change(h);
    await assert.rejects(h.claim(),{code:'E_DOCUMENT'});
    await assert.rejects(h.consume({panelOwnerDocumentId:h.panelSender.documentId}),{code:'E_DOCUMENT'});
    assert.deepEqual((await h.list()).reviews,[]);assert.equal(h.row().consumedAt,null);
  });
test('consume validate can CLAIM over the real serial intent lock, then consumes once',async()=>{
  const h=fixture();await h.host.handle(h.request,h.sender);h.contexts.push(h.context);
  const consumed=await h.consume({validate:async()=> (await h.claim()).handoff});
  assert.equal(consumed.panelTarget.owner.documentId,h.panelSender.documentId);assert.ok(consumed.consumedAt);
  await assert.rejects(h.consume({validate:async()=> (await h.claim()).handoff}),{code:'E_INTENT_CONSUMED'});
});
test('navigation between CLAIM callback and consume lock is rejected',async()=>{
  const h=fixture();await h.host.handle(h.request,h.sender);h.contexts.push(h.context);
  await assert.rejects(h.consume({validate:async()=>{const result=await h.claim();h.setTop({...h.top(),documentId:'5'.repeat(32)});return result.handoff;}}),{code:'E_DOCUMENT'});
  assert.equal(h.row().consumedAt,null);
});
test('submitted unknown survives expiry/source closure and panel restart as read-only, terminal hidden from LIST',async()=>{
  const h=fixture();await h.host.handle(h.request,h.sender);h.contexts.push(h.context);await h.claim();
  h.row().consumedAt=Date.now();h.row().createdAt-=MARKET_INTENT_TTL+1000;h.row().expiresAt=h.row().createdAt+MARKET_INTENT_TTL;
  h.source.url='https://foreign.invalid/';h.setTop(null);
  assert.equal((await h.claim()).handoff.recoveryOnly,true);assert.equal((await h.list()).reviews[0].recoveryOnly,true);
  assert.equal((await loadReviewIntent(h.api,h.row().reviewId)).recoveryOnly,true);
  h.values[MARKET_OPERATIONS_STORE]={[h.row().operationId]:{marketId:h.row().subject.marketId,version:'1.0.0',state:'succeeded'}};
  assert.deepEqual((await h.list()).reviews,[]);assert.equal((await h.claim()).handoff.recoveryOnly,true);
});
test('LIST excludes cancelled and terminal, retains unknown and committing, and scopes to window',async()=>{
  const h=fixture();await h.host.handle(h.request,h.sender);h.contexts.push(h.context);
  const base=structuredClone(h.row());
  const add=(state,change={})=>{const row={...structuredClone(base),intentId:randomUUID(),reviewId:randomUUID(),operationId:randomUUID(),...change};
    h.values[MARKET_INTENTS_STORE].intents.push(row);
    if(state)(h.values[MARKET_OPERATIONS_STORE]??={})[row.operationId]={state,marketId:row.subject.marketId,version:row.subject.version};return row;};
  add(null,{cancelledAt:Date.now()});add('failed');add('succeeded');const unknown=add('outcome-unknown'),committing=add('committing');
  add(null,{panelTarget:{...base.panelTarget,windowId:11}});
  const rows=(await h.list()).reviews;assert.deepEqual(rows.map(r=>r.reviewId),[base.reviewId,unknown.reviewId,committing.reviewId]);
});
test('strict optional metadata preserves legacy records and rejects corrupt target/owner or extra fields',async()=>{
  const h=fixture();await h.host.handle(h.request,h.sender);const original=structuredClone(h.values[MARKET_INTENTS_STORE]);
  const legacy=structuredClone(original);delete legacy.intents[0].panelTarget;assert.doesNotThrow(()=>readMarketIntentStore(legacy));
  for(const change of [r=>r.panelTarget=null,r=>r.panelTarget.extra=true,r=>r.panelTarget.windowId=-1,
    r=>r.panelTarget.documentId=randomUUID(),r=>r.panelTarget.owner={documentId:'2'.repeat(32),documentUrl:'https://evil.invalid'},
    r=>r.panelTarget.owner={documentId:'2'.repeat(32),documentUrl:h.panelSender.url,approved:true},r=>r.subject={kind:'collection',collectionId:'starter-kit',revision:1}]){
    const stored=structuredClone(original);change(stored.intents[0]);assert.throws(()=>readMarketIntentStore(stored),{code:'E_INTENT_STORAGE'});
  }
});
test('same origin replacement document must use a new request; original target is never overwritten',async()=>{
  const h=fixture();await h.host.handle(h.request,h.sender);const first=structuredClone(h.row());
  h.sender.documentId='6'.repeat(32);h.setTop({...h.top(),documentId:h.sender.documentId});
  await h.host.handle({...h.request,intentId:randomUUID()},h.sender);
  assert.equal(h.values[MARKET_INTENTS_STORE].intents.length,2);assert.deepEqual(h.row().panelTarget,first.panelTarget);
});
test('registered protocol helpers return rows and handoff, unknown messages ignored and disposal removes listener',async()=>{
  const h=fixture();await h.host.handle(h.request,h.sender);h.contexts.push(h.context);
  const remove=registerMarketPanelHost(h.api,{lockManager:h.lockManager});
  const listener=[...h.listeners][0];assert.equal(listener({protocol:'other'},h.panelSender,()=>{}),undefined);
  h.api.runtime.sendMessage=message=>new Promise(resolve=>listener(message,h.panelSender,resolve));
  const rows=await requestPendingMarketReviews(h.api);assert.equal(rows[0].reviewId,h.row().reviewId);
  assert.equal((await claimMarketReview(h.api,h.row().reviewId)).operationId,h.row().operationId);
  await assert.rejects(h.panel.handle({protocol:MARKET_PANEL_PROTOCOL,action:'LIST',approved:true},h.panelSender),{code:'E_PANEL_MESSAGE'});
  remove();assert.equal(h.listeners.size,0);
});

test('journal without a consume marker is recovery-only and cannot be submitted after source navigation',async()=>{
  const h=fixture();await h.host.handle(h.request,h.sender);h.contexts.push(h.context);
  h.values[MARKET_OPERATIONS_STORE]={[h.row().operationId]:{state:'committing'}};
  h.source.url='https://foreign.invalid/';h.setTop(null);
  assert.equal((await h.claim()).handoff.recoveryOnly,true);
  await assert.rejects(h.consume({validate:async()=> (await h.claim()).handoff}),{code:'E_INTENT_CONSUMED'});
  assert.equal(h.row().consumedAt,null);assert.equal(h.values[MARKET_OPERATIONS_STORE][h.row().operationId].state,'committing');
});
test('CLAIM rechecks an already-owned review and refuses a cross-window panel',async()=>{
  const h=fixture();await h.host.handle(h.request,h.sender);h.contexts.push(h.context);await h.claim();
  h.contexts[0].windowId=11;
  await assert.rejects(h.claim(),{code:'E_PANEL_TARGET'});
  assert.deepEqual((await h.list()).reviews,[]);
});
test('owner liveness query failure cannot permit takeover',async()=>{
  const h=fixture();await h.host.handle(h.request,h.sender);h.contexts.push(h.context);await h.claim();
  const newer={...h.panelSender,documentId:'7'.repeat(32)};h.contexts.push({...h.context,documentId:newer.documentId});
  const get=h.api.runtime.getContexts;
  h.api.runtime.getContexts=async query=>{if(query.documentIds?.[0]===h.panelSender.documentId)throw Error('Unavailable');return get(query);};
  await assert.rejects(h.claim(newer),{code:'E_PANEL_OWNER'});
  assert.equal(h.row().panelTarget.owner.documentId,h.panelSender.documentId);
});
test('live top document mismatch cannot persist or expose a review after presentation starts',async()=>{
  const h=fixture();h.setTop({...h.top(),documentId:'8'.repeat(32)});
  await assert.rejects(h.host.handle(h.request,h.sender),{code:'E_DOCUMENT'});
  assert.deepEqual(h.values,{});
  assert.deepEqual(h.opened,[{windowId:10}],'browser-owned envelope may present the empty trusted panel only');
  h.contexts.push(h.context);
  assert.deepEqual((await h.list()).reviews,[],'unverified document cannot provide a review to the UI');
});

test('hostInstanceId URL is bound exactly and repeated same-owner CLAIM does not emit storage writes',async()=>{
  const h=fixture();await h.host.handle(h.request,h.sender);h.contexts.push(h.context);
  const set=h.api.storage.local.set;let writes=0;
  h.api.storage.local.set=async rows=>{writes++;return set(rows);};
  await h.claim();assert.equal(writes,1);assert.equal(h.row().panelTarget.owner.documentUrl,h.panelSender.url);
  assert.equal((await h.host.handle(h.request,h.sender)).status,'REVIEW_OPENED');
  writes=0;await h.claim();await h.claim();assert.equal(writes,0);
  h.setTop({...h.top(),documentId:'9'.repeat(32)});
  await assert.rejects(h.claim(),{code:'E_DOCUMENT'});assert.equal(writes,0);
});
for(const suffix of ['?unexpected=1','?hostInstanceId=','?hostInstanceId=x&hostInstanceId=y',
  '?hostInstanceId=x&approved=true','?hostInstanceId=x&toolId=example-app','?hostInstanceId=x&scheduledRunner=1','#forged'])
  test('panel rejects noncanonical query/locator even with matching native context '+suffix,async()=>{
    const h=fixture();await h.host.handle(h.request,h.sender);
    h.panelSender.url=h.api.runtime.getURL('sidepanel.html')+suffix;
    h.contexts.push({...h.context,documentUrl:h.panelSender.url});
    await assert.rejects(h.claim(),{code:'E_PANEL_OWNER'});
    assert.equal((await h.host.handle(h.request,h.sender)).status,'REVIEW_PENDING');
    h.row().panelTarget.owner={documentId:h.panelSender.documentId,documentUrl:h.panelSender.url};
    assert.throws(()=>readMarketIntentStore(h.values[MARKET_INTENTS_STORE]),{code:'E_INTENT_STORAGE'});
  });
test('a different valid hostInstanceId URL cannot impersonate the native owner URL',async()=>{
  const h=fixture();await h.host.handle(h.request,h.sender);h.contexts.push(h.context);
  await assert.rejects(h.claim({...h.panelSender,url:h.api.runtime.getURL('sidepanel.html')+'?hostInstanceId='+randomUUID()}),{code:'E_PANEL_OWNER'});
});
test('controller signature with explicit claimed owner and validate callback avoids nested lock deadlock',async()=>{
  const h=fixture();await h.host.handle(h.request,h.sender);h.contexts.push(h.context);
  const assertOwner=async()=> (await h.claim()).handoff,claimed=await assertOwner();
  const result=await h.consume({panelOwnerDocumentId:claimed.panelTarget.owner.documentId,validate:assertOwner});
  assert.ok(result.consumedAt);assert.equal(result.panelTarget.owner.documentUrl,h.panelSender.url);
});

// Matches the native global panel schema: no sender.tab/frameId, possibly no
// sender.documentId, and native context.windowId/tabId both -1.
async function globalPanel({missingDocumentId=false}={}){
  const h=fixture();await h.host.handle(h.request,h.sender);
  h.panelSender.documentId='2DFA7D47BE6251299E7F6994422B9919';delete h.panelSender.frameId;
  h.contexts.push({...h.context,documentId:h.panelSender.documentId,windowId:-1,tabId:-1});
  if(missingDocumentId)delete h.panelSender.documentId;
  let currentWindow=10;
  h.api.windows.getCurrent=async()=>({id:currentWindow,type:'normal',incognito:false});
  h.api.windows.get=async id=>[10,11].includes(id)?{id,type:'normal',incognito:false}:undefined;
  h.api.runtime.sendMessage=message=>h.panel.handle(message,h.panelSender);
  return {...h,currentWindow:id=>{currentWindow=id;}};
}
for(const missingDocumentId of [false,true])
  test('native global panel LIST/CLAIM/consume normalizes missing fields, native uppercase ID; missing documentId='+missingDocumentId,async()=>{
    const h=await globalPanel({missingDocumentId});
    const rows=await requestPendingMarketReviews(h.api);assert.equal(rows.length,1);assert.equal(rows[0].reviewId,h.row().reviewId);
    const assertOwner=()=>claimMarketReview(h.api,h.row().reviewId);
    const claimed=await assertOwner();assert.equal(claimed.panelTarget.owner.documentId,h.contexts[0].documentId);
    assert.equal(claimed.panelTarget.windowId,10);
    const result=await h.consume({panelOwnerDocumentId:claimed.panelTarget.owner.documentId,validate:assertOwner});
    assert.ok(result.consumedAt);assert.equal(result.panelTarget.owner.documentId,h.contexts[0].documentId);
    h.currentWindow(11);assert.deepEqual(await requestPendingMarketReviews(h.api),[]);
    await assert.rejects(assertOwner(),{code:'E_PANEL_TARGET'});
  });
test('global panel requires a panel window locator; a raw LIST cannot assume source or focused window',async()=>{
  const h=await globalPanel();
  await assert.rejects(h.list(),{code:'E_PANEL_WINDOW'});
  assert.equal(h.row().panelTarget.owner,null);
});
for(const change of [h=>h.contexts[0].contextType='TAB',h=>h.contexts[0].frameId=1,
  h=>h.contexts[0].incognito=true,h=>h.contexts.push({...h.contexts[0],documentId:'A'.repeat(32)}),
  h=>h.panelSender.tab={id:3,windowId:10},h=>h.panelSender.tab={},
  h=>{h.panelSender.tab={id:3,windowId:10};h.panelSender.frameId=0;},
  h=>{h.panelSender.tab={};h.panelSender.frameId=0;},h=>h.panelSender.url=h.api.runtime.getURL('sidepanel.html'),
  h=>h.panelSender.documentId='B'.repeat(32),h=>h.contexts[0].documentId=randomUUID()])
  test('native missing-document fallback rejects absent/ambiguous/wrong panel identity '+change,async()=>{
    const h=await globalPanel({missingDocumentId:true});change(h);
    const before=structuredClone(h.values);
    await assert.rejects(requestPendingMarketReviews(h.api),{code:'E_PANEL_OWNER'});
    await assert.rejects(claimMarketReview(h.api,h.row().reviewId),{code:'E_PANEL_OWNER'});
    assert.deepEqual(h.values,before);
  });
for(const window of [undefined,{id:-1,type:'normal'},{id:10,type:'normal',incognito:true},{id:10,type:'popup'}])
  test('panel helper refuses invalid native windows.getCurrent '+JSON.stringify(window),async()=>{
    const h=await globalPanel();h.api.windows.getCurrent=async()=>window;
    await assert.rejects(requestPendingMarketReviews(h.api),{code:'E_PANEL_WINDOW'});
    assert.equal(h.row().panelTarget.owner,null);
  });
for(const window of [undefined,{id:11,type:'normal'},{id:10,type:'normal',incognito:true},{id:10,type:'popup'}])
  test('receiver verifies native panel window still exists '+JSON.stringify(window),async()=>{
    const h=await globalPanel();h.api.windows.get=async()=>window;
    await assert.rejects(requestPendingMarketReviews(h.api),{code:'E_PANEL_WINDOW'});
    assert.equal(h.row().panelTarget.owner,null);
  });
test('ordinary TAB and external market cannot spoof panel window or missing-document handshake',async()=>{
  const h=await globalPanel({missingDocumentId:true});
  await assert.rejects(h.host.handle({...h.request,windowId:10},h.sender),{code:'E_INTENT_FIELDS'});
  await assert.rejects(h.panel.handle({protocol:MARKET_PANEL_PROTOCOL,action:'LIST',windowId:10},
    {...h.sender,id:h.api.runtime.id}),{code:'E_PANEL_OWNER'});
  const tabSender={id:h.api.runtime.id,frameId:0,tab:{id:3,windowId:10},url:h.panelSender.url,documentId:'C'.repeat(32)};
  h.contexts.splice(0,1,{contextType:'TAB',frameId:0,tabId:3,windowId:10,documentId:tabSender.documentId,documentUrl:tabSender.url});
  await assert.rejects(h.panel.handle({protocol:MARKET_PANEL_PROTOCOL,action:'CLAIM',reviewId:h.row().reviewId,windowId:10},tabSender),{code:'E_PANEL_OWNER'});
});
test('missing-document normalization is pinned across CLAIM source IO and cannot bind a replaced native document',async()=>{
  const h=await globalPanel({missingDocumentId:true}),get=h.api.webNavigation.getFrame;
  h.api.webNavigation.getFrame=async query=>{const result=await get(query);h.contexts[0].documentId='D'.repeat(32);return result;};
  await assert.rejects(claimMarketReview(h.api,h.row().reviewId),{code:'E_PANEL_OWNER'});
  assert.equal(h.row().panelTarget.owner,null);
});

test('final synchronous readiness guard rejects tool dirtying during the last native context await before consume',async()=>{
  const h=await globalPanel({missingDocumentId:true});
  const claimed=await claimMarketReview(h.api,h.row().reviewId),get=h.api.runtime.getContexts,set=h.api.storage.local.set;
  let dirty=false,checked=false,writes=0;
  h.api.runtime.getContexts=async query=>{const contexts=await get(query);dirty=true;return contexts;};
  h.api.storage.local.set=async rows=>{writes++;return set(rows);};
  await assert.rejects(h.consume({panelOwnerDocumentId:claimed.panelTarget.owner.documentId,
    assertReady:()=>{checked=true;if(dirty)throw Object.assign(Error('Tool has unsaved changes'),{code:'E_TOOL_DIRTY'});}}),{code:'E_TOOL_DIRTY'});
  assert.equal(checked,true);assert.equal(writes,0);assert.equal(h.row().consumedAt,null);
  h.api.runtime.getContexts=get;dirty=false;
  const result=await h.consume({panelOwnerDocumentId:claimed.panelTarget.owner.documentId,assertReady:()=>assert.equal(dirty,false)});
  assert.ok(result.consumedAt);assert.equal(writes,1);
});
test('readiness callback cannot introduce an asynchronous gap before the consume marker',async()=>{
  const h=await globalPanel();const claimed=await claimMarketReview(h.api,h.row().reviewId);
  await assert.rejects(h.consume({panelOwnerDocumentId:claimed.panelTarget.owner.documentId,
    assertReady:()=>Promise.resolve(true)}),{code:'E_INTENT_STATE'});
  assert.equal(h.row().consumedAt,null);
});


test('final guard after last native await leaves consume null, journal absent and old installed package intact',async()=>{
  const h=await globalPanel({missingDocumentId:true});
  const previous={format:'opendesk.sidebar-tool.v1',id:'example-app',version:'0.9.0',title:'Existing app',
    description:'Existing installed bytes',capabilities:[],html:'<main>Old package</main>',css:'',js:'void 0;'};
  const candidate={...previous,version:h.row().subject.version,html:'<main>New package</main>'};
  h.values[SIDEBAR_TOOL_STORE]=[structuredClone(previous)];
  const claimed=await claimMarketReview(h.api,h.row().reviewId),get=h.api.runtime.getContexts;
  let dirty=false,guardCalls=0,contextAwaitCompleted=false;
  h.api.runtime.getContexts=async query=>{
    const contexts=await get(query);
    await Promise.resolve(); // Yield during the final requireMarketPanelContext.
    dirty=true;contextAwaitCompleted=true;
    return contexts;
  };
  await assert.rejects(installReviewedSidebarTool({api:h.api,lockManager:h.lockManager,candidate,baseline:previous,
    reviewApproved:true,approveUpdate:()=>true,approveSourceChange:()=>true,
    market:{marketId:h.row().subject.marketId,sha256:await sidebarToolPackageHash(candidate),operationId:h.row().operationId},
    commitIntent:()=>h.consume({panelOwnerDocumentId:claimed.panelTarget.owner.documentId,
      assertReady:()=>{
        guardCalls++;assert.equal(contextAwaitCompleted,true);
        if(dirty)throw Object.assign(Error('Tool became dirty during native identity check'),{code:'E_TOOL_DIRTY'});
      }})}),{code:'E_TOOL_DIRTY'});
  assert.equal(guardCalls,1);
  assert.equal(h.row().consumedAt,null);
  assert.equal(h.values[MARKET_OPERATIONS_STORE],undefined);
  assert.deepEqual(h.values[SIDEBAR_TOOL_STORE],[previous]);
});

test('GET/OPEN rejects stale unsubmitted source as expired without mutation or automatic replacement; explicit new intent works',async()=>{
  const h=fixture();await h.host.handle(h.request,h.sender);
  const original=structuredClone(h.row()),saved=structuredClone(h.values),opened=h.opened.length;
  h.sender.documentId='A'.repeat(32);h.setTop({...h.top(),documentId:h.sender.documentId});
  for(const action of ['GET_INSTALL_STATUS','OPEN_INSTALL_REVIEW']){
    await assert.rejects(h.restart().handle({...h.request,action},h.sender),error=>{
      assert.equal(error.code,'E_INTENT_EXPIRED');assert.match(error.message,/原文档已更换，未提交审阅失效/);return true;
    });
    assert.deepEqual(h.values,saved);
    assert.equal(h.opened.length,opened+(action==='OPEN_INSTALL_REVIEW'?1:0),'only explicit OPEN can present UI; stale request never changes');
  }
  await h.restart().handle({...h.request,intentId:randomUUID()},h.sender);
  assert.equal(h.values[MARKET_INTENTS_STORE].intents.length,2);
  assert.deepEqual(h.row(),original);
  assert.equal(h.values[MARKET_INTENTS_STORE].intents[1].panelTarget.documentId,h.sender.documentId);
  assert.notEqual(h.values[MARKET_INTENTS_STORE].intents[1].operationId,original.operationId);
});
test('source refresh cannot expire consumed, journal/unknown, successful, failed or cancelled app requests',async()=>{
  for(const state of ['consumed','reviewed','committing','outcome-unknown','succeeded','failed','cancelled']){
    const h=fixture();await h.host.handle(h.request,h.sender);
    if(state==='consumed')h.row().consumedAt=Date.now();
    else if(state==='cancelled')h.row().cancelledAt=Date.now();
    else h.values[MARKET_OPERATIONS_STORE]={[h.row().operationId]:{
      state,marketId:h.row().subject.marketId,version:h.row().subject.version}};
    const before=await h.host.handle({...h.request,action:'GET_INSTALL_STATUS'},h.sender);
    const original=structuredClone(h.row()),journal=structuredClone(h.values[MARKET_OPERATIONS_STORE]);
    h.sender.documentId='B'.repeat(32);h.setTop({...h.top(),documentId:h.sender.documentId});
    const after=await h.restart().handle({...h.request,action:'GET_INSTALL_STATUS'},h.sender);
    assert.deepEqual(after,before,state);
    if(state==='cancelled')await assert.rejects(h.restart().handle(h.request,h.sender),{code:'E_INTENT_CANCELLED'});
    else assert.equal((await h.restart().handle(h.request,h.sender)).intentId,original.intentId,state);
    assert.deepEqual(h.row().panelTarget,original.panelTarget,state);
    assert.equal(h.row().consumedAt,original.consumedAt,state);
    assert.deepEqual(h.values[MARKET_OPERATIONS_STORE],journal,state);
    assert.equal(h.values[MARKET_INTENTS_STORE].intents.length,1,state);
  }
});
