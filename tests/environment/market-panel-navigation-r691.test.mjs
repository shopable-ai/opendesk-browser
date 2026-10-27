import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createMarketPanelNavigation,validMarketPanelNavigation,queueMarketPanelNavigation,
  waitMarketPanelNavigation,createMarketPanelNavigationReceiver,registerTrustedMarketNavigation,
  verifyMarketPanelNavigationSource,
  marketPanelNavigationKey,MARKET_PANEL_NAV_PROTOCOL,MARKET_PANEL_NAV_TTL} from '../../src/marketplace/panel-navigation.js';

const SHA='a'.repeat(64),EXT='a'.repeat(32);
const sample=(overrides={})=>createMarketPanelNavigation({windowId:7,tabId:12,
  source:'built-in',action:'detail',toolId:'example-app',
  sourceDocumentId:'1'.repeat(32),sourceUrl:'chrome-extension://'+EXT+'/ui/marketplace.html',
  marketId:'opendesk/example-app',version:'1.0.0',sha256:SHA,
  requestId:randomUUID(),issuedAt:Date.now(),...overrides});
function fixture(){
  const values={},listeners=new Set(),events=[];
  const api={
    runtime:{id:EXT,getURL:path=>'chrome-extension://'+EXT+'/'+path,
      onMessage:{addListener(fn){api.listener=fn;},removeListener(){}}},
    storage:{
      onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},
      session:{
        async get(key){return {[key]:structuredClone(values[key])};},
        async set(payload){
          for(const [key,value] of Object.entries(payload)){
            const oldValue=values[key];values[key]=structuredClone(value);
            const changes={[key]:{oldValue,newValue:structuredClone(value)}};
            for(const fn of [...listeners])fn(changes,'session');
          }
        }
      }
    },
    sidePanel:{open(options){events.push('panel:'+options.windowId);return Promise.resolve();}},
    tabs:{async get(tabId){events.push('tab:'+tabId);return {id:tabId,windowId:7,
      url:api.runtime.getURL('ui/marketplace.html'),incognito:false};}},
    webNavigation:{async getFrame(){events.push('frame');return {documentId:'1'.repeat(32),
      parentFrameId:-1,documentLifecycle:'active',url:api.runtime.getURL('ui/marketplace.html')};}}
  };
  return {api,values,events,listeners};
}
test('R6.9.1 panel locator validates source, fixed version and sha256',()=>{
  const row=sample();
  assert.equal(validMarketPanelNavigation(row,{windowId:7}),true);
  assert.equal(validMarketPanelNavigation(row,{windowId:8}),false);
  assert.equal(validMarketPanelNavigation({...row,sha256:'0'}, {windowId:7}),false);
  assert.equal(validMarketPanelNavigation({...row,sourceDocumentId:'2'.repeat(12)},{windowId:7}),false);
  assert.equal(validMarketPanelNavigation({...row,issuedAt:Date.now()-MARKET_PANEL_NAV_TTL-1},{windowId:7}),false);
  assert.throws(()=>sample({source:'external',action:'open-local',marketId:null,sha256:null}),{code:'E_NAV_FIELDS'});
  assert.throws(()=>sample({marketId:'opendesk/other-app'}),{code:'E_NAV_FIELDS'});
});
test('native panel acknowledges details only after receiver accepted existing Host route',async()=>{
  const h=fixture(),calls=[];
  const receiver=createMarketPanelNavigationReceiver({api:h.api,
    onNavigate:async row=>{calls.push(row);return {status:'DETAIL_OPENED',message:'正式详情已打开'};}});
  receiver.start(7);
  const request=await queueMarketPanelNavigation(h.api,sample());
  const final=await waitMarketPanelNavigation(h.api,request,{timeoutMs:80});
  assert.equal(final.status,'DETAIL_OPENED');
  assert.equal(calls.length,1);
  assert.equal(h.values[marketPanelNavigationKey(7)].status,'DETAIL_OPENED');
  receiver.dispose();assert.equal(h.listeners.size,0);
});
test('blocked editor keeps a recoverable request; explicit retry can succeed',async()=>{
  const h=fixture();let guarded=true,calls=0,reported=[];
  const receiver=createMarketPanelNavigationReceiver({api:h.api,
    onNavigate:async()=>{calls++;return guarded?{status:'NAVIGATION_BLOCKED',message:'未保存草稿'}:{status:'APP_OPENED'};},
    onBlocked:r=>reported.push(r)});
  receiver.start(7);
  const first=await queueMarketPanelNavigation(h.api,sample({action:'open'}));
  assert.equal((await waitMarketPanelNavigation(h.api,first,{timeoutMs:80})).status,'NAVIGATION_BLOCKED');
  assert.equal(h.values[marketPanelNavigationKey(7)].message,'未保存草稿');
  assert.equal(reported.length,1);
  await assert.rejects(queueMarketPanelNavigation(h.api,sample({action:'review'})),{code:'E_NAV_BUSY'});
  assert.equal(h.values[marketPanelNavigationKey(7)].requestId,first.requestId);
  guarded=false;
  const second=await queueMarketPanelNavigation(h.api,sample({action:'open'}));
  assert.notEqual(second.requestId,first.requestId);
  assert.equal((await waitMarketPanelNavigation(h.api,second,{timeoutMs:80})).status,'APP_OPENED');
  assert.equal(calls,2);
  receiver.dispose();
});
test('pinned browser document and source URL are rechecked before a Side Panel Host route',async()=>{
  const h=fixture(),row=sample();
  assert.equal(await verifyMarketPanelNavigationSource(h.api,row),true);
  h.api.webNavigation.getFrame=async()=>({documentId:'2'.repeat(32),
    parentFrameId:-1,documentLifecycle:'active',url:row.sourceUrl});
  assert.equal(await verifyMarketPanelNavigationSource(h.api,row),false);
  h.api.tabs.get=async()=>({id:12,windowId:8,url:row.sourceUrl,incognito:false});
  assert.equal(await verifyMarketPanelNavigationSource(h.api,row),false);
});

test('identical outstanding click deduplicates instead of replacing pending intent',async()=>{
  const h=fixture(),first=sample({action:'open'});
  const a=await queueMarketPanelNavigation(h.api,first);
  const b=await queueMarketPanelNavigation(h.api,sample({action:'open'}));
  assert.equal(a.requestId,b.requestId);
  await assert.rejects(queueMarketPanelNavigation(h.api,sample({action:'detail'})),{code:'E_NAV_BUSY'});
  assert.equal(h.values[marketPanelNavigationKey(7)].requestId,first.requestId);
});
test('receiver never consumes another window or expired/stale locator',async()=>{
  const h=fixture();let called=0;
  const receiver=createMarketPanelNavigationReceiver({api:h.api,onNavigate:async()=>{called++;return {status:'APP_OPENED'};}});
  receiver.start(8);
  await queueMarketPanelNavigation(h.api,sample());
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(called,0);receiver.dispose();
});
test('internal marketplace immediately requests Side Panel before asynchronous document validation',async()=>{
  const h=fixture(),receiver=createMarketPanelNavigationReceiver({api:h.api,
    onNavigate:async()=>({status:'REVIEW_REQUEST_ACCEPTED'})});
  receiver.start(7);const unregister=registerTrustedMarketNavigation(h.api);
  const source={id:EXT,frameId:0,documentId:'1'.repeat(32),documentLifecycle:'active',
    url:h.api.runtime.getURL('ui/marketplace.html'),tab:{id:12,windowId:7,incognito:false}};
  const response=await new Promise(resolve=>h.api.listener({
    protocol:MARKET_PANEL_NAV_PROTOCOL,action:'NAVIGATE',target:'review',
    toolId:'example-app',version:'1.0.0',marketId:'opendesk/example-app',sha256:SHA
  },source,resolve));
  assert.equal(h.events[0],'panel:7');
  assert.equal(response.ok,true);
  assert.equal(response.status,'REVIEW_REQUEST_ACCEPTED');
  unregister();receiver.dispose();
});
test('non-market document cannot enqueue navigation or open the panel',async()=>{
  const h=fixture();registerTrustedMarketNavigation(h.api);
  const response=await new Promise(resolve=>h.api.listener({protocol:MARKET_PANEL_NAV_PROTOCOL,
    action:'NAVIGATE',target:'open',toolId:'example-app',version:'1.0.0',
    marketId:'opendesk/example-app',sha256:SHA},
    {id:EXT,frameId:0,url:h.api.runtime.getURL('ui/other.html'),tab:{id:12,windowId:7}},resolve));
  assert.equal(response.ok,false);assert.equal(response.error.code,'E_NAV_SENDER');
  assert.equal(h.events.length,0);assert.equal(Object.keys(h.values).length,0);
});
test('production single-app entry points do not create tool tabs or bypass confirmed routing',async()=>{
  const [page,external,center,client,shell]=await Promise.all([
    readFile('src/marketplace/page.js','utf8'),readFile('src/marketplace/external.js','utf8'),
    readFile('src/ui/extension-center.js','utf8'),readFile('src/market-site/client.js','utf8'),
    readFile('src/ui/tool-shell.js','utf8')]);
  assert.doesNotMatch(page,/toolPageHref\(/);
  assert.doesNotMatch(external,/toolPageHref\(/);
  assert.match(page,/navigatePanel\('review',app\)/);
  assert.match(external,/loadMarketReleaseDescriptor\(request\.subject/);
  assert.match(external,/storedSource\?\.sha256!==release\.sha256/);
  assert.match(center,/sidebarTools\.openOfficialReview\(selected\.release\.toolId\)/);
  assert.match(shell,/actualSidePanel\)\{/);
  assert.match(shell,/extensionCenter\.openInstalledMarketApp/);
  assert.match(client,/status==='APP_OPENED'\?'success':'pending'/);
});
