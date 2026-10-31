// Static first-party admission; installed package code never runs in the trusted UI.
import {matchesOfficialRelease,officialPackagePath,officialSourceProjectPath} from '../../../src/sidebar-tools/official-catalog.js';
import {sameSidebarToolPackage} from '../../../src/ui/sidebar-tools/installation.js';
import {requireToolEnableRecords} from '../../../src/ui/sidebar-tools/lifecycle.js';

export const TRUSTED_AI_PROXY_ID='ai-proxy';
export const TRUSTED_AI_PROXY_VERSION='0.2.0';
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const own=value=>value&&typeof value==='object'&&!Array.isArray(value)
  ?value[TRUSTED_AI_PROXY_ID]:null;
const validRecord=value=>value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).sort().join(',')==='marketId,sha256,version'&&
  value.marketId==='opendesk/ai-proxy'&&
  value.version===TRUSTED_AI_PROXY_VERSION&&validHash(value.sha256);

// Unrelated tool updates do not unmount a verified AI Proxy.
export function trustedAIProxyProvenanceChanged(change){
 const before=own(change?.oldValue),after=own(change?.newValue);
 if(!validRecord(before)||!validRecord(after))return true;
 return before.marketId!==after.marketId||before.version!==after.version||
  before.sha256!==after.sha256;
}
export async function admitsTrustedAIProxy({
 tool,installed,release,provenance,enableRecords,epochs,expectedEpoch
}={}){
 try{
  if(tool?.id!==TRUSTED_AI_PROXY_ID||tool.version!==TRUSTED_AI_PROXY_VERSION||
   !tool.capabilities?.includes('browser.proxy.managed')||
   release?.id!=='opendesk/ai-proxy'||release.toolId!==TRUSTED_AI_PROXY_ID||
   release.version!==TRUSTED_AI_PROXY_VERSION||
   release.packagePath!==officialPackagePath(TRUSTED_AI_PROXY_ID)||
   officialSourceProjectPath(TRUSTED_AI_PROXY_ID)!=='projects/ai-proxy'||
   !validHash(release.sha256))return false;
  if(!Array.isArray(installed)||
   !installed.some(row=>sameSidebarToolPackage(row,tool))||
   requireToolEnableRecords(enableRecords)[TRUSTED_AI_PROXY_ID]===false)return false;
  const actualEpoch=epochs?.[TRUSTED_AI_PROXY_ID]??null;
  if(expectedEpoch!==actualEpoch||
    (actualEpoch!==null&&(typeof actualEpoch!=='string'||!actualEpoch)))return false;
  const source=own(provenance);
  if(!validRecord(source)||source.marketId!==release.id||
    source.version!==release.version||source.sha256!==release.sha256)return false;
  return await matchesOfficialRelease(release,tool);
 }catch{return false}
}
