import test from 'node:test';
import assert from 'node:assert/strict';
import {validateManagedProxyConfig,compileManagedProxyPac,createBrowserManagedProxy,
  stopManagedProxyForTool,reconcileManagedProxy,MANAGED_PROXY_STORE}
  from '../../src/platform/chrome/browser-managed-proxy.js';

// These are real production Driver imports with simulated Chrome primitives.
// PASS here is Node/component evidence only: it never proves native Chrome traffic.
const owner=(id='first-tool')=>({toolId:id,packageHash:(id==='first-tool'?'a':'b').repeat(64),epoch:'epoch-1'});
const input={config:{endpoint:{scheme:'socks5',host:'proxy.example.com',port:1080},
  domains:['chatgpt.com','claude.ai']}};
const code=value=>error=>error?.code===value;
const REVIEWED_FIXTURE_PROFILE={reviewId:'FIXTURE-PROXY-REVIEW-0001',
  reviewedAt:'2026-10-15',reviewedBy:'node-fixture',toolId:'first-tool',
  packageHash:'a'.repeat(64),config:input.config};
function fixture({lockManager=null,reviewedProfiles=[REVIEWED_FIXTURE_PROFILE]}={}){
  const data=new Map(),calls={set:[],clear:[],writes:[],alarms:[]};
  let control='controllable_by_this_extension',chromeValue=null,permission=true,
    failSet=false,failClear=false,failAfterStorageCommit=false,authorized=true,revokeOnApplying=false;
  const clone=value=>value===undefined?undefined:structuredClone(value);
  const storage={async get(keys){
    const list=Array.isArray(keys)?keys:[keys];
    return Object.fromEntries(list.filter(key=>data.has(key)).map(key=>[key,clone(data.get(key))]));
  },async set(items){
    calls.writes.push(clone(items));
    for(const [key,value] of Object.entries(items))data.set(key,clone(value));
    if(revokeOnApplying&&items[MANAGED_PROXY_STORE]?.phase==='applying')authorized=false;
    if(failAfterStorageCommit)throw Error('storage ack lost');
  },async remove(key){data.delete(key);}};
  const api={storage:{local:storage},
    permissions:{contains:async({permissions})=>permission&&permissions?.includes('proxy')},
    alarms:{create:async(...args)=>calls.alarms.push(['create',...args]),
      clear:async name=>{calls.alarms.push(['clear',name]);return true;}},
    proxy:{settings:{
      async get(){return {levelOfControl:control,value:clone(chromeValue)};},
      async set(row){
        calls.set.push(clone(row));control='controlled_by_this_extension';
        chromeValue=clone(row.value);
        if(failSet)throw Error('native set ack lost');
      },
      async clear(row){
        calls.clear.push(clone(row));
        if(failClear)throw Error('native clear failed');
        control='controllable_by_this_extension';chromeValue=null;
      }
    }}};
  const locks=lockManager??{request:(_name,work)=>work()};
  const driver=createBrowserManagedProxy({api,lockManager:locks,reviewedProfiles,
    authorizeEnable:async()=>{
      if(!authorized)throw Object.assign(new Error('Revoked installed identity'),{code:'E_TOOL_CHANGED'});
    }});
  return {api,driver,locks,calls,data,
    native:()=>({control,value:clone(chromeValue)}),
    setLevel:next=>{control=next;},
    setPermission:next=>{permission=next;},
    setSetAckLost:next=>{failSet=next;},
    setClearFailure:next=>{failClear=next;},
    setStorageAckLost:next=>{failAfterStorageCommit=next;},
    setAuthorized:next=>{authorized=next;},
    setRevokeOnApplying:next=>{revokeOnApplying=next;}};
}
test('managed proxy compiler admits only bounded declarative endpoint and website rules',()=>{
  const ownerRecord={toolId:'first-tool',packageHash:'a'.repeat(64),installEpoch:'epoch-1'};
  const pac=compileManagedProxyPac(input.config,ownerRecord);
  assert.match(pac,/SOCKS5 proxy\.example\.com:1080/);
  assert.match(pac,/chatgpt\.com/);
  assert.match(pac,/claude\.ai/);
  assert.match(pac,/return "DIRECT"/);
  assert(!pac.includes('PROXY proxy.example.com'));
  assert.deepEqual(validateManagedProxyConfig(input.config).domains,
    ['chatgpt.com','claude.ai']);
  const invalid=[
    {endpoint:{scheme:'http',host:'proxy.example.com',port:8080},domains:['chatgpt.com']},
    {endpoint:{scheme:'https',host:'127.0.0.1',port:7897},domains:['chatgpt.com']},
    {endpoint:{scheme:'https',host:'localhost',port:7897},domains:['chatgpt.com']},
    {endpoint:{scheme:'https',host:'proxy.example.com',port:0},domains:['chatgpt.com']},
    {endpoint:{scheme:'https',host:'proxy.example.com',port:443},domains:['chatgpt.com','chatgpt.com']},
    {endpoint:{scheme:'https',host:'proxy.example.com',port:443},domains:['*.chatgpt.com']},
    {endpoint:{scheme:'https',host:'proxy.example.com',port:443},domains:['evil.com");return "DIRECT"//']},
    {...input.config,pacScript:'function FindProxyForURL(){ return "DIRECT"; }'},
    {...input.config,domains:Array(17).fill('chatgpt.com')}
  ];
  for(const value of invalid)assert.throws(()=>validateManagedProxyConfig(value),code('E_PROXY_CONFIG'));
});
test('managed proxy SDK ENABLE/STOP changes only verified owned Chrome PAC, never global DIRECT',async()=>{
  const f=fixture();
  assert.equal((await f.driver.getStatus({},owner())).state,'disabled');
  const first=await f.driver.requestEnable(input,owner());
  assert.equal(first.state,'enabled');
  assert.equal(first.control,'controlled_by_this_extension');
  assert.equal(f.calls.set.length,1);
  assert.equal(f.calls.set[0].scope,'regular');
  assert.equal(f.calls.set[0].value.pacScript.mandatory,true);
  assert.match(f.native().value.pacScript.data,/SOCKS5 proxy\.example\.com:1080/);
  const second=await f.driver.requestDisable({},owner());
  assert.equal(second.state,'disabled');
  assert.equal(f.calls.clear.length,1);
  assert.deepEqual(f.calls.clear[0],{scope:'regular'});
  assert.equal(f.calls.set.length,1,'STOP never writes a global DIRECT ProxyConfig');
  assert.equal(f.data.get(MANAGED_PROXY_STORE).phase,'released');
});
test('global proxy ownership rejects another installed tool, stale package, and masked native state',async()=>{
  const f=fixture();
  await f.driver.requestEnable(input,owner());
  assert.equal((await f.driver.getStatus({},owner('other-tool'))).state,'conflict');
  await assert.rejects(f.driver.requestEnable(input,owner('other-tool')),code('E_PROXY_OWNERSHIP'));
  await assert.rejects(f.driver.requestDisable({},owner('other-tool')),code('E_PROXY_OWNERSHIP'));
  await assert.rejects(f.driver.requestDisable({}, {...owner(),packageHash:'e'.repeat(64)}),
    code('E_PROXY_OWNERSHIP'));
  assert.equal(f.calls.clear.length,0);
  f.setLevel('controlled_by_other_extensions');
  await assert.rejects(f.driver.requestDisable({},owner()),code('E_PROXY_OWNERSHIP'));
  assert.equal(f.calls.clear.length,0,'No clearing a masked or foreign proxy');
});
test('native and enterprise policy conflict cannot be overwritten and does not create a journal',async()=>{
  for(const control of ['controlled_by_other_extensions','not_controllable','controlled_by_this_extension']){
    const f=fixture();f.setLevel(control);
    await assert.rejects(f.driver.requestEnable(input,owner()),code('E_PROXY_CONFLICT'));
    assert.equal(f.calls.set.length,0);
    assert.equal(f.data.get(MANAGED_PROXY_STORE),undefined);
  }
});
test('unknown ENABLE acknowledgement is durably fenced, never repeated, and can explicitly STOP',async()=>{
  const f=fixture();f.setSetAckLost(true);
  await assert.rejects(f.driver.requestEnable(input,owner()),code('E_OUTCOME_UNKNOWN'));
  assert.equal(f.calls.set.length,1);
  assert.equal(f.data.get(MANAGED_PROXY_STORE).phase,'applying');
  const status=await f.driver.getStatus({},owner());
  assert.equal(status.state,'unavailable');
  assert.equal(status.canStop,true);
  await assert.rejects(f.driver.requestEnable(input,owner()),code('E_PROXY_OWNERSHIP'));
  assert.equal(f.calls.set.length,1);
  f.setSetAckLost(false);
  assert.equal((await f.driver.requestDisable({},owner())).state,'disabled');
  assert.equal(f.calls.clear.length,1);
});
test('STOP writes intent before Chrome effect, and a worker wake completes a previously failed STOP',async()=>{
  const f=fixture();
  await f.driver.requestEnable(input,owner());
  f.setClearFailure(true);
  await assert.rejects(f.driver.requestDisable({},owner()));
  assert.equal(f.data.get(MANAGED_PROXY_STORE).phase,'stopping');
  assert.equal(f.native().control,'controlled_by_this_extension');
  f.setClearFailure(false);
  assert.equal(await reconcileManagedProxy(f.api,{lockManager:f.locks}),'released');
  assert.equal(f.calls.clear.length,2);
  assert.equal(f.data.get(MANAGED_PROXY_STORE).phase,'released');
});
test('legacy AI ownership is isolated and blocks activation without deleting historical data',async()=>{
  const f=fixture();
  f.data.set('opendesk.ai-access.state.v1',{desired:true,releasePending:false});
  await assert.rejects(f.driver.requestEnable(input,owner()),code('E_PROXY_LEGACY_HOLD'));
  assert.equal(f.calls.set.length,0);
  assert.equal(f.calls.clear.length,0);
  assert.equal(f.data.get('opendesk.ai-access.state.v1').desired,true);
});
test('storage write acknowledgement lost after durable commit is verified before native mutation',async()=>{
  const f=fixture();f.setStorageAckLost(true);
  await f.driver.requestEnable(input,owner());
  assert.equal(f.calls.set.length,1);
  assert.equal(f.data.get(MANAGED_PROXY_STORE).phase,'enabled');
  await f.driver.requestDisable({},owner());
  assert.equal(f.data.get(MANAGED_PROXY_STORE).phase,'released');
});
test('uninstall releases only the exact owner; foreign tool unload is a no-op',async()=>{
  const f=fixture();
  await f.driver.requestEnable(input,owner());
  const first=await stopManagedProxyForTool(f.api,'other-tool',{lockManager:f.locks});
  assert.equal(first,false);
  assert.equal(f.calls.clear.length,0);
  const removed=[];
  await stopManagedProxyForTool(f.api,'first-tool',{lockManager:f.locks,
    removeVerifiedKey:async(api,key)=>{removed.push(key);await api.storage.local.remove(key);}});
  assert.deepEqual(removed,[MANAGED_PROXY_STORE]);
  assert.equal(f.calls.clear.length,1);
  assert.equal(f.data.has(MANAGED_PROXY_STORE),false);
});
test('missing Chrome proxy permission rejects ENABLE without a native effect',async()=>{
  const f=fixture();f.setPermission(false);
  const st=await f.driver.getStatus({},owner());
  assert.equal(st.permission,false);assert.equal(st.state,'unavailable');
  await assert.rejects(f.driver.requestEnable(input,owner()),code('E_CHROME_PERMISSION_REQUIRED'));
  assert.equal(f.calls.set.length,0);
});

test('ENABLE rejects unreviewed routes, package hashes and missing trusted revalidation',async()=>{
  const f=fixture({reviewedProfiles:[]});
  await assert.rejects(f.driver.requestEnable(input,owner()),code('E_PROXY_PROFILE_NOT_APPROVED'));
  assert.equal(f.calls.set.length,0);
  assert.equal(f.data.has(MANAGED_PROXY_STORE),false);
  const g=fixture();
  await assert.rejects(g.driver.requestEnable(input,{...owner(),packageHash:'f'.repeat(64)}),
    code('E_PROXY_PROFILE_NOT_APPROVED'));
  await assert.rejects(g.driver.requestEnable({config:{...input.config,
    endpoint:{...input.config.endpoint,host:'unreviewed-proxy.example.org'}}},owner()),
    code('E_PROXY_PROFILE_NOT_APPROVED'));
  assert.equal(g.calls.set.length,0);
  const missingHost=createBrowserManagedProxy({api:g.api,lockManager:g.locks,
    reviewedProfiles:[REVIEWED_FIXTURE_PROFILE]});
  await assert.rejects(missingHost.requestEnable(input,owner()),code('E_PROXY_AUTHORIZATION_REQUIRED'));
});
test('ENABLE rechecks install permission after a wait for the global lock',async()=>{
  let unblock,entered;
  const started=new Promise(resolve=>{entered=resolve;});
  const gate=new Promise(resolve=>{unblock=resolve;});
  const f=fixture({lockManager:{request:(_name,work)=>{entered();return gate.then(work);}}});
  const pending=f.driver.requestEnable(input,owner());
  await started;f.setAuthorized(false);unblock();
  await assert.rejects(pending,code('E_TOOL_CHANGED'));
  assert.equal(f.data.has(MANAGED_PROXY_STORE),false);
  assert.equal(f.calls.set.length,0);
});
test('revocation after applying persistence blocks native set and preserves STOP recovery',async()=>{
  const f=fixture();f.setRevokeOnApplying(true);
  await assert.rejects(f.driver.requestEnable(input,owner()),code('E_TOOL_CHANGED'));
  assert.equal(f.data.get(MANAGED_PROXY_STORE).phase,'applying');
  assert.equal(f.calls.set.length,0);
  f.setAuthorized(true);
  assert.equal((await f.driver.requestDisable({},owner())).state,'disabled');
  assert.equal(f.data.get(MANAGED_PROXY_STORE).phase,'released');
});
test('previously approved ownership can STOP with the production profile list empty',async()=>{
  const f=fixture();await f.driver.requestEnable(input,owner());
  const production=createBrowserManagedProxy({api:f.api,lockManager:f.locks});
  assert.equal((await production.requestDisable({},owner())).state,'disabled');
  assert.equal(f.calls.clear.length,1);
});
