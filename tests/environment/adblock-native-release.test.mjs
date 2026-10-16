import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {packageFingerprint} from '../../scripts/verify-package.mjs';
import {verifyAdblockNativeRelease} from '../../scripts/verify-adblock-native-release.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const inputs={head:'a'.repeat(40),driver:Buffer.from('reviewed driver'),
  artifactPackageHash:'c'.repeat(64),runtime:Buffer.from('reviewed SW'),manifest:Buffer.from('reviewed manifest'),
  packageBytes:Buffer.from('{"id":"adblock","version":"1.1.1"}')};
const receipt=()=>Object.assign(Object.fromEntries([
  'nativePermission','network','globalToggle','siteException','otherSite','iframe',
  'closedPanel','workerRestart','browserRestart','revocation','uninstall',
  'installedUiParity','restoreCancellation'].map(key=>[key,'PASS'])),{
  status:'PASS',success:true,env:'real-macos-chrome',candidate:inputs.head,
  chrome:'Chrome/156.0.8078.4',extensionId:'a'.repeat(32),
  artifactPackageHash:inputs.artifactPackageHash,driverSHA256:digest(inputs.driver),swSHA256:digest(inputs.runtime),
  manifestSHA256:digest(inputs.manifest),packageSHA256:digest(inputs.packageBytes),
  installedIdentity:{version:'1.1.1',packageHash:digest(inputs.packageBytes)}});

test('release accepts a completed real Mac receipt for the exact installed candidate',()=>{
  assert.equal(verifyAdblockNativeRelease(receipt(),inputs).status,'PASS');
});

test('release CLI rejects UI artifact drift, missing or malformed receipts and missing artifacts',async t=>{
  const root=await mkdtemp(join(tmpdir(),'adblock-release-gate-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'official-tools/adblock'),{recursive:true});
  await mkdir(join(root,'ui'));
  await writeFile(join(root,'sw.js'),inputs.runtime);
  await writeFile(join(root,'manifest.json'),inputs.manifest);
  await writeFile(join(root,'official-tools/adblock/adblock.opendesk-tool.json'),inputs.packageBytes);
  await writeFile(join(root,'ui/tool-shell.js'),'reviewed UI');
  const report=receipt(),receiptFile=join(root,'..',root.split('/').at(-1)+'.json');
  t.after(()=>rm(receiptFile,{force:true}));
  report.driverSHA256=digest(await readFile(new URL('../framework/adblock-r12-native.test.mjs',import.meta.url)));
  report.artifactPackageHash=(await packageFingerprint(root)).packageHash;
  const save=()=>writeFile(receiptFile,JSON.stringify(report));await save();
  const cli=fileURLToPath(new URL('../../scripts/verify-adblock-native-release.mjs',import.meta.url));
  const run=()=>spawnSync(process.execPath,[cli,receiptFile,root,inputs.head],{encoding:'utf8'});
  assert.equal(run().status,0,'artifact/receipt wiring must accept the exact candidate');
  await writeFile(join(root,'ui/tool-shell.js'),'different UI');
  assert.match(run().stderr,/complete artifact drift/);
  await writeFile(receiptFile,'not JSON');assert.notEqual(run().status,0);
  await rm(receiptFile);assert.notEqual(run().status,0);
  await save();await rm(join(root,'sw.js'));assert.notEqual(run().status,0);
});
test('release rejects skipped, incomplete, failed or differently installed native evidence',()=>{
  for(const change of [{status:'NOT_TESTED'},{success:false},{env:'preview'},
    {restoreCancellation:'NOT_TESTED'},{workerRestart:'NOT_TESTED'},
    {candidate:'b'.repeat(40)},{chrome:''},{extensionId:''},
    {installedIdentity:{version:'1.1.0',packageHash:digest(inputs.packageBytes)}},
    {installedIdentity:{version:'1.1.1',packageHash:'0'.repeat(64)}}])
    assert.throws(()=>verifyAdblockNativeRelease({...receipt(),...change},inputs));
  for(const key of ['driverSHA256','swSHA256','manifestSHA256','packageSHA256','artifactPackageHash'])
    assert.throws(()=>verifyAdblockNativeRelease({...receipt(),[key]:'0'.repeat(64)},inputs),/drift/);
  for(const key of Object.keys(receipt())){
    const missing=receipt();delete missing[key];
    assert.throws(()=>verifyAdblockNativeRelease(missing,inputs),`missing ${key} must reject`);
  }
});
