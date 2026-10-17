// Cookie Editor is NOT promoted to Trusted by the existence of this gate.
// The only renderable candidate is fixed, compiled source in the host build.
// User-imported JSON/JS/JSX must remain in its existing opaque sandbox.
import {matchesOfficialRelease,officialPackagePath} from '../sidebar-tools/official-catalog.js';
import {sameSidebarToolPackage} from './sidebar-tools/installation.js';
import {requireToolEnableRecords} from './sidebar-tools/lifecycle.js';

export const TRUSTED_COOKIE_EDITOR_VERSION='2.0.23';
export const TRUSTED_COOKIE_EDITOR_ID='cookie-editor';
export async function admitsTrustedCookieEditor({
  tool,installed,release,provenance,enableRecords,epochs,expectedEpoch
}={}){
  try{
    if(tool?.id!==TRUSTED_COOKIE_EDITOR_ID||
      tool.version!==TRUSTED_COOKIE_EDITOR_VERSION||
      !tool.capabilities?.includes('browser.cookies.read')||
      !tool.capabilities?.includes('browser.cookies.write')||
      release?.id!=='opendesk/cookie-editor'||
      release.toolId!==TRUSTED_COOKIE_EDITOR_ID||
      release.version!==TRUSTED_COOKIE_EDITOR_VERSION||
      release.packagePath!==officialPackagePath(TRUSTED_COOKIE_EDITOR_ID)||
      typeof release.sha256!=='string'||!/^[a-f0-9]{64}$/.test(release.sha256))
      return false;
    if(!Array.isArray(installed)||
      !installed.some(row=>sameSidebarToolPackage(row,tool))||
      requireToolEnableRecords(enableRecords)[TRUSTED_COOKIE_EDITOR_ID]===false)
      return false;
    const actualEpoch=epochs?.[TRUSTED_COOKIE_EDITOR_ID]??null;
    if(expectedEpoch!==actualEpoch||
      (actualEpoch!==null&&(typeof actualEpoch!=='string'||!actualEpoch)))
      return false;
    const source=provenance?.[TRUSTED_COOKIE_EDITOR_ID];
    if(!source||source.marketId!==release.id||
      source.version!==release.version||source.sha256!==release.sha256)
      return false;
    return await matchesOfficialRelease(release,tool);
  }catch{return false;}
}
