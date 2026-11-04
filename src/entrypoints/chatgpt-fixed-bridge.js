import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {startChatGPTSiteRuntime} from '../page-events/chatgpt-runtime.js';
import {initChatGPTFileIntentPage} from '../native-agent/chatgpt-file-intent-page.js';
export default defineUnlistedScript(() => {
  const runtime=startChatGPTSiteRuntime();
  initChatGPTFileIntentPage();
  return runtime;
});
