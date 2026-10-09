import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {createDependencyManager,describeDependencyManifest} from '../../src/scripting/user-scripts/dependency-manager.js';
import {createPageScriptPreview} from '../../src/scripting/user-scripts/preview.js';
import {createPreviewAdmission} from '../../src/platform/host/preview-admission.js';

globalThis.crypto ||= webcrypto;
const urls=['https://first-library.example.org/add.js','https://second-library.example.org/twice.js'];
const libraries=[
  "var dependencyOrder = globalThis.dependencyOrder || []; dependencyOrder.push('first'); var add = (a,b) => a+b; globalThis.$ = 'dependency-only'; // trailing comment",
  "dependencyOrder.push('second'); var twice = x => x*2"
];
const target={tabId:7,frameId:0,documentId:'document-page-1',expectedWindowId:9,expectedUrl:'https://page.example.org/demo'};
const userSource=(body,dependencies=urls)=>'// ==UserScript==\n// @name Live dependency fixture\n'+
  dependencies.map(url=>'// @require '+url).join('\n')+'\n// ==/UserScript==\n'+body;
const main=number=>`async function main(){ document.userRuns++; return {value:twice(add(${number},1)),order:dependencyOrder}; }`;
const errorCode=code=>error=>error.code===code;

// These are component integration tests. VM contexts retain global lexical
// bindings across execute calls and separate named USER_SCRIPT/default/MAIN
// worlds; they are not Chrome, permission UI, or native isolation receipts.
function fixture({occupiedWorlds=0,silentNativeExceptions=false}={}) {
  const host={tag:'host',active:true,namespace:'tool:flow',registrationId:'host-1',hostDocumentId:'tool-document-1',
    hostInstanceId:'tool-instance-1',browserSessionIncarnation:'browser-session-1',hostUrl:'chrome-extension://flow/ui/tool.html'};
  let database=new Map([['frameworkKV',new Map()],['runs',new Map()],['commandJournal',new Map([['host:host-1',host]])]]),queue=Promise.resolve();
  const storage={transaction(stores,mode,work){
    const result=queue.then(async()=>{
      const draft=structuredClone(database),table=name=>{assert.ok(stores.includes(name));return draft.get(name);};
      const tx={get:async(name,key)=>structuredClone(table(name).get(key)),all:async name=>[...table(name).values()].map(row=>structuredClone(row)),
        put:async(name,value,key)=>{assert.equal(mode,'readwrite');table(name).set(key,structuredClone(value));}};
      const answer=await work(tx);if(mode==='readwrite')database=draft;return answer;
    });queue=result.catch(()=>{});return result;
  }};
  const f={fetchCalls:[],nativeCalls:[],configured:[],offline:false,downloadPermission:true,
    document:{title:'Fixture page',userRuns:0,classicRuns:0,impersonated:0,secondRan:0},routes:new Map(urls.map((url,i)=>[url,libraries[i]]))};
  const websiteDollar={owner:'website'};
  const mainWorld=vm.createContext({document:f.document,$:websiteDollar,jQuery:websiteDollar});
  const contexts=new Map(),activeWorlds=new Set(Array.from({length:occupiedWorlds},(_,i)=>'preexisting-'+i)),session={};
  const configurations=new Map([['opendesk-preview-d1-previous-session',{worldId:'opendesk-preview-d1-previous-session'}],
    ['controller-owned',{worldId:'controller-owned',messaging:true}]]);
  function contextFor(request) {
    if(request.world==='MAIN')return mainWorld;
    assert.equal(request.world,'USER_SCRIPT');let world=request.worldId || '@default';
    if(!activeWorlds.has(world)) {
      if(activeWorlds.size>=10)world='@default';
      activeWorlds.add(world);
    }
    const key=target.documentId+':'+world;
    if(!contexts.has(key))contexts.set(key,vm.createContext({document:f.document,console}));
    return contexts.get(key);
  }
  const api={runtime:{id:'flow',getURL:path=>'chrome-extension://flow/'+path},
    permissions:{contains:async({origins})=>origins.every(origin=>origin==='https://page.example.org/*'||f.downloadPermission)},
    tabs:{get:async()=>({id:7,windowId:9,active:true,incognito:false,status:'complete',url:target.expectedUrl}),query:async()=>[{id:7,active:true}]},
    webNavigation:{getAllFrames:async()=>[{frameId:0,documentId:target.documentId,url:target.expectedUrl,documentLifecycle:'active'}]},
    storage:{session:{get:async key=>({[key]:structuredClone(session[key])}),set:async data=>Object.assign(session,structuredClone(data))}},
    userScripts:{getScripts:async()=>[],getWorldConfigurations:async()=>[...configurations.values()].map(row=>structuredClone(row)),
      configureWorld:async options=>{f.configured.push(structuredClone(options));configurations.set(options.worldId,structuredClone(options));},
      resetWorldConfiguration:async worldId=>{configurations.delete(worldId);},execute:async request=>{
        f.nativeCalls.push(structuredClone(request));
        assert.deepEqual(request.target,{tabId:7,documentIds:[target.documentId]});
        const context=contextFor(request);let result,error;
        // Intentionally keep evaluating subsequent ScriptSource entries after
        // an error: the compiler must not depend on undocumented cross-source
        // fail-stop behavior. A single compilation unit has real JS fail-stop.
        for(const script of request.js){
          try { result=await new vm.Script(script.code).runInContext(context,{timeout:1000}); }
          catch(failure){error ||= failure.message;}
        }
        return [{frameId:0,documentId:target.documentId,...(error?(silentNativeExceptions?{}:{error}):
          {result:result===undefined?undefined:JSON.parse(JSON.stringify(result))})}];
      }}
  };
  const assertHost=async()=>structuredClone(host);
  const fetchImpl=async(url,options)=>{
    f.fetchCalls.push({url,options});if(f.offline)throw new TypeError('offline');
    const code=f.routes.get(url);if(code===undefined)throw new TypeError('missing fixture library');
    const response=new Response(code,{headers:{'content-type':'text/javascript;charset=utf-8'}});
    Object.defineProperty(response,'url',{value:url});return response;
  };
  f.restartManager=()=>{
    f.dependencies=createDependencyManager({api,storage,assertHost,fetchImpl});
    const admission=createPreviewAdmission({storage,assertHost,currentHost:async()=>{}});
    f.preview=createPageScriptPreview({api,storage,assertHost,dependencies:f.dependencies,admission});
  };
  f.restartManager();
  f.lock=async(sourceUtf8,entryFormat='async-main')=>{
    const review=await f.dependencies.prepare({sourceUtf8,entryFormat,explicitUserAction:true},{});
    return f.dependencies.approve({reviewId:review.reviewId,explicitUserAction:true,acceptedHashes:review.entries.map(e=>e.sha256)},{});
  };
  f.run=(sourceUtf8,lock,entryFormat='async-main')=>f.preview.preview({sourceUtf8,entryFormat,lockId:lock?.lockId,target},{});
  f.assertMainUnchanged=()=>{
    assert.strictEqual(vm.runInContext('$',mainWorld),websiteDollar);assert.strictEqual(vm.runInContext('jQuery',mainWorld),websiteDollar);
    assert.equal(vm.runInContext('typeof dependencyOrder',mainWorld),'undefined');
  };
  f.defaultHas=expression=>vm.runInContext(expression,contextFor({world:'USER_SCRIPT'}));
  f.configurations=configurations;
  f.api=api;f.session=session;
  return f;
}

test('real manager → approval → preview executes two ordered sources, reuses draft locks offline, and rechecks new GM grants',async()=>{
  const f=fixture(),source=userSource(main(20));
  await assert.rejects(f.run(source),errorCode('E_DEPENDENCY_UNLOCKED'));
  assert.equal(f.nativeCalls.length,0);assert.equal(f.document.userRuns,0);
  const lock=await f.lock(source);
  assert.equal((await describeDependencyManifest({sourceUtf8:source,entryFormat:'async-main'})).manifestDigest,lock.manifestDigest);
  const result=await f.run(source,lock);
  assert.deepEqual(JSON.parse(result.resultText),{value:42,order:['first','second']});
  assert.equal(result.durable,false);assert.equal(result.registered,false);assert.equal(result.dependencies.length,2);
  assert.equal(f.nativeCalls.at(-1).js.length,1,'dependencies and consumer share one JS compilation unit');
  assert.deepEqual(f.fetchCalls.map(c=>c.url),urls);f.assertMainUnchanged();
  const calls=f.fetchCalls.length;f.offline=true;f.downloadPermission=false;
  const changed=userSource(main(49)),again=await f.run(changed,lock);
  assert.equal(JSON.parse(again.resultText).value,100);assert.notEqual(again.worldId,result.worldId);
  f.restartManager();const reopened=await f.run(changed,lock);
  assert.equal(JSON.parse(reopened.resultText).value,100);assert.equal(f.fetchCalls.length,calls);assert.equal(f.document.userRuns,3);
  const nativeBefore=f.nativeCalls.length;
  await assert.rejects(f.run(changed.replace('// ==/UserScript==','// @grant GM_xmlhttpRequest\n// ==/UserScript=='),lock),errorCode('E_GRANT_UNSUPPORTED'));
  assert.equal(f.nativeCalls.length,nativeBefore);f.assertMainUnchanged();
  assert.ok(f.configured.every(row=>row.messaging===false&&row.csp==="script-src 'self'; object-src 'none'"));
  assert.ok(f.configurations.has('controller-owned'),'preview reconciliation never touches another consumer');
  assert.equal([...f.configurations.keys()].filter(key=>key.startsWith('opendesk-preview-d1-')).length,1,
    'orphan and previous preview configurations are reconciled even after service restart');
});

test('classic top-level const runs repeatedly in fresh worlds; trailing comments and ASI do not consume the next source',async()=>{
  const f=fixture(),source=userSource('(()=>{document.classicRuns++; document.classicValue=twice(add(2,3));})()\nconst userConstant=7;');
  const lock=await f.lock(source,'classic-userscript');
  const first=await f.run(source,lock,'classic-userscript'),second=await f.run(source,lock,'classic-userscript');
  assert.equal(f.document.classicRuns,2);assert.equal(f.document.classicValue,10);assert.notEqual(first.worldId,second.worldId);
  assert.equal(f.fetchCalls.length,2);f.assertMainUnchanged();
});

test('a synchronous dependency failure prevents later libraries and the consumer from executing',async()=>{
  for(const silentNativeExceptions of [false,true]) {
    const f=fixture({silentNativeExceptions});f.routes.set(urls[0],"throw new Error('first dependency rejected'); // trailing comment");
    f.routes.set(urls[1],'document.secondRan++;');
    const source=userSource('async function main(){document.userRuns++;return true;}'),lock=await f.lock(source);
    await assert.rejects(f.run(source,lock),error=>error.code==='E_EFFECT_UNKNOWN'&&
      (silentNativeExceptions?error.message.includes('完成回执'):error.message.includes('first dependency rejected')));
    assert.equal(f.document.secondRan,0);assert.equal(f.document.userRuns,0);assert.equal(f.nativeCalls.at(-1).js.length,1);
  }
});

test('an absent user main cannot fall back to a dependency global main or an async-main-looking comment',async()=>{
  const f=fixture();f.routes.set(urls[0],'function main(){document.impersonated++;return 99;}');
  const source=userSource('// async function main() is only text in this comment\nconst example=1;',[urls[0]]),lock=await f.lock(source);
  await assert.rejects(f.run(source,lock),error=>error.code==='E_PAGE_SCRIPT_EXECUTION'&&error.message.includes('E_MAIN_REQUIRED'));
  assert.equal(f.document.impersonated,0);assert.equal(f.document.userRuns,0);
});

test('simulated Chromium named-world exhaustion falls back to default, fails the isolation probe, and injects no user code',async()=>{
  const f=fixture({occupiedWorlds:9}),source=userSource(main(20)),lock=await f.lock(source);
  await assert.rejects(f.run(source,lock),errorCode('E_WORLD_ISOLATION'));
  assert.equal(f.nativeCalls.length,3,'only trusted bounded probes reached the default world');
  assert.ok(f.nativeCalls.every(request=>request.js.every(script=>!script.code.includes('// ==UserScript=='))));
  assert.equal(f.document.userRuns,0);assert.equal(f.defaultHas('typeof add'),'undefined');
  assert.equal(f.defaultHas('typeof dependencyOrder'),'undefined');f.assertMainUnchanged();
});

test('document budget survives service restart and navigation cleanup; closing a tab releases the ledger even when the API is disabled',async()=>{
  const f=fixture(),source=userSource(main(1)),lock=await f.lock(source);
  for(let n=0;n<6;n++)await f.run(source,lock);
  assert.equal(f.document.userRuns,6);
  await f.preview.cleanupWorlds({tabId:7,documentId:'new-document'});
  f.restartManager();
  const calls=f.nativeCalls.length;
  await assert.rejects(f.run(source,lock),errorCode('E_PREVIEW_WORLD_LIMIT'));
  assert.equal(f.nativeCalls.length,calls,'BFCache or a restarted service cannot refund a document budget');
  delete f.api.userScripts;
  await f.preview.cleanupWorlds({tabId:7,removed:true});
  assert.deepEqual(f.session.opendeskPagePreviewWorldsD1,[]);
});
