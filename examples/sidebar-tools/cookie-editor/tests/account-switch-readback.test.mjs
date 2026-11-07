import test from 'node:test';
import assert from 'node:assert/strict';
import {createCookieAccountService,validateAccountCookieRow,planAccountCookieEffects}
  from '../trusted/account-service.js';
import {COOKIE_ACCOUNT_PROTOCOL,COOKIE_ACCOUNT_STORE_KEY} from '../trusted/account-contract.js';
import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage,sidebarToolPackageHash}
  from '../../../../src/ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE} from '../../../../src/ui/sidebar-tools/lifecycle.js';
import {BROWSER_MENU_GRANTS_STORE} from '../../../../src/framework/sdk/browser-contract.js';

const origin='https://example.com';
const partition={topLevelSite:origin,hasCrossSiteAncestor:false};
const cookie=()=>({name:'partitioned_session',value:'fictional-session',domain:'example.com',
  path:'/',storeId:'0',hostOnly:true,session:true,secure:true,httpOnly:true,
  sameSite:'lax',partitionKey:{...partition}});
const reordered=value=>Array.isArray(value)?value.map(reordered):
  value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort()
    .map(key=>[key,reordered(value[key])])):value;
const samePartition=(a,b)=>Boolean(a)===Boolean(b)&&(!a||
  a.topLevelSite===b.topLevelSite&&Boolean(a.hasCrossSiteAncestor)===Boolean(b.hasCrossSiteAncestor));

async function fixture(){
  const tool=validateSidebarToolPackage({format:'opendesk.sidebar-tool.v2',id:'cookie-editor',
    version:'1.0.0',title:'Cookie Editor',description:'Fictional partitioned switch fixture',
    capabilities:['browser.cookies.read','browser.cookies.values','browser.cookies.write'],
    requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},html:'<main></main>',css:'',js:'void 0;'});
  const hash=await sidebarToolPackageHash(tool);
  const document={tabId:1,documentId:'page-document',url:origin+'/'};
  const sender={id:'test',documentId:'host-document',frameId:0,
    url:'chrome-extension://test/sidepanel.html?hostInstanceId=00000000-0000-4000-8000-000000000000&toolId=cookie-editor'};
  const state={[SIDEBAR_TOOL_STORE]:[tool],[TOOL_REVOCATION_EPOCHS_STORE]:{'cookie-editor':'epoch'},
    [BROWSER_MENU_GRANTS_STORE]:{'cookie-editor':{version:tool.version,packageHash:hash,installEpoch:'epoch',
      cookieSites:{[origin]:{read:true,values:true,write:true,grantEpoch:'grant',storeId:'0'}}}}};
  const records=new Map();
  const storage=async()=>({transaction:async(_stores,mode,work)=>work({
    get:async(_store,key)=>structuredClone(records.get(key)),
    put:async(_store,value,key)=>{assert.equal(mode,'readwrite');records.set(key,reordered(value));},
    delete:async(_store,key)=>records.delete(key)
  })});
  const control={row:cookie(),extraRows:[],writes:0,reloads:0,reloadedTabs:[],corrupt:false,finalMismatch:false,permission:true};
  const identity=row=>JSON.stringify([row.name,row.domain,row.path,row.storeId,row.partitionKey??null]);
  const api={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,
    getContexts:async()=>[{contextType:'SIDE_PANEL',documentUrl:sender.url,
      documentId:sender.documentId,frameId:0,incognito:false}]},
    storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys])
      .filter(key=>Object.hasOwn(state,key)).map(key=>[key,structuredClone(state[key])]))}},
    permissions:{contains:async()=>control.permission},
    tabs:{get:async()=>({id:document.tabId,url:document.url,active:true,incognito:false}),
      reload:async tabId=>{control.reloads++;control.reloadedTabs.push(tabId);
        if(control.reloadError)throw Error('Fictional reload failure');
        if(control.onReload)await control.onReload();}},
    webNavigation:{getFrame:async()=>({...document,documentLifecycle:'active'})},
    cookies:{getAllCookieStores:async()=>[{id:'0',tabIds:[document.tabId]}],
      getPartitionKey:async()=>({partitionKey:{...partition}}),
      getAll(query,callback){
        // A later observation can differ after the exact effect was witnessed.
        if(!callback&&control.writes&&control.finalReadError)
          return Promise.reject(Error('Fictional post-effect read unavailable'));
        if(!callback&&control.writes&&control.finalMismatch)control.row.value='changed-by-website';
        if(!callback&&control.writes&&control.finalRevoke)control.permission=false;
        const rows=[control.row,...control.extraRows].filter(Boolean).filter(row=>
          samePartition(query.partitionKey,row.partitionKey)&&
          (!query.name||query.name===row.name)&&(!query.path||query.path===row.path))
          .map(row=>structuredClone(row));
        if(!callback&&control.driftAfterSnapshot&&query.url&&query.partitionKey)
          control.row.value='changed-after-initial-snapshot';
        if(callback)callback(rows);else return Promise.resolve(rows);
      },
      set(details,callback){
        control.writes++;
        const row={name:details.name,value:control.corrupt?'changed-by-website':details.value,
          domain:details.domain??new URL(details.url).hostname,path:details.path,
          storeId:details.storeId,hostOnly:details.domain===undefined,
          session:details.expirationDate===undefined,secure:details.secure,
          httpOnly:details.httpOnly,sameSite:details.sameSite,
          ...(details.partitionKey?{partitionKey:{...details.partitionKey}}:{}),
          ...(details.expirationDate!==undefined?{expirationDate:details.expirationDate}:{})};
        const matches=c=>c&&identity(c)===identity(row);
        if(details.expirationDate!==undefined&&details.expirationDate<=Date.now()/1000){
          if(control.retainExpired){callback(null);return;}
          if(matches(control.row))control.row=null;
          control.extraRows=control.extraRows.filter(c=>!matches(c));callback(null);return;
        }
        if(matches(control.row))control.row=row;
        else{
          control.extraRows=control.extraRows.filter(c=>!matches(c));control.extraRows.push(row);
        }
        if(control.revokeAfterSet)control.permission=false;
        callback(control.omitReceipt?undefined:structuredClone(row));
      }
    }};
  const service=createCookieAccountService({api,storage});
  return {control,records,state,document,sender,api,tool,hash,storage,navigation:service.navigation,dispatch:(operation,payload={})=>service.dispatch({
    protocol:COOKIE_ACCOUNT_PROTOCOL,toolId:'cookie-editor',operation,
    packageHash:control.messageHash??hash,installEpoch:control.messageEpoch??'epoch',trustedClick:true,payload:{origin,document,...payload}
  },sender)};
}

test('partitioned account switch verifies a Foundation round trip with reordered keys',async()=>{
  const f=await fixture();
  const saved=await f.dispatch('create',{revision:0,displayName:'Fictional account'});
  f.control.row.value='different-session';
  const result=await f.dispatch('switch',{revision:1,alias:saved.accounts[0].alias});
  assert.deepEqual(result,{switched:true,verified:true,verification:'cookie-effects',
    snapshotState:'matches',loginVerified:false,changed:1,reloadRequested:true});
  assert.equal(f.control.writes,1);assert.equal(f.control.reloads,1);
  assert.doesNotMatch(JSON.stringify(result),/fictional-session|partitioned_session/);
});

test('an unchanged partitioned account does not rewrite Cookies because storage reordered fields',async()=>{
  const f=await fixture();
  const saved=await f.dispatch('create',{revision:0,displayName:'Fictional account'});
  const result=await f.dispatch('switch',{revision:1,alias:saved.accounts[0].alias});
  assert.equal(result.verified,true);assert.equal(result.changed,0);
  assert.equal(f.control.writes,0);
});

test('a Cookie on an unrelated literal Path verifies even when Chrome returns no set object',async()=>{
  const f=await fixture();f.control.row.path='/backend-api/pages';
  const saved=await f.dispatch('create',{revision:0,displayName:'Fictional account'});
  f.control.row.value='different-session';f.control.omitReceipt=true;
  const result=await f.dispatch('switch',{revision:1,alias:saved.accounts[0].alias});
  assert.deepEqual(result,{switched:true,verified:true,verification:'cookie-effects',
    snapshotState:'matches',loginVerified:false,changed:1,reloadRequested:true});
  assert.equal(f.control.row.path,'/backend-api/pages');
  assert.equal(f.control.row.value,'fictional-session');
  assert.equal(f.control.writes,1);assert.equal(f.control.reloads,1);
});

test('missing legacy cross-site-ancestor false and native false identify the same partition',()=>{
  const legacy=cookie();delete legacy.partitionKey.hasCrossSiteAncestor;
  const checked=validateAccountCookieRow(legacy,'example.com','0',partition);
  const native=validateAccountCookieRow(cookie(),'example.com','0',partition);
  assert.deepEqual(checked,native);
  assert.deepEqual(planAccountCookieEffects([native],[checked]),[]);
  for(const changed of [{topLevelSite:'https://other.example'},
    {...partition,hasCrossSiteAncestor:true}])
    assert.throws(()=>validateAccountCookieRow({...legacy,partitionKey:changed},
      'example.com','0',partition),{code:'E_ACCOUNT_COOKIE_SCOPE'});
});

for(const phase of ['corrupt'])
test(`a real Cookie mismatch at ${phase} remains unknown without replay or refresh`,async()=>{
  const f=await fixture();
  const saved=await f.dispatch('create',{revision:0,displayName:'Fictional account'});
  f.control.row.value='different-session';f.control[phase]=true;
  await assert.rejects(f.dispatch('switch',{revision:1,alias:saved.accounts[0].alias}),
    {code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.control.writes,1);assert.equal(f.control.reloads,0);
});

test('a later snapshot change preserves witnessed effects and still refreshes only the target',async()=>{
  const f=await fixture();
  const saved=await f.dispatch('create',{revision:0,displayName:'Fictional account'});
  const before=structuredClone(f.records.get(COOKIE_ACCOUNT_STORE_KEY));
  f.control.row.value='different-session';f.control.finalMismatch=true;
  const result=await f.dispatch('switch',{revision:1,alias:saved.accounts[0].alias});
  assert.equal(result.switched,true);assert.equal(result.verified,true);
  assert.equal(result.verification,'cookie-effects');
  assert.equal(result.snapshotState,'differs');assert.equal(result.loginVerified,false);
  assert.equal(f.control.writes,1);assert.equal(f.control.reloads,1);
  assert.deepEqual(f.control.reloadedTabs,[1]);
  assert.deepEqual(f.records.get(COOKIE_ACCOUNT_STORE_KEY),before);
});

test('a no-op plan can report later drift without claiming any Cookie writes',async()=>{
  const f=await fixture();
  const saved=await f.dispatch('create',{revision:0,displayName:'Fictional account'});
  const before=structuredClone(f.records.get(COOKIE_ACCOUNT_STORE_KEY));
  f.control.driftAfterSnapshot=true;
  const result=await f.dispatch('switch',{revision:1,alias:saved.accounts[0].alias});
  assert.equal(result.snapshotState,'differs');assert.equal(result.changed,0);
  assert.equal(result.loginVerified,false);assert.equal(f.control.writes,0);
  assert.deepEqual(f.control.reloadedTabs,[1]);
  assert.deepEqual(f.records.get(COOKIE_ACCOUNT_STORE_KEY),before);
});

test('an unavailable final read conservatively stops without replay or refresh',async()=>{
  const f=await fixture();
  const saved=await f.dispatch('create',{revision:0,displayName:'Fictional account'});
  const before=structuredClone(f.records.get(COOKIE_ACCOUNT_STORE_KEY));
  f.control.row.value='different-session';f.control.finalReadError=true;
  await assert.rejects(f.dispatch('switch',{revision:1,alias:saved.accounts[0].alias}),
    {code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.control.writes,1);assert.deepEqual(f.control.reloadedTabs,[]);
  assert.deepEqual(f.records.get(COOKIE_ACCOUNT_STORE_KEY),before);
});

for(const phase of ['revokeAfterSet','finalRevoke'])
test(`a witnessed effect does not permit refresh after revocation at ${phase}`,async()=>{
  const f=await fixture();
  const saved=await f.dispatch('create',{revision:0,displayName:'Fictional account'});
  f.control.row.value='different-session';f.control[phase]=true;
  await assert.rejects(f.dispatch('switch',{revision:1,alias:saved.accounts[0].alias}),
    {code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.control.writes,1);assert.equal(f.control.reloads,0);
});

test('witnessed effects with later drift obey automatic refresh disabled',async()=>{
  const f=await fixture();
  const saved=await f.dispatch('create',{revision:0,displayName:'Fictional account'});
  f.records.get(COOKIE_ACCOUNT_STORE_KEY).settings.autoRefresh=false;
  f.control.row.value='different-session';f.control.finalMismatch=true;
  const result=await f.dispatch('switch',{revision:1,alias:saved.accounts[0].alias});
  assert.equal(result.snapshotState,'differs');assert.equal(result.reloadRequested,false);
  assert.equal(f.control.writes,1);assert.deepEqual(f.control.reloadedTabs,[]);
});

test('revocation before switching rejects the saved partitioned snapshot without writes',async()=>{
  const f=await fixture();
  const saved=await f.dispatch('create',{revision:0,displayName:'Fictional account'});
  f.control.permission=false;
  await assert.rejects(f.dispatch('switch',{revision:1,alias:saved.accounts[0].alias}),
    {code:'E_SITE_GRANT_REQUIRED'});
  assert.equal(f.control.writes,0);assert.equal(f.control.reloads,0);
});

async function expiredFixture(){
  const f=await fixture();
  f.control.extraRows=[{...cookie(),name:'short_lived',session:false,
    expirationDate:Date.now()/1000+3600}];
  const saved=await f.dispatch('create',{revision:0,displayName:'Fictional account'});
  const record=f.records.get(COOKIE_ACCOUNT_STORE_KEY);
  record.accounts[0].cookies.find(row=>row.name==='short_lived').expirationDate=1;
  return {...f,alias:saved.accounts[0].alias,record};
}

test('restore applies expiry as verified absence without rejecting the valid login Cookie',async()=>{
  const f=await expiredFixture();
  const before=structuredClone(f.record);
  f.control.row.value='different-session';
  const result=await f.dispatch('switch',{revision:1,alias:f.alias});
  assert.deepEqual(result,{switched:true,verified:true,verification:'cookie-effects',
    snapshotState:'matches',loginVerified:false,changed:2,reloadRequested:true});
  assert.equal(f.control.row.value,'fictional-session');
  assert.deepEqual(f.control.extraRows,[]);
  assert.equal(f.control.writes,2);assert.equal(f.control.reloads,1);
  assert.deepEqual(f.records.get(COOKIE_ACCOUNT_STORE_KEY),before,
    'restore never rewrites or extends the saved snapshot');
});

test('expired snapshot rows already absent are a verified no-op',async()=>{
  const f=await expiredFixture();f.control.extraRows=[];
  const result=await f.dispatch('switch',{revision:1,alias:f.alias});
  assert.equal(result.verified,true);assert.equal(result.changed,0);
  assert.equal(f.control.writes,0);assert.equal(f.control.reloads,1);
});

test('failure to remove an expired identity stays unknown without replay or refresh',async()=>{
  const f=await expiredFixture();f.control.retainExpired=true;
  await assert.rejects(f.dispatch('switch',{revision:1,alias:f.alias}),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.control.writes,1);assert.equal(f.control.reloads,0);
  assert.equal(f.control.extraRows.length,1);
});

test('a snapshot with no unexpired Cookies rejects before changing the current login',async()=>{
  const f=await expiredFixture();
  f.record.accounts[0].cookies=f.record.accounts[0].cookies.filter(row=>row.name==='short_lived');
  await assert.rejects(f.dispatch('switch',{revision:1,alias:f.alias}),{code:'E_ACCOUNT_EXPIRED'});
  assert.equal(f.control.writes,0);assert.equal(f.control.reloads,0);
});

test('expired rows still require exact scope and valid attributes before any effects',async()=>{
  for(const change of [{domain:'other.example'}, {storeId:'1'},
    {partitionKey:{...partition,topLevelSite:'https://other.example'}},
    {path:'/bad;path'}, {sameSite:'invalid'},
    ...[NaN,Infinity,'1',0,-1,253402300800].map(expirationDate=>({expirationDate})),
    {name:'__Secure-bad',secure:false}]){
    const f=await expiredFixture();
    Object.assign(f.record.accounts[0].cookies.find(row=>row.name==='short_lived'),change);
    await assert.rejects(f.dispatch('switch',{revision:1,alias:f.alias}),{code:'E_ACCOUNT_COOKIE_SCOPE'});
    assert.equal(f.control.writes,0);assert.equal(f.control.reloads,0);
  }
  const f=await expiredFixture();
  f.record.accounts[0].cookies.push(structuredClone(
    f.record.accounts[0].cookies.find(row=>row.name==='short_lived')));
  await assert.rejects(f.dispatch('switch',{revision:1,alias:f.alias}),{code:'E_ACCOUNT_COOKIE_SCOPE'});
  assert.equal(f.control.writes,0);assert.equal(f.control.reloads,0);
});


async function appliedFixture(){
  const f=await fixture();
  const saved=await f.dispatch('create',{revision:0,displayName:'Fictional account'});
  f.alias=saved.accounts[0].alias;
  const switched=await f.dispatch('switch',{revision:1,alias:f.alias});
  assert.equal(switched.verified,true);
  return f;
}
const proof=(f,snapshotState='matches')=>({alias:f.alias,version:1,snapshotState,loginVerified:false});
const siteGrant=f=>f.state[BROWSER_MENU_GRANTS_STORE]['cookie-editor'].cookieSites[origin];

test('manual display survives confirmed own reload and queued status of the new live document',async()=>{
  const f=await fixture();
  const saved=await f.dispatch('create',{revision:0,displayName:'Fictional account'});f.alias=saved.accounts[0].alias;
  const before=structuredClone(f.records);
  f.document.url=origin+'/?secret=never-retain#private';
  f.control.onReload=()=>{f.document.documentId='refreshed-page';};
  const switching=f.dispatch('switch',{revision:1,alias:f.alias});
  const queued=f.dispatch('status');
  await switching;
  const status=await queued;
  assert.deepEqual(status.lastApplied,proof(f));
  assert.deepEqual(Object.keys(status.lastApplied).sort(),['alias','loginVerified','snapshotState','version']);
  assert.doesNotMatch(JSON.stringify(status),/fictional-session|partitioned_session|page-document|host-document|secret|private|storeId|partitionKey/);
  assert.deepEqual(f.records,before,'display metadata never persists a Cookie log or updates snapshots');
  assert.equal((await f.dispatch('status',{document:undefined})).lastApplied,undefined,
    'legacy status does not include display proof');
});

test('read-only status observes website drift without update permission or snapshot mutation',async()=>{
  const f=await appliedFixture();
  const before=structuredClone(f.records);
  siteGrant(f).write=false;
  f.control.row.value='website-rotated-session';
  const status=await f.dispatch('status');
  assert.deepEqual(status.lastApplied,proof(f,'differs'));
  assert.deepEqual(f.records,before);assert.equal(f.control.writes,0);assert.equal(f.control.reloads,1);
});

for(const drift of ['tab','url','origin','grant','source','store','partition','installEpoch','installHash','accountVersion','deleted','permission'])
test(`display proof is consumed after ${drift} mismatch and never resurrects`,async()=>{
  const f=await appliedFixture();
  const oldState=structuredClone(f.state),oldRecords=structuredClone(f.records),oldDocument={...f.document};
  let payload={};
  if(drift==='tab')f.document.tabId=2;
  if(drift==='url')f.document.url=origin+'/different-path';
  if(drift==='origin'){f.document.url='https://other.example/';payload={origin:'https://other.example'};}
  if(drift==='grant')siteGrant(f).grantEpoch='regranted';
  if(drift==='source')f.state[BROWSER_MENU_GRANTS_STORE]['cookie-editor'].cookieAllSites={...siteGrant(f),valueConsent:true};
  if(drift==='store')siteGrant(f).storeId='1';
  if(drift==='partition')siteGrant(f).partitionKey={...partition,topLevelSite:'https://other.example'};
  if(drift==='installEpoch'){
    f.control.messageEpoch='new-install';
    f.state[TOOL_REVOCATION_EPOCHS_STORE]['cookie-editor']='new-install';
    f.state[BROWSER_MENU_GRANTS_STORE]['cookie-editor'].installEpoch='new-install';
  }
  if(drift==='installHash'){
    const changed=validateSidebarToolPackage({...f.tool,description:'Changed actual install'});
    const hash=await sidebarToolPackageHash(changed);
    f.state[SIDEBAR_TOOL_STORE]=[changed];f.control.messageHash=hash;
    f.state[BROWSER_MENU_GRANTS_STORE]['cookie-editor'].packageHash=hash;
  }
  if(drift==='accountVersion')f.records.get(COOKIE_ACCOUNT_STORE_KEY).accounts[0].version++;
  if(drift==='deleted')f.records.get(COOKIE_ACCOUNT_STORE_KEY).accounts=[];
  if(drift==='permission')f.control.permission=false;
  assert.equal((await f.dispatch('status',payload)).lastApplied,undefined);
  Object.assign(f.document,oldDocument);Object.assign(f.state,oldState);
  f.records.clear();for(const [key,value] of oldRecords)f.records.set(key,value);
  delete f.control.messageEpoch;delete f.control.messageHash;f.control.permission=true;
  assert.equal((await f.dispatch('status')).lastApplied,undefined);
});

for(const failure of ['unknown','badAlias','revision','reload'])
test(`a second manual attempt clears display before ${failure} failure`,async()=>{
  const f=await appliedFixture();
  assert.deepEqual((await f.dispatch('status')).lastApplied,proof(f));
  const payload={revision:1,alias:f.alias};
  let code;
  if(failure==='unknown'){f.control.row.value='different';f.control.corrupt=true;code='E_OUTCOME_UNKNOWN';}
  if(failure==='badAlias'){payload.alias='missing';code='E_ACCOUNT_NOT_FOUND';}
  if(failure==='revision'){payload.revision=-1;code='E_VAULT_REVISION';}
  if(failure==='reload'){f.control.reloadError=true;code='E_REFRESH_OUTCOME_UNKNOWN';}
  await assert.rejects(f.dispatch('switch',payload),{code});
  f.control.corrupt=false;
  assert.equal((await f.dispatch('status')).lastApplied,undefined);
});

test('stale document rejection consumes display even after the original document returns',async()=>{
  const f=await appliedFixture();
  await assert.rejects(f.dispatch('status',{document:{...f.document,documentId:'stale'}}),{code:'E_DOCUMENT_CHANGED'});
  assert.equal((await f.dispatch('status')).lastApplied,undefined);
});

test('a replaced Host document cannot inherit another Host display',async()=>{
  const f=await appliedFixture();
  f.sender.documentId='replacement-host';
  assert.equal((await f.dispatch('status')).lastApplied,undefined);
});

for(const drift of ['grant','install','host'])
test(`status rechecks ${drift} after native read awaits`,async()=>{
  const f=await appliedFixture();
  const nativeGet=f.api.cookies.getAll;
  let changed=false;
  f.api.cookies.getAll=function(query,callback){
    if(!changed){
      changed=true;
      if(drift==='grant')siteGrant(f).grantEpoch='new-grant';
      if(drift==='install')f.state[TOOL_REVOCATION_EPOCHS_STORE]['cookie-editor']='new-install';
      if(drift==='host')f.api.runtime.getContexts=async()=>[];
    }
    return nativeGet.call(this,query,callback);
  };
  if(drift==='grant')assert.equal((await f.dispatch('status')).lastApplied,undefined);
  else await assert.rejects(f.dispatch('status'),{code:drift==='host'?'E_ACCOUNT_SENDER':'E_TOOL_CHANGED'});
  f.api.cookies.getAll=nativeGet;
  if(drift==='install')f.state[TOOL_REVOCATION_EPOCHS_STORE]['cookie-editor']='epoch';
  if(drift==='host')f.api.runtime.getContexts=async()=>[{contextType:'SIDE_PANEL',documentUrl:f.sender.url,
    documentId:f.sender.documentId,frameId:0,incognito:false}];
  assert.equal((await f.dispatch('status')).lastApplied,undefined);
});

test('display follows the native live partition rather than only the reviewed grant',async()=>{
  const f=await appliedFixture();
  f.api.cookies.getPartitionKey=async()=>({partitionKey:{...partition,hasCrossSiteAncestor:true}});
  assert.equal((await f.dispatch('status')).lastApplied,undefined);
  f.api.cookies.getPartitionKey=async()=>({partitionKey:{...partition}});
  assert.equal((await f.dispatch('status')).lastApplied,undefined);
});

test('display expires after fifteen minutes and returning the clock cannot revive it',async()=>{
  const f=await appliedFixture(),now=Date.now;
  try{
    const future=now()+16*60*1000;Date.now=()=>future;
    assert.equal((await f.dispatch('status')).lastApplied,undefined);
  }finally{Date.now=now;}
  assert.equal((await f.dispatch('status')).lastApplied,undefined);
});

test('a manual switch with refresh disabled still commits display after full confirmation',async()=>{
  const f=await fixture();
  const saved=await f.dispatch('create',{revision:0,displayName:'Fictional account'});f.alias=saved.accounts[0].alias;
  f.records.get(COOKIE_ACCOUNT_STORE_KEY).settings.autoRefresh=false;
  assert.equal((await f.dispatch('switch',{revision:1,alias:f.alias})).reloadRequested,false);
  assert.deepEqual((await f.dispatch('status')).lastApplied,proof(f));
  assert.equal(f.control.reloads,0);
});

test('a new service instance has no display history and legacy status never reads Cookies',async()=>{
  const f=await appliedFixture();
  f.api.cookies.getAll=()=>{throw Error('Legacy status must not read Cookies');};
  assert.equal((await f.dispatch('status',{document:undefined})).lastApplied,undefined);
  const fresh=createCookieAccountService({api:f.api,storage:f.storage});
  const status=await fresh.dispatch({protocol:COOKIE_ACCOUNT_PROTOCOL,toolId:'cookie-editor',
    operation:'status',packageHash:f.hash,installEpoch:'epoch',payload:{origin,document:f.document}},f.sender);
  assert.equal(status.lastApplied,undefined);
});

test('status keeps account metadata without a grant or optional document and consumes unusable proof',async()=>{
  const f=await appliedFixture();
  delete f.state[BROWSER_MENU_GRANTS_STORE]['cookie-editor'];
  f.api.cookies.getAll=()=>{throw Error('Missing grant must not read Cookies');};
  for(const payload of [{},{document:undefined}]){
    const status=await f.dispatch('status',payload);
    assert.equal(status.accounts[0].alias,f.alias);
    assert.equal(status.accounts[0].version,1);
    assert.equal(status.lastApplied,undefined);
  }
  f.state[BROWSER_MENU_GRANTS_STORE]['cookie-editor']={version:f.tool.version,
    packageHash:f.hash,installEpoch:'epoch',cookieSites:{[origin]:{
      read:true,values:true,write:true,grantEpoch:'grant',storeId:'0'}}};
  // No Cookie read is needed once the missing-grant check consumed the proof.
  assert.equal((await f.dispatch('status')).lastApplied,undefined);
});


test('navigation away consumes manual history even without a status read before returning',async()=>{
  for(const url of ['https://other.invalid/','https://example.com/other','about:blank']){
    const f=await appliedFixture();
    await f.navigation({tabId:1,frameId:0,url});
    await f.navigation({tabId:1,frameId:0,url:origin+'/'});
    assert.equal((await f.dispatch('status')).lastApplied,undefined,url);
  }
});

test('same-target reload completion preserves history and unrelated tabs cannot consume it',async()=>{
  const f=await appliedFixture();f.document.documentId='new-reload-document';
  await f.navigation({tabId:1,frameId:0,url:origin+'/'});
  await f.navigation({tabId:2,frameId:0,url:'https://elsewhere.invalid/'});
  assert.deepEqual((await f.dispatch('status')).lastApplied,proof(f));
});

for(const unknown of [false,true])test('automatic '+(unknown?'unknown':'success')+' retires prior manual display history',async()=>{
  const f=await appliedFixture();
  const stored=f.records.get(COOKIE_ACCOUNT_STORE_KEY);
  stored.settings.autoEnabled=true;stored.settings.autoRefresh=false;
  stored.accounts[0].allowAuto=true;
  const session={};
  f.api.storage.session={setAccessLevel:async()=>{},
    get:async key=>({[key]:structuredClone(session[key])}),
    set:async data=>Object.assign(session,structuredClone(data))};
  f.document.url=origin+'/#od-account='+f.alias;
  f.control.row.value='outside-change';
  if(unknown){f.control.corrupt=true;f.control.omitReceipt=true;}
  await f.navigation({tabId:1,frameId:0,url:f.document.url});
  assert.equal(f.control.writes,1,'automatic attempt reached real effect driver');
  assert.equal((await f.dispatch('status')).lastApplied,undefined);
});
