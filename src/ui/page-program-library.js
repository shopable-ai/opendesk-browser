import {createChromePermissionConsent,requireChromePermissions} from '../platform/chrome/permission-gate.js';

// Existing Sidebar subpanel; Chrome observations are ephemeral, and program
// authorization stays in the original Installed Page / Authority records.
export function createPageProgramLibrary({client,currentPageTarget,api,document:doc,onLoad}){
  const find=id=>doc.getElementById(id),select=find('page-program-list');
  if(!select)return {refresh:async()=>{},dispose(){}};
  const status=find('page-program-status'),detail=find('page-program-detail');
  const button=name=>find('page-program-'+name);
  const listeners=[];let rows=[],busy=false,disposed=false,sequence=0,accessSequence=0,candidateAccess=null,installedAccess=null;
  const identity=row=>row.programId+':'+row.revision;
  const chosen=()=>rows.find(row=>identity(row)===select.value);
  const requestFor=row=>({origins:row.pageRules.matches});
  const showError=error=>{if(!disposed)status.textContent=(error.code||'E_PAGE_INSTALLATION')+'：'+(error.message||error);};
  const consent=createChromePermissionConsent({api,onChange(){
    candidateAccess=installedAccess=null;render();void refresh().catch(showError);
  }});
  const assertOpen=()=>{if(disposed)throw Object.assign(new Error('脚本管理已关闭'),{code:'E_HOST_CLOSED'});};
  function render(){
    if(disposed)return;
    const row=chosen(),install=row?.installed,grant=install?.authorization;
    select.disabled=busy;
    button('load').disabled=busy||!row;
    button('verify').disabled=busy||!row||row.stage!=='Candidate';
    const needsConfirmation=install&&(!grant||grant.status==='needs-confirmation');
    button('install').disabled=busy||!row||!candidateAccess||!['Verified','Available'].includes(row.stage)||
      install?.manifestHash===row.manifestHash&&!needsConfirmation;
    button('install').textContent=needsConfirmation?'重新确认安装':install&&row?.authorizationChange?.requiresConfirmation?'确认新增权限并升级':install?'安装此版本':'安装自动运行';
    button('toggle').disabled=busy||!install;
    button('toggle').textContent=install?.enabled?'停用自动运行':'启用自动运行';
    button('refresh').disabled=busy;
    const selectedIsInstalled=install?.manifestHash===row?.manifestHash;
    const restricted=selectedIsInstalled&&grant?.status==='suspended';
    button('restore').hidden=!restricted&&candidateAccess?.granted!==false;
    button('restore').disabled=busy||!candidateAccess;
    if(!row){detail.textContent='保存网页脚本版本后，在这里核对、安装与停用。';return;}
    const access=!candidateAccess?'正在检查':candidateAccess.granted?'已满足':'访问受限 · 恢复访问';
    const installedStatus=!install?'':!install.enabled?'已停用':!installedAccess?'正在检查':
      !installedAccess.granted||grant?.status==='suspended'?'访问受限 · 请选择已安装版本恢复':
      grant?.status==='active'?'已授权':'需要确认安装授权';
    const delta=install&&row.authorizationChange?.requiresConfirmation?row.authorizationChange:null;
    detail.textContent=`${row.programId} · r${row.revision} · ${row.stage}\n`+
      '匹配：'+row.pageRules.matches.join('、')+'\n当前版本的网站访问：'+access+
      '\n程序能力：隔离网页 DOM；不继承扩展、其他程序或独立网页 SDK 的权限。'+
      (delta?'\n新增权限需要确认：'+[
        ...delta.addedSites.map(site=>'新增网站 '+site),
        ...delta.removedExclusions.map(site=>'不再排除 '+site),
        ...(delta.changedExecution?['运行环境或时机改变']:[])].join('；'):'')+
      '\n源码 SHA-256：'+row.sourceHash+
      (install?`\n安装：r${install.revision} · ${installedStatus} · ${install.nativeState}`:'\n尚未安装')+
      (install?.error?'\n'+install.error.code+'：'+install.error.message:'')+
      (install?.lastExecution?'\n最近执行：'+install.lastExecution.state+' · '+install.lastExecution.documentId+
        (install.lastExecution.error?'\n'+install.lastExecution.error.code+'：'+install.lastExecution.error.message:
          '\n结果：'+(install.lastExecution.result?.resultText??'尚未返回')):'');
  }
  async function readAccess(){
    const seq=++accessSequence,row=chosen();candidateAccess=installedAccess=null;render();
    if(!row)return;
    let candidate,installed;
    try{[candidate,installed]=await Promise.all([consent.prepare(requestFor(row)),row.installed?consent.prepare(requestFor(row.installed)):null]);}
    catch(error){if(!disposed&&seq===accessSequence&&chosen()===row)showError(error);return;}
    if(disposed||seq!==accessSequence||chosen()!==row)return;
    candidateAccess=candidate;installedAccess=installed;render();
  }
  async function refresh(preferred){
    const seq=++sequence,result=await client.request('listPagePrograms',{});
    if(disposed||seq!==sequence)return;
    const previous=preferred??select.value;rows=result.catalog;select.replaceChildren();
    if(!rows.length){const option=doc.createElement('option');option.value='';option.textContent='尚未保存网页脚本';select.append(option);}
    for(const row of rows){const option=doc.createElement('option');option.value=identity(row);option.textContent=`${row.programId} · r${row.revision} · ${row.stage}`;select.append(option);}
    if(rows.some(row=>identity(row)===previous))select.value=previous;
    render();await readAccess();
  }
  const listen=(node,event,callback)=>{node.addEventListener(event,callback);listeners.push([node,event,callback]);};
  const operation=(name,work)=>listen(button(name),'click',event=>{
    if(!event.isTrusted||busy||disposed)return;
    const row=structuredClone(chosen());busy=true;render();status.textContent='正在核对…';
    let pending;try{pending=work(row,event);}catch(error){pending=Promise.reject(error);}
    Promise.resolve(pending).then(message=>{if(!disposed)status.textContent=message;}).catch(showError)
      .finally(async()=>{busy=false;if(disposed)return;try{await refresh(row&&identity(row));}catch(error){showError(error);}render();});
  });
  listen(select,'change',()=>{void readAccess().catch(showError);});
  operation('refresh',async()=>{await refresh();return '已读取持久版本和授权状态。';});
  operation('load',async row=>{if(!row)throw new Error('请选择已保存版本');await onLoad(row);return '已载入固定 Page 源码；编辑不会修改已安装版本。';});
  operation('verify',async row=>{
    if(!row)throw new Error('请选择已保存版本');
    const captured=currentPageTarget.capture();await requireChromePermissions({api,request:requestFor(row)});assertOpen();
    await currentPageTarget.revalidate(captured);assertOpen();
    await client.request('verifyPageCandidate',{programId:row.programId,revision:row.revision,
      target:{tabId:captured.tabId,frameId:0,documentId:captured.documentId,expectedUrl:captured.url,expectedWindowId:captured.windowId}});
    return '固定版本已在当前网页验证；可安装。验证可能产生网页效果。';
  });
  operation('install',(row,event)=>{
    if(!row)throw new Error('请选择已验证版本');
    const permission=consent.confirm(event,requestFor(row));
    return (async()=>{
      await permission;assertOpen();
      const request={programId:row.programId,revision:row.revision,manifestHash:row.manifestHash};
      if(row.stage==='Verified'){await client.request('makePageAvailable',request);assertOpen();}
      const result=await client.request('installPageProgram',{...request,expectedInstalledManifestHash:row.installed?.manifestHash??null,
        expectedGeneration:row.installed?.authorization?.generation??null});
      if(result.nativeState!=='registered')throw result.error||new Error('原生注册尚未确认');
      return '已安装并授权；以后进入匹配网页自动运行。当前网页不会自动重放。';
    })();
  });
  operation('toggle',async row=>{
    if(!row?.installed)throw new Error('尚未安装');const enabled=!row.installed.enabled;
    if(enabled)await requireChromePermissions({api,request:requestFor(row.installed)});assertOpen();
    const result=await client.request('setInstalledPageEnabled',{programId:row.programId,manifestHash:row.installed.manifestHash,enabled,
      expectedGeneration:row.installed.authorization?.generation??null});
    if(result.error)throw result.error;
    return enabled?'已启用；下次进入匹配网页自动运行。':'已停用后续自动执行。刷新原网页可清除旧脚本的界面、监听器和计时器；已发生的效果不会回滚。';
  });
  operation('restore',(row,event)=>{
    if(!row)throw new Error('请选择脚本');
    const permission=consent.confirm(event,requestFor(row));
    return (async()=>{
      await permission;assertOpen();
      if(row.installed?.manifestHash===row.manifestHash){
        // The permission event and Worker suspension may settle after the UI
        // preflight. Re-read only this exact installation, never a replacement
        // version or a reinstall. Restoring Chrome alone must not claim that a
        // still-suspended program has resumed or require a second Restore click.
        const catalog=await client.request('listPagePrograms',{});assertOpen();
        const current=catalog.catalog.find(value=>value.programId===row.programId&&value.manifestHash===row.manifestHash)?.installed;
        if(!current||current.manifestHash!==row.manifestHash||!row.installed.authorization?.installationId||
          current.authorization?.installationId!==row.installed.authorization.installationId)
          throw {code:'E_REVISION',message:'程序安装在恢复期间改变，请刷新后重新核对'};
        if(!current.enabled)return '网站访问已恢复；程序仍已停用，请核对后手动启用。';
        if(!row.installed.enabled)throw {code:'E_REVISION',message:'程序启用状态在恢复期间改变，请刷新后重新核对'};
        if(current.authorization.status==='suspended'){
          const result=await client.request('setInstalledPageEnabled',{programId:row.programId,manifestHash:current.manifestHash,enabled:true,
            expectedGeneration:current.authorization.generation});
          if(result.error)throw result.error;
        }else if(current.authorization.status!=='active')throw {code:'E_PAGE_AUTHORIZATION',message:'请重新核对并安装此固定版本'};
      }
      return row.installed?.manifestHash===row.manifestHash?
        '访问已恢复。未重放当前网页；请手动运行，或进入下一个匹配网页。':
        '当前版本的网站访问已恢复；请验证并明确安装。原安装未改变，当前网页未重放。';
    })();
  });
  client.ready.then(()=>refresh()).catch(showError);
  return {refresh,dispose(){disposed=true;sequence++;accessSequence++;consent.dispose();for(const [node,event,fn]of listeners)node.removeEventListener(event,fn);}};
}
