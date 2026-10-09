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
  launcher.onDispose(()=>panel?.destroy());
  openPanel();
  return {status:'UI_OPEN',title:getPageTitle(document),mode:'manual-page-preview'};
}
