import {loadMarketTool} from './distribution.js';
import {loadReviewIntent,consumeReviewIntent,settleReviewIntent,marketError} from './intent.js';
import {getInstalledSidebarTools,installReviewedSidebarTool,recoverMarketOperation,sameSidebarToolPackage,MARKET_OPERATIONS_STORE} from '../ui/sidebar-tools/installation.js';
import {toolPageHref} from '../ui/sidebar-tools/navigation.js';
import {FOCUS_ID,FOCUS_CAPABILITY} from '../../examples/sidebar-tools/stay-focus/trusted/policy.js';
import {probeStayFocusService} from '../../examples/sidebar-tools/stay-focus/trusted/tool-host.js';

// A small trusted review surface; package JS is only stored by the shared
// installer, then runs on explicit Open in the existing opaque sandbox.
export function initMarketInstall({api=globalThis.chrome,root=document.getElementById('market-root'),lockManager=navigator.locks}={}){
  let handoff,candidate,baseline,busy=false,closed=false;
  const node=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
  const message=node('p','正在从市场核对固定版本…');message.setAttribute('role','status');
  const controls=node('div','');controls.className='actions';
  root.replaceChildren(node('h1','安装应用'),message,controls);
  const say=text=>{message.textContent=text;};
  const action=(label,run)=>{const el=node('button',label);el.type='button';el.className='market-button';
    el.addEventListener('click',async()=>{if(busy||closed)return;busy=true;for(const button of controls.children)button.disabled=true;
      try{await run();}catch(error){say((error.code||'E_INSTALL')+'：'+error.message);controls.replaceChildren();
        action('核对原安装结果',recover);}
      finally{busy=false;for(const button of controls.children)button.disabled=false;}});controls.append(el);return el;};
  const showOpen=()=>{say('已核对本机安装：v'+candidate.tool.version+'。点击打开即可使用。');controls.replaceChildren();
    action('打开使用',()=>api.tabs.create({url:toolPageHref(api.runtime,candidate.tool.id)}));
    action('完成',()=>window.close());};
  async function recover(){
    const operationId=handoff.operationId;
    const result=await recoverMarketOperation({api,lockManager,operationId});
    const installed=await getInstalledSidebarTools(api);
    if(result.state==='succeeded'&&installed.some(tool=>sameSidebarToolPackage(tool,candidate.tool))){
      await settleReviewIntent({api,lockManager,reviewId:handoff.reviewId});showOpen();
    }else say('原安装结果：'+result.state+'。未重新提交安装，请保留此窗口核对。');
  }
  async function commit(){
    say('正在安装所选固定版本…');
    const latest=await loadMarketTool(handoff.subject,{api,origin:handoff.origin});
    if(latest.release.sha256!==candidate.release.sha256||!sameSidebarToolPackage(latest.tool,candidate.tool))
      throw marketError('E_PACKAGE_IDENTITY','发行内容在审阅后变化，未提交安装。请重新选择版本。');
    if(candidate.tool.capabilities.includes(FOCUS_CAPABILITY)){
      if(candidate.tool.id!==FOCUS_ID)throw marketError('E_TOOL_RUNTIME_UNAVAILABLE','此应用未获可信专注后台能力。');
      await probeStayFocusService({api,tool:candidate.tool});
    }
    const result=await installReviewedSidebarTool({api,lockManager,candidate:candidate.tool,baseline,reviewApproved:true,
      market:{marketId:handoff.subject.marketId,sha256:candidate.release.sha256,operationId:handoff.operationId},
      approveSourceChange:()=>true,approveUpdate:()=>true,
      commitIntent:async()=>{handoff=await consumeReviewIntent({api,lockManager,reviewId:handoff.reviewId,
        operationId:handoff.operationId,subject:handoff.subject});}});
    if(!['installed','already-installed'].includes(result.state))throw marketError('E_OUTCOME_UNKNOWN','安装结果尚未确认。');
    if(!(await getInstalledSidebarTools(api)).some(tool=>sameSidebarToolPackage(tool,candidate.tool)))
      throw marketError('E_OUTCOME_UNKNOWN','本机安装读回不一致，请核对原结果。');
    await settleReviewIntent({api,lockManager,reviewId:handoff.reviewId});showOpen();
  }
  const ready=(async()=>{
    const ids=new URLSearchParams(location.search).getAll('intent');
    if(ids.length!==1)throw marketError('E_INTENT_MISSING','缺少唯一安装请求。');
    handoff=await loadReviewIntent(api,ids[0]);
    candidate=await loadMarketTool(handoff.subject,{api,origin:handoff.origin});
    baseline=(await getInstalledSidebarTools(api)).find(tool=>tool.id===candidate.tool.id)||null;
    root.querySelector('h1').textContent=candidate.tool.title;
    const summary=node('section','');summary.className='surface';
    for(const text of ['版本：v'+candidate.tool.version+(baseline?'（本机 v'+baseline.version+'，保留工具数据）':''),
      '来源：'+handoff.origin+'（本扩展配置的市场）',candidate.tool.description,
      '申请能力：'+(candidate.tool.capabilities.join('、')||'无'),
      '新增能力：'+(candidate.tool.capabilities.filter(cap=>!baseline?.capabilities.includes(cap)).join('、')||'无'),
      '应用在受限沙箱中运行。网站或敏感能力仍按原权限检查；安装后无需再次启用。',
      ...(baseline?['本次确认会替换此 ID 的已安装代码，请核对来源和能力。']:[])])summary.append(node('p',text));
    const details=node('details','');details.append(node('summary','固定发行信息'),node('p',handoff.subject.marketId),node('p','SHA-256：'+candidate.release.sha256));summary.append(details);
    root.insertBefore(summary,message);
    const operations=(await api.storage.local.get(MARKET_OPERATIONS_STORE))[MARKET_OPERATIONS_STORE]||{};
    if(handoff.consumedAt!==null||handoff.recoveryOnly||operations[handoff.operationId]){
      say('此请求已有安装记录，请核对原结果；不会自动重新安装。');action('核对原安装结果',recover);return;
    }
    say('请核对版本、来源和申请能力。取消不会修改安装记录。');
    action(baseline?'确认更新 / 安装':'确认安装',commit);
    action('取消',()=>{closed=true;say('已取消，未提交安装。');controls.replaceChildren();window.close();});
  })().catch(error=>{say((error.code||'E_PACKAGE')+'：'+error.message);});
  return {ready,dispose(){closed=true;}};
}
