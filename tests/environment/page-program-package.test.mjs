import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash, webcrypto} from 'node:crypto';
import {preparePageProgramRegistration,sha256Utf8,JQUERY_371} from '../../src/scripting/user-scripts/page-program-package.js';
import {loadPackagedJquery} from '../../src/scripting/user-scripts/packaged-dependencies.js';

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

test('verified frozen candidate produces USER_SCRIPT matching descriptor with one-world identity',async()=>{
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
  await fail(()=>loadPackagedJquery({runtime:{getURL:()=> 'chrome-extension://abc/vendor/jquery-3.7.1.min.js'},fetchImpl:async()=>({ok:true,text:async()=>'tampered'})}),'E_DEPENDENCY_HASH');
});
