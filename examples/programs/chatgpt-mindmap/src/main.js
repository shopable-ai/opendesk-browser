import {createPageUI} from '@opendesk/ui';
import {createAnswerRegistry} from './answer-registry.js';
import {createAnswerView} from './view.js';
import {createXmindFrameRenderer,requireXmindFrameFactory} from './xmind-frame.js';

const pageRules={matches:['https://chatgpt.com/*'],excludeMatches:[],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};

// One registered managed UI owns *all* answer-local DOM and listeners. The
// sentinel is not a visible floating button; the answer adapter controls
// placement strictly and never relies on the Page UI's floating fallback.
// Explicit module injection is for isolated, non-release tests only. There is
// no approved fixed-code child loader in the public Page SDK yet.
export function createMindmapMain({frameFactory}={}) {
return async function main({assets}={}) {
  // Fail before modifying any answer when the trusted runtime is unavailable.
  // No CDN, MAIN-world lookup, eval or SVG fallback is permitted.
  requireXmindFrameFactory(frameFactory);
  const owner=createPageUI({
    id:'opendesk.chatgpt-mindmap.lifecycle',assets,pageRules,baseStyles:false
  });
  owner.host.hidden=true;
  owner.host.style.setProperty('display','none','important');
  try {
    const registry=createAnswerRegistry({document,window,owner,
      css:owner.getAsset('assets/ui.css'),
      createView:options=>createAnswerView({...options,
        rendererFactory:input=>createXmindFrameRenderer({...input,frameFactory})})});
    owner.onDispose(()=>registry.destroy());
    registry.start();
    return {programId:'opendesk.chatgpt-mindmap',status:'active',
      runtime:'USER_SCRIPT',answers:registry.count};
  } catch(error) {
    owner.destroy();
    throw error;
  }
}
}

// The production builder requires a statically identifiable function entry.
export default async function main({assets}={}) {
  return createMindmapMain()({assets});
}
