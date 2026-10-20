import {patchDeveloperField} from './develop-view.js';
import {inspectPageFrameSource} from '../scripting/user-scripts/page-frame-resources.js';
import {permissionPattern} from '../environment.js';
import {requireChromePermissions} from '../platform/chrome/permission-gate.js';
import {dispatchManagedPagePreview,dispatchPageDraftPreview} from './page-preview-dispatch.js';

// Page-only preview workflow. No second source store or RunHost.
export function createPagePreviewFlow({client,api,host,view,currentPageTarget,programSource,
  dependencyResolver,dependencyReview,dependencyInstaller,componentRemote,
  prepareManagedSource,browserCompilerEnabled,browserBinding,state,ui}){
  const find=id=>view.fields[id];
  const pagePreviewStatus=find('page-preview-status');
  const pageTechnicalPanel=find('page-preview-technical-panel'),pageTechnical=find('page-preview-technical');
  const copyResult=find('script-copy-result');
  let busy=false,preparing=false,managed=null,unknown=null,stopping=false;
  // Unknown dispatch/Stop belongs to the original document; never replay.
  function quarantine(target){unknown={tabId:target.tabId,documentId:target.documentId};}
  function canStop(){
    const current=state.currentPage;
    return !!managed&&!unknown&&!state.localActive&&!state.running&&!state.stopping&&!busy&&!host.currentRun&&
      current?.status==='available'&&current.documentId===managed.target.documentId&&
      current.tabId===managed.target.tabId;
  }
  function onTarget(next){
    if(next?.status==='available'&&Number.isSafeInteger(next.tabId)&&
       typeof next.documentId==='string'&&next.documentId){
      if(managed&&managed.target.tabId===next.tabId&&
         managed.target.documentId!==next.documentId)
        managed=null; // The owning tab actually navigated; do not mistake a tab switch for cleanup.
      if(unknown&&
         unknown.tabId===next.tabId&&
         unknown.documentId!==next.documentId){
        unknown=null;
        ui.componentMessage('idle','已确认原标签页的新网页文档；未知结果不会重试，需重新明确点击运行');
      }
      if(managed&&managed.target.tabId!==next.tabId)
        ui.componentMessage('idle','受管组件仍在另一标签页。请返回原网页停止后再切换运行目标。');
    }

  }
  function onTabRemoved(tabId){
    // Closing the exact owning tab proves its document is gone. Merely
    // selecting a different tab is never evidence of successful Stop.
    if(managed?.target.tabId===tabId){
      managed=null;
      ui.componentMessage('idle','原组件所属标签页已关闭；下次运行仍需明确授权');
    }
    if(unknown?.tabId===tabId){
      unknown=null;
    }
    ui.update();
  }

  function run(event) {
    if (!event.isTrusted || state.disposed || state.stopping || busy ||
      componentRemote?.busy || (state.mode==='javascript'&&dependencyResolver?.busy) ||
      (state.mode==='javascript'&&(!dependencyResolver?.sourceFormat&&!dependencyInstaller?.readyForRun)) ||
      state.editingBusy || state.running || host.currentRun) return;
    if(state.localActive)return;
    let captured, permission, pageSource,componentSnapshot,frozenComponent,fixedFrameSource,prepareTicket;
    const runKind=programSource.kind();
    const displayPreview=(stage,message,result)=>{
      if(state.disposed)return;
      patchDeveloperField(view,pagePreviewStatus,{data:{...pagePreviewStatus.data,state:stage},textContent:message});
      ui.display(stage,message);
      if(stage==='error' && message.startsWith('E_USER_SCRIPTS_UNAVAILABLE')) ui.showRecovery();
      else if(stage==='error' && message.startsWith('E_USER_SCRIPTS_NATIVE')) ui.showRecovery('error', message);
      else if(stage==='completed') ui.hideRecovery();
      ui.setResultText(stage==='running'?'正在运行…':stage==='error'?'本次网页试运行失败，未产生可显示的返回值':result??'undefined');
      ui.setResultKind(stage==='completed'?'网页试运行结果':stage==='error'?'网页试运行失败':'等待网页返回值');
      patchDeveloperField(view,copyResult,{disabled:stage!=='completed'});
      patchDeveloperField(view,find('developer-results-panel'),{open:true});
    };
    try {
      captured=currentPageTarget.capture();
      if (programSource.kind() === 'controller') throw {code:'E_PROGRAM_KIND',message:'这是 Controller 项目，请使用「运行」'};
      const artifact=programSource.snapshot();
      if(state.mode!=='javascript'&&!artifact){
        if(!browserCompilerEnabled)throw {code:'E_PAGE_COMPILER_UNAVAILABLE',
          message:'标准版不附带浏览器 JSX/SFC 编译器；请使用本地开发工具或独立 Developer Edition'};
        componentSnapshot={framework:state.mode,source:programSource.source()};
        if(!componentSnapshot.source.trim())throw {code:'E_SOURCE',message:'请输入组件源码'};
      }else{
        pageSource=dependencyResolver.captureForRun();
        if(!pageSource.sourceUtf8.trim())throw {code:'E_SOURCE',message:'请输入 JavaScript 源码'};
        if(artifact?.project.entryMode==='component'){
          const framework=/^\/\/ @opendesk-lib (react|vue)\s*$/m.exec(pageSource.sourceUtf8)?.[1];
          if(!framework)throw {code:'E_PROGRAM_DRAFT',message:'固定组件缺少唯一框架身份'};
          frozenComponent={framework,source:pageSource.sourceUtf8,sourceHash:artifact.build.sourceHash,projectId:artifact.project.id};
        }else if(state.loadedPageSource||!pageSource.sourceFormat&&inspectPageFrameSource(pageSource.sourceUtf8)?.resources.length){
          // Explicitly loaded Page bytes keep their Page world and managed
          // lifecycle; reopening a frozen Vue/React version needs no compiler.
          // Fixed child resources need the same host-owned lifecycle as a
          // component, but their verified JavaScript is never recompiled.
          fixedFrameSource={source:pageSource.sourceUtf8};
        }
      }
      if((componentSnapshot||frozenComponent||fixedFrameSource)&&(!!unknown||managed?.recoveredOnly))
        throw {code:'E_EFFECT_UNKNOWN',message:'上次受管运行仍需清理；已查询到的原回执只用于停止，不会自动重新运行'};
      // Source permission is requested synchronously from this trusted Run
      // gesture if the editor has already observed a missing Chrome grant.
      // Website permission remains independently read-only/Authority gated.
      permission=Promise.all([
        requireChromePermissions({api,request:{origins:[permissionPattern(captured.url)]}}),
        state.mode==='javascript'?
          (dependencyResolver.sourceFormat?dependencyReview.confirmRun(event):dependencyInstaller.confirmRun(event)):
          componentSnapshot?componentRemote.confirmRun(event,{
            componentSource:componentSnapshot.source,framework:componentSnapshot.framework}):Promise.resolve(true)
      ]);
    } catch(error) {displayPreview('error',(error.code||'E_SOURCE')+'：'+(error.message||error));return;}
    const managedInput=componentSnapshot||frozenComponent||fixedFrameSource;
    prepareTicket=state.nextTicket();
    if(managedInput)preparing=true;
    const assertPreparation=()=>{
      if(state.disposed||prepareTicket!==state.ticket)
        throw {code:'E_PAGE_COMPILER_STALE',message:'组件准备已取消；迟到结果不会运行'};
      if(programSource.source()!==managedInput.source||componentSnapshot&&state.mode!==componentSnapshot.framework)
        throw {code:'E_PAGE_COMPILER_STALE',message:'组件源码或框架已变化；旧结果不会运行'};
      if(fixedFrameSource&&(state.mode!=='javascript'||programSource.kind()!==runKind))
        throw {code:'E_DEPENDENCY_STALE',message:'网页草稿或运行模式已变化；不会执行旧代码'};
    };
    state.last=null;busy=true;ui.update();patchDeveloperField(view,pageTechnicalPanel,{hidden:true});patchDeveloperField(view,pageTechnical,{textContent:''});
    displayPreview('running','正在核对当前文档与固定源码…','');
    (async()=>{
      await permission;
      if(state.disposed)throw {code:'E_HOST_CLOSED',message:'工作台已关闭'};
      if(managedInput)assertPreparation();
      await currentPageTarget.revalidate(captured);
      if(managedInput){
        assertPreparation();
        const {result,built,previous}=await dispatchManagedPagePreview({
          client,currentPageTarget,dependencyResolver,prepareManagedSource,
          captured,pageSource,managedInput,fixedFrameSource,
          frozen:!!frozenComponent||!!fixedFrameSource,entryFormat:pageSource?.entryFormat,
          bindingId:browserBinding,check:assertPreparation,
          onPrepared:()=>{preparing=false;ui.update();},
          onOwner:identity=>{managed=identity;},
          onUnknown:quarantine,
          onRecovered:(identity,observed)=>{
            managed=identity;unknown=null;
            patchDeveloperField(view,pageTechnicalPanel,{hidden:false});
            patchDeveloperField(view,pageTechnical,{textContent:JSON.stringify({originalPreview:observed},null,2)});
          }
        });
        state.last={...previous,componentMode:state.mode};
        const editorChanged=!ui.matches(state.last);
        if(!fixedFrameSource)ui.componentMessage('completed',editorChanged?'旧源码已运行，但编辑内容已变化；先停止旧组件，再运行最新源码':
          '组件已运行 · 可停止或保存固定版本 · 保存不会自动运行或安装');
        displayPreview('completed',fixedFrameSource?
          '当前精确文档试运行完成；不是正式 Task 结果。可保存待验证 Page 候选；不会自动安装。':
          '组件已在当前网页运行；停止可清理受管 UI。可保存固定版本并单独审阅安装。',result.resultText ?? 'undefined');
        patchDeveloperField(view,pageTechnicalPanel,{hidden:false});
        patchDeveloperField(view,pageTechnicalPanel,{open:false});
        patchDeveloperField(view,pageTechnical,{textContent:JSON.stringify({...result,authoring:{framework:built.framework,
          compilerVersion:built.compilerVersion,sourceHash:built.sourceHash,cacheHit:built.cacheHit,
          prepareMs:built.prepareMs,remoteModules:built.remoteModules||[]}},null,2)});
        return;
      }
      const checkPage=()=>{if(state.disposed||prepareTicket!==state.ticket)
        throw {code:'E_DEPENDENCY_STALE',message:'网页草稿已变化或准备取消；不会执行旧代码'};};
      const {result,pageSource:readySource,previous}=await dispatchPageDraftPreview({
        client,currentPageTarget,dependencyResolver,captured,pageSource,check:checkPage,
        isCompiledCurrent:()=>!state.disposed&&programSource.source()===pageSource.sourceUtf8&&
          programSource.kind()===runKind&&state.mode==='javascript'&&!state.localActive
      });
      state.last=previous;
      displayPreview('completed',readySource.sourceFormat?
        '当前精确文档试运行完成；可保存作者 import 源码、批准依赖锁与固定编译产物。保存不会自动安装。':
        '当前精确文档试运行完成；不是正式 Task 结果。可保存待验证 Page 候选；不会自动安装。',
        result.resultText ?? 'undefined');
      patchDeveloperField(view,pageTechnicalPanel,{hidden:false});
      patchDeveloperField(view,pageTechnicalPanel,{open:false});
      patchDeveloperField(view,pageTechnical,{textContent:JSON.stringify(result,null,2)});
    })().catch(error=>{
      const recovered=error.previewRecovered?'；已读取原完成回执，可以停止原组件。未重放运行。':'';
      displayPreview('error',(error.code||'E_PAGE_SCRIPT_EXECUTION')+'：'+(error.message||error)+recovered,'');
      if(componentSnapshot||frozenComponent)ui.componentMessage('error',(error.code||'E_PAGE_COMPILER')+'：'+(error.message||error)+recovered);
      if(error.response?.state==='preview-failed'){
        patchDeveloperField(view,pageTechnicalPanel,{hidden:false});patchDeveloperField(view,pageTechnicalPanel,{open:false});patchDeveloperField(view,pageTechnical,{textContent:JSON.stringify(error.response,null,2)});
      }
    }).finally(()=>{preparing=false;busy=false;ui.update();});
  }
  async function stop(){
    if(!canStop()||state.stopping)return;
      const owned=managed;stopping=true;ui.update();
      ui.display('stopping','正在清理受管页面组件…');
      try{
        const result=await client.request('retirePagePreview',{previewId:owned.previewId});
        if(result.state!=='preview-retired'||result.sourceHash!==owned.sourceHash||
          result.receipt?.ok!==true||result.receipt.scope!=='managed-ui-only')
          throw {code:'E_UI_CLEANUP_FAILED',message:'没有收到可信的组件停止回执'};
        if(managed===owned)managed=null;
        ui.componentMessage('completed','已停止 · 受管组件和样式已清理');
        if(!state.disposed)patchDeveloperField(view,pagePreviewStatus,{data:{...pagePreviewStatus.data,state:'completed'},textContent:'已停止 · 受管组件和样式已清理'});
        patchDeveloperField(view,pageTechnicalPanel,{hidden:false});patchDeveloperField(view,pageTechnicalPanel,{open:false});
        patchDeveloperField(view,pageTechnical,{textContent:JSON.stringify({stop:result,framework:owned.framework},null,2)});
        ui.display('completed','受管组件已清理；网页业务效果不会回滚。');
      }catch(error){
        if(error?.code==='E_DEV_RELOADING'){
          // Dispatch was explicitly rejected; retain the original Stop right.
          ui.display('blocked','源码更新暂缓了停止请求；原组件仍可停止，请稍后重试。');
          return;
        }
        quarantine(owned.target); // Uncertain Stop is document-bound; never blindly retry.
        ui.componentMessage('error',(error.code||'E_UI_CLEANUP')+'：'+error.message+
          '；无法确认组件已清理，请重新加载目标网页');
        if(!state.disposed)patchDeveloperField(view,pagePreviewStatus,{data:{...pagePreviewStatus.data,state:'error'},textContent:'无法确认组件已清理，请重新加载目标网页'});
        patchDeveloperField(view,pageTechnicalPanel,{hidden:false,open:false});
        patchDeveloperField(view,pageTechnical,{textContent:JSON.stringify({error:{
          code:error.code||'E_UI_CLEANUP',message:error.message||String(error)}},null,2)});
        throw error;
      }
      finally{stopping=false;ui.update();}
      return;
  }
  return Object.freeze({run,stop,canStop,onTarget,onTabRemoved,
    cancelPreparation(){preparing=false;},
    get busy(){return busy;},get preparing(){return preparing;},
    get managed(){return managed;},get unknown(){return unknown;},get stopping(){return stopping;}});

}
