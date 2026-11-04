// Admit the reviewed installation for this fixed, narrow media effect.
import {admitsInstalledSidebarTool} from '../../../src/ui/sidebar-tools/installation.js';
import {VIDEO_SPEED_ID,VIDEO_SPEED_CAPABILITY} from './policy.js';

export const VIDEO_SPEED_VERSION='1.2.3';
export const VIDEO_SPEED_MARKET_ID='opendesk/video-speed-controller';
export async function admitsOfficialVideoSpeed({
  tool,installed,enableRecords,epochs,expectedEpoch
}={}) {
  return admitsInstalledSidebarTool({tool,installed,enableRecords,epochs,expectedEpoch,
    id:VIDEO_SPEED_ID,capabilities:[VIDEO_SPEED_CAPABILITY]});
}
