// One existing Sidebar Tools host, preloaded as an audited fixed extension script.
// Extracting its code from ui/tool-shell reduces the main Side Panel bundle
// without creating another installer, sandbox, registry, authority or Browser SDK.
import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {createSidebarTools} from '../ui/sidebar-tools.js';
import {trustedTimeReviewUI} from '../time-review/trusted-native-ui.js';
export default defineUnlistedScript(()=>{
  // Bundled only into this existing audited extension entry, never loaded
  // from an installed sidebar-tool package or dynamically imported at runtime.
  Object.defineProperty(globalThis,'__opendeskTrustedTimeReviewUI',{
    value:trustedTimeReviewUI,writable:false,configurable:false,enumerable:false
  });
  Object.defineProperty(globalThis,'__opendeskCreateSidebarTools',{
    value:createSidebarTools,writable:false,configurable:false,enumerable:false
  });
});
