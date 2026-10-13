// Compile-time trust boundary for the ONLY first-party native Sidebar Tools pilot.
// Names, capability flags and a user-provided package hash are never sufficient.
import {TIME_REVIEW_ID,TIME_REVIEW_CAPABILITY} from './policy.js';
import {matchesOfficialRelease,officialPackagePath} from '../sidebar-tools/official-catalog.js';
import {sameSidebarToolPackage} from '../ui/sidebar-tools/installation.js';
import {requireToolEnableRecords} from '../ui/sidebar-tools/lifecycle.js';

// A change to the packaged UI must ship as a new official release and a new
// extension build. Old/unverified releases continue in the opaque sandbox.
export const TRUSTED_TIME_REVIEW_VERSION='1.6.0';
export async function admitsTrustedTimeReview({
  tool,installed,release,provenance,enableRecords,epochs,expectedEpoch
}={}){
  try{
    if(tool?.id!==TIME_REVIEW_ID||tool.version!==TRUSTED_TIME_REVIEW_VERSION||
       !tool.capabilities?.includes(TIME_REVIEW_CAPABILITY)||
       release?.id!=='opendesk/time-review'||release.toolId!==TIME_REVIEW_ID||
       release.version!==TRUSTED_TIME_REVIEW_VERSION||
       release.packagePath!==officialPackagePath(TIME_REVIEW_ID)||
       typeof release.sha256!=='string'||!/^[a-f0-9]{64}$/.test(release.sha256))
      return false;
    if(!Array.isArray(installed)||!installed.some(row=>sameSidebarToolPackage(row,tool))||
       requireToolEnableRecords(enableRecords)[TIME_REVIEW_ID]===false)
      return false;
    // The original installer represents a first installation with a null
    // epoch; only disable/re-enable, uninstall and revocation rotate it.
    // Bind that actual installed epoch exactly, including this valid null.
    const actualEpoch=epochs?.[TIME_REVIEW_ID]??null;
    if(expectedEpoch!==actualEpoch||
       (actualEpoch!==null&&(typeof actualEpoch!=='string'||!actualEpoch)))
      return false;
    const source=provenance?.[TIME_REVIEW_ID];
    if(!source||source.marketId!==release.id||source.version!==release.version||
       source.sha256!==release.sha256)return false;
    // The exact normalized, independently installed package must equal the
    // current extension's build-generated, reviewed release descriptor.
    return await matchesOfficialRelease(release,tool);
  }catch{return false;}
}
