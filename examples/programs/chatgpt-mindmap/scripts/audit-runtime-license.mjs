// Read-only production admission and captured-evidence audit, not legal approval.
// All four fixed assets are verified against the existing single provenance
// manifest (length, SHA-256 and Git blob) before license review is reported.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyFixedXmindAssets} from '../preview/serve.mjs';
import {verifyLicenseReview} from './verify-license-review.mjs';

const project=fileURLToPath(new URL('../',import.meta.url));
const provenanceBytes=await readFile(new URL('../tests/xmind-provenance.json',import.meta.url));
const manifest=JSON.parse(provenanceBytes.toString('utf8'));
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
if(pkg.opendesk?.id!=='opendesk.chatgpt-mindmap'||
   manifest.assets?.length!==4||
   !manifest.distribution?.includes('PRODUCTION_BLOCKED'))
  throw new Error('E_XMIND_LICENSE_AUDIT_METADATA_DRIFT');

const resources=await verifyFixedXmindAssets();
// Captured texts and exact upstream comparisons are checked independently of
// the unchanged production approval fields in the original provenance.
const reviewPath='tests/xmind-license-review-r396.json';
const review=JSON.parse(await readFile(resolve(project,reviewPath),'utf8'));
const evidenceIntegrity=await verifyLicenseReview({review,provenanceBytes,resources,
  testsRoot:resolve(project,'tests')});
const required=['upstreamVersion','licenseId','licenseTextSha256','noticeTextSha256',
  'transitiveDependencyLicenses','redistributionRightsEvidence'];
const files=manifest.assets.map(asset=>{
  const missing=required.filter(key=>{
    const value=asset.licenseEvidence?.[key];
    return !value||(Array.isArray(value)&&value.length===0);
  });
  return {name:asset.name,bytes:asset.bytes,sha256:asset.sha256,
    gitBlob:asset.gitBlob,exactBytesVerified:resources.has('/'+asset.name),
    upstreamRevision:manifest.commit,
    upstreamArtifactMapping:evidenceIntegrity.byteMappings.some(row=>row.asset===asset.name)
      ?'EXACT_CAPTURED_UPSTREAM_BYTES':'UNPROVEN',
    licenseStatus:missing.length?'BLOCKED_MISSING_EVIDENCE':'PENDING_MANUAL_REVIEW',
    missingEvidence:missing};
});
const report={
  format:'opendesk.chatgpt-mindmap.license-audit.v1',
  scope:'EXACT_GIT_TRACKED_PREVIEW_BYTES_ONLY_NOT_REDISRIBUTION_APPROVAL',
  sourceRepository:manifest.repository,sourceCommit:manifest.commit,sourceDirectory:manifest.path,
  totalBytes:files.reduce((n,row)=>n+row.bytes,0),files,
  reviewPath,evidenceIntegrity,
  status:files.some(row=>row.missingEvidence.length)?'BLOCKED':'PENDING_MANUAL_REVIEW',
  installable:false,
  redistributionApproved:false,
  notes:[
    'A Git blob match or a public repository does not establish redistribution rights.',
    'MIT licenses of other XMind projects do not establish the license of this exact Snowbrush bundle or its transitive dependencies.',
    'Even complete metadata requires an independent approval and a separate CSS sandbox + Broker security gate.'
  ]
};
if(report.totalBytes!==4042573)throw new Error('E_XMIND_LICENSE_AUDIT_BYTES_DRIFT');
const out=process.argv.indexOf('--out');
if(out>=0){
  const target=process.argv[out+1];
  if(!target)throw new Error('E_XMIND_LICENSE_AUDIT_OUTPUT');
  await mkdir(dirname(resolve(target)),{recursive:true});
  await writeFile(resolve(target),JSON.stringify(report,null,2)+'\n');
}
console.log('XMIND_RUNTIME_LICENSE_AUDIT '+JSON.stringify(report));
if(process.argv.includes('--require-approved')){
  console.error('E_XMIND_REDISTRIBUTION_NOT_APPROVED: '+report.status);
  process.exitCode=1;
}
