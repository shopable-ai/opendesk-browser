// R1.9 first-install assertions against the real package builder + trusted installer.
// This is a Node Host fixture, NOT installed Chrome or a claim of real page insertion.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {SIDEBAR_TOOL_STORE,sidebarToolStorageKey,validateSidebarToolPackage}
  from '../../src/ui/sidebar-tools/package.js';
import {installReviewedSidebarTool}
  from '../../src/ui/sidebar-tools/installation.js';

const ROOT='examples/sidebar-tools/prompt-shortcuts';
const TOOL_ID='prompt-shortcuts',STORAGE=sidebarToolStorageKey(TOOL_ID);
const clone=value=>value===undefined?undefined:structuredClone(value);
const pack=()=>createSidebarToolPackage(ROOT);
const expectedLabels=['插件','外包','提示'];
const expectedNames=['浏览器插件定制','软件定制与外包','AI 提示词扩展'];

function fixture(initial=[]){
  const store=new Map(initial),writes=[],locks=new Map();
  let failNext=null;
  const local={
    async get(keys){
      const names=typeof keys==='string'?[keys]:Array.isArray(keys)?keys:
        keys===null?[...store.keys()]:Object.keys(keys||{});
      return Object.fromEntries(names.map(key=>[key,clone(store.get(key))]));
    },
    async set(values){
      for(const [key,value] of Object.entries(values)){
        if(failNext?.key===key){
          const fault=failNext;failNext=null;
          if(fault.after){store.set(key,clone(value));writes.push({key,value:clone(value)});}
          throw Error('simulated '+(fault.after?'lost acknowledgement':'failed write'));
        }
        store.set(key,clone(value));writes.push({key,value:clone(value)});
      }
    },
    async remove(key){store.delete(key);writes.push({key,removed:true});}
  };
  const lockManager={async request(name,task){
    const previous=locks.get(name)||Promise.resolve();
    let release;
    const pending=new Promise(resolve=>{release=resolve;});
    locks.set(name,previous.then(()=>pending));
    await previous;
    try{return await task();}finally{release();}
  }};
  const api={storage:{local},runtime:{getManifest:()=>({version:'0.1.0'})}};
  return {store,writes,api,lockManager,
    fail(key,after=false){failNext={key,after};},
    install(candidate,baseline=null){return installReviewedSidebarTool({
      api,lockManager,candidate,baseline,reviewApproved:true
    });}
  };
}

test('R1.9 package and shared model accept exact bounded editable first-run examples',async()=>{
  const tool=await pack();
  assert.equal(tool.version,'1.1.11');
  assert.deepEqual(validateSidebarToolPackage(tool),tool);
  assert.deepEqual(Object.keys(tool.initialData),['library']);
  const library=tool.initialData.library;
  assert.deepEqual(library.items.map(x=>x.label),expectedLabels);
  assert.deepEqual(library.items.map(x=>x.name),expectedNames);
  assert.equal(library.items.length,3);
  assert.equal(new Set(library.items.map(row=>row.id)).size,3);
  assert(library.items.every(row=>row.enabled===true&&row.appearance==='text'));
  assert(library.items.every(row=>row.labelAuto===false&&row.nameAuto===false));
  const source=await readFile(ROOT+'/trusted/model.js','utf8');
  const sandbox={URL,Intl,TextEncoder,crypto:webcrypto};
  runInNewContext(source,sandbox);
  const model=sandbox.OpenDeskPromptShortcutsModel;
  assert.equal(model.bytes(library)<=8192,true);
  assert.equal(model.load(library).items.length,3,'all entries valid for actual page model');
  assert(library.items.every(row=>model.validLabel(row.label)));
  assert.deepEqual([...model.load(null).items],[],
    'missing data must NOT be invented by the page or by generic model.load');
  assert.deepEqual([...model.load({schema:1,items:[],settings:{webButtons:true}}).items],[]);
  const preview=await readFile(ROOT+'/preview/index.html','utf8');
  const initial=preview.match(/\n const INITIAL=\[\n([\s\S]*?)\n \];/);
  assert(initial,'preview first-run records must stay source-bound to official manifest');
  const previewRows=JSON.parse('['+initial[1]+']');
  assert.deepEqual(previewRows,library.items,'first-run preview must contain exactly the packaged data');
  assert.match(preview,/previewDataScenario/);
  assert.match(preview,/LEGACY_IMAGE_ITEMS/);
  assert.match(preview,/previewReopen/);
  assert.throws(()=>validateSidebarToolPackage({...tool,
    initialData:{library:{text:'x'.repeat(8193)}}}),/8 KiB/);
});

test('R1.9 new install persists before admission and reopen is exactly three, never six',async()=>{
  const tool=await pack(),f=fixture();
  const result=await f.install(tool);
  assert.equal(result.state,'installed');
  assert.equal(f.store.get(STORAGE).library.items.length,3);
  assert.deepEqual(f.store.get(STORAGE).library.items.map(x=>x.label),expectedLabels);
  assert.equal(f.store.get(STORAGE).library.settings.webButtons,true);
  assert.equal(f.store.get(SIDEBAR_TOOL_STORE).length,1);
  assert(f.writes.findIndex(row=>row.key===STORAGE)<f.writes.findIndex(row=>row.key===SIDEBAR_TOOL_STORE),
    'page observer must never see admitted tool before seed is persisted');
  const written=f.writes.filter(row=>row.key===STORAGE).length;
  assert.equal((await f.install(tool,tool)).state,'already-installed');
  assert.equal(f.store.get(STORAGE).library.items.length,3);
  assert.equal(f.writes.filter(row=>row.key===STORAGE).length,written,'reopen did not seed');
});

test('R1.9 installed user data, site rules and intentional empty list survive reviewed upgrade',async()=>{
  const next=await pack(),old={...next,version:'1.1.10'};
  delete old.initialData;
  const standard=next.initialData.library;
  const changed={...standard,items:standard.items.map((row,i)=>({...row,
    enabled:i!==1,order:2-i,body:row.body+(i===0?' 用户补充':'')}))};
  const sites={schema:1,rules:[{origin:'https://example.org',pathScope:'/work',
    containerSelector:'main',editorSelector:'textarea',enabled:true}]};
  const four={...standard,items:[...standard.items,{...standard.items[0],
    id:'older-personal-prompt',label:'私人',name:'私人提示词',order:3}]};
  for(const library of [changed,four,{schema:1,items:[],settings:{...standard.settings}}]){
    const f=fixture([[SIDEBAR_TOOL_STORE,[old]],[STORAGE,{library,sites}]]);
    const outcome=await f.install(next,old);
    assert.equal(outcome.state,'installed');
    assert.deepEqual(f.store.get(STORAGE),{library,sites},
      'upgrade must not seed, append, reorder, revive disabled prompts or replace rules');
    assert.equal(f.writes.filter(row=>row.key===STORAGE).length,0);
  }
});

test('R1.9 two concurrent install screens cannot append or overwrite one another',async()=>{
  const tool=await pack(),f=fixture();
  const settled=await Promise.allSettled([f.install(tool),f.install(tool)]);
  assert.equal(settled.filter(row=>row.status==='fulfilled').length,1);
  assert.equal(settled.filter(row=>row.status==='rejected').length,1);
  assert.equal(settled.find(row=>row.status==='rejected').reason.code,'E_TOOL_CHANGED');
  assert.equal(f.store.get(STORAGE).library.items.length,3);
  assert.equal(f.writes.filter(row=>row.key===STORAGE).length,1);
});

test('R1.9 failed seed write refuses installation and keeps user storage untouched',async()=>{
  const tool=await pack(),f=fixture();
  f.fail(STORAGE);
  await assert.rejects(f.install(tool),e=>e.code==='E_HOST_STORAGE_WRITE');
  assert.equal(f.store.has(STORAGE),false);
  assert.equal(f.store.has(SIDEBAR_TOOL_STORE),false);
});

test('R1.9 confirmed registry failure after seed rolls seed back, not admitted',async()=>{
  const tool=await pack(),f=fixture([[SIDEBAR_TOOL_STORE,[]]]);
  f.fail(SIDEBAR_TOOL_STORE);
  await assert.rejects(f.install(tool),e=>e.code==='E_HOST_STORAGE_WRITE');
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),[]);
  assert.equal(f.store.has(STORAGE),false,'verified pre-commit failure removes only newly seeded data');
});

test('R1.9 lost seed acknowledgement readback succeeds, without duplicated initialization',async()=>{
  const tool=await pack(),f=fixture();
  f.fail(STORAGE,true);
  assert.equal((await f.install(tool)).state,'installed');
  assert.equal(f.store.get(STORAGE).library.items.length,3);
  assert.equal(f.writes.filter(row=>row.key===STORAGE).length,1);
});

test('R1.9 unknown registry acknowledgement retains seed and recorded install, never deletes',async()=>{
  const tool=await pack(),f=fixture();
  f.fail(SIDEBAR_TOOL_STORE,true);
  await assert.rejects(f.install(tool),e=>e.code==='E_OUTCOME_UNKNOWN');
  assert.equal(f.store.get(STORAGE).library.items.length,3);
  assert.equal(f.store.get(SIDEBAR_TOOL_STORE).length,1);
  const writes=f.writes.filter(row=>row.key===STORAGE).length;
  assert.equal((await f.install(tool,tool)).state,'already-installed');
  assert.equal(f.writes.filter(row=>row.key===STORAGE).length,writes);
});
