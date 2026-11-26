import {createPageUI} from '@opendesk/ui';
import {installJumpToTop} from './conversation.js';
import {findSiteBindings,findSiteConversation,siteForUrl} from './site-adapters.js';
import {installFloatingNavigation} from './floating-navigation.js';
import {installScrollSiteRuntime,resolveConfiguredConversation} from './site-configuration.js';

export const PROGRAM_ID='opendesk.ai-scroll-navigation';
const pageRules={
  matches:['https://chatgpt.com/*','https://chat.deepseek.com/*','https://gemini.google.com/*'],
  excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'
};

export default async function main() {
  const origin=window.location.origin,configApi=globalThis.__openDeskScrollConfig||null;
  const builtIn=[
    'https://chatgpt.com','https://chat.deepseek.com','https://gemini.google.com'
  ].includes(origin);
  // The Installed Page executor supplies this scoped capability after authorization.
  if(window!==window.top||(!builtIn&&!configApi))
    return {programId:PROGRAM_ID,status:'skipped'};
  const owner=createPageUI({
    id:PROGRAM_ID+'.lifecycle',pageRules:configApi?.pageRules??pageRules,baseStyles:false
  });
  owner.host.hidden=true;
  owner.host.style.setProperty('display','none','important');
  try {
    const site=siteForUrl(window.location.href);
    let replies=null,dock=null,settings=null;
    const resolveNavigation=()=>settings?.navigation()||{};
    settings=installScrollSiteRuntime({
      doc:document,win:window,owner,api:configApi,onChange:()=>{
        replies?.refresh();dock?.refresh();
      }
    });
    if (builtIn) replies=installJumpToTop({
      doc:document,win:window,owner,
      resolveBindings:findSiteBindings,resolveNavigation,
      pinReplies:site==='chatgpt',
      refreshDock:()=>dock?.refresh(),
      regionSelector:'main,[role="main"],header,#root,.ds-message,chat-window,model-response',
      regionDirections:{top:true,bottom:true},
      conversationDirections:{top:false,bottom:false}
    });
    dock=installFloatingNavigation({doc:document,win:window,owner,resolveNavigation,
      resolveConversation:()=>{
        const custom=settings.activeRule();
        // An invalid enabled rule must not fall back to another container.
        return custom?resolveConfiguredConversation(custom,document,window):
          findSiteConversation(document,window);
      }
    });
    return {programId:PROGRAM_ID,status:'active',runtime:'USER_SCRIPT',site:site||'awaiting-conversation'};
  } catch (error) {
    owner.destroy();
    throw error;
  }
}
