import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:[new URL('../src/environment.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {configureEnvironment}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const favoriteKey='aiProxy.diagnostics.favorites.v2';
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
function fixture(){
 const values=new Map(),revisions=new Map(),calls=[];
 const root=new EventTarget();let page={status:'available',url:'https://www.example.org/private?token=secret#fragment',title:'Private title'};
 let network=async()=>({status:200,data:'private response'}),beforeWrite=()=>{},beforeRead=async()=>{},reply={saved:true},beforePage=async()=>{};
 const bridge={root,setState(){},async request(action,input){
  calls.push({action,input:structuredClone(input)});
  if(action==='currentPage.info'){await beforePage();return page;}
  if(action==='browser.network.request')return network(input);
  const revision=revisions.get(input.key)??0;
  if(action==='storage.get'){await beforeRead(input);return {value:structuredClone(values.get(input.key)??null),etag:'v'+revision};}
  assert.equal(action,'storage.set');beforeWrite(input);
  if(input.ifMatch!=='v'+(revisions.get(input.key)??0))throw Object.assign(Error('Conflict'),{code:'E_CONFLICT'});
  values.set(input.key,structuredClone(input.value));revisions.set(input.key,revision+1);return reply;
 }};
 const sdk={browser:{proxy:{managed:{getStatus:async()=>({state:'disabled',canStop:false,control:'controllable_by_this_extension',permission:true,browserMode:'system'})}}}};
 return {calls,root,values,open:()=>configureEnvironment(bridge,sdk,{trusted:true}),
  replace(key,value){values.set(key,value);revisions.set(key,(revisions.get(key)??0)+1);},
  page(value){page=value;},network(value){network=value;},beforeRead(fn){beforeRead=fn;},beforePage(fn){beforePage=fn;},beforeWrite(fn){beforeWrite=fn;},reply(value){reply=value;}};
}
async function ok(env,message){const result=await env.request(message);assert.equal(result.ok,true,JSON.stringify(result));return result;}
const saved=(domain,priority='P0')=>({type:'SAVE_DIAGNOSTIC_SITE',domain,priority});
const networkCalls=f=>f.calls.filter(call=>call.action==='browser.network.request');

test('favorites add/order/remove persist through reopen without HTTP or proxy config changes',async()=>{
 const f=fixture();let env=f.open();
 try{
  await ok(env,{type:'GET_DIAGNOSTICS'});
  await ok(env,saved('www.example.org'));await ok(env,saved('www.iana.org'));
  await ok(env,{type:'MOVE_DIAGNOSTIC_SITE',id:'custom:www.iana.org',direction:'up'});
  const before=(await ok(env,{type:'GET_DIAGNOSTICS'})).diagnostics.favorites;
  assert.equal(before[0].domain,'www.iana.org');assert.equal(before[1].domain,'www.example.org');
  assert.equal(networkCalls(f).length,0);assert.deepEqual([...f.values.keys()],[favoriteKey]);
  env.dispose();env=f.open();
  assert.deepEqual((await ok(env,{type:'GET_DIAGNOSTICS'})).diagnostics.favorites,before);
  await ok(env,{type:'REMOVE_DIAGNOSTIC_SITE',id:'custom:www.iana.org'});
  assert.equal(f.values.get(favoriteKey).some(site=>site.domain==='www.iana.org'),false);
  env.dispose();env=f.open();assert.equal((await ok(env,{type:'GET_DIAGNOSTICS'})).diagnostics.favorites.length,6);
 }finally{env.dispose();}
});
test('cancel and page changes stop the next GET while cancellation storage reads are delayed',async()=>{
 for(const action of ['cancel','page']){
  const f=fixture(),env=f.open();let finish,unblock;
  try{
   f.network(()=>new Promise(resolve=>finish=resolve));
   await ok(env,{type:'RUN_DIAGNOSTICS',siteIds:['chatgpt','claude']});await tick();
   f.beforeRead(()=>new Promise(resolve=>unblock=resolve));
   const cancelled=action==='cancel'?env.request({type:'CANCEL_DIAGNOSTICS'}):f.root.dispatchEvent(new Event('opendesk-page-changed'));
   await tick();finish({status:200,data:'private response'});await tick();
   assert.equal(networkCalls(f).length,1);
   f.beforeRead(async()=>{});unblock();if(action==='cancel')assert.equal((await cancelled).ok,true);await tick();
   assert.equal((await ok(env,{type:'GET_DIAGNOSTICS'})).diagnostics.observations.length,0);
  }finally{env.dispose();}
 }
});
test('cancel during current target preparation prevents a late run from starting',async()=>{
 const f=fixture(),env=f.open();let unblock;
 try{
  f.beforePage(()=>new Promise(resolve=>unblock=resolve));
  const pending=env.request({type:'RUN_CURRENT_DIAGNOSTIC',expectedDomain:'www.example.org'});await tick();
  const cancelled=env.request({type:'CANCEL_DIAGNOSTICS'});
  unblock();assert.equal((await pending).errorCode,'E_CANCELLED');assert.equal((await cancelled).ok,true);await tick();
  assert.equal(networkCalls(f).length,0);
 }finally{env.dispose();}
});
test('only saved public custom hosts can run, and HTTP receipts never persist bodies',async()=>{
 const f=fixture(),env=f.open();
 try{
  assert.equal((await env.request({type:'RUN_DIAGNOSTICS',siteIds:['custom:www.example.org']})).ok,false);
  await ok(env,saved('www.example.org'));await ok(env,{type:'RUN_DIAGNOSTICS',siteIds:['custom:www.example.org']});await tick();
  assert.equal(networkCalls(f)[0].input.url,'https://www.example.org/');
  const snapshot=(await ok(env,{type:'GET_DIAGNOSTICS'})).diagnostics;
  assert.equal(snapshot.observations[0].domain,'www.example.org');assert.equal(snapshot.observations[0].httpStatus,200);
  assert.doesNotMatch(JSON.stringify([...f.values]),/private response|observations|token|fragment/);
  for(const domain of ['127.0.0.1','[::1]','localhost','host.local','host.intranet','https://www.example.org/private?token=secret','user:secret@www.example.org','www.example.org:443'])
   assert.equal((await env.request(saved(domain))).ok,false,domain);
  assert.equal(networkCalls(f).length,1);
 }finally{env.dispose();}
});
test('favorite CAS conflict preserves newer data and unknown writes are never replayed',async()=>{
 for(const unknown of [false,true]){
  const f=fixture(),env=f.open();
  try{
   await ok(env,{type:'GET_DIAGNOSTICS'});
   if(unknown)f.reply({saved:false});else f.beforeWrite(()=>f.replace(favoriteKey,[]));
   assert.equal((await env.request(saved('www.example.org'))).ok,false);
   assert.equal(f.calls.filter(call=>call.action==='storage.set').length,1);
   if(!unknown)assert.deepEqual(f.values.get(favoriteKey),[]);
   assert.equal(networkCalls(f).length,0);
  }finally{env.dispose();}
 }
});
test('current website shows only a safe HTTPS root and revalidates before dispatch',async()=>{
 const f=fixture(),env=f.open();
 try{
  const info=await env.currentSite();assert.equal(info.diagnosticDomain,'www.example.org');assert.doesNotMatch(JSON.stringify(info),/private|token|secret|fragment/);
  assert.equal(networkCalls(f).length,0);
  await ok(env,{type:'RUN_CURRENT_DIAGNOSTIC',expectedDomain:info.diagnosticDomain});await tick();
  assert.equal(networkCalls(f)[0].input.url,'https://www.example.org/');
  assert.equal((await ok(env,{type:'GET_DIAGNOSTICS'})).diagnostics.observations[0].siteId,'current:www.example.org');
  f.page({status:'available',url:'https://www.iana.org/'});
  const conflict=await env.request({type:'RUN_CURRENT_DIAGNOSTIC',expectedDomain:info.diagnosticDomain});assert.equal(conflict.errorCode,'E_CONFLICT');
  assert.equal((await env.request({type:'RUN_DIAGNOSTICS',siteIds:['current:www.iana.org']})).ok,false);
  assert.equal(networkCalls(f).length,1);assert.equal(f.values.size,0);
 }finally{env.dispose();}
});
test('current website result survives the first poll after favorites change in another view',async()=>{
 const f=fixture(),sidebar=f.open();
 try{
  const before=(await ok(sidebar,{type:'GET_DIAGNOSTICS'})).diagnostics.favorites;
  f.replace(favoriteKey,[...before,{id:'custom:www.iana.org',name:'www.iana.org',domain:'www.iana.org',
   kind:'custom',priority:'P0',provenance:'user',pinnedByUser:true}]);
  await ok(sidebar,{type:'RUN_CURRENT_DIAGNOSTIC',expectedDomain:'www.example.org'});
  await tick();
  const result=(await ok(sidebar,{type:'GET_DIAGNOSTICS'})).diagnostics;
  assert.ok(result.favorites.some(site=>site.domain==='www.iana.org'));
  assert.equal(result.observations[0]?.siteId,'current:www.example.org');
  assert.equal(result.observations[0]?.httpStatus,200);
  assert.equal(networkCalls(f).length,1);
 }finally{sidebar.dispose();}
});
test('unsafe, unavailable and unauthorized current pages never send a diagnostic request',async()=>{
 const f=fixture(),env=f.open();
 try{
  for(const url of ['http://www.example.org/path','https://www.example.org:8443/','https://127.0.0.1/','https://[::1]/','https://router.local/','https://user:secret@www.example.org/','chrome://settings/','bad']){
   f.page({status:'available',url});assert.equal((await env.currentSite()).diagnosticDomain,null);
   assert.equal((await env.request({type:'RUN_CURRENT_DIAGNOSTIC',expectedDomain:'www.example.org'})).ok,false);
  }
  f.page({status:'unavailable'});assert.equal((await env.currentSite()).diagnosticReason,'unavailable');
  assert.equal(networkCalls(f).length,0);
 }finally{env.dispose();}
});
test('cancel, page changes and disposal discard pending custom/current results',async()=>{
 for(const action of ['cancel','page','dispose']){
  const f=fixture(),env=f.open();let finish;
  f.network(()=>new Promise(resolve=>finish=resolve));
  try{
   await ok(env,saved('www.example.org'));
   await ok(env,{type:'RUN_DIAGNOSTICS',siteIds:['custom:www.example.org','claude']});await tick();
   if(action==='cancel')await ok(env,{type:'CANCEL_DIAGNOSTICS'});
   else if(action==='page')f.root.dispatchEvent(new Event('opendesk-page-changed'));
   else env.dispose();
   await tick();finish({status:200,data:'private response'});await tick();
   assert.equal(networkCalls(f).length,1);
   if(action!=='dispose')assert.equal((await ok(env,{type:'GET_DIAGNOSTICS'})).diagnostics.observations.length,0);
  }finally{env.dispose();}
 }
});
