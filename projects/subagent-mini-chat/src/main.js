import {createPageUI} from '@opendesk/ui';
import {renderMiniChat} from './view.js';

// Independent Page USER_SCRIPT extension, never a WebFlow core or Host module.
// Page worlds have no trusted Controller API. Until the platform exposes a
// reviewed, installation-bound transport, the UI is deliberately read-only.
const pageRules={matches:['https://chatgpt.com/*'],excludeMatches:[],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
export default async function main(){
  if(window!==window.top||window.location.origin!=='https://chatgpt.com')
    return {programId:'opendesk.subagent-mini-chat',status:'skipped'};
  const ui=createPageUI({id:'opendesk.subagent-mini-chat',baseStyles:false,pageRules});
  try{
    renderMiniChat(ui);
    return {programId:'opendesk.subagent-mini-chat',status:'bridge-unavailable',
      reason:'No public trusted Page-to-Controller delegation capability'};
  }catch(error){ui.destroy();throw error;}
}
