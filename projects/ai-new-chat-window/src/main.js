import {createPageUI} from '@opendesk/ui';
import {installNewChatButtons} from './buttons.js';
import {PAGE_MATCHES,providerFor} from './destinations.js';

export const PROGRAM_ID='opendesk.ai-new-chat-window';
const pageRules={matches:[...PAGE_MATCHES],excludeMatches:[],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};

export default async function main(){
  if(window!==window.top||!providerFor(window.location.href))
    return {programId:PROGRAM_ID,status:'skipped'};
  const owner=createPageUI({id:PROGRAM_ID+'.lifecycle',baseStyles:false,pageRules});
  owner.host.hidden=true;
  owner.host.style.setProperty('display','none','important');
  try{
    installNewChatButtons({doc:document,win:window,owner});
    return {programId:PROGRAM_ID,status:'active',runtime:'USER_SCRIPT'};
  }catch(error){owner.destroy();throw error;}
}
