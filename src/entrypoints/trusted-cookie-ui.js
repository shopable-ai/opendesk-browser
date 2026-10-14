// Fixed extension-only sidecar for History, Schedule and Cloud UI.
// The historical output path is retained for the existing build contract.
import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {createTrustedHistoryWorkbench,mountTrustedHistoryWorkbench} from '../ui/trusted-history-workbench.js';
import {createScheduledTaskHost} from '../ui/scheduled-task-host.js';
import {createCloudHosting} from '../ui/cloud-hosting.js';

export default defineUnlistedScript(()=>{
  Object.defineProperty(globalThis,'__opendeskTrustedHistoryUI',{
    enumerable:false,configurable:false,writable:false,
    value:Object.freeze({create:createTrustedHistoryWorkbench,mount:mountTrustedHistoryWorkbench,
      createScheduledTaskHost,createCloudHosting})
  });
});
