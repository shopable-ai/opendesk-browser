// Bind the fixed DOM reader to the reviewed installation and current epoch.
import {admitsInstalledSidebarTool} from '../../../src/ui/sidebar-tools/installation.js';
import {VIDEO_SVIP_ID,VIDEO_SVIP_CAPABILITY} from './policy.js';

export const VIDEO_SVIP_MARKET_ID='opendesk/video-svip';
export async function admitsOfficialVideoSVIP({tool,installed,
  enableRecords,epochs,expectedEpoch}={}){
  return admitsInstalledSidebarTool({tool,installed,enableRecords,epochs,expectedEpoch,
    id:VIDEO_SVIP_ID,capabilities:[VIDEO_SVIP_CAPABILITY]});
}
