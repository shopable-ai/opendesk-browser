import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {browserOperation,BROWSER_MENU_GRANTS_STORE,BROWSER_HOST_PROTOCOL} from '../../src/framework/sdk/browser-contract.js';
import {createContextMenuHost} from '../../src/platform/chrome/context-menus.js';
import {createToolPermissionConsent} from '../../src/platform/chrome/permission-gate.js';
import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage,sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';

const ordinary=['browser.tabs.create','browser.tabs.activateOwned','browser.tabs.pinOwned',
  'browser.tabs.reloadOwned','browser.tabs.navigateOwned','browser.tabs.removeOwned',
  'browser.downloads.download','browser.downloads.cancelOwned',
  'browser.bookmarks.createOwned','browser.bookmarks.create','browser.bookmarks.update','browser.bookmarks.move'];
const code=expected=>error=>error?.code===expected;
const ui=await readFile(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8');
const start=ui.indexOf("      if(['browser.tabs.create'");
const end=ui.indexOf("\n      if(['browser.cookies.set'",start);
assert(start>=0&&end>start);
// Execute the real trusted UI branch, including its permission-request timing.
const prepare=Function('api','operation','payload','tool','packageHash','revocationEpoch',
  'hostInstanceId','token','source','assertSession','requestBrowserClick',
  'createToolPermissionConsent','browserOperation','globalThis','trustedBookmarkSource','managedProxyReview','BROWSER_HOST_PROTOCOL',
  'const envelope={};return (async()=>{'+ui.slice(start,end)+';return envelope;})()');

async function fixture(){
  const tool=validateSidebarToolPackage({format:'opendesk.sidebar-tool.v2',id:'authorization-probe',
    version:'1.0.0',title:'Authorization probe',description:'Test only',
    capabilities:['browser.tabs','user.export','browser.bookmarks','browser.bookmarks.full','storage.local','browser.network.observe'],
    html:'<main>probe</main>',css:'',js:'void 0;',requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]}});
  const packageHash=await sidebarToolPackageHash(tool),hostInstanceId=randomUUID();
  const identity={toolId:tool.id,toolVersion:tool.version,packageHash,installEpoch:null,
    toolInstance:randomUUID(),hostInstanceId};
  const sender={id:'auth-ux',frameId:0,documentId:'auth-ui',documentLifecycle:'active',
    url:'chrome-extension://auth-ux/sidepanel.html?hostInstanceId='+hostInstanceId};
  const local=new Map([[SIDEBAR_TOOL_STORE,[tool]],[BROWSER_MENU_GRANTS_STORE,{
    [tool.id]:{version:tool.version,packageHash,installEpoch:null,bookmarkFull:true}}]]),session=new Map();
  const storage=map=>({get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys])
    .map(key=>[key,structuredClone(map.get(key))])),
    set:async values=>{for(const [key,value] of Object.entries(values))map.set(key,structuredClone(value));}});
  let granted=true,grantResult=true,click=false,reviews=0;
  const requests=[],messages=[],effects=[],tabs=new Map(),bookmarks=new Map();
  const api={runtime:{id:sender.id,getURL:path=>'chrome-extension://auth-ux/'+path,
    getContexts:async()=>[{contextType:'SIDE_PANEL',documentId:sender.documentId,
      documentUrl:sender.url,frameId:0,incognito:false}]},
    storage:{local:storage(local),session:storage(session),onChanged:{addListener(){}}},
    permissions:{contains:async({permissions})=>!permissions||granted,
      request:args=>{assert.equal(click,true,'request must start in trusted click stack');
        requests.push(args);granted=grantResult;return Promise.resolve(grantResult);}},
    tabs:{onUpdated:{addListener(){}},onRemoved:{addListener(){}},
      create:async({url})=>{const tab={id:tabs.size+1,windowId:1,url};tabs.set(tab.id,tab);effects.push('tab');return tab;},
      get:async id=>tabs.get(id),remove:async id=>{tabs.delete(id)},
      update:async(id,args)=>{Object.assign(tabs.get(id),args);return tabs.get(id);}},
    webNavigation:{getFrame:async({tabId})=>({url:tabs.get(tabId)?.url,documentId:'doc-'+tabId,documentLifecycle:'active'})},
    bookmarks:{create:async args=>{const node={id:String(bookmarks.size+10),parentId:'1',...args};
      bookmarks.set(node.id,node);effects.push('bookmark');return node;},
      getTree:async()=>[{id:'0',title:'root',children:[{id:'1',title:'bar',parentId:'0',children:[...bookmarks.values()]}]}],
      get:async id=>[id==='0'?{id:'0',title:'root'}:id==='1'?{id:'1',parentId:'0',title:'bar'}:bookmarks.get(id)],
      update:async(id,args)=>{Object.assign(bookmarks.get(id),args);effects.push('update');return bookmarks.get(id);}}
  };
  const host=createContextMenuHost({api,lockManager:{request:(_key,work)=>work()},logger:{warn(){}}});
  api.runtime.sendMessage=async message=>{messages.push(message);
    try{return {ok:true,data:await host.handleHost(message,sender)}}
    catch(error){return {ok:false,error:{code:error.code,message:error.message}}}};
  const call=(operation,args={},overrides={})=>host.handleTool({operation,args,...identity,...overrides},sender);
  const preflight=(operation,payload,event={isTrusted:true})=>prepare(api,operation,payload,tool,
    packageHash,null,hostInstanceId,identity.toolInstance,null,()=>{},async({run})=>{
      reviews++;if(!event?.isTrusted)throw Object.assign(Error(),{code:'E_USER_GESTURE_REQUIRED'});
      click=true;try{return run(event)}finally{click=false}
    },createToolPermissionConsent,browserOperation,{location:{href:sender.url}},Symbol(),()=> 'Proxy review',BROWSER_HOST_PROTOCOL);
  return {call,preflight,local,tool,effects,requests,messages,
    get reviews(){return reviews},setGranted:value=>{granted=value},setGrantResult:value=>{grantResult=value}};
}

test('ordinary installed capabilities do not advertise a per-call gesture gate',()=>{
  for(const operation of ordinary)assert.equal(browserOperation(operation).requiresUserGesture,false,operation);
  for(const operation of ['browser.bookmarks.remove','browser.bookmarks.removeTree','browser.storage.local.clear',
    'browser.cookies.set','browser.network.observe.start','browser.screenshot.captureVisible',
    'browser.proxy.managed.requestEnable','browser.scheduler.create','browser.sidePanel.openSelf'])
    assert.equal(browserOperation(operation).requiresUserGesture,true,operation);
});

test('ordinary trusted UI dispatch has zero reviews, permission requests or intent messages',async()=>{
  const f=await fixture();
  for(const operation of ordinary){
    const args=operation==='browser.tabs.create'||operation==='browser.downloads.download'||operation==='browser.bookmarks.createOwned'
      ?{url:'https://example.org/'}:operation.startsWith('browser.tabs.')
      ?{tabRef:'r'.repeat(32),...(operation.endsWith('pinOwned')?{pinned:true}:{}),
        ...(operation.endsWith('navigateOwned')?{url:'https://example.org/next'}:{})}
      :operation==='browser.downloads.cancelOwned'?{downloadRef:'r'.repeat(32)}
      :operation==='browser.bookmarks.create'?{title:'Title'}
      :{id:'1',expected:{id:'1',parentId:'0',index:0,title:'Title',url:null,unmodifiable:null,folderType:null},
        ...(operation.endsWith('move')?{destination:{parentId:'2'}}:{changes:{title:'New'}})};
    assert.deepEqual(await f.preflight(operation,args),{});
  }
  assert.equal(f.reviews,0);assert.deepEqual(f.requests,[]);assert.deepEqual(f.messages,[]);
});

test('owned bookmark prompts only for missing Chrome permission, then reuses it',async()=>{
  const f=await fixture();f.setGranted(false);
  const args={url:'https://example.org/',title:'Docs'};
  await f.preflight('browser.bookmarks.createOwned',args);
  await f.call('browser.bookmarks.createOwned',args);
  await f.preflight('browser.bookmarks.createOwned',args);
  await f.call('browser.bookmarks.createOwned',args);
  assert.equal(f.reviews,1);assert.equal(f.requests.length,1);assert.equal(f.messages.length,0);
  assert.deepEqual(f.effects,['bookmark','bookmark']);
});

test('denied owned bookmark permission has no native write and no fallback approval',async()=>{
  const f=await fixture();f.setGranted(false);f.setGrantResult(false);
  await assert.rejects(f.preflight('browser.bookmarks.createOwned',{url:'https://example.org/'}),code('E_PERMISSION'));
  await assert.rejects(f.call('browser.bookmarks.createOwned',{url:'https://example.org/'}),code('E_CHROME_PERMISSION_REQUIRED'));
  assert.deepEqual(f.effects,[]);assert.equal(f.messages.length,0);
});

test('owned bookmark deletion combines missing Chrome permission with its single destructive review',async()=>{
  const f=await fixture(),{bookmarkRef}=await f.call('browser.bookmarks.createOwned',{
    url:'https://example.org/',title:'Delete me'});
  f.setGranted(false);
  const envelope=await f.preflight('browser.bookmarks.removeOwned',{bookmarkRef});
  assert.equal(typeof envelope.approvalRef,'string');assert.equal(f.reviews,1);
  assert.equal(f.requests.length,1);assert.equal(f.messages.length,1);
});

test('Host allows ordinary calls without intent while checking current install and owned refs',async()=>{
  const f=await fixture(),{tabRef}=await f.call('browser.tabs.create',{url:'https://example.org/'});
  assert.deepEqual(await f.call('browser.tabs.activateOwned',{tabRef}),{focused:true});
  await assert.rejects(f.call('browser.tabs.activateOwned',{tabRef:'x'.repeat(32)}),code('E_TAB_REF_INVALID'));
  const item=await f.call('browser.bookmarks.create',{title:'Docs',url:'https://example.org/'});
  const expected={...item,url:item.url??null,unmodifiable:null,folderType:null};
  const changed=await f.call('browser.bookmarks.update',{id:item.id,expected,changes:{title:'Changed'}});
  assert.equal(changed.title,'Changed');
  f.setGranted(false);
  await assert.rejects(f.call('browser.bookmarks.update',{id:item.id,expected:{...expected,title:'Changed'},changes:{title:'Denied'}}),code('E_CHROME_PERMISSION_REQUIRED'));
  f.setGranted(true);f.local.set(SIDEBAR_TOOL_STORE,[]);
  await assert.rejects(f.call('browser.tabs.create',{url:'https://example.org/'}),code('E_TOOL_CHANGED'));
  assert.deepEqual(f.effects,['tab','bookmark','update']);
});

test('sensitive network observation keeps one intent review but reuses Chrome permission',async()=>{
  const f=await fixture(),{tabRef}=await f.call('browser.tabs.create',{url:'https://example.org/'});
  const envelope=await f.preflight('browser.network.observe.start',{
    tabRef,origins:['https://example.org'],durationMs:1000});
  assert.equal(typeof envelope.approvalRef,'string');assert.equal(f.reviews,1);
  assert.deepEqual(f.requests,[]);assert.equal(f.messages.length,1);
});

test('missing webRequest is requested in the same sensitive observation review',async()=>{
  const f=await fixture(),{tabRef}=await f.call('browser.tabs.create',{url:'https://example.org/'});
  f.setGranted(false);
  const envelope=await f.preflight('browser.network.observe.start',{
    tabRef,origins:['https://example.org'],durationMs:1000});
  assert.equal(typeof envelope.approvalRef,'string');assert.equal(f.reviews,1);
  assert.deepEqual(f.requests,[{permissions:['webRequest']}]);assert.equal(f.messages.length,1);
});

test('denied webRequest does not mint an observation intent',async()=>{
  const f=await fixture(),{tabRef}=await f.call('browser.tabs.create',{url:'https://example.org/'});
  f.setGranted(false);f.setGrantResult(false);
  await assert.rejects(f.preflight('browser.network.observe.start',{
    tabRef,origins:['https://example.org'],durationMs:1000}),code('E_CHROME_PERMISSION_REQUIRED'));
  assert.equal(f.reviews,1);assert.equal(f.requests.length,1);assert.deepEqual(f.messages,[]);
});
