import {loadMarketTool} from './distribution.js';
import {loadReviewIntent,consumeReviewIntent,settleReviewIntent,cancelReviewIntent,closeUnjournaledReview,marketError} from './intent.js';
import {claimMarketReview} from './panel.js';
import {readMarketInstallStatus,marketExpectedIdentity} from './status.js';
import {getInstalledSidebarTools,installReviewedSidebarTool,recoverMarketOperation,sameSidebarToolPackage,MARKET_OPERATIONS_STORE} from '../ui/sidebar-tools/installation.js';
import {FOCUS_ID,FOCUS_CAPABILITY} from '../../examples/sidebar-tools/stay-focus/trusted/policy.js';
import {probeStayFocusService} from '../../examples/sidebar-tools/stay-focus/trusted/tool-host.js';

// Transaction owner for the existing ImportSheet. Presentation receives text
// and bounded actions only; dynamic package JS remains in the original sandbox.
export function createMarketInstallReview({api=globalThis.chrome,reviewId,lockManager=globalThis.navigator?.locks,
  onChange=()=>{},onClose=()=>{},assertOwner=()=>claimMarketReview(api,reviewId),
  assertCanInstall=()=>{},openInstalledAppDetail=null}={}){
  let handoff,candidate,baseline,operation,status,closed=false;
  let model={title:'安装应用',phase:'loading',message:'正在核对本机安装交接…',summary:[],technical:[],actions:[],busy:false};
  let actions=new Map();
  const publish=patch=>{model={...model,...patch};if(!closed)onChange(model);};
  const say=message=>publish({message});
  function controls(items){actions=new Map(items.map(([id,label,run])=>[id,run]));publish({actions:items.map(([id,label])=>({id,label}))});}
  function finish(){if(model.busy)return false;closed=true;onClose();return true;}
  async function localState(){
    handoff=await loadReviewIntent(api,reviewId);
    if(handoff.subject.kind!=='app')throw marketError('E_INTENT_FIELDS','套装请使用原批次审阅入口。');
    operation=((await api.storage.local.get(MARKET_OPERATIONS_STORE))[MARKET_OPERATIONS_STORE]||{})[handoff.operationId];
    status=await readMarketInstallStatus(api,handoff);
  }
  const readOnly=()=>handoff.consumedAt!==null||handoff.recoveryOnly||Boolean(operation)||status.installation!=='review';
  function showOpen(){
    const identical=Boolean(candidate&&baseline&&sameSidebarToolPackage(baseline,candidate.tool));
    const updated=Boolean(candidate&&baseline&&!identical);
    const outcome=identical?'当前已安装此版本':updated?'更新完成':'安装完成';
    publish({phase:'installed',message:outcome+' · 已核对本机 v'+status.installedVersion+'。'+
      (status.enabled===false?'应用仍保持停用，可在详情中管理。':'可查看应用详情。'),
      summary:[],technical:[]});
    controls([['details','查看应用',async()=>{
      // A painted success is not authority: read the original operation again.
      await localState();
      if(status.installation!=='installed'||status.installedVersion!==handoff.subject.version)
        throw marketError('E_NOT_INSTALLED','本次安装身份已变化，请核对原结果。');
      const id=handoff.subject.marketId.split('/')[1];
      const sha256=handoff.sha256||operation?.sha256;
      if(!/^[a-f0-9]{64}$/.test(sha256||'')||!openInstalledAppDetail||
        !await openInstalledAppDetail({marketId:handoff.subject.marketId,id,
          version:handoff.subject.version,sha256}))
        throw marketError('E_DETAIL_DEFERRED','安装结果已核对，但尚未进入应用详情；请检查当前侧边栏状态后重试。');
      closed=true;onClose();
    }],['done','完成',()=>{closed=true;onClose();}]]);
  }
  function recoveryControls(){
    if(status.installation==='installed'){showOpen();return;}
    if(status.installation==='cancelled'){
      publish({phase:'cancelled',message:'已取消，未提交安装。'});controls([['done','完成',()=>{closed=true;onClose();}]]);return;
    }
    const items=[['recover','核对原安装结果',recover]];
    if(handoff.consumedAt!==null&&!operation&&handoff.settledAt===null)
      items.push(['end','结束此交接（安装结果未知）',async()=>{
        await assertOwner();
        await closeUnjournaledReview({api,lockManager,reviewId,operationId:handoff.operationId,subject:handoff.subject,approved:true});
        await localState();publish({phase:'unknown',message:'已结束此交接，安装结果仍未知；未标记成功或取消。'});
        controls([['done','完成',()=>{closed=true;onClose();}]]);
      }]);
    items.push(['later','稍后继续',()=>{closed=true;onClose();}]);controls(items);
  }
  function retryControls(){controls([['reload','重新加载审阅',loadCandidate],['cancel','取消安装',cancel]]);}
  async function failed(error){
    let message=(error.code||'E_INSTALL')+'：'+error.message;
    if(handoff){try{await localState();if(readOnly())recoveryControls();else retryControls();}
      catch(localError){controls([['recover','核对原安装结果',recover]]);message+=' 本机记录读取失败：'+localError.message;}}
    else controls([['reload','重新加载审阅',loadCandidate]]);
    publish({phase:'error',message});
  }
  async function cancel(){
    await assertOwner();
    await cancelReviewIntent({api,lockManager,reviewId});await localState();
    if(status.installation!=='cancelled')throw marketError('E_OUTCOME_UNKNOWN','取消记录尚未核对，请核对原结果。');
    recoveryControls();
  }
  async function recover(){
    await localState();
    if(operation){
      await recoverMarketOperation({api,lockManager,operationId:handoff.operationId,expectedIdentity:marketExpectedIdentity(handoff,operation)});
      await settleReviewIntent({api,lockManager,reviewId});await localState();
    }
    const labels={review:'尚未提交',failed:'安装失败',unknown:'安装结果未知',installing:'安装中'};
    publish({phase:status.installation,message:'本次请求：'+(labels[status.installation]||'待核对')+'。'+
      (status.installedVersion?'当前本机版本：v'+status.installedVersion+'。':'')+'不会重复提交安装。'});
    recoveryControls();
  }
  async function commit(){
    await localState();if(readOnly()){await recover();return;}
    await assertOwner();if(closed)return;
    await assertCanInstall(candidate.tool.id);if(closed)return;
    publish({phase:'installing',message:'正在安装所选固定版本…'});
    const latest=await loadMarketTool(handoff.subject,{api,origin:handoff.origin});
    if(closed)return;
    if(latest.release.sha256!==candidate.release.sha256||!sameSidebarToolPackage(latest.tool,candidate.tool))
      throw marketError('E_PACKAGE_IDENTITY','发行内容在审阅后变化，未提交安装。请重新选择版本。');
    if(candidate.tool.capabilities.includes(FOCUS_CAPABILITY)){
      if(candidate.tool.id!==FOCUS_ID)throw marketError('E_TOOL_RUNTIME_UNAVAILABLE','此应用未获可信专注后台能力。');
      await probeStayFocusService({api,tool:candidate.tool});
    }
    if(closed)return;
    const result=await installReviewedSidebarTool({api,lockManager,candidate:candidate.tool,baseline,reviewApproved:true,
      market:{marketId:handoff.subject.marketId,sha256:candidate.release.sha256,operationId:handoff.operationId},
      approveSourceChange:()=>true,approveUpdate:()=>true,
      commitIntent:async()=>{
        if(closed)throw marketError('E_REVIEW_CLOSED','安装面板已关闭，未提交安装。');
        // Verify the exact real panel owner and source document immediately
        // before the original one-time consume marker, under its existing lock.
        const claimed=await assertOwner();
        await assertCanInstall(candidate.tool.id);
        if(closed)throw marketError('E_REVIEW_CLOSED','安装面板已关闭，未提交安装。');
        handoff=await consumeReviewIntent({api,lockManager,reviewId,operationId:handoff.operationId,
          subject:handoff.subject,sha256:candidate.release.sha256,
          panelOwnerDocumentId:claimed?.panelTarget?.owner?.documentId,
          assertReady:()=>{
            if(closed)throw marketError('E_REVIEW_CLOSED','安装面板已关闭，未提交安装。');
            return assertCanInstall(candidate.tool.id);
          },
          validate:async()=>{await assertCanInstall(candidate.tool.id);return assertOwner();}});
      }});
    if(!['installed','already-installed'].includes(result.state))throw marketError('E_OUTCOME_UNKNOWN','安装结果尚未确认。');
    await recover();
    if(status.installation!=='installed')throw marketError('E_OUTCOME_UNKNOWN','本次安装结果尚未核对，请核对原结果。');
  }
  async function loadCandidate(){
    await localState();
    if(readOnly()){await recover();return;}
    await assertOwner();if(closed)return;
    candidate=await loadMarketTool(handoff.subject,{api,origin:handoff.origin});if(closed)return;
    baseline=(await getInstalledSidebarTools(api)).find(tool=>tool.id===candidate.tool.id)||null;
    const capability=cap=>cap==='storage.local'?'在本机保存此应用的数据':'使用受限能力（'+cap+'）';
    const capabilityCodes=[...candidate.tool.capabilities];
    const addedCodes=capabilityCodes.filter(cap=>!baseline?.capabilities.includes(cap));
    const removedCodes=(baseline?.capabilities??[]).filter(cap=>!capabilityCodes.includes(cap));
    const capabilities=capabilityCodes.map(capability),addedCapabilities=addedCodes.map(capability);
    // Projection only: these fields come from the already validated, digest-pinned
    // package and the existing local enable record. No new install authority.
    publish({title:candidate.tool.title,phase:'review',details:{
      id:handoff.subject.marketId,version:candidate.tool.version,
      previousVersion:baseline?.version??null,origin:handoff.origin,
      description:candidate.tool.description,capabilities,addedCapabilities,
      capabilityCodes,addedCodes,removedCodes,
      packageBytes:candidate.release.bytes,sha256:candidate.release.sha256,
      previousDisabled:Boolean(baseline&&status.enabled===false),
      previousEnableKnown:Boolean(baseline&&typeof status.enabled==='boolean'),
      identicalInstalledPackage:Boolean(baseline&&sameSidebarToolPackage(baseline,candidate.tool))
    },summary:[
      '固定版本：v'+candidate.tool.version+(baseline?' · 当前 v'+baseline.version+'，保留工具数据':''),
      '来源：'+handoff.origin+'（本扩展配置的市场）',candidate.tool.description,
      '申请能力：'+(candidate.tool.capabilities.map(capability).join('、')||'无'),
      '新增能力：'+(candidate.tool.capabilities.filter(cap=>!baseline?.capabilities.includes(cap)).map(capability).join('、')||'无'),
      '应用在受限沙箱中运行。网站或敏感能力仍按原权限检查；安装后无需再次启用，已停用的应用更新后保持停用。',
      ...(baseline?['本次确认会替换此 ID 的已安装代码，请核对来源和能力。']:[])],
      technical:[handoff.subject.marketId,'SHA-256：'+candidate.release.sha256,'能力标识：'+candidate.tool.capabilities.join('、'),'安装包字节：'+candidate.release.bytes],
      message:'请确认安装版本、来源和权限。'});
    controls([['commit',baseline?'确认更新':'确认安装',commit],['cancel','取消安装',cancel]]);
  }
  const ready=loadCandidate().catch(failed);
  return {ready,getSnapshot:()=>model,dismiss:finish,
    async act(id){
      const run=actions.get(id);if(!run||model.busy||closed)return;
      publish({busy:true});
      try{await run();}catch(error){await failed(error);}finally{publish({busy:false});}
    },
    // Document destruction is NOT cancellation. In-flight installer outcomes
    // are recovered from the existing intent/journal, never resubmitted.
    dispose(){closed=true;}
  };
}

// Historical popup URLs are guidance only. Only the real Side Panel Sheet can
// approve; this document cannot become a second installation authority.
export function initMarketInstall({root=document.getElementById('market-root')}={}){
  root.replaceChildren();
  const heading=document.createElement('h1');heading.textContent='在侧边栏继续安装';
  const message=document.createElement('p');message.setAttribute('role','status');
  message.textContent='请回到市场所在的 Chrome 窗口，点击 OpenDesk 工具栏图标。同一安装请求会在侧边栏内呈现；打开侧边栏不会批准安装。';
  root.append(heading,message);return {ready:Promise.resolve(),dispose(){}};
}
