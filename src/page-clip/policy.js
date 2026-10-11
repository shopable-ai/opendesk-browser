import {sidebarToolEnabled} from '../ui/sidebar-tools/lifecycle.js';
import {validateSidebarToolPackage} from '../ui/sidebar-tools/package.js';
import {websiteOrigin,grantedOrigins,changeTocGrant} from '../reading-toc/policy.js';

// TOC site grants never implicitly grant article/selection body access.
export const CLIP_SITE_STORE='opendesk.sidebar-tools.clip-sites.v1';
export const CLIP_PROTOCOL='opendesk.page-clip.v1';
export const CLIP_CAPABILITY='page.clip';
export const CLIP_OPERATIONS=Object.freeze(['clip.article','clip.selection','clip.link']);
export function clipGrantAllowed(installed,settings,id,url,enableRecords){
  const origin=websiteOrigin(url);
  if(!sidebarToolEnabled(enableRecords,id)||!origin||!Array.isArray(installed)||typeof id!=='string')return false;
  const candidate=installed.find(row=>row?.id===id);
  if(!candidate)return false;
  try{
    return validateSidebarToolPackage(candidate).capabilities.includes(CLIP_CAPABILITY) &&
      grantedOrigins(settings,id).includes(origin);
  }catch{return false;}
}
export {websiteOrigin,grantedOrigins};
export const changeClipGrant=changeTocGrant;
