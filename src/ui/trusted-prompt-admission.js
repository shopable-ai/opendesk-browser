// Select only the statically compiled Prompt Shortcuts AI component.
// Package UI remains in its sandbox; this admission never executes its code.
import {admitsInstalledSidebarTool} from './sidebar-tools/installation.js';

export const TRUSTED_PROMPT_ID='prompt-shortcuts';
// Fixed component source marker, independent of the installed package version.
export const TRUSTED_PROMPT_VERSION='1.1.21';
export async function admitsTrustedPrompt({
 tool,installed,enableRecords,epochs,expectedEpoch
}={}){
 return admitsInstalledSidebarTool({tool,installed,enableRecords,epochs,expectedEpoch,
  id:TRUSTED_PROMPT_ID,capabilities:['storage.local']});
}
