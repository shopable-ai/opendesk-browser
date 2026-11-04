// Select only the statically compiled Time Review component.
// Installed package HTML/CSS/JS is never an executable input to this route.
import {TIME_REVIEW_ID,TIME_REVIEW_CAPABILITY} from './policy.js';
import {admitsInstalledSidebarTool} from '../../../src/ui/sidebar-tools/installation.js';

// Fixed component source marker, independent of the installed package version.
export const TRUSTED_TIME_REVIEW_VERSION='1.6.0';
export async function admitsTrustedTimeReview({
  tool,installed,enableRecords,epochs,expectedEpoch
}={}){
  return admitsInstalledSidebarTool({tool,installed,enableRecords,epochs,expectedEpoch,
    id:TIME_REVIEW_ID,capabilities:[TIME_REVIEW_CAPABILITY]});
}
