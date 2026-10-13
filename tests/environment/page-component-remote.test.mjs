import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageComponentRemote} from '../../src/ui/page-component-remote.js';
const root='https://module.example.org/v1/index.js',child='https://other.example.org/v1/child.js';
const rows=[{url:root,code:`import value from '${child}';export default value;`,sha256:'a'.repeat(64),bytes:100},
  {url:child,code:'export default 42;',sha256:'b'.repeat(64),bytes:18}];
const pin=({url,sha256,bytes})=>({url,sha256,bytes});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
class Node{
  textContent='';value='';hidden=false;disabled=false;dataset={};listeners=new Map();
  addEventListener(name,fn){this.listeners.set(name,fn);}removeEventListener(name){this.listeners.delete(name);}
  replaceChildren(...children){this.children=children;this.value=children[0]?.value||'';}
  click(trusted=true){return this.listeners.get('click')?.({isTrusted:trusted});}
}
globalThis.Option=class extends Node{constructor(text,value){super();this.textContent=text;this.value=value;}};
function fixture(){
  const nodes=new Map(['','-status','-prepare','-cancel','-sources','-details','-detail-body','-lock'].map(suffix=>['page-component-remote'+suffix,new Node()]));
  const f={source:{componentSource:`import value from '${root}';export default function App(){return value}`,framework:'react'},
    calls:[],permissions:[],locked:false,downloadGate:null};
  const entries=rows.map(pin),manifestDigest='manifest-d3',lockId='component-lock-'+'f'.repeat(64);
  const client={request:async(method,payload)=>{
    f.calls.push({method,payload:structuredClone(payload)});
    if(method==='inspectPageComponentDependencies')return {manifestDigest,locks:f.locked?[{lockId,entries}]:[]};
    if(method==='preparePageComponentDependencies'){
      if(f.downloadGate)await f.downloadGate.promise;
      const modules=payload.approvedUrls.includes(child)?rows:[rows[0]];
      return {reviewId:'review',reviewDigest:'review-'+modules.length,modules,entries:modules.map(pin),totalBytes:modules.reduce((n,row)=>n+row.bytes,0)};
    }
    if(method==='approvePageComponentDependencies'){f.locked=true;return {manifestDigest,lockId,entries};}
    if(method==='loadPageComponentDependencies')return {lockId,modules:structuredClone(rows),lock:{format:'opendesk.remote-lock.v1',modules:Object.fromEntries(rows.map(row=>[row.url,{sha256:row.sha256,bytes:row.bytes}]))}};
    throw Error('unexpected '+method);
  }};
  const preparer={inspect:async input=>{
    const modules=input.remoteModules||[],present=new Set(modules.map(row=>row.url));
    const missingUrls=!present.has(root)?[root]:!present.has(child)?[child]:[];
    return {remoteRoots:[root],missingUrls,complete:missingUrls.length===0,modules:modules.map(row=>({url:row.url,children:row.url===root?[child]:[]}))};
  },cancel(){}};
  const api={permissions:{contains:async()=>true,request:async request=>{f.permissions.push(request);return true;}}};
  f.controller=createPageComponentRemote({client,preparer,api,document:{getElementById:id=>nodes.get(id)},getInput:()=>f.source});
  f.get=id=>nodes.get('page-component-remote'+id);f.click=trusted=>f.get('-prepare').click(trusted);
  return f;
}

test('component source preparation displays and confirms every new URL; inspection, Run and fixed reads never download',async t=>{
  const f=fixture();t.after(()=>f.controller.dispose());
  await f.click(false);assert.equal(f.calls.length,0);
  await assert.rejects(f.controller.loadForRun(f.source),{code:'E_REMOTE_UNLOCKED'});
  assert.ok(f.calls.every(row=>row.method==='inspectPageComponentDependencies'));
  await f.click();assert.equal(f.get('-status').dataset.state,'download');assert.equal(f.get('-sources').textContent,root);
  assert.equal(f.calls.filter(row=>row.method==='preparePageComponentDependencies').length,0);
  await f.click();assert.equal(f.get('-status').dataset.state,'download');assert.equal(f.get('-sources').textContent,child);
  assert.deepEqual(f.calls.filter(row=>row.method==='preparePageComponentDependencies').map(row=>row.payload.approvedUrls),[[root]]);
  await f.click();assert.equal(f.get('-status').dataset.state,'review');assert.match(f.get('-detail-body').textContent,/SHA-256/);
  assert.equal(f.calls.filter(row=>row.method==='approvePageComponentDependencies').length,0);
  await f.click();assert.equal(f.get('-status').dataset.state,'ready');assert.equal(f.locked,true);
  const approval=f.calls.find(row=>row.method==='approvePageComponentDependencies');
  assert.deepEqual(approval.payload.acceptedModules,rows.map(pin));
  assert.deepEqual(approval.payload.graph,[{url:root,children:[child]},{url:child,children:[]}]);
  const count=f.calls.filter(row=>row.method==='preparePageComponentDependencies').length;
  f.source={...f.source,componentSource:f.source.componentSource+'\n// data changed'};f.controller.refresh();
  const loaded=await f.controller.loadForRun(f.source);assert.equal(loaded.modules.length,2);
  assert.equal(f.calls.filter(row=>row.method==='preparePageComponentDependencies').length,count);
  assert.equal(f.permissions.length,0,'an existing Chrome grant does not replace individual source confirmations');
});

test('Cancel and source changes discard late downloads before any transitive acquisition, version approval or Run',async t=>{
  for(const edit of [false,true]){
    const f=fixture();t.after(()=>f.controller.dispose());await f.click();f.downloadGate=deferred();
    const pending=f.click();await tick();assert.equal(f.controller.busy,true);
    if(edit){f.source={...f.source,componentSource:f.source.componentSource+'\n// edit'};f.controller.refresh();}
    else f.controller.cancel();
    f.downloadGate.resolve();await pending;
    assert.equal(f.controller.busy,false);assert.equal(f.locked,false);
    assert.deepEqual(f.calls.filter(row=>row.method==='preparePageComponentDependencies').map(row=>row.payload.approvedUrls),[[root]]);
    assert.equal(f.calls.some(row=>row.method==='approvePageComponentDependencies'),false);
    assert.equal(f.get('-status').dataset.state,'idle');
  }
});

test('R7.2 Controller/React ESM Run automatically pins complete transitive module graph',async t=>{
  const f=fixture();t.after(()=>f.controller.dispose());
  const loaded=await f.controller.autoLoadForRun(f.source);
  assert.equal(loaded.modules.length,2);
  assert.equal(f.locked,true);
  assert.equal(f.get('-status').dataset.state,'ready');
  const prepared=f.calls.filter(row=>row.method==='preparePageComponentDependencies');
  assert.deepEqual(prepared.map(row=>row.payload.approvedUrls),[[root],[child]]);
  assert.ok(prepared.every(row=>row.payload.explicitUserAction===true));
  const approved=f.calls.filter(row=>row.method==='approvePageComponentDependencies');
  assert.equal(approved.length,1);
  assert.equal(approved[0].payload.explicitUserAction,true);
  assert.deepEqual(approved[0].payload.graph,[{url:root,children:[child]},{url:child,children:[]}]);
  await f.controller.autoLoadForRun(f.source);
  assert.equal(f.calls.filter(row=>row.method==='preparePageComponentDependencies').length,2,
    'repeat Run uses the locked immutable bytes');
});
test('R7.2 auto graph acquisition stops after a cancellation, with no transitive fetch or approval',async t=>{
  const f=fixture();t.after(()=>f.controller.dispose());
  f.downloadGate=deferred();
  const pending=f.controller.autoLoadForRun(f.source);
  await tick();assert.equal(f.controller.busy,true);
  f.controller.cancel();
  f.downloadGate.resolve();
  await assert.rejects(pending,{code:'E_REMOTE_STALE'});
  assert.equal(f.locked,false);
  assert.deepEqual(f.calls.filter(row=>row.method==='preparePageComponentDependencies').map(row=>row.payload.approvedUrls),[[root]]);
  assert.equal(f.calls.some(row=>row.method==='approvePageComponentDependencies'),false);
});
