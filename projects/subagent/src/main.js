import {createPageUI} from '@opendesk/ui';
import {renderMiniChat} from './mini-chat/view.js';

// Subagent product Page USER_SCRIPT entry; Mini Chat below is the first demo UI.
// Page worlds have no trusted Controller API. Until the platform exposes a
// reviewed, installation-bound transport, the UI is deliberately read-only.
const pageRules={matches:['https://chatgpt.com/*'],excludeMatches:[],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
export default async function main(){
  if(window!==window.top||window.location.origin!=='https://chatgpt.com')
    return {programId:'opendesk.subagent',status:'skipped'};
  const ui=createPageUI({id:'opendesk.subagent.mini-chat.demo',baseStyles:false,pageRules});
  try{
    renderMiniChat(ui);
    return {programId:'opendesk.subagent',status:'bridge-unavailable',
      reason:'No public trusted Page-to-Controller delegation capability'};
  }catch(error){ui.destroy();throw error;}
}
