import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createPageCandidateMethods} from '../../src/platform/tasks/page-program-service.js';
import {describeDependencyManifest} from '../../src/scripting/user-scripts/dependency-manager.js';
import {invariant} from '../../src/platform/protocol.js';

globalThis.crypto ||= webcrypto;
const source = ['// ==UserScript==','// @name Candidate fixture',
  '// @match https://example.com/*','// @run-at document-idle','// @noframes',
  '// ==/UserScript==','globalThis.__candidateMustNotRun = true;'].join('\n');
const input = {programId:'fixture-page',revision:1,sourceUtf8:source,
  entryFormat:'classic-userscript',importSourceUrl:null,lockId:null};

const fail = (f,code) => assert.rejects(f,error=>error.code===code, 'Expected '+code);
function setup() {
  let tables = new Map([['frameworkKV',new Map()],['commandJournal',new Map()]]);
  const profiles = {
    a:{tag:'host',registrationId:'host-a',hostDocumentId:'doc-a',hostInstanceId:'instance-a',
      hostUrl:'chrome-extension://fixture/ui/tool.html',browserSessionIncarnation:'session-one',
      namespace:'tool:owner-a',active:true,revoked:false},
    b:{tag:'host',registrationId:'host-b',hostDocumentId:'doc-b',hostInstanceId:'instance-b',
      hostUrl:'chrome-extension://fixture/ui/tool.html',browserSessionIncarnation:'session-one',
      namespace:'tool:owner-b',active:true,revoked:false}
  };
  for(const h of Object.values(profiles)) tables.get('commandJournal').set('host:'+h.registrationId,structuredClone(h));
  const storage={async transaction(stores,mode,run) {
    // Emulate a single committed transaction with a snapshot; a Promise queue
    // serializes imports so two calls cannot both commit the same revision.
    const prior=storage.queue,complete={};storage.queue=new Promise(resolve=>complete.resolve=resolve);
    await prior;
    const snapshot=structuredClone(tables);
    const table=name=>{assert.ok(stores.includes(name));return snapshot.get(name);};
    const tx={get:async(name,key)=>structuredClone(table(name).get(key)),
      put:async(name,value,key)=>{assert.equal(mode,'readwrite');table(name).set(key,structuredClone(value));},
      all:async name=>[...table(name).values()].map(structuredClone)};
    try{
      const result=await run(tx);
      if(mode==='readwrite')tables=snapshot;
      return result;
    }finally{complete.resolve();}
  },queue:Promise.resolve()};
  const assertHost=async sender=>{
    const host=profiles[sender?.key];
    invariant(host && sender.documentId===host.hostDocumentId,'E_OWNER');
    return structuredClone(host);
  };
  const currentHost=async(tx,host,sender)=>{
    const stored=await tx.get('commandJournal','host:'+host.registrationId);
    invariant(stored?.active && !stored.revoked && stored.hostDocumentId===sender.documentId &&
      stored.hostInstanceId===host.hostInstanceId && stored.browserSessionIncarnation===host.browserSessionIncarnation,
    'E_OWNER','Host no longer active');
  };
  let resolver;
  const dependencies={async loadForExecution(request,sender) {
    if(resolver) await resolver(request,sender);
    invariant(request.lockId===null,'E_DEPENDENCY_UNLOCKED');
    const summary=await describeDependencyManifest(request);
    return {lockId:null,entries:[],world:'USER_SCRIPT',manifestDigest:summary.manifestDigest};
  }};
  const methods=createPageCandidateMethods({storage,assertHost,currentHost,dependencies,
    clock:{now:()=>1760000000000}});
  const a={key:'a',documentId:'doc-a'},b={key:'b',documentId:'doc-b'};
  return {methods,storage,a,b,input:structuredClone(input),
    records:()=>tables.get('frameworkKV'),hosts:()=>tables.get('commandJournal'),
    defer:fn=>{resolver=fn;}};
}

test('Page v1 imports as an immutable Candidate; read/list do not publish, install or execute',async()=>{
  const f=setup(),first=await f.methods.importPageCandidate(f.input,f.a);
  assert.match(first.candidateId,/^page-[a-f0-9]{64}$/);
  assert.equal(first.stage,'Candidate');
  assert.equal(first.runtimeKind,'page-userscript');
  assert.equal(Object.hasOwn(first,'installed'),false);
  assert.equal(globalThis.__candidateMustNotRun,undefined);
  const read=await f.methods.getPageCandidate({programId:input.programId,revision:1},f.a);
  assert.equal(read.sourceUtf8,source);
  assert.equal(read.manifest.sourceHash,first.sourceHash);
  const list=await f.methods.listPageCandidates({},f.a);
  assert.equal(list.candidates.length,1);assert.equal(list.truncated,false);
  assert.equal(Object.hasOwn(list.candidates[0],'sourceUtf8'),false);
  assert.equal([...f.records().values()][0].verification,null);
  assert.ok([...f.records().values()].every(row=>row.tag==='page-candidate-v1'));
});

test('same source/revision is idempotent under concurrent imports, conflicting bytes/authority are rejected',async()=>{
  const f=setup();
  const [one,two]=await Promise.all([f.methods.importPageCandidate(input,f.a),
    f.methods.importPageCandidate(input,f.a)]);
  assert.equal(one.candidateId,two.candidateId);
  assert.equal(f.records().size,1);
  await fail(()=>f.methods.importPageCandidate({...input,sourceUtf8:source+'\n// changed'},f.a),'E_REQUEST_CONFLICT');
  assert.equal(f.records().size,1);
  const next=await f.methods.importPageCandidate({...input,revision:2},f.a);
  assert.notEqual(next.candidateId,one.candidateId);
  assert.equal(f.records().size,2);
  for(const field of ['namespace','stage','verification','installed','authority','dependencyResolution']) {
    await fail(()=>f.methods.importPageCandidate({...input,[field]:'Available'},f.a),'E_SCHEMA');
  }
  await fail(()=>f.methods.importPageCandidate({...input,sourceUtf8:' ' .repeat(65537)},f.a),'E_LIMIT');
});

test('different Host namespaces cannot read or overwrite another Page program',async()=>{
  const f=setup();
  const owned=await f.methods.importPageCandidate(input,f.a);
  await fail(()=>f.methods.getPageCandidate({programId:input.programId,revision:1},f.b),'E_PAGE_CANDIDATE');
  assert.equal((await f.methods.listPageCandidates({},f.b)).candidates.length,0);
  const other=await f.methods.importPageCandidate(input,f.b);
  assert.notEqual(owned.candidateId,other.candidateId);
  assert.equal((await f.methods.listPageCandidates({},f.a)).candidates.length,1);
  assert.equal((await f.methods.listPageCandidates({},f.b)).candidates.length,1);
});

test('source, manifest and manufactured Available state tampering fail closed on read',async()=>{
  for(const variant of ['source','hash','available','verification']) {
    const f=setup();await f.methods.importPageCandidate(input,f.a);
    const row=[...f.records().values()][0];
    if(variant==='source') row.sourceUtf8+='/* tampered */';
    if(variant==='hash') row.manifestHash='0'.repeat(64);
    if(variant==='available') row.stage='Available';
    if(variant==='verification') row.verification={verified:true};
    await fail(()=>f.methods.getPageCandidate({programId:input.programId,revision:1},f.a),
      ['source','hash'].includes(variant)?'E_HASH':'E_PAGE_CANDIDATE');
  }
});

test('revoking the Host during dependency validation or before commit leaves no Candidate',async()=>{
  const f=setup(),lock={release:null,promise:null};
  lock.promise=new Promise(resolve=>lock.release=resolve);
  f.defer(()=>lock.promise);
  const pending=f.methods.importPageCandidate(input,f.a);
  await new Promise(resolve=>setImmediate(resolve));
  f.hosts().get('host:host-a').active=false;
  lock.release();
  await fail(()=>pending,'E_OWNER');
  assert.equal(f.records().size,0);
});

test('missing dependency approval and unsupported script metadata cannot form Candidate',async()=>{
  const f=setup();
  await fail(()=>f.methods.importPageCandidate({...input,lockId:'dep-lock-'+'0'.repeat(64)},f.a),'E_DEPENDENCY_UNLOCKED');
  await fail(()=>f.methods.importPageCandidate({...input,sourceUtf8:source.replace('// @noframes','// @grant GM_xmlhttpRequest')},f.a),'E_GRANT_UNSUPPORTED');
  assert.equal(f.records().size,0);
});

test('Broker route is behind packaged Host authentication; no Page availability route is created',async()=>{
  const {readFileSync}=await import('node:fs');
  const code=readFileSync(new URL('../../src/platform/host/broker.js',import.meta.url),'utf8');
  assert.match(code,/importPageCandidate:\(p,s\)=>pageCandidates\.importPageCandidate\(p,s\)/);
  assert.match(code,/getPageCandidate:\(p,s\)=>pageCandidates\.getPageCandidate\(p,s\)/);
  assert.match(code,/if \(message\.type !== 'registerHost'\) await authenticate\(message,sender\)/);
  assert.doesNotMatch(code,/makePageAvailable:/);
});
