import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash, webcrypto} from 'node:crypto';
import {prepareLegacyPageProgramRegistration as preparePageProgramRegistration,
  preparePageProgramRegistration as prepareGenericPageProgramRegistration,sha256Utf8,JQUERY_371}
  from '../../src/scripting/user-scripts/page-program-package.js';
import {loadPackagedJquery} from '../../src/scripting/user-scripts/packaged-dependencies.js';
import {createPageProgramManifest,hashPageProgramManifest,validatePageProgramManifest}
  from '../../src/scripting/user-scripts/page-program-contract.js';
import {createDependencyManager} from '../../src/scripting/user-scripts/dependency-manager.js';
import {compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';

globalThis.crypto ||= webcrypto;
const source = 'async function main(){globalThis.counter=(globalThis.counter||0)+1; document.title="R3";}';
function fixture(overrides={}) {
  const revision={scriptId:'r3-test',revision:1,contentHash:createHash('sha256').update(source).digest('hex')};
  const candidate={candidateId:'candidate-1',manifestHash:'a'.repeat(64),revision,
    manifest:{entryFormat:'async-main-v1',pageRules:{matches:['https://example.com/*'],excludeMatches:['https://example.com/skip/*'],world:'USER_SCRIPT'},dependenciesLock:[]},...overrides};
  const proof={candidateId:candidate.candidateId,manifestHash:candidate.manifestHash,revision:candidate.revision,status:'Available',installationEnabled:true,approvedMatches:candidate.manifest.pageRules.matches};
  return {candidate,sourceUtf8:source,authority:{assertAvailable:async()=>proof}};
}
const fail = (f,code)=>assert.rejects(f,error=>error.code===code,`expected ${code}`);

test('explicit legacy adapter preserves R3 frozen USER_SCRIPT descriptors',async()=>{
  const args=fixture(), plan=await preparePageProgramRegistration(args);
  assert.match(plan.id,/^opendesk-page-[a-f0-9]{48}$/);
  assert.equal(plan.world,'USER_SCRIPT');assert.equal(plan.worldId,plan.id);
  assert.equal(plan.runAt,'document_idle'); assert.equal(plan.allFrames,false);
  assert.deepEqual(plan.matches,['https://example.com/*']);
  assert.deepEqual(plan.excludeMatches,['https://example.com/skip/*']);
  assert.equal(plan.js.length,1);
  const context={console,Promise,Symbol,Set,document:{title:''},counter:0};context.globalThis=context;
  vm.runInNewContext(plan.js[0].code,context);
  vm.runInNewContext(plan.js[0].code,context);
  await new Promise(setImmediate);
  assert.equal(context.counter,1);assert.equal(context.document.title,'R3');
  assert.equal(await sha256Utf8(source),args.candidate.revision.contentHash);
});

test('legacy frozen Page adapter accepts HTTP(S) all-host wildcard with matching authority proof',async()=>{
  const x=fixture();x.candidate.manifest.pageRules.matches.splice(0,1,'*://*/*');
  const plan=await preparePageProgramRegistration(x);
  assert.deepEqual(plan.matches,['*://*/*']);
  assert.deepEqual(plan.excludeMatches,['https://example.com/skip/*']);
});

test('legacy narrow approval cannot authorize an edited all-host wildcard',async()=>{
  const narrow=fixture();
  narrow.candidate.manifest.pageRules.matches=['*://*/*'];
  await fail(()=>preparePageProgramRegistration(narrow),'E_NOT_AVAILABLE');
});

test('new pinned revision obtains different world and old revision unchanged',async()=>{
  const a=fixture();const previous=await preparePageProgramRegistration(a);
  const b=fixture(); b.candidate.revision={...b.candidate.revision,revision:2};
  b.authority.assertAvailable=async()=>({candidateId:b.candidate.candidateId,manifestHash:b.candidate.manifestHash,revision:b.candidate.revision,status:'Available',installationEnabled:true,approvedMatches:b.candidate.manifest.pageRules.matches});
  const next=await preparePageProgramRegistration(b);
  assert.notEqual(previous.worldId,next.worldId);
});

test('fails closed without existing broker Available+install grant or with altered script hash',async()=>{
  await fail(()=>preparePageProgramRegistration({...fixture(),authority:{}}),'E_AUTHORITY_REQUIRED');
  let x=fixture(); x.authority.assertAvailable=async()=>({...await fixture().authority.assertAvailable(),status:'Candidate'});
  await fail(()=>preparePageProgramRegistration(x),'E_NOT_AVAILABLE');
  x=fixture();x.authority.assertAvailable=async()=>({...await fixture().authority.assertAvailable(),installationEnabled:false});
  await fail(()=>preparePageProgramRegistration(x),'E_NOT_AVAILABLE');
  x=fixture();x.sourceUtf8+='// changed';await fail(()=>preparePageProgramRegistration(x),'E_SOURCE_HASH');
  x=fixture();x.candidate.manifest.pageRules.world='MAIN';await fail(()=>preparePageProgramRegistration(x),'E_WORLD_NOT_APPROVED');
  x=fixture();x.candidate.manifest.pageRules.matches=['<all_urls>'];await fail(()=>preparePageProgramRegistration(x),'E_PAGE_MATCH');
  x=fixture();x.candidate.manifest.pageRules.matches=['https://evil.example/*'];await fail(()=>preparePageProgramRegistration(x),'E_NOT_AVAILABLE');
  x=fixture();x.candidate.manifest.pageRules.allFrames=true;await fail(()=>preparePageProgramRegistration(x),'E_NOT_AVAILABLE');
});

test('dependency version/sha/world lock enforced, library failure blocks injection',async()=>{
  const x=fixture();x.candidate.manifest.dependenciesLock=[{id:'jquery',version:JQUERY_371.version,sha256:JQUERY_371.sha256,order:0,world:'USER_SCRIPT'}];
  await fail(()=>preparePageProgramRegistration({...x,dependencySources:{jquery:'fake JS'}}),'E_DEPENDENCY_HASH');
  x.candidate.manifest.dependenciesLock[0].version='3.6.0';
  await fail(()=>preparePageProgramRegistration(x),'E_DEPENDENCY_LOCK');
  await fail(()=>loadPackagedJquery({runtime:{getURL:()=> 'https://evil.invalid/jquery.min.js'}, fetchImpl:async()=>{throw Error('must not fetch')}}),'E_RESOURCE_IDENTITY');
  await fail(()=>loadPackagedJquery({runtime:{getURL:()=> 'chrome-extension://abc/libs/vendor/jquery/3.7.1/jquery.min.js'},fetchImpl:async()=>({ok:true,text:async()=>'tampered'})}),'E_DEPENDENCY_HASH');
});

const genericUrls = ['https://numbers.example.org/library.js','https://format.example.net/library.js'];
const genericLibraries = ['var PageNumbers = {sum:(a,b)=>a+b};','var PageFormatter = {format:v=>"value="+v};'];
const genericSource = entryFormat => ['// ==UserScript==','// @name Generic page fixture',
  '// @match https://example.com/*','// @exclude-match https://example.com/private/*',
  '// @run-at document-end','// @noframes',...genericUrls.map(url => '// @require ' + url),
  '// ==/UserScript==',entryFormat === 'classic-userscript'
    ? 'var classicResult=PageFormatter.format(PageNumbers.sum(19,23));\n(function(){document.title=classicResult;})();'
    : 'async function main(){ document.title=PageFormatter.format(PageNumbers.sum(19,23)); return document.title; }'].join('\n');

// Actual dependency manager and compiler, with transactional storage/HTTP and
// authority component doubles. This does not claim Chrome or Available evidence.
async function genericFixture(entryFormat='classic-userscript') {
  const namespace='tool:page-fixture';
  const host={tag:'host',active:true,registrationId:'page-host',hostDocumentId:'host-document',hostInstanceId:'host-instance',
    browserSessionIncarnation:'session-one',hostUrl:'chrome-extension://fixture/ui/tool.html'};
  let tables=new Map([['frameworkKV',new Map()],['commandJournal',new Map([['host:page-host',host]])]]);
  const storage={async transaction(stores,mode,work) {
    const next=structuredClone(tables),table=name=>{assert.ok(stores.includes(name));return next.get(name);};
    const result=await work({get:async(name,key)=>structuredClone(table(name).get(key)),
      put:async(name,value,key)=>{assert.equal(mode,'readwrite');table(name).set(key,structuredClone(value));}});
    if(mode==='readwrite')tables=next;
    return result;
  }};
  let fetchCount=0;
  const manager=createDependencyManager({storage,api:{permissions:{contains:async()=>true}},
    assertHost:async()=>({...host,namespace}),clock:{now:()=>1720000000000},fetchImpl:async url=>{
      fetchCount++;
      const index=genericUrls.indexOf(url);assert.ok(index>=0);
      const response=new Response(genericLibraries[index],{headers:{'content-type':'application/javascript'}});
      Object.defineProperty(response,'url',{value:url});return response;
    }});
  const sourceUtf8=genericSource(entryFormat),request={sourceUtf8,entryFormat};
  const review=await manager.prepare({...request,explicitUserAction:true},{});
  const lock=await manager.approve({reviewId:review.reviewId,explicitUserAction:true,
    acceptedHashes:review.entries.map(row=>row.sha256)},{});
  const dependencyResolution=await manager.loadForExecution({...request,lockId:lock.lockId},{});
  const manifest=await createPageProgramManifest({programId:'generic-page',revision:1,...request,dependencyResolution});
  const candidate={candidateId:'page-candidate-one',namespace,manifestHash:await hashPageProgramManifest(manifest),manifest};
  const proofFor = current => ({candidateId:current.candidateId,namespace:current.namespace,manifestHash:current.manifestHash,
    status:'Available',installationEnabled:true,runtimeKind:current.manifest.runtimeKind,entryFormat:current.manifest.entryFormat,
    programId:current.manifest.programId,revision:current.manifest.revision,sourceHash:current.manifest.sourceHash,
    dependencyLockId:current.manifest.dependencyLockId,dependencyManifestDigest:current.manifest.dependencyManifestDigest,
    approvedPageRules:structuredClone(current.manifest.pageRules)});
  const args={candidate,sourceUtf8,dependencyResolution,authority:{assertAvailable:async()=>proofFor(candidate)}};
  return {args,manager,lock,proofFor,fetchCount:()=>fetchCount};
}

test('D1 Page contract consumes actual manager locks and preserves generic classic globals without a wrapper',async()=>{
  const f=await genericFixture(),plan=await prepareGenericPageProgramRegistration(f.args);
  const {manifest}=f.args.candidate;
  assert.equal(manifest.format,'opendesk.page-program.v1');
  assert.equal(manifest.runtimeKind,'page-userscript');
  assert.equal(manifest.entryFormat,'classic-userscript');
  assert.equal(manifest.dependencyLockId,f.lock.lockId);
  assert.equal(manifest.dependencyManifestDigest,f.lock.manifestDigest);
  assert.match(plan.id,/^opendesk-page-d1-[a-f0-9]{48}$/);
  assert.equal(plan.worldId,plan.id);assert.equal(plan.allFrames,false);assert.equal(plan.runAt,'document_end');
  const preview=await compileLockedPageSource({sourceUtf8:f.args.sourceUtf8,entryFormat:manifest.entryFormat,
    entries:f.args.dependencyResolution.entries});
  assert.deepEqual(plan.js,preview.js,'formal Page and preview use the same execution-source compiler');
  const context={document:{title:''}};
  vm.runInNewContext(plan.js[0].code,context);
  assert.equal(context.classicResult,'value=42','classic var remains global');
  assert.equal(context.document.title,'value=42');
  assert.equal(context.PageNumbers.sum(1,2),3);
  assert.equal(globalThis.PageNumbers,undefined,'source never executes in the host');
  const again=await prepareGenericPageProgramRegistration(f.args);
  assert.equal(again.id,plan.id,'a reconciler can reuse this stable native registration ID');
  assert.equal(f.fetchCount(),2,'registration compilation does not redownload dependencies');
});

test('async-main Page revisions share immutable dependencies while registration identities remain isolated',async()=>{
  const f=await genericFixture('async-main'),old=await prepareGenericPageProgramRegistration(f.args);
  const sourceUtf8=f.args.sourceUtf8.replace('sum(19,23)','sum(1,2)');
  const dependencyResolution=await f.manager.loadForExecution({sourceUtf8,entryFormat:'async-main',lockId:f.lock.lockId},{});
  const manifest=await createPageProgramManifest({programId:'generic-page',revision:2,sourceUtf8,entryFormat:'async-main',dependencyResolution});
  const candidate={...f.args.candidate,manifest,manifestHash:await hashPageProgramManifest(manifest)};
  const next=await prepareGenericPageProgramRegistration({candidate,sourceUtf8,dependencyResolution,
    authority:{assertAvailable:async()=>f.proofFor(candidate)}});
  assert.notEqual(next.id,old.id);assert.equal(manifest.dependencyLockId,f.args.candidate.manifest.dependencyLockId);
  const oldContext={document:{title:''}},newContext={document:{title:''}};
  assert.equal(await vm.runInNewContext(old.js[0].code,oldContext),'value=42');
  assert.equal(await vm.runInNewContext(next.js[0].code,newContext),'value=3');
  const other={...candidate,namespace:'tool:another-owner'};
  const otherPlan=await prepareGenericPageProgramRegistration({candidate:other,sourceUtf8,dependencyResolution,
    authority:{assertAvailable:async()=>f.proofFor(other)}});
  assert.notEqual(otherPlan.worldId,next.worldId,'namespace is part of the execution identity');
});

test('full Page authority proof binds kind, entry, revision, dependency identity and every rule, not only matches',async()=>{
  const f=await genericFixture(),original=f.proofFor(f.args.candidate);
  const changes=[proof=>{proof.namespace='tool:other';},proof=>{proof.runtimeKind='controller';},
    proof=>{proof.entryFormat='async-main';},proof=>{proof.manifestHash='0'.repeat(64);},
    proof=>{proof.revision++;},proof=>{proof.sourceHash='0'.repeat(64);},
    proof=>{proof.dependencyLockId='dep-lock-'+'0'.repeat(64);},proof=>{proof.dependencyManifestDigest='0'.repeat(64);},
    proof=>{proof.installationEnabled=false;},proof=>{proof.status='Candidate';},
    proof=>{proof.approvedPageRules.excludeMatches=[];},proof=>{proof.approvedPageRules.runAt='document_start';},
    proof=>{proof.approvedPageRules.allFrames=true;}];
  for(const change of changes) {
    const proof=structuredClone(original);change(proof);
    await fail(()=>prepareGenericPageProgramRegistration({...f.args,authority:{assertAvailable:async()=>proof}}),'E_NOT_AVAILABLE');
  }
  await fail(()=>prepareGenericPageProgramRegistration({...f.args,authority:{}}),'E_AUTHORITY_REQUIRED');
  const oldProof={...original};delete oldProof.approvedPageRules;oldProof.approvedMatches=original.approvedPageRules.matches;
  await assert.rejects(prepareGenericPageProgramRegistration({...f.args,authority:{assertAvailable:async()=>oldProof}}));
});

test('Page source/metadata/asset tampering is blocked and old Controller/R3 formats require an explicit path',async()=>{
  const f=await genericFixture();
  await fail(()=>prepareGenericPageProgramRegistration({...f.args,sourceUtf8:f.args.sourceUtf8+'\n// edit'}),'E_SOURCE_HASH');
  const changed=structuredClone(f.args.candidate);changed.manifest.pageRules.excludeMatches=[];
  await fail(()=>prepareGenericPageProgramRegistration({...f.args,candidate:changed}),'E_MANIFEST_HASH');
  changed.manifestHash=await hashPageProgramManifest(changed.manifest);
  await fail(()=>prepareGenericPageProgramRegistration({...f.args,candidate:changed}),'E_PAGE_METADATA_RULES');
  for(const field of ['manifestDigest','lockId']) {
    const dependencyResolution=structuredClone(f.args.dependencyResolution);
    dependencyResolution[field]=field==='lockId'?'dep-lock-'+'0'.repeat(64):'0'.repeat(64);
    await fail(()=>prepareGenericPageProgramRegistration({...f.args,dependencyResolution}),'E_DEPENDENCY_LOCK_STALE');
  }
  const dependencyResolution=structuredClone(f.args.dependencyResolution);dependencyResolution.entries[0].code+='\n// tamper';
  await fail(()=>prepareGenericPageProgramRegistration({...f.args,dependencyResolution}),'E_DEPENDENCY_HASH');
  assert.throws(()=>validatePageProgramManifest({...f.args.candidate.manifest,format:'opendesk.task.v1'}),error=>error.code==='E_PAGE_KIND');
  assert.throws(()=>validatePageProgramManifest({...f.args.candidate.manifest,entryFormat:'async-main-v1'}),error=>error.code==='E_ENTRY_FORMAT');
  assert.throws(()=>validatePageProgramManifest({...f.args.candidate.manifest,programId:42}),error=>error.code==='E_REVISION');
  await assert.rejects(prepareGenericPageProgramRegistration(fixture()),'R3 never falls through to the generic Page compiler');
});
