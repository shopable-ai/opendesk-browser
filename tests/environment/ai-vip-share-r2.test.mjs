import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {AI_ID,LEGACY_AI_ID,AI_PROTOCOL,AI_STORE,LEGACY_AI_STORE,LEGACY_AI_ALARM,AI_DOMAINS,AI_CAPABILITY,
  compileAiPac,validEndpoint,validLease,desiredAiProxy,matchesAiProxy}
  from '../../src/ai-smart-access/policy.js';
import {createAiAccessService} from '../../src/ai-smart-access/service.js';
import {requestAiAccessOperation,runTrustedAiAccessOperation}
  from '../../src/ai-smart-access/tool-host.js';
import {stopAiAccessForTool,cleanupUninstalledAiAccess,EMPTY_AI_STATE}
  from '../../src/ai-smart-access/lifecycle.js';
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash}
  from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE}
  from '../../src/ui/sidebar-tools/lifecycle.js';

const endpoint={scheme:'socks5',host:'proxy.example.com',port:1080};
const tool={format:'opendesk.sidebar-tool.v1',id:AI_ID,version:'1.0.0',
  title:'AI VIP Share',description:'mock fixture',capabilities:[AI_CAPABILITY],
  html:'<main>AI</main>',css:'',js:'void 0;'};
const origin='chrome-extension://'+'a'.repeat(32);
const sender={
  id:'a'.repeat(32),url:origin+'/ui/tool.html?hostInstanceId=11111111-1111-4111-8111-111111111111',
  documentId:'doc-1',frameId:0,documentLifecycle:'active'
};
const provider={
  activateUrl:'https://license.example.com/api/activate',
  verifyUrl:'https://license.example.com/api/verify'
};
const expires=()=>Date.now()+3600000;
function route(host){
  const src=compileAiPac(endpoint);
  return runInNewContext(src+';FindProxyForURL("https://example.test",host);',{
    host,dnsDomainIs:(h,suffix)=>h.endsWith(suffix)
  });
}
async function fixture({control='controllable_by_this_extension',config=provider}={}){
  const local={
    [SIDEBAR_TOOL_STORE]:[tool],
    [SIDEBAR_TOOL_ENABLE_STORE]:{[AI_ID]:true},
    [TOOL_REVOCATION_EPOCHS_STORE]:{[AI_ID]:'epoch-1'}
  };
  const effects={set:[],clear:[],fetch:[],alarms:[],storage:[]};
  let current=null,level=control,svc;
  const api={
    runtime:{
      id:sender.id,getURL:part=>origin+'/'+part,
      sendMessage:async msg=>{
        try{return {ok:true,data:await svc.dispatch(msg,sender)};}
        catch(error){return {ok:false,error:{code:error.code,message:error.message}};}
      },
      getContexts:async()=>[{contextType:'SIDE_PANEL',documentUrl:sender.url,
        documentId:sender.documentId,frameId:0,incognito:false}]
    },
    storage:{local:{
      get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys])
        .filter(key=>Object.hasOwn(local,key)).map(key=>[key,structuredClone(local[key])])),
      set:async value=>{effects.storage.push(structuredClone(value));Object.assign(local,structuredClone(value));},
      remove:async key=>{delete local[key];}
    }},
    permissions:{contains:async()=>true},
    proxy:{settings:{
      get:async()=>({levelOfControl:level,value:current}),
      set:async({scope,value})=>{
        effects.set.push({scope,value});
        if(level==='controlled_by_other_extensions')throw Error('not controllable');
        level='controlled_by_this_extension';current=structuredClone(value);
      },
      clear:async({scope})=>{
        effects.clear.push({scope});current=null;
        if(level==='controlled_by_this_extension')level='controllable_by_this_extension';
      }
    }},
    alarms:{create:async(...args)=>{effects.alarms.push(args);},clear:async()=>true}
  };
  const fetcher=async(url,options)=>{
    effects.fetch.push({url,options});
    assert.equal(options.method,'POST');
    assert.equal(options.credentials,'omit');
    assert.equal(options.redirect,'error');
    const body=JSON.parse(options.body);
    const lease={leaseId:'lease-verified-123',expiresAt:expires(),endpoint};
    if(url.endsWith('/activate')){
      assert.equal(body.code,'GOOD-CODE');
      assert.match(body.deviceId,/^[0-9a-f-]{36}$/);
      return new Response(JSON.stringify(lease));
    }
    assert.equal(body.leaseId,lease.leaseId);
    return new Response(JSON.stringify({active:true,lease}));
  };
  const locks={request:(_key,fn)=>fn()};
  svc=createAiAccessService({api,lockManager:locks,
    provider:config,fetcher});
  const packageHash=await sidebarToolPackageHash(tool);
  const message=(operation,payload={})=>({
    protocol:AI_PROTOCOL,toolId:AI_ID,operation,payload,packageHash,installEpoch:'epoch-1'
  });
  return {api,svc,effects,local,message,locks,
    rpc:(operation,payload={})=>svc.dispatch(message(operation,payload),sender),
    snapshot:()=>({current,level}),control:value=>{level=value;}};
}

test('R1 only AI exact domains and valid descendants use PAC proxy; lookalikes are DIRECT',()=>{
  assert.equal(AI_DOMAINS.length,5);
  for(const name of AI_DOMAINS){
    assert.equal(route(name),'SOCKS5 proxy.example.com:1080');
    assert.equal(route('api.'+name),'SOCKS5 proxy.example.com:1080');
    for(const spoof of ['fake'+name,'evil-'+name,name+'.evil.net'])
      assert.equal(route(spoof),'DIRECT',spoof);
  }
  for(const name of ['google.com','example.com','openai.net','evilclaude.ai',
    'perplexity.ai.attacker.org','gemini.google.com.evil.net'])
    assert.equal(route(name),'DIRECT',name);
  assert.equal(desiredAiProxy(endpoint).pacScript.mandatory,true);
  assert(matchesAiProxy(desiredAiProxy(endpoint),endpoint));
  assert(!matchesAiProxy({...desiredAiProxy(endpoint),
    pacScript:{data:compileAiPac(endpoint),mandatory:false}},endpoint));
});

test('R1 rejects untrusted PAC, proxy endpoint and lease fields',()=>{
  for(const host of ['localhost','127.0.0.1','PROXY.EXAMPLE.COM','proxy.local',
    'proxy.example.com;DIRECT','proxy.example.com"','example.com.','evil_.test'])
    assert.throws(()=>validEndpoint({...endpoint,host}),/代理|端点/,host);
  assert.throws(()=>validEndpoint({...endpoint,scheme:'http'}),/代理|端点/);
  assert.throws(()=>validEndpoint({...endpoint,username:'attacker'}),/代理|端点/);
  assert.throws(()=>validEndpoint({...endpoint,port:0}),/代理|端点/);
  assert.deepEqual(validEndpoint(endpoint),endpoint);
  assert.throws(()=>validLease({leaseId:'lease-verified-123',expiresAt:Date.now()-1,endpoint}),/授权/);
  assert.throws(()=>validLease({leaseId:'lease-verified-123',expiresAt:expires(),endpoint,pac:'evil'}),/授权/);
});

test('R1 proxy is a required Chrome permission; sandbox cannot authorize enable',async()=>{
  const manifest=JSON.parse(await readFile('manifest.json','utf8'));
  assert(manifest.permissions.includes('proxy'));
  assert(!manifest.optional_permissions.includes('proxy'));
  const h=await fixture();let settingsOpened=0;
  await assert.rejects(requestAiAccessOperation({api:h.api,tool,
    operation:'aiAccess.enable',revocationEpoch:'epoch-1',
    assertCurrent:()=>{},openSettings:()=>settingsOpened++}),
    e=>e.code==='E_AI_TRUSTED_CLICK');
  assert.equal(settingsOpened,1);
  await assert.rejects(runTrustedAiAccessOperation({api:h.api,tool,operation:'aiAccess.enable',
    event:{isTrusted:false},revocationEpoch:'epoch-1',assertCurrent:()=>{}}),
    e=>e.code==='E_AI_TRUSTED_CLICK');
  assert.equal(h.effects.set.length,0);
  const status=await requestAiAccessOperation({api:h.api,tool,operation:'aiAccess.status',
    revocationEpoch:'epoch-1',assertCurrent:()=>{}});
  assert.equal(status.state,'activation_required');
});

test('R1 real contract: activate, verify, apply/readback PAC, release own preference',async()=>{
  const h=await fixture();
  assert.equal((await h.rpc('aiAccess.status')).state,'activation_required');
  assert.equal((await h.rpc('aiAccess.activate',{code:'GOOD-CODE'})).state,'disabled');
  assert.equal(h.effects.set.length,0,'activation cannot automatically enable');
  const enabled=await h.rpc('aiAccess.enable');
  assert.equal(enabled.state,'enabled');
  assert.equal(h.snapshot().level,'controlled_by_this_extension');
  assert.equal(h.effects.set[0].value.mode,'pac_script');
  assert.equal(h.effects.set[0].value.pacScript.mandatory,true);
  const stopped=await h.rpc('aiAccess.disable');
  assert.equal(stopped.state,'disabled');
  assert.deepEqual(h.effects.clear,[{scope:'regular'}]);
  assert.equal(h.effects.set.length,1,'disable cannot force DIRECT');
  assert.equal(h.local[AI_STORE].desired,false);
  assert.equal(h.local[AI_STORE].releasePending,false);
});

test('R1 conflicting extension, spoofed sender and stale installation fail closed',async()=>{
  const h=await fixture();
  await h.rpc('aiAccess.activate',{code:'GOOD-CODE'});
  h.control('controlled_by_other_extensions');
  assert.equal((await h.rpc('aiAccess.status')).state,'conflict');
  await assert.rejects(h.rpc('aiAccess.enable'),e=>e.code==='E_AI_CONFLICT');
  await assert.rejects(h.svc.dispatch(h.message('aiAccess.disable'),{
    ...sender,url:'https://attacker.invalid/'
  }),e=>e.code==='E_AI_SENDER');
  await assert.rejects(h.svc.dispatch({...h.message('aiAccess.disable'),
    packageHash:'b'.repeat(64)},sender),e=>e.code==='E_TOOL_CHANGED');
  await assert.rejects(h.svc.dispatch({...h.message('aiAccess.disable'),
    installEpoch:'invalid'},sender),e=>e.code==='E_TOOL_CHANGED');
  assert.equal(h.effects.set.length,0);
  assert.equal(h.effects.clear.length,0);
});

test('R1 without an approved backend no activation or false enabled state',async()=>{
  const h=await fixture({config:{activateUrl:null,verifyUrl:null}});
  assert.equal((await h.rpc('aiAccess.status')).state,'unavailable');
  await assert.rejects(h.rpc('aiAccess.activate',{code:'GOOD-CODE'}),e=>e.code==='E_AI_PROVIDER');
  await assert.rejects(h.rpc('aiAccess.enable'),e=>e.code==='E_AI_PROVIDER');
  assert.equal(h.effects.fetch.length,0);assert.equal(h.effects.set.length,0);
});

// R2.1 explicitly supersedes the old expiry -> clear expectation: automatic
// clear can silently route AI traffic DIRECT. Keep the old lease as evidence
// and require an explicit STOP to release, even when authorization expires.
test('R2.1 expired lease preserves PAC and evidence on wake until explicit STOP',async()=>{
  const h=await fixture();
  await h.rpc('aiAccess.activate',{code:'GOOD-CODE'});await h.rpc('aiAccess.enable');
  h.local[AI_STORE].lease.expiresAt=Date.now()-1000;
  await h.svc.reconcile();
  assert.equal(h.effects.clear.length,0);
  assert.notEqual(h.local[AI_STORE].lease,null);
  assert.equal(h.local[AI_STORE].desired,true);
  assert.equal((await h.rpc('aiAccess.status')).state,'activation_required');
  await h.rpc('aiAccess.disable');
  assert.equal(h.effects.clear.length,1);
});

test('R1 tool disable/uninstall stops proxy and removes only its own data',async()=>{
  const h=await fixture();
  h.local[AI_STORE]={...EMPTY_AI_STATE,desired:true,deviceId:randomUUID(),
    lease:{leaseId:'lease-verified-123',expiresAt:expires(),endpoint}};
  await h.api.proxy.settings.set({value:desiredAiProxy(endpoint),scope:'regular'});
  const prior=h.effects.set.length;
  await stopAiAccessForTool(h.api,AI_ID,{lockManager:h.locks});
  assert.equal(h.effects.set.length,prior);
  assert.equal(h.effects.clear.length,1);
  const removed=[];
  await cleanupUninstalledAiAccess(h.api,AI_ID,async (_api,key)=>{
    removed.push(key);delete h.local[key];
  },{lockManager:h.locks});
  assert.deepEqual(removed,[AI_STORE]);
});

test('R2 renamed tool uses new identity, protocol, state and alarm namespaces',()=>{
  assert.equal(AI_ID,'ai-vip-share');
  assert.equal(LEGACY_AI_ID,'ai-smart-access');
  assert.equal(AI_STORE,'opendesk.ai-vip-share.state.v1');
  assert.equal(LEGACY_AI_STORE,'opendesk.ai-access.state.v1');
  assert.notEqual(AI_STORE,LEGACY_AI_STORE);
  assert.equal(AI_PROTOCOL,'opendesk.ai-vip-share.v1');
});

// R2's unconditional stale-PAC clear was unsafe: renamed-ID reconciliation
// cannot revoke a still-active old installation. The migration contract now
// preserves its PAC and denies the new tool enable/STOP ownership.
test('R2.1 old activation never enables renamed ID and active PAC survives wake',async()=>{
  const h=await fixture();
  h.local[LEGACY_AI_STORE]={...EMPTY_AI_STATE,desired:true,deviceId:randomUUID(),
    lease:{leaseId:'lease-verified-123',expiresAt:expires(),endpoint}};
  await h.api.proxy.settings.set({value:desiredAiProxy(endpoint),scope:'regular'});
  const status=await h.rpc('aiAccess.status');
  assert.equal(status.state,'conflict');assert.equal(status.canStop,false);
  await h.svc.reconcile();
  assert.equal(h.effects.clear.length,0);
  assert.equal(h.snapshot().level,'controlled_by_this_extension');
  assert.equal(h.local[AI_STORE],undefined);
  assert.equal(h.local[LEGACY_AI_STORE].desired,true,
    'old lease is kept until old ID is explicitly uninstalled');
});

test('R2 uninstalling legacy package removes only its state and alarm',async()=>{
  const h=await fixture();
  h.local[LEGACY_AI_STORE]={...EMPTY_AI_STATE};
  h.local[AI_STORE]={...EMPTY_AI_STATE};
  const removed=[];
  await cleanupUninstalledAiAccess(h.api,LEGACY_AI_ID,async (_api,key)=>{
    removed.push(key);delete h.local[key];
  },{lockManager:h.locks});
  assert.deepEqual(removed,[LEGACY_AI_STORE]);
  assert.deepEqual(h.local[AI_STORE],EMPTY_AI_STATE);
  assert.equal(h.effects.clear.length,0);
  assert.equal(LEGACY_AI_ALARM,'opendesk.ai-access.lease-check.v1');
});
