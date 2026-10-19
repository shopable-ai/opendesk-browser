import {loadFakeBuiltin} from './builtin-support.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createDependencyManager} from '../../src/scripting/user-scripts/dependency-manager.js';
import {createMethodRoutes} from '../../src/platform/host/broker.js';
import {hashPageProgramManifest,validatePageProgramManifest,verifyPageProgramSource} from '../../src/scripting/user-scripts/page-program-contract.js';
import {invariant} from '../../src/platform/protocol.js';
import {validateProgramDraft} from '../../src/ui/program-source.js';
import {describeDependencyManifest} from '../../src/scripting/user-scripts/dependency-manager.js';
import {preparePageCandidateDraft,validatePageCandidateAuthoring} from '../../src/ui/page-candidate-source.js';
import {digestUtf8} from '../../src/platform/protocol.js';
globalThis.crypto ||= webcrypto;
const source=['// ==UserScript==','// @name Candidate fixture','// @match https://example.com/*',
  '// @run-at document-idle','// @noframes','// ==/UserScript==',
  'globalThis.__pageCandidateNotExecuted=true;'].join('\n');
const request={programId:'page-fixture',revision:1,sourceUtf8:source,entryFormat:'classic-userscript',
  importSourceUrl:null,lockId:null};
const fails=(fn,code)=>assert.rejects(fn,e=>e.code===code,'Expected '+code);

const componentInput=framework=>preparePageCandidateDraft({
  programId:'component-'+framework,revision:1,entryFormat:'async-main',lockId:null,
  previewUrl:'https://example.com/demo',componentMode:framework,
  sourceUtf8:`async function main(){return "frozen-${framework}-execution";}`,
  authoringSourceUtf8:framework==='react'
    ? 'export default function App(){return <p>作者 JSX</p>;}'
    : '<template><p>作者 SFC</p></template><script setup>const value=1;</script>'
}).request;
for(const framework of ['react','vue'])test(`${framework} authoring survives the real Candidate repository without becoming execution or compilation proof`,async()=>{
  const f=setup(),input=componentInput(framework);
  const saved=await f.manager.importPageCandidate(input,f.a);
  const restored=await f.manager.getPageCandidate({programId:input.programId,revision:1},f.a);
  const expected={...input.authoring,authorSourceHash:await digestUtf8(input.authoring.sourceUtf8),
    sourceHash:await digestUtf8(input.sourceUtf8)};
  assert.equal(restored.candidateId,saved.candidateId);
  assert.equal(restored.sourceUtf8,input.sourceUtf8);
  assert.deepEqual(restored.authoring,expected);
  assert.equal(restored.authoring.sourceHash,restored.manifest.sourceHash);
  assert.deepEqual(await validatePageCandidateAuthoring(restored),restored.authoring);
  assert.equal(Object.hasOwn(restored,'authorSourceUtf8'),false);
  for(const key of ['authoring','compilation','verification'])assert.equal(Object.hasOwn(restored.manifest,key),false);
  const internal=await f.manager.readStoredPageCandidate('tool:one',input.programId,1);
  assert.deepEqual(internal.candidate.authoring,restored.authoring);
  assert.equal(internal.candidate.verification,null);
  const resolution=await f.manager.loadForExecution({sourceUtf8:restored.sourceUtf8,entryFormat:'async-main',lockId:null},f.a);
  await verifyPageProgramSource({manifest:restored.manifest,sourceUtf8:restored.sourceUtf8,dependencyResolution:resolution});
  await fails(()=>f.manager.getPageCandidate({programId:input.programId,revision:1},f.b),'E_PAGE_CANDIDATE');
  restored.authoring.sourceUtf8='caller changed its returned copy';
  assert.deepEqual((await f.manager.getPageCandidate({programId:input.programId,revision:1},f.a)).authoring,expected);
});

test('existing ESM Candidate author source remains on its original compilation identity',async()=>{
  const f=setup(),input={programId:'existing-esm',revision:1,entryFormat:'async-main',lockId:null,
    sourceUtf8:'async function main(){return 42;}',authorSourceUtf8:'export default async function main(){return 42;}',
    authorLockId:null,compilerVersion:'7.29.9'};
  await f.manager.importPageCandidate(input,f.a);
  const stored=await f.manager.getPageCandidate({programId:input.programId,revision:1},f.a);
  assert.equal(stored.authorSourceUtf8,input.authorSourceUtf8);
  assert.equal(stored.sourceUtf8,input.sourceUtf8);
  assert.equal(stored.manifest.compilation.sourceFormat,'esm-page');
  assert.equal(stored.manifest.compilation.authorSourceHash,await digestUtf8(input.authorSourceUtf8));
  assert.equal(Object.hasOwn(stored,'authoring'),false);
  assert.equal(await validatePageCandidateAuthoring(stored),null);
});

test('component revision is immutable across author text, framework and attachment presence',async()=>{
  const f=setup(),input=componentInput('react');
  const saved=await f.manager.importPageCandidate(input,f.a);
  assert.deepEqual(await f.manager.importPageCandidate(input,f.a),saved);
  for(const authoring of [
    {...input.authoring,sourceUtf8:input.authoring.sourceUtf8+'\n// changed'},
    {...input.authoring,framework:'vue'}
  ])await fails(()=>f.manager.importPageCandidate({...input,authoring},f.a),'E_REQUEST_CONFLICT');
  const {authoring,...withoutAttachment}=input;
  await fails(()=>f.manager.importPageCandidate(withoutAttachment,f.a),'E_REQUEST_CONFLICT');
  const second=setup();
  await second.manager.importPageCandidate(withoutAttachment,second.a);
  await fails(()=>second.manager.importPageCandidate(input,second.a),'E_REQUEST_CONFLICT');
  assert.equal(f.rows().size,1);
});

test('repository snapshots component attachment before awaiting and derives hashes itself',async()=>{
  const f=setup(),input=structuredClone(componentInput('vue')),original=structuredClone(input);
  const pending=f.manager.importPageCandidate(input,f.a);
  input.authoring.framework='react';input.authoring.sourceUtf8='changed during save';input.sourceUtf8+='// changed';
  await pending;
  const stored=await f.manager.getPageCandidate({programId:original.programId,revision:1},f.a);
  assert.equal(stored.sourceUtf8,original.sourceUtf8);
  assert.equal(stored.authoring.sourceUtf8,original.authoring.sourceUtf8);
  assert.equal(stored.authoring.framework,'vue');
  assert.equal(stored.authoring.sourceHash,await digestUtf8(original.sourceUtf8));
});

test('invalid component metadata or compiler/grant claims cannot enter the repository',async()=>{
  const input=componentInput('react');
  for(const authoring of [undefined,null,[],{},
    {...input.authoring,framework:'esm-page'}, {...input.authoring,framework:'javascript'},
    {...input.authoring,sourceUtf8:''},{...input.authoring,sourceUtf8:'中'.repeat(43691)},
    {...input.authoring,sourceHash:'0'.repeat(64)}, {...input.authoring,authorSourceHash:'0'.repeat(64)},
    {...input.authoring,compilerVersion:'7.29.9'}, {...input.authoring,verification:{ok:true}}
  ]){
    const f=setup();
    await fails(()=>f.manager.importPageCandidate({...input,authoring},f.a),'E_PAGE_AUTHORING');
    assert.equal(f.rows().size,0);
  }
  for(const patch of [{entryFormat:'classic-userscript'}, {authorSourceUtf8:'export default async function main(){}'},
    {authorLockId:null},{compilerVersion:'7.29.9'}]){
    const f=setup();
    await fails(()=>f.manager.importPageCandidate({...input,...patch},f.a),'E_PAGE_AUTHORING');
    assert.equal(f.rows().size,0);
  }
});

test('stored component metadata tampering is rejected by public and internal repository readers',async()=>{
  const variants=[
    [row=>{row.authoring.sourceUtf8+='\n// tamper';},'E_SOURCE_HASH'],
    [row=>{row.authoring.authorSourceHash='0'.repeat(64);},'E_SOURCE_HASH'],
    [row=>{row.authoring.sourceHash='0'.repeat(64);},'E_SOURCE_HASH'],
    [row=>{row.authoring.framework='vue';},'E_HASH'],
    [row=>{row.authoring.framework='esm-page';},'E_PAGE_AUTHORING'],
    [row=>{row.authoring.compiled=true;},'E_PAGE_AUTHORING'],
    [row=>{delete row.authoring;},'E_HASH'],
    [row=>{row.authoring=null;},'E_PAGE_AUTHORING'],
    [async row=>{row.authoring.sourceUtf8+='\n// tamper';
      row.authoring.authorSourceHash=await digestUtf8(row.authoring.sourceUtf8);},'E_HASH'],
    [async row=>{row.sourceUtf8+='\n// tamper';row.manifest.sourceHash=await digestUtf8(row.sourceUtf8);
      row.manifestHash=await hashPageProgramManifest(row.manifest);},'E_SOURCE_HASH']
  ];
  for(const [tamper,code] of variants){
    const f=setup(),input=componentInput('react');
    await f.manager.importPageCandidate(input,f.a);
    await tamper([...f.rows().values()].find(row=>row.tag==='page-candidate-v1'));
    await fails(()=>f.manager.getPageCandidate({programId:input.programId,revision:1},f.a),code);
    await fails(()=>f.manager.readStoredPageCandidate('tool:one',input.programId,1),code);
  }
});

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
  const manager=createDependencyManager({loadBuiltin:loadFakeBuiltin,storage,assertHost,clock:{now:()=>1760000000000},
    api:{permissions:{contains:async()=>true}},fetchImpl:async()=>{throw Error('no network')}});
  const a={key:'a',documentId:'doc-a'},b={key:'b',documentId:'doc-b'};
  return {manager,a,b,rows:()=>data.get('frameworkKV'),hosts:()=>data.get('commandJournal'),
    setGate:promise=>{gate=promise;}};
}
test('actual ECharts v2 JSON crosses dependency admission and Candidate storage offline with its exact fixed source',async()=>{
  const draft=await validateProgramDraft(JSON.parse(readFileSync('examples/programs/page-ui-toc-react-direct/page-ui-toc-react-direct.opendesk-draft.json','utf8')));
  const sourceUtf8=draft.sourceUtf8;
  assert.ok(Buffer.byteLength(sourceUtf8)>128*1024,'exercise the measured large resource, not a tiny stand-in');
  const f=setup(),input={programId:'echarts-frozen-json',revision:1,sourceUtf8,entryFormat:'async-main',lockId:null,
    pageRules:{matches:['http://127.0.0.1:43111/*'],excludeMatches:['http://127.0.0.1:43111/private/*'],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'}};
  const declaration=await describeDependencyManifest(input);assert.equal(declaration.parsed.requires.length,0);
  const candidate=await f.manager.importPageCandidate(input,f.a);assert.equal(candidate.stage,'Candidate');
  const stored=await f.manager.getPageCandidate({programId:input.programId,revision:1},f.a);
  assert.equal(stored.sourceUtf8,sourceUtf8);assert.equal(stored.manifest.sourceHash,draft.build.sourceHash);
  const resolution=await f.manager.loadForExecution({sourceUtf8,entryFormat:'async-main',lockId:null},f.a);
  await verifyPageProgramSource({manifest:stored.manifest,sourceUtf8,dependencyResolution:resolution});
  assert.equal(resolution.entries.length,0,'ECharts is already linked; no classic dependency acquisition');
  const tampered=sourceUtf8.replace('async function main','async function maim');assert.notEqual(tampered,sourceUtf8);
  await assert.rejects(f.manager.loadForExecution({sourceUtf8:tampered,entryFormat:'async-main',lockId:null},f.a),{code:'E_PAGE_BUNDLE_HASH'});
  await assert.rejects(f.manager.importPageCandidate({...input,revision:2,sourceUtf8:tampered},f.a),{code:'E_PAGE_BUNDLE_HASH'});
  assert.equal((await f.manager.getPageCandidate({programId:input.programId,revision:1},f.a)).manifestHash,stored.manifestHash);
});
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
  await fails(()=>f.manager.importPageCandidate({...request,sourceUtf8:' '.repeat(131073)},f.a),'E_SOURCE');
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
  await fails(()=>f.manager.importPageCandidate({...request,lockId:'dep-lock-'+'0'.repeat(64)},f.a),'E_DEPENDENCY_LOCK');
  await fails(()=>f.manager.importPageCandidate({...request,sourceUtf8:source.replace('// @noframes','// @grant GM_xmlhttpRequest')},f.a),'E_GRANT_UNSUPPORTED');
  await fails(()=>f.manager.importPageCandidate({...request,sourceUtf8:source.replace('@match https://example.com/*','@match file:///*')},f.a),'E_PAGE_MATCH');
  assert.equal(f.rows().size,0);
});
test('plain JavaScript imported without pageRules defaults to all HTTP(S) sites without installation',async()=>{
  const f=setup();
  const candidate=await f.manager.importPageCandidate({...request,sourceUtf8:'console.log(1)'},f.a);
  const stored=await f.manager.getPageCandidate({programId:request.programId,revision:1},f.a);
  assert.deepEqual(stored.manifest.pageRules.matches,['*://*/*']);
  assert.deepEqual(stored.manifest.pageRules.excludeMatches,[]);
  assert.equal(stored.manifest.pageRules.allFrames,false);
  assert.equal(candidate.stage,'Candidate');
  assert.equal(f.rows().size,1);
});
test('Broker Candidate routes use original dependency manager behind Host authentication',()=>{
  const code=readFileSync(new URL('../../src/platform/host/broker.js',import.meta.url),'utf8');
  // R2 SW optimization replaces repetitive wrappers with a fixed,
  // code-owned allowlist; test the same authorization and call semantics.
  assert.match(code,/createMethodRoutes\(pageDependencies,\['importPageCandidate','getPageCandidate'\]\)/);
  const payload=Object.freeze({kind:'candidate'}),sender=Object.freeze({documentId:'trusted'});
  const service={marker:'original',importPageCandidate(p,s){return [this.marker,p,s];},
    getPageCandidate(p,s){return [this.marker,p,s];}};
  const routes=createMethodRoutes(service,['importPageCandidate','getPageCandidate']);
  assert.deepEqual(routes.importPageCandidate(payload,sender),['original',payload,sender]);
  assert.deepEqual(routes.getPageCandidate(payload,sender),['original',payload,sender]);
  service.importPageCandidate=function(p,s){return ['updated',this.marker,p,s];};
  assert.deepEqual(routes.importPageCandidate(payload,sender),['updated','original',payload,sender],
    'the approved method is still resolved at invocation time, preserving its receiver');
  assert.equal(Object.hasOwn(routes,'makePageAvailable'),false);
  assert.match(code,/if \(message\.type !== 'registerHost'\) await authenticate\(message,sender\)/);
  // Candidate persistence still has no grant-producing method. The separate
  // installed consumer now has its own type-specific verification route.
  assert.doesNotMatch(code,/makePageAvailable:\(p,s\)=>pageDependencies\./);
});
