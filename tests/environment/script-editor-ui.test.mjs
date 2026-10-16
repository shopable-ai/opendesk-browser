import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,realpath,rm,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {LocalDevResolver} from '../../native-agent/local-dev/resolver.mjs';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {createScriptEditor} from '../../src/ui/script-editor.js';

// Component fixtures only: these events provide no Chrome/native gesture proof.
class Element {
  value=''; textContent=''; dataset={}; checked=false; disabled=false;
  children=[]; listeners=new Map();
  addEventListener(name,fn){
    if(!this.listeners.has(name))this.listeners.set(name,new Set());
    this.listeners.get(name).add(fn);
  }
  removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
  fire(name,event={}){for(const fn of this.listeners.get(name)||[])fn(event);}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;this.value=children[0]?.value||'';}
  setAttribute(name,value){this[name]=String(value);}
  removeAttribute(name){delete this[name];}
}
globalThis.Option=class extends Element {
  constructor(text,value){super();this.textContent=text;this.value=value;}
};
const event=()=>({addListener(){},removeListener(){}});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function until(check,message){
  const deadline=Date.now()+10000;
  while(!check()){
    assert.ok(Date.now()<deadline,message);
    await new Promise(resolve=>setTimeout(resolve,5));
  }
}
const hash=source=>createHash('sha256').update(source).digest('hex');
const manualSource='async function main(){return "MANUAL_DRAFT_MUST_NOT_RUN";}';
const html=await readFile(new URL('../../src/ui/tool.html',import.meta.url),'utf8');
const workspace={workspaceId:'workspace-00000000-0000-0000-0000-000000000001',
  name:'prompt-shortcuts',sourceId:'source-'+'a'.repeat(24),access:'read-write',
  leaseEpoch:'lease-'+'a'.repeat(24)};
const program={bindingId:'controller-a',name:'Controller',runtimeKind:'controller',
  preparation:{state:'ready'}};
const availableTarget={status:'available',windowId:7,tabId:11,frameId:0,
  documentId:'document-a',url:'https://a.example/',origin:'https://a.example',title:'A'};

async function fixture(t,{targetAvailable=true,slotAvailable=true,files=[workspace],projects=[],
  connected=false,local=true,resolveSource,handle}={}){
  const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,new Element()]));
  const find=id=>nodes.get(id),view=new Element();
  const doc={getElementById:find,defaultView:view,createElement:()=>new Element()};
  find('script-id').value='manual';find('script-revision').value='1';
  find('script-source').value=manualSource;
  find('script-params').value='{}';find('script-target-mode').value='current';
  find('local-project-params').value='{}';
  const opened=[],requests=[],effects=[],permissions=[],dispatches=[],manualRuns=[],stops=[],resolutions=[],trace=[];
  let nativeConnected=true,pageListener,runListener,localListener,loadGate,statusGate,allowed=true;
  const projection={slotAvailable,runs:[],results:[],downloads:[],resultDeliveryDenied:[]};
  const host={currentRun:null,controller:{
    snapshotControllerRun:async()=>projection,listControllerScripts:async()=>[],
    getControllerScript:async()=>loadGate},
    subscribe(callback){runListener=callback;return ()=>{};},
    completion:Promise.resolve({state:'completed'}),
    start:async request=>{manualRuns.push(request);throw new Error('manual draft fallback is forbidden');},
    stop:async request=>{stops.push(request);},
    resourceSnapshot:()=>({}),dispose(){}};
  const target={snapshot:targetAvailable?availableTarget:{status:'unavailable',reason:'E_TARGET',message:'无目标网页'},
    ready:Promise.resolve(),subscribe(callback){pageListener=callback;callback(this.snapshot);return ()=>{};},
    capture(){effects.push('capture');trace.push('target.capture');return {...this.snapshot};},
    async revalidate(captured){
      trace.push('target.revalidate');
      if(this.snapshot.status!=='available'||['windowId','tabId','frameId','documentId','url','origin']
        .some(key=>captured[key]!==this.snapshot[key]))
        throw Object.assign(new Error('captured target document changed'),{code:'E_TARGET_CHANGED'});
    }};
  const api={runtime:{getURL:path=>'chrome-extension://test/'+path},
    permissions:{contains:async request=>{permissions.push(request);return allowed;}},
    tabs:{query:async()=>[],create:async request=>opened.push(request),onRemoved:event()},
    webNavigation:{onCommitted:event()}};
  const client={ready:Promise.resolve(),
    request:async()=>({programs:[]}),
    requestLocalProject:async(method,params)=>{
      requests.push({method,params});
      if(method==='status'){
        if(statusGate)await statusGate;
        return {nativeConnected,connected,providerEpoch:connected?'epoch-a':null};
      }
      if(method==='workspaces.list')return {workspaces:files,sessionId:'files-session-'+'a'.repeat(24)};
      if(method==='projects.list')return {projects:structuredClone(projects),providerEpoch:'epoch-a'};
      if(method==='project.resolve'){
        trace.push('project.resolve:'+params.bindingId);
        assert.ok(resolveSource,'file-only or missing selection must not resolve executable source');
        const source=await resolveSource(params.bindingId);resolutions.push(source);return source;
      }
      assert.fail('unexpected local-project request: '+method);
    },subscribeLocalProjects(callback){localListener=callback;return ()=>{};}};
  const editor=createScriptEditor({client,currentPageTarget:target,api,document:doc,hostFactory:()=>host});
  t.after(()=>editor.dispose());
  editor.connectLocalProjects({handle:async request=>{
    effects.push(request.method);trace.push('adapter.'+request.method);dispatches.push(request);
    if(handle)return handle(request,{host,projection});
    if(request.method==='run.start'){
      const runId='local-run-'+dispatches.length,resultId='result-'+runId;
      const revision={scriptId:'local-snapshot',revision:1,sourceHash:request.params.sourceHash};
      projection.runs=[{runId,resultId,revision,state:'completed',retirementState:'released'}];
      projection.results=[{runId,resultId,revision,sourceKind:'draft',state:'completed',
        outcome:{ok:true,valueWire:encodeValue(null)}}];
      return {runId};
    }
    assert.fail('unexpected execution: '+request.method);
  }});
  const setLocal=async value=>{
    find('local-project-mode').checked=value;find('local-project-mode').fire('change');
    await tick();await tick();
  };
  await tick();
  if(local)await setLocal(true);
  return {find,editor,host,target,projection,opened,requests,effects,permissions,dispatches,manualRuns,stops,resolutions,trace,setLocal,
    click:async(trusted=true)=>{find('script-run').fire('click',{isTrusted:trusted});await tick();},
    refresh:async()=>{find('local-project-refresh').fire('click',{isTrusted:true});await tick();await tick();},
    setFiles(value){files=value;},setConnected(value){connected=value;nativeConnected=value;},
    setProjects(value){projects=value;},setResolver(value){resolveSource=value;},
    setPermission(value){allowed=value;},
    async poll(){
      const before=requests.filter(row=>row.method==='projects.list').length;
      localListener({nativeConnected,connected,providerEpoch:connected?'epoch-a':null});
      if(connected)await until(()=>requests.filter(row=>row.method==='projects.list').length>before,'metadata poll did not read the project catalog');
      await tick();await tick();
    },
    async select(bindingId){find('local-project-select').value=bindingId;find('local-project-select').fire('change');await tick();},
    async save(){find('script-save').fire('click',{isTrusted:true});await tick();await tick();},
    async settle(){await until(()=>!find('script-run').disabled,'editor did not leave the local Run transaction');},
    setTarget(value){target.snapshot=value;pageListener(value);},
    async setCurrentRun(value){host.currentRun=value;runListener({runId:value});await tick();},
    holdLoad(promise){loadGate=promise;},holdStatus(promise){statusGate=promise;}};
}

// Real explicitly configured, local-only ESM projects. Their resolver outputs,
// not the editor's manual draft or a constant fake source, cross the UI boundary.
async function projectFixture(t,runtimeKind='controller',{managed=false}={}){
  const root=await realpath(await mkdtemp(path.join(tmpdir(),'opendesk-editor-ui-')));
  const directories=['A','B'].map(name=>path.join(root,name));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const put=(name,file,source)=>writeFile(path.join(root,name,file),source);
  for(const name of ['A','B']){
    await mkdir(path.join(root,name,'src'),{recursive:true});
    const opendesk={format:'opendesk.project.v1',id:'editor.project-'+name.toLowerCase(),
      runtimeKind,sourceFormat:'esm',entry:'src/main.js',...(runtimeKind==='controller'?{
        siteOrigins:[availableTarget.origin],permissions:['page.automation'],
        paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false}
      }:{pageRules:{matches:[availableTarget.origin+'/*'],excludeMatches:[],
        runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'}})};
    await put(name,'package.json',JSON.stringify({name:'editor-project-'+name.toLowerCase(),
      version:'1.0.0',type:'module',private:true,description:'Script Editor dispatch fixture',opendesk}));
    await put(name,'src/value.js','export const value='+JSON.stringify(name+'-v1')+';');
    await put(name,'src/main.js','import {value} from "./value.js";\n'+
      (managed?'import {createPageUI} from "@opendesk/ui";\n':'')+
      'export default async function main(){'+
      (managed?'const ui=createPageUI({id:"editor.managed"});ui.content.textContent=value;':'')+
      'return {project:'+JSON.stringify(name)+',value};}');
  }
  const resolver=new LocalDevResolver({allowedPaths:directories});
  t.after(()=>resolver.close());
  const bindings=Object.fromEntries(['A','B'].map((name,i)=>[name,resolver.attach({path:directories[i]}).bindingId]));
  const resolve=async bindingId=>({...await resolver.resolve(bindingId),providerEpoch:'epoch-a'});
  for(const name of ['A','B'])await resolve(bindings[name]);
  const rows=()=>Object.entries(bindings).map(([name,bindingId])=>{
    const source=resolver.cache.get(bindingId);
    return {bindingId,name,runtimeKind,preparation:{state:'ready',
      sourceHash:source.sourceHash,sourceRevision:source.inputHash}};
  });
  return {resolver,bindings,put,resolve,rows};
}

const dispatchedSource=request=>request.method==='run.start'
  ?request.params.source.sourceUtf8:request.params.sourceUtf8;
async function evaluateBundle(source){
  return JSON.parse(JSON.stringify(await vm.runInNewContext(source+'\nmain()',
    {page:{},params:{},axiosx:{},AppStorage:{},AppLocal:{},storage:{}},{timeout:1000})));
}
function assertDispatch(f,p,source,index,runtimeKind){
  const request=f.dispatches[index];
  assert.equal(request.method,runtimeKind==='controller'?'run.start':'page.preview');
  assert.equal(dispatchedSource(request),source.sourceUtf8);
  assert.equal(request.params.sourceHash,source.sourceHash);
  assert.equal(request.params.sourceBytes,Buffer.byteLength(source.sourceUtf8));
  assert.equal(hash(dispatchedSource(request)),source.sourceHash);
  assert.notEqual(source.sourceHash,p.resolver.cache.get(p.bindings.B).sourceHash);
  assert.notEqual(dispatchedSource(request),manualSource);
  const {status:ignored,...target}=availableTarget;
  assert.deepEqual(request.params.target,target);
  if(runtimeKind==='page-userscript'){
    assert.equal(request.params.bindingId,p.bindings.A);
    assert.equal(request.params.entryFormat,source.entryFormat);
  }else{
    assert.deepEqual(request.params.source,{kind:'draft',sourceUtf8:source.sourceUtf8});
    assert.deepEqual(request.params.params,{});
  }
  assert.deepEqual(f.manualRuns,[]);
  assert.deepEqual(f.opened,[]);
}

for(const runtimeKind of ['controller','page-userscript']){
  test('Run dispatches the current selected '+runtimeKind+' bundle; selection, polling and Save never execute',async t=>{
    const p=await projectFixture(t,runtimeKind);
    const f=await fixture(t,{files:[],projects:p.rows(),connected:true,resolveSource:p.resolve,
      ...(runtimeKind==='page-userscript'?{handle:async request=>{
        assert.equal(request.method,'page.preview');
        return {previewId:'preview-'+f.dispatches.length,state:'preview-evaluated',
          sourceHash:request.params.sourceHash,target:request.params.target,
          result:{resultText:'fixture page result'}};
      }}:{})});
    f.find('script-params').value='invalid manual JSON';
    if(runtimeKind==='page-userscript')f.find('local-project-params').value='invalid Controller JSON';
    assert.equal(f.find('script-run').disabled,true,'two projects require an explicit selection');
    await f.select(p.bindings.B);await f.select(p.bindings.A);
    await f.poll();await f.save();
    assert.deepEqual(f.dispatches,[]);assert.deepEqual(f.manualRuns,[]);
    assert.equal(f.requests.filter(row=>row.method==='project.resolve').length,0);
    await f.click(false);
    assert.deepEqual(f.effects,[]);assert.deepEqual(f.permissions,[]);
    await f.click();
    await until(()=>f.dispatches.length===1,'trusted Run did not reach the local adapter');
    await f.settle();
    const first=f.resolutions[0];
    assert.equal(first.bindingId,p.bindings.A);
    assertDispatch(f,p,first,0,runtimeKind);
    assert.deepEqual(await evaluateBundle(dispatchedSource(f.dispatches[0])),{project:'A',value:'A-v1'});
    assert.ok(first.files.some(row=>row.path==='src/main.js'));
    assert.ok(first.files.some(row=>row.path==='src/value.js'));
    assert.notEqual(first.sourceUtf8,await readFile(path.join(p.resolver.get(p.bindings.A).root,'src/main.js'),'utf8'));
    assert.ok(f.trace.indexOf('target.capture')<f.trace.indexOf('project.resolve:'+p.bindings.A));
    assert.ok(f.trace.indexOf('project.resolve:'+p.bindings.A)<f.trace.indexOf('target.revalidate'));
    assert.ok(f.trace.indexOf('target.revalidate')<f.trace.indexOf('adapter.'+f.dispatches[0].method));
    if(runtimeKind==='page-userscript'){
      assert.equal(f.find('script-result').textContent,'fixture page result');
      f.find('script-read').fire('click');await tick();await tick();
      assert.equal(f.find('script-result').textContent,'fixture page result','Controller history must not overwrite the Page result');
    }
    await f.save();
    await until(()=>!!f.find('local-install-summary').textContent,'Save did not prepare the existing installation review');
    assert.equal(f.dispatches.length,1,'Save is review only, never another Run');
    await p.put('A','src/value.js','export const value="A-v2";');
    const latest=await p.resolve(p.bindings.A);
    f.setProjects(p.rows());await f.poll();
    assert.equal(f.dispatches.length,1,'a saved dependency and metadata update must not dispatch');
    await f.click();
    await until(()=>f.dispatches.length===2,'next explicit Run did not dispatch the latest bundle');
    await f.settle();
    assertDispatch(f,p,latest,1,runtimeKind);
    assert.notEqual(latest.sourceHash,first.sourceHash);
    assert.deepEqual(await evaluateBundle(dispatchedSource(f.dispatches[1])),{project:'A',value:'A-v2'});
    assert.deepEqual(await evaluateBundle(dispatchedSource(f.dispatches[0])),{project:'A',value:'A-v1'});
    assert.ok(f.requests.filter(row=>row.method==='project.resolve').every(row=>row.params.bindingId===p.bindings.A));
  });

  test(runtimeKind+' rejects stale Run transactions after capture and before adapter dispatch',async t=>{
    const p=await projectFixture(t,runtimeKind);
    const scenarios=[
      ['project selection',async f=>f.select(p.bindings.B)],
      ['target document',async f=>f.setTarget({...availableTarget,documentId:'document-new'})],
      ['target unavailable',async f=>f.setTarget({status:'unavailable',reason:'E_TARGET'})],
      ['execution slot',async f=>{
        f.projection.slotAvailable=false;f.find('script-read').fire('click');await tick();await tick();
      }],
      ['another Host owner',async f=>f.setCurrentRun('foreign-run')],
      ['Native revocation',async f=>{f.setConnected(false);await f.poll();}],
      ['binding revocation',async f=>{f.setProjects(p.rows().filter(row=>row.bindingId!==p.bindings.A));await f.poll();}],
      ...['updating','source-error'].map(state=>['preparation '+state,async f=>{
        f.setProjects(p.rows().map(row=>row.bindingId===p.bindings.A
          ?{...row,preparation:{...row.preparation,state}}:row));await f.poll();
      }]),
      ['prepared hash change',async f=>{
        f.setProjects(p.rows().map(row=>row.bindingId===p.bindings.A
          ?{...row,preparation:{...row.preparation,sourceHash:'e'.repeat(64)}}:row));await f.poll();
      }],
      ['prepared revision change',async f=>{
        f.setProjects(p.rows().map(row=>row.bindingId===p.bindings.A
          ?{...row,preparation:{...row.preparation,sourceRevision:'f'.repeat(64)}}:row));await f.poll();
      }]
    ];
    for(const [name,change] of scenarios)await t.test(name,async t=>{
      const gate=deferred();let resolved=false;
      t.after(()=>gate.resolve());
      const f=await fixture(t,{files:[],projects:p.rows(),connected:true,resolveSource:async bindingId=>{
        const source=await p.resolve(bindingId);resolved=true;await gate.promise;return source;
      }});
      await f.select(p.bindings.A);await f.click();
      await until(()=>resolved,'Run did not capture and resolve A before the state change');
      await change(f);gate.resolve();
      await until(()=>f.dispatches.length>0||f.find('script-status').dataset.state==='error','Run transaction did not settle');
      await tick();await tick();
      assert.deepEqual(f.dispatches.map(row=>row.method),[],name+' must invalidate the captured Run');
      assert.deepEqual(f.manualRuns,[]);assert.deepEqual(f.opened,[]);
      assert.equal(f.requests.filter(row=>row.method==='project.resolve').length,1,'no automatic replay after invalidation');
    });
  });

  test(runtimeKind+' rejects corrupt source identities and never reuses a last-good bundle after a syntax error',async t=>{
    const p=await projectFixture(t,runtimeKind);
    const corruptions=[
      ['binding',source=>({...source,bindingId:p.bindings.B})],
      ['provider epoch',source=>({...source,providerEpoch:'epoch-other'})],
      ['runtime',source=>({...source,runtimeKind:runtimeKind==='controller'?'page-userscript':'controller'})],
      ['hash',source=>({...source,sourceHash:'0'.repeat(64)})],
      ['byte length',source=>({...source,sourceBytes:source.sourceBytes+1})],
      ['UTF-8 bytes',source=>({...source,sourceUtf8:source.sourceUtf8+'\n// changed'})],
      ['input identity',source=>({...source,inputHash:'not-a-sha256'})],
      ['valid B bundle relabeled as A',async()=>({...await p.resolve(p.bindings.B),bindingId:p.bindings.A})]
    ];
    for(const [name,corrupt] of corruptions)await t.test(name,async t=>{
      const f=await fixture(t,{files:[],projects:p.rows(),connected:true,
        resolveSource:async id=>corrupt(await p.resolve(id))});
      await f.select(p.bindings.A);await f.click();
      await until(()=>f.find('script-status').dataset.state==='error','invalid source was not rejected');
      assert.match(f.find('script-status').textContent,/E_DEV_HASH|E_DEV_CONFLICT/);
      assert.deepEqual(f.dispatches.map(row=>row.method),[]);
      assert.deepEqual(f.manualRuns,[]);assert.deepEqual(f.opened,[]);
    });
    await t.test('broken dependency after a successful build',async t=>{
      const f=await fixture(t,{files:[],projects:p.rows(),connected:true,resolveSource:p.resolve});
      await f.select(p.bindings.A);
      await p.put('A','src/value.js','export const value=;');
      await f.click();
      await until(()=>f.find('script-status').dataset.state==='error','broken dependency did not reject Run');
      assert.match(f.find('script-status').textContent,/E_PROJECT_SYNTAX/);
      assert.deepEqual(f.dispatches.map(row=>row.method),[]);
      assert.deepEqual(f.manualRuns,[]);assert.deepEqual(f.opened,[]);
      await f.poll();
      assert.deepEqual(f.dispatches.map(row=>row.method),[],'polling must not replay a failed Run');
    });
  });
}

test('an existing directory selection follows only its unique executable binding, never its name',async t=>{
  const p=await projectFixture(t);
  for(const association of ['sourceId','workspaceId'])await t.test(association,async t=>{
    const f=await fixture(t,{resolveSource:p.resolve});
    assert.equal(f.find('local-project-select').value,'file-workspace:'+workspace.workspaceId);
    f.setProjects(p.rows().map(row=>row.bindingId===p.bindings.A?{...row,[association]:workspace[association]}:row));
    f.setConnected(true);await f.refresh();
    assert.equal(f.find('local-project-select').value,p.bindings.A);
    assert.equal(f.find('script-run').textContent,'运行本地项目');
    assert.equal(f.find('script-run').disabled,false);
    assert.deepEqual(f.dispatches,[],'linking an already selected directory is navigation only');
    await f.click();
    await until(()=>f.dispatches.length===1,'linked directory did not resolve its executable source');
    await f.settle();
    assertDispatch(f,p,f.resolutions[0],0,'controller');
    assert.equal(f.requests.find(row=>row.method==='project.resolve').params.bindingId,p.bindings.A);
  });
  for(const association of ['ambiguous sourceId','ambiguous workspaceId','name only'])await t.test(association,async t=>{
    const f=await fixture(t,{resolveSource:p.resolve});
    f.setProjects(p.rows().map(row=>association==='name only'?{...row,name:workspace.name}
      :{...row,[association.endsWith('sourceId')?'sourceId':'workspaceId']:
        association.endsWith('sourceId')?workspace.sourceId:workspace.workspaceId}));
    f.setConnected(true);await f.refresh();
    assert.equal(f.find('local-project-select').value,'file-workspace:'+workspace.workspaceId);
    assert.equal(f.find('script-run').disabled,true,'ambiguous or name-only matches cannot authorize Run');
    await f.click();
    assert.deepEqual(f.dispatches,[]);assert.deepEqual(f.manualRuns,[]);assert.deepEqual(f.opened,[]);
    assert.equal(f.requests.filter(row=>row.method==='project.resolve').length,0);
  });
});

test('local Run guards are enforced by the handler even if a disabled button receives a fixture click',async t=>{
  const p=await projectFixture(t);
  for(const guard of ['target','slot','owner','source-error','permission'])await t.test(guard,async t=>{
    const f=await fixture(t,{files:[],projects:p.rows(),connected:true,resolveSource:p.resolve});
    await f.select(p.bindings.A);
    if(guard==='target')f.setTarget({status:'unavailable',reason:'E_TARGET'});
    if(guard==='slot'){f.projection.slotAvailable=false;f.find('script-read').fire('click');await tick();}
    if(guard==='owner')await f.setCurrentRun('other-run');
    if(guard==='source-error'){
      f.setProjects(p.rows().map(row=>({...row,preparation:{state:'source-error'}})));await f.poll();
    }
    if(guard==='permission')f.setPermission(false);
    await f.click();
    if(guard==='permission')await until(()=>f.find('script-status').dataset.state==='error','missing website permission was ignored');
    assert.deepEqual(f.dispatches,[]);assert.deepEqual(f.manualRuns,[]);assert.deepEqual(f.opened,[]);
    assert.equal(f.requests.filter(row=>row.method==='project.resolve').length,0);
  });
});

test('local Page uses page.get for pending results and rejects mismatched preview receipts',async t=>{
  const p=await projectFixture(t,'page-userscript');
  for(const corruption of ['none','sourceHash','documentId','tabId','url','execution error'])await t.test(corruption,async t=>{
    let preview;
    const f=await fixture(t,{files:[],projects:p.rows(),connected:true,resolveSource:p.resolve,handle:async request=>{
      if(request.method==='page.preview'){
        preview=request.params;return {previewId:'pending-page',state:'preview-pending'};
      }
      assert.equal(request.method,'page.get');
      assert.deepEqual(request.params,{previewId:'pending-page'});
      const receipt={previewId:'pending-page',state:'preview-evaluated',sourceHash:preview.sourceHash,
        target:{...preview.target},result:{resultText:'current Page result'}};
      if(corruption==='sourceHash')receipt.sourceHash='d'.repeat(64);
      if(corruption==='documentId')receipt.target.documentId='other-document';
      if(corruption==='tabId')receipt.target.tabId++;
      if(corruption==='url')receipt.target.url='https://a.example/other';
      if(corruption==='execution error')receipt.error={code:'E_PAGE_SCRIPT_EXECUTION',message:'fixture execution failed'};
      return receipt;
    }});
    await f.select(p.bindings.A);await f.click();
    await until(()=>f.dispatches.length===2,'pending Page preview did not use page.get');
    await f.settle();
    assert.deepEqual(f.dispatches.map(row=>row.method),['page.preview','page.get']);
    assertDispatch(f,p,f.resolutions[0],0,'page-userscript');
    if(corruption==='none'){
      assert.equal(f.find('script-result').textContent,'current Page result');
      assert.equal(f.find('script-copy-result').disabled,false);
      f.setTarget({...availableTarget,documentId:'new-document'});
      assert.equal(f.find('script-copy-result').disabled,true);
      assert.equal(f.find('script-result-kind').textContent,'上次结果已失效');
    }else{
      assert.equal(f.find('script-status').dataset.state,'error');
      assert.match(f.find('script-status').textContent,corruption==='execution error'?/E_PAGE_SCRIPT_EXECUTION/:/E_DEV_HASH/);
      assert.equal(f.find('script-copy-result').disabled,true);
      assert.equal(f.find('script-save').hidden,true);
    }
  });
});

test('managed local Page Stop disposes the original preview and retains its cleanup receipt after Provider disconnect',async t=>{
  const p=await projectFixture(t,'page-userscript',{managed:true});
  let preview;
  const f=await fixture(t,{files:[],projects:p.rows(),connected:true,resolveSource:p.resolve,handle:async request=>{
    if(request.method==='page.preview'){
      preview=request.params;
      assert.equal(preview.managedUI,true,'managedUI must come from the actual resolver bundle');
      return {previewId:'managed-page',state:'preview-evaluated',sourceHash:preview.sourceHash,
        target:preview.target,result:{resultText:'managed Page result'}};
    }
    assert.equal(request.method,'page.dispose');
    assert.deepEqual(request.params,{previewId:'managed-page'});
    return {previewId:'managed-page',sourceHash:preview.sourceHash,state:'preview-retired',
      receipt:{ok:true,scope:'managed-ui-only'}};
  }});
  await f.select(p.bindings.A);await f.click();
  await until(()=>f.dispatches.length===1,'managed Page did not dispatch');await f.settle();
  f.setConnected(false);await f.poll();
  assert.equal(f.find('script-stop').disabled,false,'Provider disconnection must not lose ownership of the mounted UI');
  f.find('script-stop').fire('click',{isTrusted:true});
  await until(()=>f.find('script-result-kind').textContent==='本地 Page · 停止回执','managed Stop did not retain its receipt');
  assert.deepEqual(f.dispatches.map(row=>row.method),['page.preview','page.dispose']);
  assert.equal(f.find('script-copy-result').disabled,false);
  assert.equal(JSON.parse(f.find('script-result').textContent).sourceHash,preview.sourceHash);
  assert.equal(f.find('script-stop').disabled,true);
  assert.deepEqual(f.stops,[]);assert.deepEqual(f.manualRuns,[]);assert.deepEqual(f.opened,[]);
});

test('local Controller Stop goes through the existing Host and never stops a different owner',async t=>{
  const p=await projectFixture(t),completion=deferred();
  t.after(()=>completion.resolve({state:'cancelled'}));
  const f=await fixture(t,{files:[],projects:p.rows(),connected:true,resolveSource:p.resolve,
    handle:async(request,{host})=>{
      assert.equal(request.method,'run.start');
      host.currentRun='owned-local-run';host.completion=completion.promise;
      return {runId:'owned-local-run'};
    }});
  f.host.stop=async request=>{f.stops.push(request);f.host.currentRun=null;completion.resolve({state:'cancelled'});};
  await f.select(p.bindings.A);await f.click();
  await until(()=>!f.find('script-stop').disabled,'local Controller owner was not retained for Stop');
  await f.setCurrentRun('foreign-run');
  f.find('script-stop').fire('click',{isTrusted:true});await tick();
  assert.deepEqual(f.stops,[],'Stop must not affect another Host owner');
  await f.setCurrentRun('owned-local-run');
  f.find('script-stop').fire('click',{isTrusted:true});
  await until(()=>f.stops.length===1,'Controller Stop did not reach its existing Host');await f.settle();
  assert.deepEqual(f.stops,[{runId:'owned-local-run',controller:true}]);
  assert.deepEqual(f.dispatches.map(row=>row.method),['run.start']);
  assert.deepEqual(f.manualRuns,[]);assert.deepEqual(f.opened,[]);
});

for(const targetAvailable of [true,false])for(const slotAvailable of [true,false]){
  test(`file-only workspace never runs or opens files with target=${targetAvailable} and slot=${slotAvailable}`,async t=>{
    const f=await fixture(t,{targetAvailable,slotAvailable});
    assert.equal(f.find('local-project-select').value,'file-workspace:'+workspace.workspaceId);
    assert.equal(f.find('script-run').textContent,'运行本地项目');
    assert.equal(f.find('script-run').disabled,true);
    assert.match(f.find('local-project-status').textContent,/尚未发现可运行入口/);
    assert.equal(f.find('script-save').hidden,true);
    f.find('local-project-params').value='invalid JSON';
    await f.click(false);assert.deepEqual(f.opened,[]);
    await f.click();
    assert.deepEqual(f.opened,[],'Run must never open a file-workspace page');
    assert.deepEqual(f.effects,[],'file metadata cannot authorize capture or dispatch');
    assert.deepEqual(f.manualRuns,[],'local mode must not fall back to the manual draft');
    assert.deepEqual(f.permissions,[],'a file-only row cannot request execution permissions');
    assert.ok(f.requests.every(row=>['status','workspaces.list'].includes(row.method)));
  });
}

test('removed workspace selection cannot fall back to running the manual draft',async t=>{
  const f=await fixture(t);
  f.setFiles([]);await f.refresh();
  assert.equal(f.find('script-run').disabled,true);
  await f.click();
  assert.deepEqual(f.opened,[]);assert.deepEqual(f.effects,[]);
  assert.deepEqual(f.manualRuns,[]);
  assert.deepEqual(f.permissions,[]);
});

test('local Run preserves an active Host run guard',async t=>{
  const f=await fixture(t,{files:[],projects:[program],connected:true});
  await f.setCurrentRun('owned-run');
  assert.equal(f.find('script-run').disabled,true);
  await f.click();assert.deepEqual(f.opened,[]);
  await f.setCurrentRun(null);
  assert.equal(f.find('script-run').disabled,false);
  assert.deepEqual(f.opened,[]);assert.deepEqual(f.manualRuns,[]);
});

test('local Run preserves an in-flight editor load guard',async t=>{
  const f=await fixture(t,{local:false,files:[],projects:[program],connected:true});
  let release;
  f.holdLoad(new Promise(resolve=>{release=resolve;}));
  f.find('script-load').fire('click',{isTrusted:true});await tick();
  await f.setLocal(true);
  assert.equal(f.find('script-run').disabled,true);
  await f.click();assert.deepEqual(f.opened,[]);
  release({scriptId:'manual',revision:1,sourceUtf8:'async function main(){return 2;}'});
  await tick();await tick();
  assert.equal(f.find('script-run').disabled,false);
  assert.deepEqual(f.opened,[]);assert.deepEqual(f.manualRuns,[]);
});

test('runnable program keeps target, slot and Native revocation guards',async t=>{
  const f=await fixture(t,{files:[],projects:[program],connected:true});
  assert.equal(f.find('script-run').textContent,'运行本地项目');
  assert.equal(f.find('script-run').disabled,false);
  assert.equal(f.find('script-save').textContent,'待运行验证');
  f.setTarget({status:'unavailable',reason:'E_TARGET'});
  assert.equal(f.find('script-run').disabled,true);
  f.setTarget(availableTarget);
  assert.equal(f.find('script-run').disabled,false);
  f.setConnected(false);await f.refresh();
  assert.equal(f.find('script-run').disabled,true);
  assert.deepEqual(f.effects,[]);
  const occupied=await fixture(t,{files:[],projects:[program],connected:true,slotAvailable:false});
  assert.equal(occupied.find('script-run').disabled,true);
});

test('local Run stays disabled during refresh and Native disconnect',async t=>{
  const f=await fixture(t,{files:[],projects:[program],connected:true});
  let release;
  f.holdStatus(new Promise(resolve=>{release=resolve;}));
  await f.refresh();
  assert.equal(f.find('script-run').disabled,true);
  await f.click();assert.deepEqual(f.opened,[]);
  release();await tick();await tick();
  assert.equal(f.find('script-run').disabled,false);
  f.setConnected(false);await f.refresh();
  assert.equal(f.find('script-run').disabled,true);
  await f.click();assert.deepEqual(f.opened,[]);
  assert.deepEqual(f.effects,[]);
});

test('current page availability visibly identifies the webpage in every editor mode',async t=>{
  for(const options of [
    {},{files:[],projects:[program],connected:true},{files:[]},
    {local:false},{local:false,framework:'react'},{local:false,framework:'vue'}
  ]){
    const f=await fixture(t,options);
    if(options.framework){
      const input=f.find('page-component-'+options.framework);
      input.checked=true;input.fire('change');
    }
    f.setTarget({...availableTarget});
    assert.equal(f.find('script-current-page-status').textContent,'网页可运行');
    assert.match(f.find('script-current-page-status').title,/目标网页/);
    assert.match(f.find('script-current-page-status').title,/网站授权.*文档身份/);
  }
});
