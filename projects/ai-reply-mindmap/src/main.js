import {createPageUI} from '@opendesk/ui';
import {createAnswerRegistry} from './answer-registry.js';
import {createAnswerView} from './view.js';
import {createXmindFrameRenderer,requireXmindFrameFactory} from './xmind-frame.js';
import {createInstalledXmindFrameFactory} from './xmind-installed-frame.js';
import * as chatgptAdapter from './chatgpt-adapter.js';
import * as geminiAdapter from './gemini-adapter.js';
import * as deepseekAdapter from './deepseek-adapter.js';
import {createPageSettings} from './page-settings.js';

const PROGRAM_ID='opendesk.ai-reply-mindmap';
const APP_PROGRAM_ID='app.ai-reply-mindmap';
// The installed Host verifies and evaluates the fixed XMind resource before
// returning its port. Keep that wait separate from the short command timeout.
const INSTALLED_FRAME_CREATE_TIMEOUT_MS=60000;

const pageRules={matches:['https://chatgpt.com/*','https://gemini.google.com/*','https://chat.deepseek.com/','https://chat.deepseek.com/a/chat/s/*'],excludeMatches:[],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};

// One registered managed UI owns *all* answer-local DOM and listeners. The
// sentinel is not a visible floating button; the answer adapter controls
// placement strictly and never relies on the Page UI's floating fallback.
// Explicit module injection remains a bounded component-test seam. Installed
// execution consumes only the public fixed-resource Page UI capability.
export function createMindmapMain({frameFactory}={}) {
return async function main({assets}={}) {
  const bridge=globalThis.OpenDeskAppPage;
  const programId=bridge?APP_PROGRAM_ID:PROGRAM_ID;
  const builtin=window.location.origin==='https://chatgpt.com'?chatgptAdapter:
    geminiAdapter.geminiConversation(window.location)?geminiAdapter:
    deepseekAdapter.deepseekEntry(window.location)?deepseekAdapter:null;
  if(window!==window.top||!builtin)return {programId,status:'skipped'};
  // A supplied test adapter is checked before touching answers. Installed
  // resource availability is enforced by the public Page UI call on conversion.
  if(frameFactory!==undefined)requireXmindFrameFactory(frameFactory);
  const owner=createPageUI({
    id:programId+'.lifecycle',assets,pageRules,baseStyles:false
  });
  owner.host.hidden=true;
  owner.host.style.setProperty('display','none','important');
  try {
    const installedFactory=frameFactory??createInstalledXmindFrameFactory(owner);
    const settings=bridge?await createPageSettings({bridge,document,builtin,origin:window.location.origin}):null;
    if(!owner.active())return {programId,status:'disposed'};
    const registry=createAnswerRegistry({document,window,owner,
      css:owner.getAsset('assets/ui.css'),
      programRevision:settings?{id:programId}:{id:programId,version:'0.2.16',revision:13},
      adapter:settings?.activeAdapter??builtin,
      createView:options=>createAnswerView({...options,
        rendererFactory:input=>createXmindFrameRenderer({...input,frameFactory:installedFactory,
          ...(!frameFactory&&{frameCreateTimeoutMs:INSTALLED_FRAME_CREATE_TIMEOUT_MS})})})});
    owner.onDispose(()=>registry.destroy());
    registry.start();
    if(settings)owner.onDispose(bridge.onRequest(settings.onRequest));
    return {programId,status:'active',
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
