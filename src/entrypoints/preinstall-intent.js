import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {registerDefaultPreinstall} from '../sidebar-tools/preinstall-intent.js';
import {resumeDefaultPreinstall} from '../sidebar-tools/default-preinstall.js';
import {repairReadingTocOpenTabs,checkReadingTocContentAccess} from '../../examples/sidebar-tools/reading-toc/trusted/existing-tabs.js';
import {READING_TOC_CHROME_ACCESS_PROTOCOL} from '../sidebar-tools/official-reading-toc.js';

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
  chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
    if(message?.protocol!==READING_TOC_CHROME_ACCESS_PROTOCOL)return false;
    void checkReadingTocContentAccess({api:chrome,sender,expectedUrl:message.expectedUrl})
      .then(allowed=>sendResponse({ok:true,allowed}),
        ()=>sendResponse({ok:false,allowed:false}));
    return true;
  });
  // Chrome revocation never enlarges application grants. Existing documents
  // recheck their effective access and immediately release the UI/observer.
  const recheck=()=>chrome.tabs.query({}).then(tabs=>Promise.allSettled(tabs
    .filter(tab=>Number.isSafeInteger(tab?.id)&&tab.id>=0)
    .map(tab=>chrome.tabs.sendMessage(tab.id,{
      protocol:READING_TOC_CHROME_ACCESS_PROTOCOL,operation:'recheck'
    },{frameId:0}).catch(()=>{}))))
    .catch(error=>console.warn('READING_TOC_ACCESS_RECHECK',error?.message||error));
  chrome.permissions.onRemoved?.addListener(changes=>{
    if(changes.origins?.length)void recheck();
  });
  chrome.permissions.onAdded?.addListener(changes=>{
    if(changes.origins?.length)void recheck().then(()=>repair());
  });
  // A SW restart resumes only a persisted first-install intent; updates and
  // past user choices can never create or widen that intent.
  void resume();
});
