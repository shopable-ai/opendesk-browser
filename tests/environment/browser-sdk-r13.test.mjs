import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateSidebarToolPackage,serializeSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {sameSidebarToolPackage} from '../../src/ui/sidebar-tools/installation.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {BROWSER_OPERATIONS,BROWSER_MENU_GRANTS_STORE,BROWSER_MENU_LAUNCH_STORE,
  BROWSER_MENU_ROOT,normalizeBrowserOperation} from '../../src/framework/sdk/browser-contract.js';
import {createContextMenuHost} from '../../src/platform/chrome/context-menus.js';

const readSample=async(name)=>JSON.parse(await readFile(new URL('../../examples/sidebar-tools/browser-sdk-r13/'+name,import.meta.url),'utf8'));
const uid='01234567-89ab-4def-8123-456789abcdef';
const sender={id:'ext-r13',url:'chrome-extension://ext-r13/ui/tool.html?hostInstanceId='+uid};
function makeChrome(){
  const menus=new Map(),events=[],changes=[],values=new Map(),sessionValues=new Map();
  const row=(map,key)=>key===null?Object.fromEntries(map):Array.isArray(key)?
    Object.fromEntries(key.map(k=>[k,map.get(k)])): {[key]:map.get(key)};
  const emit=(name,next,area)=>{
    for(const callback of changes)callback(Object.fromEntries(Object.entries(next).map(([key,val])=>
      [key,{newValue:val}])),area);
  };
  const store=(map,area)=>({
    get:async key=>row(map,key),
    set:async next=>{for(const [key,val] of Object.entries(next))map.set(key,val);emit('set',next,area);},
    remove:async key=>{for(const k of typeof key==='string'?[key]:key)map.delete(k);}
  });
  let granted=false;
  const api={
    runtime:{id:'ext-r13',lastError:null,getURL:path=>'chrome-extension://ext-r13/'+path},
    storage:{local:store(values,'local'),session:store(sessionValues,'session'),
      onChanged:{addListener:fn=>changes.push(fn)}},
    permissions:{contains:async() =>granted},
    contextMenus:{
      onClicked:{addListener:fn=>events.push(fn)},
      create(item,cb){
        if(menus.has(item.id))api.runtime.lastError={message:'duplicate id'};
        else menus.set(item.id,{...item});
        cb();api.runtime.lastError=null;
      },
      update(id,value,cb){menus.set(id,{...menus.get(id),...value});cb();},
      remove(id,cb){menus.delete(id);cb();}
    },
    sidePanel:{open(opts){api.opened.push(opts);return Promise.resolve();}},
    webNavigation:{getFrame:async()=>api.frame},
    opened:[],frame:{documentId:'document-A',url:'https://example.com/post',documentLifecycle:'active'}
  };
  return {api,menus,events,values,sessionValues,setPermission(v){granted=v;},changes};
}
const lockManager={request(_key,work){return work();}};
const hostContext={toolId:'selection-notes',toolVersion:'1.0.0',installEpoch:null,
  toolInstance:uid,hostInstanceId:uid};
const frame={id:9,tabId:9,windowId:2,url:'https://example.com/post',incognito:false};
const hostLaunch={...hostContext,launchId:null};
async function cycle(host){await host.synchronize();}

test('R1.3 v1 strict unchanged; v2 contribution validated and digest-sensitive',async()=>{
  const sample=await readSample('selection-notes.opendesk-tool.json');
  assert.equal(validateSidebarToolPackage(sample).contributes.contextMenus.length,1);
  assert.equal(serializeSidebarToolPackage(sample),serializeSidebarToolPackage(structuredClone(sample)));
  assert.throws(()=>validateSidebarToolPackage({...sample,format:'opendesk.sidebar-tool.v1'}),e=>e.code==='E_TOOL_SCHEMA');
  const duplicate=structuredClone(sample);duplicate.contributes.contextMenus.push({...duplicate.contributes.contextMenus[0]});
  assert.throws(()=>validateSidebarToolPackage(duplicate),e=>e.code==='E_TOOL_SCHEMA');
  const executable=structuredClone(sample);executable.contributes.contextMenus[0].handler='javascript:eval';
  assert.throws(()=>validateSidebarToolPackage(executable),e=>e.code==='E_TOOL_SCHEMA');
  const changed=structuredClone(sample);changed.contributes.contextMenus[0].title='不同菜单';
  assert.equal(sameSidebarToolPackage(sample,changed),false);
  const v1=await readSample('browser-capabilities.opendesk-tool.json');
  assert.equal(validateSidebarToolPackage(v1).format,'opendesk.sidebar-tool.v1');
  assert.throws(()=>validateSidebarToolPackage({...v1,requires:{browserSdk:'1.0.0'}}));
});
test('Browser SDK tool wrapper preserves request channel; page SDK denies privileged menu',async()=>{
  const calls=[],request=async (operation,args)=>{calls.push({operation,args});return {ok:true};};
  const sdk=createBrowserSdk({request});
  await sdk.contextMenu.register({actionIds:['capture-selection']});
  await sdk.launch.consume();
  assert.deepEqual(calls.map(row=>row.operation),['browser.contextMenu.register','browser.launch.consume']);
  assert.deepEqual(calls[0].args,{actionIds:['capture-selection']});
  assert.throws(()=>sdk.contextMenu.register({actionIds:['invalid id']}),{code:'E_SCHEMA'});
  assert.equal(sdk.apiVersion,'1.0.0');
  const page=createBrowserSdk({context:'page-sdk'});
  assert.equal((await page.capabilities.getStatus({operation:'browser.contextMenu.register'})).callableNow,false);
  await assert.rejects(page.contextMenu.register({actionIds:['capture-selection']}),{code:'E_CONTEXT'});
  assert.equal(Object.hasOwn(BROWSER_OPERATIONS,'browser.network.observe.start'),true);
  assert.equal(BROWSER_OPERATIONS['browser.network.observe.start'].implementation,'PLANNED');
  assert.throws(()=>normalizeBrowserOperation('browser.network.observe.start',{}),{code:'E_SERVICE_UNSUPPORTED'});
});
test('menus use browser optional permission, idempotent sync, real click and one-use source',async()=>{
  const sample=await readSample('selection-notes.opendesk-tool.json');
  const fake=makeChrome(),{api,menus,events}=fake;
  await api.storage.local.set({'opendesk.sidebar-tools.installed.v1':[sample]});
  const host=createContextMenuHost({api,lockManager,logger:{warn(){}}});
  assert.equal(events.length,1);
  assert.equal((await host.synchronize()).enabled,false);
  assert.equal(menus.size,0);
  fake.setPermission(true);
  await host.synchronize();
  assert.equal(menus.has(BROWSER_MENU_ROOT),true);
  assert.equal(menus.size,2);
  await host.handleHost({operation:'browser.contextMenu.userToggle',toolId:sample.id,enabled:true,
    origin:'https://example.com',document:{tabId:9,documentId:'document-A',url:'https://example.com/post'},
    hostInstanceId:uid},sender);
  assert.equal(menus.has('opendesk.tool.selection-notes.capture-selection'),true);
  await host.synchronize();
  assert.equal(menus.size,3,'sync cannot create duplicate menu IDs');
  const browserStatus=await host.handleTool({operation:'browser.capabilities.getStatus',
    args:{operation:'browser.contextMenu.register'},...hostContext},sender);
  assert.equal(browserStatus.callableNow,true);
  host.onClicked({menuItemId:'opendesk.tool.selection-notes.capture-selection',
    pageUrl:'https://example.com/post',frameId:0,selectionText:'R1.3 selected'},frame);
  assert.equal(api.opened.length,1,'Side Panel opened synchronously in native click');
  await cycle(host);
  const launches=(await api.storage.session.get(BROWSER_MENU_LAUNCH_STORE))[BROWSER_MENU_LAUNCH_STORE];
  assert.equal(launches['selection-notes'].selection,'R1.3 selected');
  const launchId=launches['selection-notes'].ticketId;
  await host.handleHost({operation:'browser.launch.bind',toolId:sample.id,
    launchId,hostInstanceId:uid,toolInstance:uid},sender);
  const consumed=await host.handleTool({operation:'browser.launch.consume',args:{},...hostContext},sender);
  assert.equal(consumed.selection,'R1.3 selected');
  await assert.rejects(host.handleTool({operation:'browser.launch.consume',args:{},...hostContext},sender),
    {code:'E_LAUNCH_EXPIRED'});
});
test('uninstall, site revocation, stale package, stale document invalidate menus and launch',async()=>{
  const sample=await readSample('selection-notes.opendesk-tool.json'),fake=makeChrome();
  const {api,menus}=fake,host=createContextMenuHost({api,lockManager,logger:{warn(){}}});
  await api.storage.local.set({'opendesk.sidebar-tools.installed.v1':[sample]});
  fake.setPermission(true);
  await host.synchronize();
  await host.handleHost({operation:'browser.contextMenu.userToggle',toolId:sample.id,enabled:true,
    origin:'https://example.com',document:{tabId:9,documentId:'document-A',url:'https://example.com/post'},
    hostInstanceId:uid},sender);
  host.onClicked({menuItemId:'opendesk.tool.selection-notes.capture-selection',
    pageUrl:'https://example.com/post',frameId:0,selectionText:'discard me'},frame);
  await cycle(host);
  let launches=(await api.storage.session.get(BROWSER_MENU_LAUNCH_STORE))[BROWSER_MENU_LAUNCH_STORE];
  const id=launches['selection-notes'].ticketId;
  await host.handleHost({operation:'browser.launch.bind',toolId:sample.id,
    launchId:id,hostInstanceId:uid,toolInstance:uid},sender);
  api.frame={...api.frame,documentId:'document-B'};
  await assert.rejects(host.handleTool({operation:'browser.launch.consume',args:{},...hostContext},sender),
    {code:'E_DOCUMENT_CHANGED'});
  const revised=structuredClone(sample);revised.contributes.contextMenus[0].title='new title';
  await api.storage.local.set({'opendesk.sidebar-tools.installed.v1':[revised]});
  await host.synchronize();
  assert.equal(menus.has('opendesk.tool.selection-notes.capture-selection'),false,
    'same-version modified package must not inherit the old digest grant');
  await api.storage.local.set({'opendesk.sidebar-tools.installed.v1':[]});
  await host.synchronize();
  assert.equal(menus.size,2,'uninstall must remove only owned tool menu IDs');
  assert.equal((await api.storage.local.get(BROWSER_MENU_GRANTS_STORE))[BROWSER_MENU_GRANTS_STORE]?.[sample.id]?.version,sample.version,
    'actual installer handles durable grant cleanup, not menu sync');
});
test('denied Chrome permission and untrusted sender never create site menus',async()=>{
  const sample=await readSample('selection-notes.opendesk-tool.json'),fake=makeChrome();
  await fake.api.storage.local.set({'opendesk.sidebar-tools.installed.v1':[sample]});
  const host=createContextMenuHost({api:fake.api,lockManager,logger:{warn(){}}});
  await assert.rejects(host.handleHost({operation:'browser.contextMenu.userToggle',toolId:sample.id,
    enabled:true,origin:'https://example.com',hostInstanceId:uid,
    document:{tabId:9,documentId:'document-A',url:'https://example.com/post'}},sender),
    {code:'E_CHROME_PERMISSION_REQUIRED'});
  await assert.rejects(host.handleTool({operation:'browser.capabilities.list',args:{},...hostContext},
    {...sender,id:'evil-extension'}),{code:'E_OWNER'});
});
