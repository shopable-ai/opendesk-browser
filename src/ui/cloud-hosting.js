// Hosting shares the visible document's existing RunHost and Authority slot.
import {projectCloudStatus,cloudHostingSummary,projectCloudRequestSamples,cloudSlotStateLabel} from './cloud-status-presentation.js';
import {verifyTaskPackage,validateTaskParams} from '../platform/tasks/contract.js';
import {permissionPattern} from '../environment.js';
import {requireChromePermissions,createChromePermissionConsent} from '../platform/chrome/permission-gate.js';
import {matchesCloudProgramDescriptor,summarizeCloudSourceDifference} from './cloud-program-review.js';
// Advisory projection only: the Browser Host uses the original Task resolver
// again before granting authority, binding a Run, or admitting a Worker.
export function projectCloudInstalledTasks(data,approved=[]){
  const catalog=Array.isArray(data?.catalog)?data.catalog:[],
    installed=Array.isArray(data?.installed)?data.installed:[],
    grants=Array.isArray(approved)?approved:[];
  return installed.map(row=>{
    const item=catalog.find(candidate=>candidate.taskId===row.taskId&&
      candidate.version===row.version&&candidate.manifestHash===row.manifestHash);
    const manifest=item?.manifest,sourceHash=manifest?.program?.sourceHash??null,
      siteOrigins=Array.isArray(manifest?.siteOrigins)?manifest.siteOrigins:[],
      eligible=!!(row.enabled&&item?.stage==='available'&&
        item?.verification?.manifestHash===row.manifestHash&&
        item?.verification?.sourceHash===sourceHash&&sourceHash&&siteOrigins.length);
    const authorized=grants.find(grant=>grant.taskId===row.taskId&&
      grant.version===row.version&&grant.manifestHash===row.manifestHash&&
      grant.sourceHash===sourceHash&&grant.installationId===row.installationId&&
      grant.generation===row.generation);
    const requiresReapproval=!authorized&&grants.some(grant=>grant.taskId===row.taskId);
    return {taskId:row.taskId,version:row.version,manifestHash:row.manifestHash,
      sourceHash,installationId:row.installationId??null,generation:row.generation??null,
      title:manifest?.title||row.taskId,description:manifest?.description||'',
      siteOrigins,paramsSchema:manifest?.paramsSchema??null,
      enabled:row.enabled===true,
      eligible,approved:!!authorized,requiresReapproval,
      resultAllowed:authorized?.resultAllowed===true};
  });
}
const cloudChoiceKey=task=>[task.taskId,task.version,task.manifestHash,task.sourceHash,
  task.installationId,task.generation].join('|');

// A single Controller owns selections, confirmations and operation lifetimes.
// React receives projections/actions only; the Cloud Host rechecks every pin.
export function createCloudHosting({client,host,document:doc=globalThis.document,api=globalThis.chrome,reactUI,currentPageTarget,onTaskInstalled,onOpenRun,onManageTasks}){
  if(!reactUI?.cloudPageMounted)throw new Error('E_REACT_CLOUD_PAGE_REQUIRED');
  const cloud=client.cloud,get=id=>doc.getElementById(id);
  let disposed=false,busy=false,starting=false,timer,refreshing=null,epoch=0,secretEpoch=0;
  let state=null,taskChoices=[],catalogStamp='',catalogAt=0,lastRefresh=0;
  const selections=new Map();
  let consent=false,resultConsent=false,operationFeedback='',catalogError='';
  let requestOffset=0,nextOffset=null,selectedRequest=null,requestRows=[],requestRaw=[];
  let pageText='正在读取请求记录…',requestError='';
  let clientRows=[],clientNextOffset=null,clientCount='按需管理',clientStatus='连接并授权任务后，可以管理外部应用凭据。';
  let clientPins='',clientTaskId='',clientName='',clientResult=false,oneTimeToken='';
  let pairing={url:'',providerId:'',pairingCode:'',loopback:false};
  let overview={summary:'正在检查连接与授权…',connection:'检测中'},brief='未配对',statusText='尚未配对';
  let statusFailed=false,programRows=[],reviewedProgram=null,lastTrial=null,
    trialActiveId=null,trialStopping=false,
    programStatus='点击刷新，检查服务器交付的待审核程序。';
  const permissionConsent=api?.permissions?
    createChromePermissionConsent({api,onChange:()=>{
      if(lastTrial?.available){lastTrial.permissionPrepared=false;
        void prepareInstallPermission(lastTrial);}
    }}):null;
  const selectedTasks=()=>taskChoices.filter(t=>t.eligible&&selections.get(cloudChoiceKey(t))?.selected);
  const activeTasks=()=>state?.enabled&&Array.isArray(state.tasks)?state.tasks:[];
  const resetConsent=()=>{consent=false;resultConsent=false;};
  const clearSecrets=()=>{secretEpoch++;oneTimeToken='';pairing.pairingCode='';reviewedProgram=null;publish();};
  function originalRun(){
    const row=selectedRequest===null?null:requestRaw[selectedRequest-requestOffset];
    return typeof row?.runId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(row.runId)?row.runId:null;
  }
  function publish(){
    if(disposed)return;
    const projected=state?projectCloudStatus(state):null;
    const pending=['pending','unknown'].includes(projected?.revocation);
    const sample=selectedRequest===null?null:requestRows[selectedRequest-requestOffset];
    const runId=originalRun();
    const review=reviewedProgram&&programRows.some(row=>matchesCloudProgramDescriptor(
      row,reviewedProgram.deliveryId,reviewedProgram.package))?reviewedProgram:null;
    reactUI.renderCloudPage({
      overview,visibleApproval:!!state?.provider,
      programs:{rows:programRows,busy,canRefresh:!!state?.provider&&!busy,
        status:programStatus,onRefresh:()=>action(refreshPrograms),
        trial:lastTrial?{
          deliveryId:lastTrial.deliveryId,title:lastTrial.title,taskId:lastTrial.taskId,
          version:lastTrial.version,runId:lastTrial.runId,sourceHash:lastTrial.sourceHash,
          state:lastTrial.state,message:lastTrial.message,imported:lastTrial.imported,
          verified:lastTrial.verified,available:lastTrial.available,installed:lastTrial.installed,
          busy,permissionPrepared:lastTrial.permissionPrepared,
          canStop:!!trialActiveId&&host.currentRun===trialActiveId&&!trialStopping,
          canVerify:!busy&&lastTrial.imported===true&&lastTrial.success===true&&!lastTrial.verified,
          canInstall:!busy&&lastTrial.available===true&&!lastTrial.installed&&lastTrial.permissionPrepared===true
        }:null,
        review:review?{deliveryId:review.deliveryId,
          source:review.package.sourceUtf8,description:review.package.manifest.description,
          author:review.package.manifest.author,sourceOrigin:review.package.manifest.source,
          permissions:review.package.manifest.permissions,
          siteOrigins:review.package.manifest.siteOrigins,
          paramsSchema:JSON.stringify(review.package.manifest.paramsSchema,null,2),
          sourceHash:review.package.manifest.program.sourceHash,
          manifestHash:review.package.manifestHash,
          previousVersion:review.previousVersion,
          previousSource:review.previousSource,
          difference:review.difference}:null,
        onReview:deliveryId=>action(()=>reviewProgram(deliveryId)),
        onImport:deliveryId=>action(()=>acceptProgram(deliveryId)),
        onTrial:(deliveryId,paramsText,event)=>action(()=>trialProgram(deliveryId,paramsText,event)),
        onStopTrial:()=>{void stopTrial();},
        onVerifyTrial:()=>action(verifyTrial),
        onInstallTrial:event=>action(()=>installTrial(event)),
        onOpenTrial:()=>action(async()=>{
          if(!lastTrial?.runId||typeof onOpenRun!=='function')throw {code:'E_CLOUD_RESULT_VIEW'};
          await onOpenRun(lastTrial.runId);
        })},
      setup:{visible:!state?.provider,nextStep:'先安装或验证任务，再连接可信提供者并选择允许远程调用的任务。'},
      onRefresh:()=>action(()=>{},true),onOpenConsole:()=>action(()=>api.tabs.create({url:api.runtime.getURL('ui/cloud-control.html')})),
      onHide:()=>{clearSecrets();publish();},
      authorization:{tasks:taskChoices.map(task=>({...task,key:cloudChoiceKey(task),
        selected:state?.enabled?task.approved:selections.get(cloudChoiceKey(task))?.selected===true,
        resultSelected:state?.enabled?task.resultAllowed:selections.get(cloudChoiceKey(task))?.resultAllowed===true})),
        hostingEnabled:state?.enabled===true,busy,consent,resultConsent,error:catalogError,
        canApprove:!busy&&!statusFailed&&!!state?.provider&&!state.enabled&&!pending,
        canStop:!busy&&!!state?.provider&&!!state.enabled,
        onSelection:(key,value)=>choose(key,value,false),onResultSelection:(key,value)=>choose(key,value,true),
        onConsent:value=>{if(!busy&&!state?.enabled){consent=value;publish();}},
        onResultConsent:value=>{if(!busy&&!state?.enabled){resultConsent=value;publish();}},
        onApprove:()=>action(approve),onStop:()=>action(async()=>{clearSecrets();catalogAt=0;resetConsent();await cloud.cloudStop({});}),
        onManageTasks:()=>onManageTasks?.()},
      pairing:{...pairing,brief,status:[statusText,operationFeedback].filter(Boolean).join('\n'),busy,
        canPair:!busy&&!statusFailed&&!!projected&&!projected.paired&&!pending,
        canUnpair:!busy&&!!state?.provider,
        onField:(name,value)=>{if(!busy&&Object.hasOwn(pairing,name)){pairing[name]=value;publish();}},
        onPair:()=>action(async()=>{const input={url:pairing.url,providerId:pairing.providerId.trim(),
          pairingCode:pairing.pairingCode.trim(),allowLoopback:pairing.loopback};
          pairing.pairingCode='';publish();await cloud.cloudPair(input);}),
        onUnpair:()=>action(async()=>{clearSecrets();catalogAt=0;resetConsent();await cloud.cloudUnpair({});}),
        onRefresh:()=>action(()=>{},true)},
      clients:{name:clientName,taskId:clientTaskId,resultAllowed:clientResult,
        tasks:activeTasks().map(pin=>({...pin,title:taskChoices.find(t=>t.taskId===pin.taskId)?.title||pin.taskId})),
        rows:clientRows.map(row=>({...row,tasksText:row.tasks.map(pin=>taskChoices.find(t=>t.taskId===pin.taskId&&t.version===pin.version)?.title||pin.taskId).join('、')})),
        token:oneTimeToken,status:clientStatus,count:clientCount,nextOffset:clientNextOffset,busy,
        canCreate:!busy&&!statusFailed&&activeTasks().length>0,canRefresh:!busy&&!!state?.provider,
        onField:(name,value)=>{if(busy)return;
          if(name==='name')clientName=value;
          if(name==='taskId'){clientTaskId=value;clientResult=false;}
          if(name==='resultAllowed')clientResult=value===true&&activeTasks().some(t=>t.taskId===clientTaskId&&t.resultAllowed);
          publish();},
        onCreate:()=>action(createClient),onCopy:()=>action(copyToken),
        onDismissToken:()=>{secretEpoch++;oneTimeToken='';publish();},
        onRefresh:()=>action(()=>refreshClients()),onMore:()=>action(()=>refreshClients(true)),
        onRevoke:id=>{const row=clientRows.find(row=>row.clientId===id);if(!row||busy)return;
          if(!row.confirming){row.confirming=true;publish();return;}
          void action(async()=>{clearSecrets();await cloud.cloudClientRevoke({clientId:id});
            await refreshClients();clientStatus='外部应用凭据已撤销；历史运行记录仍保留。';});}},
      requests:{rows:requestRows.map((row,index)=>({key:String(requestOffset+index),index,
          title:[row.title,row.state,row.run].filter(Boolean).join(' · '),
          summary:[row.result,row.settlement,row.receipt,row.reason].filter(Boolean).join(' · ')})),
        emptyText:requestError||'此页暂无请求记录',pageText,
        canPrev:!busy&&!requestError&&requestOffset>0,canNext:!busy&&!requestError&&nextOffset!==null,
        detail:sample?{key:String(selectedRequest),title:sample.title,state:[sample.state,sample.run].join(' · '),
          facts:[sample.result,sample.settlement,sample.receipt].join(' · '),reason:sample.reason||'暂无其他状态信息。',
          runId:runId||'尚无可核对的原始 Run',canOpenRun:!!runId,
          note:runId?'仅在本机可信「开发 → 运行记录」读取原始数据，不会重新执行。':'请求尚未绑定原始 Run；状态未知时请勿重新执行。'}:null,
        onPrev:()=>action(()=>{requestOffset=Math.max(0,requestOffset-5);selectedRequest=null;}),
        onNext:()=>action(()=>{if(nextOffset!==null)requestOffset=nextOffset;selectedRequest=null;}),
        onDetail:index=>{if(Number.isInteger(index)&&index>=0&&index<requestRows.length){selectedRequest=requestOffset+index;publish();}},
        onClose:()=>{const index=selectedRequest===null?null:selectedRequest-requestOffset;selectedRequest=null;publish();
          if(index!==null)get('cloud-request-samples')?.querySelectorAll('button')[index]?.focus();},
        onOpenResult:()=>action(openOriginalRun)}
    });
  }
  const cloudErrorText=e=>{let code=/^E_[A-Z0-9_]{1,60}$/.test(String(e?.code))?e.code:'E_CLOUD';
    const help={E_DELIVERY:'交付程序身份或源码校验失败，请刷新后核对',
      E_DELIVERY_REVIEW_REQUIRED:'请先查看并核对完整源码，再接收待验证任务',
      E_HASH:'远程源码哈希验证失败；程序未导入',
      E_VERIFICATION:'试运行尚无成功的原生页面操作回执；请查看原始 Run 再重试',
      E_DOCUMENT_STALE:'当前目标网页已经变化，请回到授权网站后重试',
      E_TARGET:'请切换到此程序允许的网站，再点击试运行',
      E_PARAMS:'参数格式或取值不符合源码声明，请检查后重试',
      E_GESTURE:'请主动点击试运行或正式安装',
      E_PERMISSION_CHECK_REQUIRED:'网站权限尚未准备完成，请稍后再试',
      E_RUN_ACTIVE:'已有其他任务正在执行，请先结束该任务',
      E_HOST_CLOSED:'运行宿主已关闭；请检查原始 Run 的最终状态',
      E_DELIVERY_LIMIT:'服务器待审核程序数量已达上限',
      E_AUTH:'提供者拒绝凭据，请核对配对状态',
      E_PAIRING:'连接尚未完成配对，或需要先解除已有配对',
      E_PAIR_ACTIVE:'此浏览器已在提供者配对，请先撤销旧配对',
      E_EXECUTOR_TARGET:'外部请求没有指向已配对的浏览器',
      E_REVISION:'任务版本或安装授权已变化，请停止后重新批准',
      E_CLOUD_REVOKED:'云控授权已停止，任务不能继续执行',
      E_PERMISSION:'网站或本地 Task 授权已失效，请重新审核',
      E_PROVIDER:'提供者连接异常，请核对 HTTPS 地址和网络',
      E_CLIENT:'该外部应用授权已失效，请刷新列表',
      E_CLIENT_SCOPE:'外部应用只能调用当前已批准且版本匹配的任务，结果权限不能扩大',
      E_CLIENT_LIMIT:'外部授权数量已达上限，请先撤销不用的应用',
      E_CLOUD_STOPPED:'云控已停用，请先重新批准当前任务',
      E_CLOUD_CONSENT_REQUIRED:'请先核对所选任务的固定版本、网站范围与安装代际',
      E_CLOUD_TASK_SELECTION:'请选择 1–32 项已验证且启用的 Controller Task',
      E_CLOUD_RESULT_CONSENT_REQUIRED:'请确认允许所选任务的结果回传范围'};
    if(!Object.hasOwn(help,code))code='E_CLOUD';
    // Only render trusted, fixed local validation messages verbatim. Remote
    // Provider errors remain projected to known codes, never raw page details.
    const local=new Set(['请先核对所选任务的固定版本、网站范围与安装代际',
      '请选择 1–32 项已验证且启用的 Controller Task',
      '请确认允许所选任务的结果回传范围','请填写外部应用名称']);
    const safe=local.has(e?.message)?e.message:null;
    return safe||(help[code]||'操作未完成，请检查连接与授权')+'（'+code+'）';
  };

  const operationFail=error=>{if(disposed)return;operationFeedback=cloudErrorText(error);publish();};
  function fail(error){
    statusFailed=true;clearSecrets();resetConsent();
    statusText='云控状态暂不可读取，请稍后核对。 '+cloudErrorText(error);brief='状态异常';
    overview={myState:'状态不可读取',summary:'云端托管状态暂不可读取',provider:'待核对',connection:'待核对',host:'待核对',slot:'待核对',tasks:'待核对',requests:'待核对'};
    requestError='请求状态暂不可读取';requestRows=[];requestRaw=[];selectedRequest=null;pageText='历史状态不可读取';publish();
  }
  async function refreshTasks(s){
    if(typeof client.request!=='function'||Date.now()-catalogAt<5000)return;
    catalogAt=Date.now();
    let data;
    try{data=await client.request('listTaskCatalog',{});}catch{
      taskChoices=[];catalogStamp='';catalogAt=0;resetConsent();
      catalogError='任务目录不可读取；请先检查本地安装与授权';return;
    }
    if(disposed)return;
    const next=projectCloudInstalledTasks(data,s.tasks),stamp=JSON.stringify([next,!!s.enabled]);
    catalogError='';
    if(stamp!==catalogStamp){catalogStamp=stamp;taskChoices=next;resetConsent();
      const keys=new Set(next.map(cloudChoiceKey));for(const key of selections.keys())if(!keys.has(key))selections.delete(key);}
  }
  async function refresh(){
    if(disposed)return null;
    if(refreshing)return refreshing;
    const revision=epoch;
    refreshing=(async()=>{
      const s=await cloud.cloudStatus({limit:5,...(requestOffset?{offset:requestOffset}:{})});
      if(disposed||revision!==epoch)return null;
      state=s;statusFailed=false;
      const projected=projectCloudStatus(s),samples=projectCloudRequestSamples(s);
      brief=projected.revocation==='pending'?'本机已停止；服务端撤销待确认':projected.revocation==='unknown'?'撤销状态待核对':
        !projected.paired?(projected.revocation==='confirmed'?'撤销已确认':'未配对'):!projected.enabled?'已关闭':
        !projected.online?'连接中':!projected.reconciled?'对账中':!projected.hostReady?'宿主未就绪':
        projected.siteAuthorization==='revoked'?'网站访问已撤销':projected.siteAuthorization!=='granted'?'网站授权待核对':
        !projected.slotAvailable?cloudSlotStateLabel(projected.slotState):projected.pendingResources!==false?'待处理资源待核对':'可用';
      statusText=cloudHostingSummary(projected)+`\n已批准任务 ${projected.approvedTasks} 项 · 历史云请求 ${projected.requests.total} 条 · 已确认回执 ${projected.requests.receivedReceipts} 条（最近 ${projected.requests.sampled} 条统计）`;
      overview={myState:brief+' · 已批准 '+projected.approvedTasks+' 项任务',summary:cloudHostingSummary(projected),
        provider:projected.paired?'已配对':'未配对',connection:projected.online?'已连接':projected.connection==='backoff'?'重连中':'未连接',
        host:projected.hostReady?'已就绪':'不可用',slot:cloudSlotStateLabel(projected.slotState),tasks:String(projected.approvedTasks),requests:String(projected.requests.total)};
      requestRows=samples;requestRaw=samples.length?s.requests.slice(-samples.length).reverse():[];requestError='';
      nextOffset=Number.isSafeInteger(s.requestPage?.nextOffset)?s.requestPage.nextOffset:null;
      if(selectedRequest!==null&&(selectedRequest<requestOffset||selectedRequest>=requestOffset+samples.length))selectedRequest=null;
      pageText=samples.length?'第 '+(requestOffset+1)+'–'+(requestOffset+samples.length)+' 条 / 共 '+projected.requests.total+' 条':'此页暂无请求 / 共 '+projected.requests.total+' 条';
      await refreshTasks(s);if(disposed||revision!==epoch)return null;
      const stamp=JSON.stringify(activeTasks());
      if(stamp!==clientPins){clientPins=stamp;clearSecrets();clientResult=false;
        if(!activeTasks().some(t=>t.taskId===clientTaskId))clientTaskId=activeTasks()[0]?.taskId||'';}
      if(!s.provider){clearSecrets();programRows=[];reviewedProgram=null;programStatus='请先连接服务器，再检查待审核程序。';clientRows=[];clientNextOffset=null;clientCount='按需管理';}
      lastRefresh=Date.now();publish();return s;
    })().finally(()=>{refreshing=null;});
    return refreshing;
  }
  async function action(fn,readOnly=false){
    if(disposed||busy)return;
    busy=true;operationFeedback='';epoch++;publish();
    // Call synchronously, before the first await, to retain trusted activation.
    try{
      try{if(!readOnly)await fn();}catch(error){operationFail(error);return;}
      if(disposed)return;
      if(refreshing)await refreshing;
      try{await refresh();}catch(error){if(!disposed)fail(error);}
    }finally{busy=false;if(!disposed)publish();}
  }
  function choose(key,value,result){
    if(disposed||busy)return;
    const task=taskChoices.find(t=>cloudChoiceKey(t)===key);if(!task?.eligible)return;
    if(state?.enabled){
      if(!result||value||!task.approved||!task.resultAllowed)return;
      return action(async()=>{try{await cloud.cloudRevokeResults({taskId:task.taskId});
        operationFeedback='所选任务的结果回传授权已撤销；托管状态保持不变。';}finally{catalogAt=0;resetConsent();clearSecrets();}});
    }
    const selection=selections.get(key)||{selected:false,resultAllowed:false};
    if(result)selection.resultAllowed=value===true;else selection.selected=value===true;
    selections.set(key,selection);resetConsent();publish();
  }
  async function refreshPrograms(){
    if(typeof cloud.cloudProgramInbox!=='function')return;
    const result=await cloud.cloudProgramInbox({});
    if(disposed)return;
    programRows=result.programs;
    if(reviewedProgram&&!programRows.some(row=>matchesCloudProgramDescriptor(
      row,reviewedProgram.deliveryId,reviewedProgram.package)))reviewedProgram=null;
    programStatus=programRows.length?'待审核程序 '+programRows.length+' 项；只有明确查看源码后才能导入候选。':'暂无新交付的程序。';
  }
  async function reviewProgram(deliveryId){
    const row=programRows.find(item=>item.deliveryId===deliveryId);
    if(!row||typeof cloud.cloudProgramFetch!=='function')throw {code:'E_DELIVERY'};
    // Remote bytes are requested ONLY following the user's trusted review
    // click, verified by Cloud Service and again in this receiving document.
    const answer=await cloud.cloudProgramFetch({deliveryId});
    if(disposed||answer?.deliveryId!==deliveryId)throw {code:'E_DELIVERY'};
    const pkg=await verifyTaskPackage(answer.package);
    if(!matchesCloudProgramDescriptor(row,deliveryId,pkg))throw {code:'E_DELIVERY'};
    let previousVersion=null,previousSource=null;
    if(typeof client.request==='function'){
      try{
        const catalog=await client.request('listTaskCatalog',{});
        const installed=catalog?.installed?.find(item=>item.taskId===row.taskId);
        if(installed){
          previousVersion=installed.version;
          try{
            const prior=await client.request('getTaskCandidate',{
              taskId:installed.taskId,version:installed.version});
            if(prior?.manifestHash===installed.manifestHash&&
              prior.package?.manifestHash===installed.manifestHash){
              const verified=await verifyTaskPackage(prior.package);
              previousSource=verified.sourceUtf8;
            }
          }catch{/* An unavailable old candidate cannot authorize or hide the new source. */}
        }
      }catch{/* The installed catalog is advisory; source review still requires exact pins. */}
    }
    if(disposed||!programRows.some(item=>matchesCloudProgramDescriptor(item,deliveryId,pkg)))
      throw {code:'E_DELIVERY'};
    reviewedProgram={deliveryId,package:pkg,previousVersion,previousSource,
      difference:summarizeCloudSourceDifference(previousSource,pkg.sourceUtf8)};
    programStatus='源码已读取并校验固定版本。核对后可接收为待验证任务；此操作不会执行或安装。';
  }
  async function acceptProgram(deliveryId){
    const row=programRows.find(item=>item.deliveryId===deliveryId),
      reviewed=reviewedProgram;
    if(!row||!reviewed||reviewed.deliveryId!==deliveryId||
      !matchesCloudProgramDescriptor(row,deliveryId,reviewed.package))
      throw {code:'E_DELIVERY_REVIEW_REQUIRED'};
    if(typeof cloud.cloudProgramFetch!=='function'||typeof client.request!=='function')
      throw {code:'E_DELIVERY'};
    // Refetch under the current Provider pairing and compare with the bytes
    // actually reviewed. A changed source must return to the review step.
    const answer=await cloud.cloudProgramFetch({deliveryId});
    if(disposed||answer?.deliveryId!==deliveryId)throw {code:'E_DELIVERY'};
    const pkg=await verifyTaskPackage(answer.package);
    if(!matchesCloudProgramDescriptor(row,deliveryId,pkg)||
      pkg.sourceUtf8!==reviewed.package.sourceUtf8)
      throw {code:'E_DELIVERY_REVIEW_REQUIRED'};
    // The preexisting installer independently checks every byte. Candidate
    // import grants no Controller Run, site permission or Cloud approval.
    await client.request('importTaskPackage',{package:pkg});
    reviewedProgram=null;
    programRows=programRows.filter(item=>item.deliveryId!==deliveryId);
    programStatus='已导入待验证任务 '+row.title+'；请到「我的」使用原有试运行、验证与安装流程。';
    catalogAt=0;
    if(lastTrial?.deliveryId===deliveryId&&lastTrial.manifestHash===row.manifestHash&&
      lastTrial.sourceHash===row.sourceHash)lastTrial.imported=true;
    // An ACK timeout may leave the immutable Candidate, never an auto-run.
    try{await cloud.cloudProgramReceived({deliveryId,manifestHash:row.manifestHash});}
    catch{programStatus+=' 提供者回执待核对；任务未自动执行。';}
  }
  async function prepareInstallPermission(trial){
    if(!permissionConsent||!trial?.available)return;
    try{
      const observed=await permissionConsent.prepare({
        origins:trial.siteOrigins.map(permissionPattern)});
      if(!disposed&&lastTrial===trial){
        trial.permissionPrepared=Boolean(observed);
        publish();
      }
    }catch(error){if(!disposed&&lastTrial===trial)operationFail(error);}
  }
  async function trialProgram(deliveryId,paramsText,event){
    if(event?.isTrusted!==true)throw {code:'E_GESTURE'};
    const reviewed=reviewedProgram,row=programRows.find(item=>item.deliveryId===deliveryId);
    if(!reviewed||!row||!matchesCloudProgramDescriptor(row,deliveryId,reviewed.package))
      throw {code:'E_DELIVERY_REVIEW_REQUIRED'};
    if(!currentPageTarget?.capture||!currentPageTarget?.revalidate||
      typeof host.start!=='function'||typeof client.controller?.snapshotControllerRun!=='function')
      throw {code:'E_HOST_CLOSED'};
    if(host.executionPending||host.currentRun)throw {code:'E_RUN_ACTIVE'};
    // Validate only the exact reviewed source and current top-level document.
    // This explicit click starts ONE original RunHost Controller draft, not an
    // installed Task and not an ongoing Cloud authorization.
    const pkg=await verifyTaskPackage(reviewed.package);
    if(disposed||reviewedProgram!==reviewed)throw {code:'E_DELIVERY_REVIEW_REQUIRED'};
    const captured=currentPageTarget.capture(),manifest=pkg.manifest;
    if(!manifest.siteOrigins.includes(captured.origin))throw {code:'E_TARGET'};
    let params;
    try{params=validateTaskParams(manifest.paramsSchema,JSON.parse(paramsText));}
    catch{throw {code:'E_PARAMS'};}
    const trial={deliveryId,title:manifest.title,taskId:manifest.taskId,
      version:manifest.version,manifestHash:pkg.manifestHash,
      sourceHash:manifest.program.sourceHash,siteOrigins:[...manifest.siteOrigins],
      runId:null,state:'preparing',message:'正在验证目标网页并申请一次性 Run',
      imported:false,success:false,verified:false,available:false,installed:false,
      permissionPrepared:false};
    lastTrial=trial;publish();
    await requireChromePermissions({api,request:{
      origins:manifest.siteOrigins.map(permissionPattern)}});
    await currentPageTarget.revalidate(captured);
    if(disposed||lastTrial!==trial||reviewedProgram!==reviewed)throw {code:'E_DELIVERY_REVIEW_REQUIRED'};
    const claim=await host.start({source:{kind:'draft',sourceUtf8:pkg.sourceUtf8},
      params,target:{mode:'borrowed',tabId:captured.tabId,frameId:captured.frameId,
        documentId:captured.documentId,expectedUrl:captured.url,
        expectedWindowId:captured.windowId},networkOrigins:[],deadlineAt:Date.now()+30000});
    trial.runId=claim.runId;trialActiveId=claim.runId;trial.state='running';
    trial.message='正在运行固定源码；若关闭 Side Panel，可能中断，请查看原始 Run';
    publish();
    try{
      const completed=await host.completion;
      if(disposed)return;
      const observation=await client.controller.snapshotControllerRun({runId:claim.runId});
      const run=observation.run??observation.runs?.find(item=>item.runId===claim.runId);
      const result=observation.results?.find(item=>item.runId===claim.runId&&
        item.resultId===run?.resultId);
      const proven=run?.runId===claim.runId&&run?.revision?.sourceHash===trial.sourceHash&&
        run.state==='completed'&&run.retirementState==='released'&&
        run.workerRetired===true&&run.target?.allowedOrigin===manifest.siteOrigins[0]&&
        result?.state==='completed'&&result?.revision?.sourceHash===trial.sourceHash&&
        result?.outcome?.ok===true&&completed?.pendingSettlement!==true;
      trial.success=proven===true;
      trial.state=run?.state||completed?.state||'paused_unknown';
      trial.message=proven
        ?'本次 Run 已持久完成；仍需验证真实页面操作回执才能安装。'
        :'运行未得到符合安装条件的完整原始结果；请查看 Run / Result，不要重复执行未知副作用。';
    }catch(error){
      if(!disposed){
        trial.success=false;trial.state='paused_unknown';
        trial.message='原始 Run / Result 暂不可读取，请核对运行记录；不要自动重试。';
        operationFail(error);
      }
    }finally{
      if(trialActiveId===claim.runId)trialActiveId=null;
      if(!disposed)publish();
    }
  }
  async function stopTrial(){
    const runId=trialActiveId;
    if(!runId||trialStopping||host.currentRun!==runId)return;
    trialStopping=true;
    if(lastTrial?.runId===runId)lastTrial.message='正在请求停止本次 Run；以持久状态为准。';
    publish();
    try{await host.stop({controller:true,runId,reason:'E_CANCELLED'});}
    catch(error){operationFail(error);}
    finally{trialStopping=false;if(!disposed)publish();}
  }
  async function verifyTrial(){
    const trial=lastTrial;
    if(!trial?.imported||!trial.success||!trial.runId)throw {code:'E_VERIFICATION'};
    // Existing trusted Installer cross-checks the native effect journal,
    // not just a fulfilled JS return value or the UI trial model.
    const candidate=await client.request('getTaskCandidate',{
      taskId:trial.taskId,version:trial.version});
    if(disposed||lastTrial!==trial||candidate?.manifestHash!==trial.manifestHash||
      candidate.package?.manifest?.program?.sourceHash!==trial.sourceHash)
      throw {code:'E_REVISION'};
    const verified=await client.request('verifyTaskCandidate',{
      taskId:trial.taskId,version:trial.version,runId:trial.runId});
    if(disposed||lastTrial!==trial||verified?.verification?.sourceHash!==trial.sourceHash)
      throw {code:'E_VERIFICATION'};
    const available=await client.request('makeTaskAvailable',{
      taskId:trial.taskId,version:trial.version,manifestHash:trial.manifestHash});
    if(disposed||lastTrial!==trial||available?.stage!=='available'||
      available?.manifestHash!==trial.manifestHash)throw {code:'E_VERIFICATION'};
    trial.verified=true;trial.available=true;
    trial.message='已核实原始 Run、页面操作回执与固定源码。现在可明确安装此版本。';
    await prepareInstallPermission(trial);
  }
  async function installTrial(event){
    const trial=lastTrial;
    if(!trial?.available||!trial.verified||!trial.permissionPrepared||!permissionConsent)
      throw {code:'E_VERIFICATION'};
    // Invoke Chrome's permission request synchronously from the native
    // Install click. The original Task Installer checks generation/manifest.
    const confirmation=permissionConsent.confirm(event,{
      origins:trial.siteOrigins.map(permissionPattern)});
    await confirmation;
    if(disposed||lastTrial!==trial)throw {code:'E_HOST_CLOSED'};
    const candidate=await client.request('getTaskCandidate',{
      taskId:trial.taskId,version:trial.version});
    if(candidate?.stage!=='available'||candidate.manifestHash!==trial.manifestHash||
      candidate.package?.manifest?.program?.sourceHash!==trial.sourceHash)
      throw {code:'E_REVISION'};
    const catalog=await client.request('listTaskCatalog',{}),
      previous=catalog.installed?.find(item=>item.taskId===trial.taskId);
    if(previous?.version===trial.version&&previous.manifestHash===trial.manifestHash){
      trial.installed=true;trial.message=previous.enabled
        ?'该固定版本已安装；若需云控执行，请另外批准这一安装身份。'
        :'该固定版本已安装但停用；请在「我的」启用。';
      return;
    }
    await client.request('installTask',{taskId:trial.taskId,version:trial.version,
      manifestHash:trial.manifestHash,expectedInstalledVersion:previous?.version??null,
      expectedGeneration:previous?.generation??null,
      expectedInstallationId:previous?.installationId??null});
    if(disposed||lastTrial!==trial)return;
    trial.installed=true;
    trial.message='已正式安装此固定版本；云控仍须另行批准，不会自动授予远程执行权限。';
    catalogAt=0;
    onTaskInstalled?.(trial.taskId);
  }
  async function approve(){
    if(!consent)throw {code:'E_CLOUD_CONSENT_REQUIRED'};
    const selected=selectedTasks();
    if(!selected.length||selected.length>32)throw {code:'E_CLOUD_TASK_SELECTION'};
    if(selected.some(t=>selections.get(cloudChoiceKey(t))?.resultAllowed)&&!resultConsent)throw {code:'E_CLOUD_RESULT_CONSENT_REQUIRED'};
    const tasks=selected.map(t=>({taskId:t.taskId,version:t.version,manifestHash:t.manifestHash,sourceHash:t.sourceHash,
      siteOrigins:t.siteOrigins,installationId:t.installationId,generation:t.generation,resultAllowed:selections.get(cloudChoiceKey(t)).resultAllowed===true}));
    resetConsent();clearSecrets();catalogAt=0;
    await cloud.cloudApprove({tasks});
  }
  async function refreshClients(append=false){
    if(append&&clientNextOffset===null)return;
    const response=await cloud.cloudClients({offset:append?clientNextOffset:0,limit:20});if(disposed)return;
    clientRows=append?[...clientRows,...response.clients]:response.clients;
    clientNextOffset=response.nextOffset??null;clientCount=String(response.total)+' 个有效授权';
  }
  async function createClient(){
    const label=clientName.trim();if(!label)throw Error('请填写外部应用名称');
    const pin=activeTasks().find(t=>t.taskId===clientTaskId);
    if(!pin||(clientResult&&!pin.resultAllowed))throw {code:'E_CLIENT_SCOPE'};
    oneTimeToken='';
    const secretVersion=secretEpoch;
    const issued=await cloud.cloudClientGrant({label,taskId:clientTaskId,allowResult:clientResult});
    if(disposed||secretVersion!==secretEpoch)return;
    if(!/^[a-f0-9]{64}$/.test(issued?.credential))throw {code:'E_AUTH'};
    oneTimeToken=issued.credential;clientResult=false;publish();
    clientStatus='已创建专用凭据。请立即复制并通过可信渠道交给外部应用，离开后无法再次查看。';
    await refreshClients();
  }
  async function copyToken(){
    if(!oneTimeToken)return;
    if(!globalThis.navigator?.clipboard?.writeText)throw {code:'E_CLIPBOARD'};
    await globalThis.navigator.clipboard.writeText(oneTimeToken);
    if(!disposed)clientStatus='密钥已复制；不要发送到公开聊天或日志。';
  }
  async function openOriginalRun(){
    const runId=originalRun();if(!runId)return;
    if(typeof onOpenRun!=='function')throw {code:'E_CLOUD_RESULT_VIEW'};
    await onOpenRun(runId);
  }
  async function dispatchNext(s){
    if(disposed||!s?.enabled||host.executionPending||starting||!s.online||!s.reconciled)return;
    starting=true;
    try{
      const next=await cloud.cloudNext({});if(!next||disposed){starting=false;return;}
      const request=await cloud.cloudResolve(next);if(disposed){starting=false;return;}
      await host.start(request);
      host.completion.catch(operationFail).finally(()=>{starting=false;});
    }catch(error){starting=false;throw error;}
  }
  async function poll(){
    if(disposed)return;
    try{if(!busy){const revision=epoch,s=await cloud.cloudStatus({includeRequests:false});
      if(revision!==epoch)return;
      if(!busy&&!disposed)try{await dispatchNext(s);}catch(error){operationFail(error);}
      const visible=doc.documentElement?.dataset?.opendeskTab==='cloud';
      if(!busy&&!disposed&&Date.now()-lastRefresh>=(visible?5000:15000))await refresh();
    }}catch(error){if(!disposed)fail(error);}finally{if(!disposed)timer=setTimeout(poll,2000);}
  }
  publish();void poll();
  return {refresh,dispose(){if(disposed)return;clearSecrets();publish();disposed=true;reviewedProgram=null;programRows=[];lastTrial=null;epoch++;clearTimeout(timer);permissionConsent?.dispose();}};
}
