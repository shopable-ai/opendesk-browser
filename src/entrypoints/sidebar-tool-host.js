// One existing Sidebar Tools host, preloaded as an audited fixed extension script.
// Extracting its code from ui/tool-shell reduces the main Side Panel bundle
// without creating another installer, sandbox, registry, authority or Browser SDK.
import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {createSidebarTools} from '../ui/sidebar-tools.js';
export default defineUnlistedScript(()=>{
  Object.defineProperty(globalThis,'__opendeskCreateSidebarTools',{
    value:createSidebarTools,writable:false,configurable:false,enumerable:false
  });
});
