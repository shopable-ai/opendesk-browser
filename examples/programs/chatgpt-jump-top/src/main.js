import {createPageUI} from '@opendesk/ui';
import {installJumpToTop} from './conversation.js';
import {findSiteBindings,siteForUrl} from './site-adapters.js';
import {installFloatingNavigation} from './floating-navigation.js';

// A new Program ID is a separately reviewed installation, not an in-place
// permission transfer. The legacy package remains untouched until users
// explicitly retire it via the existing Installed Page controls.
export const PROGRAM_ID='opendesk.ai-scroll-navigation';
const pageRules={
  matches:['https://chatgpt.com/*','https://chat.deepseek.com/*','https://gemini.google.com/*'],
  excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'
};

export default async function main() {
  // An AI site can enter its conversation route through SPA navigation
  // after document_idle. Keep an inert owner on approved origins and activate
  // only when a fixed adapter resolves a real transcript.
  const origin=window.location.origin;
  if (window!==window.top||![
    'https://chatgpt.com','https://chat.deepseek.com','https://gemini.google.com'
  ].includes(origin)) return {programId:PROGRAM_ID,status:'skipped'};
  const owner=createPageUI({
    id:PROGRAM_ID+'.lifecycle',pageRules,baseStyles:false
  });
  owner.host.hidden=true;
  owner.host.style.setProperty('display','none','important');
  try {
    const site=siteForUrl(window.location.href);
    // Reply actions are site-specific. Gemini has only proven transcript edge
    // navigation; never guess its native per-answer toolbar.
    if (origin!=='https://gemini.google.com') installJumpToTop({
      doc:document,win:window,owner,
      resolveBindings:findSiteBindings,
      regionSelector:'main,[role="main"],header,#root,.ds-message',
      regionDirections:{top:true,bottom:true},
      conversationDirections:{top:false,bottom:false}
    });
    installFloatingNavigation({doc:document,win:window,owner});
    return {programId:PROGRAM_ID,status:'active',runtime:'USER_SCRIPT',site:site||'awaiting-conversation'};
  } catch (error) {
    owner.destroy();
    throw error;
  }
}
