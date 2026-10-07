import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {inputIdentity} from '../../scripts/wxt-checkpoint.mjs';
import {packageFingerprint} from '../../scripts/verify-package.mjs';
export {launchChrome} from './k5-sdk-native-launcher.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

// Read-only binding: this never builds, packages, creates a checkpoint, or
// changes migration inputs. HTTP module execution remains native component QA.
export async function candidateIdentity(root) {
  assert.equal(process.cwd(), root, `Run with cwd=${root}`);
  const inputs = await inputIdentity(), packages = {};
  for (const mode of ['production', 'development']) {
    const directory = resolve(root, 'dist', mode);
    const fingerprint = await packageFingerprint(directory);
    const zipPath = resolve(root, 'artifacts', `opendesk-browser-${mode}.zip`);
    const zip = await readFile(zipPath);
    const receiptPath = resolve(root, 'docs/framework/evidence/wxt/packages', `pack-${mode}.json`);
    const receiptBytes = await readFile(receiptPath), receipt = JSON.parse(receiptBytes);
    assert.equal(receipt.status, 'passed', `${mode} requires a completed pack receipt`);
    assert.equal(receipt.mode, mode);
    assert.equal(receipt.packageHash, fingerprint.packageHash, `${mode} package changed since pack`);
    assert.equal(receipt.zipSha256, sha(zip), `${mode} ZIP changed since pack`);
    assert.equal(receipt.bytes, zip.length);
    packages[mode] = {directory, ...fingerprint,
      zip: {path: zipPath, bytes: zip.length, sha256: sha(zip)},
      packReceipt: {path: receiptPath, sha256: sha(receiptBytes), matchesActualArtifacts: true}};
  }
  return {schema: 'wxt.native-idb-component-inputs.v1', ...inputs, packages,
    qualification: 'native component; package hashes bind artifacts, not packaged extension E2E',
    checkpointCreated: false};
}

export function compareCandidate(before, after) {
  return {
    productInputsUnchanged: before.productInputsSha256 === after.productInputsSha256,
    verificationInputsUnchanged: before.verificationInputsSha256 === after.verificationInputsSha256,
    packagesUnchanged: Object.keys(before.packages).every(mode =>
      before.packages[mode].packageHash === after.packages[mode].packageHash),
    zipBytesUnchanged: Object.keys(before.packages).every(mode =>
      before.packages[mode].zip.sha256 === after.packages[mode].zip.sha256),
  };
}
