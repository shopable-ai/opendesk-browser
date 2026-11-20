import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {SIGNED_UPDATE_INDEX_SCHEMA,UPDATE_INDEX_SCHEMA,UPDATE_INDEX_PATH,MAX_UPDATE_INDEX_BYTES,
  verifySignedUpdateIndex,parseUpdateIndexJSON,updateIndexSigningBytes,updateIndexBase64,updateReleaseEligibility}
  from '../../src/marketplace/update-index.js';
import {createMarketUpdateDiscovery,MARKET_UPDATE_INDEX_STORE} from '../../src/marketplace/update-discovery.js';
import {signMarketUpdateIndex} from '../../scripts/sign-market-update-index.mjs';
import {loadMarketTool} from '../../src/marketplace/distribution.js';
import {loadOfficialTool} from '../../src/sidebar-tools/official-catalog.js';
import {installUpdateNoticeService} from '../../src/platform/chrome/update-notice-service.js';
import {UPDATE_NOTICE_PROTOCOL,UPDATE_NOTICE_LOCK} from '../../src/platform/chrome/update-notice-state.js';
import {installReviewedSidebarTool,MARKET_PROVENANCE_STORE,MARKET_OPERATIONS_STORE}
  from '../../src/ui/sidebar-tools/installation.js';
import {SIDEBAR_TOOL_STORE,serializeSidebarToolPackage,sidebarToolPackageHash,sidebarToolStorageKey}
  from '../../src/ui/sidebar-tools/package.js';

// Ephemeral test signer; no production key or installed profile is changed.
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const publicKeys={fixture:Buffer.from(publicKey.export({format:'jwk'}).x,'base64url').toString('base64')};
const source={sourceId:'opendesk-official',channel:'stable',origin:'http://127.0.0.1:43132'};
const instant=Date.parse('2026-11-20T00:00:00Z');
const tool=version=>({format:'opendesk.sidebar-tool.v1',id:'update-fixture',version,
  title:'Update fixture',description:'Original distribution and Installer',capabilities:['storage.local'],
  html:'<main>Fixture</main>',css:'',js:'void 0;'});
async function release(version='1.0.1'){
  const pkg=tool(version),bytes=Buffer.from(serializeSidebarToolPackage(pkg));
  return {toolId:pkg.id,marketId:'opendesk/'+pkg.id,kind:'sidebar-tool',version,state:'published',
    packageTitle:pkg.title,description:pkg.description,capabilities:pkg.capabilities,
    requirements:{format:pkg.format,browserSdk:null,uiRuntime:null},delivery:'package',
    publishedAt:new Date(instant-1000).toISOString(),changelog:'New version',
    descriptor:{schema:'opendesk.market.release.v1',marketId:'opendesk/'+pkg.id,version,
      bytes:bytes.length,sha256:await sidebarToolPackageHash(pkg),
      packagePath:'/releases/opendesk/'+pkg.id+'/'+version+'/package.opendesk-tool.json'}};
}
async function payload(sequence=1,overrides={}){
  return {schema:UPDATE_INDEX_SCHEMA,sourceId:source.sourceId,channel:source.channel,sequence,
    issuedAt:new Date(instant).toISOString(),expiresAt:new Date(instant+3600000).toISOString(),
    complete:true,releases:[await release()],...overrides};
}
function signedBytes(value){
  const bytes=Buffer.from(typeof value==='string'?value:JSON.stringify(value));
  const envelope={schema:SIGNED_UPDATE_INDEX_SCHEMA,algorithm:'Ed25519',keyId:'fixture',
    payload:updateIndexBase64(bytes),signature:''};
  envelope.signature=sign(null,updateIndexSigningBytes(envelope),privateKey).toString('base64');
  return Buffer.from(JSON.stringify(envelope));
}
const verify=(bytes,options={})=>verifySignedUpdateIndex(bytes,{publicKeys,now:instant,...options});
function locks(){
  const tails=new Map();return {request(name,options,callback){
    const fn=typeof options==='function'?options:callback;
    const work=(tails.get(name)||Promise.resolve()).catch(()=>{}).then(fn);tails.set(name,work);return work;
  }};
}
function storage(values={}){
  return {local:{get:async keys=>structuredClone(keys===null?values:Object.fromEntries(
    (typeof keys==='string'?[keys]:keys).map(key=>[key,values[key]]))),
    set:async next=>{Object.assign(values,structuredClone(next));}}};
}
async function harness(fetcher,options={}){
  const values={},api={storage:storage(values)},lockManager=locks();
  const config={...source,endpoint:source.origin+UPDATE_INDEX_PATH,publicKeys};
  const discovery=createMarketUpdateDiscovery({api,lockManager,now:()=>instant,
    loadConfig:async()=>config,fetcher,...options});
  return {values,api,lockManager,config,discovery};
}
const response=bytes=>new Response(bytes,{headers:{'Content-Type':'application/json',ETag:'"fixture"'}});

test('offline signer preserves the exact raw payload bytes and interoperates with WebCrypto',async()=>{
  const bytes=Buffer.from(JSON.stringify(await payload(),null,3)+'\n');
  const result=await signMarketUpdateIndex({payloadBytes:bytes,privateKey,keyId:'fixture',now:instant});
  const checked=await verify(result.bytes);
  assert.deepEqual(Buffer.from(checked.envelope.payload,'base64'),bytes);
  assert.equal(checked.payload.sequence,1);
});
test('signature domain, configured key, payload byte changes and noncanonical base64 are rejected',async()=>{
  const bytes=signedBytes(await payload()),base=JSON.parse(bytes);
  for(const mutate of [e=>{e.signature='A'.repeat(86)+'==';},e=>{e.keyId='other';},
    e=>{e.schema='opendesk.market.other.v1';},e=>{e.payload=Buffer.from(Buffer.from(e.payload,'base64').toString()+' ').toString('base64');},
    e=>{e.payload+='\n';}]){
    const copy=structuredClone(base);mutate(copy);await assert.rejects(verify(JSON.stringify(copy)));
  }
});
test('duplicate escaped keys and invalid UTF-8 fail before producing a candidate',async()=>{
  assert.throws(()=>parseUpdateIndexJSON('{"key":1,"\\u006bey":2}'));
  assert.throws(()=>parseUpdateIndexJSON(Uint8Array.from([0xc0,0x80])));
  const raw=JSON.stringify(await payload()).replace('"sequence":1','"sequence":1,"sequence":2');
  await assert.rejects(verify(signedBytes(raw)),{code:'E_UPDATE_SCHEMA'});
});
test('channel/source/complete, descriptor extra fields, duplicate releases and timestamp bounds fail closed',async()=>{
  const base=await payload();
  for(const mutate of [p=>{p.channel='beta';},p=>{p.sourceId='other';},p=>{p.complete=false;},
    p=>{p.releases[0].descriptor.extra=true;},p=>{p.releases.push(p.releases[0]);},
    p=>{p.expiresAt=p.issuedAt;},p=>{p.expiresAt=new Date(instant+86400001).toISOString();},
    p=>{p.releases[0].publishedAt=new Date(instant+1).toISOString();}]){
    const copy=structuredClone(base);mutate(copy);await assert.rejects(verify(signedBytes(copy)));
  }
  await assert.rejects(verify(signedBytes(base),{now:instant+3600000}),{code:'E_UPDATE_EXPIRED'});
  await assert.rejects(verify(signedBytes(base),{now:instant-300001}),{code:'E_UPDATE_CLOCK'});
});
test('highest sequence persists and low sequence/same sequence changed bytes never overwrite it',async()=>{
  let bytes=signedBytes(await payload(2));const h=await harness(async()=>response(bytes));
  await h.discovery.check({fresh:true});const saved=structuredClone(h.values);
  for(const p of [await payload(1),await payload(2,{expiresAt:new Date(instant+3500000).toISOString()})]){
    bytes=signedBytes(p);await assert.rejects(h.discovery.check({fresh:true}),{code:'E_UPDATE_REPLAY'});
    assert.deepEqual(h.values,saved);
  }
});
test('late response from a second Worker instance cannot overwrite a newer accepted index',async()=>{
  let deliver;const late=new Promise(resolve=>{deliver=resolve;});
  const h=await harness(()=>late),older=h.discovery.check({fresh:true});
  await new Promise(setImmediate);
  const newer=createMarketUpdateDiscovery({api:h.api,lockManager:h.lockManager,now:()=>instant,
    loadConfig:async()=>h.config,fetcher:async()=>response(signedBytes(await payload(4)))});
  await newer.check({fresh:true});deliver(response(signedBytes(await payload(3))));
  await assert.rejects(older,{code:'E_UPDATE_REPLAY'});
  assert.equal(h.values[MARKET_UPDATE_INDEX_STORE].sequence,4);
});
test('accepted release history survives omitted snapshots and rejects same-version changed digest',async()=>{
  let current=await payload();const h=await harness(async()=>response(signedBytes(current)));
  await h.discovery.check({fresh:true});current=await payload(2,{releases:[]});await h.discovery.check({fresh:true});
  current=await payload(3);current.releases[0].descriptor.sha256='b'.repeat(64);
  await assert.rejects(h.discovery.check({fresh:true}),{code:'E_UPDATE_RELEASE_CONFLICT'});
  assert.equal(h.values[MARKET_UPDATE_INDEX_STORE].sequence,2);
});
test('an exact trusted installed provenance conflicts with a newly advertised same-version hash',async()=>{
  const p=await payload(),h=await harness(async()=>response(signedBytes(p)));
  h.values[MARKET_PROVENANCE_STORE]={'update-fixture':{...source,kind:'sidebar-tool',
    marketId:'opendesk/update-fixture',version:'1.0.1',sha256:'a'.repeat(64)}};
  await assert.rejects(h.discovery.check({fresh:true}),{code:'E_UPDATE_RELEASE_CONFLICT'});
});
test('304 reuses only validated unexpired bytes and never extends signature time',async()=>{
  let currentTime=instant,count=0;const p=await payload();
  const h=await harness(async()=>++count===1?response(signedBytes(p)):new Response(null,{status:304,headers:{ETag:'"fixture"'}}),
    {now:()=>currentTime});
  const first=await h.discovery.check({fresh:true}),second=await h.discovery.check({fresh:true});
  assert.equal(second.expiresAt,first.expiresAt);currentTime+=3600000;
  await assert.rejects(h.discovery.check({fresh:true}),{code:'E_UPDATE_CACHE'});
});
test('a 304 expiring while waiting for the shared acceptance lock is refused',async()=>{
  let time=instant,requests=0,expire=false;
  const manager={async request(name,options,fn){if(expire)time=instant+3600000;return fn();}};
  const h=await harness(async()=>++requests===1?response(signedBytes(await payload())):new Response(null,{status:304}),
    {now:()=>time,lockManager:manager});
  await h.discovery.check({fresh:true});expire=true;
  await assert.rejects(h.discovery.check({fresh:true}),{code:'E_UPDATE_EXPIRED'});
});
test('manual fresh request waits for a cache read then still makes a bounded network request',async()=>{
  let count=0;const h=await harness(async()=>{count++;return response(signedBytes(await payload()));});
  await h.discovery.check({fresh:true});
  let releaseLock;const blocker=new Promise(resolve=>{releaseLock=resolve;});
  const hold=h.lockManager.request(UPDATE_NOTICE_LOCK,async()=>blocker);
  // Use a passive read and a fresh call in the same turn, regardless of lock name.
  const passive=h.discovery.check(),fresh=h.discovery.check({fresh:true});releaseLock();await hold;
  await Promise.all([passive,fresh]);assert.equal(count,2);
});
test('readback ambiguity fences acceptance until explicit read-only reconciliation',async()=>{
  const h=await harness(async()=>response(signedBytes(await payload())));
  const get=h.api.storage.local.get;let failed=false;
  h.api.storage.local.get=async keys=>{if(h.values[MARKET_UPDATE_INDEX_STORE]&&!failed){failed=true;throw new Error('lost readback');}return get(keys);};
  await assert.rejects(h.discovery.check({fresh:true}),{code:'E_OUTCOME_UNKNOWN'});
  const checked=await h.discovery.check({fresh:true});assert.equal(checked.sequence,1);
});
test('transport rejects HTML, redirect, 429, 503 and over-budget bodies',async()=>{
  for(const [reply,code] of [
    [()=>new Response('<html>fallback</html>'),'E_UPDATE_CONTENT_TYPE'],
    [()=>({status:200,url:'https://unapproved.invalid/index',redirected:true}),'E_UPDATE_SOURCE'],
    [()=>new Response('',{status:429}),'E_UPDATE_RATE_LIMIT'],
    [()=>new Response('',{status:503}),'E_UPDATE_UNAVAILABLE'],
    [()=>new Response('x'.repeat(MAX_UPDATE_INDEX_BYTES+1),{headers:{'Content-Type':'application/json'}}),'E_UPDATE_LIMIT']]){
    const h=await harness(async()=>reply());await assert.rejects(h.discovery.check({fresh:true}),{code});
    assert.equal(h.values[MARKET_UPDATE_INDEX_STORE],undefined);
  }
});
test('fetch which ignores AbortSignal still has a hard deadline and cannot commit later',async()=>{
  let resolve;const network=new Promise(done=>{resolve=done;});const h=await harness(()=>network,{timeoutMs:10});
  await assert.rejects(h.discovery.check({fresh:true}),{code:'E_UPDATE_TIMEOUT'});
  resolve(response(signedBytes(await payload())));await new Promise(setImmediate);
  assert.equal(h.values[MARKET_UPDATE_INDEX_STORE],undefined);
});
test('unconfigured trust is reported without treating an empty catalog as verified',async()=>{
  let calls=0;const h=await harness(async()=>{calls++;},{loadConfig:async()=>({...source,endpoint:source.origin+UPDATE_INDEX_PATH,publicKeys:{}})});
  await assert.rejects(h.discovery.check({fresh:true}),{code:'E_UPDATE_NOT_CONFIGURED'});assert.equal(calls,0);
});
test('known Host-only, withdrawn and unsupported runtime releases stay non-installable',async()=>{
  const row=await release();assert.equal(updateReleaseEligibility(row),'package');
  assert.equal(updateReleaseEligibility({...row,delivery:'browser-host'}),'browser_update_required');
  assert.equal(updateReleaseEligibility({...row,state:'withdrawn'}),'withdrawn');
  assert.equal(updateReleaseEligibility({...row,capabilities:['not.available']}),'compatibility_unknown');
});
test('actual HTTP through Worker, official adapter and original Installer preserves data/source/SHA',async t=>{
  const current=Date.now(),before=tool('1.0.0'),next=tool('1.0.1'),row=await release();
  row.publishedAt=new Date(current-1000).toISOString();
  const p=await payload(1,{issuedAt:new Date(current).toISOString(),expiresAt:new Date(current+60000).toISOString(),releases:[row]});
  const body=signedBytes(p),packageBytes=Buffer.from(serializeSidebarToolPackage(next));
  const server=createServer((req,res)=>{
    const content=req.url===UPDATE_INDEX_PATH?body:req.url===row.descriptor.packagePath?packageBytes:
      req.url==='/releases/'+row.marketId+'/'+row.version+'/descriptor.json'?Buffer.from(JSON.stringify(row.descriptor)):null;
    res.writeHead(content?200:404,{'Content-Type':'application/json'});res.end(content||'{}');
  });server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin='http://127.0.0.1:'+server.address().port,fullSource={...source,origin,kind:'sidebar-tool'};
  const values={[SIDEBAR_TOOL_STORE]:[before],[MARKET_PROVENANCE_STORE]:{[before.id]:{marketId:row.marketId,
    version:before.version,sha256:await sidebarToolPackageHash(before),...fullSource}},
    [sidebarToolStorageKey(before.id)]:{sentinel:'keep original data'}};
  const noop={addListener(){},removeListener(){}};let listener;
  const api={storage:{...storage(values),onChanged:noop},runtime:{id:'a'.repeat(32),
    onMessage:{addListener:fn=>{listener=fn;}},onInstalled:noop,
    getURL:path=>'chrome-extension://'+'a'.repeat(32)+'/'+path.replace(/^\//,''),getManifest:()=>({version:'1.0.0'})},
    tabs:{onActivated:noop,onRemoved:noop,onUpdated:noop,query:async()=>[]},permissions:{contains:async()=>true},
    alarms:{onAlarm:noop,create:async()=>{},clear:async()=>true}};
  const lockManager=locks(),cfg={...source,origin,endpoint:origin+UPDATE_INDEX_PATH,publicKeys};
  const fetcher=async(url,options)=>String(url).startsWith('chrome-extension:')?
    new Response(JSON.stringify({schema:'opendesk.market.channel.v1',protocol:'opendesk.market.intent.v1',
      mode:'development',enabled:true,origin,extensionId:api.runtime.id})):fetch(url,options);
  const discovery=createMarketUpdateDiscovery({api,lockManager,fetcher,loadConfig:async()=>cfg});
  const service=installUpdateNoticeService({api,lockManager,marketDiscovery:discovery});
  const sender={id:api.runtime.id,url:api.runtime.getURL('sidepanel.html'),frameId:0};
  api.runtime.sendMessage=message=>new Promise(resolve=>{
    assert.equal(listener(message,sender,resolve),true);
  });
  await service.reconcile({fresh:true});
  const catalog=await discovery.readCurrent(),entry=catalog.apps[0];
  const downloaded=await loadOfficialTool(entry,{api,fetcher});
  const result=await installReviewedSidebarTool({api,lockManager,candidate:downloaded.tool,baseline:before,
    reviewApproved:true,market:{marketId:entry.id,sha256:entry.sha256,operationId:crypto.randomUUID(),...fullSource},fetcher});
  assert.equal(result.state,'installed');assert.equal(values[SIDEBAR_TOOL_STORE][0].version,'1.0.1');
  assert.equal(values[MARKET_PROVENANCE_STORE][before.id].sha256,row.descriptor.sha256);
  assert.equal(values[MARKET_PROVENANCE_STORE][before.id].origin,origin);
  assert.deepEqual(values[sidebarToolStorageKey(before.id)],{sentinel:'keep original data'});
  assert.equal(values[MARKET_OPERATIONS_STORE][result.operationId].state,'succeeded');
  await service.reconcile({fresh:true});
  const notices=(await api.runtime.sendMessage({protocol:UPDATE_NOTICE_PROTOCOL,kind:'list'})).data;
  assert.equal(notices.verified,true);
  assert.ok(notices.records.some(record=>record.id===before.id&&record.status==='applied'));
});
