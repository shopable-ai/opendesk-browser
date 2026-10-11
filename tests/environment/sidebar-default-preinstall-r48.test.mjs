// R4.8 first-install unit lifecycle. No synthetic page input or Chrome PASS claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerDefaultPreinstall,resumeDefaultPreinstall,DEFAULT_PREINSTALL_STORE}
  from '../../src/sidebar-tools/default-preinstall.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {MARKET_PROVENANCE_STORE,MARKET_OPERATIONS_STORE,TOOL_REVOCATION_EPOCHS_STORE,
  recordToolUninstall} from '../../src/ui/sidebar-tools/installation.js';
import {READING_TOC_SITE_STORE} from '../../src/reading-toc/policy.js';
import {CLIP_SITE_STORE} from '../../src/page-clip/policy.js';
import {CAPTURE_SITE_STORE} from '../../src/knowledge/policy.js';
import {officialFixtures,officialFixtureFetch} from '../helpers/official-tools.mjs';

function browser(initial=[]){
  const storage=new Map(initial);
  const locks=new Map(),writes=[];
  const lockManager={async request(name,work){
    const previous=locks.get(name)||Promise.resolve();
    let release;
    const done=new Promise(resolve=>{release=resolve;});
    locks.set(name,previous.then(()=>done));
    await previous;
    try{return await work();}finally{release();}
  }};
  const local={
    async get(keys){
      const names=typeof keys==='string'?[keys]:Array.isArray(keys)?keys:
        keys===null?[...storage.keys()]:Object.keys(keys||{});
      return Object.fromEntries(names.map(key=>[key,structuredClone(storage.get(key))]));
    },
    async set(obj){
      writes.push(Object.keys(obj));
      for(const [key,value] of Object.entries(obj))storage.set(key,structuredClone(value));
    }
  };
  const api={runtime:{getManifest:()=>({version:'0.1.0'}),
    getURL:path=>'chrome-extension://abcdefghijklmnopabcdefghijklmnop/'+path},
    storage:{local}};
  const options={api,lockManager,fetcher:officialFixtureFetch};
  return {api,options,storage,writes};
}
test('R4.8 trusted catalog policy is the only default selection; metadata-only boot executes no code or site grant',async()=>{
  const fixtures=await officialFixtures();
  assert.deepEqual(fixtures.catalog.apps.filter(a=>a.installationPolicy==='preinstalled').map(a=>a.toolId),
    ['reading-toc','quick-notes']);
  const f=browser();
  assert.deepEqual(await registerDefaultPreinstall({...f.options,reason:'update'}),{state:'not-new-install'});
  assert.equal(f.storage.has(DEFAULT_PREINSTALL_STORE),false);
  assert.equal((await registerDefaultPreinstall({...f.options,reason:'install'})).state,'pending');
  assert.equal(f.storage.has(SIDEBAR_TOOL_STORE),false,'marking intent does not install');
  const result=await resumeDefaultPreinstall(f.options);
  assert.equal(result.state,'complete');
  assert.deepEqual(f.storage.get(SIDEBAR_TOOL_STORE).map(a=>a.id),['reading-toc','quick-notes']);
  assert.deepEqual(Object.keys(f.storage.get(MARKET_PROVENANCE_STORE)).sort(),['quick-notes','reading-toc']);
  for(const key of [READING_TOC_SITE_STORE,CLIP_SITE_STORE,CAPTURE_SITE_STORE])
    assert.equal(f.storage.has(key),false,'preinstall never grants a website');
  assert.equal(globalThis.__officialToolMustNotRun,undefined);
  assert.equal(f.storage.get(DEFAULT_PREINSTALL_STORE).state,'complete');
  const writes=f.writes.filter(a=>a.includes(SIDEBAR_TOOL_STORE)).length;
  await Promise.all([resumeDefaultPreinstall(f.options),resumeDefaultPreinstall(f.options)]);
  assert.equal(f.writes.filter(a=>a.includes(SIDEBAR_TOOL_STORE)).length,writes,'already initialized cannot write registry');
});
test('R4.8 old profile, existing choices and update events never trigger automatic installation',async()=>{
  const f=browser([[SIDEBAR_TOOL_STORE,[]],[TOOL_REVOCATION_EPOCHS_STORE,{'reading-toc':'previous-epoch'}]]);
  assert.equal((await registerDefaultPreinstall({...f.options,reason:'update'})).state,'not-new-install');
  assert.equal((await resumeDefaultPreinstall(f.options)).state,'not-requested');
  assert.equal((await registerDefaultPreinstall({...f.options,reason:'install'})).state,'skipped-existing');
  assert.deepEqual(f.storage.get(SIDEBAR_TOOL_STORE),[]);
  assert.equal((await resumeDefaultPreinstall(f.options)).state,'skipped-existing');
});
test('R4.8 concurrent install event and first boot commit each exact package only once',async()=>{
  const f=browser();
  await Promise.all(Array.from({length:4},()=>registerDefaultPreinstall({...f.options,reason:'install'})));
  const results=await Promise.all([resumeDefaultPreinstall(f.options),resumeDefaultPreinstall(f.options)]);
  assert(results.every(r=>r.state==='complete'));
  assert.equal(f.storage.get(SIDEBAR_TOOL_STORE).length,2);
  assert.equal(f.writes.filter(a=>a.includes(SIDEBAR_TOOL_STORE)).length,2);
});
test('R4.8 unavailable second package leaves a pinned, recoverable partial first install',async()=>{
  const f=browser();
  await registerDefaultPreinstall({...f.options,reason:'install'});
  let unavailable=true;
  const flaky=async url=>unavailable&&String(url).includes('/quick-notes/quick-notes.')?
    new Response('missing',{status:404}):officialFixtureFetch(url);
  await assert.rejects(resumeDefaultPreinstall({...f.options,fetcher:flaky}),error=>error.code==='E_PACKAGE_MISSING');
  assert.deepEqual(f.storage.get(SIDEBAR_TOOL_STORE).map(x=>x.id),['reading-toc']);
  assert.deepEqual(f.storage.get(DEFAULT_PREINSTALL_STORE).completed,['reading-toc']);
  unavailable=false;
  assert.equal((await resumeDefaultPreinstall(f.options)).state,'complete');
  assert.deepEqual(f.storage.get(SIDEBAR_TOOL_STORE).map(x=>x.id),['reading-toc','quick-notes']);
});
test('R4.8 confirmed user uninstall is never restored after worker restart',async()=>{
  const f=browser();
  await registerDefaultPreinstall({...f.options,reason:'install'});
  await resumeDefaultPreinstall(f.options);
  const original=f.storage.get(SIDEBAR_TOOL_STORE)[0];
  await recordToolUninstall(f.api,original);
  f.storage.set(SIDEBAR_TOOL_STORE,f.storage.get(SIDEBAR_TOOL_STORE).filter(tool=>tool.id!==original.id));
  await resumeDefaultPreinstall(f.options);
  assert.equal(f.storage.get(SIDEBAR_TOOL_STORE).some(tool=>tool.id===original.id),false);
  assert.ok(f.storage.get(TOOL_REVOCATION_EPOCHS_STORE)[original.id]);
});
test('R4.8 corrupt registry fails closed; never silently reinitializes a damaged profile',async()=>{
  const f=browser([[SIDEBAR_TOOL_STORE,[{id:'reading-toc'}]]]);
  await assert.rejects(registerDefaultPreinstall({...f.options,reason:'install'}),error=>error.code==='E_STORAGE_CORRUPT');
  assert.equal(f.storage.has(DEFAULT_PREINSTALL_STORE),false);
  assert.deepEqual(f.storage.get(SIDEBAR_TOOL_STORE),[{id:'reading-toc'}]);
});
test('R4.8 lost registry acknowledgement preserves the package and forbids blind replay',async()=>{
  const f=browser();
  await registerDefaultPreinstall({...f.options,reason:'install'});
  const set=f.api.storage.local.set;let registryWrites=0;
  f.api.storage.local.set=async rows=>{
    await set(rows);
    if(Object.hasOwn(rows,SIDEBAR_TOOL_STORE)&&++registryWrites===2)
      throw Error('acknowledgement lost after durable package commit');
  };
  assert.equal((await resumeDefaultPreinstall(f.options)).state,'attention');
  assert.equal(f.storage.get(DEFAULT_PREINSTALL_STORE).state,'attention');
  assert.equal(f.storage.get(SIDEBAR_TOOL_STORE).length,2,'second package may already have persisted');
  const count=registryWrites;
  assert.equal((await resumeDefaultPreinstall(f.options)).state,'attention');
  assert.equal(registryWrites,count,'unknown effect is not retried');
  assert.equal(Object.values(f.storage.get(MARKET_OPERATIONS_STORE)).some(row=>row.state==='outcome-unknown'),true);
});
