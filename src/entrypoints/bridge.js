import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {initSidebarToolSandbox} from '../sidebar-tools/bridge.js';
export default defineUnlistedScript(() => initSidebarToolSandbox());
