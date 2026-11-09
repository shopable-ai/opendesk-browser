// Select only the statically compiled AI Proxy component.
// Installed package HTML/CSS/JS is never an executable input to this route.
import {admitsInstalledSidebarTool} from '../../../src/ui/sidebar-tools/installation.js';

export const TRUSTED_AI_PROXY_ID='ai-proxy';
// Fixed component source marker, independent of the installed package version.
export const TRUSTED_AI_PROXY_VERSION='0.3.12';
export async function admitsTrustedAIProxy({
 tool,installed,enableRecords,epochs,expectedEpoch
}={}){
 return admitsInstalledSidebarTool({tool,installed,enableRecords,epochs,expectedEpoch,
  id:TRUSTED_AI_PROXY_ID,capabilities:['browser.proxy.managed']});
}
