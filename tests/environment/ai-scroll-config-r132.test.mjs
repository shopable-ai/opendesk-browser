import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScrollConfig,scrollConfigForUrl,scrollPathMatches,
  SCROLL_CONFIG_EMPTY,SCROLL_CONFIG_PROGRAM_ID} from '../../src/scripting/user-scripts/scroll-config-contract.js';
import {applicableRule} from '../../projects/ai-scroll-navigation/src/site-configuration.js';
import {pageInstallScope,pageInstallScopeDelta} from '../../src/scripting/user-scripts/page-install-authorization.js';

const sample={origin:'https://chatgpt.com',pathScope:'/c',
  mainSelector:'main',scrollSelector:'#thread',messageSelector:'article',
  anchorSelector:'',enabled:true};
const scope={matches:['https://chatgpt.com/*'],excludeMatches:[],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
const check=fn=>assert.throws(fn,err=>err?.code==='E_CONFIG_SCHEMA');

test('R132 site configuration normalizes typed inert selectors and exact HTTP(S) origins',()=>{
  assert.deepEqual(normalizeScrollConfig({version:1,sites:[sample]}),{version:1,sites:[sample]});
  check(()=>normalizeScrollConfig({version:2,sites:[]}));
  check(()=>normalizeScrollConfig({version:1,sites:[{...sample,origin:'https://evil.test/a'}]}));
  check(()=>normalizeScrollConfig({version:1,sites:[{...sample,origin:'javascript:alert(1)'}]}));
  check(()=>normalizeScrollConfig({version:1,sites:[{...sample,pathScope:'//admin'}]}));
  check(()=>normalizeScrollConfig({version:1,sites:[{...sample,pathScope:'/x/../admin'}]}));
  check(()=>normalizeScrollConfig({version:1,sites:[{...sample,mainSelector:'div{color:red}'}]}));
  check(()=>normalizeScrollConfig({version:1,sites:[sample,sample]}));
  check(()=>normalizeScrollConfig({version:1,sites:[{...sample,untrustedScript:'alert(1)'}]}));
  assert.deepEqual(SCROLL_CONFIG_EMPTY,{version:1,sites:[]});
});
test('R132 path scopes stop at segment boundaries and support longest explicit rule',()=>{
  assert.equal(scrollPathMatches('/c','/c'),true);
  assert.equal(scrollPathMatches('/c','/c/123'),true);
  assert.equal(scrollPathMatches('/c','/crossover'),false);
  assert.equal(scrollPathMatches('/','/anything'),true);
  const second={...sample,pathScope:'/c/123',mainSelector:'#specific'};
  const config={version:1,sites:[sample,second]};
  assert.equal(scrollConfigForUrl(config,'https://chatgpt.com/c/123').mainSelector,'#specific');
  assert.equal(applicableRule(config,'https://chatgpt.com/c/123').mainSelector,'#specific');
  assert.equal(scrollConfigForUrl(config,'https://evil.test/c/123'),null);
  assert.equal(scrollConfigForUrl(config,'https://chatgpt.com/crossover'),null);
  assert.equal(applicableRule(config,'https://chatgpt.com/crossover'),null);
});
test('R132 config capability is only for scoped Program revision, and upgrade needs approval',()=>{
  assert.equal(SCROLL_CONFIG_PROGRAM_ID,'opendesk.ai-scroll-navigation');
  const oldScope=pageInstallScope(scope,SCROLL_CONFIG_PROGRAM_ID,2);
  const newScope=pageInstallScope(scope,SCROLL_CONFIG_PROGRAM_ID,3);
  assert.deepEqual(oldScope.capabilities,['page.dom']);
  assert.deepEqual(newScope.capabilities,['page.dom','page.config']);
  assert.equal(pageInstallScope(scope,'other-program',99).capabilities.includes('page.config'),false);
  assert.equal(pageInstallScopeDelta(oldScope,newScope).requiresConfirmation,true);
  assert.deepEqual(pageInstallScopeDelta(oldScope,newScope).addedCapabilities,['page.config']);
  assert.equal(pageInstallScopeDelta(newScope,newScope).requiresConfirmation,false);
});

test('navigation is optional in v1 and explicit booleans normalize without changing legacy payloads',()=>{
  const legacy={version:1,sites:[sample]};
  assert.deepEqual(normalizeScrollConfig(legacy),legacy);
  const navigation={regionTop:true,regionBottom:true,conversationTop:true,conversationBottom:true,floatingTop:true,turnPaging:true};
  assert.deepEqual(normalizeScrollConfig({...legacy,navigation:{regionTop:false}}),
    {...legacy,navigation:{...navigation,regionTop:false}});
  const disabled=Object.fromEntries(Object.keys(navigation).map(key=>[key,false]));
  assert.deepEqual(normalizeScrollConfig({...legacy,navigation:disabled}),{...legacy,navigation:disabled});
  for(const invalid of [null,[],true,{regionTop:0},{floatingTop:'false'},{unknown:true}])
    check(()=>normalizeScrollConfig({...legacy,navigation:invalid}));
  check(()=>normalizeScrollConfig({...legacy,unknown:true}));
});

import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createDependencyManager} from '../../src/scripting/user-scripts/dependency-manager.js';
import {createInstalledPagePrograms} from '../../src/scripting/user-scripts/installed-programs.js';
import {canonical} from '../../src/platform/protocol.js';
import {fakeBuiltinSource} from './builtin-support.mjs';
globalThis.crypto ||= webcrypto;

// Uses the production candidate/verification/installation path with transactional
// and Chrome API doubles, matching page-installed-programs.test.mjs. The editor
// call itself executes in a VM; this is component evidence, not Chrome evidence.
async function observationFixture(){
  const tables=new Map(['frameworkKV','commandJournal'].map(name=>[name,new Map()]));
  const host={tag:'host',namespace:'tool:test',registrationId:'host',hostDocumentId:'host-document',
    hostInstanceId:'host-instance',browserSessionIncarnation:'session',
    hostUrl:'chrome-extension://test/sidepanel.html',active:true,revoked:false};
  tables.get('commandJournal').set('host:host',structuredClone(host));
  let queue=Promise.resolve();
  const storage={transaction(stores,mode,work){
    const next=queue.then(async()=>{
      const copy=structuredClone(tables),table=name=>{assert.ok(stores.includes(name));return copy.get(name);};
      const tx={get:async(name,key)=>structuredClone(table(name).get(key)),
        all:async name=>structuredClone([...table(name).values()]),
        put:async(name,value,key)=>{assert.equal(mode,'readwrite');table(name).set(key,structuredClone(value));},
        delete:async(name,key)=>{assert.equal(mode,'readwrite');table(name).delete(key);}};
      const result=await work(tx);
      if(mode==='readwrite')for(const [name,rows] of copy)tables.set(name,rows);
      return result;
    });queue=next.catch(()=>{});return next;
  }};
  const target={tabId:1,frameId:0,documentId:'current-document',
    expectedUrl:'https://example.com/thread',expectedWindowId:2};
  const sender={id:'test',documentId:'host-document'},native=new Map();
  const f={granted:true,lifecycle:'active',documentId:target.documentId,active:true,
    calls:[],observations:0,result:{state:'observed',candidates:[{id:'candidate-1',
      mainSelector:'main',scrollSelector:'html',messageSelector:'article',anchorSelector:'',
      metrics:{messageCount:2,scrollable:true}}]}};
  const assertHost=async received=>{assert.equal(received,sender);return host;};
  const api={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path},
    permissions:{contains:async()=>f.granted},
    tabs:{get:async()=>({id:1,windowId:2,active:f.active,incognito:false,url:target.expectedUrl}),
      query:async()=>f.active?[{id:1}]:[{id:9}]},
    webNavigation:{getAllFrames:async()=>[{frameId:0,documentId:f.documentId,
      url:target.expectedUrl,documentLifecycle:f.lifecycle}]},
    userScripts:{getScripts:async filter=>[...native.values()].filter(row=>!filter||filter.ids.includes(row.id)),
      configureWorld:async()=>{},register:async scripts=>scripts.forEach(row=>native.set(row.id,structuredClone(row))),
      unregister:async({ids})=>ids.forEach(id=>native.delete(id)),
      execute:async input=>{
        f.calls.push(input);
        const context=vm.createContext(f.missingEditor?{}:{__opendeskAiScrollEditorV1:{observe(payload){
          assert.deepEqual(Object.keys(payload),[]);f.observations++;return f.result;
        }}});
        const result=await vm.runInContext(input.js[0].code,context);
        await f.afterExecute?.();
        return [{frameId:0,documentId:target.documentId,result,
          ...f.responseEnvelope}];
      }}};
  const dependencies=createDependencyManager({api,storage,assertHost,loadBuiltin:async()=>fakeBuiltinSource});
  let candidate;
  const service=createInstalledPagePrograms({api,storage,assertHost,dependencies,session:'session',
    loadBuiltin:async()=>fakeBuiltinSource,preview:{preview:async input=>({state:'preview-evaluated',world:'USER_SCRIPT',
      sourceHash:[...tables.get('frameworkKV').values()].find(row=>row.tag==='page-candidate-v1'&&
        row.sourceUtf8===input.sourceUtf8).manifest.sourceHash,documentId:target.documentId,builtinAbi:fakeBuiltinSource.abi,
      builtinCatalogSha256:fakeBuiltinSource.catalogSha256,builtinBundleSha256:fakeBuiltinSource.sha256})}});
  candidate=await dependencies.importPageCandidate({programId:SCROLL_CONFIG_PROGRAM_ID,revision:3,
    entryFormat:'async-main',lockId:null,importSourceUrl:null,
    sourceUtf8:'// ==UserScript==\n// @match https://example.com/*\n// @noframes\n// @run-at document-idle\n// ==/UserScript==\nasync function main(){return 1;}'},sender);
  await service.verifyPageCandidate({programId:SCROLL_CONFIG_PROGRAM_ID,revision:3,target},sender);
  await service.makePageAvailable({programId:SCROLL_CONFIG_PROGRAM_ID,revision:3,manifestHash:candidate.manifestHash},sender);
  const installed=await service.installPageProgram({programId:SCROLL_CONFIG_PROGRAM_ID,revision:3,
    manifestHash:candidate.manifestHash,expectedInstalledManifestHash:null},sender);
  const installKey='page-installed:'+canonical(['tool:test',SCROLL_CONFIG_PROGRAM_ID]);
  const row=tables.get('frameworkKV').get(installKey);
  row.lastExecution={managedUI:{worldId:'other-tab-world'}};
  const execution={tag:'page-execution-v1',namespace:'tool:test',programId:SCROLL_CONFIG_PROGRAM_ID,
    executionKey:'exact-execution',manifestHash:installed.manifestHash,
    installationId:installed.authorization.installationId,grantGeneration:installed.authorization.generation,
    tabId:1,documentId:target.documentId,browserSessionIncarnation:'session',
    state:'completed',managedUI:{worldId:'exact-document-world'}};
  tables.get('frameworkKV').set(execution.executionKey,execution);
  const request={programId:SCROLL_CONFIG_PROGRAM_ID,manifestHash:installed.manifestHash,
    installationId:installed.authorization.installationId,expectedGeneration:installed.authorization.generation,target};
  return Object.assign(f,{service,api,native,tables,row,execution,request,sender,
    observe:()=>service.observeScrollSitePage(request,sender)});
}

test('observation executes only the installed exact document USER_SCRIPT world and returns fresh bounded data',async()=>{
  const f=await observationFixture(),result=await f.observe();
  assert.deepEqual(result,f.result);assert.notEqual(result,f.result);
  assert.notEqual(result.candidates[0],f.result.candidates[0]);
  assert.equal(f.observations,1);assert.equal(f.calls.length,1);
  assert.deepEqual(f.calls[0].target,{tabId:1,documentIds:['current-document']});
  assert.equal(f.calls[0].world,'USER_SCRIPT');assert.equal(f.calls[0].worldId,'exact-document-world');
  assert.match(f.calls[0].js[0].code,/editor\.observe\(\{\}\)/);
  assert.equal([...f.tables.get('frameworkKV').values()].some(row=>row.tag==='page-config-v1'),false);
});

for(const reason of ['NO_STRUCTURE','BUSY','DISPOSED'])test('observation accepts only fixed unavailable reason '+reason,async()=>{
  const f=await observationFixture();f.result={state:'unavailable',reason};
  assert.deepEqual(await f.observe(),f.result);
});
for(const state of ['busy','closed'])test('observation rejects Page editor '+state,async()=>{
  const f=await observationFixture();f.result={state};
  await assert.rejects(f.observe(),{code:'E_CONFIG_DOM'});
});
test('missing editor returns a fixed bounded unavailable result',async()=>{
  const f=await observationFixture();f.missingEditor=true;
  // Chrome transfers plain serialized results across worlds.
  const execute=f.api.userScripts.execute;
  f.api.userScripts.execute=async input=>JSON.parse(JSON.stringify(await execute(input)));
  assert.deepEqual(await f.observe(),{state:'unavailable',reason:'DISPOSED'});
});

const corruptObservations={
  'text leak':v=>({...v,text:'private'}),
  'HTML leak':v=>({...v,html:'<article>private</article>'}),
  'title leak':v=>({...v,title:'private'}),
  'URL leak':v=>({...v,url:'https://example.com/private'}),
  'input value leak':v=>({...v,value:'private'}),
  'candidate leak':v=>{v.candidates[0].text='private';return v;},
  'metric leak':v=>{v.candidates[0].metrics.title='private';return v;},
  'unknown reason':()=>({state:'unavailable',reason:'private page text'}),
  'unavailable leak':()=>({state:'unavailable',reason:'NO_STRUCTURE',text:'private'}),
  'custom prototype':v=>Object.assign(Object.create({text:'private'}),v),
  'candidate prototype':v=>{Object.setPrototypeOf(v.candidates[0],{text:'private'});return v;},
  'metric prototype':v=>{Object.setPrototypeOf(v.candidates[0].metrics,{text:'private'});return v;},
  'hidden field':v=>Object.defineProperty(v,'text',{value:'private'}),
  'symbol field':v=>({...v,[Symbol('private')]:'private'}),
  'accessor':v=>Object.defineProperty(v,'state',{enumerable:true,get(){assert.fail('must not read getter');}}),
  'array field':v=>{v.candidates.text='private';return v;},
  'array prototype':v=>{Object.setPrototypeOf(v.candidates,Object.create(Array.prototype));return v;},
  'array hole':v=>{v.candidates.length=2;return v;},
  'empty candidates':v=>({...v,candidates:[]}),
  'over eight':v=>({...v,candidates:Array.from({length:9},(_,i)=>({...v.candidates[0],id:'candidate-'+(i+1)}))}),
  'duplicate ID':v=>({...v,candidates:[v.candidates[0],v.candidates[0]]}),
  'unbounded ID':v=>{v.candidates[0].id='candidate-999';return v;},
  'nonempty anchor':v=>{v.candidates[0].anchorSelector='a';return v;},
  'empty main':v=>{v.candidates[0].mainSelector='';return v;},
  'empty messages':v=>{v.candidates[0].messageSelector='';return v;},
  'invalid CSS':v=>{v.candidates[0].mainSelector='main; body';return v;},
  'overlong CSS':v=>{v.candidates[0].scrollSelector='x'.repeat(257);return v;},
  'zero count':v=>{v.candidates[0].metrics.messageCount=0;return v;},
  'over count':v=>{v.candidates[0].metrics.messageCount=2001;return v;},
  'fraction count':v=>{v.candidates[0].metrics.messageCount=1.5;return v;},
  'nonboolean scrollable':v=>{v.candidates[0].metrics.scrollable=1;return v;}
};
for(const [name,corrupt] of Object.entries(corruptObservations))test('observation fails closed on '+name,async()=>{
  const f=await observationFixture();f.result=corrupt(f.result);
  await assert.rejects(f.observe(),{code:'E_CONFIG_SCHEMA'});
  assert.equal(f.calls.length,1);
});
test('observation accepts exact upper bounds without truncation',async()=>{
  const f=await observationFixture(),candidate=f.result.candidates[0];
  f.result.candidates=Array.from({length:8},(_,i)=>({...candidate,id:'candidate-'+(i+1),
    mainSelector:'x'.repeat(256),metrics:{messageCount:2000,scrollable:false}}));
  assert.deepEqual(await f.observe(),f.result);
});

for(const phase of ['before','after'])for(const loss of ['document','cached','active tab','permission','installation','world','host','native registration'])
  test('observation rejects '+loss+' change '+phase+' dispatch',async()=>{
    const f=await observationFixture();
    const change=()=>{
      if(loss==='document')f.documentId='replacement-document';
      if(loss==='cached')f.lifecycle='cached';
      if(loss==='active tab')f.active=false;
      if(loss==='permission')f.granted=false;
      if(loss==='installation')f.row.authorization.generation++;
      if(loss==='world')f.execution.managedUI.worldId=phase==='before'?undefined:'replaced-world';
      if(loss==='host')f.tables.get('commandJournal').get('host:host').revoked=true;
      if(loss==='native registration')f.native.clear();
    };
    if(phase==='before')change();else f.afterExecute=change;
    await assert.rejects(f.observe(),error=>['E_DOCUMENT_STALE','E_PERMISSION','E_REVISION',
      'E_PAGE_AUTHORIZATION','E_SCROLL_PAGE_NOT_READY','E_OWNER'].includes(error.code));
    assert.equal(f.calls.length,phase==='before'?0:1);
  });
for(const envelope of [{documentId:'wrong'},{frameId:1},{error:'private browser error'}])
  test('observation rejects a mismatched or failed native response '+JSON.stringify(envelope),async()=>{
    const f=await observationFixture();f.responseEnvelope=envelope;
    await assert.rejects(f.observe(),{code:'E_SCROLL_PAGE_NOT_READY'});
  });
for(const field of ['code','selector','mainSelector','operation'])test('observation rejects caller-supplied '+field+' before dispatch',async()=>{
  const f=await observationFixture();f.request[field]='untrusted';
  await assert.rejects(f.observe(),{code:'E_CONFIG_SCHEMA'});assert.equal(f.calls.length,0);
});
for(const location of ['request','target'])test('observation rejects a custom '+location+' prototype before dispatch',async()=>{
  const f=await observationFixture();
  Object.setPrototypeOf(location==='request'?f.request:f.request.target,{code:'untrusted'});
  await assert.rejects(f.observe(),{code:'E_CONFIG_SCHEMA'});assert.equal(f.calls.length,0);
});
test('observation rejects unknown target fields before dispatch',async()=>{
  const f=await observationFixture();f.request.target.selector='main';
  await assert.rejects(f.observe(),{code:'E_CONFIG_SCHEMA'});assert.equal(f.calls.length,0);
});
