import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

// Exercise the environment imported by main.jsx, not the historical adapter.
const bundle=await build({entryPoints:[new URL('../src/environment.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {configureEnvironment}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const key='ai-proxy.full-config.v2';
const disabled={state:'disabled',control:'controllable_by_this_extension',permission:true,canStop:false,reason:null};
const enabled={...disabled,state:'enabled',control:'controlled_by_this_extension',canStop:true};
const endpoint={id:'core',name:'Core',scheme:'https',host:'proxy.example.com',port:8443,sourceId:'manual'};
const rule={id:'site',domain:'target.example.com',action:'endpoint',endpointId:'core',includeSubdomains:true,priority:10,enabled:true};
function config(){return structuredClone({schemaVersion:2,sources:[{id:'manual',kind:'manual',displayName:'Manual',trustedByUser:true}],endpoints:[endpoint],profiles:[{id:'profile-core',name:'Core',kind:'endpoint',endpointId:'core',sourceId:'manual'}],rules:[rule],defaultTarget:{action:'direct'},selection:{mode:'rules'},managed:false});}
function fixture(initial=config()){
 let stored=structuredClone(initial),revision=0,native={...disabled,browserMode:"system",activeConfig:null};
 const calls=[];
 const f={calls,afterWrite:null,readReply:null,writeReply:{saved:true},
  bridge:{setState(){},async request(action,input){
   calls.push([action,structuredClone(input)]);
   if(action==='storage.get')return f.readReply??{value:structuredClone(stored),etag:`v${revision}`};
   assert.equal(action,'storage.set');assert.equal(input.key,key);assert.equal(input.ifMatch,`v${revision}`);
   stored=structuredClone(input.value);revision++;f.afterWrite?.();return f.writeReply;
  }},
  sdk:{browser:{proxy:{managed:{async getStatus(){calls.push(['status']);return native;},async requestEnable(input){calls.push(['enable',input]);native={...enabled,browserMode:'pac_script',activeConfig:structuredClone(input.config)};return native;},async requestDisable(){calls.push(['disable']);native={...disabled,browserMode:'system',activeConfig:null};return native;}}}}},
  stored:()=>structuredClone(stored),replace(value){stored=structuredClone(value);revision++;},
  open(){return configureEnvironment(f.bridge,f.sdk,{trusted:true});}
 };return f;
}
test('dirty drafts retain their original storage baseline through status refresh and preserve the newer writer',async()=>{
 const f=fixture(),env=f.open();
 try{
  await env.request({type:'GET_STATE'});
  env.setDraftDirty(true,'settings-proxy');
  const newer=f.stored();newer.endpoints[0].name='Newer saved name';f.replace(newer);
  await env.request({type:'GET_STATE'});
  const r=await env.request({type:'SAVE_ENDPOINT',endpoint:{...endpoint,name:'Old editor draft'}});
  assert.equal(r.errorCode,'E_CONFLICT');
  assert.equal(f.stored().endpoints[0].name,'Newer saved name');
  assert.equal(env.isDraftDirty('settings-proxy'),true);
  assert.equal(f.calls.filter(([name])=>name==='storage.set').length,0);
 }finally{env.dispose();}
});
test('confirmed sequential writes advance only the unchanged draft baseline',async()=>{
 const f=fixture(),env=f.open();
 try{
  await env.request({type:'GET_STATE'});env.setDraftDirty(true,'settings-proxy');
  assert.equal((await env.request({type:'SAVE_ENDPOINT',endpoint:{...endpoint,name:'Saved name'}})).ok,true);
  assert.equal((await env.request({type:'SAVE_PROFILE',profile:{id:'profile-core',name:'Saved name',kind:'endpoint',endpointId:'core',sourceId:'manual'}})).ok,true);
  assert.equal(f.calls.filter(([name])=>name==='storage.set').length,2);
 }finally{env.dispose();}
});
test('an opened editor keeps its baseline even if storage refreshes before the first input',async()=>{
 const f=fixture(),env=f.open();
 try{
  await env.request({type:'GET_STATE'});env.beginDraft('settings-proxy');
  const newer=f.stored();newer.endpoints[0].name='Newer saved name';f.replace(newer);
  await env.request({type:'GET_STATE'});env.setDraftDirty(true,'settings-proxy');
  const r=await env.request({type:'SAVE_ENDPOINT',endpoint:{...endpoint,name:'Old opened editor'}});
  assert.equal(r.errorCode,'E_CONFLICT');
  assert.equal(f.calls.filter(([name])=>name==='storage.set').length,0);
 }finally{env.dispose();}
});
test('an unchanged editor save uses its exact clean scope baseline',async()=>{
 const f=fixture(),env=f.open();
 try{
  const opened=await env.request({type:'GET_STATE'});env.beginDraft('settings-proxy',opened.state.configEtag);
  const newer=f.stored();newer.endpoints[0].name='Newer saved name';f.replace(newer);
  await env.request({type:'GET_STATE'});
  const r=await env.request({type:'SAVE_ENDPOINT',draftScope:'settings-proxy',endpoint});
  assert.equal(r.errorCode,'E_CONFLICT');
  assert.equal(f.calls.filter(([name])=>name==='storage.set').length,0);
  assert.equal(f.stored().endpoints[0].name,'Newer saved name');
 }finally{env.dispose();}
});
test('a record and ETag captured before confirmation cannot acquire a newer baseline',async()=>{
 const f=fixture(),env=f.open();
 try{
  const opened=await env.request({type:'GET_STATE'});
  const newer=f.stored();newer.endpoints[0].name='Newer saved name';f.replace(newer);
  await env.request({type:'GET_STATE'});
  env.setDraftDirty(false,'settings-proxy');env.beginDraft('settings-proxy',opened.state.configEtag);
  env.setDraftDirty(true,'settings-proxy');
  const r=await env.request({type:'SAVE_ENDPOINT',draftScope:'settings-proxy',endpoint});
  assert.equal(r.errorCode,'E_CONFLICT');
  assert.equal(f.calls.filter(([name])=>name==='storage.set').length,0);
 }finally{env.dispose();}
});
test('own commit advances the same editor despite newer input while retaining the dirty revision',async()=>{
 const f=fixture(),env=f.open();
 try{
  await env.request({type:'GET_STATE'});env.setDraftDirty(true,'settings-proxy');
  const revision=env.getDraftRevision('settings-proxy');
  f.afterWrite=()=>env.setDraftDirty(true,'settings-proxy');
  assert.equal((await env.request({type:'SAVE_ENDPOINT',draftScope:'settings-proxy',endpoint:{...endpoint,name:'First save'}})).ok,true);
  assert.equal(env.setDraftDirty(false,'settings-proxy',revision),false);
  assert.equal(env.isDraftDirty('settings-proxy'),true);
  f.afterWrite=null;
  assert.equal((await env.request({type:'SAVE_ENDPOINT',draftScope:'settings-proxy',endpoint:{...endpoint,name:'Newer input'}})).ok,true);
  assert.equal(f.stored().endpoints[0].name,'Newer input');
 }finally{env.dispose();}
});
test('a late own commit cannot advance a cleared and reopened editor generation',async()=>{
 const f=fixture(),env=f.open();
 try{
  const opened=await env.request({type:'GET_STATE'});env.beginDraft('settings-proxy');env.setDraftDirty(true,'settings-proxy');
  f.afterWrite=()=>{env.setDraftDirty(false,'settings-proxy');env.beginDraft('settings-proxy',opened.state.configEtag);};
  assert.equal((await env.request({type:'SAVE_ENDPOINT',draftScope:'settings-proxy',endpoint:{...endpoint,name:'First save'}})).ok,true);
  f.afterWrite=null;
  const r=await env.request({type:'SAVE_ENDPOINT',draftScope:'settings-proxy',endpoint:{...endpoint,name:'Reopened old record'}});
  assert.equal(r.errorCode,'E_CONFLICT');
  assert.equal(f.stored().endpoints[0].name,'First save');
 }finally{env.dispose();}
});
test('real environment saves full v2 selection and rules, reopens, and never touches the legacy key or routing',async()=>{
 const f=fixture();let env=f.open();
 try{
  assert.equal(env.preview,false);
  assert.equal((await env.request({type:'GET_STATE'})).state.config.endpoints[0].host,endpoint.host);
  assert.equal((await env.request({type:'SAVE_ENDPOINT',endpoint:{...endpoint,port:9443}})).ok,true);
  assert.equal((await env.request({type:'SAVE_RULE',rule:{...rule,domain:'saved.example.com'}})).ok,true);
  assert.equal((await env.request({type:'SELECT',selection:{mode:'rules'}})).ok,true);
  env.dispose();env=f.open();
  const reopened=await env.request({type:'GET_STATE'});
  assert.equal(reopened.state.config.endpoints[0].port,9443);
  assert.equal(reopened.state.config.rules[0].domain,'saved.example.com');
  assert.equal(reopened.state.runtime.applied,false);
  assert.equal(f.calls.filter(([name])=>name==='enable'||name==='disable').length,0);
  assert.ok(f.calls.filter(([name])=>name.startsWith('storage.')).every(([,input])=>input.key===key));
 }finally{env.dispose();}
});
test('legal rule route sends only public endpoint and domains through the actual environment',async()=>{
 const f=fixture(),env=f.open();
 try{
  const result=await env.request({type:'APPLY'});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.deepEqual(f.calls.filter(([name])=>name==='enable'),[['enable',{config:{endpoint:{scheme:'https',host:'proxy.example.com',port:8443},domains:['target.example.com']}}]]);
  assert.equal(result.state.runtime.permission,true);
  assert.equal(result.state.runtime.applied,true);
 }finally{env.dispose();}
});
test('unsupported modes, authentication, PAC, exact hosts and multiple targets never call Enable',async()=>{
 for(const alter of [
  c=>{c.selection={mode:'profile'};},
  c=>{c.endpoints[0].credentialRef='session-secret-ref';},
  c=>{c.endpoints[0].scheme='http';},c=>{c.endpoints[0].scheme='socks4';},
  c=>{c.rules[0].includeSubdomains=false;},c=>{c.defaultTarget={action:'endpoint',endpointId:'core'};},
  c=>{c.rules=[];},c=>{c.endpoints.push({...endpoint,id:'second'});c.rules.push({...rule,id:'second',endpointId:'second'});}
 ]){
  const c=structuredClone(config());alter(c);const f=fixture(c),env=f.open();
  try{assert.equal((await env.request({type:'APPLY'})).ok,false);assert.equal(f.calls.filter(([name])=>name==='enable').length,0);assert.deepEqual(f.stored(),c);}
  finally{env.dispose();}
 }
});
test('write acknowledgement followed by another writer is a conflict, not a false save receipt',async()=>{
 const f=fixture(),env=f.open();
 f.afterWrite=()=>{const changed=f.stored();changed.endpoints[0].name='Other writer';f.replace(changed);};
 try{
  const r=await env.request({type:'SAVE_ENDPOINT',endpoint:{...endpoint,name:'Mine'}});
  assert.equal(r.ok,false);assert.equal(r.errorCode,'E_CONFLICT');
  assert.equal(f.stored().endpoints[0].name,'Other writer');
  assert.equal(f.calls.filter(([name])=>name==='storage.set').length,1);
 }finally{env.dispose();}
});
test('storage JSON member ordering does not turn a confirmed save into a conflict',async()=>{
 const f=fixture(),env=f.open();
 const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,reorder(value[k])])):value;
 const request=f.bridge.request;
 f.bridge.request=async(action,input)=>{const reply=await request(action,input);return action==='storage.get'?{...reply,value:reorder(reply.value)}:reply;};
 try{
  const result=await env.request({type:'SAVE_RULE',rule:{...rule,domain:'reordered.example.com'}});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.state.config.rules[0].domain,'reordered.example.com');
  assert.equal(f.calls.filter(([name])=>name==='storage.set').length,1);
 }finally{env.dispose();}
});
test('missing read value does not silently replace stored configuration with a new empty config',async()=>{
 const f=fixture(),env=f.open();f.readReply={etag:'v0'};
 try{const r=await env.request({type:'GET_STATE'});assert.equal(r.ok,false);assert.equal(r.errorCode,'E_OUTCOME_UNKNOWN');assert.equal(f.calls.filter(([name])=>name==='storage.set').length,0);}
 finally{env.dispose();}
});
test('quota, invalid port and missing rule references cannot mutate stored data',async()=>{
 const f=fixture(),env=f.open(),prior=f.stored();
 try{
  for(const message of [{type:'SAVE_ENDPOINT',endpoint:{...endpoint,port:65536}},{type:'SAVE_RULE',rule:{...rule,endpointId:'missing'}},
   {type:'SAVE_PROFILE',profile:{id:'large',name:'Large PAC',sourceId:'manual',kind:'pac-inline',pacText:'function FindProxyForURL(){return "DIRECT";}'+ ' '.repeat(8200)}}])assert.equal((await env.request(message)).ok,false);
  assert.deepEqual(f.stored(),prior);assert.equal(f.calls.filter(([name])=>name==='storage.set').length,0);
 }finally{env.dispose();}
});
test('unknown write acknowledgement is never automatically replayed',async()=>{
 const f=fixture(),env=f.open();f.writeReply={};
 try{const r=await env.request({type:'SELECT',selection:{mode:'direct'}});assert.equal(r.errorCode,'E_OUTCOME_UNKNOWN');assert.equal(f.calls.filter(([name])=>name==='storage.set').length,1);}
 finally{env.dispose();}
});
test('non-Preview environment ignores an ambient preview global',async()=>{
 const f=fixture(),previous=globalThis.__opendeskAIProxyPreview,loc=globalThis.location;
 globalThis.location={hash:''};globalThis.__opendeskAIProxyPreview={service:{load(){throw Error('Ambient mock used');}}};
 let env;
 try{env=configureEnvironment(f.bridge,f.sdk);assert.equal(env.preview,false);assert.equal((await env.request({type:'GET_STATE'})).ok,true);}
 finally{env?.dispose();if(previous===undefined)delete globalThis.__opendeskAIProxyPreview;else globalThis.__opendeskAIProxyPreview=previous;if(loc===undefined)delete globalThis.location;else globalThis.location=loc;}
});

test('current website uses only the declared page-info bridge and keeps only a public hostname',async()=>{
 const f=fixture();const request=f.bridge.request;
 f.bridge.request=async(action,input)=>action==='currentPage.info'
  ?{status:'available',url:'https://Docs.Example.com/path?token=private',title:'Private title'}:request(action,input);
 const env=f.open();
 try{assert.deepEqual(await env.currentSite(),{status:'available',host:'docs.example.com',source:'currentPage'});}
 finally{env.dispose();}
});
test('unavailable, rejected and non-web current pages never become a detected website',async()=>{
 for(const reply of [{status:'unavailable'}, {status:'available',url:'chrome://extensions/'},
  {status:'available',url:'https://user:secret@example.com/'},{status:'available',url:'bad'},null,'reject']){
  const f=fixture(),request=f.bridge.request;
  f.bridge.request=async(action,input)=>{if(action!=='currentPage.info')return request(action,input);if(reply==='reject')throw Error('E_CAPABILITY');return reply;};
  const env=f.open();
  try{const site=await env.currentSite();assert.equal(site.status,'unavailable');assert.equal(site.host,'');}
  finally{env.dispose();}
 }
});
test('current-page responses cannot repopulate a disposed tool instance',async()=>{
 const f=fixture(),request=f.bridge.request;let complete;
 f.bridge.request=async(action,input)=>action==='currentPage.info'?new Promise(resolve=>complete=resolve):request(action,input);
 const env=f.open(),pending=env.currentSite();env.dispose();complete({status:'available',url:'https://example.com'});
 await assert.rejects(pending,/会话已关闭/);
});

const enables=f=>f.calls.filter(([name])=>name==='enable');
test('direct Apply sends direct alone, with no endpoint or rules required',async()=>{
 const c=config();c.endpoints=[];c.profiles=[];c.rules=[];c.selection={mode:'direct'};
 const f=fixture(c),env=f.open();
 try{
  assert.equal((await env.request({type:'APPLY'})).ok,true);
  assert.deepEqual(enables(f),[['enable',{config:{mode:'direct'}}]]);
 }finally{env.dispose();}
});
test('selected remote endpoint profiles use fixed_servers for HTTPS and SOCKS5',async()=>{
 for(const scheme of ['https','socks5']){
  const c=config();c.endpoints[0].scheme=scheme;c.selection={mode:'profile',profileId:'profile-core'};
  const f=fixture(c),env=f.open();
  try{
   assert.equal((await env.request({type:'APPLY'})).ok,true);
   assert.deepEqual(enables(f),[['enable',{config:{mode:'fixed_servers',endpoint:{scheme,host:endpoint.host,port:8443}}}]]);
  }finally{env.dispose();}
 }
});
test('SAVE_LOCAL_CLIENT and SELECT persist without routing; Apply uses selected loopback profile or rules',async()=>{
 for(const scheme of ['http','socks5'])for(const mode of ['profile','rules']){
  const f=fixture(),env=f.open();
  try{
   assert.equal((await env.request({type:'SAVE_LOCAL_CLIENT',client:{id:'clash',name:'Clash',scheme,port:7897}})).ok,true);
   assert.equal((await env.request({type:'SAVE_RULE',rule:{...rule,endpointId:'clash'}})).ok,true);
   assert.equal((await env.request({type:'SELECT',selection:mode==='profile'?{mode,profileId:'profile-clash'}:{mode}})).ok,true);
   assert.equal(enables(f).length,0);
   assert.equal(f.calls.filter(([name])=>name==='disable').length,0);
   assert.equal(f.stored().sources.find(s=>s.id==='local-clash').kind,'local-client');
   assert.equal((await env.request({type:'APPLY'})).ok,true);
   assert.deepEqual(enables(f),[['enable',{config:{mode:mode==='profile'?'fixed_servers':'rules',endpoint:{scheme,host:'127.0.0.1',port:7897},...(mode==='rules'?{domains:['target.example.com']}:{})}}]]);
  }finally{env.dispose();}
 }
});
test('forged loopback source, private endpoints and unsupported configurations never Enable',async()=>{
 const cases=[
  ...['127.0.0.1','127.0.0.2','10.0.0.1','192.168.1.1','8.8.8.8','localhost','proxy.local','proxy.internal'].map(host=>c=>{c.endpoints[0].host=host;}),
  c=>{c.sources[0].kind='local-client';},
  c=>{c.sources[0].kind='local-client';c.endpoints[0].host='127.0.0.1';c.endpoints[0].credentialRef='secret';},
  ...['https','socks4'].map(scheme=>c=>{c.sources[0].kind='local-client';c.endpoints[0].host='127.0.0.1';c.endpoints[0].scheme=scheme;}),
  c=>{c.profiles[0]={id:'profile-core',name:'PAC',sourceId:'manual',kind:'pac-inline',pacText:'function FindProxyForURL(){return "DIRECT";}'};},
  c=>{c.rules=Array.from({length:17},(_,i)=>({...rule,id:'r'+i,domain:'site'+i+'.example.com'}));},
  c=>{c.rules[0].action='direct';delete c.rules[0].endpointId;}
 ];
 for(const mode of ['rules','profile'])for(const alter of cases){
  const c=config();alter(c);c.selection=mode==='profile'?{mode,profileId:'profile-core'}:{mode};
  // Rules are intentionally irrelevant to whole-site endpoint profiles.
  if(mode==='profile'&&(c.rules.length===17||c.rules[0]?.action==='direct'))continue;
  if(mode==='rules'&&c.profiles[0].kind==='pac-inline')continue;
  const f=fixture(c),env=f.open();
  try{assert.equal((await env.request({type:'APPLY',approvedPac:true})).ok,false,JSON.stringify(c));assert.equal(enables(f).length,0);}
  finally{env.dispose();}
 }
});
test('Enable outcome unknown is not replayed; STOP and disposed sessions retain lifecycle guards',async()=>{
 const f=fixture(),env=f.open();
 let observed=disabled;
 f.sdk.browser.proxy.managed.getStatus=async()=>observed;
 f.sdk.browser.proxy.managed.requestDisable=async()=>{f.calls.push(['disable']);observed=disabled;return disabled;};
 f.sdk.browser.proxy.managed.requestEnable=async input=>{observed=enabled;f.calls.push(['enable',input]);throw Object.assign(Error('unknown'),{code:'E_OUTCOME_UNKNOWN'});};
 try{
  assert.equal((await env.request({type:'APPLY'})).errorCode,'E_OUTCOME_UNKNOWN');
  assert.equal((await env.request({type:'APPLY'})).errorCode,'E_OUTCOME_UNKNOWN');
  assert.equal(enables(f).length,1);
  assert.equal((await env.request({type:'STOP'})).ok,true);
  assert.equal(f.calls.filter(([name])=>name==='disable').length,1);
  env.dispose();
  await assert.rejects(env.request({type:'APPLY'}),/会话已关闭/);
  assert.equal(enables(f).length,1);
 }finally{env.dispose();}
});


test('system uses confirmed read-only fallback without enabling an unowned native override',async()=>{
 const c=config();c.selection={mode:'system'};const f=fixture(c),env=f.open();
 try{
  const result=await env.request({type:'APPLY'});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.state.runtime.browserMode,'system');
  assert.equal(result.state.runtime.pendingChanges,false);
  assert.equal(result.state.config.managed,false);
  assert.equal(enables(f).length,0);
  assert.equal(f.calls.filter(([name])=>name==='disable').length,0);
 }finally{env.dispose();}
});
test('reopened route is verified from SDK, preserves pending selection, and system releases it exactly once',async()=>{
 const c=config();c.selection={mode:'profile',profileId:'profile-core'};const f=fixture(c);let env=f.open();
 try{
  assert.equal((await env.request({type:'APPLY'})).ok,true);
  assert.equal((await env.request({type:'SELECT',selection:{mode:'direct'}})).ok,true);
  env.dispose();env=f.open();
  const reopened=await env.request({type:'GET_STATE'});
  assert.equal(reopened.state.runtime.applied,true,JSON.stringify(reopened));
  assert.equal(reopened.state.runtime.activeSelection.profileId,'profile-core');
  assert.equal(reopened.state.runtime.pendingChanges,true);
  assert.equal(reopened.state.config.selection.mode,'direct');
  assert.equal(enables(f).length,1);
  assert.equal((await env.request({type:'SELECT',selection:{mode:'system'}})).ok,true);
  const result=await env.request({type:'APPLY'});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.state.runtime.browserMode,'system');
  assert.equal(result.state.config.managed,false);
  assert.equal(f.calls.filter(([name])=>name==='disable').length,1);
  assert.equal(enables(f).length,1);
 }finally{env.dispose();}
});

test('changing an owned route releases it before the next separately reviewed Enable',async()=>{
 const f=fixture(),managed=f.sdk.browser.proxy.managed,enable=managed.requestEnable;
 let held=false;
 managed.requestEnable=async input=>{assert.equal(held,false,'Enable must not overwrite an owned route');const result=await enable(input);held=true;return result;};
 const disable=managed.requestDisable;
 managed.requestDisable=async()=>{const result=await disable();held=false;return result;};
 const env=f.open();
 try{
  assert.equal((await env.request({type:'APPLY'})).ok,true);
  assert.equal((await env.request({type:'SELECT',selection:{mode:'direct'}})).ok,true);
  const result=await env.request({type:'APPLY'});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.deepEqual(f.calls.filter(([name])=>['enable','disable'].includes(name)).map(([name])=>name),['enable','disable','enable']);
  assert.equal(result.state.runtime.activeSelection.mode,'direct');
 }finally{env.dispose();}
});
test('unsupported credential attachment is rejected before saving or releasing the working route',async()=>{
 const f=fixture(),env=f.open();
 try{
  assert.equal((await env.request({type:'APPLY'})).ok,true);
  const result=await env.request({type:'SAVE_ENDPOINT',endpoint:{...endpoint,credentialRef:'secret-ref'}});
  assert.equal(result.ok,false);
  assert.equal(f.stored().endpoints[0].credentialRef,undefined);
  assert.equal(f.calls.filter(([name])=>name==='disable').length,0);
  assert.equal(enables(f).length,1);
 }finally{env.dispose();}
});
test('cancelled replacement Enable leaves the confirmed release disabled without replay',async()=>{
 const f=fixture(),env=f.open();
 try{
  assert.equal((await env.request({type:'APPLY'})).ok,true);
  assert.equal((await env.request({type:'SELECT',selection:{mode:'direct'}})).ok,true);
  f.sdk.browser.proxy.managed.requestEnable=async()=>{throw Object.assign(Error('Cancelled'),{code:'E_CANCELLED'});};
  assert.equal((await env.request({type:'APPLY'})).errorCode,'E_CANCELLED');
  const state=(await env.request({type:'GET_STATE'})).state;
  assert.equal(state.runtime.state,'disabled');assert.equal(state.runtime.outcomeUnknown,false);
  assert.equal(state.config.managed,false);
  assert.equal(f.calls.filter(([name])=>name==='disable').length,1);
  assert.equal(enables(f).length,1);
 }finally{env.dispose();}
});

test('unconfirmed replacement STOP never reaches the new Enable or replays a native request',async()=>{
 for(const code of ['E_OUTCOME_UNKNOWN','E_CANCELLED']){
  const f=fixture(),env=f.open();
  try{
   assert.equal((await env.request({type:'APPLY'})).ok,true);
   assert.equal((await env.request({type:'SELECT',selection:{mode:'direct'}})).ok,true);
   let stops=0;
   f.sdk.browser.proxy.managed.requestDisable=async()=>{stops++;throw Object.assign(Error('Stop not confirmed'),{code});};
   assert.equal((await env.request({type:'APPLY'})).errorCode,code);
   assert.equal(stops,1);assert.equal(enables(f).length,1);
   assert.equal(f.stored().managed,true);
  }finally{env.dispose();}
 }
});
test('another writer during release prevents enabling or overwriting its new selection',async()=>{
 const f=fixture(),disable=f.sdk.browser.proxy.managed.requestDisable,env=f.open();
 try{
  assert.equal((await env.request({type:'APPLY'})).ok,true);
  assert.equal((await env.request({type:'SELECT',selection:{mode:'direct'}})).ok,true);
  f.sdk.browser.proxy.managed.requestDisable=async()=>{const result=await disable();f.replace({...f.stored(),selection:{mode:'system'}});return result;};
  const result=await env.request({type:'APPLY'});
  assert.equal(result.errorCode,'E_CONFLICT');
  assert.equal(enables(f).length,1);assert.equal(f.stored().selection.mode,'system');
  assert.equal(f.stored().managed,false);
 }finally{env.dispose();}
});


test('R14 environment adapts trusted and sandbox navigation, falls back immediately and disposes subscriptions',()=>{
 for(const trusted of [true,false])for(const feature of [true,false])for(const reject of [true,false]){
  const f=fixture(),snapshots=[],root=new EventTarget();let subscribed,removed=0;
  const adapter={navigationFeatures:{headerActions:feature},setNavigation(value){snapshots.push(value);return reject&&'headerActions'in value?false:true;},
   subscribe(handler){subscribed=handler;return()=>{removed++;subscribed=null;};}};
  f.bridge.root=root;
  if(trusted)f.bridge.toolNavigation=adapter;
  else{f.bridge.navigationFeatures=adapter.navigationFeatures;f.bridge.setNavigation=adapter.setNavigation;}
  // trusted here selects the adapter, not the app's independent URL transport.
  const env=f.open(),base={page:'home',title:'AI Proxy',canBack:false,primary:null},actions=[{id:'settings',label:'设置',icon:'settings'}];
  assert.equal(env.toolNavigation.setNavigation(base,actions),feature&&!reject);
  assert.deepEqual(snapshots,feature?[{...base,headerActions:actions},...(reject?[base]:[])]:[base]);
  let seen=0;env.toolNavigation.subscribe(()=>seen++);
  if(trusted)subscribed({action:'back'});else root.dispatchEvent(new CustomEvent('opendesk-tool-navigation',{detail:{action:'back'}}));
  assert.equal(seen,1);env.dispose();
  if(trusted)assert.equal(removed,1);else root.dispatchEvent(new CustomEvent('opendesk-tool-navigation',{detail:{action:'back'}}));
  assert.equal(seen,1);assert.equal(env.toolNavigation.setNavigation(base,actions),false);assert.equal(f.calls.length,0);
 }
});

test('R14 environment retains unknown write navigation lock without replaying or applying proxy',async()=>{
 const f=fixture(),env=f.open();
 try{
  env.setDraftDirty(true,'editor');assert.equal(env.toolNavigation.isLocked(),true);
  env.setDraftDirty(false,'editor');assert.equal(env.toolNavigation.isLocked(),false);
  f.writeReply={};const result=await env.request({type:'SELECT',selection:{mode:'direct'}});
  assert.equal(result.errorCode,'E_OUTCOME_UNKNOWN');assert.equal(env.toolNavigation.isLocked(),true);
  assert.equal(f.calls.filter(([name])=>name==='storage.set').length,1);
  assert.equal(f.calls.some(([name])=>['enable','disable'].includes(name)),false);
 }finally{env.dispose();}
});

test('R14 navigation unknown lock clears only after service status reconciliation, never an unrelated success',async()=>{
 const f=fixture(),states=[];f.bridge.setState=state=>states.push(state);
 const env=f.open();
 try{
  f.writeReply={};
  assert.equal((await env.request({type:'SELECT',selection:{mode:'direct'}})).errorCode,'E_OUTCOME_UNKNOWN');
  assert.equal(env.toolNavigation.isLocked(),true);
  assert.equal(states.at(-1).busy,true);
  assert.equal((await env.request({type:'EXPORT'})).ok,true);
  assert.equal(env.toolNavigation.isLocked(),true);
  f.sdk.browser.proxy.managed.getStatus=async()=>({...disabled,control:'unknown'});
  assert.equal((await env.request({type:'GET_STATE'})).state.runtime.outcomeUnknown,true);
  assert.equal(env.toolNavigation.isLocked(),true);
  f.sdk.browser.proxy.managed.getStatus=async()=>({...disabled,browserMode:'system',activeConfig:null});
  assert.equal((await env.request({type:'GET_STATE'})).state.runtime.outcomeUnknown,false);
  assert.equal(env.toolNavigation.isLocked(),false);
  assert.equal(states.at(-1).busy,false);
  assert.equal(f.calls.filter(([name])=>name==='storage.set').length,1);
  assert.equal(f.calls.some(([name])=>['enable','disable'].includes(name)),false);
 }finally{env.dispose();}
});

test('R14 a successful GET_STATE with unknown runtime locks navigation until confirmed STOP',async()=>{
 const f=fixture();let status={...enabled,control:'unknown',activeConfig:null};
 f.sdk.browser.proxy.managed.getStatus=async()=>status;
 const env=f.open();
 try{
  assert.equal((await env.request({type:'GET_STATE'})).state.runtime.outcomeUnknown,true);
  assert.equal(env.toolNavigation.isLocked(),true);
  status={...enabled,activeConfig:null};
  await env.request({type:'GET_STATE'});
  assert.equal(env.toolNavigation.isLocked(),true);
  const result=await env.request({type:'STOP'});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.state.runtime.outcomeUnknown,false);
  assert.equal(env.toolNavigation.isLocked(),false);
  assert.equal(f.calls.filter(([name])=>name==='disable').length,1);
  assert.equal(f.calls.some(([name])=>name==='enable'),false);
 }finally{env.dispose();}
});

test('R14 trusted navigation preserves handler rejection for the Host await boundary',async()=>{
 const f=fixture();let deliver;
 f.bridge.toolNavigation={subscribe(handler){deliver=handler;return()=>{};}};
 const env=f.open();let calls=0;
 const stop=env.toolNavigation.subscribe(async()=>{calls++;throw Object.assign(Error('未确认完成'),{code:'E_OUTCOME_UNKNOWN'});});
 const stale=deliver;
 await assert.rejects(deliver({action:'header',actionId:'settings',page:'home'}),{code:'E_OUTCOME_UNKNOWN'});
 assert.equal(calls,1);
 stop();assert.equal(stale({action:'header'}),undefined);
 env.dispose();assert.equal(stale({action:'header'}),undefined);
 assert.equal(calls,1);
 assert.equal(f.calls.filter(row=>['enable','disable'].includes(row[0])).length,0);
});

test('PC initial section is an app-validated display hint and cannot apply a proxy',async()=>{
  const f=fixture(),opened=[];
  f.bridge.surface='page';
  f.bridge.initialPage={view:'settings',section:'rules'};
  f.bridge.openOwnPage=value=>{opened.push(value);return Promise.resolve({opened:true});};
  let env=f.open();
  try{
    assert.equal(env.surface,'page');
    assert.equal(env.navigation.getRoute(),'#/rules');
    assert.deepEqual(await env.openOwnPage({view:'settings',section:'diagnostic'}),{opened:true});
    assert.deepEqual(opened,[{view:'settings',section:'diagnostic'}]);
    assert.equal(f.calls.filter(([name])=>['enable','disable','storage.set'].includes(name)).length,0);
  }finally{env.dispose();}
  const g=fixture();
  g.bridge.surface='page';
  g.bridge.initialPage={view:'settings',section:'not-a-real-section'};
  env=g.open();
  try{
    assert.equal(env.navigation.getRoute(),'','unrecognized business section must not enter the app route');
    assert.equal(env.openOwnPage({view:'settings',section:'profiles'}),null,'old Host keeps the original in-panel route');
  }finally{env.dispose();}
});

test('rule list mutations preserve an unrelated stale default draft baseline',async()=>{
 for(const patch of [{enabled:false},{priority:7}]){
  const f=fixture(),env=f.open();
  try{
   await env.request({type:'GET_STATE'});env.setDraftDirty(true,'settings-default');
   const newer=f.stored();newer.defaultTarget={action:'endpoint',endpointId:endpoint.id};f.replace(newer);
   const current=await env.request({type:'GET_STATE'});
   const changed=await env.request({type:'SAVE_RULE',draftScope:'settings-rule-list',ifMatch:current.state.configEtag,rule:{...rule,...patch}});
   assert.equal(changed.ok,true);
   const stale=await env.request({type:'SET_DEFAULT',draftScope:'settings-default',target:{action:'direct'}});
   assert.equal(stale.errorCode,'E_CONFLICT');
   assert.deepEqual(f.stored().defaultTarget,newer.defaultTarget);
   assert.equal(env.isDraftDirty('settings-default'),true);
   assert.equal(f.calls.filter(([name])=>name==='storage.set').length,1);
  }finally{env.dispose();}
 }
});
