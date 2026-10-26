// Only the exact official installation may enter the statically compiled UI.
// A matching ID or self-reported digest never promotes dynamic package code.
import {matchesOfficialRelease,officialPackagePath} from '../sidebar-tools/official-catalog.js';
import {sameSidebarToolPackage} from './sidebar-tools/installation.js';
import {requireToolEnableRecords,requireToolRevocationEpochs} from './sidebar-tools/lifecycle.js';

export const TRUSTED_KNOWLEDGE_ID='ai-knowledge-answers';
export const TRUSTED_KNOWLEDGE_VERSION='0.1.5';
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const own=value=>value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.hasOwn(value,TRUSTED_KNOWLEDGE_ID)?value[TRUSTED_KNOWLEDGE_ID]:null;
const validRecord=value=>value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).sort().join(',')==='marketId,sha256,version'&&
  value.marketId==='opendesk/ai-knowledge-answers'&&
  value.version===TRUSTED_KNOWLEDGE_VERSION&&validHash(value.sha256);

// Other tools' provenance changes must not unmount a verified Knowledge UI.
export function trustedKnowledgeProvenanceChanged(change){
 try{
  const before=own(change?.oldValue),after=own(change?.newValue);
  if(!validRecord(before)||!validRecord(after))return true;
  return before.marketId!==after.marketId||before.version!==after.version||
   before.sha256!==after.sha256;
 }catch{return true}
}

export async function admitsTrustedKnowledge({
 tool,installed,release,provenance,enableRecords,epochs,expectedEpoch
}={}){
 try{
  if(tool?.id!==TRUSTED_KNOWLEDGE_ID||tool.version!==TRUSTED_KNOWLEDGE_VERSION||
   !tool.capabilities?.includes('storage.local')||
   release?.id!=='opendesk/ai-knowledge-answers'||release.toolId!==TRUSTED_KNOWLEDGE_ID||
   release.version!==TRUSTED_KNOWLEDGE_VERSION||
   release.packagePath!==officialPackagePath(TRUSTED_KNOWLEDGE_ID)||
   !validHash(release.sha256))return false;
  if(!Array.isArray(installed)||
   !installed.some(row=>sameSidebarToolPackage(row,tool))||
   requireToolEnableRecords(enableRecords)[TRUSTED_KNOWLEDGE_ID]===false)return false;
  const actualEpoch=requireToolRevocationEpochs(epochs)[TRUSTED_KNOWLEDGE_ID]??null;
  if(expectedEpoch!==actualEpoch||
   (actualEpoch!==null&&(typeof actualEpoch!=='string'||!actualEpoch)))return false;
  const source=own(provenance);
  if(!validRecord(source)||source.marketId!==release.id||
   source.version!==release.version||source.sha256!==release.sha256)return false;
  return await matchesOfficialRelease(release,tool);
 }catch{return false}
}
