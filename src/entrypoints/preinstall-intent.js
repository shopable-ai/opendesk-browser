import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {registerDefaultPreinstall} from '../sidebar-tools/preinstall-intent.js';
import {resumeDefaultPreinstall} from '../sidebar-tools/default-preinstall.js';
import {repairReadingTocOpenTabs} from '../sidebar-tools/reading-toc-existing-tabs.js';

// Trusted packaged classic script, outside the 320 KiB SW main bundle.
// It verifies and saves official packages through the original installer,
// but never runs tool JS, creates an iframe, or grants a site.
export default defineUnlistedScript(()=>{
  const options={api:chrome,lockManager:globalThis.navigator?.locks};
  const repair=()=>repairReadingTocOpenTabs({api:chrome}).catch(error=>
    console.warn('READING_TOC_EXISTING_TABS_REPAIR',error?.message||error));
  const resume=()=>resumeDefaultPreinstall(options).then(result=>{
    // A completed new trusted install may start indexing already open documents.
    // A normal SW wake does not repeatedly reinject into every existing tab.
    return result.installed?repair():result;
  }).catch(error=>console.error('Official preinstall recovery',error));
  chrome.runtime.onInstalled?.addListener(details=>{
    if(details.reason==='install'){
      void registerDefaultPreinstall({...options,reason:details.reason})
        .then(result=>result.state==='pending'?resume():null)
        .catch(error=>console.error('Official first-install intent',error));
    }else if(details.reason==='update'){
      // Only the verified currently installed reader can be repaired. An update
      // never installs a missing tool or clears a prior user disable.
      void repair();
    }
  });
  chrome.runtime.onStartup?.addListener(()=>{void repair();});
  // A SW restart resumes only a persisted first-install intent; updates and
  // past user choices can never create or widen that intent.
  void resume();
});
