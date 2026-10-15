import {createPageUI} from '@opendesk/ui';
import {createAnswerRegistry} from './answer-registry.js';

const pageRules={matches:['https://chatgpt.com/*'],excludeMatches:[],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};

// One registered managed UI owns *all* answer-local DOM and listeners. The
// sentinel is not a visible floating button; the answer adapter controls
// placement strictly and never relies on the Page UI's floating fallback.
export default async function main({assets}={}) {
  const owner=createPageUI({
    id:'opendesk.chatgpt-mindmap.lifecycle',assets,pageRules,baseStyles:false
  });
  owner.host.hidden=true;
  owner.host.style.setProperty('display','none','important');
  try {
    const registry=createAnswerRegistry({document,window,owner,
      css:owner.getAsset('assets/ui.css')});
    owner.onDispose(()=>registry.destroy());
    registry.start();
    return {programId:'opendesk.chatgpt-mindmap',status:'active',
      runtime:'USER_SCRIPT',answers:registry.count};
  } catch(error) {
    owner.destroy();
    throw error;
  }
}
