// Bind the fixed download effect to the reviewed installation and current epoch.
import {admitsInstalledSidebarTool} from '../../../src/ui/sidebar-tools/installation.js';
import {MEDIA_ID,MEDIA_CAPABILITY} from './policy.js';
export async function admitsOfficialVideoDownloader({
  tool,installed,enableRecords,epochs,expectedEpoch
}={}){
  return admitsInstalledSidebarTool({tool,installed,enableRecords,epochs,expectedEpoch,
    id:MEDIA_ID,capabilities:[MEDIA_CAPABILITY]});
}
