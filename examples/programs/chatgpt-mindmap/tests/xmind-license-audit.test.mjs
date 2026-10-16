import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyFixedXmindAssets} from '../preview/serve.mjs';
import {verifyLicenseReview} from '../scripts/verify-license-review.mjs';

test('R395 captured references verify one exact artifact without approving redistribution',async()=>{
  const testsRoot=fileURLToPath(new URL('./',import.meta.url));
  const review=JSON.parse(await readFile(new URL('./xmind-license-review-r395.json',import.meta.url),'utf8'));
  const provenanceBytes=await readFile(new URL('./xmind-provenance.json',import.meta.url));
  const result=await verifyLicenseReview({review,provenanceBytes,testsRoot,
    resources:await verifyFixedXmindAssets()});
  assert.equal(result.references.length,16);
  assert.deepEqual(result.byteMappings.map(row=>row.asset),['jszip.min.js']);
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.legalApproval,false);
  assert.equal(result.installable,false);
});

test('license CLI reports integrity and the mandatory approval gate still exits nonzero',()=>{
  const script=fileURLToPath(new URL('../scripts/audit-runtime-license.mjs',import.meta.url));
  const child=spawnSync(process.execPath,[script,'--require-approved'],{encoding:'utf8'});
  assert.equal(child.error,undefined);
  assert.equal(child.status,1);
  assert.match(child.stderr,/E_XMIND_REDISTRIBUTION_NOT_APPROVED: BLOCKED/);
  const report=JSON.parse(child.stdout.trim().replace(/^XMIND_RUNTIME_LICENSE_AUDIT /,''));
  assert.equal(report.status,'BLOCKED');
  assert.equal(report.redistributionApproved,false);
  assert.equal(report.evidenceIntegrity.byteMappings.length,1);
  assert.equal(report.files.filter(row=>row.upstreamArtifactMapping==='EXACT_CAPTURED_UPSTREAM_BYTES').length,1);
});
