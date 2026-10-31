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
function config(){return {schemaVersion:2,sources:[{id:'manual',kind:'manual',displayName:'Manual',trustedByUser:true}],endpoints:[endpoint],profiles:[{id:'profile-core',name:'Core',kind:'endpoint',endpointId:'core',sourceId:'manual'}],rules:[rule],defaultTarget:{action:'direct'},selection:{mode:'rules'},managed:false};}
function fixture(initial=config()){
 let stored=structuredClone(initial),revision=0,native=disabled;
 const calls=[];
 const f={calls,afterWrite:null,readReply:null,writeReply:{saved:true},
  bridge:{setState(){},async request(action,input){
   calls.push([action,structuredClone(input)]);
   if(action==='storage.get')return f.readReply??{value:structuredClone(stored),etag:`v${revision}`};
   assert.equal(action,'storage.set');assert.equal(input.key,key);assert.equal(input.ifMatch,`v${revision}`);
   stored=structuredClone(input.value);revision++;f.afterWrite?.();return f.writeReply;
  }},
  sdk:{browser:{proxy:{managed:{async getStatus(){calls.push(['status']);return native;},async requestEnable(input){calls.push(['enable',input]);native=enabled;return native;},async requestDisable(){calls.push(['disable']);native=disabled;return native;}}}}},
  stored:()=>structuredClone(stored),replace(value){stored=structuredClone(value);revision++;},
  open(){return configureEnvironment(f.bridge,f.sdk,{trusted:true});}
 };return f;
}
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
  c=>{c.selection={mode:'direct'};},c=>{c.selection={mode:'system'};},
  c=>{c.selection={mode:'profile',profileId:'profile-core'};},
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
