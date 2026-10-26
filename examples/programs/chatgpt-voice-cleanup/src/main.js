import {createPageUI} from '@opendesk/ui';
import {createVoiceCleanupSite} from './site.js';
import {mountCleanupWidget} from './widget.js';
export const PROGRAM_ID='opendesk.chatgpt-voice-cleanup';
const pageRules={matches:['https://chatgpt.com/*'],excludeMatches:[],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
export default async function main({assets}={}){
  if(window!==window.top||window.location.origin!=='https://chatgpt.com')
    return {programId:PROGRAM_ID,status:'skipped'};
  const owner=createPageUI({id:PROGRAM_ID,assets,pageRules,baseStyles:false});
  try{
    owner.addStyle(owner.getAsset('assets/panel.css'));
    const info=mountCleanupWidget({owner,site:createVoiceCleanupSite()});
    owner.host.style.setProperty('top','auto','important');
    owner.host.style.setProperty('bottom','88px','important');
    owner.host.style.setProperty('right','12px','important');
    owner.host.style.setProperty('left','auto','important');
    return {programId:PROGRAM_ID,status:'active',runtime:'USER_SCRIPT',
      aiTriggered:false,officialReturnVerified:false,...info};
  }catch(error){owner.destroy();throw error}
}
