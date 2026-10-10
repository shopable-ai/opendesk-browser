import test from 'node:test';
import assert from 'node:assert/strict';
import {createDependencyManager} from '../../src/scripting/user-scripts/dependency-manager.js';
import {digestUtf8} from '../../src/platform/protocol.js';
import {verifyPageProgramSource} from '../../src/scripting/user-scripts/page-program-contract.js';
import {preparePageProgramRegistration} from '../../src/scripting/user-scripts/page-program-package.js';
import {validatePageProgramRules,isPageMatchPattern} from '../../src/scripting/user-scripts/page-program-rules.js';
import {parseUserScriptDependencies,assessUserScriptExecution} from '../../src/scripting/user-scripts/dependency-metadata.js';

const source='async function main(){ return {title:document.title}; }';
const rules=()=>({matches:['https://example.com/*'],excludeMatches:[],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'});
function fixture(){
  const host={tag:'host',namespace:'tool:test',registrationId:'host',hostDocumentId:'tool-document',
    hostInstanceId:'instance',browserSessionIncarnation:'session',hostUrl:'chrome-extension://test/ui/tool.html',active:true,revoked:false};
  let db=new Map([['frameworkKV',new Map()],['commandJournal',new Map([['host:host',host]])]]),tail=Promise.resolve();
  const state={trusted:true,nativeEffects:0};
  const storage={transaction(names,mode,body){
    const next=tail.then(async()=>{
      const copy=structuredClone(db),table=name=>{assert.ok(names.includes(name));return copy.get(name);};
      const tx={get:async(n,k)=>structuredClone(table(n).get(k)),all:async n=>[...table(n).values()].map(v=>structuredClone(v)),
        put:async(n,v,k)=>{assert.equal(mode,'readwrite');table(n).set(k,structuredClone(v));},
        delete:async(n,k)=>{assert.equal(mode,'readwrite');table(n).delete(k);}};
      const result=await body(tx);if(mode==='readwrite')db=copy;return result;
    });tail=next.catch(()=>{});return next;
  }};
  const api={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path},
    permissions:{contains:async()=>{state.nativeEffects++;return true;}}};
  const service=createDependencyManager({api,storage,assertHost:async()=>{
    if(!state.trusted)throw Object.assign(Error('Untrusted host'),{code:'E_OWNER'});
    return structuredClone(host);
  }});
  const request=(patch={})=>({programId:'native-page',revision:1,sourceUtf8:source,entryFormat:'async-main',
    lockId:null,importSourceUrl:null,pageRules:rules(),...patch});
  return {service,request,state,rows:()=>[...db.get('frameworkKV').values()]};
}

test('native JS follows real Candidate -> stored material -> existing registration compiler without a metadata header',async()=>{
  const f=fixture(),receipt=await f.service.importPageCandidate(f.request(),{});
  assert.equal(receipt.stage,'Candidate');
  const view=await f.service.getPageCandidate({programId:'native-page',revision:1},{});
  assert.equal(view.sourceUtf8,source);
  assert.equal(view.manifest.sourceHash,await digestUtf8(source));
  assert.deepEqual(view.manifest.pageRules,rules());
  const {candidate,resolution}=await f.service.readStoredPageCandidate('tool:test','native-page',1);
  await verifyPageProgramSource({manifest:candidate.manifest,sourceUtf8:source,dependencyResolution:resolution});
  const proof={...candidate.manifest,candidateId:candidate.candidateId,namespace:candidate.namespace,
    manifestHash:candidate.manifestHash,status:'Available',installationEnabled:true,approvedPageRules:candidate.manifest.pageRules};
  const descriptor=await preparePageProgramRegistration({candidate,sourceUtf8:source,dependencyResolution:resolution,
    authority:{assertAvailable:async()=>proof}});
  assert.deepEqual(descriptor.matches,rules().matches);
  assert.equal(descriptor.allFrames,false);
  assert.equal(descriptor.world,'USER_SCRIPT');
  assert.ok(descriptor.js.at(-1).code.includes(source));
  assert.equal(descriptor.js.at(-1).code.includes('==UserScript=='),false);
  assert.equal(f.state.nativeEffects,0);
  assert.equal(f.rows().filter(row=>row.tag==='page-candidate-v1').length,1);
  assert.equal(f.rows()[0].verification,null);
});

test('source identity stays stable while changed scheduling creates a different immutable manifest',async()=>{
  const f=fixture(),one=await f.service.importPageCandidate(f.request(),{});
  const narrow={...rules(),matches:['https://example.com/narrow/*']};
  await assert.rejects(()=>f.service.importPageCandidate(f.request({pageRules:narrow}),{}),{code:'E_REQUEST_CONFLICT'});
  const two=await f.service.importPageCandidate(f.request({revision:2,pageRules:narrow}),{});
  assert.notEqual(one.manifestHash,two.manifestHash);
  const views=await Promise.all([1,2].map(revision=>f.service.getPageCandidate({programId:'native-page',revision},{})));
  assert.equal(views[0].manifest.sourceHash,views[1].manifest.sourceHash);
  assert.equal(views[1].sourceUtf8,source);
});

test('mutating source or scope during an asynchronous import cannot change the captured Candidate',async()=>{
  const f=fixture(),request=f.request(),pending=f.service.importPageCandidate(request,{});
  request.sourceUtf8='async function main(){return "changed";}';
  request.pageRules.matches[0]='https://evil.example/*';
  await pending;
  const saved=await f.service.getPageCandidate({programId:'native-page',revision:1},{});
  assert.equal(saved.sourceUtf8,source);
  assert.deepEqual(saved.manifest.pageRules,rules());
});

test('native settings cannot launder legacy GM privileges or silently override imported execution intent',async()=>{
  const f=fixture();
  const legacy=grant=>['// ==UserScript==','// @match https://example.com/*','// @noframes',
    '// @run-at document-idle','// @grant '+grant,'// ==/UserScript==',source].join('\n');
  await assert.rejects(()=>f.service.importPageCandidate(f.request({sourceUtf8:legacy('GM_xmlhttpRequest')}),{}),{code:'E_GRANT_UNSUPPORTED'});
  await assert.rejects(()=>f.service.importPageCandidate(f.request({sourceUtf8:legacy('none'),
    pageRules:{...rules(),matches:['https://other.example/*']}}),{}),{code:'E_PAGE_METADATA_RULES'});
  assert.equal(f.rows().length,0);
  const old=f.request({sourceUtf8:legacy('none')});delete old.pageRules;
  await f.service.importPageCandidate(old,{});
  assert.equal((await f.service.getPageCandidate({programId:'native-page',revision:1},{})).sourceUtf8,old.sourceUtf8);
});

test('program settings never grant browser services and untrusted hosts cannot persist them',async()=>{
  const f=fixture();
  await assert.rejects(()=>f.service.importPageCandidate(f.request({capabilities:['cookies']}),{}),{code:'E_SCHEMA'});
  for(const field of ['capabilities','approved','grant','namespace'])
    await assert.rejects(()=>f.service.importPageCandidate(f.request({pageRules:{...rules(),[field]:true}}),{}),{code:'E_PAGE_CONTRACT'});
  await assert.rejects(()=>f.service.importPageCandidate(f.request({pageRules:{...rules(),matches:['file:///*']}}),{}),{code:'E_PAGE_MATCH'});
  await assert.rejects(()=>f.service.importPageCandidate(f.request({pageRules:{...rules(),world:'MAIN'}}),{}),{code:'E_WORLD_NOT_APPROVED'});
  f.state.trusted=false;
  await assert.rejects(()=>f.service.importPageCandidate(f.request(),{}),{code:'E_OWNER'});
  assert.equal(f.rows().length,0);
  assert.equal(f.state.nativeEffects,0);
});

test('omitted native settings create only a main-frame HTTP(S) all-host Candidate without a grant',async()=>{
  const f=fixture(),receipt=await f.service.importPageCandidate(f.request({pageRules:undefined}),{});
  assert.equal(receipt.stage,'Candidate');
  const view=await f.service.getPageCandidate({programId:'native-page',revision:1},{});
  assert.deepEqual(view.manifest.pageRules,{...rules(),matches:['*://*/*']});
  assert.equal(view.sourceUtf8,source);
  assert.equal(f.rows().filter(row=>row.tag==='page-candidate-v1').length,1);
  assert.equal(f.rows()[0].verification,null);
  assert.equal(f.state.nativeEffects,0);
});

test('native scheduling rejects duplicate, sparse, malformed and over-budget rule arrays',()=>{
  for(const matches of [[],Array(1),['javascript:alert(1)'],['chrome://settings/*'],['https://example.com/*','https://example.com/*'],
    Array.from({length:40},(_,i)=>'https://example.com/'+String(i)+'x'.repeat(2000))])
    assert.throws(()=>validatePageProgramRules({...rules(),matches}));
  const frozen=validatePageProgramRules(rules());
  assert.ok(Object.isFrozen(frozen.matches));
  assert.throws(()=>frozen.matches.push('https://other.example/*'),TypeError);
});

test('native HTTP scheduling policy stays compatible with legacy import matching without generating source',()=>{
  const patterns=['https://example.com/*','http://127.0.0.1/*','https://*.example.com/path/*','*://*/*',
    'https://example.com:443/*','https://[::1]/*','https://example.com:99999/*','file:///tmp/*','<all_urls>',
    'https://u:p@example.com/*','javascript:alert(1)','https://exa*mple.com/*','https://example.com/a b'];
  for(const pattern of patterns){
    const parsed=parseUserScriptDependencies('// ==UserScript==\n// @match '+pattern+'\n// ==/UserScript==');
    const legacy=assessUserScriptExecution(parsed,{phase:'registration',dependenciesLocked:true});
    assert.equal(isPageMatchPattern(pattern),!legacy.blockers.some(row=>row.code==='E_PAGE_MATCH'),pattern);
  }
});
