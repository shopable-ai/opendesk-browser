import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCookieAccountService,validateAccountCookieRow}
  from '../../examples/sidebar-tools/cookie-editor/trusted/account-service.js';
import {COOKIE_ACCOUNT_PROTOCOL,COOKIE_ACCOUNT_STORE_KEY}
  from '../../examples/sidebar-tools/cookie-editor/trusted/account-contract.js';
import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage,serializeSidebarToolPackage,sidebarToolPackageHash}
  from '../../src/ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {MARKET_PROVENANCE_STORE} from '../../src/sidebar-tools/official-reading-toc.js';
import {BROWSER_MENU_GRANTS_STORE} from '../../src/framework/sdk/browser-contract.js';

// Fictional Cookies only. Native selection and readback use real domain/path
// matching so a host-only replacement cannot masquerade as a shared Cookie.
const origin='https://www.csdn.net',parent='https://csdn.net';
const partition={topLevelSite:parent,hasCrossSiteAncestor:false};
const cookie=(patch={})=>({name:'session_fixture',value:'fiction-a',domain:'.csdn.net',
  path:'/',storeId:'0',hostOnly:false,session:true,secure:true,httpOnly:true,
  sameSite:'lax',...patch});
const domain=row=>row.domain.replace(/^\./,'').toLowerCase();
const identity=row=>JSON.stringify([row.name,domain(row),row.path,row.storeId,row.partitionKey??null,row.hostOnly]);
const applicable=(row,url)=>{
  const at=new URL(url),host=at.hostname;
  return (host===domain(row)||!row.hostOnly&&host.endsWith('.'+domain(row)))&&
    (at.pathname===row.path||at.pathname.startsWith(row.path.endsWith('/')?row.path:row.path+'/'));
};
async function fixture(t,{site=origin,nativePartition=partition}={}){
  const tool=validateSidebarToolPackage({format:'opendesk.sidebar-tool.v2',id:'cookie-editor',
    version:'1.0.0',title:'Cookie Editor',description:'Parent Cookie regression fixture',
    capabilities:['browser.cookies.read','browser.cookies.values','browser.cookies.write'],
    requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},
    html:'<main></main>',css:'',js:'void 0;'});
  const bytes=Buffer.from(serializeSidebarToolPackage(tool)),hash=await sidebarToolPackageHash(tool);
  const release={id:'opendesk/cookie-editor',toolId:tool.id,kind:'sidebar-tool',
    installationPolicy:'optional',version:tool.version,packageTitle:tool.title,
    description:tool.description,capabilities:tool.capabilities,
    packagePath:'official-tools/cookie-editor/cookie-editor.opendesk-tool.json',
    bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async()=>({ok:true,json:async()=>({schema:'opendesk.official-tools.releases.v1',
    sourceRepository:'https://github.com/shopable-ai/opendesk-browser',apps:[release]})});
  t.after(()=>{globalThis.fetch=oldFetch;});
  const grant={read:true,values:true,write:true,valueConsent:true,grantEpoch:'grant',storeId:'0'};
  const siteRecord={version:tool.version,packageHash:hash,installEpoch:'epoch',cookieAllSites:{...grant}};
  const state={[SIDEBAR_TOOL_STORE]:[tool],[TOOL_REVOCATION_EPOCHS_STORE]:{'cookie-editor':'epoch'},
    [MARKET_PROVENANCE_STORE]:{'cookie-editor':{marketId:release.id,version:tool.version,sha256:release.sha256}},
    [BROWSER_MENU_GRANTS_STORE]:{'cookie-editor':siteRecord}};
  const document={tabId:1,documentId:'site-document',url:site+'/'};
  const sender={id:'test',url:'chrome-extension://test/sidepanel.html?hostInstanceId=00000000-0000-4000-8000-000000000000&toolId=cookie-editor',
    documentId:'host-document',frameId:0};
  const records=new Map(),writes=[],reads=[],permissions=new Set([origin+'/*',parent+'/*']);
  let rows=[cookie(),cookie({name:'local',domain:'www.csdn.net',hostOnly:true}),
    cookie({name:'scoped',path:'/account'}),cookie({name:'sibling',domain:'blog.csdn.net',hostOnly:true}),
    cookie({name:'other_partition',partitionKey:{...partition,hasCrossSiteAncestor:true}})];
  const storage=async()=>({transaction:async(_stores,mode,work)=>work({
    get:async(_store,key)=>structuredClone(records.get(key)),
    put:async(_store,value,key)=>{assert.equal(mode,'readwrite');records.set(key,structuredClone(value));},
    delete:async(_store,key)=>records.delete(key)
  })});
  const api={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,
    getContexts:async()=>[{contextType:'SIDE_PANEL',documentUrl:sender.url,
      documentId:sender.documentId,frameId:0,incognito:false}]},
    storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys])
      .filter(key=>Object.hasOwn(state,key)).map(key=>[key,structuredClone(state[key])]))}},
    permissions:{contains:async({origins})=>origins.every(site=>permissions.has(site))},
    tabs:{get:async()=>({id:1,url:document.url,active:true,incognito:false}),reload:async()=>{}},
    webNavigation:{getFrame:async()=>({...document,documentLifecycle:'active'})},
    cookies:{getAllCookieStores:async()=>[{id:'0',tabIds:[1]}],
      getPartitionKey:async()=>({partitionKey:nativePartition}),
      getAll(query,callback){
        reads.push(structuredClone(query));
        const found=rows.filter(row=>(!query.storeId||query.storeId===row.storeId)&&
          (!query.name||query.name===row.name)&&(!query.path||query.path===row.path)&&
          (!query.domain||domain(row)===query.domain||domain(row).endsWith('.'+query.domain))&&
          (!query.url||applicable(row,query.url))&&
          (query.partitionKey?JSON.stringify(query.partitionKey)===JSON.stringify(row.partitionKey):!row.partitionKey));
        if(callback)callback(structuredClone(found));else return Promise.resolve(structuredClone(found));
      },
      get(query,callback){
        const found=rows.filter(row=>row.name===query.name&&row.storeId===query.storeId&&
          applicable(row,query.url)&&JSON.stringify(row.partitionKey)===JSON.stringify(query.partitionKey))
          .sort((a,b)=>b.path.length-a.path.length)[0]??null;
        callback(structuredClone(found));
      },
      set(details,callback){
        writes.push(structuredClone(details));
        const next=cookie({name:details.name,value:details.value,
          domain:details.domain??new URL(details.url).hostname,hostOnly:details.domain===undefined,
          path:details.path??'/',storeId:details.storeId,secure:details.secure,httpOnly:details.httpOnly,
          sameSite:details.sameSite,session:details.expirationDate===undefined,
          ...(details.partitionKey?{partitionKey:details.partitionKey}:{}),
          ...(details.expirationDate!==undefined?{expirationDate:details.expirationDate}:{})});
        rows=rows.filter(row=>identity(row)!==identity(next));
        if(details.expirationDate===0){callback(null);return;}
        rows.push(next);callback(structuredClone(next));
      }
    }};
  const service=createCookieAccountService({api,storage});
  return {api,siteRecord,grant,document,records,permissions,writes,reads,
    rows:()=>structuredClone(rows),replace:next=>{rows=structuredClone(next);},
    dispatch:(operation,payload={})=>service.dispatch({protocol:COOKIE_ACCOUNT_PROTOCOL,toolId:'cookie-editor',
      operation,packageHash:hash,installEpoch:'epoch',trustedClick:true,
      payload:{origin:site,document,...payload}},sender)};
}

test('CSDN native parent-domain Cookies validate without turning into host-only Cookies',()=>{
  const parents=new Set(['csdn.net']);
  assert.deepEqual(validateAccountCookieRow(cookie(),'www.csdn.net','0',partition,parents),cookie());
  for(const row of [cookie({hostOnly:true}),cookie({domain:'.notcsdn.net'}),
    cookie({domain:'blog.csdn.net'}),cookie({domain:'..csdn.net'}),
    cookie({domain:'.net'}),cookie({storeId:'1'}),
    cookie({partitionKey:{...partition,hasCrossSiteAncestor:true}})]){
    assert.throws(()=>validateAccountCookieRow(row,'www.csdn.net','0',partition,parents),{code:'E_ACCOUNT_COOKIE_SCOPE'});
  }
});

test('CSDN save includes parent paths, excludes sibling hosts and other partitions, and redacts receipt',async t=>{
  const f=await fixture(t);
  const saved=await f.dispatch('create',{revision:0,displayName:'CSDN fixture'});
  assert.equal(saved.accounts[0].cookieCount,3);
  assert.doesNotMatch(JSON.stringify(saved),/fiction-a|"cookies"|"value"/);
  const captured=f.records.get(COOKIE_ACCOUNT_STORE_KEY).accounts[0].cookies;
  assert.deepEqual(captured.map(row=>row.name).sort(),['local','scoped','session_fixture']);
  assert.equal(captured.find(row=>row.name==='session_fixture').hostOnly,false);
  assert.equal(f.writes.length,0,'saving a snapshot does not modify website Cookies');
});

test('CSDN switch restores original shared domain and paths without touching siblings',async t=>{
  const f=await fixture(t);
  const saved=await f.dispatch('create',{revision:0,displayName:'CSDN fixture'});
  const before=f.rows();
  f.replace(before.map(row=>row.name==='sibling'||row.partitionKey?row:{...row,value:'fiction-b'}));
  const switched=await f.dispatch('switch',{revision:1,alias:saved.accounts[0].alias});
  assert.equal(switched.verified,true);
  assert.equal(f.writes.length,3);
  for(const write of f.writes.filter(row=>row.domain==='.csdn.net'))
    assert.equal(new URL(write.url).hostname,'csdn.net');
  assert.deepEqual(f.rows().sort((a,b)=>identity(a).localeCompare(identity(b))),
    before.sort((a,b)=>identity(a).localeCompare(identity(b))));
});

test('CSDN parent Cookie requires existing parent-domain authority and Chrome permission before saving',async t=>{
  for(const denial of ['tool-grant','chrome-permission','wrong-store']){
    const f=await fixture(t);
    if(denial==='tool-grant'){
      delete f.siteRecord.cookieAllSites;
      f.siteRecord.cookieSites={[origin]:{...f.grant}};
    }else if(denial==='chrome-permission')f.permissions.delete(parent+'/*');
    else{
      delete f.siteRecord.cookieAllSites;
      f.siteRecord.cookieSites={[origin]:{...f.grant},[parent]:{...f.grant,storeId:'1'}};
    }
    await assert.rejects(f.dispatch('create',{revision:0,displayName:'blocked'}));
    assert.equal(f.records.has(COOKIE_ACCOUNT_STORE_KEY),false);
    assert.equal(f.writes.length,0);
  }
});

test('CSDN explicit parent site grant works without requiring all-site access',async t=>{
  const f=await fixture(t);
  delete f.siteRecord.cookieAllSites;
  f.siteRecord.cookieSites={[origin]:{...f.grant},[parent]:{...f.grant}};
  const saved=await f.dispatch('create',{revision:0,displayName:'site grants'});
  assert.equal(saved.accounts[0].cookieCount,3);
});

test('CSDN shared-domain authority revoked after capture blocks switch without native writes',async t=>{
  const f=await fixture(t);
  const saved=await f.dispatch('create',{revision:0,displayName:'CSDN fixture'});
  f.replace(f.rows().map(row=>({...row,value:'fiction-b'})));
  const nativeGetAll=f.api.cookies.getAll;let reads=0;
  f.api.cookies.getAll=async function(query,callback){
    const result=await nativeGetAll.call(this,query,callback);
    if(++reads===1)f.siteRecord.cookieAllSites.write=false;
    return result;
  };
  await assert.rejects(f.dispatch('switch',{revision:1,alias:saved.accounts[0].alias}));
  assert.equal(f.writes.length,0);
  assert.equal(reads,1,'revocation after one read prevents the next native read');
});

test('CSDN revoke-and-regrant during capture cannot silently adopt a new grant epoch',async t=>{
  const f=await fixture(t),getAll=f.api.cookies.getAll;
  f.api.cookies.getAll=async function(query,callback){
    const result=await getAll.call(this,query,callback);
    f.siteRecord.cookieAllSites.grantEpoch='regranted';
    return result;
  };
  await assert.rejects(f.dispatch('create',{revision:0,displayName:'stale consent'}),
    {code:'E_SITE_GRANT_REQUIRED'});
  assert.equal(f.records.has(COOKIE_ACCOUNT_STORE_KEY),false);
  assert.equal(f.writes.length,0);
});

test('saved shared-domain account restores after every live Cookie has disappeared',async t=>{
  const f=await fixture(t);
  const saved=await f.dispatch('create',{revision:0,displayName:'CSDN fixture'});
  const captured=f.records.get(COOKIE_ACCOUNT_STORE_KEY).accounts[0].cookies;
  f.replace([]);
  assert.equal((await f.dispatch('switch',{revision:1,alias:saved.accounts[0].alias})).verified,true);
  assert.deepEqual(f.rows().sort((a,b)=>identity(a).localeCompare(identity(b))),captured);
  assert.equal(f.writes.length,3);
});

test('root-page capture discovers authorized parent Cookies on nonmatching Paths',async t=>{
  const f=await fixture(t);
  f.replace([cookie({path:'/account'})]);
  const saved=await f.dispatch('create',{revision:0,displayName:'path only'});
  assert.equal(saved.accounts[0].cookieCount,1);
  assert.equal(f.records.get(COOKIE_ACCOUNT_STORE_KEY).accounts[0].cookies[0].path,'/account');
});

test('multiple parent levels work on unrelated multi-label sites without a CSDN special case',async t=>{
  const site='https://app.team.example.co.uk',f=await fixture(t,{site,
    nativePartition:{...partition,topLevelSite:'https://example.co.uk'}});
  const expected=[cookie({domain:'.team.example.co.uk',path:'/account'}),
    cookie({name:'wide',domain:'.example.co.uk',path:'/settings'}),
    cookie({name:'local',domain:new URL(site).hostname,hostOnly:true})];
  for(const host of [new URL(site).hostname,'team.example.co.uk','example.co.uk'])
    f.permissions.add('https://'+host+'/*');
  f.replace([...expected,cookie({name:'sibling',domain:'other.example.co.uk',hostOnly:true})]);
  const saved=await f.dispatch('create',{revision:0,displayName:'multi level'});
  assert.equal(saved.accounts[0].cookieCount,3);
  f.replace([]);
  assert.equal((await f.dispatch('switch',{revision:1,alias:saved.accounts[0].alias})).verified,true);
  assert.deepEqual(f.rows().sort((a,b)=>identity(a).localeCompare(identity(b))),
    expected.sort((a,b)=>identity(a).localeCompare(identity(b))));
  assert.equal(f.reads.some(query=>['co.uk','uk'].includes(query.domain)),false);
});

test('native canonical parent hostnames do not require a private DNS-label regex',async t=>{
  const site='https://app.team_name.example.test',base='https://team_name.example.test';
  const f=await fixture(t,{site,nativePartition:{...partition,topLevelSite:base}});
  f.permissions.add(site+'/*');f.permissions.add(base+'/*');
  const expected=cookie({domain:'.team_name.example.test',path:'/login'});
  f.replace([expected]);
  const saved=await f.dispatch('create',{revision:0,displayName:'native hostname'});
  assert.equal(saved.accounts[0].cookieCount,1);
  f.replace([]);
  assert.equal((await f.dispatch('switch',{revision:1,alias:saved.accounts[0].alias})).verified,true);
  assert.deepEqual(f.rows(),[expected]);
});

for(const hasCrossSiteAncestor of [false,true])
test('capture and restore include both unpartitioned and exact current partition: '+hasCrossSiteAncestor,async t=>{
  const selected={...partition,hasCrossSiteAncestor};
  const f=await fixture(t,{nativePartition:selected});
  const expected=[cookie(),cookie({partitionKey:selected}),
    cookie({name:'scoped_partition',path:'/account',partitionKey:selected})];
  f.replace([...expected,cookie({name:'other_partition',partitionKey:
    {...selected,hasCrossSiteAncestor:!hasCrossSiteAncestor}}),
    cookie({name:'foreign_site_partition',partitionKey:{...selected,topLevelSite:'https://other.example'}})]);
  const saved=await f.dispatch('create',{revision:0,displayName:'partitioned account'});
  assert.equal(saved.accounts[0].cookieCount,3);
  const captured=f.records.get(COOKIE_ACCOUNT_STORE_KEY).accounts[0].cookies;
  assert.equal(captured.filter(row=>row.partitionKey).length,2);
  assert(f.reads.some(query=>JSON.stringify(query.partitionKey)===JSON.stringify(selected)));
  f.replace([]);
  assert.equal((await f.dispatch('switch',{revision:1,alias:saved.accounts[0].alias})).verified,true);
  assert.deepEqual(f.rows().sort((a,b)=>identity(a).localeCompare(identity(b))),captured);
});

test('saved parent scope still requires live authority, Store and Partition after logout',async t=>{
  for(const denial of ['tool-grant','chrome-permission','wrong-store','wrong-partition','unrelated-domain']){
    const f=await fixture(t);
    const saved=await f.dispatch('create',{revision:0,displayName:'permission fixture'});
    f.replace([]);
    delete f.siteRecord.cookieAllSites;
    f.siteRecord.cookieSites={[origin]:{...f.grant},[parent]:{...f.grant}};
    if(denial==='tool-grant')delete f.siteRecord.cookieSites[parent];
    if(denial==='chrome-permission')f.permissions.delete(parent+'/*');
    if(denial==='wrong-store')f.siteRecord.cookieSites[parent].storeId='other';
    if(denial==='wrong-partition')f.siteRecord.cookieSites[parent].partitionKey=
      {...partition,hasCrossSiteAncestor:true};
    if(denial==='unrelated-domain')f.records.get(COOKIE_ACCOUNT_STORE_KEY)
      .accounts[0].cookies[0].domain='.unrelated.example';
    await assert.rejects(f.dispatch('switch',{revision:1,alias:saved.accounts[0].alias}));
    assert.equal(f.writes.length,0,denial);
  }
});

test('ancestor discovery never reads an unauthorized parent and capture stops on navigation',async t=>{
  const f=await fixture(t);
  f.replace([cookie({name:'local',domain:'www.csdn.net',hostOnly:true})]);
  delete f.siteRecord.cookieAllSites;
  f.siteRecord.cookieSites={[origin]:{...f.grant}};
  await f.dispatch('create',{revision:0,displayName:'local scope'});
  assert.equal(f.reads.some(query=>query.domain==='csdn.net'),false);
  const before=structuredClone(f.records.get(COOKIE_ACCOUNT_STORE_KEY));
  const getAll=f.api.cookies.getAll;
  f.api.cookies.getAll=function(query,callback){
    const reply=getAll.call(this,query,callback);
    f.api.tabs.get=async()=>({id:1,url:origin+'/navigated',active:true,incognito:false});
    return reply;
  };
  await assert.rejects(f.dispatch('create',{revision:1,displayName:'stale document'}),
    {code:'E_DOCUMENT_CHANGED'});
  assert.deepEqual(f.records.get(COOKIE_ACCOUNT_STORE_KEY),before);
  assert.equal(f.writes.length,0);
});

test('same-name HostOnly and Domain Cookies remain independent during capture and switching',async t=>{
  const f=await fixture(t);
  const host=cookie({domain:'www.csdn.net',hostOnly:true});
  const shared=cookie({domain:'.www.csdn.net',value:'shared'});
  f.replace([host,shared]);
  const both=await f.dispatch('create',{revision:0,displayName:'both identities'});
  assert.equal(both.accounts[0].cookieCount,2);
  f.replace([host]);
  const single=await f.dispatch('create',{revision:1,displayName:'host only'});
  const expected=f.rows();
  f.replace([host,shared]);
  assert.equal((await f.dispatch('switch',{revision:2,alias:single.accounts[1].alias})).verified,true);
  assert.deepEqual(f.rows(),expected);
  assert.equal((await f.dispatch('switch',{revision:2,alias:both.accounts[0].alias})).verified,true);
  assert.deepEqual(f.rows().sort((a,b)=>identity(a).localeCompare(identity(b))),
    [host,shared].sort((a,b)=>identity(a).localeCompare(identity(b))));
});

test('account capture, update, switching and exact deletion preserve literal Paths',async t=>{
  const f=await fixture(t);
  const expected=[cookie({path:'/a/../b'}),cookie({name:'question',path:'/account?x'}),
    cookie({name:'backslash',path:'/a\\b'}),cookie({name:'space',path:'/a b'})];
  f.replace(expected);
  const saved=await f.dispatch('create',{revision:0,displayName:'literal paths'});
  assert.equal(saved.accounts[0].cookieCount,4);
  f.replace(expected.map(row=>({...row,value:'renewed'})));
  const updated=await f.dispatch('update',{revision:1,alias:saved.accounts[0].alias,accountVersion:1});
  assert.equal(updated.revision,2);
  f.replace([cookie({name:'extra',path:'/a/../extra'})]);
  assert.equal((await f.dispatch('switch',{revision:2,alias:saved.accounts[0].alias})).verified,true);
  assert.deepEqual(f.rows().sort((a,b)=>identity(a).localeCompare(identity(b))),
    expected.map(row=>({...row,value:'renewed'})).sort((a,b)=>identity(a).localeCompare(identity(b))));
});

test('CSDN final readback retains live parent evidence when the last root Cookie is removed',async t=>{
  const f=await fixture(t);
  f.document.url=origin+'/account';
  f.replace([cookie({name:'scoped',path:'/account'})]);
  const saved=await f.dispatch('create',{revision:0,displayName:'path fixture'});
  f.document.url=origin+'/';
  f.replace([...f.rows(),cookie({name:'extra_root'})]);
  const switched=await f.dispatch('switch',{revision:1,alias:saved.accounts[0].alias});
  assert.equal(switched.verified,true);
  assert.deepEqual(f.rows(),[cookie({name:'scoped',path:'/account'})]);
  assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].expirationDate,0,'remove expires the exact native identity');
});

test('CSDN uncertain native write stops the remaining steps and is not retried',async t=>{
  const f=await fixture(t);
  const saved=await f.dispatch('create',{revision:0,displayName:'CSDN fixture'});
  f.replace(f.rows().map(row=>({...row,value:'fiction-b'})));
  const set=f.api.cookies.set;
  f.api.cookies.set=function(details,callback){
    set.call(this,details,()=>callback(null));
  };
  await assert.rejects(f.dispatch('switch',{revision:1,alias:saved.accounts[0].alias}),
    {code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.writes.length,1);
});
