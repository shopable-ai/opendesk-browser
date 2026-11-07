// Evidence integrity only. Even exact upstream bytes do not grant legal approval.
import {createHash} from 'node:crypto';
import {readFile,realpath,stat} from 'node:fs/promises';
import {isAbsolute,join,relative,sep,win32} from 'node:path';

const FORMAT='opendesk.mindmap.license-reference-review.v1';
const ASSETS=['jszip.min.js','polyfill-45b9836beb.min.js',
  'xmind-sdk.bundle.js','snowbrush-2c2b5d62b5.js'];
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string'&&value.trim().length>0;

function requireEvidence(condition,code,detail=''){
  if(condition)return;
  const error=new Error('E_XMIND_LICENSE_'+code+(detail?': '+detail:''));
  error.code='E_XMIND_LICENSE_'+code;
  throw error;
}
function digestRecord(record,code){
  requireEvidence(object(record)&&Number.isSafeInteger(record.bytes)&&record.bytes>0&&
    typeof record.sha256==='string'&&/^[a-f0-9]{64}$/.test(record.sha256),code);
}
function assetRecords(rows,code){
  requireEvidence(Array.isArray(rows)&&rows.length===ASSETS.length,code);
  const result=new Map();
  for(const row of rows){
    digestRecord(row,code);
    requireEvidence(ASSETS.includes(row.name)&&!result.has(row.name),code,'asset name');
    result.set(row.name,row);
  }
  return result;
}
function forbidApproval(review){
  const pending=[review],seen=new Set();
  while(pending.length){
    const value=pending.pop();
    if(value===null||typeof value!=='object')continue;
    requireEvidence(!seen.has(value),'SCHEMA','cyclic or shared review records');
    seen.add(value);
    for(const [key,entry] of Object.entries(value)){
      if(key==='approval')requireEvidence(entry==='BLOCKED','APPROVAL',key);
      if(['legalApproval','redistributionApproved','installable'].includes(key))
        requireEvidence(entry===false,'APPROVAL',key);
      if(entry!==null&&typeof entry==='object')pending.push(entry);
    }
  }
}
function evidenceFile(file){
  requireEvidence(text(file)&&!isAbsolute(file)&&!win32.isAbsolute(file)&&
    !file.includes('\\')&&!file.includes('\0'),'REFERENCE_PATH');
  const parts=file.split('/');
  requireEvidence(parts[0]==='license-evidence'&&parts.length>1&&
    parts.every(part=>part!==''&&part!=='.'&&part!=='..'),'REFERENCE_PATH',file);
}
function inside(root,target){
  const path=relative(root,target);
  return path!==''&&path!=='..'&&!path.startsWith('..'+sep)&&!isAbsolute(path);
}
async function capturedBytes(root,file){
  const base=join(root,'license-evidence');
  let target;
  try{target=await realpath(join(root,file));}
  catch{requireEvidence(false,'REFERENCE_FILE',file);}
  requireEvidence(inside(base,target),'REFERENCE_PATH',file);
  try{
    requireEvidence((await stat(target)).isFile(),'REFERENCE_FILE',file);
    return await readFile(target);
  }catch(error){
    if(error.code?.startsWith('E_XMIND_LICENSE_'))throw error;
    requireEvidence(false,'REFERENCE_FILE',file);
  }
}

/** Verify v1 captured evidence and optional full-artifact byteMappings without approval. */
export async function verifyLicenseReview(input={}){
  requireEvidence(object(input),'SCHEMA','review inputs required');
  const {review,provenanceBytes,resources,testsRoot}=input;
  requireEvidence(object(review)&&review.format===FORMAT,'SCHEMA','review format');
  forbidApproval(review);
  requireEvidence(review.status==='BLOCKED'&&review.installable===false&&
    review.redistributionApproved===false,'APPROVAL','review must remain BLOCKED');
  requireEvidence(text(review.reviewedOn)&&/^\d{4}-\d{2}-\d{2}$/.test(review.reviewedOn)&&
    text(review.scope),'SCHEMA','review date/scope');
  requireEvidence(Buffer.isBuffer(provenanceBytes),'PROVENANCE','raw bytes required');
  requireEvidence(review.provenanceSha256===sha256(provenanceBytes),
    'PROVENANCE_HASH','raw provenance bytes');
  let provenance;
  try{provenance=JSON.parse(provenanceBytes.toString('utf8'));}
  catch{requireEvidence(false,'PROVENANCE','invalid JSON');}
  requireEvidence(object(provenance),'PROVENANCE');
  const expected=assetRecords(provenance.assets,'PROVENANCE_ASSETS');
  const assets=assetRecords(review.assets,'ASSETS');
  requireEvidence(resources instanceof Map,'RESOURCES','Map of slash asset names to Buffers');
  const localBytes=new Map();
  for(const [name,asset] of assets){
    requireEvidence(asset.approval==='BLOCKED','APPROVAL',name);
    const source=expected.get(name),raw=resources.get('/'+name);
    requireEvidence(asset.bytes===source.bytes&&asset.sha256===source.sha256,
      'ASSET_PROVENANCE',name);
    requireEvidence(Buffer.isBuffer(raw),'RESOURCE',name);
    requireEvidence(raw.length===asset.bytes&&sha256(raw)===asset.sha256,'ASSET_HASH',name);
    localBytes.set(name,Buffer.from(raw));
  }
  requireEvidence(Array.isArray(review.references)&&review.references.length>0,
    'REFERENCES','captured references required');
  const references=new Map(),files=new Set();
  for(const reference of review.references){
    digestRecord(reference,'REFERENCE');
    requireEvidence(text(reference.component)&&!references.has(reference.component),
      'REFERENCE_DUPLICATE','unique component required');
    requireEvidence(reference.captureStatus==='CAPTURED','REFERENCE_CAPTURE',reference.component);
    requireEvidence(reference.redistributionApproved===false,'APPROVAL',reference.component);
    requireEvidence(text(reference.sourceUrl)&&text(reference.referenceLicense)&&
      text(reference.exactEmbeddedArtifactMapping)&&text(reference.noticeClosure),
      'REFERENCE','reference metadata');
    evidenceFile(reference.file);
    requireEvidence(!files.has(reference.file),'REFERENCE_DUPLICATE',reference.file);
    files.add(reference.file);
    references.set(reference.component,reference);
  }
  const mappings=review.byteMappings===undefined?[]:review.byteMappings;
  requireEvidence(Array.isArray(mappings),'MAPPINGS');
  const mappedAssets=new Set();
  for(const mapping of mappings){
    digestRecord(mapping,'MAPPING');
    requireEvidence(assets.has(mapping.asset)&&references.has(mapping.reference),
      'MAPPING_REFERENCE','known asset and captured component required');
    requireEvidence(!mappedAssets.has(mapping.asset),'MAPPING_DUPLICATE',mapping.asset);
    mappedAssets.add(mapping.asset);
  }
  requireEvidence(text(testsRoot),'REFERENCE_PATH','testsRoot required');
  let root;
  try{
    root=await realpath(testsRoot);
    requireEvidence((await stat(root)).isDirectory(),'REFERENCE_PATH','testsRoot');
  }catch{requireEvidence(false,'REFERENCE_PATH','testsRoot unavailable');}
  const referenceBytes=new Map(),verifiedReferences=[];
  for(const [component,reference] of references){
    const raw=await capturedBytes(root,reference.file);
    requireEvidence(raw.length===reference.bytes&&sha256(raw)===reference.sha256,
      'REFERENCE_HASH',component);
    referenceBytes.set(component,raw);
    verifiedReferences.push({component,file:reference.file,bytes:raw.length,
      sha256:reference.sha256,verified:true});
  }
  const verifiedMappings=[];
  for(const mapping of mappings){
    const asset=assets.get(mapping.asset),reference=references.get(mapping.reference);
    const local=localBytes.get(mapping.asset),upstream=referenceBytes.get(mapping.reference);
    requireEvidence(mapping.bytes===asset.bytes&&mapping.sha256===asset.sha256&&
      mapping.bytes===reference.bytes&&mapping.sha256===reference.sha256&&
      local.equals(upstream),'MAPPING_BYTES',mapping.asset);
    verifiedMappings.push({asset:mapping.asset,reference:mapping.reference,
      bytes:local.length,sha256:mapping.sha256,verified:true});
  }
  return {status:'BLOCKED',legalApproval:false,redistributionApproved:false,installable:false,
    provenanceSha256:review.provenanceSha256,references:verifiedReferences,byteMappings:verifiedMappings};
}
