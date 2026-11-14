import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

// Bundle both imports together so the collector uses the real environment/ETag adapter.
const bundle=await build({stdin:{contents:`
 export {configureEnvironment} from './src/environment.ts';
 export * from './src/collector/rotation-plan.ts';
`,resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,platform:'node',format:'esm'});
const {configureEnvironment,ROTATION_PLAN_KEY,readRotationPlan,saveRotationPlan,clearRotationPlan}=
 await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const draft={targetHost:'example.com',threshold:3,maxAttempts:12,intervalMs:1000,endpointIds:['one','two']};
const endpoints=[{id:'one'},{id:'two'}];
function fixture(initial){
 let stored=structuredClone(initial),revision=0;
 const calls=[];
 const f={calls,readError:null,conflict:false,stored:()=>structuredClone(stored),
  env:configureEnvironment({async request(operation,input){
   calls.push([operation,structuredClone(input)]);
   assert.equal(input.key,ROTATION_PLAN_KEY);
   if(operation==='storage.get'){
    if(f.readError)throw f.readError;
    assert.equal(input.withEtag,true);
    return {value:structuredClone(stored),etag:`v${revision}`};
   }
   assert.equal(operation,'storage.set');
   assert.equal(input.ifMatch,`v${revision}`);
   if(f.conflict)throw Object.assign(Error('newer writer'),{code:'E_STORAGE_CONFLICT'});
   stored=structuredClone(input.value);revision++;return {saved:true};
  }},{browser:{proxy:{managed:new Proxy({},{get(){throw Error('configuration must not access proxy control');}})}}},{trusted:true})};
 return f;
}
test('uninitialized Host null and legacy undefined are empty plans, without writes',async()=>{
 for(const value of [null,undefined]){
  const f=fixture(value);
  try{assert.equal(await readRotationPlan(),null);assert.equal(f.calls.length,1);assert.equal(f.stored(),value);}
  finally{f.env.dispose();}
 }
});
test('nonempty malformed plans stay visible as failures and are never overwritten',async()=>{
 for(const value of [{},{version:2},{...draft,version:1,authorizedAt:Date.now(),endpointIds:['one']},'',false,0]){
  const f=fixture(value);
  try{await assert.rejects(readRotationPlan());assert.deepEqual(f.stored(),value);assert.equal(f.calls.length,1);}
  finally{f.env.dispose();}
 }
});
test('storage errors preserve their original code and never write a replacement',async()=>{
 const f=fixture(null);f.readError=Object.assign(Error('storage unavailable'),{code:'E_NOT_CONNECTED'});
 try{await assert.rejects(readRotationPlan(),error=>error===f.readError);assert.equal(f.calls.length,1);}
 finally{f.env.dispose();}
});
test('authorized configuration saves and reads back; clearing returns an empty plan on reopen',async()=>{
 const f=fixture(null);
 try{
  const plan=await saveRotationPlan(draft,endpoints,true);
  assert.deepEqual(await readRotationPlan(),plan);
  await clearRotationPlan();assert.equal(f.stored(),null);
  f.env.dispose();
  const reopened=fixture(f.stored());
  try{assert.equal(await readRotationPlan(),null);}finally{reopened.env.dispose();}
 }finally{f.env.dispose();}
});
test('consent and endpoint validation reject before writing, and conflicts are not replayed',async()=>{
 const f=fixture(null);
 try{
  await assert.rejects(saveRotationPlan(draft,endpoints,false));
  await assert.rejects(saveRotationPlan(draft,[{id:'one'}],true));
  assert.equal(f.calls.length,0);
  f.conflict=true;
  await assert.rejects(saveRotationPlan(draft,endpoints,true),{code:'E_STORAGE_CONFLICT'});
  assert.equal(f.calls.filter(([operation])=>operation==='storage.set').length,1);
  assert.equal(f.stored(),null);
 }finally{f.env.dispose();}
});
