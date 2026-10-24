// Prompt Shortcuts AI admission is Host-only and statically compiled.
// An ID, installed payload assertion or tool-owned event is NEVER sufficient.
import {matchesOfficialRelease,officialPackagePath} from '../sidebar-tools/official-catalog.js';
import {sameSidebarToolPackage} from './sidebar-tools/installation.js';
import {requireToolEnableRecords} from './sidebar-tools/lifecycle.js';

export const TRUSTED_PROMPT_ID='prompt-shortcuts';
// The source catalog selects the 1.1.16 candidate. Keep the last shipped
// official install eligible until the user reviews an upgrade; never run its
// payload as trusted code. Version alone never grants trust:
// installed bytes, official digest, provenance, enable state and epoch must match.
export const TRUSTED_PROMPT_VERSION='1.1.16';
// Committed formal package at 4a67583db, canonical serialized bytes.
// This is one reviewed identity, not a range of compatible older versions.
const previousRelease=Object.freeze({
 id:'opendesk/prompt-shortcuts',toolId:TRUSTED_PROMPT_ID,version:'1.1.15',
 packagePath:officialPackagePath(TRUSTED_PROMPT_ID),bytes:136199,
 sha256:'4085c155d2d8dbac7b55cc5dcaea24229a3fb1d6cfb69431dad2ae5c0eb33ce0'
});
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const previousIdentity=value=>value?.version===previousRelease.version&&
 value.sha256===previousRelease.sha256;
const own=value=>value&&typeof value==='object'&&!Array.isArray(value)
 ?value[TRUSTED_PROMPT_ID]:null;
const validRecord=value=>value&&typeof value==='object'&&!Array.isArray(value)&&
 Object.keys(value).sort().join(',')==='marketId,sha256,version'&&
 value.marketId==='opendesk/prompt-shortcuts'&&
 (value.version===TRUSTED_PROMPT_VERSION&&validHash(value.sha256)||previousIdentity(value));

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
  if(tool?.id!==TRUSTED_PROMPT_ID||
    !tool.capabilities?.includes('storage.local')||
    release?.id!=='opendesk/prompt-shortcuts'||
    release.toolId!==TRUSTED_PROMPT_ID||
    !(release.version===TRUSTED_PROMPT_VERSION||
      previousIdentity(release)&&release.bytes===previousRelease.bytes)||
    release.packagePath!==officialPackagePath(TRUSTED_PROMPT_ID)||
    !validHash(release.sha256))return false;
  // The caller still requires the current official catalog before reaching
  // admission. Only this pinned previous install may use its historical
  // descriptor; new candidates continue to match the supplied catalog bytes.
  const admittedRelease=tool.version===previousRelease.version?previousRelease:release;
  if(tool.version!==admittedRelease.version)return false;
  if(!Array.isArray(installed)||
    !installed.some(row=>sameSidebarToolPackage(row,tool))||
    requireToolEnableRecords(enableRecords)[TRUSTED_PROMPT_ID]===false)return false;
  const epoch=epochs?.[TRUSTED_PROMPT_ID]??null;
  if(expectedEpoch!==epoch||
    epoch!==null&&(typeof epoch!=='string'||!epoch))return false;
  const record=own(provenance);
  if(!validRecord(record)||record.marketId!==admittedRelease.id||
    record.version!==admittedRelease.version||record.sha256!==admittedRelease.sha256)return false;
  return await matchesOfficialRelease(admittedRelease,tool);
 }catch{return false;}
}
