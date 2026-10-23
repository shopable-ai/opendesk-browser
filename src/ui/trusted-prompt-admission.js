// Prompt Shortcuts AI admission is Host-only and statically compiled.
// An ID, installed payload assertion or tool-owned event is NEVER sufficient.
import {matchesOfficialRelease,officialPackagePath} from '../sidebar-tools/official-catalog.js';
import {sameSidebarToolPackage} from './sidebar-tools/installation.js';
import {requireToolEnableRecords} from './sidebar-tools/lifecycle.js';

export const TRUSTED_PROMPT_ID='prompt-shortcuts';
// R1.11 reviewed source candidate: the built-in catalog is produced from the
// 1.1.15 project sources. This version gate does NOT grant trust on its own:
// installed bytes, official digest, provenance, enable state and epoch must all
// still match. The checked-in 1.1.14 release JSON is not promoted here.
export const TRUSTED_PROMPT_VERSION='1.1.15';
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const own=value=>value&&typeof value==='object'&&!Array.isArray(value)
 ?value[TRUSTED_PROMPT_ID]:null;
const validRecord=value=>value&&typeof value==='object'&&!Array.isArray(value)&&
 Object.keys(value).sort().join(',')==='marketId,sha256,version'&&
 value.marketId==='opendesk/prompt-shortcuts'&&
 value.version===TRUSTED_PROMPT_VERSION&&validHash(value.sha256);

export function trustedPromptProvenanceChanged(change){
 const before=own(change?.oldValue),after=own(change?.newValue);
 if(!validRecord(before)||!validRecord(after))return true;
 return before.marketId!==after.marketId||before.version!==after.version||
  before.sha256!==after.sha256;
}
export async function admitsTrustedPrompt({
 tool,installed,release,provenance,enableRecords,epochs,expectedEpoch
}={}){
 try{
  if(tool?.id!==TRUSTED_PROMPT_ID||tool.version!==TRUSTED_PROMPT_VERSION||
    !tool.capabilities?.includes('storage.local')||
    release?.id!=='opendesk/prompt-shortcuts'||
    release.toolId!==TRUSTED_PROMPT_ID||
    release.version!==TRUSTED_PROMPT_VERSION||
    release.packagePath!==officialPackagePath(TRUSTED_PROMPT_ID)||
    !validHash(release.sha256))return false;
  if(!Array.isArray(installed)||
    !installed.some(row=>sameSidebarToolPackage(row,tool))||
    requireToolEnableRecords(enableRecords)[TRUSTED_PROMPT_ID]===false)return false;
  const epoch=epochs?.[TRUSTED_PROMPT_ID]??null;
  if(expectedEpoch!==epoch||
    epoch!==null&&(typeof epoch!=='string'||!epoch))return false;
  const record=own(provenance);
  if(!validRecord(record)||record.marketId!==release.id||
    record.version!==release.version||record.sha256!==release.sha256)return false;
  return await matchesOfficialRelease(release,tool);
 }catch{return false;}
}
