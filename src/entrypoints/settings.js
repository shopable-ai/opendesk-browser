import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {initNativeAgentSettings} from '../native-agent/settings.js';
import {mountWorkspace} from '../ui/react/workspace/main.tsx';
export default defineUnlistedScript(() => {
  if(document.getElementById('workspace-root'))return mountWorkspace();
  return initNativeAgentSettings();
});
