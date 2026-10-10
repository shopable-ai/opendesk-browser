// Existing Sidebar subpanel, no extra tab, project format or execution engine.
export function createPageProgramLibrary({client,currentPageTarget,api,document:doc,onLoad}){
  const find=id=>doc.getElementById(id),select=find('page-program-list');
  if(!select)return {refresh:async()=>{},dispose(){}};
  const status=find('page-program-status'),detail=find('page-program-detail');
  const buttons=['load','verify','install','toggle','refresh'].map(name=>find('page-program-'+name));
  const listeners=[];let rows=[],busy=false,disposed=false,sequence=0;
  const identity=row=>row.programId+':'+row.revision;
  const chosen=()=>rows.find(row=>identity(row)===select.value);
  function render(){
    const row=chosen(),install=row?.installed;
    buttons[0].disabled=busy||!row;buttons[1].disabled=busy||!row||row.stage!=='Candidate';
    buttons[2].disabled=busy||!row||!['Verified','Available'].includes(row.stage)||install?.manifestHash===row.manifestHash;
    buttons[3].disabled=busy||!install;buttons[4].disabled=busy;
    buttons[3].textContent=install?.enabled?'停用自动运行':'启用自动运行';
    if(!row){detail.textContent='保存网页脚本版本后，在这里核对、安装与停用。';return;}
    detail.textContent=`${row.programId} · r${row.revision} · ${row.stage}\n`+
      '匹配：'+row.pageRules.matches.join('、')+'\n源码 SHA-256：'+row.sourceHash+
      (install?`\n安装：r${install.revision} · ${install.enabled?'启用':'停用'} · ${install.nativeState}`:'\n尚未安装')+
      (install?.error?'\n'+install.error.code+'：'+install.error.message:'')+
      (install?.lastExecution?'\n最近执行：'+install.lastExecution.state+' · '+install.lastExecution.documentId+
        (install.lastExecution.error?'\n'+install.lastExecution.error.code+'：'+install.lastExecution.error.message:
          '\n结果：'+(install.lastExecution.result?.resultText??'尚未返回')):'');
  }
  async function refresh(preferred){
    const seq=++sequence,result=await client.request('listPagePrograms',{});
    if(disposed||seq!==sequence)return;
    const previous=preferred??select.value;
    rows=result.catalog;
    select.replaceChildren();
    if(!rows.length){const option=doc.createElement('option');option.value='';option.textContent='尚未保存网页脚本';select.append(option);}
    for(const row of rows){const option=doc.createElement('option');option.value=identity(row);
      option.textContent=`${row.programId} · r${row.revision} · ${row.stage}`;select.append(option);}
    if(rows.some(row=>identity(row)===previous))select.value=previous;
    render();
  }
  const listen=(node,event,callback)=>{node.addEventListener(event,callback);listeners.push([node,event,callback]);};
  const operation=(name,work)=>listen(find('page-program-'+name),'click',event=>{
    if(!event.isTrusted||busy||disposed)return;
    const row=chosen();
    busy=true;render();status.textContent='正在核对…';
    // Permission requests must start in the actual trusted click, not after a
    // storage or Native round trip has consumed the transient gesture.
    let pending;try{pending=work(row);}catch(error){pending=Promise.reject(error);}
    Promise.resolve(pending).then(message=>{if(!disposed)status.textContent=message;})
      .catch(error=>{if(!disposed)status.textContent=(error.code||'E_PAGE_INSTALLATION')+'：'+(error.message||error);})
      .finally(async()=>{busy=false;if(disposed)return;try{await refresh(row&&identity(row));}catch(error){status.textContent=(error.code||'E_OWNER')+'：'+error.message;}render();});
  });
  listen(select,'change',render);
  operation('refresh',async()=>{await refresh();return '已读取持久版本和安装状态。';});
  operation('load',async row=>{
    if(!row)throw new Error('请选择已保存版本');
    await onLoad(row);return '已载入固定 Page 源码；编辑不会修改已安装版本。';
  });
  operation('verify',row=>{
    if(!row)throw new Error('请选择已保存版本');
    const captured=currentPageTarget.capture(),permission=api.permissions.request({origins:row.pageRules.matches});
    return (async()=>{
      if(!await permission)throw Object.assign(new Error('未批准此版本的网站范围'),{code:'E_PERMISSION'});
      await currentPageTarget.revalidate(captured);
      await client.request('verifyPageCandidate',{programId:row.programId,revision:row.revision,
        target:{tabId:captured.tabId,frameId:0,documentId:captured.documentId,
          expectedUrl:captured.url,expectedWindowId:captured.windowId}});
      return '冻结版本已在当前文档验证；可明确安装。验证可能产生网页效果。';
    })();
  });
  operation('install',row=>{
    if(!row)throw new Error('请选择已验证版本');
    const permission=api.permissions.request({origins:row.pageRules.matches});
    return (async()=>{
      if(!await permission)throw Object.assign(new Error('安装的网站范围未获批准'),{code:'E_PERMISSION'});
      const request={programId:row.programId,revision:row.revision,manifestHash:row.manifestHash};
      if(row.stage==='Verified')await client.request('makePageAvailable',request);
      const result=await client.request('installPageProgram',{...request,expectedInstalledManifestHash:row.installed?.manifestHash??null});
      if(result.nativeState!=='registered')throw result.error||new Error('原生注册尚未确认');
      return '已安装；下次进入匹配网页时自动运行。当前文档不会自动重放。';
    })();
  });
  operation('toggle',row=>{
    if(!row?.installed)throw new Error('尚未安装');
    const enabled=!row.installed.enabled;
    const permission=enabled?api.permissions.request({origins:row.installed.pageRules.matches}):Promise.resolve(true);
    return (async()=>{
      if(!await permission)throw Object.assign(new Error('网站权限未获批准'),{code:'E_PERMISSION'});
      const result=await client.request('setInstalledPageEnabled',{programId:row.programId,manifestHash:row.installed.manifestHash,enabled});
      if(result.error)throw result.error;
      return enabled?'已启用；下次进入匹配网页时自动运行。':'已停用后续自动执行。刷新已打开网页以清除旧脚本的界面、监听器与计时器；已发生的业务效果不会回滚。';
    })();
  });
  client.ready.then(()=>refresh()).catch(error=>{if(!disposed)status.textContent=(error.code||'E_OWNER')+'：'+error.message;});
  return {refresh,dispose(){disposed=true;sequence++;for(const [node,event,fn]of listeners)node.removeEventListener(event,fn);}};
}
