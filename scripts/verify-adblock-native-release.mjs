import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {packageFingerprint} from './verify-package.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const required=['nativePermission','network','globalToggle','siteException',
  'otherSite','iframe','closedPanel','workerRestart','browserRestart',
  'revocation','uninstall','installedUiParity','restoreCancellation'];

// Job success alone also accepts a skipped node:test. Bind the actual receipt
// to the reviewed driver, runtime and exact official package before publishing.
export function verifyAdblockNativeRelease(report,{head,driver,runtime,manifest,packageBytes,artifactPackageHash}){
  assert.match(head,/^[0-9a-f]{40}$/,'reviewed commit is required');
  assert.equal(report.status,'PASS','native report must pass');
  assert.equal(report.success,true,'native test must actually complete');
  assert.equal(report.env,'real-macos-chrome');
  assert.equal(report.candidate,head,'native commit drift');
  for(const key of required)assert.equal(report[key],'PASS',`native ${key} incomplete`);
  assert.match(artifactPackageHash,/^[0-9a-f]{64}$/,'complete artifact identity required');
  assert.equal(report.artifactPackageHash,artifactPackageHash,'native complete artifact drift');
  for(const [key,bytes] of Object.entries({driverSHA256:driver,swSHA256:runtime,
    manifestSHA256:manifest,packageSHA256:packageBytes}))
    assert.equal(report[key],digest(bytes),`native ${key} drift`);
  assert.match(report.chrome,/^Chrome\/\d+\./,'real Chrome version required');
  assert.match(report.extensionId,/^[a-p]{32}$/,'loaded Chrome extension identity required');
  assert.equal(report.installedIdentity?.version,JSON.parse(packageBytes).version,
    'installed version differs from official package');
  assert.equal(report.installedIdentity?.packageHash,digest(packageBytes),
    'installed package differs from official package');
  return {status:'PASS',evidenceLevel:'CORE_NATIVE_SMOKE',candidate:head,
    artifactPackageHash,packageSHA256:report.packageSHA256,chrome:report.chrome};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [reportFile,root='dist/production',head=process.env.GITHUB_SHA]=process.argv.slice(2);
  assert.ok(reportFile,'native report path is required');
  const report=JSON.parse(await readFile(reportFile,'utf8'));
  const [driver,runtime,manifest,packageBytes]=await Promise.all([
    readFile(new URL('../tests/framework/adblock-r12-native.test.mjs',import.meta.url)),
    readFile(resolve(root,'sw.js')),readFile(resolve(root,'manifest.json')),
    readFile(resolve(root,'official-tools/adblock/adblock.opendesk-tool.json'))]);
  console.log(JSON.stringify(verifyAdblockNativeRelease(report,
    {head,driver,runtime,manifest,packageBytes,artifactPackageHash:(await packageFingerprint(root)).packageHash})));
}
