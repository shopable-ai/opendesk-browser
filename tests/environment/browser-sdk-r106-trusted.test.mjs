import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserHistoryHost,normalizeTrustedHistoryQuery} from '../../src/platform/chrome/history.js';
import {createToolPermissionConsent,requestForTool,trustedToolPermissionRequest} from '../../src/platform/chrome/permission-gate.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';

const EXT='trusted-extension';
const HOST='host-instance-00000000-0000-4000-8000-000000000000';
const URL=`chrome-extension://${EXT}/ui/tool.html?hostInstanceId=${HOST}`;
const sender=()=>({id:EXT,url:URL,frameId:0,documentId:'side-panel-doc',documentLifecycle:'active'});
const context=()=>({contextType:'SIDE_PANEL',documentUrl:URL,documentId:'side-panel-doc',frameId:0,incognito:false});
const boundedQuery={text:'term',startTime:100,endTime:3000};

function historyApi({permission=true,contexts=[context()],rows=[]}={}){
  const calls=[];
  return {calls,api:{runtime:{id:EXT,getURL:path=>`chrome-extension://${EXT}/${path}`,
    getContexts:async query=>{calls.push(['getContexts',query]);return contexts;}},
    permissions:{contains:async request=>{calls.push(['contains',request]);return permission&&request.permissions?.includes('history');}},
    history:{search:async query=>{calls.push(['history.search',query]);return rows;}}}};
}

const bookmarkTool=()=>({
  format:'opendesk.sidebar-tool.v2',
  id:'bookmark-tool',
  version:'1.0.0',
  title:'Bookmark Tool',
  description:'Requests bookmark permission through trusted UI',
  capabilities:['browser.bookmarks'],
  html:'<button>Save</button>',
  css:'',
  js:'console.log("bookmark tool");',
  requires:{browserSdk:'1.0.0'},
  contributes:{contextMenus:[]}
});

function permissionApi({tool=bookmarkTool(),epoch='epoch-1',contexts=[context()]}={}){
  const calls=[],granted=new Set(),store={
    [SIDEBAR_TOOL_STORE]:[tool],
    [TOOL_REVOCATION_EPOCHS_STORE]:{[tool.id]:epoch},
    [SIDEBAR_TOOL_ENABLE_STORE]:{[tool.id]:true}
  };
  const get=async keys=>{
    calls.push(['storage.get',keys]);
    const selected={};
    for(const key of Array.isArray(keys)?keys:[keys])selected[key]=store[key];
    return selected;
  };
  return {calls,granted,store,api:{runtime:{id:EXT,getURL:path=>`chrome-extension://${EXT}/${path}`,
    getContexts:async query=>{calls.push(['getContexts',query]);return contexts;}},
    storage:{local:{get}},
    permissions:{request(request){calls.push(['request',structuredClone(request)]);
      request.permissions.forEach(value=>granted.add(value));
      request.origins?.forEach(value=>granted.add(value));
      return Promise.resolve(true);},
      contains:async request=>{calls.push(['contains',request]);
        return [...(request.permissions||[]),...(request.origins||[])].every(value=>granted.has(value));}}}};
}

test('trusted history search validates Side Panel sender, permission and redacts fields',async()=>{
  const f=historyApi({rows:[
    {url:'https://example.com/path',title:'Readable title',lastVisitTime:1234,visitCount:99,typedCount:3},
    {url:'chrome://history',title:'native',lastVisitTime:999},
    {url:'https://second.example/',title:'x'.repeat(300),lastVisitTime:2000}
  ]});
  const host=createBrowserHistoryHost({api:f.api});
  const result=await host.searchTrusted({text:'example',startTime:100,endTime:3000,limit:2},
    {sender:sender(),hostInstanceId:HOST});
  assert.deepEqual(result,{visits:[
    {url:'https://example.com/path',title:'Readable title',lastVisitTime:1234},
    {url:'https://second.example/',title:'x'.repeat(256),lastVisitTime:2000}
  ]});
  assert.deepEqual(f.calls.filter(([name])=>name==='history.search'),[
    ['history.search',{text:'example',startTime:100,endTime:3000,maxResults:2}]
  ]);
  assert.equal(f.calls.filter(([name])=>name==='contains').length,2);
  assert.equal(f.calls.filter(([name])=>name==='getContexts').length,2);
});

test('trusted history search rejects forged sender, missing permission and unsafe query',async()=>{
  assert.deepEqual(normalizeTrustedHistoryQuery(boundedQuery),{...boundedQuery,maxResults:25});
  assert.throws(()=>normalizeTrustedHistoryQuery({text:'term'}),{code:'E_SCHEMA'});
  assert.throws(()=>normalizeTrustedHistoryQuery({...boundedQuery,endTime:32*86400000}),{code:'E_SCHEMA'});
  assert.throws(()=>normalizeTrustedHistoryQuery({text:' term '}),{code:'E_SCHEMA'});
  assert.throws(()=>normalizeTrustedHistoryQuery({text:'term',limit:101}),{code:'E_SCHEMA'});
  assert.throws(()=>normalizeTrustedHistoryQuery({text:'term',startTime:20,endTime:10}),{code:'E_SCHEMA'});
  await assert.rejects(createBrowserHistoryHost({api:historyApi().api})
    .searchTrusted(boundedQuery,{sender:{...sender(),id:'foreign'},hostInstanceId:HOST}),{code:'E_OWNER'});
  await assert.rejects(createBrowserHistoryHost({api:historyApi({permission:false}).api})
    .searchTrusted(boundedQuery,{sender:sender(),hostInstanceId:HOST}),{code:'E_CHROME_PERMISSION_REQUIRED'});
  await assert.rejects(createBrowserHistoryHost({api:historyApi({contexts:[]}).api})
    .searchTrusted(boundedQuery,{sender:sender(),hostInstanceId:HOST}),{code:'E_DOCUMENT_CHANGED'});
  const unavailable=historyApi();delete unavailable.api.runtime.getContexts;
  await assert.rejects(createBrowserHistoryHost({api:unavailable.api})
    .searchTrusted(boundedQuery,{sender:sender(),hostInstanceId:HOST}),{code:'E_SERVICE_UNSUPPORTED'});
});

test('permission request for tool starts synchronously from trusted click and verifies final state',async()=>{
  const f=permissionApi(),consent=createToolPermissionConsent({api:f.api});
  const prepared=await consent.prepare({toolId:'bookmark-tool',capability:'browser.bookmarks.create',origin:'https://example.com'});
  assert.equal(prepared.toolVersion,'1.0.0');
  assert.match(prepared.packageHash,/^[a-f0-9]{64}$/);
  assert.equal(prepared.installEpoch,'epoch-1');
  assert.equal(prepared.toolCapability,'browser.bookmarks');
  assert.deepEqual(prepared.request,{permissions:['bookmarks'],origins:['https://example.com/*']});
  f.calls.length=0;
  const pending=consent.requestForTool({isTrusted:true},prepared,{sender:sender(),hostInstanceId:HOST});
  assert.deepEqual(f.calls,[['request',{permissions:['bookmarks'],origins:['https://example.com/*']}]],
    'chrome.permissions.request must start before any awaited context or contains check');
  assert.deepEqual(await pending,{granted:true,scope:'https://example.com'});
  assert.equal(f.calls.some(([name])=>name==='storage.get'),true);
  assert.equal(f.calls.some(([name])=>name==='getContexts'),true);
  assert.equal(f.calls.some(([name])=>name==='contains'),true);
});

test('permission request for tool rejects untrusted callers and unknown capability',async()=>{
  assert.deepEqual(trustedToolPermissionRequest({toolId:'bookmark-tool',capability:'browser.bookmarks'}),
    {permissions:['bookmarks']});
  assert.throws(()=>trustedToolPermissionRequest({toolId:'bad_tool',capability:'history'}),{code:'E_SCHEMA'});
  assert.throws(()=>trustedToolPermissionRequest({toolId:'history-tool',capability:'cookies'}),{code:'E_SCHEMA'});
  assert.throws(()=>trustedToolPermissionRequest({toolId:'history-tool',capability:'history'}),{code:'E_SCHEMA'});
  assert.throws(()=>trustedToolPermissionRequest({toolId:'bookmark-tool',capability:'browser.bookmarks',origin:'https://example.com/path'}),{code:'E_SCHEMA'});
  const f=permissionApi(),prepared=await createToolPermissionConsent({api:f.api})
    .prepare({toolId:'bookmark-tool',capability:'browser.bookmarks'});
  f.calls.length=0;
  await assert.rejects(requestForTool({api:f.api,event:{isTrusted:false},sender:sender(),
    prepared}),{code:'E_USER_GESTURE_REQUIRED'});
  await assert.rejects(requestForTool({api:f.api,event:{isTrusted:true},sender:{...sender(),documentId:''},
    prepared}),{code:'E_OWNER'});
  assert.equal(f.calls.length,0);
});

test('permission request for tool fails closed when package identity changes after Chrome prompt',async()=>{
  const f=permissionApi(),consent=createToolPermissionConsent({api:f.api});
  const prepared=await consent.prepare({toolId:'bookmark-tool',capability:'browser.bookmarks'});
  f.calls.length=0;
  const pending=consent.requestForTool({isTrusted:true},prepared,{sender:sender(),hostInstanceId:HOST});
  assert.deepEqual(f.calls,[['request',{permissions:['bookmarks']}]],
    'native prompt is still started synchronously from the prepared trusted click');
  f.store[TOOL_REVOCATION_EPOCHS_STORE]={'bookmark-tool':'epoch-2'};
  await assert.rejects(pending,{code:'E_TOOL_CHANGED'});
});

test('permission preparation requires installed tool capability and exact identity',async()=>{
  const noCapability=bookmarkTool();
  noCapability.capabilities=['user.export'];
  await assert.rejects(createToolPermissionConsent({api:permissionApi({tool:noCapability}).api})
    .prepare({toolId:'bookmark-tool',capability:'browser.bookmarks'}),{code:'E_TOOL_CAPABILITY_REQUIRED'});
  await assert.rejects(createToolPermissionConsent({api:permissionApi().api})
    .prepare({toolId:'bookmark-tool',toolVersion:'2.0.0',capability:'browser.bookmarks'}),{code:'E_TOOL_CHANGED'});
  const disabled=permissionApi();
  disabled.store[SIDEBAR_TOOL_ENABLE_STORE]={'bookmark-tool':false};
  await assert.rejects(createToolPermissionConsent({api:disabled.api})
    .prepare({toolId:'bookmark-tool',capability:'browser.bookmarks'}),{code:'E_TOOL_DISABLED'});
});
