import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {startChatGPTSiteRuntime} from '../page-events/chatgpt-runtime.js';
import {initChatGPTFixedBridgePage} from '../../projects/webflow/trusted/chatgpt-bridge-page.js';
import {initChatGPTFileIntentPage} from '../../projects/webflow/trusted/chatgpt-file-intent-page.js';
export default defineUnlistedScript(() => {
  return startChatGPTSiteRuntime({init:()=>initChatGPTFixedBridgePage({createConversationAdapter:initChatGPTFileIntentPage})});
});
