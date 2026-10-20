import {patchDeveloperField} from './develop-view.js';
import {permissionPattern} from '../environment.js';
import {digestUtf8} from '../platform/protocol.js';
import {parseUserScriptDependencies} from '../scripting/user-scripts/dependency-metadata.js';
import {parseControllerClassicDependencies} from '../scripting/user-scripts/controller-classic.js';
import {hasUnbuiltESM} from './esm-source-detector.js';
import {requireChromePermissions} from '../platform/chrome/permission-gate.js';

// Runs only the current Controller draft; it never saves, installs, or selects a revision.
export const controllerESMInput=(source,id)=>({componentSource:source,framework:'controller',programId:id});
export function createControllerDraftRun({api,host,currentPageTarget,programSource,view,
  componentRemote,browserPreparer,controllerClassic,controllerResults,getRevisions,
  browserCompilerEnabled,isDisposed,isBlocked,isControllerDraft,getRunning,setRunning,
  isStopping,setStopping,display,fail,hideUserScriptsRecovery,beginResult,update}){
  const find=id=>view.fields[id],scriptId=()=>find('script-id').value.trim();
  let generation=0,preparing=false,ownedRunId=null;
  function captureCurrentPage(){
    if(!currentPageTarget)throw {code:'E_TARGET',message:'当前网页服务不可用'};
    // Preserve the single exact-document CurrentPageTarget handoff to the existing RunHost.
    const candidate=currentPageTarget.capture();
    return {target:{mode:'borrowed',tabId:candidate.tabId,frameId:0,
      documentId:candidate.documentId,expectedUrl:candidate.url,expectedWindowId:candidate.windowId},
      url:candidate.url,candidate};
  }
 
  async function prepareControllerESM(source,id,check){
    if(!browserCompilerEnabled)
      throw {code:'E_ESM_BUILD_REQUIRED',message:'Standard Edition 不包含浏览器编译器；请使用本地 ESM 项目构建，或安装 Developer Edition。'};
    const input=controllerESMInput(source,id);
    try{
      const remoteSnapshot=await componentRemote.autoLoadForRun(input,check);check();
      const built=await browserPreparer.prepare({...input,projectId:'browser-controller',remoteSnapshot});check();
      if(built.authoringSourceHash!==await digestUtf8(source)||built.framework!=='controller')
        throw {code:'E_CONTROLLER_ESM_HASH',message:'编译产物未绑定当前 Controller 源码'};
      return {built,lockId:remoteSnapshot?.lockId??null};
    }finally{componentRemote.resumeRunPermissionWarm();}

  }
  function run(event) {
    if (!event?.isTrusted || isDisposed() || getRunning() || isBlocked() || host.currentRun || !controllerResults.projection?.slotAvailable) return;
    let chosen, params, permission, sourceUtf8,esm,classic;
    const runKind=programSource.kind();
    try {
      // Freeze exact editor bytes, params and target inside the trusted click
      // before any asynchronous permission check or other work.
      chosen = captureCurrentPage(); params = JSON.parse(find('script-params').value);
      sourceUtf8 = programSource.source();
      if (programSource.kind() === 'page-userscript') throw {code:'E_PROGRAM_KIND',message:'这是网页 JavaScript 项目，请使用“在当前网页试运行”'};
      if (!sourceUtf8.trim()) throw {code:'E_SCHEMA',message:'请先输入草稿源码'};
      if (parseUserScriptDependencies(sourceUtf8).hasHeader) throw {code:'E_PROGRAM_KIND',
        message:'当前源码含兼容性脚本声明，请使用“网页 JavaScript 试运行”；自动化任务运行不解析旧格式声明。'};
      // Browser Controller always uses the pinned Controller ESM graph/linker.
      // The Page leaf-ESM resolver has a different world and is not a fallback.
      esm=hasUnbuiltESM(sourceUtf8);
      classic=parseControllerClassicDependencies(sourceUtf8).length>0;
      if(esm&&classic)throw {code:'E_CONTROLLER_CLASSIC_FORMAT',message:'Controller 不能同时使用 ESM import 与 Classic 声明'};
      permission=Promise.all([
        requireChromePermissions({api,request:{origins:[permissionPattern(chosen.url)],
          ...(find('script-allow-cookies').checked?{permissions:['cookies']}:{} )}}),
        esm&&browserCompilerEnabled?
          componentRemote.confirmRun(event,controllerESMInput(sourceUtf8,scriptId())):Promise.resolve(true),
        classic?controllerClassic.confirmRun(event,sourceUtf8):Promise.resolve(true)
      ]);
    } catch (error) { fail(error); return; }
    hideUserScriptsRecovery();
    let startError, admittedRunId;
    const id=scriptId(),ticket=++generation;
    ownedRunId=null;setRunning(true);preparing=esm||classic;controllerResults.renderTask(null);update();beginResult();
    display('checking',esm?'正在校验固定 ESM 依赖并编译 Controller 源码…':
      classic?'正在从 SHA 缓存准备固定 Controller Classic 库…':`正在检查访问权限并验证网页：${chosen.url}`);
    (async () => {
      await permission;
      if (isDisposed()) throw {code:'E_HOST_CLOSED',message:'Sidebar 已关闭，未启动任务'};
      await currentPageTarget.revalidate(chosen.candidate);
      // Preserve the original trusted-click author snapshot while compiling.
      // Authority still receives the exact `sourceUtf8` that will execute, via
      // the same draft admission, immutable revision hash and original RunHost.
      const authorSourceUtf8=sourceUtf8;
      if(esm){
        const check=()=>{if(isDisposed()||ticket!==generation||
          programSource.source()!==authorSourceUtf8||scriptId()!==id||
          programSource.kind()!==runKind||componentMode!=='javascript'||
          localProject?.active())
          throw {code:'E_CONTROLLER_ESM_STALE',message:'源码、程序、目标或运行模式已变化；不会启动过期代码'};};
        const prepared=await prepareControllerESM(authorSourceUtf8,id,check);check();
        sourceUtf8=getRevisions().savedControllerSource(authorSourceUtf8,prepared.built.sourceUtf8);
        preparing=false;update();
      }else if(classic){
        const check=()=>{if(isDisposed()||ticket!==generation||programSource.source()!==authorSourceUtf8||scriptId()!==id||!isControllerDraft())
          throw {code:'E_CONTROLLER_CLASSIC_STALE',message:'源码已变化或准备已取消，不启动过期 Classic'};};
        const prepared=await client.request('prepareControllerClassicDependencies',{
          programId:id,sourceUtf8:authorSourceUtf8,explicitUserAction:true,allowDownload:true});check();
        if(prepared.world!=='CONTROLLER'||prepared.programId!==id||
          prepared.authorSourceHash!==await digestUtf8(authorSourceUtf8)||
          !/^controller-classic-[a-f0-9]{64}$/.test(prepared.lockId))
          throw {code:'E_CONTROLLER_CLASSIC_LOCK',message:'固定 Classic 版本或技术锁无效'};
        sourceUtf8=getRevisions().savedControllerSource(authorSourceUtf8,prepared.sourceUtf8);
        preparing=false;update();
      }
      const claim = await host.start({source:{kind:'draft',sourceUtf8},
        params, target:chosen.target, deadlineAt:Date.now() + 30000});
      admittedRunId = claim.runId;
      ownedRunId = claim.runId;
      if (isDisposed()) return;
      patchDeveloperField(view,find('script-run-id'),{value:claim.runId});
      controllerResults.renderTask(claim);
      display('running', '已接受冻结草稿；等待脚本结束及持久结果');
      update();
      const result = await host.completion;
      if (result.error) throw result.error;
    })().catch(error => {startError=error;admittedRunId ||= error.runId;fail(error);}).finally(async () => {
      setRunning(false);preparing=false;
      if (isDisposed()) return;
      if (admittedRunId) patchDeveloperField(view,find('script-run-id'),{value:admittedRunId});
      // Observe all durable history; association comes from the admitted run,
      // never from an editable runId or the editor's current revision.
      try {await controllerResults.read('');}
      catch (error) {controllerResults.clearProjection();display('unknown',`后台状态待确认：${error.code || 'E_EFFECT_UNKNOWN'}`);}
      if (startError) fail(startError);
      update();
    });
  }

  async function stop(){
    if(!ownedRunId||host.currentRun!==ownedRunId||isStopping())return;
    setStopping(true);display('stopping','正在提交停止并等待持久收尾…');
    try{await host.stop({runId:ownedRunId,controller:true});}
    finally{setStopping(false);}
  }
  return Object.freeze({run,stop,prepareESM:prepareControllerESM,
    invalidate(){generation++;},
    get preparing(){return preparing;},
    get ownedRunId(){return ownedRunId;},
    dispose(){generation++;}});
}
