import {createPageUI} from '@opendesk/ui';
import {getPageTitle} from './title.js';
import {renderPanel} from './view.js';

// After main() returns, owned callbacks live until cleanup. Closing the panel
// does not invoke main() again; the independent launcher can reopen its UI.
export default async function main({assets}) {
  const launcher=createPageUI({id:'sample.page-ui-basic.launcher',assets});
  launcher.host.style.top='auto';
  launcher.host.style.bottom='16px';
  const reopen=document.createElement('button');
  reopen.type='button';reopen.className='od-button';reopen.textContent='重新打开工具';
  reopen.hidden=true;launcher.content.append(reopen);
  const config=launcher.getAsset('assets/config.json');
  let panel=null;
  function openPanel(){
    if(panel?.active())return;
    panel=createPageUI({id:'sample.page-ui-basic.panel',assets,baseStyles:true});
    panel.addStyle(panel.getAsset('assets/panel.css'));
    panel.onDispose(()=>{panel=null;reopen.hidden=false;});
    renderPanel(panel,{config,
      onClose:()=>panel?.destroy(),
      onExit:()=>launcher.destroy()});
    reopen.hidden=true;
  }
  launcher.on(reopen,'click',openPanel);
  // Opt-in local test target: A inline -> B independently anchored -> C floating.
  // Other sites retain the original launcher/panel without adding another entry.
  let inline=null;
  if(document.querySelector('#page-ui-demo-target')){
    inline=createPageUI({id:'sample.page-ui-basic.inline',assets,
      mount:{selector:'#page-ui-demo-target',position:'after'}});
    const action=document.createElement('button');
    action.type='button';action.className='od-button od-button--primary';
    action.textContent='AI · 读取标题';
    const feedback=document.createElement('span');
    feedback.className='od-status';feedback.setAttribute('role','status');
    feedback.style.marginInlineStart='8px';
    inline.content.append(action,feedback);
    inline.on(action,'click',()=>{feedback.textContent=getPageTitle(document);});
  }
  launcher.onDispose(()=>{inline?.destroy();panel?.destroy();});
  openPanel();
  return {status:'UI_OPEN',title:getPageTitle(document),mode:'manual-page-preview',
    inlineMount:inline?.getMountDiagnostics()||null};
}
