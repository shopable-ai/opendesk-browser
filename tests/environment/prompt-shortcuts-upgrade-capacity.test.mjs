// Source-bound persistence regressions; no package promotion or Chromium acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {executePromptPlan} from '../../src/ui/conversation/prompt-actions.js';
import {SIDEBAR_TOOL_DATA_LIMITS} from '../../src/ui/sidebar-tools/package.js';
import {writeVerifiedLocalValue,stableStorageString} from '../../src/ui/sidebar-tools/storage-state.js';
import '../../projects/prompt-shortcuts/trusted/model.js';
const model=globalThis.OpenDeskPromptShortcutsModel;
const hash=value=>createHash('sha256').update(stableStorageString(value)).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
const tool='projects/prompt-shortcuts';
const [main,host]=await Promise.all([readFile(tool+'/src/main.js','utf8'),readFile('src/ui/sidebar-tools.js','utf8')]);
function slice(source,start,end){
  const i=source.indexOf(start),j=source.indexOf(end,i);
  assert(i>=0&&j>i,'production function boundaries exist');return source.slice(i,j);
}
function legacy(size=8192,settings={}){
  const value={schema:1,items:[{...model.draft({body:'a',label:'A',name:'A'},null,()=> 'capacity_legacy'),order:0}],
    settings:{webButtons:true,imageSize:'large',...settings}};
  value.items[0].body+='a'.repeat(size-model.bytes(value));
  assert.equal(model.bytes(value),size);return value;
}
function storage(initial,{fault=null}={}){
  let value=clone(initial),writes=0,attempts=0;
  const read=async()=>{
    if(fault==='unreadable'&&attempts)throw Error('readback unavailable');
    return {value:clone(value),etag:hash(value)};
  };
  const write=async({value:next,ifMatch})=>{
    attempts++;
    if(fault==='conflict'||ifMatch!==hash(value))throw Object.assign(Error('conflict'),{code:'E_STORAGE_CONFLICT'});
    if(model.bytes(next)>8192)throw Object.assign(Error('item quota'),{code:'E_TOOL_DATA_LIMIT'});
    value=clone(next);writes++;
    if(fault==='lost-ack'||fault==='unreadable')throw Error('ack lost');
    return {saved:true,etag:hash(value)};
  };
  return {read,write,get value(){return value;},get writes(){return writes;},get attempts(){return attempts;}};
}
function sandboxCommit(initial,options){
  const f=storage(initial,options);
  const context={model,KEY:'library',data:model.load(initial),etag:hash(initial),ready:true,
    busy:false,unconfirmedWrite:false,lock(){},status(){},imageAssets:new Map(),
    request:(op,payload)=>op==='storage.get'?f.read():f.write(payload)};
  runInNewContext(slice(main,'async function readLibrary(){','async function update('),context);
  return {...context,storage:f,run:next=>context.commit(next),context};
}

test('full 8192 B library loads without retired navigation expansion',()=>{
  const old=legacy(),loaded=model.load(old);
  assert.equal(model.bytes(loaded),8192);
  assert.equal(Object.hasOwn(loaded.settings,'scrollNavigation'),false);
  assert.equal(model.libraryBytes(loaded),8192);
  assert.deepEqual(model.libraryForStorage(loaded),old);
  assert.equal(model.bytes({webButtons:true}),19,'generic bytes stays literal');
  assert.deepEqual(SIDEBAR_TOOL_DATA_LIMITS,{itemBytes:8192,totalBytes:32768,maxKeys:32});
});

test('storage conversion retires navigation overrides while preserving prompts and image settings',()=>{
  const old=legacy(8000,{imageSize:'compact',scrollNavigation:{regionTop:false,floatingTop:true}});
  const loaded=model.load(old);
  const before=clone(loaded),stored=model.libraryForStorage(loaded);
  assert.deepEqual(stored.settings,{webButtons:true,imageSize:'compact'});
  assert.deepEqual(stored.items,old.items);
  assert.deepEqual(model.load(stored),loaded);assert.deepEqual(loaded,before);
  assert.throws(()=>model.libraryForStorage({...loaded,settings:{...loaded.settings,imageSize:'invalid'}}),{code:'E_PROMPT_DATA'});
});

test('import preview measures the same normalized representation as persistence',()=>{
  const old=legacy();
  const incoming=old.items.map(row=>({...row,id:'imported_capacity'}));
  const plan=model.backupPlan(old,incoming,'replace');
  assert.equal(plan.bytes,model.bytes(model.libraryForStorage(plan.next)));
  assert.equal(plan.bytes,8194);assert.equal(plan.overLimit,true);
  incoming[0].id=old.items[0].id;
  const fits=model.backupPlan(old,incoming,'replace');
  assert.equal(fits.bytes,8192);assert.equal(fits.overLimit,false);
});

for(const fault of [null,'lost-ack','conflict','unreadable']){
  test('sandbox actual commit at legacy capacity: '+(fault||'normal'),async()=>{
    const old=legacy(),f=sandboxCommit(old,{fault});
    const next=model.load(old);next.items[0].name='B';
    if(fault==='conflict'||fault==='unreadable'){
      await assert.rejects(f.run(next));
      assert.equal(f.context.data.items[0].name,'A');
      assert.equal(f.context.unconfirmedWrite,fault==='unreadable');
      if(fault==='unreadable')await assert.rejects(f.run(next),/未确认/);
    }else{
      await f.run(next);
      assert.deepEqual(f.context.data.settings,{webButtons:true,imageSize:'large'});
      assert.equal(f.context.etag,hash(f.storage.value));
      assert.equal(f.storage.value.items[0].name,'B');
      assert.equal(Object.hasOwn(f.storage.value.settings,'scrollNavigation'),false);
    }
    assert.equal(f.storage.attempts,1,'never replay an unknown write');
    assert.equal(f.storage.writes,fault==='conflict'?0:1);
  });
}

test('full library refuses real new prompt bytes before writing or losing data',async()=>{
  const old=legacy(),f=sandboxCommit(old);
  const next=model.load(old);next.items[0].body+='a';
  assert(model.libraryBytes(next)>8192);
  await assert.rejects(f.run(next),{code:'E_TOOL_DATA_LIMIT'});
  assert.equal(f.storage.attempts,0);assert.deepEqual(f.storage.value,old);
  const imported=next.items.map(row=>({...row}));
  assert.equal(model.backupPlan(next,imported,'replace').overLimit,true);
});

for(const fault of [null,'lost-ack','conflict','unreadable']){
  test('AI actual write at legacy capacity uses stored ETag: '+(fault||'normal'),async()=>{
    const old=legacy(),f=storage(old,{fault});
    const run=()=>executePromptPlan({plan:{action:{type:'update',target:old.items[0].id,name:'B'}},
      model,read:f.read,write:f.write});
    if(fault==='conflict'||fault==='unreadable')await assert.rejects(run(),
      {code:fault==='conflict'?'E_STORAGE_CONFLICT':'E_OUTCOME_UNKNOWN'});
    else{
      const result=await run();assert.equal(result.etag,hash(f.value));
      assert.equal(f.value.items[0].name,'B');
      assert.equal(Object.hasOwn(f.value.settings,'scrollNavigation'),false);
    }
    assert.equal(f.attempts,1);assert.equal(f.writes,fault==='conflict'?0:1);
  });
}

function trustedSettings(initial,extra={}){
  let raw={library:initial,sites:{schema:1,rules:[]},...extra},writes=0;
  const notices=[];
  const context={OpenDeskPromptShortcutsModel:model,TextEncoder,SIDEBAR_TOOL_DATA_LIMITS,
    PROMPT_ID:'prompt-shortcuts',SIDEBAR_TOOL_STORE:'registry',active:{id:'prompt-shortcuts'},
    promptWebButtons:initial.settings.webButtons,promptWebPending:false,promptWebChanged:false,busy:false,disposed:false,
    readOnlyPreview:false,enableReadError:false,enableRecords:{},render(){},notice:message=>notices.push(message),
    locked:(_key,fn)=>fn(),sidebarToolEnabled:()=>true,samePackage:(a,b)=>a.id===b.id,
    requireCompleteInstalledSidebarTools:value=>value,sidebarToolStorageKey:()=> 'namespace',writeVerifiedLocalValue,
    api:{storage:{local:{get:async key=>key==='registry'?{registry:[{id:'prompt-shortcuts'}]}:{namespace:clone(raw)},
      set:async row=>{writes++;raw=clone(row.namespace);}}}}};
  runInNewContext(slice(host,'  async function readPromptSettings(){','  if(promptWebAction)listen'),context);
  return {context,notices,get raw(){return raw;},get writes(){return writes;}};
}
test('trusted webButtons handler preserves prompts, images and namespace data while retiring navigation settings',async()=>{
  const initial=legacy(7900,{imageSize:'compact',scrollNavigation:{conversationTop:false}});
  const f=trustedSettings(initial),{context}=f;
  await context.changePromptWebButtons({isTrusted:true});
  const {raw,writes}=f;
  assert.equal(writes,1);assert.equal(context.promptWebButtons,false);
  assert.deepEqual(raw.library,model.libraryForStorage({...initial,settings:{...initial.settings,webButtons:false}}));
  assert.deepEqual(raw.sites,{schema:1,rules:[]});
  assert.deepEqual(raw.library.items,initial.items);
  assert.equal(model.load(raw.library).settings.imageSize,'compact');
  assert.equal(Object.hasOwn(raw.library.settings,'scrollNavigation'),false);
  await context.changePromptWebButtons({isTrusted:false});assert.equal(f.writes,1);
});

test('trusted settings at 8 KiB permits shrinking writes and refuses real growth without loss',async()=>{
  const fits=trustedSettings(legacy(8192,{webButtons:false}));
  await fits.context.changePromptWebButtons({isTrusted:true});
  assert.equal(fits.writes,1);assert.equal(model.bytes(fits.raw.library),8191);
  assert.equal(model.load(fits.raw.library).settings.webButtons,true);
  const full=legacy(),blocked=trustedSettings(full);
  await blocked.context.changePromptWebButtons({isTrusted:true});
  assert.equal(blocked.writes,0);assert.deepEqual(blocked.raw.library,full);
  assert.match(blocked.notices.at(-1),/E_TOOL_DATA_LIMIT/);
});
test('trusted settings retains the namespace 32 KiB quota',async()=>{
  const initial=legacy(8191),extra={padding:''};
  extra.padding='x'.repeat(32768-model.bytes({library:initial,sites:{schema:1,rules:[]},...extra}));
  const f=trustedSettings(initial,extra),before=clone(f.raw);
  assert.equal(model.bytes(f.raw),32768);
  await f.context.changePromptWebButtons({isTrusted:true});
  assert.equal(f.writes,0);assert.deepEqual(f.raw,before);
  assert.match(f.notices.at(-1),/E_TOOL_DATA_LIMIT/);
});
