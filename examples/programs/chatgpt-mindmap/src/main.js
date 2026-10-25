import {createPageUI} from '@opendesk/ui';
import {createAnswerRegistry} from './answer-registry.js';
import {createAnswerView} from './view.js';
import {createXmindFrameRenderer,requireXmindFrameFactory} from './xmind-frame.js';
import {createInstalledXmindFrameFactory} from './xmind-installed-frame.js';

const PROGRAM_ID='opendesk.ai-reply-mindmap';

const pageRules={matches:['https://chatgpt.com/*'],excludeMatches:[],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};

// One registered managed UI owns *all* answer-local DOM and listeners. The
// sentinel is not a visible floating button; the answer adapter controls
// placement strictly and never relies on the Page UI's floating fallback.
// Explicit module injection remains a bounded component-test seam. Installed
// execution consumes only the public fixed-resource Page UI capability.
export function createMindmapMain({frameFactory}={}) {
return async function main({assets}={}) {
  // A supplied test adapter is checked before touching answers. Installed
  // resource availability is enforced by the public Page UI call on conversion.
  if(frameFactory!==undefined)requireXmindFrameFactory(frameFactory);
  const owner=createPageUI({
    id:PROGRAM_ID+'.lifecycle',assets,pageRules,baseStyles:false
  });
  owner.host.hidden=true;
  owner.host.style.setProperty('display','none','important');
  try {
    const installedFactory=frameFactory??createInstalledXmindFrameFactory(owner);
    const registry=createAnswerRegistry({document,window,owner,
      css:owner.getAsset('assets/ui.css'),
      programRevision:{version:'0.2.7',revision:1},
      createView:options=>createAnswerView({...options,
        rendererFactory:input=>createXmindFrameRenderer({...input,frameFactory:installedFactory})})});
    owner.onDispose(()=>registry.destroy());
    registry.start();
    return {programId:PROGRAM_ID,status:'active',
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
