// Fixed extension-only UI sidecar: keep the Cookie workbench out of the
// monolithic tool-shell bundle without exposing Cookie values to sandbox tools.
import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {createTrustedCookieWorkbench} from '../ui/trusted-cookie-workbench.js';
import {createTrustedHistoryWorkbench,mountTrustedHistoryWorkbench} from '../ui/trusted-history-workbench.js';
import {createScheduledTaskHost} from '../ui/scheduled-task-host.js';
import {createCloudHosting} from '../ui/cloud-hosting.js';

export default defineUnlistedScript(()=>{
  Object.defineProperty(globalThis,'__opendeskTrustedCookieUI',{
    enumerable:false,configurable:false,writable:false,
    value:Object.freeze({create:createTrustedCookieWorkbench})
  });
  Object.defineProperty(globalThis,'__opendeskTrustedHistoryUI',{
    enumerable:false,configurable:false,writable:false,
    value:Object.freeze({create:createTrustedHistoryWorkbench,mount:mountTrustedHistoryWorkbench,
      createScheduledTaskHost,createCloudHosting})
  });
});
