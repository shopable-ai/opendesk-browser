import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {registerDefaultPreinstall} from '../sidebar-tools/preinstall-intent.js';

// Fixed classic extension resource loaded only by the MV3 Service Worker.
// It registers an intent; tool package verification and installation remain in
// the trusted Side Panel host, never in the page or extension sandbox.
export default defineUnlistedScript(()=>{
  chrome.runtime.onInstalled?.addListener(details=>{
    if(details.reason!=='install')return;
    registerDefaultPreinstall({api:chrome,lockManager:globalThis.navigator?.locks,
      reason:details.reason})
      .catch(error=>console.error('Official first-install intent',error));
  });
});
