import test from 'node:test';
import assert from 'node:assert/strict';
import {installUpdateNoticeService} from '../../src/platform/chrome/update-notice-service.js';
import {UPDATE_NOTICE_PROTOCOL,UPDATE_NOTICE_STORE,NOTICE_DAY_MS}
  from '../../src/platform/chrome/update-notice-state.js';
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash}
  from '../../src/ui/sidebar-tools/package.js';
import {MARKET_PROVENANCE_STORE,MARKET_OPERATIONS_STORE}
  from '../../src/ui/sidebar-tools/installation.js';
import {SIDEBAR_TOOL_ENABLE_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {officialToolFixture} from '../helpers/official-tools.mjs';

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
async function fixture({provenance=true,capabilities=[]}={}){
  const tool=await officialToolFixture('reading-toc'),sha256=await sidebarToolPackageHash(tool);
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
  const changed=event(),onMessage=event(),onInstalled=event(),onUpdateAvailable=event(),
    onStartup=event(),onActivated=event(),onUpdated=event();
  let time=100000;
  const views=[],opens=[];
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
    ];},async sendMessage(){},async create(args){opens.push(args);}},
    scripting:{async executeScript(request){views.push(request);return [{result:true}];}},
    webNavigation:{async getFrame({tabId}){return {documentId:source(tabId).documentId,
      documentLifecycle:'active',url:pageUrl,errorOccurred:false};}},
    permissions:{async contains({origins}){return origins?.[0]===origin+'/*';}},
    sidePanel:{open(args){opens.push(args);return Promise.resolve();}}
  };
  let queue=Promise.resolve();
  const lockManager={request(_name,_options,fn){
    const result=queue.then(fn);queue=result.catch(()=>{});return result;
  }};
  const service=installUpdateNoticeService({api,loadCatalog:async()=>({apps:[release]}),
    loadInstalled:async()=>[tool],lockManager,now:()=>time});
  async function send(message,sender=source()){
    return new Promise(resolve=>onMessage.emit({protocol:UPDATE_NOTICE_PROTOCOL,...message},sender,resolve));
  }
  return {api,service,store,views,opens,release,tool,source,send,at(value){time=value;},
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
  assert.equal(f.views[0].target.frameIds[0],0);
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

test('unknown local provenance and added capabilities fail closed',async()=>{
  const unverified=await fixture({provenance:false});
  await unverified.settled();
  assert.equal((await unverified.service.replyList()).newCount,0);
  await unverified.service.checkToast();
  assert.equal(unverified.views.length,0);
  const sensitive=await fixture({capabilities:['browser.tabs']});
  await sensitive.settled();
  const list=await sensitive.service.replyList();
  assert.equal(list.records.find(row=>row.id==='reading-toc').status,'review_required');
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
  assert.equal((await f.service.replyList()).globalMode,'toast+inbox');
  const badPage=await f.send({kind:'list'},source());
  assert.equal(badPage.ok,false);
  assert.equal(badPage.error.code,'E_UPDATE_OPERATION');
});
