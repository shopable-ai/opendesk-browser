import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCookieAccountService} from '../trusted/account-service.js';
import {COOKIE_ACCOUNT_PROTOCOL,COOKIE_ACCOUNT_STORE_KEY} from '../trusted/account-contract.js';
import {COOKIE_SERVICE_CONNECTIONS_KEY} from '../trusted/service-connections.js';
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash,serializeSidebarToolPackage,validateSidebarToolPackage}
  from '../../../../src/ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE} from '../../../../src/ui/sidebar-tools/lifecycle.js';
import {MARKET_PROVENANCE_STORE} from '../../../../src/sidebar-tools/official-reading-toc.js';

// Only external browser/catalog/storage boundaries are substituted. These
// tests execute the original fixed account service and Foundation transaction.
async function fixture(t,{serviceTransport}={}){
  const origin='https://shop.example.com';
  const tool=validateSidebarToolPackage({format:'opendesk.sidebar-tool.v2',id:'cookie-editor',
    version:'1.0.0',title:'Cookie Editor',description:'Service connection boundary fixture',
    capabilities:['browser.cookies.read','browser.cookies.values','browser.cookies.write'],
    requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},html:'<main></main>',css:'',js:'void 0;'});
  const bytes=Buffer.from(serializeSidebarToolPackage(tool)),hash=await sidebarToolPackageHash(tool);
  const release={id:'opendesk/cookie-editor',toolId:tool.id,kind:'sidebar-tool',installationPolicy:'optional',
    version:tool.version,packageTitle:tool.title,description:tool.description,capabilities:tool.capabilities,
    packagePath:'official-tools/cookie-editor/cookie-editor.opendesk-tool.json',bytes:bytes.length,
    sha256:createHash('sha256').update(bytes).digest('hex')};
  t.mock.method(globalThis,'fetch',async url=>{
    assert.equal(url,'chrome-extension://test/official-tools/catalog.json');
    return {ok:true,json:async()=>({schema:'opendesk.official-tools.releases.v1',
      sourceRepository:'https://github.com/shopable-ai/opendesk-browser',apps:[release]})};
  });
  const state={[SIDEBAR_TOOL_STORE]:[tool],[TOOL_REVOCATION_EPOCHS_STORE]:{'cookie-editor':'epoch'},
    [MARKET_PROVENANCE_STORE]:{'cookie-editor':{marketId:release.id,version:tool.version,sha256:release.sha256}}};
  const account={alias:'acct_local_1',origin,displayName:'工作账号',version:1,allowAuto:false,
    cookies:[{name:'sid',value:'PRIVATE_COOKIE_NEVER_FOR_UI'}]};
  const records=new Map([[COOKIE_ACCOUNT_STORE_KEY,{format:1,revision:1,legacyMigrated:false,
    accounts:[account],settings:{autoEnabled:false,autoRefresh:true}}]]);
  let beforePut=()=>{};
  const storage=async()=>({transaction:async(_tables,mode,work)=>{
    const next=structuredClone(records);
    const result=await work({get:(_table,key)=>structuredClone(next.get(key)),
      put:(_table,value,key)=>{beforePut();next.set(key,structuredClone(value));},
      delete:(_table,key)=>next.delete(key)});
    if(mode==='readwrite'){records.clear();for(const [key,value] of next)records.set(key,value);}
    return result;
  }});
  const sender={id:'test',url:'chrome-extension://test/sidepanel.html?hostInstanceId=00000000-0000-4000-8000-000000000000&toolId=cookie-editor',
    documentId:'host-doc',frameId:0};
  const document={tabId:1,documentId:'site-doc',url:origin+'/'};
  const forbidden=()=>assert.fail('No Cookie/Native/network navigation permitted for connection metadata');
  const api={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,
    getContexts:async()=>[{contextType:'SIDE_PANEL',documentUrl:sender.url,documentId:sender.documentId,frameId:0,incognito:false}],
    connectNative:forbidden,sendNativeMessage:forbidden},
    storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys])
      .filter(key=>Object.hasOwn(state,key)).map(key=>[key,structuredClone(state[key])]))}},
    tabs:{get:async()=>({id:1,url:document.url,active:true,incognito:false}),create:forbidden,update:forbidden},
    webNavigation:{getFrame:async()=>({...document,documentLifecycle:'active'})},
    cookies:{getAll:forbidden,set:forbidden,remove:forbidden},permissions:{request:forbidden}};
  const service=createCookieAccountService({api,storage,serviceTransport});
  const send=(operation,payload={},extra={})=>service.dispatch({protocol:COOKIE_ACCOUNT_PROTOCOL,
    toolId:'cookie-editor',operation,packageHash:hash,installEpoch:'epoch',trustedClick:true,
    payload:{origin,...payload},...extra},sender);
  return {send,records,state,document,sender,service,api,setBeforePut:fn=>{beforePut=fn;}};
}
test('fixed Host service persists configuration and scoped association without Cookie or Native effects',async t=>{
  const f=await fixture(t);
  const saved=await f.send('serviceSave',{revision:0,label:'本机',mode:'local',serviceOrigin:''});
  const result=await f.send('serviceAssociate',{revision:1,connectionId:saved.connections[0].id,
    alias:'acct_local_1',accountVersion:1,remoteAccountId:'codex_local_01',organization:'本机用户',providerKey:'codex',document:f.document});
  assert.equal(result.associations[0].verification,'UNVERIFIED');
  assert.equal(result.associations[0].status,'PENDING_CONNECTION');
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_COOKIE|cookies|pairingCode|accessToken/);
  const accountsBefore=structuredClone(f.records.get(COOKIE_ACCOUNT_STORE_KEY));
  assert.deepEqual(await f.send('serviceStatus'),result);
  await f.service.cleanup();
  assert.equal(f.records.has(COOKIE_SERVICE_CONNECTIONS_KEY),false);
  assert.equal(f.records.has(COOKIE_ACCOUNT_STORE_KEY),false);
  assert.equal(accountsBefore.accounts[0].cookies[0].value,'PRIVATE_COOKIE_NEVER_FOR_UI');
});
test('sender, installation, user gesture and Document protections remain authoritative',async t=>{
  const f=await fixture(t),payload={revision:0,label:'本机',mode:'local',serviceOrigin:''};
  await assert.rejects(f.send('serviceSave',payload,{trustedClick:false}),{code:'E_USER_GESTURE_REQUIRED'});
  await assert.rejects(f.send('serviceSave',payload,{installEpoch:'stale'}),{code:'E_TOOL_CHANGED'});
  const saved=await f.send('serviceSave',payload);
  await assert.rejects(f.send('serviceAssociate',{revision:1,connectionId:saved.connections[0].id,
    alias:'acct_local_1',accountVersion:1,remoteAccountId:'codex_local_01',organization:'本机',providerKey:'codex',
    document:{...f.document,documentId:'old-doc'}}),{code:'E_DOCUMENT_CHANGED'});
  await assert.rejects(f.service.dispatch({protocol:COOKIE_ACCOUNT_PROTOCOL,toolId:'cookie-editor',
    operation:'serviceStatus',payload:{}},{...f.sender,id:'website'}),{code:'E_ACCOUNT_SENDER'});
  assert.equal(f.records.get(COOKIE_SERVICE_CONNECTIONS_KEY).revision,1);
});
test('revocation during metadata commit produces unknown and cannot return a late success',async t=>{
  const f=await fixture(t);
  f.setBeforePut(()=>{f.state[TOOL_REVOCATION_EPOCHS_STORE]['cookie-editor']='revoked';});
  await assert.rejects(f.send('serviceSave',{revision:0,label:'本机',mode:'local',serviceOrigin:''}),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.records.get(COOKIE_SERVICE_CONNECTIONS_KEY).revision,1);
});
test('Native service actions remain fenced by actual sender, installed epoch and user gesture',async t=>{
  let calls=0;
  const f=await fixture(t,{serviceTransport:()=>({state:()=>({supported:true,connected:true,services:[]}),request:async()=>{calls++;throw Error('must not dispatch');}})});
  const payload={revision:0,connectionId:'conn_1',serviceId:'ai-account-usage',providerEpoch:'provider_1'};
  await assert.rejects(f.send('serviceConnect',payload,{trustedClick:false}),{code:'E_USER_GESTURE_REQUIRED'});
  await assert.rejects(f.send('serviceConnect',payload,{installEpoch:'old'}),{code:'E_TOOL_CHANGED'});
  await assert.rejects(f.service.dispatch({protocol:COOKIE_ACCOUNT_PROTOCOL,toolId:'cookie-editor',operation:'serviceConnect',payload},
    {...f.sender,id:'website'}),{code:'E_ACCOUNT_SENDER'});
  assert.equal(calls,0);assert.equal(f.records.has(COOKIE_SERVICE_CONNECTIONS_KEY),false);
});
