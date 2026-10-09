import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createDependencyManager} from '../../src/scripting/user-scripts/dependency-manager.js';
import {hashPageProgramManifest,validatePageProgramManifest,verifyPageProgramSource} from '../../src/scripting/user-scripts/page-program-contract.js';
import {invariant} from '../../src/platform/protocol.js';
globalThis.crypto ||= webcrypto;
const source=['// ==UserScript==','// @name Candidate fixture','// @match https://example.com/*',
  '// @run-at document-idle','// @noframes','// ==/UserScript==',
  'globalThis.__pageCandidateNotExecuted=true;'].join('\n');
const request={programId:'page-fixture',revision:1,sourceUtf8:source,entryFormat:'classic-userscript',
  importSourceUrl:null,lockId:null};
const fails=(fn,code)=>assert.rejects(fn,e=>e.code===code,'Expected '+code);
function setup(){
  let data=new Map([['frameworkKV',new Map()],['commandJournal',new Map()]]);
  const hosts={
    a:{tag:'host',registrationId:'host-a',hostDocumentId:'doc-a',hostInstanceId:'instance-a',
      browserSessionIncarnation:'session',hostUrl:'chrome-extension://test/ui/tool.html',
      namespace:'tool:one',active:true,revoked:false},
    b:{tag:'host',registrationId:'host-b',hostDocumentId:'doc-b',hostInstanceId:'instance-b',
      browserSessionIncarnation:'session',hostUrl:'chrome-extension://test/ui/tool.html',
      namespace:'tool:two',active:true,revoked:false}
  };
  Object.values(hosts).forEach(h=>data.get('commandJournal').set('host:'+h.registrationId,structuredClone(h)));
  const storage={queue:Promise.resolve(),async transaction(stores,mode,work) {
    let release;const previous=this.queue;this.queue=new Promise(r=>release=r);
    await previous;
    const snapshot=structuredClone(data);
    const table=name=>{assert.ok(stores.includes(name));return snapshot.get(name);};
    const tx={get:async(name,key)=>structuredClone(table(name).get(key)),
      put:async(name,value,key)=>{assert.equal(mode,'readwrite');table(name).set(key,structuredClone(value));},
      all:async name=>[...table(name).values()].map(structuredClone)};
    try{const result=await work(tx);if(mode==='readwrite')data=snapshot;return result;}finally{release();}
  }};
  let gate;
  async function assertHost(sender) {
    if(gate) await gate;
    const host=hosts[sender?.key];
    invariant(host && sender.documentId===host.hostDocumentId,'E_OWNER');
    return structuredClone(host);
  }
  const manager=createDependencyManager({storage,assertHost,clock:{now:()=>1760000000000},
    api:{permissions:{contains:async()=>true}},fetchImpl:async()=>{throw Error('no network')}});
  const a={key:'a',documentId:'doc-a'},b={key:'b',documentId:'doc-b'};
  return {manager,a,b,rows:()=>data.get('frameworkKV'),hosts:()=>data.get('commandJournal'),
    setGate:promise=>{gate=promise;}};
}
test('E07.1 Candidate is stored without execution or installation and matches Page v1 contract',async()=>{
  const f=setup(),c=await f.manager.importPageCandidate(request,f.a);
  assert.match(c.candidateId,/^page-[a-f0-9]{64}$/);assert.equal(c.stage,'Candidate');
  const actual=await f.manager.getPageCandidate({programId:request.programId,revision:1},f.a);
  assert.equal(actual.sourceUtf8,source);
  assert.deepEqual(validatePageProgramManifest(actual.manifest),actual.manifest);
  assert.equal(actual.manifestHash,await hashPageProgramManifest(actual.manifest));
  const resolution=await f.manager.loadForExecution({sourceUtf8:source,
    entryFormat:request.entryFormat,importSourceUrl:null,lockId:null},f.a);
  await verifyPageProgramSource({manifest:actual.manifest,sourceUtf8:source,dependencyResolution:resolution});
  assert.equal([...f.rows().values()][0].verification,null);
  assert.equal(globalThis.__pageCandidateNotExecuted,undefined);
});
test('concurrent identical import is idempotent; same revision with changed bytes cannot overwrite',async()=>{
  const f=setup(),[a,b]=await Promise.all([f.manager.importPageCandidate(request,f.a),
    f.manager.importPageCandidate(request,f.a)]);
  assert.equal(a.candidateId,b.candidateId);
  assert.equal(f.rows().size,1);
  await fails(()=>f.manager.importPageCandidate({...request,sourceUtf8:source+'//changed'},f.a),'E_REQUEST_CONFLICT');
  const next=await f.manager.importPageCandidate({...request,revision:2},f.a);
  assert.notEqual(next.candidateId,a.candidateId);assert.equal(f.rows().size,2);
});
test('Caller stage, namespace, verification, direct resolution and fabricated grant are rejected',async()=>{
  const f=setup();
  for(const key of ['stage','namespace','verification','authority','dependencyResolution','installed']){
    await fails(()=>f.manager.importPageCandidate({...request,[key]:{}},f.a),'E_SCHEMA');
  }
  await fails(()=>f.manager.importPageCandidate({...request,sourceUtf8:' '.repeat(65537)},f.a),'E_LIMIT');
  assert.equal(f.rows().size,0);
});
test('Host namespaces are isolated; one cannot read another owner',async()=>{
  const f=setup(),a=await f.manager.importPageCandidate(request,f.a);
  await fails(()=>f.manager.getPageCandidate({programId:request.programId,revision:1},f.b),'E_PAGE_CANDIDATE');
  const b=await f.manager.importPageCandidate(request,f.b);
  assert.notEqual(a.candidateId,b.candidateId);
});
test('tampering candidate source/hash or falsely marking it Available is detected',async()=>{
  for(const variant of ['source','hash','stage','verification']){
    const f=setup();await f.manager.importPageCandidate(request,f.a);
    const row=[...f.rows().values()][0];
    if(variant==='source')row.sourceUtf8+='//changed';
    else if(variant==='hash')row.manifestHash='0'.repeat(64);
    else if(variant==='stage')row.stage='Available';
    else row.verification={ok:true};
    await fails(()=>f.manager.getPageCandidate({programId:request.programId,revision:1},f.a),
      variant==='source'||variant==='hash'?'E_HASH':'E_PAGE_CANDIDATE');
  }
});
test('Host revoked while hashing or before store commit cannot persist candidate',async()=>{
  const f=setup();let release;
  const gate=new Promise(r=>release=r);f.setGate(gate);
  const pending=f.manager.importPageCandidate(request,f.a);
  await new Promise(resolve=>setImmediate(resolve));
  f.hosts().get('host:host-a').active=false;
  release();
  await fails(()=>pending,'E_OWNER');
  assert.equal(f.rows().size,0);
});
test('grant, unsupported metadata and missing pinned dependency are not importable',async()=>{
  const f=setup();
  await fails(()=>f.manager.importPageCandidate({...request,lockId:'dep-lock-'+'0'.repeat(64)},f.a),'E_DEPENDENCY_UNLOCKED');
  await fails(()=>f.manager.importPageCandidate({...request,sourceUtf8:source.replace('// @noframes','// @grant GM_xmlhttpRequest')},f.a),'E_GRANT_UNSUPPORTED');
  await fails(()=>f.manager.importPageCandidate({...request,sourceUtf8:'console.log(1)'},f.a),'E_PAGE_MATCH');
  assert.equal(f.rows().size,0);
});
test('Broker Candidate routes use original dependency manager behind Host authentication',()=>{
  const code=readFileSync(new URL('../../src/platform/host/broker.js',import.meta.url),'utf8');
  assert.match(code,/importPageCandidate:\(p,s\)=>pageDependencies\.importPageCandidate\(p,s\)/);
  assert.match(code,/getPageCandidate:\(p,s\)=>pageDependencies\.getPageCandidate\(p,s\)/);
  assert.match(code,/if \(message\.type !== 'registerHost'\) await authenticate\(message,sender\)/);
  assert.doesNotMatch(code,/makePageAvailable:/);
});
