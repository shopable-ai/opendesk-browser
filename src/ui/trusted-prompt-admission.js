// Prompt Shortcuts AI admission is Host-only and statically compiled.
// An ID, installed payload assertion or tool-owned event is NEVER sufficient.
import {matchesOfficialRelease,officialPackagePath} from '../sidebar-tools/official-catalog.js';
import {sameSidebarToolPackage} from './sidebar-tools/installation.js';
import {requireToolEnableRecords} from './sidebar-tools/lifecycle.js';

export const TRUSTED_PROMPT_ID='prompt-shortcuts';
// The source catalog selects the 1.1.19 source-built package. Prior reviewed
// official releases retain exact-byte admission for existing users.
// Never trust merely an installed tool ID, claimed version or unreviewed payload.
export const TRUSTED_PROMPT_VERSION='1.1.19';
// Each legacy record is an exact immutable official package, not a version range.
// Canonical release from 25edc1c1c, preserved while the source catalog advances.
const released118=Object.freeze({
 id:'opendesk/prompt-shortcuts',toolId:TRUSTED_PROMPT_ID,version:'1.1.18',
 packagePath:officialPackagePath(TRUSTED_PROMPT_ID),bytes:144295,
 sha256:'7158d16bff8143bef8a6a4ebac54b0fecbf6dba364025ed192c27e397ed0d116'
});
const lastOfficialRelease=Object.freeze({
 id:'opendesk/prompt-shortcuts',toolId:TRUSTED_PROMPT_ID,version:'1.1.17',
 packagePath:officialPackagePath(TRUSTED_PROMPT_ID),bytes:138166,
 sha256:'724bda006e82ebc2f1c041cb5f15e537c186785c071d298b0750e37b56e57d09'
});
const recentPreviousRelease=Object.freeze({
 id:'opendesk/prompt-shortcuts',toolId:TRUSTED_PROMPT_ID,version:'1.1.16',
 packagePath:officialPackagePath(TRUSTED_PROMPT_ID),bytes:142077,
 sha256:'f42d7acd013a727c8b3ab8b318d3cf77882686d468027b168647dcacf4df7787'
});
// Earlier canonical release at 4a67583db remains pinned for upgrade compatibility.
const previousRelease=Object.freeze({
 id:'opendesk/prompt-shortcuts',toolId:TRUSTED_PROMPT_ID,version:'1.1.15',
 packagePath:officialPackagePath(TRUSTED_PROMPT_ID),bytes:136199,
 sha256:'4085c155d2d8dbac7b55cc5dcaea24229a3fb1d6cfb69431dad2ae5c0eb33ce0'
});
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const historicalReleases=[released118,lastOfficialRelease,recentPreviousRelease,previousRelease];
const previousIdentity=value=>historicalReleases.some(release=>
 value?.version===release.version&&value.sha256===release.sha256);
const historicalRelease=value=>historicalReleases.find(release=>
 value?.version===release.version&&value.sha256===release.sha256&&value.bytes===release.bytes);
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
    !(release.version===TRUSTED_PROMPT_VERSION||historicalRelease(release))||
    release.packagePath!==officialPackagePath(TRUSTED_PROMPT_ID)||
    !validHash(release.sha256))return false;
  // The caller still requires the current official catalog. Legacy installs
  // resolve to their fixed reviewed bytes; new installs match the current catalog.
  const admittedRelease=historicalReleases.find(row=>row.version===tool.version)||release;
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
