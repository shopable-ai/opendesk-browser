import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageDependencyResolver} from '../../src/ui/page-dependencies.js';
import {createPageDependencyInstaller} from '../../src/ui/page-dependency-install.js';
import {createDeveloperView} from '../../src/ui/develop-view.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){for(let i=0;i<6;i++)await tick();}
function fixture({onState=()=>{}}={}){
  const view=createDeveloperView();
  const url='https://libraries.example.org/fresh-classic.js',sha='f'.repeat(64),digest='c'.repeat(64);
  const source='// ==UserScript==\n// @require '+url+'\n// ==/UserScript==\nasync function main(){return FreshLibrary.call(42);}\n';
  let programId='alpha',granted=false,inClick=false,requests=0,fetches=0,prepared=[],approvals=[],installer;
  const locks=new Map(),inspected=[];
  const lockFor=id=>'dep-lock-'+(id==='alpha'?'a':'b').repeat(64);
  const client={ready:Promise.resolve(),async request(method,payload){
    if(method==='inspectPageDependencies'){
      inspected.push(payload.programId);
      return {manifestDigest:digest,requires:[{order:0,url,name:'fresh-classic.js',version:'1.0.0',
        sourceKind:'https',status:'needs-review',risk:'第三方代码可读写网页 DOM',
        license:{status:'unknown',name:null},cacheChoices:[],downloadError:null,
        sharedCacheChoices:locks.size?[{sha256:sha,byteLength:44,sourceKind:'https',resolvedUrl:url,mime:'text/javascript',
          license:{status:'unknown',name:null},approvedAt:1}]:[]}],
        locks:locks.has(payload.programId)?[{lockId:locks.get(payload.programId),entries:[{sha256:sha}]}]:[]};
    }
    if(method==='preparePageDependencies'){
      prepared.push(structuredClone(payload));
      if(!payload.selections.some(row=>row.sharedAssetSha256===sha)){
        assert.equal(granted,true);
        fetches++;
      }
      return {reviewId:'dep-review-'+('1'.repeat(8))+'-1111-1111-1111-111111111111',
        status:'pending-review',approvalStatus:'pending',manifestDigest:digest,totalBytes:44,
        entries:[{order:0,name:'fresh-classic.js',version:'1.0.0',url,resolvedUrl:url,
          sourceKind:'https',acquisition:payload.selections.length?'shared-content-cache':'download',
          sha256:sha,byteLength:44,world:'USER_SCRIPT',license:{status:'unknown',name:null},
          integrityResult:{verified:[]}}]};
    }
    if(method==='approvePageDependencies'){
      approvals.push(structuredClone(payload));
      locks.set(payload.programId,lockFor(payload.programId));
      return {lockId:lockFor(payload.programId),manifestDigest:digest,approvalStatus:'approved'};
    }
    throw Error('Unexpected RPC '+method);
  }};
  const api={permissions:{contains:async()=>granted,request:input=>{
    assert.equal(inClick,true,'native permission request must stay within trusted click stack');
    assert.deepEqual(input.origins,['https://libraries.example.org/*']);
    requests++;granted=true;return Promise.resolve(true);
  },onAdded:{addListener(){},removeListener(){}},onRemoved:{addListener(){},removeListener(){}}}};
  const resolver=createPageDependencyResolver({client,getSource:()=>source,getProgramId:()=>programId,
    onState:()=>installer?.update()});
  installer=createPageDependencyInstaller({client,api,view,resolver,getSource:()=>source,
    getProgramId:()=>programId,onState});
  const state=()=>view.getSnapshot().dependencies.classic,actions=view.actions.pageDependencies;
  const invoke=name=>{inClick=true;try{return actions[name]({isTrusted:true});}finally{inClick=false;}};
  return {state,actions,resolver,installer,invoke,sha,locks,prepared,approvals,inspected,
    runClick:()=>{inClick=true;const p=installer.confirmRun({isTrusted:true});inClick=false;return p;},
    get requests(){return requests;},get fetches(){return fetches;},
    setProgram:id=>{programId=id;resolver.refresh();installer.refresh();},
    dispose:()=>{installer.dispose();resolver.dispose();view.dispose();}};
}

test('Classic source permission inspection notifies the editor when Run becomes ready',async t=>{
  let enabled=false,f;
  f=fixture({onState:()=>{enabled=f.installer.readyForRun;}});
  t.after(f.dispose);
  assert.equal(enabled,false);
  await settle();
  assert.equal(f.installer.readyForRun,true,'a checked missing permission is ready for a genuine Run gesture');
  assert.equal(enabled,true,'the editor must be notified, rather than leave its Run button disabled');
  assert.equal(f.requests,0,'inspection does not request permission');
  assert.equal(f.prepared.length,0,'inspection does not download or execute');
});

test('R7.1 UI keeps download, byte approval and execution separate and preserves Chrome user gesture',async t=>{
  const f=fixture();t.after(f.dispose);await settle();
  assert.equal(f.requests,0,'inspection cannot request permissions');
  assert.equal(f.prepared.length,0,'inspection cannot download');
  assert.equal(!f.state().visible,false);
  f.actions.prepare({isTrusted:false});
  assert.equal(f.requests,0,'synthetic click must not invoke Chrome');
  f.invoke('prepare');
  assert.equal(f.requests,1,'permission was synchronously requested from the trusted click');
  await settle();
  assert.equal(f.prepared.length,1);
  assert.equal(f.approvals.length,0,'successful fetch is not approval');
  assert.equal(f.state().review===null,false);
  assert.equal(f.state().approveDisabled,true);
  f.invoke('approve');assert.equal(f.approvals.length,0);
  const entries=f.state().review.entries;
  assert.equal(entries.length,1);f.actions.checkReview(entries[0].order,true,f.state().review.reviewId);
  assert.equal(f.state().approveDisabled,false);
  f.invoke('approve');await settle();
  assert.equal(f.approvals.length,1);
  assert.equal(f.approvals[0].programId,'alpha');
  assert.equal(f.resolver.capture().lockId,f.locks.get('alpha'));
  assert.equal(f.fetches,1);
});

test('R7.1 second program visibly chooses shared SHA, reviews independently, and never fetches again',async t=>{
  const f=fixture();t.after(f.dispose);await settle();
  f.invoke('prepare');await settle();
  for(const entry of f.state().review.entries)f.actions.checkReview(entry.order,true,f.state().review.reviewId);
  f.invoke('approve');await settle();
  f.setProgram('beta');await settle();
  assert.equal(f.resolver.inspection.locks.length,0);
  assert.equal(f.resolver.inspection.requires[0].sharedCacheChoices.length,1);
  const choice=f.state().entries[0].options.find(row=>row.value==='shared:'+f.sha);
  assert.ok(choice,'shared selection exists');
  f.actions.chooseAcquisition(0,choice.value);
  await settle();
  f.invoke('prepare');await settle();
  assert.deepEqual(f.prepared.at(-1).selections,[{order:0,sharedAssetSha256:f.sha}]);
  assert.equal(f.fetches,1,'second program reuses bytes without network');
  assert.equal(f.requests,1,'shared bytes need no new download-origin permission');
  assert.equal(f.approvals.length,1,'second program still awaiting its own review');
  for(const entry of f.state().review.entries)f.actions.checkReview(entry.order,true,f.state().review.reviewId);
  f.invoke('approve');await settle();
  assert.equal(f.approvals.at(-1).programId,'beta');
  assert.notEqual(f.locks.get('alpha'),f.locks.get('beta'));
  assert.equal(f.resolver.capture().lockId,f.locks.get('beta'));
});

test('R7.2 direct Run uses the real synchronous Chrome source-permission gesture, without manual SHA approval',async t=>{
  const f=fixture();t.after(f.dispose);await settle();
  await assert.rejects(f.installer.confirmRun({isTrusted:false}),{code:'E_GESTURE'});
  assert.equal(f.requests,0);
  await f.runClick();
  assert.equal(f.requests,1,'first Run must request missing CDN source permission during the click');
  assert.equal(f.prepared.length,0,'permission alone cannot download');
  assert.equal(f.approvals.length,0,'permission cannot establish a script lock');
});

test('R7.2 zero-dependency Page and frozen UI builds bypass only the library preflight',async t=>{
  const view=createDeveloperView();
  let chromeRequests=0,brokerRequests=0;
  const api={permissions:{request(){chromeRequests++;return Promise.resolve(true);},
    contains:async()=>false,onAdded:{addListener(){},removeListener(){}},
    onRemoved:{addListener(){},removeListener(){}}}};
  const installer=createPageDependencyInstaller({
    client:{request(){brokerRequests++;throw Error('No broker inspection needed');}},
    api,view,resolver:{inspection:null},getSource:()=>
      '// @opendesk-lib react\nasync function main(){return "<div>fixed</div>";}',
    getProgramId:()=> 'no-deps'});
  t.after(()=>{installer.dispose();view.dispose();});
  assert.equal(!view.getSnapshot().dependencies.classic.visible,true);
  assert.equal(installer.readyForRun,true);
  assert.equal(await installer.confirmRun({isTrusted:true}),true);
  assert.equal(chromeRequests,0,'library gate cannot request an origin without a declared source');
  assert.equal(brokerRequests,0,'no network or locked dependency operations for plain fixed code');
  await assert.rejects(installer.confirmRun({isTrusted:false}),{code:'E_GESTURE'});
});
