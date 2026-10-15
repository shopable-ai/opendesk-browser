// Fixed product lifecycle adapter; caller owns the existing registry locks,
// uninstall journal and verified storage removal.
import {ADBLOCK_ID,ADBLOCK_STORE,ADBLOCK_PERMISSION} from './policy.js';
import {clearAdblockRules} from './rules.js';
export async function stopAdblockForTool(api,toolId){
  if(toolId!==ADBLOCK_ID)return;
  if(await api.permissions.contains({permissions:[ADBLOCK_PERMISSION]}))
    await clearAdblockRules(api);
}
export async function cleanupUninstalledAdblock(api,toolId,removeVerifiedKey){
  if(toolId!==ADBLOCK_ID)return;
  await stopAdblockForTool(api,toolId);
  await removeVerifiedKey(api,ADBLOCK_STORE);
}
