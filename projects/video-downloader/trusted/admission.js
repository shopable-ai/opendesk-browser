// First-party admission: package + immutable release bytes + origin + epoch.
import {matchesOfficialRelease,officialPackagePath} from '../../../src/sidebar-tools/official-catalog.js';
import {sameSidebarToolPackage} from '../../../src/ui/sidebar-tools/installation.js';
import {requireToolEnableRecords,requireToolRevocationEpochs} from '../../../src/ui/sidebar-tools/lifecycle.js';
import {MEDIA_ID,MEDIA_CAPABILITY,MEDIA_VERSION} from './policy.js';
export async function admitsOfficialVideoDownloader({
  tool,release,installed,provenance,enableRecords,epochs,expectedEpoch
}={}){
  try{
    if(tool?.id!==MEDIA_ID||tool.version!==MEDIA_VERSION||
       !tool.capabilities?.includes(MEDIA_CAPABILITY)||
       release?.id!=='opendesk/'+MEDIA_ID||release.toolId!==MEDIA_ID||
       release.version!==MEDIA_VERSION||release.packagePath!==officialPackagePath(MEDIA_ID)||
       !/^[a-f0-9]{64}$/.test(release.sha256))return false;
    if(!Array.isArray(installed)||installed.filter(x=>x?.id===MEDIA_ID).length!==1||
       !installed.some(x=>sameSidebarToolPackage(x,tool))||
       requireToolEnableRecords(enableRecords)[MEDIA_ID]===false)return false;
    const epoch=requireToolRevocationEpochs(epochs)[MEDIA_ID]??null;
    if(typeof epoch!=='string'||!epoch||epoch!==expectedEpoch)return false;
    const source=provenance?.[MEDIA_ID];
    if(!source||Object.keys(source).sort().join(',')!=='marketId,sha256,version'||
       source.marketId!=='opendesk/'+MEDIA_ID||
       source.version!==MEDIA_VERSION||source.sha256!==release.sha256)return false;
    return await matchesOfficialRelease(release,tool);
  }catch{return false;}
}
