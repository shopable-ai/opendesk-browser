// Standalone installed-tool JS: opaque sandbox, NOT Controller/Page/host.
// No import, no main({page}), no chrome.tabs and no inherited _/dayjs globals.
(() => {
  'use strict';
  const bridge=globalThis.OpenDeskTool;
  const root=bridge?.root;
  if(typeof root?.querySelector!=='function'||typeof bridge.request!=='function')
    throw new Error('E_TOOL_CONTEXT: OpenDeskTool bridge not available');
  const status=root.querySelector('#runtime-status');
  const label=root.querySelector('#runtime-title');
  const button=root.querySelector('#runtime-read');
  if(!status||!label||!button)
    throw new Error('E_TOOL_UI: expected tool elements are missing');
  status.textContent='独立工具已启动；点击按钮后才读取网页标题。';
  button.addEventListener('click',async event=>{
    if(!event.isTrusted||button.disabled)return;
    button.disabled=true;
    bridge.setState?.({dirty:false,busy:true});
    try{
      const result=await bridge.request('currentPage.info');
      if(result?.status==='available'&&typeof result.title==='string'){
        label.textContent=result.title;
        status.textContent='网页标题读取成功';
      }else{
        label.textContent='';
        status.textContent='当前页面不支持读取，请检查网站权限';
      }
    }catch(error){
      label.textContent='';
      status.textContent='读取失败：'+String(error?.code||error?.message||error).slice(0,120);
    }finally{
      button.disabled=false;
      bridge.setState?.({dirty:false,busy:false});
    }
  });
})();
