import {createPageUI} from '@opendesk/ui';
import {createPageTaskClient} from '@opendesk/tasks';
import {renderMiniChat} from './mini-chat/view.js';
import {createMiniChatTransport} from './transport.js';

// Subagent product Page USER_SCRIPT entry; Mini Chat below is the first demo UI.
// The installed loader provides only approval-request and read-only recovery.
// Preview/unsupported runtimes stay disabled; this entry has no Controller API.
const pageRules={matches:['https://chatgpt.com/*'],excludeMatches:[],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
export default async function main(){
  if(window!==window.top||window.location.origin!=='https://chatgpt.com')
    return {programId:'opendesk.subagent',status:'skipped'};
  const ui=createPageUI({id:'opendesk.subagent.mini-chat.demo',pageRules});
  try{
    const client=createPageTaskClient();
    if(!client){
      renderMiniChat(ui);
      return {programId:'opendesk.subagent',status:'bridge-unavailable',
        reason:'The installed Page task capability is unavailable'};
    }
    const transport=createMiniChatTransport(client);
    const session=renderMiniChat(ui,{transport,
      initialRequest:Promise.resolve().then(()=>transport.restore())});
    await session.ready;
    return {programId:'opendesk.subagent',status:session.snapshot.status};
  }catch(error){ui.destroy();throw error;}
}
