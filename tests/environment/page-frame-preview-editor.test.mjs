import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createScriptEditor} from '../../src/ui/script-editor.js';
import {wrapPageFrameSource} from '../../src/scripting/user-scripts/page-frame-resources.js';

// Component-only dispatch/lifecycle tests. No native gesture or Chrome proof.
class Element {
  value='';textContent='';dataset={};checked=false;disabled=false;children=[];listeners=new Map();
  addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);}
  removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
  fire(name,event={}){for(const fn of this.listeners.get(name)||[])fn(event);}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;this.value=children[0]?.value||'';}
  setAttribute(name,value){this[name]=String(value);}
  removeAttribute(name){delete this[name];}
}
globalThis.Option=class extends Element {constructor(text,value){super();this.textContent=text;this.value=value;}};
const event=()=>({addListener(){},removeListener(){}});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const hash=source=>createHash('sha256').update(source).digest('hex');
const html=await readFile(new URL('../../src/ui/tool.html',import.meta.url),'utf8');
const source=await wrapPageFrameSource('async function main(){return "parent";}',[
  {resourceId:'renderer',code:'OpenDeskFrame.port.postMessage({title:"中文 English 123"});'}]);
async function until(check,message){
  for(let n=0;n<200;n++){if(check())return;await tick();}
  assert.fail(message);
}
async function fixture(t,{sourceUtf8=source,handle}={}){
  const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,new Element()]));
  const walk=(node,id)=>node.id===id?node:node.children.map(child=>walk(child,id)).find(Boolean);
  const find=id=>nodes.get(id)||[...nodes.values()].map(node=>walk(node,id)).find(Boolean);
  const doc={getElementById:find,defaultView:new Element(),createElement:()=>new Element()};
  find('script-id').value='fixed-frame';find('script-source').value=sourceUtf8;
  find('script-target-mode').value='current';find('script-params').value='{}';
  const target={snapshot:{status:'available',windowId:7,tabId:11,frameId:0,
    documentId:'document-a',url:'https://a.example/',origin:'https://a.example',title:'A'},
    ready:Promise.resolve(),subscribe(fn){fn(this.snapshot);return ()=>{};},
    capture(){return {...this.snapshot};},async revalidate(){}};
  const api={runtime:{getURL:path=>'chrome-extension://test/'+path},
    permissions:{contains:async()=>true},tabs:{query:async()=>[],onRemoved:event()},
    webNavigation:{onCommitted:event()}};
  const projection={slotAvailable:true,runs:[],results:[],downloads:[],resultDeliveryDenied:[]};
  const host={currentRun:null,controller:{snapshotControllerRun:async()=>projection,
    listControllerScripts:async()=>[]},subscribe(){return ()=>{};},resourceSnapshot:()=>({}),dispose(){}};
  const requests=[],compilations=[];
  const client={ready:Promise.resolve(),async request(method,payload){
    if(method==='listPagePrograms')return {catalog:[],installed:[]};
    if(!['previewPageScript','retirePagePreview','queryPagePreview'].includes(method))return {programs:[]};
    requests.push({method,payload:structuredClone(payload)});
    if(handle)return handle(method,payload);
    if(method==='previewPageScript')return {state:'preview-evaluated',sourceHash:hash(payload.sourceUtf8),
      tabId:payload.target.tabId,documentId:payload.target.documentId,resultText:'parent',
      managedUI:!!payload.managedUI,managedPreviewId:payload.managedUI?.previewId};
    if(method==='retirePagePreview')return {state:'preview-retired',sourceHash:hash(sourceUtf8),
      receipt:{ok:true,scope:'managed-ui-only'}};
    assert.fail('unexpected query');
  }};
  const editor=createScriptEditor({client,currentPageTarget:target,api,document:doc,hostFactory:()=>host,
    componentPreparerFactory:()=>({cancel(){},dispose(){},async prepare(input){
      compilations.push(input);throw Error('fixed JavaScript must not be compiled as a framework');}})});
  t.after(()=>editor.dispose());await tick();await tick();
  return {find,requests,compilations,target,editor,
    async click(id){find(id).fire('click',{isTrusted:true});await tick();},
    async settle(){await until(()=>['completed','error'].includes(find('page-preview-status').dataset.state),
      'preview did not settle: '+find('page-preview-status').textContent);}};
}

test('fixed frame JavaScript uses managed preview and Stop owns the original full source identity',async t=>{
  const f=await fixture(t);await f.click('page-preview-run');await f.settle();
  const preview=f.requests.find(row=>row.method==='previewPageScript').payload;
  assert.equal(preview.managedUI?.enabled,true,'fixed resources require the original managed workbench lifecycle');
  assert.match(preview.managedUI.bindingId,/^browser-v1-/);
  assert.equal(preview.sourceUtf8,source);assert.equal(preview.entryFormat,'async-main');
  assert.equal(preview.lockId,null);assert.equal(Object.hasOwn(preview,'framework'),false);
  assert.deepEqual(f.compilations,[]);assert.equal(f.find('script-stop').disabled,false);
  f.find('script-source').value='async function main(){return "edited";}';
  f.find('script-source').fire('input');
  await f.click('script-stop');
  await until(()=>f.requests.some(row=>row.method==='retirePagePreview'),'Stop did not retire the original preview');
  assert.deepEqual(f.requests.find(row=>row.method==='retirePagePreview').payload,{previewId:preview.managedUI.previewId});
  assert.equal(f.find('script-status').dataset.state,'completed');
});

test('fixed classic JavaScript retains its entry format and does not enter the component compiler',async t=>{
  const classic=await wrapPageFrameSource('document.title="parent";',[
    {resourceId:'renderer',code:'/*'+'x'.repeat(150000)+'*/OpenDeskFrame.port.start();'}]);
  const f=await fixture(t,{sourceUtf8:classic});await f.click('page-preview-run');await f.settle();
  const preview=f.requests.find(row=>row.method==='previewPageScript').payload;
  assert.equal(preview.managedUI.enabled,true);assert.equal(preview.entryFormat,'classic-userscript');
  assert.equal(preview.sourceUtf8,classic);assert.equal(f.find('page-preview-status').dataset.state,'completed');
  assert.deepEqual(f.compilations,[]);
});

test('a fixed child resource with a bad SHA never dispatches or acquires Stop ownership',async t=>{
  const bad=source.replace(/"sha256":"[a-f0-9]{64}"/,'"sha256":"'+'0'.repeat(64)+'"');
  assert.notEqual(bad,source);
  const f=await fixture(t,{sourceUtf8:bad});await f.click('page-preview-run');await f.settle();
  assert.match(f.find('page-preview-status').textContent,/E_PAGE_FRAME_RESOURCE_HASH/);
  assert.deepEqual(f.requests,[]);assert.equal(f.find('script-stop').disabled,true);
});

test('JavaScript without child resources retains the existing unmanaged request',async t=>{
  const plain='async function main(){return "plain";}';
  const f=await fixture(t,{sourceUtf8:plain});await f.click('page-preview-run');await f.settle();
  const preview=f.requests.find(row=>row.method==='previewPageScript').payload;
  assert.equal(preview.sourceUtf8,plain);assert.equal(preview.entryFormat,'async-main');
  assert.equal(Object.hasOwn(preview,'managedUI'),false);assert.equal(f.find('script-stop').disabled,true);
  assert.equal(f.find('page-preview-status').dataset.state,'completed');
});

test('imported fixed JavaScript draft runs its verified bytes without inventing a framework',async t=>{
  const f=await fixture(t),author='export default async function main(){return "parent";}';
  await f.editor.importDraft({format:'opendesk.program-draft.v1',runtimeKind:'page-userscript',
    project:{id:'fixed-frame',version:'1.0.0',entry:'src/main.js'},
    build:{mode:'production',sourceHash:hash(source),byteLength:Buffer.byteLength(source)},
    sourceUtf8:source,authoring:{files:[{path:'src/main.js',sourceUtf8:author,sha256:hash(author)}]}});
  assert.equal(f.requests.length,0,'import never executes');
  await f.click('page-preview-run');await f.settle();
  const preview=f.requests.find(row=>row.method==='previewPageScript').payload;
  assert.equal(preview.sourceUtf8,source);assert.equal(preview.managedUI.enabled,true);
  assert.equal(f.find('script-source').readOnly,true);assert.equal(f.find('script-stop').disabled,false);
  const technical=JSON.parse(f.find('page-preview-technical').textContent);
  assert.equal(technical.sourceHash,hash(source));assert.equal(Object.hasOwn(technical.authoring,'framework'),false);
  assert.deepEqual(f.compilations,[]);
});

test('Stop during fixed resource preparation cancels dispatch without retiring or replaying a preview',async t=>{
  const f=await fixture(t);let release,checking=false;
  const gate=new Promise(resolve=>{release=resolve;});
  f.target.revalidate=async()=>{checking=true;await gate;};
  await f.click('page-preview-run');await until(()=>checking,'target validation did not start');
  assert.equal(f.find('script-stop').disabled,false);
  await f.click('script-stop');release();await f.settle();
  assert.deepEqual(f.requests,[]);assert.match(f.find('page-preview-status').textContent,/E_PAGE_COMPILER_STALE/);
});

for(const forged of [false,true])test('unknown fixed resource effect queries once and '+
  (forged?'rejects a mismatched completion':'recovers only original Stop ownership'),async t=>{
  const f=await fixture(t,{handle:async(method,payload)=>{
    if(method==='previewPageScript')throw Object.assign(Error('original completion lost'),{code:'E_EFFECT_UNKNOWN'});
    if(method==='queryPagePreview')return {queryOnly:true,originalDocumentOnly:true,state:'preview-evaluated',
      managedUI:true,managedPreviewId:payload.previewId,sourceHash:payload.sourceHash,
      tabId:payload.tabId,documentId:payload.documentId,world:'USER_SCRIPT',receiptNonce:'original-nonce',
      completion:{format:'opendesk.page-preview-receipt.v1',nonce:forged?'wrong-nonce':'original-nonce',ok:true}};
    if(method==='retirePagePreview')return {state:'preview-retired',sourceHash:hash(source),
      receipt:{ok:true,scope:'managed-ui-only'}};
    assert.fail('unexpected method '+method);
  }});
  await f.click('page-preview-run');await f.settle();
  const previews=()=>f.requests.filter(row=>row.method==='previewPageScript');
  const queries=f.requests.filter(row=>row.method==='queryPagePreview');
  assert.equal(previews().length,1);assert.equal(queries.length,1);
  const preview=previews()[0].payload;
  assert.deepEqual(queries[0].payload,{previewId:preview.managedUI.previewId,sourceHash:hash(source),
    tabId:preview.target.tabId,documentId:preview.target.documentId});
  assert.equal(f.find('page-preview-run').disabled,true);assert.equal(f.find('script-stop').disabled,forged);
  await f.click('page-preview-run');await tick();
  assert.equal(previews().length,1,'even a fixture click on a disabled Run cannot replay an unknown effect');
  if(!forged){
    await f.click('script-stop');
    await until(()=>f.requests.some(row=>row.method==='retirePagePreview'),'recovered owner could not Stop');
    assert.equal(f.requests.find(row=>row.method==='retirePagePreview').payload.previewId,preview.managedUI.previewId);
  }
  assert.equal(previews().length,1);
});
