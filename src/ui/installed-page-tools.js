import {requireChromePermissions} from '../platform/chrome/permission-gate.js';

// Read-only projection of the EXISTING Page Installed/Authority records.
// There is no second Page registry and no Page-to-Sidebar package conversion.
export function createInstalledPageTools({client,api,doc}){
  const list=doc.getElementById('installed-page-tools-list');
  const status=doc.getElementById('installed-page-tools-status');
  let disposed=false,sequence=0,busy=false;
  if(!list)return {refresh:async()=>{},dispose(){}};
  const notice=text=>{if(!disposed)status.textContent=text;};
  async function refresh(){
    if(disposed)return;
    const generation=++sequence;
    let rows;
    try{
      const response=await client.request('listPagePrograms',{});
      rows=(response.catalog||[]).filter(row=>row.installed&&
        row.installed.manifestHash===row.manifestHash);
    }catch(error){
      notice((error.code||'E_PAGE_INSTALLATION')+'：无法读取已安装网页脚本；不会影响原安装');
      return;
    }
    if(disposed||generation!==sequence)return;
    list.replaceChildren();
    for(const row of rows){
      const installed=row.installed;
      const card=doc.createElement('section');card.className='od-surface';
      const name=doc.createElement('strong');
      name.textContent=row.programId+' · r'+installed.revision;
      const detail=doc.createElement('p');detail.className='hint';
      detail.textContent='匹配：'+installed.pageRules.matches.join('、')+
        '\n'+(!installed.enabled?'已停用':installed.authorization?.status==='suspended'?'访问受限':
          installed.nativeState==='registered'?'已安装 · 自动运行':'注册待核对')+
        '';
      const technical=doc.createElement('details');technical.className='installed-page-tool-technical';
      const technicalTitle=doc.createElement('summary');technicalTitle.textContent='技术信息';
      const fingerprint=doc.createElement('p');fingerprint.className='hint';
      fingerprint.textContent='源码 SHA-256：'+installed.sourceHash;
      technical.append(technicalTitle,fingerprint);
      const toggle=doc.createElement('button');toggle.type='button';
      toggle.textContent=installed.enabled?'停用自动运行':'启用自动运行';
      toggle.disabled=busy;
      toggle.addEventListener('click',event=>{
        if(!event.isTrusted||busy||disposed)return;
        busy=true;toggle.disabled=true;
        void (async()=>{
          if(!installed.enabled)await requireChromePermissions({api,request:{origins:installed.pageRules.matches}});
          const result=await client.request('setInstalledPageEnabled',{
            programId:row.programId,manifestHash:installed.manifestHash,enabled:!installed.enabled,
            expectedGeneration:installed.authorization?.generation??null});
          if(result.error)throw result.error;
          notice('已确认'+(installed.enabled?'停用':'启用')+'固定网页脚本；不会重新运行当前网页。');
        })().catch(error=>notice((error.code||'E_PAGE_INSTALLATION')+'：'+(error.message||error)))
          .finally(()=>{busy=false;if(!disposed)void refresh();});
      });
      card.append(name,detail,toggle,technical);list.append(card);
    }
    notice(rows.length?'':'暂无已安装网页工具。可从「开发」中安装网页脚本。');
  }
  return {refresh,dispose(){disposed=true;sequence++;}};
}
