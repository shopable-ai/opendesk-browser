import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {signMarketUpdateIndex} from '../../scripts/sign-market-update-index.mjs';
import {createMarketUpdateDiscovery,MARKET_UPDATE_INDEX_STORE} from '../../src/marketplace/update-discovery.js';
import {UPDATE_INDEX_PATH,UPDATE_INDEX_SCHEMA} from '../../src/marketplace/update-index.js';
import {UPDATE_NOTICE_PROTOCOL} from '../../src/platform/chrome/update-notice-state.js';
import {installUpdateNoticeService} from '../../src/platform/chrome/update-notice-service.js';
import {installReviewedSidebarTool,MARKET_PROVENANCE_STORE,MARKET_OPERATIONS_STORE,
  TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash,serializeSidebarToolPackage,
  sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';

// Independent adversarial regression. Signatures, discovery, the original
// Worker RPC handler and Installer are real modules. Chrome storage and locks
// are explicit in-memory adapters; this is not native Chrome acceptance.
const event=()=>{
  const listeners=new Set();
  return {addListener(fn){listeners.add(fn);},removeListener(fn){listeners.delete(fn);},
    emit(...args){for(const listener of listeners)listener(...args);}};
};
const makeTool=version=>({format:'opendesk.sidebar-tool.v1',id:'audit-fence',version,
  title:'Admission audit',description:'Original installation boundary fixture',
  capabilities:['storage.local'],html:'<main>Fixture</main>',css:'',js:'void 0;'});

test('a higher withdrawn snapshot accepted before admission cannot start the Installer transaction',async()=>{
  const before=makeTool('1.0.0'),candidate=makeTool('1.0.1');
  const sha256=await sidebarToolPackageHash(candidate),oldHash=await sidebarToolPackageHash(before);
  const marketId='opendesk/'+candidate.id,extensionId='a'.repeat(32),instant=Date.now();
  const source={sourceId:'opendesk-official',kind:'sidebar-tool',channel:'stable',
    origin:'https://market.example.org'};
  const descriptor={schema:'opendesk.market.release.v1',marketId,version:candidate.version,
    bytes:new TextEncoder().encode(serializeSidebarToolPackage(candidate)).length,sha256,
    packagePath:'/releases/'+marketId+'/'+candidate.version+'/package.opendesk-tool.json'};
  const release={toolId:candidate.id,marketId,kind:'sidebar-tool',version:candidate.version,
    state:'published',packageTitle:candidate.title,description:candidate.description,
    capabilities:candidate.capabilities,
    requirements:{format:candidate.format,browserSdk:null,uiRuntime:null},delivery:'package',
    publishedAt:new Date(instant-1000).toISOString(),changelog:'Fixture release',descriptor};
  const payload=sequence=>({schema:UPDATE_INDEX_SCHEMA,sourceId:source.sourceId,channel:'stable',
    sequence,issuedAt:new Date(instant).toISOString(),expiresAt:new Date(instant+600000).toISOString(),
    complete:true,releases:[{...release,state:sequence===1?'published':'withdrawn'}]});
  const {privateKey}=generateKeyPairSync('ed25519');
  const first=await signMarketUpdateIndex({payloadBytes:Buffer.from(JSON.stringify(payload(1))),
    privateKey,keyId:'fixture',now:instant});
  const withdrawn=await signMarketUpdateIndex({payloadBytes:Buffer.from(JSON.stringify(payload(2))),
    privateKey,keyId:'fixture',now:instant});
  const oldSource={marketId,version:before.version,sha256:oldHash,...source};
  const dataKey=sidebarToolStorageKey(before.id);
  const values={[SIDEBAR_TOOL_STORE]:[structuredClone(before)],
    [MARKET_PROVENANCE_STORE]:{[before.id]:oldSource},[MARKET_OPERATIONS_STORE]:{},
    [TOOL_REVOCATION_EPOCHS_STORE]:{[before.id]:'old-epoch'},[dataKey]:{sentinel:'retained data'}};
  let current=first.bytes,discovery,freshReplies=0,secondReplyReturned=false,withdrawalAccepted=false;
  const writes=[],tails=new Map(),onMessage=event();
  const lockManager={request(name,options,callback){
    const run=typeof options==='function'?options:callback;
    const work=(tails.get(name)||Promise.resolve()).catch(()=>{}).then(run);
    tails.set(name,work);return work;
  }};
  const api={runtime:{id:extensionId,onMessage,onStartup:event(),
    getURL:path=>'chrome-extension://'+extensionId+'/'+String(path).replace(/^\/+/,''),
    getManifest:()=>({version:'1.0.0',name:'Admission audit'}),
    async sendMessage(message){
      assert.equal(message.protocol,UPDATE_NOTICE_PROTOCOL);
      const response=await new Promise(resolve=>onMessage.emit(message,
        {id:extensionId,url:'chrome-extension://'+extensionId+'/sidepanel.html',frameId:0},resolve));
      if(message.kind==='market-index'&&message.fresh===true&&response?.ok){
        freshReplies++;
        if(freshReplies===2)secondReplyReturned=true;
      }
      return response;
    }},storage:{onChanged:event(),local:{
      async get(keys){
        // A second trusted owner accepts the newer snapshot AFTER both actual
        // fresh replies but BEFORE the first original Installer journal write.
        if(secondReplyReturned&&!withdrawalAccepted&&keys===MARKET_PROVENANCE_STORE){
          withdrawalAccepted=true;current=withdrawn.bytes;
          await discovery.check({fresh:true});
          assert.equal(values[MARKET_UPDATE_INDEX_STORE].sequence,2);
          assert.deepEqual(values[MARKET_OPERATIONS_STORE],{});
        }
        return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>
          [key,structuredClone(values[key])]));
      },
      async set(next){writes.push(structuredClone(next));Object.assign(values,structuredClone(next));}
    }},tabs:{onActivated:event(),onUpdated:event(),async query(){return[];}},
    permissions:{onRemoved:event()}};
  discovery=createMarketUpdateDiscovery({api,lockManager,
    loadConfig:async()=>({...source,endpoint:source.origin+UPDATE_INDEX_PATH,
      publicKeys:{fixture:first.publicKey}}),
    fetcher:async()=>new Response(current,{headers:{'Content-Type':'application/json'}})});
  const service=installUpdateNoticeService({api,marketDiscovery:discovery,lockManager});
  await service.reconcile();
  const baselineWrites=writes.length;
  await assert.rejects(installReviewedSidebarTool({api,lockManager,candidate,baseline:before,
    baselineInstallEpoch:'old-epoch',reviewApproved:true,
    market:{marketId,sha256,operationId:randomUUID(),...source}}),
  {code:'E_UPDATE_INDEX_CHANGED'});
  assert.equal(withdrawalAccepted,true,'the higher snapshot must really be accepted');
  assert.equal(freshReplies,2,'both original pre-lock and post-lock fresh verifications ran');
  assert.equal((await discovery.readCurrent()).apps[0].state,'withdrawn');
  assert.deepEqual(values[SIDEBAR_TOOL_STORE],[before]);
  assert.deepEqual(values[MARKET_PROVENANCE_STORE],{[before.id]:oldSource});
  assert.deepEqual(values[MARKET_OPERATIONS_STORE],{});
  assert.deepEqual(values[dataKey],{sentinel:'retained data'});
  assert.equal(writes.slice(baselineWrites).some(next=>Object.hasOwn(next,MARKET_OPERATIONS_STORE)),false,
    'a stale candidate must not start a new transaction before admission');
});
