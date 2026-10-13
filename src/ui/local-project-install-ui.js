// Thin Developer UI bridge for the existing Page / Task installation authorities.
// The only persistent installed state is still the original Page or Task registry.
import {createChromePermissionConsent} from '../platform/chrome/permission-gate.js';
import {permissionPattern} from '../environment.js';
import {prepareLocalProjectInstallation,assertLocalInstallVersion,assertLocalInstallTitle,
  commitLocalProjectInstallation,readLocalInstallOutcome,sourceContract} from './local-project-install.js';

const hash=/^[a-f0-9]{64}$/;
const issue=(code,message)=>Object.assign(new Error(message),{code});
export function createLocalInstallUI({client,api,doc,currentPageTarget,getProject,retireManagedPreview,onState=()=>{}}){
  const find=id=>doc.getElementById(id);
  const panel=find('local-install-review'),summary=find('local-install-summary'),
    title=find('local-install-title'),version=find('local-install-version'),
    warning=find('local-install-warning'),status=find('local-install-status'),
    confirmButton=find('local-install-confirm'),cancelButton=find('local-install-cancel');
  let verified=null,review=null,preparing=false,installing=false,unknown=false,installed=null,disposed=false;
  let unknownReview=null,reconciling=false;
  let onInstalled=()=>{};
  const message=error=>(error?.code||'E_INSTALL')+'：'+(error?.message||String(error));
  const say=(text,state='info')=>{status.textContent=text;status.dataset.state=state;};
  const consent=createChromePermissionConsent({api,onChange(){
    if(disposed||installing)return;
    review=null;panel.hidden=true;onState();
  }});
  function reveal(){
    panel.hidden=false;
    panel.scrollIntoView?.({block:'nearest'});
    panel.focus?.();
  }
  const project=()=>getProject?.();
  const permissionRequest=planned=>({origins:planned.kind==='page-userscript'
    ?planned.siteOrigins:planned.siteOrigins.map(permissionPattern)});
  function sourceCurrent(){
    const local=project();
    return !disposed&&!!verified&&!!local?.active()&&local.connected()&&
      verified.binding.bindingId===local.selectedBindingId()&&
      verified.binding.providerEpoch===local.providerEpoch()&&
      verified.preparationIdentity===local.preparationIdentity();
  }
  function current(){
    const target=currentPageTarget?.snapshot;
    return sourceCurrent()&&
      target?.status==='available'&&target.tabId===verified.target.tabId&&
      target.windowId===verified.target.windowId&&(target.frameId??0)===(verified.target.frameId??0)&&
      target.documentId===verified.target.documentId&&target.url===verified.target.url;
  }
  const canSave=()=>unknown?!!unknownReview&&!reconciling&&!installing&&!preparing:
    current()&&!preparing&&!installing;
  const sameInstalled=()=>installed&&verified&&installed.sourceHash===verified.source.sourceHash&&
    installed.inputHash===verified.source.inputHash;
  function hide(){review=null;panel.hidden=true;confirmButton.disabled=true;}
  function reset(){
    verified=null;installed=null;unknown=false;unknownReview=null;hide();onState();
  }
  function update(){
    const target=currentPageTarget?.snapshot;
    // Block Save while a passive refresh resolves identity; retain the original
    // proof only until the same window's actual document can be compared again.
    const resolvingSameWindow=sourceCurrent()&&target?.status==='resolving'&&
      target.windowId===verified.target.windowId;
    if(verified&&!current()&&!resolvingSameWindow&&!unknown)reset();
    confirmButton.disabled=unknown?!unknownReview||reconciling||installing:
      !review||preparing||installing||!current();
    confirmButton.textContent=reconciling?'正在核对…':installing?'正在保存…':
      unknown?'只读核对已安装状态':'确认安装固定版本';
    cancelButton.disabled=preparing||installing||reconciling;
    title.readOnly=version.readOnly=unknown||preparing||installing||reconciling;
  }
  function succeeded({source,binding,target,runId=null,previewId=null}){
    if(!hash.test(source?.sourceHash)||!hash.test(source?.inputHash)||
      !Number.isSafeInteger(source?.sourceBytes)||source?.bindingId!==binding?.bindingId)
      return reset(); // Provider must identify exact build inputs before Save becomes available.
    verified={source:structuredClone(source),binding:structuredClone(binding),
      target:structuredClone(target),runId,previewId,preparationIdentity:project()?.preparationIdentity()};
    installed=null;unknown=false;unknownReview=null;hide();onState();
    // Read the ORIGINAL authoritative Page/Task catalog to recover the exact
    // installed version across Sidebar restarts; no parallel installation DB.
    const snapshot=verified;
    void prepareLocalProjectInstallation({client,source,binding,
      project:project()?.selectedProject(),target,runId})
      .then(row=>{
        if(disposed||verified!==snapshot||!current())return;
        if(row.alreadyInstalled)installed={kind:row.kind,id:row.id,
          sourceHash:source.sourceHash,inputHash:source.inputHash};
        onState();
      }).catch(()=>{ /* Read failure is not evidence of an installation. */ });
  }
  async function reconcileUnknown(){
    if(!unknown||!unknownReview||reconciling||disposed)return;
    const pending=unknownReview;reconciling=true;
    say('正在读取已安装版本；不会重新运行或安装…','pending');
    reveal();update();onState();
    try{
      const observed=await readLocalInstallOutcome({client,review:pending,
        version:pending.attemptedVersion});
      if(disposed||unknownReview!==pending)return;
      if(observed.state==='confirmed'){
        installed={...observed,sourceHash:pending.sourceHash,inputHash:pending.inputHash};
        unknown=false;unknownReview=null;hide();
        say('已从原持久安装记录确认确定版本，不会再次执行脚本或提交安装。','success');
        onInstalled({kind:observed.kind,id:observed.id,version:observed.version,focus:true});
      }else{
        const stateText={
          'not-installed':'没有查到这个确定版本的安装记录',
          'baseline-unchanged':'当前仍是此前安装的旧版本',
          unconfirmed:'安装记录存在，但版本、源码或原生注册状态尚未全部确认'
        }[observed.state]||'安装状态尚未确认';
        say(stateText+'；未执行、未重新安装。效果未知时禁止盲目重试。','unknown');
        panel.hidden=false;
      }
    }catch(error){
      if(!disposed)say(message(error)+'；只读核对失败，尚未重试任何安装或验证。','unknown');
    }finally{reconciling=false;if(!disposed){update();onState();}}
  }
  async function prepare(){
    if(disposed||preparing||installing||reconciling)return;
    if(unknown&&unknownReview)return reconcileUnknown();
    if(!canSave())throw issue('E_VERIFICATION','请先在当前网页成功运行本地确定版本并核对结果');
    if(sameInstalled()){onInstalled({kind:installed.kind,id:installed.id,focus:true});return;}
    if(review){reveal();return;}
    const before=verified;
    preparing=true;
    say('正在准备保存，请稍候…','pending');reveal();update();onState();
    try{
      const local=project(),binding=local.capture();
      const source=await local.resolve(binding);
      assertLocalInstallVersion({kind:before.source.runtimeKind,bindingId:before.binding.bindingId,
        providerEpoch:before.binding.providerEpoch,sourceHash:before.source.sourceHash,
        inputHash:before.source.inputHash,sourceBytes:before.source.sourceBytes,
        sourceContract:sourceContract(before.source)},source,binding);
      await currentPageTarget.revalidate(before.target);local.assertCaptured(binding);
      const planned=await prepareLocalProjectInstallation({client,source,binding,
        project:local.selectedProject(),target:before.target,runId:before.runId});
      if(planned.alreadyInstalled){
        if(disposed||before!==verified||!current())throw issue('E_DEV_CONFLICT','已安装状态核对期间项目或网页改变');
        installed={kind:planned.kind,id:planned.id,sourceHash:source.sourceHash,inputHash:source.inputHash};
        onInstalled({kind:planned.kind,id:planned.id,focus:true});
        return;
      }
      const access=await consent.prepare(permissionRequest(planned));
      if(!access||before!==verified||!current())throw issue('E_DEV_CONFLICT','项目、页面或权限状态在审阅期间改变，请重新运行');
      review={planned,source:structuredClone(source),binding:structuredClone(binding),target:structuredClone(before.target),previewId:before.previewId};
      title.value=planned.defaultTitle;
      title.readOnly=false;
      version.value=planned.version;
      summary.textContent=(planned.kind==='page-userscript'?'网页工具':'自动化任务')+
        (planned.installedVersion?' · 更新 '+planned.installedVersion+' → ':' · 安装 ')+planned.version+
        (planned.installedVersion?'\n原网站范围：'+planned.installedSiteOrigins.join('、'):'')+
        '\n适用网站：'+planned.siteOrigins.join('、')+
        '\n源码 SHA-256：'+planned.sourceHash+'\n输入版本：'+planned.inputHash;
      warning.textContent=(planned.scopeChanged?'网站/权限范围与旧版不同，必须审阅后重新确认。\n':'')+(planned.needsReexecution
        ?'确认安装会在当前文档再次执行相同的冻结 Page 程序以完成正式验证，可能再次产生网页效果；验证成功后才安装。'
        :'本次安装只核对原 Controller 持久结果与原生页面操作回执，不再运行脚本。');
      say('尚未安装。请先核对网站、版本和可能的再次执行。');
      panel.hidden=false;
      // The Save action lives in the sticky bottom dock while this review is
      // in the source area. Move keyboard focus to the actual visible review
      // so narrow Side Panels and screen readers do not miss confirmation.
      reveal();
    }catch(error){
      if(!disposed){say(message(error)+'。尚未提交安装，请检查后重试。','error');reveal();}
      throw error;
    }finally{preparing=false;if(!disposed){update();onState();}}
  }
  function confirm(event){
    if(!event?.isTrusted)return;
    if(unknown&&unknownReview){void reconcileUnknown();return;}
    if(!review||installing||!current())return;
    const selected=review;
    // Freeze user-reviewed labels and version synchronously with the real click:
    // editing fields while an asynchronous permission prompt is open cannot
    // swap the Task version or title after approval.
    let approvedTitle;
    try{approvedTitle=assertLocalInstallTitle(title.value);}catch(error){say(message(error),'error');title.focus();return;}
    const approvedVersion=version.value.trim();
    const validVersion=selected.planned.kind==='page-userscript'
      ?/^[1-9]\d*$/.test(approvedVersion)&&Number.isSafeInteger(Number(approvedVersion))
      :/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(approvedVersion);
    if(!validVersion||approvedVersion.length>24){
      say(selected.planned.kind==='page-userscript'?'版本必须为正整数，例如 1。':
        '版本必须为三段数字，例如 1.0.0，最多 24 个字符。','error');
      version.focus();return;
    }
    // Permission request is made synchronously from a trusted confirmation click.
    const permission=consent.confirm(event,permissionRequest(selected.planned));
    installing=true;update();onState();say('正在验证已确认的固定源码和安装基线…','pending');
    let dispatched=false,attemptedManifestHash=null;
    void (async()=>{
      await permission;
      if(disposed||review!==selected)throw issue('E_DEV_CONFLICT','安装确认已失效');
      const local=project(),binding=local.capture(),source=await local.resolve(binding);
      assertLocalInstallVersion(selected.planned,source,binding);
      if((local.selectedProject()?.sourceId||'')!==selected.planned.projectSourceId)
        throw issue('E_DEV_CONFLICT','原本审阅的项目来源身份已变化，请重新运行');
      await currentPageTarget.revalidate(selected.target);local.assertCaptured(binding);
      if(!current())throw issue('E_DEV_CONFLICT','网页或来源已变化，不得使用旧验证安装');
      if(source.runtimeKind==='page-userscript'&&source.managedUI){
        if(typeof retireManagedPreview!=='function'||!selected.previewId)
          throw issue('E_UI_RETIRE_REQUIRED','需要原本地预览的清理入口，才能正式验证固定版本');
        say('正在清理本次运行的原受管预览；确认回执后再正式验证固定源码…','pending');
        dispatched=true;
        const retired=await retireManagedPreview({source,binding,target:selected.target,previewId:selected.previewId});
        if(retired?.previewId!==selected.previewId||retired.sourceHash!==source.sourceHash||
          retired.state!=='preview-retired'||retired.receipt?.ok!==true||
          retired.receipt.scope!=='managed-ui-only')
          throw issue('E_EFFECT_UNKNOWN','原受管预览清理回执未确认，不得继续验证或安装');
        await currentPageTarget.revalidate(selected.target);local.assertCaptured(binding);
        if(review!==selected||verified?.previewId!==selected.previewId||!current())
          throw issue('E_DEV_CONFLICT','清理期间来源、预览或网页已变化，原安装保留');
      }
      // The following workflow may persist a Candidate or replay Page Verify.
      // Only errors before this boundary are guaranteed not to have an effect.
      dispatched=true;
      const result=await commitLocalProjectInstallation({client,review:selected.planned,source,
        target:selected.target,title:approvedTitle,version:approvedVersion,
        onCandidate:value=>{attemptedManifestHash=value;}});
      if(disposed)return;
      installed={...result,sourceHash:source.sourceHash,inputHash:source.inputHash};
      hide();say('已安装固定版本；修改本地源码不会自动更新已安装内容。','success');
      onInstalled({kind:result.kind,id:result.id,version:result.version});
    })().catch(error=>{
      if(disposed)return;
      const rejectedBeforeDispatch=!dispatched&&
        ['E_PERMISSION','E_GESTURE','E_PERMISSION_CHECK_REQUIRED'].includes(error?.code);
      // Explicitly denied permissions cannot leave an ambiguous install receipt;
      // allow a fresh, deliberate review without requiring a second business Run.
      // After any possible candidate/verify/install effect, fail closed.
      unknown=!rejectedBeforeDispatch;
      unknownReview=unknown?{...selected.planned,attemptedVersion:approvedVersion,
        attemptedManifestHash,attemptedTitle:approvedTitle}:null;
      review=null;confirmButton.disabled=true;
      say(rejectedBeforeDispatch
        ?message(error)+'。尚未提交安装；检查网站访问后可以再次点击底部保存进行审阅。'
        :message(error)+'。原有安装保留；先在正式列表只读核对持久状态，禁止盲目重试。',
        rejectedBeforeDispatch?'error':'unknown');
      panel.hidden=false;
    }).finally(()=>{installing=false;if(!disposed){update();onState();}});
  }
  const cancel=()=>{if(preparing||installing||reconciling)return;hide();onState();};
  const onConfirm=event=>confirm(event),onCancel=()=>cancel();
  confirmButton.addEventListener('click',onConfirm);
  cancelButton.addEventListener('click',onCancel);
  return Object.freeze({canSave,saveLabel:()=>reconciling?'正在核对…':installing?'正在保存…':
    preparing?'正在准备保存…':unknown?'核对安装状态':!current()?'待运行验证':
    sameInstalled()?'管理已安装版本':review?'继续确认保存':
    verified.source.runtimeKind==='page-userscript'?'保存到我的工具':'保存为任务',
    update,reset,succeeded,prepare,confirm,setOnInstalled(fn){onInstalled=fn||(()=>{});},
    dispose(){disposed=true;consent.dispose();confirmButton.removeEventListener('click',onConfirm);
      cancelButton.removeEventListener('click',onCancel);}});
}
