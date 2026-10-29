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

test('SW saves directly at revision zero and switches after service restart with metadata-only receipts',async t=>{
  const f=await serviceFixture(t);
  assert.equal((await f.dispatch('status')).unlocked,true);
  const saved=await f.dispatch('create',{revision:0,displayName:'示例账号'});
  assert.equal(saved.revision,1);assert.equal(saved.accounts.length,1);
  assert.equal(saved.accounts[0].cookieCount,1);
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


test('SW creates, edits and deletes an account when a granted site has zero Cookies',async t=>{
  const f=await serviceFixture(t);f.setCookie(null);
  const created=await f.dispatch('create',{
    revision:0,displayName:'空 Cookie 工作账号',description:'先保存名称'
  });
  assert.equal(created.revision,1);
  assert.equal(created.accounts[0].cookieCount,0);
  assert.equal(created.accounts[0].description,'先保存名称');
  assert.equal(created.accounts[0].allowAuto,false);
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
  assert.equal(f.writes(),0,'attaching snapshots only reads native Cookie');
  await assert.rejects(f.dispatch('attach',{
    revision:2,alias,accountVersion:2
  }),{code:'E_ACCOUNT_ALREADY_LINKED'});
  assert.equal((await f.dispatch('status')).revision,2,
    'repeat association must not mutate existing snapshot');
});

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
