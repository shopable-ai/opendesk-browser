// Fail-closed admission: same ID, imported package or previous epoch is not enough.
import {matchesOfficialRelease,officialPackagePath} from '../../../src/sidebar-tools/official-catalog.js';
import {sameSidebarToolPackage} from '../../../src/ui/sidebar-tools/installation.js';
import {requireToolEnableRecords,requireToolRevocationEpochs} from '../../../src/ui/sidebar-tools/lifecycle.js';
import {VIDEO_SVIP_ID,VIDEO_SVIP_VERSION,VIDEO_SVIP_CAPABILITY} from './policy.js';

export const VIDEO_SVIP_MARKET_ID='opendesk/video-svip';
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export async function admitsOfficialVideoSVIP({tool,release,installed,provenance,
  enableRecords,epochs,expectedEpoch}={}){
  try{
    if(tool?.id!==VIDEO_SVIP_ID||tool.version!==VIDEO_SVIP_VERSION||
      !tool.capabilities?.includes(VIDEO_SVIP_CAPABILITY)||
      release?.id!==VIDEO_SVIP_MARKET_ID||release.toolId!==VIDEO_SVIP_ID||
      release.version!==VIDEO_SVIP_VERSION||
      release.packagePath!==officialPackagePath(VIDEO_SVIP_ID)||!digest(release.sha256))
      return false;
    if(!Array.isArray(installed)||installed.filter(row=>row?.id===VIDEO_SVIP_ID).length!==1||
      !installed.some(row=>sameSidebarToolPackage(row,tool))||
      requireToolEnableRecords(enableRecords)[VIDEO_SVIP_ID]===false)return false;
    const actualEpoch=requireToolRevocationEpochs(epochs)[VIDEO_SVIP_ID]??null;
    if(typeof actualEpoch!=='string'||!actualEpoch||actualEpoch!==expectedEpoch)return false;
    const source=provenance?.[VIDEO_SVIP_ID];
    if(!source||typeof source!=='object'||Array.isArray(source)||
       Object.keys(source).sort().join(',')!=='marketId,sha256,version'||
       source.marketId!==VIDEO_SVIP_MARKET_ID||
       source.version!==VIDEO_SVIP_VERSION||
       source.sha256!==release.sha256)return false;
    return await matchesOfficialRelease(release,tool);
  }catch{return false;}
}
