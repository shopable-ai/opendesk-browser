// Trusted service-worker repair for pages opened before the content script
// was registered. Never inject portable tool JS or bypass Chrome site access.
import {verifyOfficialReadingToc,tocGrantAllowed,readingTocPageAllowed,
  READING_TOC_SITE_STORE,READING_TOC_PAGE_RULES_STORE,websiteOrigin}
  from '../reading-toc/policy.js';
import {SIDEBAR_TOOL_STORE} from '../ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE} from '../ui/sidebar-tools/lifecycle.js';
import {OFFICIAL_READING_TOC_RELEASE,MARKET_PROVENANCE_STORE} from './official-reading-toc.js';

export const READING_TOC_REPAIR_SCRIPT='agents/page-relay.js';
const keys=[SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,MARKET_PROVENANCE_STORE,
  READING_TOC_SITE_STORE,READING_TOC_PAGE_RULES_STORE];

// Chrome match patterns do not include TCP ports.
export function chromeSitePattern(url){
  const origin=websiteOrigin(url);
  if(!origin)return null;
  const target=new URL(origin);
  return target.protocol+'//'+target.hostname+'/*';
}
export async function repairReadingTocOpenTabs({api,logger=console}={}){
  const result={state:'complete',injected:0,skipped:0,denied:0,failed:0};
  if(!api?.tabs?.query||!api?.scripting?.executeScript||
     !api?.permissions?.contains||!api?.storage?.local?.get)
    return {...result,state:'blocked',reason:'E_CHROME_API'};
  const initial=await api.storage.local.get(keys);
  if(!await verifyOfficialReadingToc(initial[SIDEBAR_TOOL_STORE],initial[MARKET_PROVENANCE_STORE]))
    return {...result,state:'not-official'};
  const tabs=await api.tabs.query({});
  for(const tab of tabs){
    if(!Number.isSafeInteger(tab?.id)||tab.id<0||tab.incognito===true||!chromeSitePattern(tab.url)){
      result.skipped++;continue;
    }
    // Check the installed bytes, provenance and user site/page stops afresh
    // before *each* injection. Content-side authorization is checked again.
    const now=await api.storage.local.get(keys),url=tab.url;
    const official=await verifyOfficialReadingToc(now[SIDEBAR_TOOL_STORE],now[MARKET_PROVENANCE_STORE]);
    if(!tocGrantAllowed(now[SIDEBAR_TOOL_STORE],now[READING_TOC_SITE_STORE],
       OFFICIAL_READING_TOC_RELEASE.id,url,now[SIDEBAR_TOOL_ENABLE_STORE],official)||
       !readingTocPageAllowed(now[READING_TOC_PAGE_RULES_STORE],OFFICIAL_READING_TOC_RELEASE.id,url)){
      result.skipped++;continue;
    }
    let allowed=false;
    try{allowed=await api.permissions.contains({origins:[chromeSitePattern(url)]});}
    catch{/* Chrome may reject a restricted or changing tab. */}
    if(allowed!==true){result.denied++;continue;}
    try{
      await api.scripting.executeScript({target:{tabId:tab.id,allFrames:false},
        files:[READING_TOC_REPAIR_SCRIPT]});
      result.injected++;
    }catch(error){
      result.failed++;
      // URL fragments, article headings and private page contents are not logged.
      logger?.warn?.('READING_TOC_TAB_REPAIR_FAILED',tab.id,String(error?.message||error).slice(0,120));
    }
  }
  return result;
}
