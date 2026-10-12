import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {normalizeBrowserOperation} from '../../src/framework/sdk/browser-contract.js';
import {validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {createContextMenuHost} from '../../src/platform/chrome/context-menus.js';

const uid='01234567-89ab-4def-8123-456789abcdef';
const pkg=validateSidebarToolPackage({
  format:'opendesk.sidebar-tool.v2',id:'browser-probe',version:'1.0.0',
  title:'Browser probe',description:'P0 acceptance probe',
  capabilities:['browser.tabs','browser.sidePanel','network'],
  html:'<div>Browser probe</div>',css:'',js:'console.log("browser probe");',
  requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]}
});
const identity={toolId:pkg.id,toolVersion:pkg.version,toolInstance:uid,hostInstanceId:uid,installEpoch:null};
const sender={id:'ext-r2',frameId:0,documentId:'host-document-1',documentLifecycle:'active',
  url:'chrome-extension://ext-r2/ui/tool.html?hostInstanceId='+uid};
const locks={request:(_key,work)=>work()};
const err=code=>error=>error?.code===code;

function fixture({fetchImpl=async()=>new Response('{"ok":true}',{status:200,headers:{'content-type':'application/json'}})}={}){
  const local=new Map([['opendesk.sidebar-tools.installed.v1',[pkg]]]),session=new Map();
  const tabs=new Map(),created=[],updated=[],removed=[],listeners=[],storageListeners=[];
  let permitted=true,chromeGranted=true;
  const store=map=>({
    get:async key=>Object.fromEntries((Array.isArray(key)?key:[key]).map(k=>[k,map.get(k)])),
    set:async values=>{
      const changes={};
      for(const [key,value] of Object.entries(values)){
        changes[key]={oldValue:map.get(key),newValue:value};map.set(key,value);
      }
      for(const fn of storageListeners)fn(changes,map===local?'local':'session');
    }
  });
  const api={
    runtime:{id:'ext-r2',getURL:path=>'chrome-extension://ext-r2/'+path,lastError:null},
    permissions:{contains:async ({origins,permissions})=>origins?permitted:chromeGranted},
    storage:{local:store(local),session:store(session),onChanged:{addListener:fn=>storageListeners.push(fn)}},
    tabs:{
      onRemoved:{addListener:fn=>removed.push(fn)},
      onUpdated:{addListener:fn=>updated.push(fn)},
      create:async ({url})=>{const item={id:100+created.length,windowId:9,url};tabs.set(item.id,item);created.push(item);return item;},
      remove:async id=>{tabs.delete(id);for(const fn of removed)fn(id);},
      get:async id=>{if(!tabs.has(id))throw Error('Tab missing');return tabs.get(id);},
      update:async (id,attrs)=>{const item={...tabs.get(id),...attrs};tabs.set(id,item);return item;}
    },
    windows:{update:async()=>true},
    sidePanel:{open:async()=>true}
  };
  const host=createContextMenuHost({api,fetchImpl,lockManager:locks,logger:{warn(){}}});
  const confirm=async(operation,args)=>host.handleHost({
    operation:'browser.intent.confirm',targetOperation:operation,targetArgs:args,...identity
  },sender);
  const call=(operation,args={},approvalRef)=>host.handleTool({
    operation,args,approvalRef,...identity
  },sender);
  return {api,host,call,confirm,created,tabs,setSite:v=>{permitted=v;},
    setChrome:v=>{chromeGranted=v;},
    navigate(id,url){tabs.set(id,{...tabs.get(id),url});for(const fn of updated)fn(id,{url});}
  };
}

test('R2 public Browser SDK wraps four real operations while page SDK stays isolated',async()=>{
  const calls=[],sdk=createBrowserSdk({request:async(operation,args)=>{calls.push([operation,args]);return {ok:true};}});
  await sdk.tabs.open({url:'https://example.org'});
  await sdk.tabs.focus({tabRef:'r'.repeat(32)});
  await sdk.sidePanel.openSelf();
  await sdk.network.request({method:'GET',url:'https://example.org'});
  assert.deepEqual(calls.map(x=>x[0]),['browser.tabs.open','browser.tabs.focus',
    'browser.sidePanel.openSelf','browser.network.request']);
  const page=createBrowserSdk({context:'page-sdk'});
  assert.equal(typeof page.tabs,'undefined');
  assert.equal(typeof page.network,'undefined');
});

test('R2 schema rejects arbitrary tabs, credentials, bad methods and unsafe headers',()=>{
  assert.throws(()=>normalizeBrowserOperation('browser.tabs.focus',{tabId:1}),err('E_SCHEMA'));
  assert.throws(()=>normalizeBrowserOperation('browser.tabs.open',{url:'javascript:alert(1)'}),err('E_SCHEMA'));
  assert.throws(()=>normalizeBrowserOperation('browser.tabs.open',{url:'https://user:secret@host.test/'}),err('E_SCHEMA'));
  assert.throws(()=>normalizeBrowserOperation('browser.network.request',{method:'GET',url:'https://host.test',data:'x'}),err('E_SCHEMA'));
  assert.throws(()=>normalizeBrowserOperation('browser.network.request',{method:'PATCH',url:'https://host.test'}),err('E_SCHEMA'));
  assert.throws(()=>normalizeBrowserOperation('browser.network.request',{method:'POST',url:'https://host.test',config:{headers:{authorization:'secret'}}}),err('E_SCHEMA'));
});

test('R2 Host requires exact one-use approved action, binds TabRef to package and rejects raw tabId',async()=>{
  const f=fixture(),args={url:'https://example.org/path'};
  await assert.rejects(f.call('browser.tabs.open',args),err('E_USER_GESTURE_REQUIRED'));
  const {approvalRef}=await f.confirm('browser.tabs.open',args);
  await assert.rejects(f.call('browser.tabs.open',{url:'https://different.test/'},approvalRef),err('E_USER_GESTURE_REQUIRED'));
  await assert.rejects(f.call('browser.tabs.open',args,approvalRef),err('E_USER_GESTURE_REQUIRED'));
  assert.equal(f.created.length,0);
  const ref=(await f.call('browser.tabs.open',args,(await f.confirm('browser.tabs.open',args)).approvalRef)).tabRef;
  assert.equal(typeof ref,'string');
  assert.equal(f.created.length,1);
  await assert.rejects(f.call('browser.tabs.focus',{tabId:100}),err('E_SCHEMA'));
  await assert.rejects(f.call('browser.tabs.focus',{tabRef:ref}),err('E_USER_GESTURE_REQUIRED'));
  assert.deepEqual(await f.call('browser.tabs.focus',{tabRef:ref},
    (await f.confirm('browser.tabs.focus',{tabRef:ref})).approvalRef),{focused:true});
  f.navigate(100,'https://different.test/elsewhere');
  await assert.rejects(f.call('browser.tabs.focus',{tabRef:ref},
    (await f.confirm('browser.tabs.focus',{tabRef:ref})).approvalRef),err('E_TAB_REF_INVALID'));
});

test('R2 Host enforces installed tool capability, site revocation and Chrome permission checks',async()=>{
  const f=fixture(),args={url:'https://example.org'};
  f.setSite(false);
  await assert.rejects(f.confirm('browser.tabs.open',args),err('E_SITE_PERMISSION_REVOKED'));
  f.setSite(true);f.setChrome(false);
  await assert.rejects(f.confirm('browser.tabs.open',args),err('E_CHROME_PERMISSION_REQUIRED'));
  f.setChrome(true);
  const {approvalRef}=await f.confirm('browser.tabs.open',args);
  await f.api.storage.local.set({'opendesk.sidebar-tools.installed.v1':[]});
  await assert.rejects(f.call('browser.tabs.open',args,approvalRef),err('E_TOOL_CHANGED'));
  assert.equal(f.created.length,0);
});

test('R2 bounded HTTP uses old driver, strips sensitive headers, denies stale approval',async()=>{
  const seen=[];
  const f=fixture({fetchImpl:async(url,init)=>{
    seen.push({url,credentials:init.credentials,redirect:init.redirect});
    return new Response('{"ok":true}',{status:200,headers:{'content-type':'application/json','set-cookie':'hidden=1'}});
  }});
  const args={method:'GET',url:'https://example.org/json',config:{responseType:'json'}};
  assert.deepEqual(await f.call('browser.network.request',args,
    (await f.confirm('browser.network.request',args)).approvalRef),{status:200,data:{ok:true}});
  assert.deepEqual(seen,[{url:'https://example.org/json',credentials:'omit',redirect:'manual'}]);
  const token=(await f.confirm('browser.network.request',args)).approvalRef;
  f.setSite(false);
  await assert.rejects(f.call('browser.network.request',args,token),err('E_SITE_PERMISSION_REVOKED'));
  assert.equal(seen.length,1);
});

test('R2 Side Panel Host only authorizes preflight; synthetic tool RPC never directly opens it',async()=>{
  const f=fixture(),result=await f.call('browser.sidePanel.openSelf');
  assert.deepEqual(result,{requiresVisibleUserClick:true});
  f.setChrome(false);
  await assert.rejects(f.call('browser.sidePanel.openSelf'),err('E_CHROME_PERMISSION_REQUIRED'));
});

test('R2 revocation aborts a request that already entered the trusted fetch driver',async()=>{
 let entered;
 const inFlight=new Promise(resolve=>{entered=resolve});
 const f=fixture({fetchImpl:(_url,init)=>new Promise((_resolve,reject)=>{
   init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});
   entered();
 })});
 const args={method:'GET',url:'https://example.org/private'};
 const token=(await f.confirm('browser.network.request',args)).approvalRef;
 const pending=f.call('browser.network.request',args,token);
 await inFlight;
 f.host.revokeBrowserOperations();
 await assert.rejects(pending,err('E_CANCELLED'));
});
