// Fixed, extension-owned Side Panel sidecar. Never exposed to a sandbox.
import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {FOCUS_ID,FOCUS_CAPABILITY,FOCUS_PROTOCOL,FOCUS_OPERATIONS,focusPackageHash} from '../../projects/stay-focus/trusted/policy.js';
import {createStayFocusPermissionControls} from '../../projects/stay-focus/trusted/host-controls.js';
import {runTrustedStayFocusOperation,requestStayFocusOperation,probeStayFocusService} from '../../projects/stay-focus/trusted/tool-host.js';
export default defineUnlistedScript(()=>{
  Object.defineProperty(globalThis,'__opendeskStayFocusTrustedUI',{
    configurable:false,writable:false,enumerable:false,
    value:Object.freeze({
      id:FOCUS_ID,capability:FOCUS_CAPABILITY,protocol:FOCUS_PROTOCOL,
      operations:FOCUS_OPERATIONS,packageHash:focusPackageHash,
      createPermissionControls:createStayFocusPermissionControls,
      runTrustedOperation:runTrustedStayFocusOperation,request:requestStayFocusOperation,
      probe:probeStayFocusService
    })
  });
});
