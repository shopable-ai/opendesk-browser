import {canonical,digest,digestUtf8,invariant} from '../protocol.js';
import {createPageProgramManifest,hashPageProgramManifest,validatePageProgramManifest,
  verifyPageProgramSource} from '../../scripting/user-scripts/page-program-contract.js';

// R8.1 E07.1: immutable Page *candidates*, not verified/available programs or registrations.
// Store only in the existing frameworkKV and derive the namespace from the trusted Host.
const TAG = 'page-candidate-v1';
const MAX_SOURCE_BYTES = 64 * 1024;
const candidateKey = (namespace,programId,revision) =>
  'page-candidate:' + canonical([namespace,programId,revision]);
const candidateIdentity = (namespace,manifestHash) => digest({namespace,manifestHash});
function fields(value,allowed,required=allowed) {
  invariant(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(key=>allowed.includes(key)) &&
    required.every(key=>Object.hasOwn(value,key)),'E_SCHEMA','Invalid Page candidate request');
}
function project(row) {
  const m=row.manifest;
  return {candidateId:row.candidateId,programId:m.programId,revision:m.revision,
    runtimeKind:m.runtimeKind,entryFormat:m.entryFormat,sourceHash:m.sourceHash,
    manifestHash:row.manifestHash,stage:'Candidate',createdAt:row.createdAt};
}
async function validateRow(row,namespace) {
  invariant(row?.tag === TAG && row.namespace === namespace && row.stage === 'Candidate' &&
    row.verification === null && typeof row.sourceUtf8 === 'string',
  'E_PAGE_CANDIDATE','Stored Page candidate is not an unverified candidate');
  const manifest=validatePageProgramManifest(row.manifest);
  invariant(row.manifestHash === await hashPageProgramManifest(manifest) &&
    manifest.sourceHash === await digestUtf8(row.sourceUtf8) &&
    row.candidateId === 'page-' + await candidateIdentity(namespace,row.manifestHash),
  'E_HASH','Stored Page candidate identity or source differs');
  return row;
}
export function createPageCandidateMethods({storage,assertHost,currentHost,dependencies,clock={now:()=>Date.now()}}) {
  invariant(typeof storage?.transaction === 'function' && typeof assertHost === 'function' &&
    typeof currentHost === 'function' && typeof dependencies?.loadForExecution === 'function',
  'E_SCHEMA','Page candidates require the existing Host and dependency authority');
  async function scoped(sender,mode,run) {
    const host=await assertHost(sender);
    return storage.transaction(['frameworkKV','commandJournal'],mode,async tx=>{
      await currentHost(tx,host,sender);
      const answer=await run(tx,host.namespace);
      await currentHost(tx,host,sender);
      return answer;
    });
  }
  async function importPageCandidate(request,sender) {
    fields(request,['programId','revision','sourceUtf8','entryFormat','importSourceUrl','lockId','pageRules'],
      ['programId','revision','sourceUtf8','entryFormat','importSourceUrl','lockId']);
    invariant(typeof request.sourceUtf8 === 'string' &&
      new TextEncoder().encode(request.sourceUtf8).byteLength <= MAX_SOURCE_BYTES,
    'E_LIMIT','Page candidate source exceeds the reviewed limit');
    // A caller cannot pass a lock-resolution object, Available proof, namespace or stage.
    // loadForExecution rechecks immutable approved asset bytes in the existing manager.
    const resolution=await dependencies.loadForExecution({
      sourceUtf8:request.sourceUtf8,entryFormat:request.entryFormat,
      importSourceUrl:request.importSourceUrl,lockId:request.lockId},sender);
    const manifest=await createPageProgramManifest({
      programId:request.programId,revision:request.revision,sourceUtf8:request.sourceUtf8,
      entryFormat:request.entryFormat,importSourceUrl:request.importSourceUrl,
      dependencyResolution:resolution,pageRules:request.pageRules});
    await verifyPageProgramSource({manifest,sourceUtf8:request.sourceUtf8,dependencyResolution:resolution});
    const manifestHash=await hashPageProgramManifest(manifest);
    return scoped(sender,'readwrite',async(tx,namespace)=>{
      const key=candidateKey(namespace,manifest.programId,manifest.revision);
      const existing=await tx.get('frameworkKV',key);
      if(existing) {
        await validateRow(existing,namespace);
        invariant(existing.manifestHash===manifestHash && existing.sourceUtf8===request.sourceUtf8 &&
          canonical(existing.manifest)===canonical(manifest),
        'E_REQUEST_CONFLICT','Page revision is immutable');
        return project(existing);
      }
      const row={tag:TAG,namespace,candidateId:'page-'+await candidateIdentity(namespace,manifestHash),
        manifest,manifestHash,sourceUtf8:request.sourceUtf8,stage:'Candidate',verification:null,
        createdAt:clock.now()};
      invariant(Number.isSafeInteger(row.createdAt) && row.createdAt >= 0,'E_SCHEMA','Invalid clock');
      await tx.put('frameworkKV',row,key);
      return project(row);
    });
  }
  async function getPageCandidate(request,sender) {
    fields(request,['programId','revision']);
    const row=await scoped(sender,'readonly',async(tx,namespace)=>{
      const row=await validateRow(await tx.get('frameworkKV',candidateKey(namespace,request.programId,request.revision)),namespace);
      return structuredClone(row);
    });
    // Revalidate source metadata and the approved dependency lock at read time;
    // no network, code execution, Chrome registration or installation grant.
    const resolution=await dependencies.loadForExecution({sourceUtf8:row.sourceUtf8,
      entryFormat:row.manifest.entryFormat,importSourceUrl:row.manifest.sourceProfile.importSourceUrl,
      lockId:row.manifest.dependencyLockId},sender);
    await verifyPageProgramSource({manifest:row.manifest,sourceUtf8:row.sourceUtf8,dependencyResolution:resolution});
    return {...project(row),manifest:structuredClone(row.manifest),sourceUtf8:row.sourceUtf8};
  }
  async function listPageCandidates(request,sender) {
    fields(request ?? {},[]);
    return scoped(sender,'readonly',async(tx,namespace)=>{
      const rows=(await tx.all('frameworkKV')).filter(row=>row?.tag===TAG && row.namespace===namespace);
      const results=[];
      for(const row of rows.slice(0,50)) results.push(project(await validateRow(row,namespace)));
      return {candidates:results,truncated:rows.length>results.length};
    });
  }
  return Object.freeze({importPageCandidate,getPageCandidate,listPageCandidates});
}
