import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunAuthority} from '../../src/platform/host/authority.js';
import {createSdkInstaller} from '../../src/platform/host/broker.js';
import {CONTRACT_VERSION, CONTRACT_HASH} from '../../src/platform/protocol.js';
import {validateSdkRequest} from '../../src/framework/sdk/registry.js';

// Exercise the SAME installer used by the formal tool route, its real Chrome
// driver and the full run authority. Only Chrome callbacks and serial storage
// are deterministic component oracles; this is not native browser acceptance.
const A='https://a.example', B='https://b.example', C='https://c.example';
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
async function fixture() {
  let rows=new Map(), tail=Promise.resolve();
  const hooks={inject:null,transaction:null}, injections=[];
  const storage={async transaction(names,mode,body) {
    await hooks.transaction?.(names,mode);
    const next=tail.then(async()=>{
      const copy=structuredClone(rows);
      const store=name=>{assert.ok(names.includes(name));if(!copy.has(name))copy.set(name,new Map());return copy.get(name);};
      const tx={get:async(n,k)=>structuredClone(store(n).get(k)),all:async n=>[...store(n).values()].map(v=>structuredClone(v)),
        put:async(n,v,k)=>{assert.equal(mode,'readwrite');store(n).set(k,structuredClone(v));},
        delete:async(n,k)=>{assert.equal(mode,'readwrite');store(n).delete(k);}};
      const value=await body(tx);if(mode==='readwrite')rows=copy;return value;
    });tail=next.catch(()=>{});return next;
  }};
  const native=new Set([`${A}/*`,`${B}/*`,`${C}/*`]);
  const frame={frameId:0,documentId:'document-A',documentLifecycle:'active',errorOccurred:false,url:`${A}/page`};
  const api={runtime:{id:'extension',getURL:p=>`chrome-extension://extension/${p}`},
    permissions:{contains:async({origins=[],permissions=[]})=>permissions.length===0&&origins.every(p=>native.has(p))},
    webNavigation:{getAllFrames:async({tabId})=>tabId===2?[structuredClone(frame)]:[]},
    scripting:{executeScript(options,callback){
      injections.push(structuredClone(options));
      if(hooks.inject)return hooks.inject(options,callback);
      callback([{frameId:0,documentId:'document-A'}]);
    }}};
  const authority=createRunAuthority({storage,api,clock:{now:()=>1000},session:'session'});
  const source={id:'extension',url:`${A}/page`,frameId:0,documentId:'document-A',documentLifecycle:'active',tab:{id:2,incognito:false}};
  const host={...source,url:api.runtime.getURL('ui/tool.html'),documentId:'tool-document',tab:{id:1,incognito:false}};
  await authority.registerHost({hostInstanceId:'tool-host',claimedContractVersion:CONTRACT_VERSION,claimedContractHash:CONTRACT_HASH},host);
  const installer=createSdkInstaller({authority,api});
  const payload=(targetOrigins=[B])=>({tabId:2,frameId:0,documentId:'document-A',capabilities:['network'],targetOrigins});
  const request=id=>validateSdkRequest({requestId:id,method:'AXIOS_GET',args:{url:`${B}/probe`},deadlineAt:10000});
  return {authority,storage,api,frame,native,hooks,injections,source,payload,request,
    install:targets=>installer(payload(targets),host)};
}

test('late failure of an old installation does not revoke a newer approved scope in the same document',async()=>{
  const f=await fixture(),entered=deferred();let first=true;
  f.hooks.inject=(_options,callback)=>{
    if(first){first=false;entered.resolve(callback);}else callback([{documentId:'document-A',frameId:0}]);
  };
  const old=f.install([B]).then(value=>({value}),error=>({error}));
  const finishOld=await entered.promise;
  const fresh=await f.install([B,C]);
  finishOld([{documentId:'document-A',frameId:0}]);
  assert.equal((await old).error?.code,'E_GRANT_REVOKED');
  assert.equal(f.injections.length,3,'The fenced old installation never injects its main script');
  assert.equal(fresh.installed,true);
  assert.equal((await f.authority.helloSdk({sdkVersion:'1.0.0'},f.source)).ready,true);
  const admitted=await f.authority.admitSdk(f.request('fresh'),f.source);
  assert.equal(admitted.context.grantIncarnation,fresh.grantIncarnation);
  await admitted.context.authorize({url:`${B}/probe`,capability:'network',phase:'pre'});
});

test('native injection failure preserves its error and retires the actual installation grant',async()=>{
  const f=await fixture();
  f.hooks.inject=(_options,callback)=>{
    f.api.runtime.lastError={message:'Controlled native injection failure'};
    try{callback();}finally{delete f.api.runtime.lastError;}
  };
  await assert.rejects(f.install(),error=>error.code==='E_CHROME'&&error.message==='Controlled native injection failure');
  assert.equal(f.injections.length,1);
  await assert.rejects(f.authority.helloSdk({sdkVersion:'1.0.0'},f.source),{code:'E_GRANT_REVOKED'});
});

test('installation cleanup fences immediately while persistence waits without invalidating quick reapproval',async()=>{
  const f=await fixture(),old=await f.install(),admitted=await f.authority.admitSdk(f.request('old'),f.source);
  const entered=deferred(),release=deferred();let first=true;
  f.hooks.transaction=async(_names,mode)=>{if(first&&mode==='readwrite'){first=false;entered.resolve();await release.promise;}};
  const cleanup=f.authority.revokeSdkGrants({tabId:2,frameId:0,documentId:'document-A',
    grantIncarnation:old.grantIncarnation,reason:'installation-failed'});
  await entered.promise;
  assert.throws(()=>admitted.context.assertDispatch(),{code:'E_GRANT_REVOKED'});
  const fresh=await f.install();assert.notEqual(fresh.grantIncarnation,old.grantIncarnation);
  release.resolve();await cleanup;
  assert.equal((await f.authority.helloSdk({sdkVersion:'1.0.0'},f.source)).ready,true);
  await assert.rejects(f.authority.admitSdk(f.request('old'),f.source),{code:'E_GRANT_REVOKED'});
  const next=await f.authority.admitSdk(f.request('new'),f.source);
  assert.equal(next.context.grantIncarnation,fresh.grantIncarnation);
});

for(const [name,state] of [['prerender',{documentLifecycle:'prerender'}],['cached',{documentLifecycle:'cached'}],
  ['pending deletion',{documentLifecycle:'pending_deletion'}],['missing lifecycle',{documentLifecycle:undefined}],
  ['unknown lifecycle',{documentLifecycle:'future'}],['failed navigation',{errorOccurred:true}]]) {
  test(`authority refuses ${name} at grant, injection and dispatch boundaries`,async()=>{
    const f=await fixture(),initial={...f.frame};Object.assign(f.frame,state);
    await assert.rejects(f.install(),{code:'E_DOCUMENT_STALE'});
    assert.equal(f.injections.length,0,'An inactive document cannot acquire a grant or receive fixed scripts');
    Object.assign(f.frame,initial);
    const grant=await f.install(),admitted=await f.authority.admitSdk(f.request('lifecycle'),f.source);
    Object.assign(f.frame,state);
    await assert.rejects(admitted.context.authorize({url:`${B}/probe`,capability:'network',phase:'pre'}),{code:'E_DOCUMENT_STALE'});
    Object.assign(f.frame,initial);
    let first=true;
    f.hooks.inject=(_options,callback)=>{if(first){first=false;Object.assign(f.frame,state);}callback([{documentId:'document-A',frameId:0}]);};
    await assert.rejects(f.install(),{code:'E_DOCUMENT_STALE'});
    assert.equal(f.injections.length,3,'Only the first script entered Chrome before the lifecycle changed');
    Object.assign(f.frame,initial);
    await assert.rejects(f.authority.authorizeSdkInjection(f.payload(),
      {...f.source,url:f.api.runtime.getURL('ui/tool.html'),documentId:'tool-document',tab:{id:1,incognito:false}},grant.grantIncarnation),
      {code:'E_GRANT_REVOKED'});
  });
}

test('exact installation cleanup cannot be mixed with a native origin removal',async()=>{
  const f=await fixture(),grant=await f.install();
  await assert.rejects(f.authority.revokeSdkGrants({tabId:2,frameId:0,documentId:'document-A',
    grantIncarnation:grant.grantIncarnation,origins:[`${B}/*`]}),{code:'E_SCHEMA'});
  assert.equal((await f.authority.helloSdk({sdkVersion:'1.0.0'},f.source)).ready,true);
  await f.authority.revokeSdkGrants({origins:[`${B}/*`]});
  await assert.rejects(f.authority.helloSdk({sdkVersion:'1.0.0'},f.source),{code:'E_GRANT_REVOKED'});
});
