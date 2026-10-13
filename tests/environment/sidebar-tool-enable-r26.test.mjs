import test from 'node:test';
import assert from 'node:assert/strict';
import {SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_FORMAT,sidebarToolStorageKey,sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';
import {BROWSER_MENU_GRANTS_STORE} from '../../src/framework/sdk/browser-contract.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,requireToolEnableRecords,sidebarToolEnabled,sidebarToolLifecycleChanged} from '../../src/ui/sidebar-tools/lifecycle.js';
import {setInstalledSidebarToolEnabled,installReviewedSidebarTool,recordToolUninstall,cleanupUninstalledToolLocked,TOOL_CLEANUP_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {tocGrantAllowed,READING_TOC_SITE_STORE,READING_TOC_VISIBILITY_STORE} from '../../src/reading-toc/policy.js';
import {clipGrantAllowed,CLIP_SITE_STORE} from '../../src/page-clip/policy.js';
import {captureAllowed,CAPTURE_SITE_STORE,KNOWLEDGE_TOOL_ID,KNOWLEDGE_PROTOCOL,knowledgePackageHash} from '../../src/knowledge/policy.js';
import {createKnowledgeService} from '../../src/knowledge/service.js';
import {validateKnowledgeHandoff} from '../../src/knowledge/workspace-handoff.js';
import {initPageClip} from '../../src/page-clip/page.js';
import {inspectScript} from '../../scripts/verify-package.mjs';
test('existing SW startup resources have exact literal imports, without expanding dynamic execution',()=>{
  for(const path of ['sidebar-tools/preinstall-intent.js','agents/health-host.js','native-agent/transport.js','knowledge/knowledge-host.js'])
    assert.doesNotThrow(()=>inspectScript('importScripts('+JSON.stringify(path)+')','sw.js'));
  for(const code of ['importScripts("https://example.com/a.js")','importScripts("ui/tool.js")',
    'importScripts(resource)','importScripts("agents/"+"health-host.js")','globalThis.importScripts("agents/health-host.js")'])
    assert.throws(()=>inspectScript(code,'sw.js'),/Dynamic execution/);
  assert.throws(()=>inspectScript('importScripts("agents/health-host.js")','ui/tool.js'),/Dynamic execution/);
});
const tool={format:SIDEBAR_TOOL_FORMAT,id:'reading-toc',version:'1.0.0',title:'目录',description:'测试',
  capabilities:['page.toc'],html:'<main>test</main>',css:'',js:'void 0;'};
test('R26 lifecycle observations revoke only the affected tool and reject corrupted maps',()=>{
  const changes={[SIDEBAR_TOOL_ENABLE_STORE]:{oldValue:{'quick-notes':true},newValue:{'quick-notes':false}},
    [TOOL_REVOCATION_EPOCHS_STORE]:{oldValue:{'quick-notes':'old'},newValue:{'quick-notes':'new'}}};
  assert.equal(sidebarToolLifecycleChanged(changes,'reading-toc'),false);
  assert.equal(sidebarToolLifecycleChanged(changes,'quick-notes'),true);
  assert.equal(sidebarToolLifecycleChanged({[SIDEBAR_TOOL_ENABLE_STORE]:{newValue:{'quick-notes':false}}},'reading-toc'),false);
  assert.equal(sidebarToolLifecycleChanged({[SIDEBAR_TOOL_ENABLE_STORE]:{oldValue:{},newValue:{'quick-notes':'false'}}},'reading-toc'),true);
});
function fixture(candidate=tool){
  const values={[SIDEBAR_TOOL_STORE]:[candidate]},writes=[],locks=[];
  const api={storage:{local:{
    async get(keys){return Object.fromEntries((typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(values)).map(key=>[key,structuredClone(values[key])]));},
    async set(rows){writes.push(structuredClone(rows));Object.assign(values,structuredClone(rows));},
    async remove(key){delete values[key];}
  }}};
  const lockManager={request:async(name,work)=>{locks.push(name);return work();}};
  return {api,values,writes,locks,lockManager};
}
test('R26 legacy absence enables installed tools; damaged records fail closed without normalization',()=>{
  assert.equal(sidebarToolEnabled(undefined,tool.id),true);
  assert.deepEqual(requireToolEnableRecords(undefined),{});
  for(const damaged of [null,[],false,{[tool.id]:'false'},{'invalid id':true}]){
    assert.equal(sidebarToolEnabled(damaged,tool.id),false);
    assert.throws(()=>requireToolEnableRecords(damaged),{code:'E_STORAGE_CORRUPT'});
  }
});
test('R26 stop/resume preserve package/data/grants/preferences and fence every transition',async()=>{
  const f=fixture(),key=sidebarToolStorageKey(tool.id);
  Object.assign(f.values,{[key]:{note:'私有数据'},[READING_TOC_SITE_STORE]:{[tool.id]:['https://example.com']},
    [READING_TOC_VISIBILITY_STORE]:{[tool.id]:{hiddenSites:['https://example.com'],hiddenPages:[]}}});
  const baseline=structuredClone(f.values);
  await setInstalledSidebarToolEnabled({...f,tool,enabled:false});const stopped=f.values[TOOL_REVOCATION_EPOCHS_STORE][tool.id];
  assert.equal(f.values[SIDEBAR_TOOL_ENABLE_STORE][tool.id],false);
  assert.deepEqual(f.locks,['opendesk.sidebar-tools:tool:reading-toc','opendesk.sidebar-tools:catalog']);
  await setInstalledSidebarToolEnabled({...f,tool,enabled:true});
  assert.equal(f.values[SIDEBAR_TOOL_ENABLE_STORE][tool.id],true);
  assert.notEqual(f.values[TOOL_REVOCATION_EPOCHS_STORE][tool.id],stopped);
  for(const key of Object.keys(baseline))assert.deepEqual(f.values[key],baseline[key]);
  const writes=f.writes.length;await setInstalledSidebarToolEnabled({...f,tool,enabled:true});
  assert.equal(f.writes.length,writes,'same state is idempotent');
});
test('R26 stop/resume preserve valid Cookie grants while fencing old requests',async()=>{
  const f=fixture(),grant={version:tool.version,packageHash:await sidebarToolPackageHash(tool),installEpoch:null,
    origins:['https://example.com'],cookieSites:{'https://example.com':{read:true,write:false,values:false}}};
  const peer={version:'other',installEpoch:'peer'};
  f.values[BROWSER_MENU_GRANTS_STORE]={[tool.id]:grant,peer};
  await setInstalledSidebarToolEnabled({...f,tool,enabled:false});
  const stopped=f.values[TOOL_REVOCATION_EPOCHS_STORE][tool.id];
  assert.equal(f.values[BROWSER_MENU_GRANTS_STORE][tool.id].installEpoch,stopped);
  assert.notEqual(stopped,grant.installEpoch);
  await setInstalledSidebarToolEnabled({...f,tool,enabled:true});
  const resumed=f.values[TOOL_REVOCATION_EPOCHS_STORE][tool.id];
  assert.notEqual(resumed,stopped);
  assert.deepEqual(f.values[BROWSER_MENU_GRANTS_STORE][tool.id],{...grant,installEpoch:resumed});
  assert.deepEqual(f.values[BROWSER_MENU_GRANTS_STORE].peer,peer);
});
test('R26 enable never restores a stale package or revoked epoch grant',async()=>{
  for(const invalid of [{installEpoch:'revoked'},{packageHash:'0'.repeat(64)},{version:'old'}]){
    const f=fixture(),grant={version:tool.version,packageHash:await sidebarToolPackageHash(tool),installEpoch:null,...invalid};
    f.values[BROWSER_MENU_GRANTS_STORE]={[tool.id]:grant};
    await setInstalledSidebarToolEnabled({...f,tool,enabled:false});
    await setInstalledSidebarToolEnabled({...f,tool,enabled:true});
    assert.deepEqual(f.values[BROWSER_MENU_GRANTS_STORE][tool.id],grant);
  }
});
test('R26 grant migration failure leaves the tool stopped',async()=>{
  const f=fixture();
  f.values[BROWSER_MENU_GRANTS_STORE]={[tool.id]:{version:tool.version,packageHash:await sidebarToolPackageHash(tool),installEpoch:null}};
  const set=f.api.storage.local.set;
  f.api.storage.local.set=async rows=>{if(Object.hasOwn(rows,BROWSER_MENU_GRANTS_STORE))throw new Error('grant write denied');return set(rows);};
  await assert.rejects(setInstalledSidebarToolEnabled({...f,tool,enabled:false}));
  assert.equal(f.values[SIDEBAR_TOOL_ENABLE_STORE][tool.id],false);
});
test('R26 failed grant migration on resume cannot enable an old instance',async()=>{
  const f=fixture();
  f.values[BROWSER_MENU_GRANTS_STORE]={[tool.id]:{version:tool.version,packageHash:await sidebarToolPackageHash(tool),installEpoch:null}};
  await setInstalledSidebarToolEnabled({...f,tool,enabled:false});
  const set=f.api.storage.local.set;
  f.api.storage.local.set=async rows=>{if(Object.hasOwn(rows,BROWSER_MENU_GRANTS_STORE))throw new Error('grant write denied');return set(rows);};
  await assert.rejects(setInstalledSidebarToolEnabled({...f,tool,enabled:true}));
  assert.equal(f.values[SIDEBAR_TOOL_ENABLE_STORE][tool.id],false);
  assert.notEqual(f.values[BROWSER_MENU_GRANTS_STORE][tool.id].installEpoch,f.values[TOOL_REVOCATION_EPOCHS_STORE][tool.id]);
});
test('R26 corrupt records and stale package identity cannot be rewritten by a settings toggle',async()=>{
  const f=fixture(),bad={[tool.id]:0};f.values[SIDEBAR_TOOL_ENABLE_STORE]=bad;
  await assert.rejects(setInstalledSidebarToolEnabled({...f,tool,enabled:false}),{code:'E_STORAGE_CORRUPT'});
  assert.deepEqual(f.values[SIDEBAR_TOOL_ENABLE_STORE],bad);assert.equal(f.writes.length,0);
  await assert.rejects(setInstalledSidebarToolEnabled({...f,tool:{...tool,version:'2.0.0'},enabled:true}),{code:'E_TOOL_CHANGED'});
});
test('R26 failed stop epoch write remains stopped; failed resume never enables an old instance',async()=>{
  const f=fixture();f.api.storage.local.set=async rows=>{
    if(Object.hasOwn(rows,TOOL_REVOCATION_EPOCHS_STORE))throw new Error('disk full');Object.assign(f.values,rows);
  };
  await assert.rejects(setInstalledSidebarToolEnabled({...f,tool,enabled:false}));
  assert.equal(f.values[SIDEBAR_TOOL_ENABLE_STORE][tool.id],false);
  await assert.rejects(setInstalledSidebarToolEnabled({...f,tool,enabled:true}));
  assert.equal(f.values[SIDEBAR_TOOL_ENABLE_STORE][tool.id],false);
});
test('R26 acknowledged readback handles lost write acknowledgement without replay',async()=>{
  const f=fixture();f.api.storage.local.set=async rows=>{Object.assign(f.values,rows);throw new Error('ack lost');};
  await setInstalledSidebarToolEnabled({...f,tool,enabled:false});
  assert.equal(f.values[SIDEBAR_TOOL_ENABLE_STORE][tool.id],false);
});
test('R26 TOC, clip and capture grants cannot bypass stopped or malformed enable records',()=>{
  const clip={...tool,id:'clip-test',capabilities:['page.clip']};
  const knowledge={...tool,id:KNOWLEDGE_TOOL_ID,capabilities:['knowledge.store','page.capture']};
  for(const state of [{[tool.id]:false,[clip.id]:false,[knowledge.id]:false},null]){
    assert.equal(tocGrantAllowed([tool],{[tool.id]:['https://example.com']},tool.id,'https://example.com/a',state),false);
    assert.equal(clipGrantAllowed([clip],{[clip.id]:['https://example.com']},clip.id,'https://example.com/a',state),false);
    assert.equal(captureAllowed([knowledge],{[knowledge.id]:['https://chatgpt.com']},'https://chatgpt.com/c/test',state),false);
  }
});
test('R26 reinstalling identical reviewed package is a no-op and update retains stopped state',async()=>{
  const f=fixture();f.values[SIDEBAR_TOOL_ENABLE_STORE]={[tool.id]:false};
  const result=await installReviewedSidebarTool({...f,candidate:tool,baseline:tool,reviewApproved:true});
  assert.equal(result.state,'already-installed');assert.equal(f.writes.length,0);
  await installReviewedSidebarTool({...f,candidate:{...tool,version:'1.0.1'},baseline:tool,reviewApproved:true});
  assert.equal(f.values[SIDEBAR_TOOL_ENABLE_STORE][tool.id],false);
});
test('R26 confirmed uninstall uses recovery transaction and removes only its own runtime preference',async()=>{
  const f=fixture();f.values[SIDEBAR_TOOL_ENABLE_STORE]={[tool.id]:false,'other-tool':false};
  f.values[sidebarToolStorageKey(tool.id)]={note:'remove after commit'};
  await recordToolUninstall(f.api,tool);
  const waiting=await cleanupUninstalledToolLocked(f.api,tool.id);assert.equal(waiting.state,'still-installed');
  assert.ok(f.values[sidebarToolStorageKey(tool.id)]);
  f.values[SIDEBAR_TOOL_STORE]=[];
  assert.equal((await cleanupUninstalledToolLocked(f.api,tool.id)).state,'cleaned');
  assert.deepEqual(f.values[SIDEBAR_TOOL_ENABLE_STORE],{'other-tool':false});assert.deepEqual(f.values[TOOL_CLEANUP_STORE],{});
});
test('R26 background rejects both page and host requests while stopped',async()=>{
  const knowledge={...tool,id:KNOWLEDGE_TOOL_ID,capabilities:['knowledge.store','page.capture']},f=fixture(knowledge);
  f.values[SIDEBAR_TOOL_ENABLE_STORE]={[knowledge.id]:false};f.values[CAPTURE_SITE_STORE]={[knowledge.id]:['https://chatgpt.com']};
  f.api.runtime={id:'test',getURL:path=>'chrome-extension://test/'+path,getContexts:async()=>[{contextType:'SIDE_PANEL',documentUrl:'chrome-extension://test/ui/tool.html?hostInstanceId=12345678-1234-4123-8123-123456789abc',frameId:0,documentId:'host'}]};
  const service=createKnowledgeService(f),packageHash=await knowledgePackageHash(knowledge);
  const page={id:'test',tab:{id:1},frameId:0,documentId:'page',url:'https://chatgpt.com/c/test'};
  await assert.rejects(service.dispatch({protocol:KNOWLEDGE_PROTOCOL,toolId:knowledge.id,operation:'capture.save',packageHash,expectedUrl:page.url,payload:{}},page),{code:'E_TOOL_DISABLED'});
  const host={id:'test',url:'chrome-extension://test/ui/tool.html?hostInstanceId=12345678-1234-4123-8123-123456789abc',documentId:'host'};
  await assert.rejects(service.dispatch({protocol:KNOWLEDGE_PROTOCOL,toolId:knowledge.id,operation:'knowledge.list',packageHash,payload:{}},host),{code:'E_TOOL_DISABLED'});
});
test('R26 workspace handoff rejects stopped state and stale generations before import',async()=>{
  const knowledge={...tool,id:KNOWLEDGE_TOOL_ID,capabilities:['knowledge.store']};
  await assert.rejects(validateKnowledgeHandoff({version:1,installEpoch:'old'},{installed:[knowledge],installEpoch:'new'}));
  await assert.rejects(validateKnowledgeHandoff({version:1},{installed:[knowledge],enableRecords:{[knowledge.id]:false}}));
});
test('R26 clip content script rechecks enabled state and generation after extracting content',async()=>{
  const clip={...tool,id:'clip-test',capabilities:['page.clip']},f=fixture(clip),listeners=new Set();
  f.values[CLIP_SITE_STORE]={[clip.id]:['https://example.com']};
  f.api.runtime={id:'test',getURL:path=>'chrome-extension://test/'+path,onMessage:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}};
  const win={location:new URL('https://example.com/article'),addEventListener(){}};win.top=win;
  const controller=initPageClip({api:f.api,doc:{title:'article'},win});
  const message={protocol:'opendesk.page-clip.v1',operation:'clip.link',toolId:clip.id,expectedUrl:win.location.href};
  const sender={id:'test',url:'chrome-extension://test/ui/tool.html?hostInstanceId=12345678-1234-4123-8123-123456789abc'};
  const send=()=>new Promise(resolve=>[...listeners][0](message,sender,resolve));
  try{
    assert.equal((await send()).ok,true);
    const get=f.api.storage.local.get;let reads=0;
    f.api.storage.local.get=async keys=>{if(++reads===2)f.values[SIDEBAR_TOOL_ENABLE_STORE]={[clip.id]:false};return get(keys);};
    assert.equal((await send()).ok,false);
    delete f.values[SIDEBAR_TOOL_ENABLE_STORE];reads=0;
    f.api.storage.local.get=async keys=>{if(++reads===2)f.values[TOOL_REVOCATION_EPOCHS_STORE]={[clip.id]:'new-generation'};return get(keys);};
    assert.equal((await send()).ok,false,'stop/resume cannot bless an old extraction');
  }finally{controller.dispose();}
});
