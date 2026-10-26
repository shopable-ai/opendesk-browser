import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {loadMarketTool,marketResource,marketReleaseBase} from '../../src/marketplace/distribution.js';
import {createMarketHandoff} from '../../src/marketplace/external.js';
import {SIDEBAR_TOOL_ENABLE_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {MARKET_INTENT_PROTOCOL as protocol,MARKET_INTENTS_STORE,MARKET_INTENT_TTL,readMarketIntentStore} from '../../src/marketplace/intent.js';
import {SIDEBAR_TOOL_STORE,serializeSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {MARKET_OPERATIONS_STORE,MARKET_PROVENANCE_STORE} from '../../src/ui/sidebar-tools/installation.js';

const origin='http://127.0.0.1:43132',extensionId='a'.repeat(32);
const channel={schema:'opendesk.market.channel.v1',protocol,mode:'development',enabled:true,origin,extensionId};
const subject={kind:'app',marketId:'opendesk/market-independent',version:'1.0.0'};
const tool={format:'opendesk.sidebar-tool.v1',id:'market-independent',version:'1.0.0',title:'Independent',
  description:'Absent from the host catalog.',capabilities:['storage.local'],html:'<main>Independent</main>',css:'',js:'void 0;'};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function distribution({packageTool=tool,mutateRelease=()=>{},mutateBytes=bytes=>bytes}={}){
  const bytes=Buffer.from(serializeSidebarToolPackage(packageTool)),base=marketReleaseBase(subject),calls=[];
  const release={schema:'opendesk.market.release.v1',marketId:subject.marketId,version:subject.version,
    bytes:bytes.length,sha256:digest(bytes),packagePath:base+'package.opendesk-tool.json'};
  mutateRelease(release);
  const api={runtime:{id:extensionId,getURL:path=>'chrome-extension://'+extensionId+'/'+path}};
  const fetcher=async(url,options)=>{
    calls.push(url);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
    if(url===api.runtime.getURL('marketplace/channel.json'))return new Response(JSON.stringify(channel));
    if(url===origin+base+'descriptor.json')return new Response(JSON.stringify(release));
    if(url===origin+base+'package.opendesk-tool.json')return new Response(mutateBytes(bytes));
    throw Error('Unexpected resource '+url);
  };
  return {api,fetcher,calls,release};
}
test('a nonbundled fixed release loads only through the compiled channel and canonical descriptor',async()=>{
  const h=distribution(),result=await loadMarketTool(subject,{...h,origin});
  assert.equal(result.tool.id,tool.id);assert.deepEqual(result.release,h.release);assert.equal(h.calls.length,3);
  const wrong=distribution();await assert.rejects(loadMarketTool(subject,{...wrong,origin:'http://127.0.0.1:43133'}),{code:'E_PACKAGE_SOURCE'});
  assert.equal(wrong.calls.length,1,'wrong origin is rejected before downloading a descriptor');
});
test('digest, fixed identity, arbitrary paths and byte limits cannot substitute a package',async()=>{
  for(const options of [
    {mutateRelease:r=>r.sha256='0'.repeat(64)},
    {mutateRelease:r=>r.bytes++},
    {mutateBytes:bytes=>Buffer.concat([bytes,Buffer.from(' ')])}
  ])await assert.rejects(loadMarketTool(subject,{...distribution(options),origin}),{code:'E_PACKAGE_INTEGRITY'});
  for(const options of [
    {mutateRelease:r=>r.marketId='opendesk/another-tool'},
    {mutateRelease:r=>r.version='2.0.0'},
    {mutateRelease:r=>r.packagePath='https://untrusted.invalid/tool.json'},
    {packageTool:{...tool,id:'another-tool'}},
    {packageTool:{...tool,version:'2.0.0'}}
  ])await assert.rejects(loadMarketTool(subject,{...distribution(options),origin}),{code:'E_PACKAGE_IDENTITY'});
  for(const response of [{ok:true,redirected:true},{ok:true,url:origin+'/different'}])
    await assert.rejects(marketResource(origin+'/release',20,async()=>response),{code:'E_PACKAGE_SOURCE'});
  await assert.rejects(marketResource(origin+'/release',20,async()=>new Response('x'.repeat(21))),{code:'E_TOOL_LIMIT'});
});
function handoff(){
  const values={},writes=[],focused=[],tabs=new Map([[1,{id:1,windowId:1,url:origin+'/apps/',incognito:false}]]),popups=[];
  const sender={url:origin+'/apps/',origin,frameId:0,documentId:'B'.repeat(32),documentLifecycle:'active',tab:{id:1,incognito:false}};
  const api={runtime:{id:extensionId,getURL:path=>'chrome-extension://'+extensionId+'/'+path},
    storage:{local:{async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,structuredClone(values[key])]));},
      async set(rows){writes.push(structuredClone(rows));Object.assign(values,structuredClone(rows));}}},
    tabs:{async get(id){return tabs.get(id);},async query(){return [...tabs.values()];},async update(id){focused.push(id);return tabs.get(id);},async create(options){const tab={...options,id:3,windowId:1};tabs.set(3,tab);return tab;}},
    windows:{async update(){},async create(options){popups.push(options);const tab={id:2,windowId:2,url:options.url};tabs.set(2,tab);return {id:2,tabs:[tab]};}},
    webNavigation:{async getFrame(){return {...sender,parentFrameId:-1};}}};
  const lockManager={request:async(_name,callback)=>callback()};
  const restart=()=>createMarketHandoff({api,channel,lockManager});
  const host=restart();
  const request={protocol,action:'OPEN_INSTALL_REVIEW',intentId:randomUUID(),subject};
  return {api,host,restart,values,writes,focused,tabs,popups,sender,request,status:()=>host.handle({...request,action:'GET_INSTALL_STATUS'},sender)};
}
// Historical handoff metadata; approval still belongs exclusively to the trusted page.
function seedHistoricalApp(h){
  const createdAt=Date.now(),row={intentId:h.request.intentId,subject,reviewId:randomUUID(),operationId:randomUUID(),
    origin,createdAt,expiresAt:createdAt+MARKET_INTENT_TTL,phase:'opened',tabId:2,
    consumedAt:null,settledAt:null,closureReason:null};
  h.values[MARKET_INTENTS_STORE]={schema:MARKET_INTENTS_STORE,intents:[row],requests:[]};
  readMarketIntentStore(h.values[MARKET_INTENTS_STORE]);
  h.tabs.set(2,{id:2,windowId:2,url:h.api.runtime.getURL('ui/market-install.html')+'?intent='+row.reviewId});
  return row;
}
test('external app OPEN creates only the trusted popup and reuses it after worker replacement',async()=>{
  const h=handoff();assert.equal((await h.host.handle(h.request,h.sender)).status,'REVIEW_OPENED');
  const row=h.values[MARKET_INTENTS_STORE].intents[0];
  assert.equal(h.popups[0].type,'popup');assert.equal(h.popups[0].url,h.api.runtime.getURL('ui/market-install.html')+'?intent='+row.reviewId);
  await h.restart().handle({...h.request,intentId:randomUUID()},h.sender);
  assert.equal(h.popups.length,1);assert.deepEqual(h.focused,[2]);assert.equal(h.values[MARKET_INTENTS_STORE].intents.length,1);
  assert.equal(row.consumedAt,null);assert.equal(h.values[SIDEBAR_TOOL_STORE],undefined);assert.equal(h.values[MARKET_OPERATIONS_STORE],undefined);
});
test('new same-subject intent focuses the original unknown operation without replay',async()=>{
  const h=handoff(),row=seedHistoricalApp(h);row.consumedAt=row.createdAt;
  row.pageReview={documentId:h.sender.documentId,tabId:1,token:randomUUID(),sha256:digest(serializeSidebarToolPackage(tool)),baselineHash:null,cancelledAt:null};
  const result=await h.host.handle({...h.request,intentId:randomUUID()},h.sender);
  assert.equal(result.intentId,row.intentId);assert.deepEqual(h.focused,[2]);assert.deepEqual(h.popups,[]);
  assert.equal(h.values[MARKET_INTENTS_STORE].intents[0].operationId,row.operationId);
  assert.equal(h.values[MARKET_OPERATIONS_STORE],undefined);assert.equal(h.values[SIDEBAR_TOOL_STORE],undefined);
});
test('GET_INSTALL_STATUS separates existing installation from the original successful transaction',async()=>{
  const h=handoff(),row=seedHistoricalApp(h);row.consumedAt=row.createdAt;
  h.values[SIDEBAR_TOOL_STORE]=[tool];
  const sha256=digest(serializeSidebarToolPackage(tool));
  h.values[MARKET_PROVENANCE_STORE]={[tool.id]:{marketId:subject.marketId,version:tool.version,sha256}};
  const status=await h.status();assert.equal(status.installation,'unknown');assert.equal(status.currentInstallation,'installed');
  h.values[MARKET_OPERATIONS_STORE]={[row.operationId]:{state:'succeeded',toolId:tool.id,marketId:subject.marketId,version:tool.version,sha256}};
  assert.equal((await h.status()).installation,'installed');
  h.values[SIDEBAR_TOOL_STORE]=[{...tool,js:'console.log("altered");'}];
  const changed=await h.status();assert.equal(changed.installation,'unknown');assert.equal(changed.currentInstallation,'not-installed');
  await assert.rejects(h.host.handle({...h.request,action:'GET_INSTALL_STATUS',subject:{...subject,version:'2.0.0'}},h.sender),{code:'E_INTENT_CONFLICT'});
  assert.equal(h.popups.length,0);
});
for(const action of ['GET_APP_STATUS','OPEN_INSTALLED_APP']){
  test(action+' accepts only protocol action subject',async()=>{
    const h=handoff();
    for(const extra of [{intentId:randomUUID()},{approved:true},{token:randomUUID()},{url:'https://untrusted.invalid/'}])
      await assert.rejects(h.host.handle({protocol,action,subject,...extra},h.sender),{code:'E_INTENT_FIELDS'});
    assert.deepEqual(h.writes,[]);assert.deepEqual(h.popups,[]);
  });
  test(action+' rejects malicious sources before any state or navigation mutation',async()=>{
    const h=handoff();
    for(const sender of [{...h.sender,origin:'https://untrusted.invalid'},
      {...h.sender,url:'http://127.0.0.1:43133/'},{...h.sender,id:extensionId},{...h.sender,frameId:1},
      {...h.sender,nativeApplication:'foreign'},{...h.sender,documentId:randomUUID()}])
      await assert.rejects(h.host.handle({protocol,action,subject},sender));
    assert.deepEqual(h.writes,[]);assert.equal(h.tabs.size,1);
  });
}
for(const mutation of ['absent','source','sha','bytes','disabled'])
  test('OPEN_INSTALLED_APP refuses '+mutation+' installation',async()=>{
    const h=handoff();h.values[SIDEBAR_TOOL_STORE]=[tool];
    h.values[MARKET_PROVENANCE_STORE]={[tool.id]:{marketId:subject.marketId,version:tool.version,sha256:digest(serializeSidebarToolPackage(tool))}};
    if(mutation==='absent')delete h.values[SIDEBAR_TOOL_STORE];
    if(mutation==='source')h.values[MARKET_PROVENANCE_STORE][tool.id].marketId='opendesk/foreign';
    if(mutation==='sha')h.values[MARKET_PROVENANCE_STORE][tool.id].sha256='0'.repeat(64);
    if(mutation==='bytes')h.values[SIDEBAR_TOOL_STORE][0].js='void 2;';
    if(mutation==='disabled')h.values[SIDEBAR_TOOL_ENABLE_STORE]={[tool.id]:false};
    await assert.rejects(h.host.handle({protocol,action:'OPEN_INSTALLED_APP',subject},h.sender),{code:mutation==='disabled'?'E_TOOL_DISABLED':'E_NOT_INSTALLED'});
    assert.equal(h.tabs.size,1);assert.deepEqual(h.popups,[]);assert.equal(h.values[MARKET_OPERATIONS_STORE],undefined);
  });
test('GET_APP_STATUS reports update available and explicit OPEN uses only the installed tool locator',async()=>{
  const h=handoff();h.values[SIDEBAR_TOOL_STORE]=[tool];
  h.values[MARKET_PROVENANCE_STORE]={[tool.id]:{marketId:subject.marketId,version:tool.version,sha256:digest(serializeSidebarToolPackage(tool))}};
  const newer={...subject,version:'2.0.0'},status=await h.host.handle({protocol,action:'GET_APP_STATUS',subject:newer},h.sender);
  assert.equal(status.currentInstallation,'update-available');assert.equal(status.installedVersion,tool.version);
  assert.equal((await h.host.handle({protocol,action:'OPEN_INSTALLED_APP',subject:newer},h.sender)).status,'APP_OPENED');
  assert.match(h.tabs.get(3).url,/toolId=market-independent/);assert.deepEqual(h.popups,[]);
  assert.equal(h.values[MARKET_OPERATIONS_STORE],undefined);assert.equal(h.values[MARKET_INTENTS_STORE].intents.length,0);
});
test('closing an unsubmitted confirmation reports cancellation without changing installed tools',async()=>{
  const h=handoff();seedHistoricalApp(h);h.tabs.delete(2);
  assert.equal((await h.status()).installation,'cancelled');assert.equal(h.values[SIDEBAR_TOOL_STORE],undefined);
  assert.equal(h.values[MARKET_OPERATIONS_STORE],undefined);assert.deepEqual(h.popups,[]);
});

for(const action of ['GET_APP_STATUS','OPEN_INSTALLED_APP'])
  test(action+' shares durable request limits with PROBE and rejects before opening',async()=>{
    const h=handoff();h.values[MARKET_INTENTS_STORE]={schema:MARKET_INTENTS_STORE,intents:[],
      requests:Array.from({length:59},()=>({origin,at:Date.now()}))};
    await h.host.handle({protocol,action:'PROBE'},h.sender);
    const before=structuredClone(h.values);
    await assert.rejects(h.host.handle({protocol,action,subject},h.sender),{code:'E_RATE_LIMIT'});
    assert.deepEqual(h.values,before);assert.equal(h.tabs.size,1);
  });
for(const extra of [{approved:true},{token:randomUUID()},{url:'https://untrusted.invalid/'}])
  test('external review OPEN rejects supplied '+Object.keys(extra)[0]+' without mutation',async()=>{
    const h=handoff();await assert.rejects(h.host.handle({...h.request,...extra},h.sender),{code:'E_INTENT_FIELDS'});
    assert.deepEqual(h.writes,[]);assert.deepEqual(h.popups,[]);assert.equal(h.tabs.size,1);
  });

test('explicit external OPEN migrates an untouched historical webpage review into the trusted popup without consuming',async()=>{
  const h=handoff(),row=seedHistoricalApp(h);row.tabId=1;h.tabs.delete(2);
  row.pageReview={documentId:h.sender.documentId,tabId:1,token:randomUUID(),sha256:digest(serializeSidebarToolPackage(tool)),baselineHash:null,cancelledAt:null};
  const original=structuredClone(row);
  await h.host.handle(h.request,h.sender);
  const saved=h.values[MARKET_INTENTS_STORE].intents[0];
  assert.equal(h.popups[0].url,h.api.runtime.getURL('ui/market-install.html')+'?intent='+row.reviewId);
  assert.deepEqual(saved.pageReview,original.pageReview);assert.equal(saved.operationId,original.operationId);assert.equal(saved.consumedAt,null);
  assert.equal(h.values[MARKET_OPERATIONS_STORE],undefined);assert.equal(h.values[SIDEBAR_TOOL_STORE],undefined);
});
