// Native-release gate contract fixtures must follow the real 1.2.2 evidence
// schema. Synthetic evidence here tests validation only, NEVER native approval.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {packageFingerprint} from '../../scripts/verify-package.mjs';
import {verifyAdblockNativeRelease,MANUAL_COSMETIC_CASES}
  from '../../scripts/verify-adblock-native-release.mjs';
import {ADBLOCK_COSMETIC_STORE}
  from '../../examples/sidebar-tools/adblock/trusted/cosmetic-policy.js';

const digest=value=>createHash('sha256').update(value).digest('hex');
const inputs={
  head:'a'.repeat(40),driver:Buffer.from('reviewed driver'),
  artifactPackageHash:'c'.repeat(64),runtime:Buffer.from('reviewed SW'),
  manifest:Buffer.from(JSON.stringify({
    manifest_version:3,name:'Reviewed AdBlock Fixture',version:'1.0.0',
    background:{service_worker:'sw.js'}})),
  packageBytes:Buffer.from(JSON.stringify({id:'adblock',version:'1.2.2'}))
};
const host='news.example.com',selector='#sponsor';
const rule={host,selector},present={version:1,entries:[rule]},empty={version:1,entries:[]};
const png=Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WZ4T5AAAAAASUVORK5CYII=',
  'base64');
const rootFixture='/tmp/reviewed-adblock/dist/production';
function makeFixture(){
  const root=rootFixture,evidenceFiles=new Map(),screenshots=[],steps={};
  for(const name of MANUAL_COSMETIC_CASES){
    const beforeHasRule=!['pick','cancel'].includes(name);
    const afterHasRule=!['cancel','restore'].includes(name);
    const afterHidden=['pick','reload','reopen','dynamic','upgrade'].includes(name);
    const before={
      url:'https://'+host+'/fixture',tabId:10,documentId:'doc-'+name,
      targetPresent:name!=='dynamic',targetHidden:beforeHasRule&&name!=='dynamic',
      storage:{[ADBLOCK_COSMETIC_STORE]:beforeHasRule?present:empty}
    };
    const after={
      url:'https://'+(name==='siteIsolation'?'other.example.com':host)+'/fixture',
      tabId:name==='reopen'?11:10,
      documentId:['reload','reopen'].includes(name)?'new-doc-'+name:before.documentId,
      targetPresent:true,targetHidden:afterHidden,
      storage:{[ADBLOCK_COSMETIC_STORE]:afterHasRule?present:empty}
    };
    const shotFiles={};
    for(const phase of ['before','after']){
      const file='cosmetic-'+name+'-'+phase+'.png';
      shotFiles[phase]=file;evidenceFiles.set(file,png);
      screenshots.push({file,bytes:png.length,sha256:digest(png)});
    }
    const step={status:'PASS',before,after,screenshots:shotFiles};
    if(['pick','cancel','restore'].includes(name))
      step.input={isTrusted:true,type:name==='cancel'?'keydown':'pointerdown'};
    if(name==='upgrade'){step.fromVersion='1.2.1';step.toVersion='1.2.2';}
    steps[name]=step;
  }
  const manifest=JSON.parse(inputs.manifest.toString('utf8'));
  const packageSHA256=digest(inputs.packageBytes);
  const report=Object.assign(Object.fromEntries([
    'nativePermission','network','globalToggle','siteException','otherSite','iframe',
    'closedPanel','workerRestart','browserRestart','revocation','uninstall',
    'installedUiParity','restoreCancellation'].map(key=>[key,'PASS'])),{
    status:'PASS',success:true,env:'real-macos-chrome',candidate:inputs.head,
    chrome:'Chrome/156.0.8078.4',extensionId:'a'.repeat(32),
    artifactPackageHash:inputs.artifactPackageHash,driverSHA256:digest(inputs.driver),
    swSHA256:digest(inputs.runtime),manifestSHA256:digest(inputs.manifest),
    packageSHA256,installedIdentity:{version:'1.2.2',packageHash:packageSHA256},
    environment:'PRODUCTION',releaseReady:true,root,cleanupErrors:[],evidenceErrors:[],
    manualCosmetic:'PASS',screenshots,
    packageIdentity:{
      root,loadedManifestMatched:true,manifestVersion:manifest.version,
      manifestName:manifest.name,artifactPackageHash:inputs.artifactPackageHash,
      swSHA256:digest(inputs.runtime),manifestSHA256:digest(inputs.manifest),
      packageSHA256,installedPackageHash:packageSHA256
    },
    cases:{manualCosmetic:{
      schemaVersion:1,status:'PASS',host,selector,steps,candidate:inputs.head,
      artifactPackageHash:inputs.artifactPackageHash,extensionId:'a'.repeat(32),
      packageSHA256,driverSHA256:digest(inputs.driver)
    }}
  });
  writeManualEvidence(report,evidenceFiles);
  return {report,evidenceFiles};
}
function writeManualEvidence(report,files){
  const row=report.cases.manualCosmetic,{evidence,...copy}=row;
  const data=Buffer.from(JSON.stringify(copy));
  const file='cosmetic-evidence.json';
  files.set(file,data);
  row.evidence={file,bytes:data.length,sha256:digest(data)};
}
const receipt=()=>makeFixture().report;
inputs.evidenceFiles=makeFixture().evidenceFiles;

test('release accepts the complete validated 1.2.2 fixture contract (not real Chrome evidence)',()=>{
  assert.equal(verifyAdblockNativeRelease(receipt(),inputs).status,'PASS');
});

test('release CLI detects complete-artifact drift and malformed or missing evidence',async t=>{
  const temp=await mkdtemp(join(tmpdir(),'adblock-native-r24-contract-'));
  t.after(()=>rm(temp,{recursive:true,force:true}));
  const root=join(temp,'dist','production'),evidenceDir=join(temp,'evidence');
  await mkdir(join(root,'official-tools/adblock'),{recursive:true});
  await mkdir(join(root,'ui'));await mkdir(evidenceDir);
  await writeFile(join(root,'sw.js'),inputs.runtime);
  await writeFile(join(root,'manifest.json'),inputs.manifest);
  await writeFile(join(root,'official-tools/adblock/adblock.opendesk-tool.json'),inputs.packageBytes);
  await writeFile(join(root,'ui/tool-shell.js'),'reviewed UI');
  const {report,evidenceFiles}=makeFixture();
  report.root=root;report.packageIdentity.root=root;
  report.driverSHA256=digest(await readFile(new URL('../framework/adblock-r12-native.test.mjs',import.meta.url)));
  report.cases.manualCosmetic.driverSHA256=report.driverSHA256;
  report.artifactPackageHash=(await packageFingerprint(root)).packageHash;
  report.packageIdentity.artifactPackageHash=report.artifactPackageHash;
  report.cases.manualCosmetic.artifactPackageHash=report.artifactPackageHash;
  writeManualEvidence(report,evidenceFiles);
  for(const [name,bytes] of evidenceFiles)await writeFile(join(evidenceDir,name),bytes);
  const receiptFile=join(evidenceDir,'native-report.json');
  const save=()=>writeFile(receiptFile,JSON.stringify(report));await save();
  const cli=fileURLToPath(new URL('../../scripts/verify-adblock-native-release.mjs',import.meta.url));
  const run=()=>spawnSync(process.execPath,[cli,receiptFile,root,inputs.head],{encoding:'utf8'});
  assert.equal(run().status,0,'native release verifier must accept the complete fixture');
  await writeFile(join(root,'ui/tool-shell.js'),'different UI');
  assert.match(run().stderr,/complete artifact drift/);
  await writeFile(receiptFile,'not JSON');assert.notEqual(run().status,0);
  await rm(receiptFile);assert.notEqual(run().status,0);
  await save();await rm(join(root,'sw.js'));assert.notEqual(run().status,0);
});

test('release rejects skipped, incomplete, altered identity and manual cosmetic evidence',()=>{
  for(const change of [{status:'NOT_TESTED'},{success:false},{env:'preview'},
    {restoreCancellation:'NOT_TESTED'},{workerRestart:'NOT_TESTED'},
    {candidate:'b'.repeat(40)},{chrome:''},{extensionId:''},
    {installedIdentity:{version:'1.2.1',packageHash:digest(inputs.packageBytes)}},
    {environment:'DEVELOPMENT'},{releaseReady:false},{manualCosmetic:'NOT_TESTED'},
    {installedIdentity:{version:'1.2.2',packageHash:'0'.repeat(64)}}])
    assert.throws(()=>verifyAdblockNativeRelease({...receipt(),...change},inputs));
  for(const key of ['driverSHA256','swSHA256','manifestSHA256','packageSHA256','artifactPackageHash'])
    assert.throws(()=>verifyAdblockNativeRelease({...receipt(),[key]:'0'.repeat(64)},inputs),/drift/);
  for(const key of Object.keys(receipt())){
    const missing=receipt();delete missing[key];
    assert.throws(()=>verifyAdblockNativeRelease(missing,inputs),'missing '+key+' must reject');
  }
  const bad=makeFixture();
  bad.evidenceFiles.set('cosmetic-evidence.json',Buffer.from('{}'));
  assert.throws(()=>verifyAdblockNativeRelease(bad.report,{...inputs,evidenceFiles:bad.evidenceFiles}));
  const traversal=makeFixture();
  traversal.report.cases.manualCosmetic.evidence.file='../unsafe.json';
  assert.throws(()=>verifyAdblockNativeRelease(traversal.report,inputs),/path/);
});
