// One existing Sidebar Tools host, preloaded as an audited fixed extension script.
// Extracting its code from ui/tool-shell reduces the main Side Panel bundle
// without creating another installer, sandbox, registry, authority or Browser SDK.
import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {createSidebarTools} from '../ui/sidebar-tools.js';
import {trustedTimeReviewUI} from '../time-review/trusted-native-ui.js';
import {AI_ID,AI_CAPABILITY,AI_PROTOCOL,AI_OPERATIONS} from '../ai-smart-access/policy.js';
import {createAiAccessPermissionControls} from '../ai-smart-access/host-controls.js';
import {runTrustedAiAccessOperation,requestAiAccessOperation,probeAiAccessService} from '../ai-smart-access/tool-host.js';
export default defineUnlistedScript(()=>{
  // Bundled only into this existing audited extension entry, never loaded
  // from an installed sidebar-tool package or dynamically imported at runtime.
  Object.defineProperty(globalThis,'__opendeskTrustedTimeReviewUI',{
    value:trustedTimeReviewUI,writable:false,configurable:false,enumerable:false
  });
  Object.defineProperty(globalThis,'__opendeskAiAccessTrustedUI',{
    value:Object.freeze({id:AI_ID,capability:AI_CAPABILITY,protocol:AI_PROTOCOL,
      operations:AI_OPERATIONS,createPermissionControls:createAiAccessPermissionControls,
      runTrustedOperation:runTrustedAiAccessOperation,request:requestAiAccessOperation,
      probe:probeAiAccessService}),writable:false,configurable:false,enumerable:false
  });
  Object.defineProperty(globalThis,'__opendeskCreateSidebarTools',{
    value:createSidebarTools,writable:false,configurable:false,enumerable:false
  });
});
