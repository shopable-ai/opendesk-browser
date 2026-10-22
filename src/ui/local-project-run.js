import {patchDeveloperField} from './develop-view.js';
import {permissionPattern} from '../environment.js';
import {requireChromePermissions} from '../platform/chrome/permission-gate.js';
import {localProjectAllowsOrigin} from '../platform/local-project-site-scope.js';
import {validateTaskParams} from '../platform/tasks/contract.js';
import {formatTaskError} from './task-run-diagnostics.js';

// Owns Local Controller/Page execution, provider-bound preview receipts, and
// original-page cleanup. The Native adapter and RunHost are existing authorities.
export function createLocalProjectRun({api,host,view,currentPageTarget,localProject,localAdapter,
  localInstaller,controllerResults,getCurrentPageState,isDisposed,isBlocked,
  display,fail,hideUserScriptsRecovery,beginResult,update,
  setResultText,setResultKind}){
  const find=id=>view.fields[id],copyResult=find('script-copy-result');
  const pageTechnicalPanel=find('page-preview-technical-panel'),pageTechnical=find('page-preview-technical');
  let ownedRunId=null,ownedRunBinding=null,ownedManagedPreview=null,localPageResult=null,localPollTimer=null,finishLocalPoll=null,running=false,stopping=false,pageWait=null;
  function canStopWaiting(){return !!pageWait&&!pageWait.detached&&!isDisposed();}
  function stopWaiting(){
    if(!canStopWaiting())return;
    pageWait.detached=true;localPageResult=null;localInstaller.reset();
    const message='已停止等待。网页中的代码可能仍在执行，已产生的效果不会撤销。请等待原执行结束，或重新加载网页。';
    setResultText(message);setResultKind('本地 Page · 已停止等待');display('unknown',message);
    patchDeveloperField(view,copyResult,{disabled:true});update();
  }
  async function retireLocalPreviewForInstall({source,binding,target,previewId}) {
    const owned=ownedManagedPreview;
    if(!owned||owned.previewId!==previewId||owned.sourceHash!==source.sourceHash||
      owned.bindingId!==binding.bindingId||['tabId','windowId','documentId','url'].some(key=>owned.target[key]!==target[key]))
      throw {code:'E_DEV_CONFLICT',message:'本次验证的原受管预览所有权已变化'};
    stopping=true;update();
    try {
      const result=await localAdapter.handle({method:'page.dispose',requestId:crypto.randomUUID(),params:{previewId:owned.previewId}});
      if(result?.previewId!==owned.previewId||result.sourceHash!==owned.sourceHash||result.state!=='preview-retired'||
        result.receipt?.ok!==true||result.receipt.scope!=='managed-ui-only')
        throw {code:'E_EFFECT_UNKNOWN',message:'原受管预览清理回执未确认'};
      if(ownedManagedPreview!==owned)throw {code:'E_DEV_CONFLICT',message:'清理期间预览所有权变化'};
      ownedManagedPreview=null;return result;
    } finally {stopping=false;update();}
  }

  function canStopManaged(){
    const currentPageState=getCurrentPageState();
    if(!ownedManagedPreview||!localProject.active()||running||isBlocked()||
      host.currentRun||!controllerResults.projection?.slotAvailable)return false;
    return localProject.selectedBindingId()===ownedManagedPreview.bindingId&&
      currentPageState?.status==='available'&&currentPageState.documentId===ownedManagedPreview.target.documentId&&
      currentPageState.tabId===ownedManagedPreview.target.tabId;
  }
  function pageResultIsCurrent({allowResolving=false}={}) {
    const currentPageState=getCurrentPageState();
    return !!localPageResult&&!!localProject?.active()&&
      localPageResult.bindingId===localProject.selectedBindingId()&&
      (localPageResult.kind==='stop'||
       localPageResult.providerEpoch===localProject.providerEpoch()&&localProject.connected())&&
      (allowResolving&&currentPageState?.status==='resolving'||
       currentPageState?.status==='available'&&
       localPageResult.tabId===currentPageState.tabId&&
       localPageResult.documentId===currentPageState.documentId&&
       localPageResult.url===currentPageState.url);
  }

  function refreshResultValidity(){
    if(pageWait&&(!localProject.active()||localProject.selectedBindingId()!==pageWait.binding.bindingId||
      localProject.providerEpoch()!==pageWait.binding.providerEpoch||
      getCurrentPageState()?.status==='available'&&
      (getCurrentPageState().tabId!==pageWait.target.tabId||getCurrentPageState().documentId!==pageWait.target.documentId)))
      pageWait.detached=true;
    if(ownedRunBinding&&host.currentRun===ownedRunId&&!stopping&&
      (!localProject.active()||localProject.selectedBindingId()!==ownedRunBinding.bindingId||
       localProject.providerEpoch()!==ownedRunBinding.providerEpoch)){
      localInstaller.reset();
      // Stop only this owner's original run. Source preparation can change
      // independently without invalidating an already frozen execution.
      void stopController().catch(error=>{if(!isDisposed())fail(error);});
    }
    if(localPageResult&&!pageResultIsCurrent({allowResolving:true})){
      localPageResult=null;
      setResultText('上次本地 Page 结果对应的项目、连接或网页已变化；请重新运行。');
      setResultKind('上次结果已失效');patchDeveloperField(view,copyResult,{disabled:true});
      display('unknown','上次本地 Page 结果已失效，不能用于验证或安装当前源码');
    }
    if(localPageResult)patchDeveloperField(view,copyResult,{disabled:!pageResultIsCurrent()});
  }
  function run(event){
    if(!event.isTrusted||running||isBlocked()||!localAdapter||!controllerResults.projection?.slotAvailable||!localProject.canAttemptRun()||getCurrentPageState()?.status!=='available')return;
    let captured,binding,paramsText,permission;
    try{
      binding=localProject.capture();captured=currentPageTarget.capture();paramsText=find('local-project-params').value;
      permission=requireChromePermissions({api,request:{origins:[permissionPattern(captured.url)],...(find('script-allow-cookies').checked?{permissions:['cookies']}:{})}});
    }catch(error){fail(error);return;}
    hideUserScriptsRecovery();
    let admittedRunId,page=false,startError,attempt;
    ownedRunId=null;ownedRunBinding=null;localPageResult=null;localInstaller.reset();running=true;controllerResults.renderTask(null);update();beginResult();
    patchDeveloperField(view,find('developer-results-panel'),{open:true});display('resolving','正在读取本地项目的当前源码…');
    (async()=>{
      await permission;
      if(isDisposed())throw {code:'E_HOST_CLOSED',message:'Sidebar 已关闭，本次未运行'};
      const source=await localProject.resolve(binding);
      await currentPageTarget.revalidate(captured);await localProject.assertReady(binding,source.sourceHash);
      const preparationIdentity=localProject.preparationIdentity();
      page=source.runtimeKind==='page-userscript';
      const params=page?{}:JSON.parse(paramsText);
      if(!localProjectAllowsOrigin(source,captured.origin))throw {code:'E_DEV_ORIGIN',message:'当前网站不在本地项目的允许范围内；请检查项目 siteOrigins（所有网页使用 ["<all_urls>"]）'};
      if(!page&&source.paramsSchema)validateTaskParams(source.paramsSchema,params);
      const {status:ignored,...target}=captured;
      const claim=await localAdapter.handle({method:page?'page.preview':'run.start',requestId:crypto.randomUUID(),params:{
        sourceHash:source.sourceHash,sourceBytes:source.sourceBytes,target,
          ...(page?{sourceUtf8:source.sourceUtf8,entryFormat:source.entryFormat,bindingId:source.bindingId,...(source.managedUI?{managedUI:true}:{}),...(source.pageRules?{pageRules:source.pageRules}:{})}:
          {source:{kind:'draft',sourceUtf8:source.sourceUtf8},params,deadlineMs:30000})}},
        {beforeStart:()=>{
          if(isDisposed())throw {code:'E_HOST_CLOSED',message:'Sidebar 已关闭，本次未运行'};
          localProject.assertCaptured(binding);
          if(localProject.preparationIdentity()!==preparationIdentity)
            throw {code:'E_DEV_CONFLICT',message:'准备版本在运行前发生变化；本次未运行，请重新运行最新源码'};
          if(stopping||isBlocked()||!controllerResults.projection?.slotAvailable||host.currentRun)
            throw {code:'E_RUN_ACTIVE',message:'运行状态已变化；请等待当前任务释放后重新运行'};
          if(page&&!source.managedUI){pageWait=attempt={binding,target:captured,detached:false};update();}
        }});
      if(page){
        patchDeveloperField(view,find('script-task-id'),{textContent:'previewId：'+claim.previewId});
        patchDeveloperField(view,find('script-task-version'),{textContent:'Page USER_SCRIPT · SHA-256 '+source.sourceHash});
        patchDeveloperField(view,find('script-running-target'),{textContent:'运行目标：'+captured.url,
          title:JSON.stringify({tabId:captured.tabId,frameId:captured.frameId??0,
            documentId:captured.documentId,url:captured.url})});
        let result=claim;
        while(!isDisposed()&&result.state==='preview-pending'){
          await new Promise(resolve=>{finishLocalPoll=resolve;localPollTimer=setTimeout(resolve,200);});localPollTimer=null;finishLocalPoll=null;
          if(isDisposed())return;result=await localAdapter.handle({method:'page.get',params:{previewId:claim.previewId}});
        }
        if(attempt?.detached||isDisposed())return;
        if(source.managedUI&&(!result.error||result.error.code==='E_PAGE_SCRIPT_EXECUTION'&&result.error.outcome==='FAILED_CONFIRMED'))ownedManagedPreview={previewId:claim.previewId,bindingId:source.bindingId,target,sourceHash:source.sourceHash};
        else if(!source.managedUI||result.error?.outcome==='OUTCOME_UNKNOWN')ownedManagedPreview=null;
        if(result.error)throw result.error;
        if(result.state!=='preview-evaluated'||result.sourceHash!==source.sourceHash||
          result.target?.documentId!==captured.documentId||result.target?.tabId!==captured.tabId||
          result.target?.url!==captured.url)
          throw {code:'E_DEV_HASH',message:'Page 预览回执与冻结源码或目标网页身份不符'};
        await currentPageTarget.revalidate(captured);
        if(attempt?.detached||isDisposed())return;
        localProject.assertCaptured(binding);
        localPageResult={bindingId:binding.bindingId,providerEpoch:binding.providerEpoch,
          tabId:captured.tabId,documentId:captured.documentId,url:captured.url,sourceHash:source.sourceHash};
        localInstaller.succeeded({source,binding,target:captured,previewId:claim.previewId});
        display('completed',source.managedUI?'本地 Page 预览已完成；再次运行会先清理旧受管 UI。':'本地 Page 预览已完成；网页 UI 由项目管理。');
        const valueText=result.result?.resultText ?? 'undefined';
        setResultText(valueText);setResultKind('本地 Page · 本次结果');
        patchDeveloperField(view,copyResult,{disabled:false});patchDeveloperField(view,find('developer-results-panel'),{open:true});
        patchDeveloperField(view,pageTechnicalPanel,{hidden:false});patchDeveloperField(view,pageTechnicalPanel,{open:false});
        patchDeveloperField(view,pageTechnical,{textContent:'源码 SHA-256：'+source.sourceHash});
      }else{
        admittedRunId=ownedRunId=claim.runId;
        if(isDisposed())return;
        patchDeveloperField(view,find('script-run-id'),{value:claim.runId});controllerResults.renderTask(claim);
        display('running','已运行本地源码快照；修改文件只影响下一次运行');update();
        ownedRunBinding=binding;refreshResultValidity();
        const result=await host.completion;
        if(result.error)throw result.error;
        if(result.pendingSettlement||result.state==='paused_unknown')throw {code:'E_EFFECT_UNKNOWN',message:'任务完成状态仍不明确'};
        // Only the original durable run/result projection can justify Task publication.
        const observed=await host.controller.snapshotControllerRun({runId:claim.runId});
        const durable=(observed.runs||[]).find(row=>row.runId===claim.runId)||observed.run;
        const returned=(observed.results||[]).find(row=>row.runId===claim.runId&&
          row.resultId===durable?.resultId&&row.revision?.sourceHash===source.sourceHash&&
          row.state==='completed'&&row.outcome?.ok===true);
        if(durable?.state==='completed'&&durable.retirementState==='released'&&
           durable.revision?.sourceHash===source.sourceHash&&returned)
          localInstaller.succeeded({source,binding,target:captured,runId:claim.runId,resultId:returned.resultId});
      }
    })().catch(error=>{
      if(attempt?.detached||isDisposed())return;
      startError=error;admittedRunId||=error.runId;localPageResult=null;localInstaller.reset();fail(error);
      if(page||!admittedRunId){
        setResultText(formatTaskError(error));
        setResultKind(page?'本地 Page · 执行失败':'本地项目 · 未启动');
        patchDeveloperField(view,copyResult,{disabled:true});patchDeveloperField(view,find('developer-results-panel'),{open:true});
      }
    }).finally(async()=>{
      if(pageWait===attempt)pageWait=null;
      running=false;if(isDisposed())return;
      if(admittedRunId)patchDeveloperField(view,find('script-run-id'),{value:admittedRunId});
      try{if(page||!admittedRunId)controllerResults.setProjection(await host.controller.snapshotControllerRun({}));else await controllerResults.read('');}catch{controllerResults.clearProjection();}
      if(startError)fail(startError);update();
    });
  }

  async function stopManaged(){
    if(!canStopManaged()||stopping)return;
      const owned=ownedManagedPreview;stopping=true;update();display('stopping','正在清理原网页中的受管资源…');
      try{
        const result=await localAdapter.handle({method:'page.dispose',requestId:crypto.randomUUID(),params:{previewId:owned.previewId}});
        if(result?.previewId!==owned.previewId||result.sourceHash!==owned.sourceHash||
          result.state!=='preview-retired'||result.receipt?.ok!==true||result.receipt.scope!=='managed-ui-only')
          throw {code:'E_EFFECT_UNKNOWN',message:'受管清理回执未确认'};
        if(ownedManagedPreview===owned)ownedManagedPreview=null;
        localInstaller.reset();
        // Cleanup is a receipt for the original preview, including a failed
        // main. It remains meaningful if its source Provider has gone offline.
        localPageResult={kind:'stop',bindingId:owned.bindingId,previewId:owned.previewId,
          sourceHash:owned.sourceHash,tabId:owned.target.tabId,
          documentId:owned.target.documentId,url:owned.target.url};
        setResultText(JSON.stringify(result,null,2));setResultKind('本地 Page · 停止回执');
        patchDeveloperField(view,copyResult,{disabled:false});patchDeveloperField(view,find('developer-results-panel'),{open:true});
        patchDeveloperField(view,pageTechnicalPanel,{hidden:false});patchDeveloperField(view,pageTechnicalPanel,{open:false});
        patchDeveloperField(view,pageTechnical,{textContent:JSON.stringify({stop:result},null,2)});
        display('completed','受管 UI 已清理；网页业务效果不会回滚。');
      }finally{stopping=false;update();}
      return;
  }
  async function stopController(){
    if(!ownedRunId||host.currentRun!==ownedRunId||stopping)return;
    stopping=true;update();display('stopping','正在提交停止并等待持久收尾…');
    try{await host.stop({runId:ownedRunId,controller:true});}
    finally{stopping=false;update();}
  }
  return Object.freeze({run,stopManaged,stopController,retireManagedPreviewForInstall:retireLocalPreviewForInstall,
    canStopManaged,canStopWaiting,stopWaiting,pageResultIsCurrent,refreshResultValidity,
    get ownedRunId(){return ownedRunId;},get managed(){return ownedManagedPreview;},
    get running(){return running;},get stopping(){return stopping;},
    resourceSnapshot:()=>({timers:Number(localPollTimer!=null)}),
    dispose(){clearTimeout(localPollTimer);finishLocalPoll?.();}});
}
