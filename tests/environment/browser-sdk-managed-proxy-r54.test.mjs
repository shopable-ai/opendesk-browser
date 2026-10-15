import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {createApprovedBrowserBindings} from '../../src/framework/sdk/browser-bindings.js';
import {BROWSER_OPERATIONS} from '../../src/framework/sdk/browser-contract.js';
import {
  MANAGED_PROXY_STORE,createBrowserManagedProxy,compileManagedProxyPac,
  validateManagedProxyConfig,reconcileManagedProxy
} from '../../src/platform/chrome/browser-managed-proxy.js';

const IDENTITY={toolId:'independent-proxy-tool',toolVersion:'1.0.0',
  packageHash:'a'.repeat(64),epoch:'epoch-1'};
const OTHER={toolId:'another-proxy-tool',toolVersion:'1.0.0',
  packageHash:'b'.repeat(64),epoch:'epoch-2'};
const CONFIG={endpoint:{scheme:'socks5',host:'proxy.example.org',port:1080},
  domains:['chatgpt.com','openai.com','claude.ai']};
const codeIs=code=>error=>error?.code===code;

// Real FIFO serialization in this fixture; absent locks separately fail closed.
// This models interleavings only, and is NOT a real Chrome Web Locks receipt.
function fixtureLocks(){
  const tails=new Map();
  return Object.freeze({
    request(name,run){
      const previous=tails.get(name)??Promise.resolve();
      let release;
      const gate=new Promise(resolve=>{release=resolve;});
      tails.set(name,previous.then(()=>gate));
      return previous.then(async()=>{
        try{return await run();}finally{release();}
      });
    }
  });
}
function fixture({lockManager=fixtureLocks()}={}){
  const local=Object.create(null),events={set:[],clear:[],alarms:[]};
  let value=null,level='controllable_by_this_extension',permission=true;
  let ackLost=false,authorized=true;
  const clone=value=>structuredClone(value);
  const api={
    storage:{local:{
      async get(keys){
        const names=Array.isArray(keys)?keys:[keys];
        return Object.fromEntries(names.filter(key=>Object.hasOwn(local,key))
          .map(key=>[key,clone(local[key])]));
      },
      async set(rows){for(const [key,row] of Object.entries(rows))local[key]=clone(row);}
    }},
    permissions:{contains:async({permissions})=>
      permission&&permissions.length===1&&permissions[0]==='proxy'},
    proxy:{settings:{
      async get(){return {levelOfControl:level,value:clone(value)};},
      async set({scope,value:next}){
        assert.equal(scope,'regular');events.set.push(clone(next));
        value=clone(next);level='controlled_by_this_extension';
        if(ackLost)throw Error('Simulated lost Chrome set acknowledgement');
      },
      async clear({scope}){
        assert.equal(scope,'regular');events.clear.push(scope);
        value=null;level='controllable_by_this_extension';
      }
    }},
    alarms:{async create(name,options){events.alarms.push({name,options});},
      async clear(){return true;}}
  };
  const driver=createBrowserManagedProxy({api,lockManager});
  const bindings=createApprovedBrowserBindings({'proxy.managed':driver});
  const makeSdk=owner=>createBrowserSdk({
    request:(operation,input)=>bindings.dispatch(operation,input,owner,{
      // This stub represents Host admission. It is not a real sender/gesture test.
      authorize:async()=>{
        if(!authorized)throw Object.assign(Error('Denied by trusted Host fixture'),
          {code:'E_TOOL_CAPABILITY_REQUIRED'});
      }
    })
  });
  return {
    api,local,events,locks:lockManager,makeSdk,sdk:makeSdk(IDENTITY),
    get value(){return clone(value);},
    get control(){return level;},
    set control(next){level=next;},
    set permission(next){permission=next;},
    set authorized(next){authorized=next;},
    set ackLost(next){ackLost=next;}
  };
}

test('R5.4 approved proxy operations reuse the one public SDK facade and finite Host service',()=>{
  for(const id of ['getStatus','requestEnable','requestDisable']){
    const row=BROWSER_OPERATIONS['browser.proxy.managed.'+id];
    assert(row,'Approved operation must exist in the canonical Registry');
    assert.deepEqual(row.requiredCapabilities,['browser.proxy.managed']);
    assert.deepEqual(row.requiredChromePermissions,['proxy']);
  }
  const f=fixture();
  assert.equal(typeof f.sdk.proxy.managed.getStatus,'function');
  assert.equal(typeof f.sdk.proxy.managed.requestEnable,'function');
  assert.equal(typeof f.sdk.proxy.managed.requestDisable,'function');
  assert.equal(f.sdk.proxy.settings,undefined,'Raw Chrome settings must never be public');
});

test('R5.4 a wholly independent tool performs scoped PAC and owned STOP via SDK',async()=>{
  const f=fixture();
  assert.deepEqual(await f.sdk.proxy.managed.getStatus(),{
    state:'disabled',control:'controllable_by_this_extension',
    permission:true,canStop:false,reason:null
  });
  const live=await f.sdk.proxy.managed.requestEnable({config:CONFIG});
  assert.equal(live.state,'enabled');
  assert.equal(live.canStop,true);
  assert.equal(f.events.set.length,1);
  const native=f.events.set[0];
  assert.equal(native.mode,'pac_script');
  assert.equal(native.pacScript.mandatory,true);
  assert.equal(native.pacScript.data,compileManagedProxyPac(CONFIG,{
    toolId:IDENTITY.toolId,packageHash:IDENTITY.packageHash,installEpoch:IDENTITY.epoch
  }));
  const pac=native.pacScript.data;
  const route=host=>runInNewContext(pac+
    ';FindProxyForURL("https://"+'+JSON.stringify(host)+','+JSON.stringify(host)+');',{
    dnsDomainIs:(host,suffix)=>host.endsWith(suffix)
  });
  for(const host of ['chatgpt.com','api.openai.com','claude.ai'])
    assert.equal(route(host),'SOCKS5 proxy.example.org:1080');
  for(const host of ['fakechatgpt.com','chatgpt.com.attacker.example','example.com'])
    assert.equal(route(host),'DIRECT');
  const stopped=await f.sdk.proxy.managed.requestDisable();
  assert.equal(stopped.state,'disabled');
  assert.equal(stopped.canStop,false);
  assert.deepEqual(f.events.clear,['regular']);
  assert.equal(f.local[MANAGED_PROXY_STORE].phase,'released');
});

test('R5.4 validates config and permissions before any proxy mutation',async()=>{
  const f=fixture();
  f.authorized=false;
  await assert.rejects(f.sdk.proxy.managed.requestEnable({config:CONFIG}),
    codeIs('E_TOOL_CAPABILITY_REQUIRED'));
  assert.equal(f.events.set.length,0);
  f.authorized=true;
  const bad=[
    {...CONFIG,endpoint:{...CONFIG.endpoint,scheme:'http'}},
    {...CONFIG,endpoint:{...CONFIG.endpoint,host:'127.0.0.1'}},
    {...CONFIG,endpoint:{...CONFIG.endpoint,host:'localhost'}},
    {...CONFIG,endpoint:{...CONFIG.endpoint,host:'EVIL.EXAMPLE.ORG'}},
    {...CONFIG,domains:['chatgpt.com','chatgpt.com']},
    {...CONFIG,domains:['chatgpt.com; DIRECT']},
    {...CONFIG,pac:'function FindProxyForURL(){return "DIRECT";}'}
  ];
  for(const config of bad){
    await assert.rejects(f.sdk.proxy.managed.requestEnable({config}),error=>
      ['E_SCHEMA','E_PROXY_CONFIG'].includes(error.code));
  }
  assert.equal(f.events.set.length,0);
  assert.throws(()=>validateManagedProxyConfig({...CONFIG,endpoint:{...CONFIG.endpoint,port:0}}),
    codeIs('E_PROXY_CONFIG'));
  f.permission=false;
  await assert.rejects(f.sdk.proxy.managed.requestEnable({config:CONFIG}),
    codeIs('E_CHROME_PERMISSION_REQUIRED'));
  assert.equal(f.events.set.length,0);
});

test('R5.4 an independent installation cannot STOP another installed owner',async()=>{
  const f=fixture();
  await f.sdk.proxy.managed.requestEnable({config:CONFIG});
  const other=f.makeSdk(OTHER);
  const status=await other.proxy.managed.getStatus();
  assert.equal(status.state,'conflict');
  assert.equal(status.canStop,false);
  await assert.rejects(other.proxy.managed.requestDisable(),codeIs('E_PROXY_OWNERSHIP'));
  assert.equal(f.events.clear.length,0);
  assert.equal(f.local[MANAGED_PROXY_STORE].phase,'enabled');
  f.control='controlled_by_other_extensions';
  assert.equal((await f.sdk.proxy.managed.getStatus()).canStop,true,
    'An owned pending STOP remains visible even when foreign control masks it');
  await assert.rejects(f.sdk.proxy.managed.requestDisable(),codeIs('E_PROXY_OWNERSHIP'));
  assert.equal(f.events.clear.length,0,'Foreign Chrome proxy must not be cleared');
});

test('R5.4 lost ENABLE acknowledgement stays uncertain until explicit STOP',async()=>{
  const f=fixture();f.ackLost=true;
  await assert.rejects(f.sdk.proxy.managed.requestEnable({config:CONFIG}),
    codeIs('E_OUTCOME_UNKNOWN'));
  assert.equal(f.events.set.length,1);
  assert.equal(f.events.clear.length,0);
  assert.equal(f.local[MANAGED_PROXY_STORE].phase,'applying');
  const state=await f.sdk.proxy.managed.getStatus();
  assert.equal(state.state,'unavailable');
  assert.equal(state.canStop,true);
  await assert.rejects(f.sdk.proxy.managed.requestEnable({config:CONFIG}),
    codeIs('E_PROXY_OWNERSHIP'));
  f.ackLost=false;
  assert.equal((await f.sdk.proxy.managed.requestDisable()).state,'disabled');
  assert.equal(f.events.clear.length,1);
});

test('R5.4 temporary Chrome permission loss retains STOP affordance and durable intent',async()=>{
  const f=fixture();
  await f.sdk.proxy.managed.requestEnable({config:CONFIG});
  f.permission=false;
  const state=await f.sdk.proxy.managed.getStatus();
  assert.equal(state.state,'unavailable');
  assert.equal(state.permission,false);
  assert.equal(state.canStop,true,'The owner must still be offered STOP/recovery');
  await assert.rejects(f.sdk.proxy.managed.requestDisable(),
    codeIs('E_CHROME_PERMISSION_REQUIRED'));
  assert.equal(f.events.clear.length,0);
  assert.equal(f.local[MANAGED_PROXY_STORE].phase,'stopping');
  f.permission=true;
  assert.equal(await reconcileManagedProxy(f.api,{lockManager:f.locks}),'released');
  assert.equal(f.events.clear.length,1);
  assert.equal((await f.sdk.proxy.managed.getStatus()).state,'disabled');
});

test('R5.4 missing cross-context Web Locks prevents native set and STOP',async()=>{
  const f=fixture({lockManager:null});
  await assert.rejects(f.sdk.proxy.managed.requestEnable({config:CONFIG}),
    codeIs('E_TOOL_LOCK'));
  await assert.rejects(f.sdk.proxy.managed.requestDisable(),codeIs('E_TOOL_LOCK'));
  assert.equal(f.events.set.length,0);
  assert.equal(f.events.clear.length,0);
});
