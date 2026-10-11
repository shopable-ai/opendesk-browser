// Thin Developer UI bridge for the existing Page / Task installation authorities.
// The only persistent installed state is still the original Page or Task registry.
import {createChromePermissionConsent} from '../platform/chrome/permission-gate.js';
import {prepareLocalProjectInstallation,assertLocalInstallVersion,
  commitLocalProjectInstallation} from './local-project-install.js';

const hash=/^[a-f0-9]{64}$/;
const issue=(code,message)=>Object.assign(new Error(message),{code});
export function createLocalInstallUI({client,api,doc,currentPageTarget,getProject,onState=()=>{}}){
  const find=id=>doc.getElementById(id);
  const panel=find('local-install-review'),summary=find('local-install-summary'),
    title=find('local-install-title'),version=find('local-install-version'),
    warning=find('local-install-warning'),status=find('local-install-status'),
    confirmButton=find('local-install-confirm'),cancelButton=find('local-install-cancel');
  let verified=null,review=null,preparing=false,installing=false,unknown=false,installed=null,disposed=false;
  let onInstalled=()=>{};
  const message=error=>(error?.code||'E_INSTALL')+'：'+(error?.message||String(error));
  const consent=createChromePermissionConsent({api,onChange(){
    if(disposed||installing)return;
    review=null;panel.hidden=true;onState();
  }});
  const project=()=>getProject?.();
  function current(){
    const local=project(),target=currentPageTarget?.snapshot;
    return !disposed&&!!verified&&!!local?.active()&&local.connected()&&
      verified.binding.bindingId===local.selectedBindingId()&&
      verified.binding.providerEpoch===local.providerEpoch()&&
      target?.status==='available'&&target.tabId===verified.target.tabId&&
      target.documentId===verified.target.documentId&&target.url===verified.target.url;
  }
  const canSave=()=>current()&&!preparing&&!installing&&!unknown;
  const sameInstalled=()=>installed&&verified&&installed.sourceHash===verified.source.sourceHash;
  function hide(){review=null;panel.hidden=true;confirmButton.disabled=true;}
  function reset(){
    verified=null;installed=null;unknown=false;hide();onState();
  }
  function update(){
    if(verified&&!current())reset();
    confirmButton.disabled=!review||preparing||installing||!current();
  }
  function succeeded({source,binding,target,runId=null}){
    if(!hash.test(source?.sourceHash)||!hash.test(source?.inputHash)||
      !Number.isSafeInteger(source?.sourceBytes)||source?.bindingId!==binding?.bindingId)
      return reset(); // Provider must identify exact build inputs before Save becomes available.
    verified={source:structuredClone(source),binding:structuredClone(binding),
      target:structuredClone(target),runId};
    installed=null;unknown=false;hide();onState();
  }
  async function prepare(){
    if(!canSave())throw issue('E_VERIFICATION','请先在当前网页成功运行本地确定版本并核对结果');
    if(sameInstalled()){onInstalled({kind:installed.kind,id:installed.id,focus:true});return;}
    const before=verified;
    preparing=true;onState();
    try{
      const local=project(),binding=local.capture();
      const source=await local.resolve(binding);
      assertLocalInstallVersion({kind:before.source.runtimeKind,bindingId:before.binding.bindingId,
        providerEpoch:before.binding.providerEpoch,sourceHash:before.source.sourceHash,
        inputHash:before.source.inputHash,sourceBytes:before.source.sourceBytes},source,binding);
      await currentPageTarget.revalidate(before.target);local.assertCaptured(binding);
      const planned=await prepareLocalProjectInstallation({client,source,binding,
        project:local.selectedProject(),target:before.target,runId:before.runId});
      const access=await consent.prepare({origins:planned.siteOrigins});
      if(!access||before!==verified||!current())throw issue('E_DEV_CONFLICT','项目、页面或权限状态在审阅期间改变，请重新运行');
      review={planned,source:structuredClone(source),binding:structuredClone(binding),target:structuredClone(before.target)};
      title.value=planned.defaultTitle;
      title.readOnly=planned.kind==='page-userscript';
      version.value=planned.version;
      summary.textContent=(planned.kind==='page-userscript'?'网页工具':'自动化任务')+
        (planned.installedVersion?' · 更新 '+planned.installedVersion+' → ':' · 安装 ')+planned.version+
        '\n适用网站：'+planned.siteOrigins.join('、')+
        '\n源码 SHA-256：'+planned.sourceHash+'\n输入版本：'+planned.inputHash;
      warning.textContent=planned.needsReexecution
        ?'确认安装会在当前文档再次执行相同的冻结 Page 程序以完成正式验证，可能再次产生网页效果；验证成功后才安装。'
        :'本次安装只核对原 Controller 持久结果与原生页面操作回执，不再运行脚本。';
      status.textContent='尚未安装。请先核对网站、版本和可能的再次执行。';
      panel.hidden=false;
    }finally{preparing=false;update();onState();}
  }
  function confirm(event){
    if(!event?.isTrusted||!review||installing||!current())return;
    const selected=review;
    // Permission request is made synchronously from a trusted confirmation click.
    const permission=consent.confirm(event,{origins:selected.planned.siteOrigins});
    installing=true;update();onState();status.textContent='正在验证已确认的固定源码和安装基线…';
    void (async()=>{
      await permission;
      if(disposed||review!==selected)throw issue('E_DEV_CONFLICT','安装确认已失效');
      const local=project(),binding=local.capture(),source=await local.resolve(binding);
      assertLocalInstallVersion(selected.planned,source,binding);
      await currentPageTarget.revalidate(selected.target);local.assertCaptured(binding);
      if(!current())throw issue('E_DEV_CONFLICT','网页或来源已变化，不得使用旧验证安装');
      const result=await commitLocalProjectInstallation({client,review:selected.planned,source,
        target:selected.target,title:title.value.trim(),version:version.value.trim()});
      if(disposed)return;
      installed={...result,sourceHash:source.sourceHash};
      hide();status.textContent='已安装固定版本；修改本地源码不会自动更新已安装内容。';
      onInstalled({kind:result.kind,id:result.id,version:result.version});
    })().catch(error=>{
      if(disposed)return;
      // The submit/ack phase may be unknown. Never automatically replay it.
      unknown=true;review=null;confirmButton.disabled=true;
      status.textContent=message(error)+'。原有安装保留；请先在正式列表只读核对持久状态，不要重复提交。';
      panel.hidden=false;
    }).finally(()=>{installing=false;if(!disposed){update();onState();}});
  }
  const cancel=()=>{if(installing)return;hide();onState();};
  const onConfirm=event=>confirm(event),onCancel=()=>cancel();
  confirmButton.addEventListener('click',onConfirm);
  cancelButton.addEventListener('click',onCancel);
  return Object.freeze({canSave,saveLabel:()=>!current()?'待运行验证':unknown?'核对安装状态':
    sameInstalled()?'管理已安装版本':
    verified.source.runtimeKind==='page-userscript'?'保存到我的工具':'保存为任务',
    update,reset,succeeded,prepare,confirm,setOnInstalled(fn){onInstalled=fn||(()=>{});},
    dispose(){disposed=true;consent.dispose();confirmButton.removeEventListener('click',onConfirm);
      cancelButton.removeEventListener('click',onCancel);}});
}
