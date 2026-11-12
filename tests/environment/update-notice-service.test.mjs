import test from 'node:test';
import assert from 'node:assert/strict';
import {installUpdateNoticeService} from '../../src/platform/chrome/update-notice-service.js';
import {UPDATE_NOTICE_PROTOCOL,UPDATE_NOTICE_STORE,NOTICE_DAY_MS}
  from '../../src/platform/chrome/update-notice-state.js';
import {readFile} from 'node:fs/promises';
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash,validateSidebarToolPackage}
  from '../../src/ui/sidebar-tools/package.js';
import {MARKET_PROVENANCE_STORE,MARKET_OPERATIONS_STORE}
  from '../../src/ui/sidebar-tools/installation.js';
import {SIDEBAR_TOOL_ENABLE_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {READING_TOC_SITE_STORE} from '../../projects/reading-toc/trusted/policy.js';

const extensionId='a'.repeat(32);
const origin='https://chatgpt.com';
const pageUrl=origin+'/';
const source=(tabId=41)=>({id:extensionId,url:pageUrl,frameId:0,
  documentId:'doc-'+tabId+'-aaaaaaaaaaaaaaaaaaaa',
  tab:{id:tabId,active:true,incognito:false,url:pageUrl}});
function event(){
  const listeners=new Set();
  return {addListener(fn){listeners.add(fn);},removeListener(fn){listeners.delete(fn);},
    emit(...args){for(const fn of listeners)fn(...args);}};
}
async function fixture({provenance=true,capabilities=[],toolId='prompt-shortcuts',
  savedNotice=null,activeToolIds=null}={}){
  // Use real reviewed legacy page.toc / current page.prompts packages:
  // the package is validated and its ACTUAL installed digest is used as provenance.
  const packagePath=toolId==='reading-toc'?'../fixtures/reading-toc-reviewed-1.0.15.opendesk-tool.json':
    '../../projects/'+toolId+'/'+toolId+'.opendesk-tool.json';
  const bytes=await readFile(new URL(packagePath,import.meta.url));
  const tool=validateSidebarToolPackage(JSON.parse(bytes.toString('utf8')));
  const sha256=await sidebarToolPackageHash(tool);
  const newVersion=tool.version.split('.').map((item,index)=>index===2?String(Number(item)+1):item).join('.');
  const release={id:'opendesk/'+tool.id,toolId:tool.id,version:newVersion,
    sha256:'b'.repeat(64),capabilities:[...tool.capabilities,...capabilities],
    packageTitle:tool.title};
  const store={
    [SIDEBAR_TOOL_STORE]:[tool],
    [MARKET_PROVENANCE_STORE]:provenance?{[tool.id]:{marketId:release.id,
      version:tool.version,sha256}}:{},
    [MARKET_OPERATIONS_STORE]:{},
    [SIDEBAR_TOOL_ENABLE_STORE]:{[tool.id]:true}
  };
  if(savedNotice)store[UPDATE_NOTICE_STORE]=structuredClone(savedNotice);
  const changed=event(),onMessage=event(),onInstalled=event(),onUpdateAvailable=event(),
    onStartup=event(),onActivated=event(),onUpdated=event(),onRemoved=event();
  let time=100000;
  const views=[],opens=[],hides=[],badgeWrites=[],badgeTitles=[];
  const api={
    runtime:{id:extensionId,getManifest:()=>({version:'0.1.0',name:'OpenDesk Browser'}),
      getURL:path=>'chrome-extension://'+extensionId+'/'+String(path).replace(/^\/+/,''),onMessage,onInstalled,
      onUpdateAvailable,onStartup},
    storage:{onChanged:changed,local:{
      async get(key){
        const selected=key===null?Object.keys(store):Array.isArray(key)?key:[key];
        return Object.fromEntries(selected.filter(name=>Object.hasOwn(store,name)).map(name=>[name,
          structuredClone(store[name])]));
      },
      async set(values){
        const changes={};
        for(const [key,value] of Object.entries(values)){
          changes[key]={oldValue:store[key],newValue:value};
          store[key]=structuredClone(value);
        }
        changed.emit(changes,'local');
      }
    }},
    tabs:{onActivated,onUpdated,async query(){return [
      {id:41,url:pageUrl,active:true,incognito:false},
      {id:42,url:pageUrl,active:true,incognito:false},
      {id:43,url:pageUrl,active:true,incognito:false}
    ];},async get(tabId){return {id:tabId,url:pageUrl,active:true,incognito:false};},
    async sendMessage(tabId,message,options){hides.push({tabId,message,options});},async create(args){opens.push(args);}},
    scripting:{async executeScript(request){views.push(request);return [{result:true}];}},
    webNavigation:{async getFrame({tabId}){return {documentId:source(tabId).documentId,
      documentLifecycle:'active',url:pageUrl,errorOccurred:false};}},
    permissions:{onRemoved,async contains({origins}){return origins?.[0]===origin+'/*';}},
    sidePanel:{open(args){opens.push(args);return Promise.resolve();}},
    action:{
      async setBadgeText(args){badgeWrites.push(args.text);},
      async setBadgeBackgroundColor(){},
      async setTitle(args){badgeTitles.push(args.title);}
    }
  };
  let queue=Promise.resolve();
  const lockManager={request(_name,_options,fn){
    const result=queue.then(fn);queue=result.catch(()=>{});return result;
  }};
  const service=installUpdateNoticeService({api,loadCatalog:async()=>({apps:[release]}),
    loadInstalled:async()=>[tool],lockManager,now:()=>time,
    // Test-only trusted document attestation; production fails closed without it.
    getActiveDocumentTools:async()=>activeToolIds??[tool.id]});
  async function send(message,sender=source()){
    return new Promise(resolve=>onMessage.emit({protocol:UPDATE_NOTICE_PROTOCOL,...message},sender,resolve));
  }
  return {api,service,store,views,opens,hides,badgeWrites,badgeTitles,
    release,tool,source,send,lockManager,at(value){time=value;},
    async settled(){await service.reconcile();await queue;}};
}

test('worker uses original installed/source evidence and one cross-tab claim',async()=>{
  const f=await fixture();
  await f.settled();
  const list=await f.service.replyList();
  assert.equal(list.verified,true);
  assert.equal(list.newCount,1);
  await f.service.checkToast();
  assert.equal(f.views.length,1);
  assert.deepEqual(f.views[0].target,{tabId:41,documentIds:[source().documentId]});
  assert.equal(f.views[0].world,'ISOLATED');
  assert.equal(f.views[0].func.name,'showTrustedUpdateToast');
  const token=f.views[0].args[0].token;
  assert.equal(f.store[UPDATE_NOTICE_STORE].records[
    'sidebar-tool:'+f.tool.id+':'+f.release.version+':'+f.release.sha256].impressionCount,0);
  const visible=await f.send({kind:'page-visible',token});
  assert.equal(visible.ok,true);
  assert.equal(f.store[UPDATE_NOTICE_STORE].lastToastAt,100000);
  await f.service.checkToast();
  assert.equal(f.views.length,1,'no second page while claim is active');
  assert.equal((await f.send({kind:'page-action',token,action:'snooze'})).ok,true);
  f.at(100000+NOTICE_DAY_MS-1);
  await f.service.checkToast();
  assert.equal(f.views.length,1);
  f.at(100000+NOTICE_DAY_MS+1);
  await f.service.checkToast();
  assert.equal(f.views.length,2);
  const second=f.views[1].args[0].token;
  assert.equal((await f.send({kind:'page-visible',token:second})).ok,true);
  assert.equal((await f.send({kind:'page-action',token:second,action:'close'})).ok,true);
  f.at(100000+NOTICE_DAY_MS*4);
  await f.service.checkToast();
  assert.equal(f.views.length,2,'third toast must never be shown');
});

test('web Toast needs active same-tool evidence, global Badge stays intact',async()=>{
  for(const activeToolIds of [[],['reading-toc']]){
    const f=await fixture({activeToolIds});await f.settled();
    const list=await f.service.replyList();
    assert.equal(list.verified,true);
    assert.equal(list.badgeCount,1,'site relation must not reduce global Badge');
    await f.service.checkToast();
    assert.equal(f.views.length,0,'unrelated or inactive tool cannot receive a webpage Toast');
  }
});

test('unknown local provenance and added capabilities fail closed',async()=>{
  const unverified=await fixture({provenance:false});
  await unverified.settled();
  assert.equal((await unverified.service.replyList()).newCount,0);
  await unverified.service.checkToast();
  assert.equal(unverified.views.length,0);
  const sensitive=await fixture({capabilities:['browser.tabs']});
  await sensitive.settled();
  const list=await sensitive.service.replyList();
  assert.equal(list.records.find(row=>row.id==='prompt-shortcuts').status,'review_required');
  assert.deepEqual(list.records[0].newCapabilities,['browser.tabs']);
});

test('untrusted webpage or sandbox sender cannot spoof update center commands',async()=>{
  const f=await fixture();
  await f.settled();
  const hostile={id:extensionId,url:'chrome-extension://'+extensionId+'/sidebar-tools/sandbox.html',
    frameId:0};
  const rejected=await f.send({kind:'set-mode',mode:'silent'},hostile);
  assert.equal(rejected.ok,false);
  assert.equal(rejected.error.code,'E_UPDATE_SENDER');
  for(const url of ['file:///app.html','chrome-extension://'+'b'.repeat(32)+'/app.html']){
    const reply=await f.send({kind:'set-mode',mode:'silent'},{...hostile,url});
    assert.equal(reply.error.code,'E_UPDATE_SENDER',url);
  }
  assert.equal((await f.service.replyList()).globalMode,'toast+inbox');
  const badPage=await f.send({kind:'list'},source());
  assert.equal(badPage.ok,false);
  assert.equal(badPage.error.code,'E_UPDATE_OPERATION');
});


test('sidepanel ignore immediately hides an already visible Toast and preserves installed tool',async()=>{
  const f=await fixture();
  await f.settled();
  await f.service.checkToast();
  assert.equal(f.views.length,1);
  const token=f.views[0].args[0].token;
  assert.equal((await f.send({kind:'page-visible',token})).ok,true);
  const key='sidebar-tool:'+f.tool.id+':'+f.release.version+':'+f.release.sha256;
  const sender={id:extensionId,url:'chrome-extension://'+extensionId+'/sidepanel.html',frameId:0};
  const reply=await f.send({kind:'action',key,action:'ignore'},sender);
  assert.equal(reply.ok,true);
  assert.equal(f.hides.length,1);
  assert.equal(f.hides[0].message.token,token);
  assert.equal(f.store[UPDATE_NOTICE_STORE].records[key].ignoredAt,100000);
  assert.equal(f.store[SIDEBAR_TOOL_STORE][0].version,f.tool.version);
  f.at(100000+NOTICE_DAY_MS*2);
  await f.service.checkToast();
  assert.equal(f.views.length,1);
});


test('page View opens the original side panel on the synchronous click stack, then persists seen state',async()=>{
  const f=await fixture();
  await f.settled();
  await f.service.checkToast();
  const token=f.views[0].args[0].token;
  assert.equal((await f.send({kind:'page-visible',token})).ok,true);
  const pending=f.send({kind:'page-action',token,action:'view'});
  assert.deepEqual(f.opens,[{tabId:41}],
    'browser sidePanel.open must run before awaited storage reads');
  const result=await pending;
  assert.equal(result.ok,true);
  const row=Object.values(f.store[UPDATE_NOTICE_STORE].records)
    .find(item=>item.kind==='sidebar-tool');
  assert.equal(row.viewedAt,100000);
  assert.equal(f.opens.length,1,'do not open another tab after the side panel succeeds');
  assert.equal(f.store[SIDEBAR_TOOL_STORE][0].version,f.tool.version);
});

test('Chrome permission revocation hides persisted visible claims after Worker restart without replay',async()=>{
  const original=await fixture();await original.settled();await original.service.checkToast();
  const token=original.views[0].args[0].token;
  assert.equal((await original.send({kind:'page-visible',token})).ok,true);
  const f=await fixture({savedNotice:original.store[UPDATE_NOTICE_STORE]});
  await f.settled();await f.service.checkToast();
  assert.equal(f.views.length,0,'restart cannot repeat an acknowledged toast');
  f.api.permissions.contains=async()=>false;
  f.api.permissions.onRemoved.emit({origins:[origin+'/*']});
  const action=await f.send({kind:'page-action',action:'view',token});
  assert.equal(action.error.code,'E_UPDATE_SITE_REVOKED');
  await f.service.reconcile();
  assert.ok(f.hides.some(row=>row.message.token===token&&row.options.documentId===source().documentId));
  assert.equal(f.opens.length,0);
  const row=Object.values(f.store[UPDATE_NOTICE_STORE].records)[0];
  assert.equal(row.impressionCount,1);assert.equal(row.viewedAt,null);
  f.api.permissions.contains=async()=>true;
  f.at(100000+NOTICE_DAY_MS*2);await f.service.checkToast();
  assert.equal(f.views.length,0,'restoring permission alone does not authorize a reminder');
});

test('site grant removal immediately invalidates live gesture hints and hides the exact document',async()=>{
  const f=await fixture({toolId:'reading-toc'});await f.settled();await f.service.checkToast();
  const token=f.views[0].args[0].token;
  assert.equal((await f.send({kind:'page-visible',token})).ok,true);
  const saved=structuredClone(f.store[SIDEBAR_TOOL_STORE]);
  await f.api.storage.local.set({[READING_TOC_SITE_STORE]:{
    'reading-toc':{mode:'all-except',blockedOrigins:[origin]}}});
  const pending=f.send({kind:'page-action',action:'view',token});
  assert.equal(f.opens.length,0,'revocation clears gesture hints before asynchronous checks');
  assert.equal((await pending).error.code,'E_UPDATE_SITE_REVOKED');
  await f.service.reconcile();
  assert.ok(f.hides.some(row=>row.message.token===token&&row.options.documentId===source().documentId));
  assert.equal(Object.values(f.store[UPDATE_NOTICE_STORE].records)[0].impressionCount,1);
  assert.deepEqual(f.store[SIDEBAR_TOOL_STORE],saved);
});

test('a rejected gesture open is consumed even when the subsequent permission check fails',async()=>{
  const f=await fixture();await f.settled();await f.service.checkToast();
  const token=f.views[0].args[0].token;
  assert.equal((await f.send({kind:'page-visible',token})).ok,true);
  f.api.sidePanel.open=args=>{f.opens.push(args);return Promise.reject(Error('gesture expired'));};
  f.api.permissions.contains=async()=>false;
  assert.equal((await f.send({kind:'page-action',action:'view',token})).error.code,'E_UPDATE_SITE_REVOKED');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.opens,[{tabId:41}],'failed permission check cannot open a fallback tab');
});

test('revocation fences a pending gesture open before its rejection can open a fallback tab',async()=>{
  const f=await fixture();await f.settled();await f.service.checkToast();
  const token=f.views[0].args[0].token;
  assert.equal((await f.send({kind:'page-visible',token})).ok,true);
  let rejectOpen;
  f.api.sidePanel.open=args=>{f.opens.push(args);return new Promise((_resolve,reject)=>{rejectOpen=reject;});};
  assert.equal((await f.send({kind:'page-action',action:'view',token})).ok,true);
  f.api.permissions.contains=async()=>false;
  f.api.permissions.onRemoved.emit({origins:[origin+'/*']});
  rejectOpen(Error('panel failed after revocation'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.opens,[{tabId:41}]);
});

test('revocation while visible ACK waits for the write lock cannot revive a live claim',async()=>{
  const f=await fixture();await f.settled();await f.service.checkToast();
  const token=f.views[0].args[0].token;
  const request=f.lockManager.request;
  let release,entered;
  const blocked=new Promise(resolve=>{release=resolve;});
  const waiting=new Promise(resolve=>{entered=resolve;});
  f.lockManager.request=(...args)=>{entered();return blocked.then(()=>request(...args));};
  const visible=f.send({kind:'page-visible',token});
  await waiting;
  f.api.permissions.contains=async()=>false;
  f.api.permissions.onRemoved.emit({origins:[origin+'/*']});
  release();
  assert.equal((await visible).error.code,'E_UPDATE_SITE_REVOKED');
  assert.equal(Object.values(f.store[UPDATE_NOTICE_STORE].records)[0].impressionCount,0);
  const action=f.send({kind:'page-action',action:'view',token});
  assert.equal(f.opens.length,0,'late ACK must not restore the synchronous gesture hint');
  assert.equal((await action).error.code,'E_UPDATE_SITE_REVOKED');
});

test('Chrome Action badge survives view, follows ignore and preference, and restores after restart',async()=>{
  const f=await fixture();await f.settled();await f.service.syncBadge();
  assert.equal(f.badgeWrites.at(-1),'1');
  assert.match(f.badgeTitles.at(-1),/1 项扩展待更新/);
  const key='sidebar-tool:'+f.tool.id+':'+f.release.version+':'+f.release.sha256;
  const sender={id:extensionId,url:'chrome-extension://'+extensionId+'/sidepanel.html',frameId:0};
  assert.equal((await f.send({kind:'action',key,action:'view'},sender)).ok,true);
  await f.service.syncBadge();
  assert.equal((await f.service.replyList()).newCount,0);
  assert.equal((await f.service.replyList()).actionableCount,1);
  assert.equal(f.badgeWrites.at(-1),'1');
  assert.equal((await f.send({kind:'set-mode',mode:'silent'},sender)).ok,true);
  await f.service.syncBadge();
  assert.equal(f.badgeWrites.at(-1),'');
  assert.equal((await f.send({kind:'set-mode',mode:'inbox-only'},sender)).ok,true);
  await f.service.syncBadge();
  assert.equal(f.badgeWrites.at(-1),'1');
  f.api.runtime.onStartup.emit();
  await f.service.reconcile();await f.service.syncBadge();
  assert.equal(f.badgeWrites.at(-1),'1');
  assert.equal((await f.send({kind:'action',key,action:'ignore'},sender)).ok,true);
  await f.service.syncBadge();
  assert.equal(f.badgeWrites.at(-1),'');
  assert.equal((await f.service.replyList()).actionableCount,0);
});

test('unverified provenance, capability review and Chrome apply cannot fabricate actionable badge',async()=>{
  const unknown=await fixture({provenance:false});await unknown.settled();
  await unknown.service.syncBadge();
  assert.equal(unknown.badgeWrites.at(-1),'');
  const review=await fixture({capabilities:['browser.tabs']});await review.settled();
  await review.service.syncBadge();
  assert.equal(review.badgeWrites.at(-1),'1');
  assert.equal((await review.service.replyList()).records[0].status,'review_required');
  const browser=await fixture();await browser.settled();
  browser.api.runtime.onUpdateAvailable.emit({version:'0.2.0'});
  // Wait for the existing update event's queued, verified storage transaction.
  await browser.lockManager.request('test',{mode:'exclusive'},async()=>{});
  await browser.service.syncBadge();
  const list=await browser.service.replyList();
  assert.equal(list.browserPendingCount,1);
  assert.equal(list.actionableCount,1);
  assert.equal(browser.badgeWrites.at(-1),'1','Chrome apply alone adds no installer task');
});

// R5: a concurrent installation/source change is not a successful readback.
// The first observed inventory must be rejected, never promoted to a verified badge.
test('R5 concurrent registry or source drift invalidates the in-flight inventory proof',async()=>{
  const f=await fixture();await f.settled();
  assert.equal((await f.service.replyList()).actionableCount,1);
  const read=f.api.storage.local.get.bind(f.api.storage.local);
  let injected=false;
  f.api.storage.local.get=async keys=>{
    if(!injected&&Array.isArray(keys)&&keys.length===3&&
      keys.includes(SIDEBAR_TOOL_STORE)&&
      keys.includes(MARKET_PROVENANCE_STORE)&&
      keys.includes(SIDEBAR_TOOL_ENABLE_STORE)){
      injected=true;
      // Simulate a concurrent source owner replacing its record after the
      // inventory snapshot but before the final no-write commit fence.
      f.store[MARKET_PROVENANCE_STORE]={};
    }
    return read(keys);
  };
  assert.equal(await f.service.reconcile(),false);
  assert.equal(injected,true);
  await f.service.syncBadge();
  assert.equal(f.badgeWrites.at(-1),'','a raced identity cannot retain a trusted badge');
  const rechecked=await f.service.replyList();
  assert.equal(rechecked.actionableCount,0);
  assert.equal(rechecked.records.find(row=>row.id===f.tool.id).status,'unknown');
});

// R5: the review button's Worker query cannot rely on the 5-minute read cache.
// Model the interval before the normal storage.onChanged invalidation is delivered.
test('R5 trusted review list forces a fresh installed-source comparison',async()=>{
  const f=await fixture();await f.settled();
  f.store[MARKET_PROVENANCE_STORE]={};
  assert.equal((await f.service.replyList()).actionableCount,1,
    'ordinary passive list may still be cached before its invalidation event');
  const sender={id:extensionId,
    url:'chrome-extension://'+extensionId+'/sidepanel.html',frameId:0};
  const result=await f.send({kind:'list',fresh:true},sender);
  assert.equal(result.ok,true);
  assert.equal(result.data.verified,true);
  assert.equal(result.data.actionableCount,0);
  assert.equal(result.data.records.find(row=>row.id===f.tool.id).status,'unknown');
});
