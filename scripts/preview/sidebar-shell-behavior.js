/* Offline shell only. No installation, permission, storage or network APIs. */
(()=>{
  'use strict';
  const byId=id=>document.getElementById(id);
  const config=JSON.parse(byId('opendesk-preview-shell-data').textContent);
  const decode=value=>new TextDecoder().decode(Uint8Array.from(atob(value),char=>char.charCodeAt(0)));
  const trustedFrameHtml=config.frameBase64?decode(config.frameBase64):null;
  const iframe=byId('opendesk-preview-frame');
  const nav=[...document.querySelectorAll('.workbench-nav [role="tab"]')].filter(tab=>!tab.hidden);
  const panels={detail:byId('od-preview-extension-detail'),list:byId('od-preview-return'),
    other:byId('od-preview-other'),uninstalled:byId('od-preview-uninstalled')};
  const back=byId('sidebar-tool-back'),remove=byId('sidebar-tool-remove');
  const modal=byId('od-preview-confirm-uninstall');
  let extensionPage='detail';
  const scenario=byId('od-preview-scenario'),theme=byId('od-preview-theme');
  function currentFrameHtml(){
    const key=scenario?.value+':'+theme?.value;
    return config.variants?.[key]?decode(config.variants[key]):trustedFrameHtml;
  }
  function resetPreview(){
    if(iframe)iframe.srcdoc=currentFrameHtml();
    byId('od-preview-app')?.dispatchEvent(new Event('opendesk-preview-reset'));
    extensionPage='detail';activateTab(byId('tab-tools'));
    const feedback=byId('od-preview-controls-feedback');
    if(feedback)feedback.textContent='仅重置离线模拟数据；没有修改真实权限或工具。';
  }
  for(const field of [scenario,theme])field?.addEventListener('change',()=>{
    if(!config.variants?.[scenario?.value+':'+theme?.value])return;
    resetPreview();
  });
  byId('od-preview-restore')?.addEventListener('click',()=>{
    if(scenario)scenario.value=config.scenario;
    if(theme)theme.value=config.theme;
    resetPreview();
  });
  byId('sidebar-tool-title').textContent=config.title;
  remove.disabled=false;
  remove.closest('.sidebar-tool-header-actions').hidden=false;
  // This preview must never claim the real tool and its stored data will be removed.
  remove.setAttribute('aria-label','模拟卸载当前工具（不会删除真实数据）');
  remove.title='模拟卸载（不会删除真实数据）';
  if(iframe)iframe.srcdoc=trustedFrameHtml;
  function showPanel(name,tab){
    for(const [id,node] of Object.entries(panels))node.hidden=id!==name;
    panels[name].setAttribute('aria-labelledby',tab.id);
  }
  function activateTab(tab){
    if(!tab||!nav.includes(tab))return;
    for(const current of nav){
      const active=current===tab;
      current.setAttribute('aria-selected',String(active));
      // Remap production aria-controls to the panels which actually exist in this mock.
      current.setAttribute('aria-controls',current.id==='tab-tools'?
        panels[extensionPage].id:panels.other.id);
      current.tabIndex=active?0:-1;
    }
    if(tab.id==='tab-tools')showPanel(extensionPage,tab);
    else{
      byId('od-preview-other-title').textContent=tab.textContent.trim()+' · 预览占位';
      showPanel('other',tab);
    }
  }
  nav.forEach(tab=>{
    tab.addEventListener('click',()=>activateTab(tab));
    tab.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const index=nav.indexOf(tab);
      const target=event.key==='Home'?nav[0]:event.key==='End'?nav.at(-1):
        nav[(index+(event.key==='ArrowLeft'?-1:1)+nav.length)%nav.length];
      activateTab(target);target.focus();
    });
  });
  activateTab(byId('tab-tools'));
  back.addEventListener('click',()=>{
    extensionPage='list';activateTab(byId('tab-tools'));
    byId('od-preview-reopen').focus();
  });
  byId('od-preview-reopen').addEventListener('click',()=>{
    extensionPage='detail';activateTab(byId('tab-tools'));back.focus();
  });
  byId('od-preview-to-extensions').addEventListener('click',()=>{
    activateTab(byId('tab-tools'));byId('tab-tools').focus();
  });
  remove.addEventListener('click',()=>modal.showModal());
  // The close event fires for both the cancel button and the native Escape key.
  modal.addEventListener('close',()=>{
    if(extensionPage==='detail'&&!panels.detail.hidden)remove.focus();
  });
  byId('od-preview-cancel-uninstall').addEventListener('click',()=>modal.close());
  byId('od-preview-accept-uninstall').addEventListener('click',()=>{
    extensionPage='uninstalled';
    modal.close();
    if(iframe)iframe.srcdoc='';activateTab(byId('tab-tools'));
    byId('od-preview-reset').focus();
  });
  byId('od-preview-reset').addEventListener('click',()=>{
    if(iframe)iframe.srcdoc=currentFrameHtml();
    byId('od-preview-app')?.dispatchEvent(new Event('opendesk-preview-reset'));
    extensionPage='detail';activateTab(byId('tab-tools'));back.focus();
  });
})();

