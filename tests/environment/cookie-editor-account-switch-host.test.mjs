import test from 'node:test';
import assert from 'node:assert/strict';
import {COOKIE_ACCOUNT_PROTOCOL,COOKIE_ACCOUNT_OPERATIONS,
  COOKIE_ACCOUNT_STORE_KEY,COOKIE_ACCOUNT_VAULT_KEY,COOKIE_ACCOUNT_SESSION_KEY,COOKIE_ACCOUNT_SEEN_KEY}
  from '../../examples/sidebar-tools/cookie-editor/trusted/account-contract.js';
import {planAccountCookieEffects,validateAccountCookieRow,
  sameAccountAutoSwitchAttempt,autoSwitchFenceBlocks,sameAccountAutoSwitchFence,
  createCookieAccountService,installCookieAccountService,inspectAccountSnapshotUpdate}
  from '../../examples/sidebar-tools/cookie-editor/trusted/account-service.js';
import {readFile} from 'node:fs/promises';
import {COOKIE_SHARE_STORAGE_KEY} from '../../examples/sidebar-tools/cookie-editor/trusted/account-share.js';
import {createDeviceKeyStorage} from '../../src/platform/storage/device-keys.js';
import {createCookieSessionCrypto} from '../../examples/sidebar-tools/cookie-editor/trusted/account-session-crypto.js';

const original=(overrides={})=>({
  name:'demo',value:'fiction',domain:'example.com',path:'/',
  storeId:'0',hostOnly:true,session:true,secure:true,httpOnly:true,
  sameSite:'lax',...overrides
});

test('automatic fence readback accepts reordered keys but rejects changed or incomplete receipts',()=>{
  const expected={url:'https://example.com/#od-account=acct_one',
    alias:'acct_one',version:2,phase:'in_flight'};
  const reordered=Object.fromEntries(Object.entries(expected).reverse());
  assert.equal(sameAccountAutoSwitchFence(reordered,expected),true);
  for(const field of Object.keys(expected)){
    const missing={...reordered};delete missing[field];
    assert.equal(sameAccountAutoSwitchFence(missing,expected),false);
    assert.equal(sameAccountAutoSwitchFence({...reordered,[field]:'changed'},expected),false);
  }
  for(const receipt of [null,[],{...reordered,extra:true}])
    assert.equal(sameAccountAutoSwitchFence(receipt,expected),false);
  assert.equal(autoSwitchFenceBlocks(reordered,{...expected,alias:'acct_two'}),true);
});

test('native Cookie switch plan is deterministic, exact and idempotent',()=>{
  const current=[original(),original({name:'theme',value:'light'})];
  assert.deepEqual(planAccountCookieEffects(current,current),[]);
  const desired=[original({value:'other'})];
  const actions=planAccountCookieEffects(current,desired);
  assert.deepEqual(actions.map(row=>[row.kind,row.row.name]),
    [['remove','theme'],['set','demo']]);
  assert.deepEqual(planAccountCookieEffects(desired,desired),[]);
  assert.deepEqual(planAccountCookieEffects([],desired),[{kind:'set',row:desired[0]}]);
});

test('Cookie name, path, Store and Partition remain independent in an operation plan',()=>{
  const base=original();
  const partition={topLevelSite:'https://example.com',hasCrossSiteAncestor:false};
  const current=[base,original({path:'/account'}),
    original({storeId:'1'}),original({partitionKey:partition})];
  const future=[base,original({path:'/account',value:'updated'})];
  const plan=planAccountCookieEffects(current,future);
  assert.deepEqual(plan.filter(item=>item.kind==='remove').map(item=>item.row.storeId),
    ['1','0']);
  assert.equal(plan.filter(item=>item.kind==='set').length,1);
  assert.equal(plan.find(item=>item.kind==='set')?.row.path,'/account');
});

test('one private Host protocol has no raw Cookie or key RPC',async()=>{
  assert.equal(COOKIE_ACCOUNT_PROTOCOL,'opendesk.cookie-accounts.v1');
  assert.equal(new Set(COOKIE_ACCOUNT_OPERATIONS).size,COOKIE_ACCOUNT_OPERATIONS.length);
  assert.ok(COOKIE_ACCOUNT_OPERATIONS.includes('status'));
  assert.ok(COOKIE_ACCOUNT_OPERATIONS.includes('switch'));
  for(const operation of ['readValue','unlock','lock','cleanup','clear'])
    assert.ok(!COOKIE_ACCOUNT_OPERATIONS.includes(operation));
  assert.equal(new Set([COOKIE_ACCOUNT_STORE_KEY,COOKIE_ACCOUNT_VAULT_KEY,COOKIE_ACCOUNT_SESSION_KEY,
    COOKIE_ACCOUNT_SEEN_KEY]).size,4);
  const [host,worker,app]=await Promise.all([
    readFile(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8'),
    readFile(new URL('../../src/sw.js',import.meta.url),'utf8'),
    readFile(new URL('../../examples/sidebar-tools/cookie-editor/app/CookieEditorApp.jsx',
      import.meta.url),'utf8')
  ]);
  assert.match(host,/COOKIE_ACCOUNT_PROTOCOL/);
  assert.match(host,/verifiedGesture/);
  assert.match(worker,/installCookieAccountService/);
  assert.doesNotMatch(app,/accounts=\{\[\]\}|vaultReady=\{false\}|switchReady=\{false\}/);
  assert.doesNotMatch(app,/chrome\.cookies|localStorage|sessionStorage/);
});

test('trusted validator accepts ordinary Cookie names and URL Paths',()=>{
  for(const name of ['session_id','csrftoken','locale','id2']){
    for(const path of ['/','/account','/orders','/profile/settings']){
      const row=original({name,path});
      assert.deepEqual(validateAccountCookieRow(row,'example.com','0'),row);
    }
  }
});

test('trusted validator rejects Cookie-name separators, whitespace and controls',()=>{
  for(const name of ['bad name','bad\tname','bad\rname','bad\nname',
    'bad;name','bad=name','bad\0name','bad\x7fname']){
    assert.throws(()=>validateAccountCookieRow(original({name}),
      'example.com','0'),{code:'E_ACCOUNT_COOKIE_SCOPE'});
  }
});

test('trusted validator rejects invalid Paths, changes of scope and prefixes',()=>{
  for(const path of ['orders','/bad;path','/bad\r','/bad\n','/bad\t',
    '/bad\0','/bad\x7f']){
    assert.throws(()=>validateAccountCookieRow(original({path}),
      'example.com','0'),{code:'E_ACCOUNT_COOKIE_SCOPE'});
  }
  for(const row of [
    original({domain:'evil.example'}),
    original({storeId:'1'}),
    original({partitionKey:{topLevelSite:'https://elsewhere.example'}}),
    original({name:'__Secure-auth',secure:false}),
    original({name:'__Host-auth',path:'/account'}),
    original({sameSite:'no_restriction',secure:false}),
    original({session:false,expirationDate:1})
  ])assert.throws(()=>validateAccountCookieRow(row,'example.com','0'),
    {code:'E_ACCOUNT_COOKIE_SCOPE'});
});

test('trusted auto-switch fence never replays the same old URL after TTL expiry',()=>{
  const target={url:'https://example.com/#od-account=acct_example',
    alias:'acct_example',version:2};
  for(const phase of ['in_flight','applied']){
    // Existing sessions may already contain a legacy expiresAt field.
    const previous={...target,phase,expiresAt:1};
    assert.equal(sameAccountAutoSwitchAttempt(previous,target),true);
  }
  assert.equal(sameAccountAutoSwitchAttempt(null,target),false);
  assert.equal(sameAccountAutoSwitchAttempt(
    {...target,phase:'in_flight'}, {...target,version:3}),false);
  assert.equal(sameAccountAutoSwitchAttempt(
    {...target,phase:'applied'}, {...target,alias:'acct_other'}),false);
  assert.equal(sameAccountAutoSwitchAttempt(
    {...target,phase:'applied'}, {...target,url:'https://example.com/'}),false);
});

test('trusted cookie prefixes require exact Secure and HttpOnly properties',()=>{
  for(const name of ['__Http-auth','__Host-Http-auth']){
    assert.equal(validateAccountCookieRow(original({name}), 'example.com','0').name,name);
    for(const patch of [{secure:false},{httpOnly:false}]){
      assert.throws(()=>validateAccountCookieRow(original({name,...patch}),
        'example.com','0'),{code:'E_ACCOUNT_COOKIE_SCOPE'});
    }
  }
  assert.throws(()=>validateAccountCookieRow(
    original({name:'__Host-Http-auth',path:'/account'}),
    'example.com','0'),{code:'E_ACCOUNT_COOKIE_SCOPE'});
});

test('uncertain automatic Cookie effect blocks a different alias until manual recovery',()=>{
  const prior={url:'https://example.com/#od-account=acct_one',
    alias:'acct_one',version:1,phase:'in_flight'};
  const target={url:'https://example.com/#od-account=acct_two',
    alias:'acct_two',version:1};
  assert.equal(autoSwitchFenceBlocks(prior,target),true);
  assert.equal(autoSwitchFenceBlocks({...prior,phase:'applied'},target),false);
  assert.equal(autoSwitchFenceBlocks(null,target),false);
});

// Exercise the fixed SW entry with an inert reviewed package and exact site grant.
// No sandbox/React code or shared Host implementation is replaced by this fixture.
import {createHash} from 'node:crypto';
import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage,serializeSidebarToolPackage,sidebarToolPackageHash}
  from '../../src/ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {MARKET_PROVENANCE_STORE} from '../../src/sidebar-tools/official-reading-toc.js';
import {BROWSER_MENU_GRANTS_STORE} from '../../src/framework/sdk/browser-contract.js';
async function serviceFixture(t){
  const tool=validateSidebarToolPackage({format:'opendesk.sidebar-tool.v2',id:'cookie-editor',
    version:'1.0.0',title:'Cookie Editor',description:'Trusted account service test',
    capabilities:['browser.cookies.read','browser.cookies.values','browser.cookies.write'],
    requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},html:'<main></main>',css:'',js:'void 0;'});
  const bytes=Buffer.from(serializeSidebarToolPackage(tool)),hash=await sidebarToolPackageHash(tool);
  const release={id:'opendesk/cookie-editor',toolId:tool.id,kind:'sidebar-tool',
    installationPolicy:'optional',version:tool.version,packageTitle:tool.title,
    description:tool.description,capabilities:tool.capabilities,
    packagePath:'official-tools/cookie-editor/cookie-editor.opendesk-tool.json',
    bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  const catalog={schema:'opendesk.official-tools.releases.v1',
    sourceRepository:'https://github.com/shopable-ai/opendesk-browser',apps:[release]};
  const priorFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    assert.equal(url,'chrome-extension://test/official-tools/catalog.json');
    return {ok:true,json:async()=>structuredClone(catalog)};
  };
  t.after(()=>{globalThis.fetch=priorFetch;});
  const origin='https://example.com',document={tabId:1,documentId:'site-doc',url:origin+'/'};
  const state={
    [SIDEBAR_TOOL_STORE]:[tool],[TOOL_REVOCATION_EPOCHS_STORE]:{'cookie-editor':'epoch'},
    [MARKET_PROVENANCE_STORE]:{'cookie-editor':{marketId:release.id,version:tool.version,sha256:release.sha256}},
    [BROWSER_MENU_GRANTS_STORE]:{'cookie-editor':{version:tool.version,packageHash:hash,installEpoch:'epoch',
      cookieSites:{[origin]:{read:true,values:true,write:true,grantEpoch:'grant',storeId:'0'}}}}
  };
  const records=new Map();let queue=Promise.resolve();
  const storage=async()=>({transaction(stores,mode,work){
    const run=queue.then(async()=>{
      assert.deepEqual(stores,['frameworkKV']);
      const next=structuredClone(records);
      const result=await work({
        async get(store,key){assert.equal(store,'frameworkKV');return structuredClone(next.get(key));},
        async put(store,value,key){assert.equal(store,'frameworkKV');assert.equal(mode,'readwrite');next.set(key,structuredClone(value));},
        async delete(store,key){assert.equal(store,'frameworkKV');assert.equal(mode,'readwrite');next.delete(key);}
      });
      if(mode==='readwrite'){records.clear();for(const [key,value] of next)records.set(key,value);}
      return result;
    });queue=run.catch(()=>{});return run;
  }});
  let permitted=true,cookie=original(),writes=0;
  const sender={id:'test',url:'chrome-extension://test/sidepanel.html?hostInstanceId=00000000-0000-4000-8000-000000000000&toolId=cookie-editor',documentId:'host-doc',frameId:0};
  const api={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,
    getContexts:async()=>[{contextType:'SIDE_PANEL',documentUrl:sender.url,
      documentId:'host-doc',frameId:0,incognito:false}]},
    storage:{local:{
      setAccessLevel:async()=>{assert.fail('must not change shared Chrome local access');},
      get:async keys=>{
        const list=Array.isArray(keys)?keys:[keys];
        assert.equal(list.includes(COOKIE_ACCOUNT_STORE_KEY),false);
        return structuredClone(Object.fromEntries(list.filter(key=>Object.hasOwn(state,key)).map(key=>[key,state[key]])));
      },
      set:async()=>{assert.fail('must not write accounts to Chrome local');}
    }},
    permissions:{contains:async()=>permitted},
    tabs:{get:async()=>({id:1,url:document.url,active:true,incognito:false}),reload:async()=>{}},
    webNavigation:{getFrame:async()=>({...document,documentLifecycle:'active'})},
    cookies:{
      getAllCookieStores:async()=>[{id:'0',tabIds:[1]}],
      getPartitionKey:async()=>({partitionKey:{topLevelSite:origin,hasCrossSiteAncestor:false}}),
      getAll(details,callback){const rows=cookie?[structuredClone(cookie)]:[];if(callback)callback(rows);else return Promise.resolve(rows);},
      remove(){writes++;assert.fail('snapshot capture must not remove native Cookies');},
      set(details,callback){writes++;cookie=original({value:details.value});callback(structuredClone(cookie));}
    }};
  const message=(operation,payload={})=>({protocol:COOKIE_ACCOUNT_PROTOCOL,toolId:'cookie-editor',
    operation,packageHash:hash,installEpoch:'epoch',trustedClick:true,payload:{origin,document,...payload}});
  return {api,state,records,storage,sender,message,document,
    dispatch:(operation,payload)=>createCookieAccountService({api,storage}).dispatch(message(operation,payload),sender),
    setCookie:value=>{cookie=value===null?null:original({value});},
    revoke:()=>{permitted=false;},writes:()=>writes};
}

test('removed password operations reject at the SW protocol boundary',async()=>{
  const service=createCookieAccountService({api:{}});
  for(const operation of ['unlock','lock','cleanup','clear'])await assert.rejects(service.dispatch({
    protocol:COOKIE_ACCOUNT_PROTOCOL,toolId:'cookie-editor',operation,payload:{}},{}),
  {code:'E_ACCOUNT_REQUEST'});
});

test('share operations retain the exact trusted sender and original-click boundary',async t=>{
  const f=await serviceFixture(t),service=createCookieAccountService({api:f.api,storage:f.storage});
  for(const operation of COOKIE_ACCOUNT_OPERATIONS.filter(x=>x.startsWith('share'))){
    const message=f.message(operation,{});message.trustedClick=false;
    await assert.rejects(service.dispatch(message,f.sender),{code:'E_USER_GESTURE_REQUIRED'});
    message.trustedClick=true;
    await assert.rejects(service.dispatch(message,{...f.sender,url:'https://example.com/'}),{code:'E_ACCOUNT_SENDER'});
    await assert.rejects(service.dispatch({...message,installEpoch:'retired'},f.sender),{code:'E_TOOL_CHANGED'});
  }
  assert.equal(f.writes(),0);
});

test('session sharing rejects a removed or renewed site grant before relay access',async t=>{
  for(const change of ['removed','renewed']){
    await t.test(change,async t=>{
      const f=await serviceFixture(t),get=f.api.storage.local.get;let reads=0;
      f.api.storage.local.get=async keys=>{
        if(++reads===2){
          const site=f.state[BROWSER_MENU_GRANTS_STORE]['cookie-editor'].cookieSites['https://example.com'];
          if(change==='removed')delete f.state[BROWSER_MENU_GRANTS_STORE]['cookie-editor'].cookieSites['https://example.com'];
          else site.grantEpoch='renewed-grant';
        }
        return get(keys);
      };
      await assert.rejects(f.dispatch('sharePairs',{ref:'not-read-before-site-check'}),
        {code:'E_SITE_GRANT_REQUIRED'});
      assert.equal(f.writes(),0);
    });
  }
});

test('SW saves directly at revision zero and switches after service restart with metadata-only receipts',async t=>{
  const f=await serviceFixture(t);
  assert.equal((await f.dispatch('status')).unlocked,true);
  const saved=await f.dispatch('create',{revision:0,displayName:'示例账号'});
  assert.equal(saved.revision,1);assert.equal(saved.accounts.length,1);
  assert.equal(saved.accounts[0].cookieCount,1);
  assert.deepEqual(saved.currentSnapshot,{alias:saved.accounts[0].alias,version:1,
    revision:1,document:f.document});
  assert.equal(Object.hasOwn(await f.dispatch('status'),'currentSnapshot'),false);
  assert.doesNotMatch(JSON.stringify(saved),/fiction|cookies|ciphertext|key/);
  const alias=saved.accounts[0].alias;
  assert.equal(f.records.get(COOKIE_ACCOUNT_STORE_KEY).accounts[0].cookies[0].value,'fiction');
  f.setCookie('different-current-session');
  const switched=await f.dispatch('switch',{revision:1,alias});
  assert.equal(switched.switched,true);assert.equal(switched.verified,true);
  assert.equal(f.writes(),1);
  await assert.rejects(f.dispatch('rename',{revision:1,alias,accountVersion:99,displayName:'错误'}),
    {code:'E_VAULT_CONFLICT'});
  const forged=f.message('create',{revision:1,displayName:'无点击'});forged.trustedClick=false;
  await assert.rejects(createCookieAccountService({api:f.api,storage:f.storage}).dispatch(forged,f.sender),
    {code:'E_USER_GESTURE_REQUIRED'});
  f.revoke();
  await assert.rejects(f.dispatch('switch',{revision:1,alias}),{code:'E_SITE_GRANT_REQUIRED'});
  assert.equal(f.writes(),1);
  f.state[TOOL_REVOCATION_EPOCHS_STORE]['cookie-editor']='new-epoch';
  await assert.rejects(f.dispatch('status'),{code:'E_TOOL_CHANGED'});
});


test('a verified manual recovery allows a different automatic URL but never replays the unresolved URL',async t=>{
  const f=await serviceFixture(t),session={};
  f.api.storage.session={
    setAccessLevel:async value=>assert.deepEqual(value,{accessLevel:'TRUSTED_CONTEXTS'}),
    get:async key=>structuredClone({[key]:session[key]}),
    set:async values=>Object.assign(session,structuredClone(values))
  };
  let service=createCookieAccountService({api:f.api,storage:f.storage});
  const dispatch=(operation,payload)=>service.dispatch(f.message(operation,payload),f.sender);
  f.setCookie('account-a');
  const a=(await dispatch('create',{revision:0,displayName:'A'})).accounts[0];
  f.setCookie('account-b');
  const b=(await dispatch('create',{revision:1,displayName:'B'})).accounts[1];
  await dispatch('allowAlias',{revision:2,alias:a.alias,accountVersion:1,enabled:true});
  await dispatch('allowAlias',{revision:3,alias:b.alias,accountVersion:1,enabled:true});
  await dispatch('setAutoEnabled',{revision:4,enabled:true});
  await dispatch('setAutoRefresh',{revision:5,enabled:false});
  const nativeSet=f.api.cookies.set;
  // Native mutation happens, but its receipt is lost. A fresh service must
  // preserve this durable fence until an explicit, verified manual recovery.
  f.api.cookies.set=(details,callback)=>nativeSet(details,()=>callback(undefined));
  f.document.url='https://example.com/#od-account='+a.alias;
  const navigation=()=>service.navigation({frameId:0,tabId:1,url:f.document.url});
  await navigation();assert.equal(f.writes(),1);
  assert.equal(session[COOKIE_ACCOUNT_SEEN_KEY]['1'].phase,'in_flight');
  f.api.cookies.set=nativeSet;
  service=createCookieAccountService({api:f.api,storage:f.storage});
  await navigation();assert.equal(f.writes(),1,'restart must not replay the uncertain write');
  assert.equal((await dispatch('switch',{revision:6,alias:b.alias})).verified,true);
  assert.equal(f.writes(),2);
  await navigation();assert.equal(f.writes(),2,'the unresolved old URL is still not a new intent');
  f.setCookie('external-session-change');
  f.document.url='https://example.com/#od-account='+b.alias;
  await navigation();
  assert.equal(f.writes(),3,'a different explicit URL must work after verified manual recovery');
  assert.equal(session[COOKIE_ACCOUNT_SEEN_KEY]['1'].alias,b.alias);
  assert.equal(session[COOKIE_ACCOUNT_SEEN_KEY]['1'].phase,'applied');
});

for(const failure of ['lost native receipt','permission revoked','session write failed','newer fence','different website'])
test(`manual recovery preserves the automatic fence on ${failure}`,async t=>{
  const f=await serviceFixture(t);
  const saved=await f.dispatch('create',{revision:0,displayName:'A'}),alias=saved.accounts[0].alias;
  const prior={url:(failure==='different website'?'https://other.example/':'https://example.com/')+
    '#od-account='+alias,alias,version:1,phase:'in_flight'};
  const newer={...prior,url:'https://example.com/#od-account=acct_other',alias:'acct_other'};
  const session={[COOKIE_ACCOUNT_SEEN_KEY]:{'1':prior}};
  f.api.storage.session={setAccessLevel:async()=>{},
    get:async key=>structuredClone({[key]:session[key]}),
    set:async values=>{
      if(failure==='session write failed')throw Error('session unavailable');
      Object.assign(session,structuredClone(values));
    }};
  f.setCookie('changed-session');
  const nativeSet=f.api.cookies.set;
  f.api.cookies.set=(details,callback)=>nativeSet(details,result=>{
    if(failure==='newer fence')session[COOKIE_ACCOUNT_SEEN_KEY]['1']=newer;
    callback(failure==='lost native receipt'?undefined:result);
  });
  if(failure==='permission revoked')f.revoke();
  const operation=f.dispatch('switch',{revision:1,alias});
  if(failure==='lost native receipt'||failure==='permission revoked')
    await assert.rejects(operation,{code:failure==='lost native receipt'?'E_OUTCOME_UNKNOWN':'E_SITE_GRANT_REQUIRED'});
  else assert.equal((await operation).verified,true,'bookkeeping cannot undo a verified Cookie switch');
  assert.deepEqual(session[COOKIE_ACCOUNT_SEEN_KEY]['1'],failure==='newer fence'?newer:prior);
  assert.equal(f.writes(),failure==='permission revoked'?0:1);
});

test('SW creates, edits and deletes an account when a granted site has zero Cookies',async t=>{
  const f=await serviceFixture(t);f.setCookie(null);
  const created=await f.dispatch('create',{
    revision:0,displayName:'空 Cookie 工作账号',description:'先保存名称'
  });
  assert.equal(created.revision,1);
  assert.equal(created.accounts[0].cookieCount,0);
  assert.equal(created.accounts[0].description,'先保存名称');
  assert.equal(created.accounts[0].allowAuto,false);
  assert.equal(Object.hasOwn(created,'currentSnapshot'),false);
  assert.deepEqual(f.records.get(COOKIE_ACCOUNT_STORE_KEY).accounts[0].cookies,[]);
  const {alias}=created.accounts[0];
  assert.equal((await f.dispatch('status')).accounts[0].cookieCount,0);
  await assert.rejects(f.dispatch('switch',{revision:1,alias}),{code:'E_ACCOUNT_EMPTY'});
  await assert.rejects(f.dispatch('allowAlias',{
    revision:1,alias,accountVersion:1,enabled:true
  }),{code:'E_ACCOUNT_EMPTY'});
  assert.equal((await f.dispatch('rename',{
    revision:1,alias,accountVersion:1,
    displayName:'已保存的工作账号',description:'稍后关联'
  })).accounts[0].cookieCount,0);
  assert.equal((await f.dispatch('delete',{
    revision:2,alias,accountVersion:2
  })).accounts.length,0);
  assert.equal(f.writes(),0,'empty account lifecycle cannot change native Cookie');
});

test('SW permits metadata-only creation without a Cookie site grant and explicitly attaches later',async t=>{
  const f=await serviceFixture(t);
  const site='https://example.com';
  f.state[BROWSER_MENU_GRANTS_STORE]['cookie-editor'].cookieSites={};
  const created=await f.dispatch('create',{
    revision:0,displayName:'待关联账号',description:'本地先保存'
  });
  assert.equal(created.accounts[0].cookieCount,0);
  assert.equal(Object.hasOwn(created,'currentSnapshot'),false);
  const {alias}=created.accounts[0];
  assert.equal(f.writes(),0);
  const forged=f.message('attach',{revision:1,alias,accountVersion:1});
  forged.trustedClick=false;
  await assert.rejects(createCookieAccountService({api:f.api,storage:f.storage})
    .dispatch(forged,f.sender),{code:'E_USER_GESTURE_REQUIRED'});
  await assert.rejects(f.dispatch('attach',{
    revision:1,alias,accountVersion:1
  }),{code:'E_SITE_GRANT_REQUIRED'});
  f.state[BROWSER_MENU_GRANTS_STORE]['cookie-editor'].cookieSites={
    [site]:{read:true,values:true,write:true,grantEpoch:'new-grant',storeId:'0'}
  };
  const attached=await f.dispatch('attach',{revision:1,alias,accountVersion:1});
  assert.equal(attached.revision,2);
  assert.equal(attached.accounts[0].cookieCount,1);
  assert.equal(attached.accounts[0].version,2);
  assert.deepEqual(attached.currentSnapshot,{alias,version:2,revision:2,document:f.document});
  assert.doesNotMatch(JSON.stringify(attached),/fiction|"cookies"|"value"/);
  assert.equal(f.writes(),0,'attaching snapshots only reads native Cookie');
  await assert.rejects(f.dispatch('attach',{
    revision:2,alias,accountVersion:2
  }),{code:'E_ACCOUNT_ALREADY_LINKED'});
  assert.equal((await f.dispatch('status')).revision,2,
    'repeat association must not mutate existing snapshot');
});

test('snapshot proof exposes only the public document origin and path',async t=>{
  const f=await serviceFixture(t);
  f.document.url='https://example.com/account?token=private-token#secret-fragment';
  const saved=await f.dispatch('create',{revision:0,displayName:'已保存账号'});
  assert.deepEqual(saved.currentSnapshot.document,{...f.document,url:'https://example.com/account'});
  assert.doesNotMatch(JSON.stringify(saved),/private-token|secret-fragment/);
});

for(const operation of ['create','attach']){
  for(const change of ['value','name','domain','path','storeId','partitionKey','hostOnly',
    'secure','httpOnly','sameSite','session','expirationDate',
    'empty','extra','navigation','revoke','grantEpoch','installEpoch','hostDocument',
    'readError','vaultRevision','vaultReadError','lateRevoke','lateNavigation','lateHostDocument']){
    test(`${operation} preserves its saved snapshot without proof after ${change}`,async t=>{
      const f=await serviceFixture(t);
      let revision=0,payload={revision,displayName:'已保存账号'};
      if(operation==='attach'){
        f.setCookie(null);
        const empty=await f.dispatch('create',payload);
        revision=empty.revision;
        payload={revision,alias:empty.accounts[0].alias,accountVersion:1};
        f.setCookie('fiction');
      }
      const read=f.api.cookies.getAll;
      const expirationDate=Math.floor(Date.now()/1000)+3600;
      let verificationReads=0;
      f.api.cookies.getAll=async details=>{
        const native=await read(details);
        const rows=change==='expirationDate'?native.map(row=>({
          ...row,session:false,expirationDate})):native;
        if((f.records.get(COOKIE_ACCOUNT_STORE_KEY)?.revision??0)<=revision)return rows;
        verificationReads++;
        const patches={value:'changed-secret',name:'another-cookie',domain:'other.example.com',
          path:'/other',storeId:'1',partitionKey:{topLevelSite:'https://example.com',
            hasCrossSiteAncestor:false},hostOnly:false,secure:false,httpOnly:false,
          sameSite:'strict',session:false};
        if(Object.hasOwn(patches,change))return rows.map(row=>({...row,[change]:patches[change]}));
        if(change==='expirationDate')return rows.map(row=>({...row,expirationDate:expirationDate+60}));
        if(change==='empty')return [];
        if(change==='extra')return [...rows,original({name:'extra',value:'extra-secret'})];
        if(change==='navigation')f.api.webNavigation.getFrame=async()=>({
          ...f.document,documentId:'new-document',documentLifecycle:'active'});
        if(change==='revoke')f.revoke();
        if(change==='grantEpoch')f.state[BROWSER_MENU_GRANTS_STORE]['cookie-editor']
          .cookieSites['https://example.com'].grantEpoch='replacement-grant';
        if(change==='installEpoch')f.state[TOOL_REVOCATION_EPOCHS_STORE]['cookie-editor']='replacement-install';
        if(change==='hostDocument')f.api.runtime.getContexts=async()=>[];
        if(change==='readError')throw new Error('native proof read failed');
        if(change==='vaultRevision'&&verificationReads===1)
          f.records.get(COOKIE_ACCOUNT_STORE_KEY).revision++;
        if(change==='vaultReadError')f.storageFailure=true;
        return rows;
      };
      const storage=async()=>{
        if(f.storageFailure)throw new Error('proof storage unavailable');
        if(verificationReads>0){
          if(change==='lateRevoke')f.revoke();
          if(change==='lateNavigation')f.api.webNavigation.getFrame=async()=>({
            ...f.document,documentId:'new-document',documentLifecycle:'active'});
          if(change==='lateHostDocument')f.api.runtime.getContexts=async()=>[];
        }
        return f.storage();
      };
      const result=await createCookieAccountService({api:f.api,storage})
        .dispatch(f.message(operation,payload),f.sender);
      assert.ok(verificationReads>0,'failure is injected only after saving');
      assert.equal(result.revision,revision+1,'receipt retains this successful save');
      assert.equal(result.accounts[0].version,operation==='create'?1:2);
      assert.equal(Object.hasOwn(result,'currentSnapshot'),false);
      assert.doesNotMatch(JSON.stringify(result),/fiction|changed-secret|extra-secret|"cookies"|"value"/);
      const saved=f.records.get(COOKIE_ACCOUNT_STORE_KEY);
      assert.deepEqual(saved.accounts[0].cookies,[original(change==='expirationDate'?
        {session:false,expirationDate}:{})],'saved capture is retained');
      assert.equal(f.writes(),0,'failed proof must not write native Cookies');
      assert.ok(verificationReads<=4,'no verification retry');
    });
  }
}

test('trusted account descriptions persist without Cookie reads, writes or reload',async t=>{
  const f=await serviceFixture(t);
  let reads=0,reloads=0;
  const nativeRead=f.api.cookies.getAll,nativeReload=f.api.tabs.reload;
  f.api.cookies.getAll=(...args)=>{reads++;return nativeRead(...args);};
  f.api.tabs.reload=(...args)=>{reloads++;return nativeReload(...args);};
  const created=await f.dispatch('create',{
    revision:0,displayName:'工作账号',description:'  团队  日常使用 '
  });
  assert.equal(created.accounts[0].description,'团队 日常使用');
  assert.equal(created.accounts[0].cookieCount,1);
  assert.equal(created.accounts[0].version,1);
  const {alias}=created.accounts[0];
  const oldStored=structuredClone(f.records.get(COOKIE_ACCOUNT_STORE_KEY).accounts[0].cookies);
  const readsAfterCreate=reads;
  const edited=await f.dispatch('rename',{
    revision:1,alias,accountVersion:1,displayName:'工作账号',
    description:'客服团队日常使用'
  });
  assert.equal(edited.revision,2);
  assert.equal(edited.accounts[0].description,'客服团队日常使用');
  assert.equal(edited.accounts[0].version,1,'metadata-only edit keeps switch fence');
  assert.equal(reads,readsAfterCreate,'metadata-only edit cannot capture Cookies');
  assert.equal(f.writes(),0,'metadata-only edit cannot write Cookies');
  assert.equal(reloads,0,'metadata-only edit cannot reload a page');
  assert.deepEqual(f.records.get(COOKIE_ACCOUNT_STORE_KEY).accounts[0].cookies,oldStored);
  assert.equal((await f.dispatch('status')).accounts[0].description,'客服团队日常使用');
  assert.doesNotMatch(JSON.stringify(edited),/fiction|cookies|ciphertext|key/);
  const renamed=await f.dispatch('rename',{
    revision:2,alias,accountVersion:1,displayName:'工作账号（客服）',
    description:'新描述'
  });
  assert.equal(renamed.accounts[0].version,2,'existing name-change version policy remains');
  assert.equal(renamed.accounts[0].description,'新描述');
  assert.equal(reads,readsAfterCreate);
  assert.equal(f.writes(),0);
  await assert.rejects(f.dispatch('rename',{
    revision:3,alias,accountVersion:2,displayName:'工作账号（客服）',
    description:'a'.repeat(121)
  }),{code:'E_ACCOUNT_DESCRIPTION'});
  await assert.rejects(f.dispatch('rename',{
    revision:2,alias,accountVersion:2,displayName:'旧操作',
    description:'过期草稿'
  }),{code:'E_VAULT_CONFLICT'});
  assert.equal((await f.dispatch('status')).accounts[0].description,'新描述');
});

test('fixed SW install forwards Foundation storage and exposes cleanup only to its caller',async t=>{
  const f=await serviceFixture(t);let listener;
  f.api.runtime.onMessage={addListener:fn=>{listener=fn;}};
  const service=installCookieAccountService({api:f.api,storage:f.storage});
  const response=await new Promise(resolve=>{
    assert.equal(listener(f.message('create',{revision:0,displayName:'直接保存'}),f.sender,resolve),true);
  });
  assert.equal(response.ok,true);assert.equal(response.data.revision,1);
  assert.equal(f.records.has(COOKIE_ACCOUNT_STORE_KEY),true);
  const unrelated={private:'other tool data'};f.records.set('other-tool',unrelated);
  assert.deepEqual(await service.cleanup(),{cleared:true});
  assert.equal(f.records.has(COOKIE_ACCOUNT_STORE_KEY),false);
  assert.deepEqual(f.records.get('other-tool'),unrelated);
});

for (const cleanupError of ['E_DEVICE_KEY_OUTCOME_UNKNOWN', 'E_DEVICE_KEY_CLEANUP_PENDING'])
test('fixed lifecycle cleanup preserves owner references until keys are cleared: ' + cleanupError, async t => {
  const f = await serviceFixture(t);
  await f.dispatch('create', {revision: 0, displayName: '卸载清理'});
  const owners = [JSON.stringify([f.message('status').packageHash, 'epoch']), 'retired-package-owner'];
  const keyOwner = owner => 'cookie-editor:' + createHash('sha256').update(owner).digest('hex');
  const deviceRecords = new Map(owners.map(owner => [keyOwner(owner), ['receiver', 'signing', 'sender']]));
  deviceRecords.set('another-tool:install', ['unrelated']);
  const share = {format: 1, items: [{owner: owners[0], ref: 'source'}],
    claims: [{owner: owners[1], ref: 'received'}]};
  f.records.set(COOKIE_SHARE_STORAGE_KEY, share);
  let lost = true;
  const service = createCookieAccountService({api: f.api, storage: f.storage,
    deviceKeyStorageFactory: ({owner, authorize}) => ({async clear() {
      await authorize();
      assert.ok(f.records.has(COOKIE_SHARE_STORAGE_KEY), 'keep recovery references until all owners are cleared');
      deviceRecords.delete(owner);
      if (lost) {
        lost = false;
        if (cleanupError === 'E_DEVICE_KEY_CLEANUP_PENDING') deviceRecords.set(owner, ['remaining']);
        throw Object.assign(Error('cleanup incomplete'), {code: cleanupError});
      }
    }})});
  f.state[SIDEBAR_TOOL_STORE] = [];
  await assert.rejects(service.cleanup(), {code: cleanupError});
  assert.deepEqual(f.records.get(COOKIE_SHARE_STORAGE_KEY), share);
  assert.ok(f.records.has(COOKIE_ACCOUNT_STORE_KEY));
  assert.deepEqual(await service.cleanup(), {cleared: true});
  assert.equal(f.records.has(COOKIE_SHARE_STORAGE_KEY), false);
  assert.equal(f.records.has(COOKIE_ACCOUNT_STORE_KEY), false);
  assert.deepEqual([...deviceRecords], [['another-tool:install', ['unrelated']]]);
  assert.equal(f.writes(), 0);
});

test('session delivery enforces the full saved parent-domain scope before encryption and at the outbound fence', async t => {
  for (const scenario of ['revoked before delivery', 'revoked during key preparation',
    'renewed during key preparation', 'revoked at outbound fence', 'authorized after logout']) {
    await t.test(scenario, async t => {
      const f = await serviceFixture(t), origin = 'https://app.example.com';
      const ledger = f.state[BROWSER_MENU_GRANTS_STORE]['cookie-editor'];
      ledger.cookieSites[origin] = {...ledger.cookieSites['https://example.com'], grantEpoch: 'child-grant'};
      f.document.url = origin + '/';
      const parentCookie = original({domain: '.example.com', hostOnly: false});
      let live = [parentCookie];
      f.api.cookies.getAll = async () => structuredClone(live);
      const saved = await f.dispatch('create', {origin, revision: 0, displayName: '父域合成会话'});
      const alias = saved.accounts[0].alias, requestId = 'r'.repeat(32), inviteId = 'i'.repeat(32);
      const invite = {id: inviteId, origin, displayName: '父域合成会话', description: '',
        mode: 'session', expiresAt: Date.now() + 3600000, remainingClaims: 1, revoked: false};
      f.records.set(COOKIE_SHARE_STORAGE_KEY, {format: 1, claims: [], items: [{ref: 'share-source',
        owner: JSON.stringify([f.message('status').packageHash, 'epoch']), alias, accountVersion: 1,
        siteOrigin: origin, relay: 'https://relay.invalid', id: inviteId, managerSecret: 'm'.repeat(32),
        url: 'https://relay.invalid/i/' + inviteId, invite, phase: 'active'}]});
      const sessionCrypto = createCookieSessionCrypto();
      const receiver = await crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, false, ['deriveBits']);
      const signing = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign', 'verify']);
      const ecdhPublic = await sessionCrypto.publicJwk(receiver.publicKey);
      const verifyPublic = await sessionCrypto.publicJwk(signing.publicKey);
      const receiverFingerprint = await sessionCrypto.deviceFingerprint(ecdhPublic, verifyPublic);
      const priorFetch = globalThis.fetch; let packet, posts = 0;
      globalThis.fetch = async (url, options) => {
        if (url.startsWith('chrome-extension:')) return priorFetch(url, options);
        if (url.endsWith('/pairs')) return new Response(JSON.stringify({requests: [{requestId,
          ecdhPublic, verifyPublic, status: 'pending', createdAt: Date.now()}]}));
        assert.ok(url.endsWith('/deliver')); posts++; packet = JSON.parse(options.body);
        return new Response(JSON.stringify({status: 'encrypted_ready', requestId}));
      };
      const keyRecords = new Map();
      const keyStorage = async () => ({readOnly: false, async transaction(stores, mode, work) {
        const draft = structuredClone(keyRecords);
        const result = await work({get: async (s, k) => draft.get(k),
          put: async (s, v, k) => draft.set(k, v), delete: async (s, k) => draft.delete(k),
          countPrefix: async (s, prefix) => [...draft.keys()].filter(k => k.startsWith(prefix)).length,
          keys: async (s, {prefix, limit}) => [...draft.keys()].filter(k => k.startsWith(prefix)).sort().slice(0, limit)});
        if (mode === 'readwrite') { keyRecords.clear(); for (const entry of draft) keyRecords.set(...entry); }
        return result;
      }});
      const removeParent = () => { delete ledger.cookieSites['https://example.com']; };
      if (scenario === 'revoked before delivery') removeParent();
      if (scenario === 'authorized after logout') live = [];
      const wrappedStorage = async () => {
        const base = await f.storage();
        return {...base, transaction: (stores, mode, work) => base.transaction(stores, mode, tx => work({
          ...tx, put: async (store, value, key) => {
            await tx.put(store, value, key);
            if (scenario === 'revoked at outbound fence' && key === COOKIE_SHARE_STORAGE_KEY &&
              value.items[0]?.deliveries?.[0]?.phase === 'delivering') removeParent();
          }
        }))};
      };
      const service = createCookieAccountService({api: f.api, storage: wrappedStorage,
        deviceKeyStorageFactory: options => {
          const keys = createDeviceKeyStorage({...options, storageFactory: keyStorage});
          return {...keys, async create(...args) {
            const key = await keys.create(...args);
            if (scenario === 'revoked during key preparation') removeParent();
            if (scenario === 'renewed during key preparation')
              ledger.cookieSites['https://example.com'].grantEpoch = 'renewed-parent';
            return key;
          }};
        }});
      const sending = service.dispatch(f.message('shareDeliver', {origin, ref: 'share-source',
        requestId, receiverFingerprint, revision: 1}), f.sender);
      if (scenario === 'authorized after logout') {
        const receipt = await sending;
        const snapshot = await sessionCrypto.decrypt({packet, receiver,
          expectedSenderFingerprint: receipt.senderFingerprint,
          context: {origin, inviteId, requestId, receiverFingerprint}});
        assert.deepEqual(snapshot.cookies, [parentCookie]); assert.equal(posts, 1);
      } else {
        await assert.rejects(sending, {code: scenario === 'revoked at outbound fence'
          ? 'E_OUTCOME_UNKNOWN' : 'E_SITE_GRANT_REQUIRED'});
        assert.equal(posts, 0);
      }
      assert.equal(f.writes(), 0);
    });
  }
});

for(const pausedAt of ['capture','authorization'])
test(`cleanup drains first create paused at ${pausedAt} without account resurrection`,{timeout:2000},async t=>{
  const f=await serviceFixture(t);
  const service=createCookieAccountService({api:f.api,storage:f.storage});
  const entered=Promise.withResolvers(),release=Promise.withResolvers();
  t.after(()=>release.resolve());
  const target=pausedAt==='capture'?f.api.cookies:f.api.runtime;
  const method=pausedAt==='capture'?'getAll':'getContexts';
  const originalMethod=target[method];
  let first=true;
  target[method]=async(...args)=>{
    if(first){first=false;entered.resolve();await release.promise;}
    return originalMethod(...args);
  };
  const creating=service.dispatch(f.message('create',{revision:0,displayName:'清理前账号'}),f.sender);
  await entered.promise;
  const cleaning=service.cleanup();
  // Drain ready promises while the older request remains explicitly paused.
  await new Promise(resolve=>setImmediate(resolve));
  release.resolve();
  await Promise.all([creating,cleaning]);
  assert.equal(f.records.has(COOKIE_ACCOUNT_STORE_KEY),false,
    'cleanup must not finish before an older capture can recreate the account store');
  assert.equal(f.writes(),0,'capture and cleanup must not write native Cookies');
  f.state[TOOL_REVOCATION_EPOCHS_STORE]['cookie-editor']='new-install';
  f.state[BROWSER_MENU_GRANTS_STORE]['cookie-editor'].installEpoch='new-install';
  await assert.rejects(service.dispatch(f.message('status'),f.sender),{code:'E_TOOL_CHANGED'});
  const message=f.message('create',{revision:0,displayName:'清理后合法账号'});
  message.installEpoch='new-install';
  const saved=await service.dispatch(message,f.sender);
  assert.equal(saved.revision,1);
  assert.deepEqual(saved.accounts.map(row=>row.displayName),['清理后合法账号']);
});


test('R2.6 snapshot update rejects every exact scope change and recognizes a no-op',()=>{
  const row=original();
  assert.equal(inspectAccountSnapshotUpdate([row],[{...row}]),'unchanged');
  assert.equal(inspectAccountSnapshotUpdate([row],[{...row,value:'renewed'}]),'changed');
  for(const changed of [{domain:'other.example.com'},{path:'/other'},
    {hostOnly:false},{storeId:'1'},
    {partitionKey:{topLevelSite:'https://example.com',hasCrossSiteAncestor:false}}]){
    assert.throws(()=>inspectAccountSnapshotUpdate([row],[{...row,...changed}]),
      {code:'E_ACCOUNT_SNAPSHOT_SCOPE_CHANGED'});
  }
});

test('R2.6 trusted save counts stay redacted and updates write only changed snapshots',async t=>{
  const f=await serviceFixture(t);
  const first=await f.dispatch('create',{revision:0,displayName:'新账号 1'});
  const account=first.accounts[0];
  assert.equal(account.cookieCount,1);
  assert.doesNotMatch(JSON.stringify(first),/fiction|"cookies"|"value"/);
  const payload={revision:first.revision,alias:account.alias,accountVersion:account.version};
  const before=structuredClone(f.records.get(COOKIE_ACCOUNT_STORE_KEY));
  const noOp=await f.dispatch('update',payload);
  assert.equal(noOp.unchanged,true);assert.equal(noOp.revision,first.revision);
  assert.deepEqual(f.records.get(COOKIE_ACCOUNT_STORE_KEY),before);
  f.setCookie('renewed');
  const updated=await f.dispatch('update',payload);
  assert.equal(updated.revision,first.revision+1);
  assert.equal(updated.accounts[0].version,account.version+1);
  assert.equal(f.records.get(COOKIE_ACCOUNT_STORE_KEY).accounts[0].cookies[0].value,'renewed');
  assert.equal(f.writes(),0,'capturing a snapshot never writes native Cookies');
  await assert.rejects(f.dispatch('create',{revision:updated.revision,displayName:'新账号 1'}),
    {code:'E_ACCOUNT_NAME_TAKEN'});
});
