// Fixed extension-only sidecar for History, Schedule and Cloud UI.
// The historical output path is retained for the existing build contract.
import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {createTrustedHistoryWorkbench} from '../ui/trusted-history-workbench.js';
import {createScheduledTaskHost} from '../ui/scheduled-task-host.js';
import {createCloudHosting} from '../ui/cloud-hosting.js';
import {createTaskWorkbench} from '../ui/task-workbench.js';
import {createScheduledTaskWorkbench} from '../ui/scheduled-task-workbench.js';

export default defineUnlistedScript(()=>{
  Object.defineProperty(globalThis,'__opendeskTrustedHistoryUI',{
    enumerable:false,configurable:false,writable:false,
    value:Object.freeze({create:createTrustedHistoryWorkbench,
      createScheduledTaskHost,createCloudHosting,createTaskWorkbench,createScheduledTaskWorkbench})
  });
});
