import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {registerDefaultPreinstall} from '../sidebar-tools/preinstall-intent.js';
import {resumeDefaultPreinstall} from '../sidebar-tools/default-preinstall.js';

// Trusted packaged classic script, outside the 320 KiB SW main bundle.
// It verifies and saves official packages through the original installer,
// but never runs tool JS, creates an iframe, or grants a site.
export default defineUnlistedScript(()=>{
  const options={api:chrome,lockManager:globalThis.navigator?.locks};
  const resume=()=>resumeDefaultPreinstall(options)
    .catch(error=>console.error('Official preinstall recovery',error));
  chrome.runtime.onInstalled?.addListener(details=>{
    if(details.reason!=='install')return;
    registerDefaultPreinstall({...options,reason:details.reason})
      .then(result=>result.state==='pending'?resume():null)
      .catch(error=>console.error('Official first-install intent',error));
  });
  // A SW restart resumes only a persisted first-install intent; updates and
  // past user choices can never create or widen that intent.
  void resume();
});
