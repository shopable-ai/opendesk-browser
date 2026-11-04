// Select only the statically compiled Knowledge component.
// Package UI remains in its sandbox; this admission never executes its code.
import {admitsInstalledSidebarTool} from './sidebar-tools/installation.js';

export const TRUSTED_KNOWLEDGE_ID='ai-knowledge-answers';
// Fixed component source marker, independent of the installed package version.
export const TRUSTED_KNOWLEDGE_VERSION='0.1.7';
export async function admitsTrustedKnowledge({
 tool,installed,enableRecords,epochs,expectedEpoch
}={}){
 return admitsInstalledSidebarTool({tool,installed,enableRecords,epochs,expectedEpoch,
  id:TRUSTED_KNOWLEDGE_ID,capabilities:['storage.local']});
}
