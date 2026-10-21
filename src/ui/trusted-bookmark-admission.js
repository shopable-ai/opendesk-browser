// Official-only, statically compiled Bookmark Manager React admission.
// Normal opens may request this route, but a matching ID or self-reported
// hash never grants trusted UI; package, catalog and install epoch must agree.
import {matchesOfficialRelease,officialPackagePath} from '../sidebar-tools/official-catalog.js';
import {sameSidebarToolPackage} from './sidebar-tools/installation.js';
import {requireToolEnableRecords} from './sidebar-tools/lifecycle.js';

export const TRUSTED_BOOKMARK_ID='bookmark-manager';
export const TRUSTED_BOOKMARK_VERSION='0.3.10';
export const TRUSTED_BOOKMARK_COMPONENT_VERSION='R3.3';
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const own=value=>value&&typeof value==='object'&&!Array.isArray(value)
  ?value[TRUSTED_BOOKMARK_ID]:null;
const validRecord=value=>value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).sort().join(',')==='marketId,sha256,version'&&
  value.marketId==='opendesk/bookmark-manager'&&
  value.version===TRUSTED_BOOKMARK_VERSION&&validHash(value.sha256);

// Unrelated tool updates do not unmount a verified Bookmark Manager.
export function trustedBookmarkProvenanceChanged(change){
 const before=own(change?.oldValue),after=own(change?.newValue);
 if(!validRecord(before)||!validRecord(after))return true;
 return before.marketId!==after.marketId||before.version!==after.version||
  before.sha256!==after.sha256;
}
export async function admitsTrustedBookmark({
 tool,installed,release,provenance,enableRecords,epochs,expectedEpoch
}={}){
 try{
  if(tool?.id!==TRUSTED_BOOKMARK_ID||tool.version!==TRUSTED_BOOKMARK_VERSION||
   !tool.capabilities?.includes('browser.bookmarks.full')||
   !tool.capabilities?.includes('currentPage.read')||
   release?.id!=='opendesk/bookmark-manager'||release.toolId!==TRUSTED_BOOKMARK_ID||
   release.version!==TRUSTED_BOOKMARK_VERSION||
   release.packagePath!==officialPackagePath(TRUSTED_BOOKMARK_ID)||
   !validHash(release.sha256))return false;
  if(!Array.isArray(installed)||
   !installed.some(row=>sameSidebarToolPackage(row,tool))||
   requireToolEnableRecords(enableRecords)[TRUSTED_BOOKMARK_ID]===false)return false;
  const actualEpoch=epochs?.[TRUSTED_BOOKMARK_ID]??null;
  if(expectedEpoch!==actualEpoch||
    (actualEpoch!==null&&(typeof actualEpoch!=='string'||!actualEpoch)))return false;
  const source=own(provenance);
  if(!validRecord(source)||source.marketId!==release.id||
    source.version!==release.version||source.sha256!==release.sha256)return false;
  return await matchesOfficialRelease(release,tool);
 }catch{return false}
}
