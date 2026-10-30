// Official package admission for a narrow first-party Chrome scripting effect.
// A same-ID imported/modified package must never gain trusted page mutation.
import {matchesOfficialRelease,officialPackagePath} from '../../../src/sidebar-tools/official-catalog.js';
import {sameSidebarToolPackage} from '../../../src/ui/sidebar-tools/installation.js';
import {requireToolEnableRecords,requireToolRevocationEpochs} from '../../../src/ui/sidebar-tools/lifecycle.js';
import {VIDEO_SPEED_ID,VIDEO_SPEED_CAPABILITY} from './policy.js';

export const VIDEO_SPEED_VERSION='1.1.2';
export const VIDEO_SPEED_MARKET_ID='opendesk/video-speed-controller';
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

export async function admitsOfficialVideoSpeed({
  tool,release,installed,provenance,enableRecords,epochs,expectedEpoch
}={}) {
  try {
    if(tool?.id!==VIDEO_SPEED_ID||tool.version!==VIDEO_SPEED_VERSION||
      !tool.capabilities?.includes(VIDEO_SPEED_CAPABILITY)||
      release?.id!==VIDEO_SPEED_MARKET_ID||release.toolId!==VIDEO_SPEED_ID||
      release.version!==VIDEO_SPEED_VERSION||
      release.packagePath!==officialPackagePath(VIDEO_SPEED_ID)||
      !digest(release.sha256))
      return false;
    if(!Array.isArray(installed)||
      installed.filter(row=>row?.id===VIDEO_SPEED_ID).length!==1||
      !installed.some(row=>sameSidebarToolPackage(row,tool))||
      requireToolEnableRecords(enableRecords)[VIDEO_SPEED_ID]===false)
      return false;
    const actualEpoch=requireToolRevocationEpochs(epochs)[VIDEO_SPEED_ID]??null;
    if(typeof actualEpoch!=='string'||!actualEpoch||
      expectedEpoch!==actualEpoch)return false;
    const source=provenance?.[VIDEO_SPEED_ID];
    if(!source||typeof source!=='object'||Array.isArray(source)||
       Object.keys(source).sort().join(',')!=='marketId,sha256,version'||
       source.marketId!==VIDEO_SPEED_MARKET_ID||
       source.version!==VIDEO_SPEED_VERSION||
       source.sha256!==release.sha256)return false;
    return await matchesOfficialRelease(release,tool);
  }catch{return false;}
}
