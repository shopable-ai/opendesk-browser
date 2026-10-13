import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageDependencyResolver} from '../../src/ui/page-dependencies.js';
import {createPageDependencyInstaller} from '../../src/ui/page-dependency-install.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){for(let i=0;i<6;i++)await tick();}
class Node {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.handlers=new Map();
    this.hidden=false;this.disabled=false;this.checked=false;this.value='';this.textContent='';this.className='';}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=[...items];}
  setAttribute(){}
  addEventListener(name,listener){const handlers=this.handlers.get(name)||[];handlers.push(listener);this.handlers.set(name,handlers);}
  removeEventListener(name,listener){this.handlers.set(name,(this.handlers.get(name)||[]).filter(fn=>fn!==listener));}
  emit(name,{target=this,isTrusted=true}={}){for(const fn of this.handlers.get(name)||[])fn({type:name,target,isTrusted});}
  descendants(){return [this,...this.children.flatMap(node=>node instanceof Node?node.descendants():[])];}
}
const elementIds=['page-dependency-panel','page-dependency-status','page-dependency-list','page-dependency-prepare',
  'page-dependency-review','page-dependency-review-list','page-dependency-approve','page-dependency-lock'];
function fixture(){
  const nodes=new Map(elementIds.map(id=>[id,new Node(id.includes('approve')||id.includes('prepare')?'button':'div')]));
  const doc={getElementById:id=>nodes.get(id),createElement:tag=>new Node(tag),
    createTextNode:text=>({textContent:text,nodeType:3})};
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
  installer=createPageDependencyInstaller({client,api,document:doc,resolver,getSource:()=>source,
    getProgramId:()=>programId});
  const click=id=>{inClick=true;nodes.get(id).emit('click');inClick=false;};
  return {nodes,resolver,installer,click,sha,locks,prepared,approvals,inspected,
    runClick:()=>{inClick=true;const p=installer.confirmRun({isTrusted:true});inClick=false;return p;},
    get requests(){return requests;},get fetches(){return fetches;},
    setProgram:id=>{programId=id;resolver.refresh();installer.refresh();},
    dispose:()=>{installer.dispose();resolver.dispose();}};
}

test('R7.1 UI keeps download, byte approval and execution separate and preserves Chrome user gesture',async t=>{
  const f=fixture();t.after(f.dispose);await settle();
  assert.equal(f.requests,0,'inspection cannot request permissions');
  assert.equal(f.prepared.length,0,'inspection cannot download');
  assert.equal(f.nodes.get('page-dependency-panel').hidden,false);
  f.nodes.get('page-dependency-prepare').emit('click',{isTrusted:false});
  assert.equal(f.requests,0,'synthetic click must not invoke Chrome');
  f.click('page-dependency-prepare');
  assert.equal(f.requests,1,'permission was synchronously requested from the trusted click');
  await settle();
  assert.equal(f.prepared.length,1);
  assert.equal(f.approvals.length,0,'successful fetch is not approval');
  assert.equal(f.nodes.get('page-dependency-review').hidden,false);
  assert.equal(f.nodes.get('page-dependency-approve').disabled,true);
  f.click('page-dependency-approve');assert.equal(f.approvals.length,0);
  const checks=f.nodes.get('page-dependency-review-list').descendants().filter(n=>n.type==='checkbox');
  assert.equal(checks.length,1);checks[0].checked=true;
  f.nodes.get('page-dependency-review-list').emit('change');
  assert.equal(f.nodes.get('page-dependency-approve').disabled,false);
  f.click('page-dependency-approve');await settle();
  assert.equal(f.approvals.length,1);
  assert.equal(f.approvals[0].programId,'alpha');
  assert.equal(f.resolver.capture().lockId,f.locks.get('alpha'));
  assert.equal(f.fetches,1);
});

test('R7.1 second program visibly chooses shared SHA, reviews independently, and never fetches again',async t=>{
  const f=fixture();t.after(f.dispose);await settle();
  f.click('page-dependency-prepare');await settle();
  for(const c of f.nodes.get('page-dependency-review-list').descendants().filter(n=>n.type==='checkbox'))c.checked=true;
  f.nodes.get('page-dependency-review-list').emit('change');
  f.click('page-dependency-approve');await settle();
  f.setProgram('beta');await settle();
  assert.equal(f.resolver.inspection.locks.length,0);
  assert.equal(f.resolver.inspection.requires[0].sharedCacheChoices.length,1);
  const picker=f.nodes.get('page-dependency-list').descendants().find(n=>n.tagName==='SELECT');
  assert.ok(picker,'shared selection exists');
  picker.value='shared:'+f.sha;
  f.nodes.get('page-dependency-list').emit('change',{target:picker});
  await settle();
  f.click('page-dependency-prepare');await settle();
  assert.deepEqual(f.prepared.at(-1).selections,[{order:0,sharedAssetSha256:f.sha}]);
  assert.equal(f.fetches,1,'second program reuses bytes without network');
  assert.equal(f.requests,1,'shared bytes need no new download-origin permission');
  assert.equal(f.approvals.length,1,'second program still awaiting its own review');
  for(const c of f.nodes.get('page-dependency-review-list').descendants().filter(n=>n.type==='checkbox'))c.checked=true;
  f.nodes.get('page-dependency-review-list').emit('change');
  f.click('page-dependency-approve');await settle();
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
