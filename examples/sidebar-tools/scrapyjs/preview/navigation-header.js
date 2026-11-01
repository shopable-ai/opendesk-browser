// Offline presentation adapter for the existing shell and public navigation contract.
// No history stack, Host DOM access in the sandbox, or privileged operations.
import {normalizeToolNavigation} from '../../../../src/sidebar-tools/navigation-state.js';
import {formatSidebarToolHeading} from '../../../../src/ui/sidebar-tools/title-path.js';
export function installPreviewNavigationHeader(frame,back,title){
  let navigation=null,dirty=false,busy=false;
  const toolTitle=title.textContent;
  const render=()=>{
    const heading=formatSidebarToolHeading({toolTitle,pageTitle:navigation?.title,isHome:!navigation?.canBack});
    title.textContent=heading.visible;title.title=heading.context;title.setAttribute('aria-label',heading.context);
    back.setAttribute('aria-label',navigation?.canBack?'返回采集界面':'返回自定义工具列表');
    back.title=navigation?.canBack?'返回采集界面':'返回自定义工具列表';
  };
  const handleBack=event=>{
    if(navigation?.canBack){
      event.preventDefault();
      frame.contentWindow.postMessage({type:'scrapyjs-preview-navigation-action',action:'back'},'*');
    }else if(dirty||busy){
      event.preventDefault();
      // Offline guard mirrors the Host's refusal to silently destroy active work.
      document.getElementById('scrapyjs-preview-guard').textContent=busy?'任务正在进行，请先停止或等待完成。':'有未保存修改，请先保存后返回扩展列表。';
    }
  };
  back.addEventListener('opendesk-preview-back',handleBack);
  // HMR shell has no list placeholder; keep the root mounted there as well.
  back.addEventListener('click',event=>{
    if(!document.getElementById('od-preview-extension-detail'))handleBack(event);
  });
  frame.addEventListener('load',()=>{
    navigation=null;dirty=false;busy=false;render();
    frame.contentWindow.postMessage({type:'scrapyjs-preview-navigation-sync'},'*');
  });
  window.addEventListener('message',event=>{
    if(event.source!==frame.contentWindow||event.origin!=='null')return;
    const data=event.data;
    if(data?.type==='scrapyjs-preview-navigation-state'){
      const next=normalizeToolNavigation(data.state);
      if(next){navigation=next;render();}
    }else if(data?.type==='scrapyjs-preview-state'&&typeof data.dirty==='boolean'&&typeof data.busy==='boolean'){
      dirty=data.dirty;busy=data.busy;
    }
  });
  render();
}
if(typeof document!=='undefined')installPreviewNavigationHeader(document.getElementById('opendesk-preview-frame'),document.getElementById('sidebar-tool-back'),document.getElementById('sidebar-tool-title'));
