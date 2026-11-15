import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
async function compiled(path){const r=await build({entryPoints:[new URL(path,import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));}
const {checkDiagnosticSite}=await compiled('../src/diagnostics/http.ts');
const {createProxyService}=await compiled('../src/service.ts');
const tick=()=>new Promise(r=>setTimeout(r,15));
function fixture(checkSite){
 const config={schemaVersion:2,sources:[{id:'manual',kind:'manual',displayName:'Manual',trustedByUser:true}],endpoints:[],profiles:[],rules:[],defaultTarget:{action:'direct'},selection:{mode:'system'},managed:false};
 let native={state:'disabled',canStop:false,control:'controllable_by_this_extension',reason:null,browserMode:'system',permission:true,activeConfig:null},writes=0,statusFailure=null;
 const service=createProxyService({load:async()=>({config,etag:'a'}),save:async()=>{writes++;return 'a';},status:async()=>{if(statusFailure)throw statusFailure;return native;},apply:async()=>native,stop:async()=>{native={...native,state:'disabled',canStop:false,control:'controllable_by_this_extension'};return native;},checkSite});
 return {service,get writes(){return writes;},native(value){native={...native,...value};},statusFailure(value){statusFailure=value;}};
}
async function ok(f,command){const r=await f.service.request(command);assert.equal(r.ok,true,JSON.stringify(r));return r;}

test('bounded HTTP adapter uses fixed URLs, strips response bodies and classifies statuses',async()=>{
 const kinds={200:'http_ok',401:'auth_required',403:'forbidden',407:'proxy_auth',429:'rate_limited',503:'http_error',302:'redirect'};
 for(const [status,kind]of Object.entries(kinds)){
  let sent;const result=await checkDiagnosticSite('public-https',async args=>{sent=args;return {status:Number(status),data:'private response'};});
  assert.equal(sent.url,'https://www.cloudflare.com/cdn-cgi/trace');assert.deepEqual(sent.config,{timeout:10000,responseType:'text'});
  assert.equal(result.kind,kind);assert.equal(result.httpStatus,Number(status));assert.ok(result.elapsedMs>=0);assert.doesNotMatch(JSON.stringify(result),/private response/);
 }
 let calls=0;await assert.rejects(checkDiagnosticSite('https://arbitrary.example/',async()=>{calls++;}));assert.equal(calls,0);
});
test('HTTP failures expose fixed categories without adapter messages or URLs',async()=>{
 for(const [code,kind]of Object.entries({E_TIMEOUT:'timeout',E_PERMISSION:'permission',E_CAPABILITY:'permission',E_LIMIT:'response_limit',E_HTTP:'http_error',E_NETWORK:'network_error'})){
  const r=await checkDiagnosticSite('chatgpt',async()=>{throw Object.assign(Error('secret-token-private-url'),{code});});
  assert.deepEqual(r,{kind,httpStatus:null,elapsedMs:null});
 }
});
test('real diagnostics perform no request on read, never write config, and report L2 only',async()=>{
 const calls=[];const f=fixture(async id=>{calls.push(id);return {kind:'http_ok',httpStatus:200,elapsedMs:3};});
 try{
  await ok(f,{type:'GET_STATE'});const first=await ok(f,{type:'GET_DIAGNOSTICS'});assert.equal(first.diagnostics.preview,false);assert.deepEqual(calls,[]);
  await ok(f,{type:'RUN_DIAGNOSTICS',siteIds:['public-https']});await tick();
  const r=await ok(f,{type:'GET_DIAGNOSTICS'});assert.equal(r.diagnostics.observations[0].scope,'extension-http-only');assert.equal(r.diagnostics.observations[0].httpStatus,200);assert.equal(f.writes,0);
  const bad=await f.service.request({type:'RUN_DIAGNOSTICS',siteIds:['custom:arbitrary.example']});assert.equal(bad.ok,false);assert.deepEqual(calls,['public-https']);
 }finally{f.service.dispose();}
});
test('cancel resolves while a GET is pending and prevents late observations and subsequent requests',async()=>{
 let finish;const calls=[];const f=fixture(id=>{calls.push(id);return new Promise(r=>finish=r);});
 try{
  await ok(f,{type:'GET_STATE'});await ok(f,{type:'RUN_DIAGNOSTICS',siteIds:['chatgpt','claude']});await tick();
  await ok(f,{type:'CANCEL_DIAGNOSTICS'});finish({kind:'http_ok',httpStatus:200,elapsedMs:5});await tick();
  const r=await ok(f,{type:'GET_DIAGNOSTICS'});assert.equal(r.diagnostics.activeRun,null);assert.equal(r.diagnostics.observations.length,0);assert.deepEqual(calls,['chatgpt']);
 }finally{f.service.dispose();}
});
test('control changes invalidate in-flight evidence and leave STOP usable during a GET',async()=>{
 let finish;const f=fixture(()=>new Promise(r=>finish=r));
 try{
  f.native({state:'enabled',canStop:true,control:'controlled_by_this_extension',browserMode:'pac_script'});
  await ok(f,{type:'GET_STATE'});await ok(f,{type:'RUN_DIAGNOSTICS',siteIds:['public-https']});await tick();
  await ok(f,{type:'STOP'});finish({kind:'http_ok',httpStatus:200,elapsedMs:5});await tick();
  assert.equal((await ok(f,{type:'GET_DIAGNOSTICS'})).diagnostics.observations.length,0);
 }finally{f.service.dispose();}
});
test('permission refusal stops a batch and a later explicit run recovers',async()=>{
 const calls=[];let refused=true;const f=fixture(async id=>{calls.push(id);return {kind:refused?'permission':'http_ok',httpStatus:refused?null:200,elapsedMs:refused?null:3};});
 try{
  await ok(f,{type:'GET_STATE'});await ok(f,{type:'RUN_DIAGNOSTICS',siteIds:['chatgpt','claude']});await tick();assert.deepEqual(calls,['chatgpt']);
  refused=false;await ok(f,{type:'RUN_DIAGNOSTICS',siteIds:['public-https']});await tick();
  assert.equal((await ok(f,{type:'GET_DIAGNOSTICS'})).diagnostics.observations[0].kind,'http_ok');assert.equal(f.writes,0);
 }finally{f.service.dispose();}
});

test('failed or malformed control reads invalidate pending diagnostics and require a fresh explicit run',async()=>{
 for(const malformed of [false,true]){
  let finish;const f=fixture(()=>new Promise(resolve=>finish=resolve));
  try{
   await ok(f,{type:'GET_STATE'});await ok(f,{type:'RUN_DIAGNOSTICS',siteIds:['public-https']});await tick();
   const before=(await ok(f,{type:'GET_DIAGNOSTICS'})).diagnostics.configRevision;
   if(malformed)f.native({browserMode:'forged'});else f.statusFailure(Object.assign(Error('private'),{code:'E_TIMEOUT'}));
   const state=await ok(f,{type:'GET_STATE'});assert.equal(state.state.runtime.control,'unknown');
   finish({kind:'http_ok',httpStatus:200,elapsedMs:5});await tick();
   const after=(await ok(f,{type:'GET_DIAGNOSTICS'})).diagnostics;
   assert.notEqual(after.configRevision,before);assert.equal(after.observations.length,0);assert.equal(after.activeRun,null);
   f.statusFailure(null);f.native({browserMode:'system'});await ok(f,{type:'GET_STATE'});
   await ok(f,{type:'RUN_DIAGNOSTICS',siteIds:['public-https']});await tick();finish({kind:'http_ok',httpStatus:200,elapsedMs:4});await tick();
   assert.equal((await ok(f,{type:'GET_DIAGNOSTICS'})).diagnostics.observations.length,1);
  }finally{f.service.dispose();}
 }
});

test('a subscriber stops refreshing after an unchanged status failure',async()=>{
 for(const malformed of [false,true]){
  const f=fixture(async()=>({kind:'http_ok',httpStatus:200,elapsedMs:1}));
  let refreshes=0,off=()=>{};
  try{
   await ok(f,{type:'GET_STATE'});
   if(malformed)f.native({browserMode:'forged'});else f.statusFailure(Object.assign(Error('private'),{code:'E_TIMEOUT'}));
   off=f.service.subscribe(()=>{refreshes++;if(refreshes>=6){off();return;}void f.service.request({type:'GET_STATE'});});
   await ok(f,{type:'GET_STATE'});await tick();
   assert.equal(refreshes,1,'the first changed state notifies once; the same failure must deduplicate');
   await ok(f,{type:'GET_STATE'});await tick();assert.equal(refreshes,1);
  }finally{off();f.service.dispose();}
 }
});
