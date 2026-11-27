// R4.8 first-install unit lifecycle. No synthetic page input or Chrome PASS claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerDefaultPreinstall,resumeDefaultPreinstall,DEFAULT_PREINSTALL_STORE}
  from '../../src/sidebar-tools/default-preinstall.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {MARKET_PROVENANCE_STORE,MARKET_OPERATIONS_STORE,TOOL_REVOCATION_EPOCHS_STORE,
  recordToolUninstall} from '../../src/ui/sidebar-tools/installation.js';
import {READING_TOC_SITE_STORE} from '../../projects/reading-toc/trusted/policy.js';
import {CLIP_SITE_STORE} from '../../projects/web-markdown-clipper/trusted/policy.js';
import {CAPTURE_SITE_STORE} from '../../src/knowledge/policy.js';
import {officialFixtures,officialFixtureFetch,officialToolFixture} from '../helpers/official-tools.mjs';
import {matchesOfficialRelease} from '../../src/sidebar-tools/official-catalog.js';
import {sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';
import {WEBFLOW_AUTO_GRANTS_KEY} from '../../projects/webflow/src/auto-grants.js';

const sidebarOnly=['web-markdown-clipper','quick-notes','cookie-editor','prompt-shortcuts','webflow'];
const companions=['reading-toc','ai-send-queue','ai-new-chat-window'];
const preinstalled=[companions[0],...sidebarOnly,...companions.slice(1)];
function companionHost({preflight=()=>{},cleanupPending=null}={}){
  const prepared=new Map(),calls=[];
  return {calls,async request(type,payload){
    const toolId=payload.tool?.id??payload.toolId;
    calls.push([type,toolId]);
    if(type==='prepareAppPage'){
      preflight(toolId);
      const tool=payload.tool,packageHash=await sidebarToolPackageHash(tool);
      const {programId,sourceHash}=tool.pageModule;
      prepared.set(tool.id,{packageHash,programId,sourceHash});
      return {status:'prepared',toolId,packageHash,programId,sourceHash};
    }
    const candidate=prepared.get(toolId);
    assert.ok(candidate,'companion must be prepared before a write');
    if(type==='synchronizeAppPages')return {status:'synchronized',retired:[],
      cleanupPending:toolId===cleanupPending?[candidate.programId]:[]};
    assert.equal(type,'importAppPage');
    assert.equal(payload.packageHash,candidate.packageHash);
    return {status:'installed',nativeState:'registered',ready:true,manifestHash:'a'.repeat(64),
      appOwner:payload,programId:candidate.programId,sourceHash:candidate.sourceHash};
  }};
}

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
test('first install commits exact Sidebar releases before the trusted host installs their authorized companions',async()=>{
  const fixtures=await officialFixtures();
  assert.deepEqual(fixtures.catalog.apps.filter(a=>a.installationPolicy==='preinstalled').map(a=>a.toolId),
    preinstalled);
  const f=browser();
  assert.deepEqual(await registerDefaultPreinstall({...f.options,reason:'update'}),{state:'not-new-install'});
  assert.equal(f.storage.has(DEFAULT_PREINSTALL_STORE),false);
  assert.equal((await registerDefaultPreinstall({...f.options,reason:'install'})).state,'pending');
  assert.equal(f.storage.has(SIDEBAR_TOOL_STORE),false,'marking intent does not install');
  const result=await resumeDefaultPreinstall(f.options);
  assert.deepEqual(result,{state:'pending',reason:'host-required',installed:sidebarOnly.length});
  assert.deepEqual(f.storage.get(SIDEBAR_TOOL_STORE).map(a=>a.id),sidebarOnly);
  const pageClient=companionHost();
  assert.equal((await resumeDefaultPreinstall({...f.options,pageClient})).state,'complete');
  const installed=f.storage.get(SIDEBAR_TOOL_STORE);
  assert.deepEqual(installed.map(a=>a.id),[...sidebarOnly,...companions]);
  assert.deepEqual(Object.keys(f.storage.get(MARKET_PROVENANCE_STORE)).sort(),[...preinstalled].sort());
  for(const tool of installed){
    const release=fixtures.catalog.apps.find(row=>row.toolId===tool.id);
    assert.equal(await matchesOfficialRelease(release,tool),true);
  }
  assert.deepEqual(pageClient.calls.filter(([op])=>op==='importAppPage').map(([,id])=>id),companions);
  for(const key of [READING_TOC_SITE_STORE,CLIP_SITE_STORE,CAPTURE_SITE_STORE,WEBFLOW_AUTO_GRANTS_KEY])
    assert.equal(f.storage.has(key),false,'preinstall never grants a website');
  assert.equal(globalThis.__officialToolMustNotRun,undefined);
  assert.equal(f.storage.get(DEFAULT_PREINSTALL_STORE).state,'complete');
  const writes=f.writes.filter(a=>a.includes(SIDEBAR_TOOL_STORE)).length;
  await Promise.all([resumeDefaultPreinstall(f.options),resumeDefaultPreinstall(f.options)]);
  assert.equal(f.writes.filter(a=>a.includes(SIDEBAR_TOOL_STORE)).length,writes,'already initialized cannot write registry');
});
for(const code of ['E_PERMISSION','E_USER_SCRIPTS_UNAVAILABLE'])test('companion preflight waits for Chrome access: '+code,async()=>{
  const f=browser();
  let allowed=false;
  const pageClient=companionHost({preflight:id=>{
    if(!allowed&&(code==='E_USER_SCRIPTS_UNAVAILABLE'||id==='ai-send-queue'))throw Object.assign(new Error(code),{code});
  }});
  const options={...f.options,pageClient};
  await registerDefaultPreinstall({...options,reason:'install'});
  if(code==='E_PERMISSION')assert.deepEqual(await resumeDefaultPreinstall(options),{state:'permission-required'});
  else await assert.rejects(resumeDefaultPreinstall(options),{code});
  const pending=f.storage.get(DEFAULT_PREINSTALL_STORE);
  assert.equal(pending.state,'pending');
  assert.ok(pending.completed.includes('webflow'));
  assert.ok(!pending.completed.includes('ai-send-queue'));
  assert.ok(!f.storage.get(SIDEBAR_TOOL_STORE).some(row=>row.id==='ai-send-queue'));
  assert.ok(!Object.values(f.storage.get(MARKET_OPERATIONS_STORE)).some(row=>row.toolId==='ai-send-queue'));
  assert.ok(!pageClient.calls.some(([op,id])=>op!=='prepareAppPage'&&id==='ai-send-queue'));
  allowed=true;
  assert.equal((await resumeDefaultPreinstall(options)).state,'complete');
  assert.equal(pageClient.calls.filter(([op,id])=>op==='importAppPage'&&id==='ai-send-queue').length,1);
});
test('R4.8 old profile, existing choices and update events never trigger automatic installation',async()=>{
  const f=browser([[SIDEBAR_TOOL_STORE,[]],[TOOL_REVOCATION_EPOCHS_STORE,{'reading-toc':'previous-epoch'}]]);
  assert.equal((await registerDefaultPreinstall({...f.options,reason:'update'})).state,'not-new-install');
  assert.equal((await resumeDefaultPreinstall(f.options)).state,'not-requested');
  assert.equal((await registerDefaultPreinstall({...f.options,reason:'install'})).state,'skipped-existing');
  assert.deepEqual(f.storage.get(SIDEBAR_TOOL_STORE),[]);
  assert.equal((await resumeDefaultPreinstall(f.options)).state,'skipped-existing');
});
test('pending queue companion cleanup persists attention without retrying the package',async()=>{
  const f=browser();
  await registerDefaultPreinstall({...f.options,reason:'install'});
  const pageClient=companionHost({cleanupPending:'ai-send-queue'});
  const options={...f.options,pageClient};
  assert.deepEqual(await resumeDefaultPreinstall(options),{state:'attention',toolId:'ai-send-queue'});
  assert.equal(f.storage.get(DEFAULT_PREINSTALL_STORE).state,'attention');
  assert.deepEqual(f.storage.get(SIDEBAR_TOOL_STORE).find(tool=>tool.id==='ai-send-queue'),await officialToolFixture('ai-send-queue'));
  assert.equal(Object.values(f.storage.get(MARKET_OPERATIONS_STORE)).find(row=>row.toolId==='ai-send-queue').state,'outcome-unknown');
  const writes=f.writes.length;
  assert.equal((await resumeDefaultPreinstall(options)).state,'attention');
  assert.equal(f.writes.length,writes);
  assert.deepEqual(pageClient.calls.filter(([,id])=>id==='ai-send-queue').map(([op])=>op),['prepareAppPage','synchronizeAppPages']);
});
test('R4.8 a newer bundled Reading TOC never silently replaces an earlier reviewed installation',async()=>{
  // Existing user state is preserved regardless of whether first-install intent
  // was registered before the package appeared (for example, another host).
  const existing=await officialToolFixture('reading-toc');
  const provenance={'reading-toc':{marketId:'opendesk/reading-toc',version:existing.version,
    sha256:await sidebarToolPackageHash(existing)}};
  for(const pending of [false,true]){
    const f=browser();
    if(pending)await registerDefaultPreinstall({...f.options,reason:'install'});
    f.storage.set(SIDEBAR_TOOL_STORE,[existing]);
    f.storage.set(MARKET_PROVENANCE_STORE,provenance);
    assert.equal((await registerDefaultPreinstall({...f.options,reason:'update'})).state,'not-new-install');
    if(!pending)assert.equal((await registerDefaultPreinstall({...f.options,reason:'install'})).state,'skipped-existing');
    await resumeDefaultPreinstall(f.options);
    assert.deepEqual(f.storage.get(SIDEBAR_TOOL_STORE).find(tool=>tool.id==='reading-toc'),existing);
    assert.deepEqual(f.storage.get(MARKET_PROVENANCE_STORE)['reading-toc'],provenance['reading-toc']);
  }
});
test('R4.8 concurrent install event and first boot commit each exact package only once',async()=>{
  const f=browser();
  const options={...f.options,pageClient:companionHost()};
  await Promise.all(Array.from({length:4},()=>registerDefaultPreinstall({...f.options,reason:'install'})));
  const results=await Promise.all([resumeDefaultPreinstall(options),resumeDefaultPreinstall(options)]);
  assert(results.every(r=>r.state==='complete'));
  assert.equal(f.storage.get(SIDEBAR_TOOL_STORE).length,preinstalled.length);
  assert.equal(f.writes.filter(a=>a.includes(SIDEBAR_TOOL_STORE)).length,preinstalled.length);
});
test('R4.8 unavailable Web Markdown Clipper package leaves a pinned, recoverable partial first install',async()=>{
  const f=browser();
  const options={...f.options,pageClient:companionHost()};
  await registerDefaultPreinstall({...f.options,reason:'install'});
  let unavailable=true;
  const flaky=async url=>unavailable&&String(url).includes('/web-markdown-clipper/web-markdown-clipper.')?
    new Response('missing',{status:404}):officialFixtureFetch(url);
  await assert.rejects(resumeDefaultPreinstall({...options,fetcher:flaky}),error=>error.code==='E_PACKAGE_MISSING');
  assert.deepEqual(f.storage.get(SIDEBAR_TOOL_STORE).map(x=>x.id),['reading-toc']);
  assert.deepEqual(f.storage.get(DEFAULT_PREINSTALL_STORE).completed,['reading-toc']);
  unavailable=false;
  assert.equal((await resumeDefaultPreinstall(options)).state,'complete');
  assert.deepEqual(f.storage.get(SIDEBAR_TOOL_STORE).map(x=>x.id),preinstalled);
});
test('R4.8 uninstalled Web Markdown Clipper is never restored after worker restart',async()=>{
  const f=browser();
  await registerDefaultPreinstall({...f.options,reason:'install'});
  await resumeDefaultPreinstall(f.options);
  const original=f.storage.get(SIDEBAR_TOOL_STORE).find(tool=>tool.id==='web-markdown-clipper');
  assert.ok(original);
  await recordToolUninstall(f.api,original);
  f.storage.set(SIDEBAR_TOOL_STORE,f.storage.get(SIDEBAR_TOOL_STORE).filter(tool=>tool.id!==original.id));
  await resumeDefaultPreinstall(f.options);
  assert.equal(f.storage.get(SIDEBAR_TOOL_STORE).some(tool=>tool.id===original.id),false);
  assert.ok(f.storage.get(TOOL_REVOCATION_EPOCHS_STORE)[original.id]);
});
test('R4.8 corrupt registry fails closed; never silently reinitializes a damaged profile',async()=>{
  const f=browser([[SIDEBAR_TOOL_STORE,[{id:'reading-toc'}]]]);
  assert.equal((await registerDefaultPreinstall({...f.options,reason:'install'})).state,'skipped-existing');
  assert.equal(f.storage.get(DEFAULT_PREINSTALL_STORE).state,'skipped-existing');
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
