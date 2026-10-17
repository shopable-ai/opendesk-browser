// R2.6 read-only local install discovery and Controller proof recovery.
// Simulated DOM/RPC ledgers are unit tests, not Native/Chrome E2E.
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {sha256Utf8} from '../../src/scripting/user-scripts/page-program-package.js';
import {createLocalInstallUI} from '../../src/ui/local-project-install-ui.js';
import {sourceContract,localProjectInstallId} from '../../src/ui/local-project-install.js';
globalThis.crypto ||= webcrypto;
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
class Node {
  constructor(){this.hidden=true;this.disabled=false;this.readOnly=false;
    this.textContent='';this.value='';this.dataset={};this.listeners=new Map();}
  addEventListener(k,fn){this.listeners.set(k,fn);}
  removeEventListener(k){this.listeners.delete(k);}
  focus(){}
  scrollIntoView(){}
}
const ids=['local-install-review','local-install-summary','local-install-title',
  'local-install-version','local-install-warning','local-install-status',
  'local-install-confirm','local-install-cancel'];
async function fixture({kind='controller',offline=false,withProof=false,installed=false,withPending=false}={}){
  const nodes=Object.fromEntries(ids.map(id=>[id,new Node()]));
  const doc={getElementById:id=>nodes[id]};
  const binding={bindingId:'local-'+'a'.repeat(20),providerEpoch:'provider-A',generation:1};
  const projectSourceId='provider-source-A';
  const target={status:'available',tabId:11,windowId:3,frameId:0,
    documentId:'document-one',url:'https://example.com/form'};
  const utf8=kind==='controller'?'async function main(){return await page.title();}':
    'async function main(){document.title="Preview";}';
  const source={bindingId:binding.bindingId,projectId:'project-A',runtimeKind:kind,
    sourceUtf8:utf8,sourceHash:await sha256Utf8(utf8),inputHash:'b'.repeat(64),
    sourceBytes:new TextEncoder().encode(utf8).length,entryFormat:'async-main',
    siteOrigins:['https://example.com']};
  const id=await localProjectInstallId({binding,project:{sourceId:projectSourceId},source});
  const runId='saved-run-1',resultId='saved-result-1';
  const proof={kind,bindingId:binding.bindingId,sourceId:projectSourceId,
    providerEpoch:binding.providerEpoch,projectId:source.projectId,
    sourceHash:source.sourceHash,inputHash:source.inputHash,sourceBytes:source.sourceBytes,
    sourceContract:sourceContract(source),target,runId,resultId};
  let rememberedProof=withProof?structuredClone(proof):null;
  let installHint={kind,id,bindingId:binding.bindingId,sourceId:projectSourceId};
  let pending=withPending?{kind,id,bindingId:binding.bindingId,
    projectSourceId,attemptedVersion:'1.0.0',installedHash:null,
    attemptedManifestHash:'d'.repeat(64),sourceHash:source.sourceHash,
    siteOrigins:['https://example.com']}:null;
  let online=!offline,selectedBinding=binding.bindingId,prepared='preparation-A',
    currentTarget=target,sourceNow=source,seenRuns=0;
  const requests=[];
  const installedRow=installed?{taskId:id,version:'1.0.0',manifestHash:'d'.repeat(64)}:null;
  const client={request:async(method)=>{
    requests.push(method);
    if(method==='listTaskCatalog')return {catalog:installedRow?[{
      ...installedRow,stage:'available',manifest:{program:{sourceHash:source.sourceHash},
        siteOrigins:['https://example.com']}}]:[],installed:installedRow?[installedRow]:[]};
    if(method==='listPagePrograms')return {catalog:installed?[
      {programId:id,revision:1,installed:{programId:id,revision:1,
        manifestHash:'d'.repeat(64),sourceHash:source.sourceHash,nativeState:'registered'}}]:[]};
    throw Error('Unexpected mutating request '+method);
  }};
  const events={addListener(){},removeListener(){}};
  const api={permissions:{onAdded:events,onRemoved:events,
    contains:async()=>true,request:async()=>true}};
  const project={
    active:()=>true,connected:()=>online,selectedBindingId:()=>selectedBinding,
    providerEpoch:()=>online?binding.providerEpoch:null,
    preparationIdentity:()=>prepared,
    selectedProject:()=>({name:'Local Project',sourceId:projectSourceId,runtimeKind:kind}),
    previousVerification:()=>rememberedProof,
    rememberVerification:proof=>{rememberedProof=proof;},
    previousInstallation:()=>installHint,
    rememberInstallation:ref=>{installHint=ref;},
    previousInstallAttempt:()=>pending,
    rememberInstallAttempt:value=>{pending=value;},
    capture:()=>({...binding}),resolve:async()=>structuredClone(sourceNow),
    assertCaptured:()=>{}
  };
  const targetService={get snapshot(){return currentTarget;},
    revalidate:async saved=>{if(saved.documentId!==currentTarget.documentId)
      throw Object.assign(new Error('stale document'),{code:'E_DOCUMENT_STALE'});}};
  const installedNotices=[];
  const ui=createLocalInstallUI({client,api,doc,currentPageTarget:targetService,
    getProject:()=>project,readControllerRun:async({runId:requested})=>{
      seenRuns++;
      assert.equal(requested,runId);
      return {runs:[{runId,state:'completed',retirementState:'released',
        resultId,target:{mode:'borrowed',tabId:target.tabId,frameId:target.frameId,
          documentId:target.documentId,url:target.url,windowId:target.windowId},
        revision:{sourceHash:source.sourceHash}}],
        results:[{runId,resultId,state:'completed',revision:{sourceHash:source.sourceHash},
          outcome:{ok:true}}]};
    }});
  ui.setOnInstalled(row=>installedNotices.push(row));
  return {ui,project,source,binding,target,requests,installedNotices,nodes,
    get reads(){return seenRuns;},
    setOnline:v=>{online=v;},setBinding:v=>{selectedBinding=v;},
    setTarget:v=>{currentTarget=v;},setSource:v=>{sourceNow=v;},
    setProof:v=>{rememberedProof=v;},dispose:()=>ui.dispose()};
}
async function settle(){for(let i=0;i<8;i++)await tick();}
test('选中但未运行时安装入口存在，弹出阻塞理由不发起安装',async t=>{
  const f=await fixture();t.after(f.dispose);f.ui.update();await settle();
  assert.equal(f.ui.hasSelection(),true);
  assert.equal(f.ui.canSave(),false);
  assert.equal(f.ui.saveLabel(),'保存为任务');
  await f.ui.prepare();
  assert.equal(f.nodes['local-install-review'].hidden,false);
  assert.equal(f.nodes['local-install-confirm'].disabled,true);
  assert.equal(f.requests.every(x=>x==='listTaskCatalog'),true);
});
test('Controller 只有核对原 runId/resultId、源码及文档才能恢复',async t=>{
  const f=await fixture({withProof:true});t.after(f.dispose);
  f.ui.update();await settle();
  assert.equal(f.reads,1);
  assert.equal(f.ui.canSave(),true);
  assert.equal(f.ui.saveLabel(),'保存为任务');
  assert.equal(f.requests.some(x=>/^(verify|import|install|run|preview)/i.test(x)),false);
});
test('导航后旧证明不可恢复，不能借由回到侧边栏安装',async t=>{
  const f=await fixture({withProof:true});t.after(f.dispose);
  f.setTarget({...f.target,documentId:'document-two'});
  f.ui.update();await settle();
  assert.equal(f.ui.canSave(),false);
  assert.equal(f.reads,0);
});
test('改源码后恢复查询拒绝旧证明，安装入口不消失',async t=>{
  const f=await fixture({withProof:true});t.after(f.dispose);
  const utf8=f.source.sourceUtf8+' // edited';
  f.setSource({...f.source,sourceUtf8:utf8,
    sourceHash:await sha256Utf8(utf8),sourceBytes:new TextEncoder().encode(utf8).length});
  f.ui.update();await settle();
  assert.equal(f.ui.hasSelection(),true);
  assert.equal(f.ui.canSave(),false);
  assert.equal(f.reads,0);
});
test('Provider 离线仍可从正式 Task 目录管理已安装项目',async t=>{
  const f=await fixture({offline:true,installed:true});t.after(f.dispose);
  f.ui.update();await settle();
  assert.equal(f.ui.saveLabel(),'管理已安装');
  await f.ui.prepare();
  assert.equal(f.installedNotices.length,1);
  assert.equal(f.installedNotices[0].kind,'controller');
  assert.equal(f.requests.every(x=>x==='listTaskCatalog'),true);
});
test('Page 不能从 Controller 运行证明伪造跨会话 Page 验证',async t=>{
  const f=await fixture({kind:'page-userscript',withProof:true});t.after(f.dispose);
  f.ui.update();await settle();
  assert.equal(f.ui.canSave(),false);
  assert.equal(f.reads,0);
  assert.equal(f.ui.saveLabel(),'安装网页增强');
});
test('切换项目绑定后不能继续使用上一项目的证明',async t=>{
  const f=await fixture({withProof:true});t.after(f.dispose);
  f.setBinding('local-'+'c'.repeat(20));
  f.ui.update();await settle();
  assert.equal(f.ui.canSave(),false);
  assert.equal(f.reads,0);
});

test('安装回执未知的历史提示只能触发只读对账，不能重复导入安装',async t=>{
  const f=await fixture({withProof:true,withPending:true});t.after(f.dispose);
  f.ui.update();await settle();
  assert.equal(f.ui.saveLabel(),'核对安装状态');
  await f.ui.prepare();await settle();
  assert.equal(f.installedNotices.length,0);
  assert.equal(f.ui.saveLabel(),'核对安装状态');
  assert.equal(f.requests.every(x=>x==='listTaskCatalog'),true);
});
test('对账确认原已安装版本后才恢复管理，并清理未知指针',async t=>{
  const f=await fixture({withPending:true,installed:true});t.after(f.dispose);
  f.ui.update();await settle();
  assert.equal(f.ui.saveLabel(),'核对安装状态');
  await f.ui.prepare();await settle();
  assert.equal(f.installedNotices.length,1);
  assert.equal(f.ui.saveLabel(),'管理已安装');
  assert.equal(f.requests.every(x=>x==='listTaskCatalog'),true);
});
