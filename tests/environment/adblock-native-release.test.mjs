// Native-release gate contract fixtures must follow the real 1.2.3 evidence
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
  from '../../projects/adblock/trusted/cosmetic-policy.js';
import {ADBLOCK_STORE} from '../../projects/adblock/trusted/policy.js';

const digest=value=>createHash('sha256').update(value).digest('hex');
const inputs={
  head:'a'.repeat(40),driver:Buffer.from('reviewed driver'),
  artifactPackageHash:'c'.repeat(64),runtime:Buffer.from('reviewed SW'),
  manifest:Buffer.from(JSON.stringify({
    manifest_version:3,name:'Reviewed AdBlock Fixture',version:'1.0.0',
    background:{service_worker:'sw.js'}})),
  packageBytes:Buffer.from(JSON.stringify({id:'adblock',version:'1.2.3'}))
};
const host='news.example.com',selector='#sponsor';
const rule={host,selector},present={version:1,entries:[rule]},empty={version:1,entries:[]};
const legacyPackageBytes=Buffer.from(JSON.stringify({id:'adblock',version:'1.2.1'}));
const dnrState={version:1,enabled:true,exceptions:[host,'other.example.com'],
  approvedHash:digest(legacyPackageBytes),approvedEpoch:'reviewed-approval'};
const png=Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WZ4T5AAAAAASUVORK5CYII=',
  'base64');
const rootFixture='/tmp/reviewed-adblock/dist/production';
function makeFixture(){
  const root=rootFixture,evidenceFiles=new Map(),screenshots=[],steps={};
  for(const name of MANUAL_COSMETIC_CASES){
    const beforeHasRule=!['pick','cancel','upgrade'].includes(name);
    const afterHasRule=!['cancel','restore','uninstall','upgrade'].includes(name);
    const afterHidden=['pick','reload','reopen','dynamic'].includes(name);
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
      storage:name==='uninstall'?{}:{[ADBLOCK_COSMETIC_STORE]:afterHasRule?present:empty},
      storageReadKeys:[ADBLOCK_COSMETIC_STORE]
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
    if(name==='upgrade'){
      step.fromVersion='1.2.1';step.toVersion='1.2.3';
      step.runtime={};
      for(const phase of ['before','after']){
        step[phase].storage={[ADBLOCK_STORE]:structuredClone(dnrState)};
        step[phase].storageReadKeys=[ADBLOCK_STORE,ADBLOCK_COSMETIC_STORE];
        step.runtime[phase]={extensionId:'a'.repeat(32),profile:'/tmp/reviewed-adblock/profile',root,
          artifactPackageHash:phase==='before'?'b'.repeat(64):inputs.artifactPackageHash,
          installedVersion:phase==='before'?'1.2.1':'1.2.3',
          installedPackageHash:phase==='before'?digest(legacyPackageBytes):digest(inputs.packageBytes)};
        step[phase].storage[ADBLOCK_STORE].approvedHash=step.runtime[phase].installedPackageHash;
      }
    }
    steps[name]=step;
  }
  const manifest=JSON.parse(inputs.manifest.toString('utf8'));
  const packageSHA256=digest(inputs.packageBytes);
  const report=Object.assign(Object.fromEntries([
    'nativePermission','network','globalToggle','siteException','otherSite','iframe',
    'closedPanel','workerRestart','browserRestart','revocation','uninstall',
    'installedUiParity','siteScopeSwitch','restoreOneClick'].map(key=>[key,'PASS'])),{
    status:'PASS',success:true,env:'real-macos-chrome',candidate:inputs.head,
    chrome:'Chrome/156.0.8078.4',extensionId:'a'.repeat(32),
    artifactPackageHash:inputs.artifactPackageHash,driverSHA256:digest(inputs.driver),
    swSHA256:digest(inputs.runtime),manifestSHA256:digest(inputs.manifest),
    packageSHA256,installedIdentity:{version:'1.2.3',packageHash:packageSHA256},
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

test('release accepts the complete validated 1.2.3 fixture contract (not real Chrome evidence)',()=>{
  assert.equal(verifyAdblockNativeRelease(receipt(),inputs).status,'PASS');
});

test('upgrade accepts absent or empty new cosmetic storage after preserving real 1.2.1 DNR state',()=>{
  for(const cosmetic of [undefined,empty])for(const epoch of [dnrState.approvedEpoch,null]){
    const {report,evidenceFiles}=makeFixture();
    const step=report.cases.manualCosmetic.steps.upgrade;
    if(cosmetic)step.after.storage[ADBLOCK_COSMETIC_STORE]=cosmetic;
    for(const phase of ['before','after']){
      step[phase].storage[ADBLOCK_STORE].approvedEpoch=epoch;
      assert.equal(step[phase].storage[ADBLOCK_STORE].approvedHash,
        digest(phase==='before'?legacyPackageBytes:inputs.packageBytes));
    }
    assert.notEqual(step.before.storage[ADBLOCK_STORE].approvedHash,step.after.storage[ADBLOCK_STORE].approvedHash);
    writeManualEvidence(report,evidenceFiles);
    assert.equal(verifyAdblockNativeRelease(report,{...inputs,evidenceFiles}).status,'PASS');
  }
});

test('upgrade binds an unchanged absolute deployment path independently of the frozen source',()=>{
  const deployedRoot='/tmp/reviewed-adblock/exclusive-deployment';
  for(const value of [undefined,null,deployedRoot]){
    const {report,evidenceFiles}=makeFixture();
    if(value!==undefined)report.deployedRoot=value;
    for(const runtime of Object.values(report.cases.manualCosmetic.steps.upgrade.runtime))
      runtime.root=value??report.root;
    writeManualEvidence(report,evidenceFiles);
    assert.equal(verifyAdblockNativeRelease(report,{...inputs,evidenceFiles}).status,'PASS');
  }
  const negatives=[
    ['before path changed',s=>{s.runtime.before.root+='/different';}],
    ['after path changed',s=>{s.runtime.after.root+='/different';}],
    ['frozen source used for deployment',s=>{
      for(const runtime of Object.values(s.runtime))runtime.root=rootFixture;
    }],
    ...['', 'relative/deployment', 42].map(value=>['invalid deployment '+String(value),(s,r)=>{
      r.deployedRoot=value;
      for(const runtime of Object.values(s.runtime))runtime.root=value;
    }])
  ];
  for(const [label,alter] of negatives){
    const {report,evidenceFiles}=makeFixture();
    report.deployedRoot=deployedRoot;
    const step=report.cases.manualCosmetic.steps.upgrade;
    for(const runtime of Object.values(step.runtime))runtime.root=deployedRoot;
    alter(step,report);
    writeManualEvidence(report,evidenceFiles);
    assert.throws(()=>verifyAdblockNativeRelease(report,{...inputs,evidenceFiles}),undefined,label);
  }
});

test('upgrade rejects lost state, fabricated legacy rules and missing runtime identity evidence',()=>{
  const negatives=[
    ['lost exception',s=>{s.after.storage[ADBLOCK_STORE].exceptions.pop();}],
    ['all exceptions lost',s=>{s.after.storage[ADBLOCK_STORE].exceptions=[];}],
    ['global disabled',s=>{s.after.storage[ADBLOCK_STORE].enabled=false;}],
    ['approval hash drift',s=>{s.after.storage[ADBLOCK_STORE].approvedHash='f'.repeat(64);}],
    ['old approval hash retained',s=>{
      s.after.storage[ADBLOCK_STORE].approvedHash=s.before.storage[ADBLOCK_STORE].approvedHash;
    }],
    ['new approval hash fabricated before upgrade',s=>{
      s.before.storage[ADBLOCK_STORE].approvedHash=s.after.storage[ADBLOCK_STORE].approvedHash;
    }],
    ['approval epoch drift',s=>{s.after.storage[ADBLOCK_STORE].approvedEpoch='different';}],
    ['approval epoch cleared',s=>{s.after.storage[ADBLOCK_STORE].approvedEpoch=null;}],
    ['legacy null epoch replaced',s=>{s.before.storage[ADBLOCK_STORE].approvedEpoch=null;}],
    ['old cosmetic key even if empty',s=>{s.before.storage[ADBLOCK_COSMETIC_STORE]=empty;}],
    ['fabricated old manual',s=>{s.before.storage[ADBLOCK_COSMETIC_STORE]=present;}],
    ['fabricated preserved manual',s=>{
      for(const phase of ['before','after']){
        s[phase].storage[ADBLOCK_COSMETIC_STORE]=present;s[phase].targetHidden=true;
      }
    }],
    ['premature new manual',s=>{s.after.storage[ADBLOCK_COSMETIC_STORE]=present;}],
    ['missing runtime',s=>{delete s.runtime;}],
    ['wrong source version',s=>{s.fromVersion='1.2.0';}],
    ['wrong target version',s=>{s.toVersion='1.2.2';}],
    ['changed profile',s=>{s.runtime.after.profile+='/different';}],
    ['reviewed artifact drift',s=>{s.runtime.after.artifactPackageHash='f'.repeat(64);}],
    ['installed package drift',s=>{s.runtime.after.installedPackageHash='f'.repeat(64);}],
    ['reused screenshot',s=>{s.screenshots.after=s.screenshots.before;}]
  ];
  for(const phase of ['before','after']){
    const add=(label,alter)=>negatives.push([phase+' '+label,s=>alter(s[phase],s.runtime,phase)]);
    add('state missing',v=>{delete v.storage[ADBLOCK_STORE];});
    add('incomplete state',v=>{delete v.storage[ADBLOCK_STORE].approvedEpoch;});
    add('state version drift',v=>{v.storage[ADBLOCK_STORE].version=2;});
    add('extra state field',v=>{v.storage[ADBLOCK_STORE].migrationNote='modified';});
    add('approval hash cleared',v=>{v.storage[ADBLOCK_STORE].approvedHash=null;});
    add('initially no exceptions',v=>{v.storage[ADBLOCK_STORE].exceptions=[];});
    add('initially disabled',v=>{v.storage[ADBLOCK_STORE].enabled=false;});
    add('missing query keys',v=>{delete v.storageReadKeys;});
    add('query keys wrong type',v=>{v.storageReadKeys=ADBLOCK_STORE;});
    for(const key of [ADBLOCK_STORE,ADBLOCK_COSMETIC_STORE])
      add('did not query '+key,v=>{v.storageReadKeys=v.storageReadKeys.filter(k=>k!==key);});
    add('non webpage',v=>{v.url='chrome-extension://'+'a'.repeat(32)+'/page.html';});
    add('missing tab',v=>{delete v.tabId;});
    add('missing document',v=>{delete v.documentId;});
    add('hidden target',v=>{v.targetHidden=true;});
    add('missing target',v=>{v.targetPresent=false;});
    add('missing runtime',(_v,r,p)=>{delete r[p];});
    add('wrong ID',(_v,r,p)=>{r[p].extensionId='b'.repeat(32);});
    add('wrong root',(_v,r,p)=>{r[p].root+='/different';});
    add('relative profile',(_v,r,p)=>{r[p].profile='profile';});
    add('wrong installed version',(_v,r,p)=>{r[p].installedVersion=p==='before'?'1.2.2':'1.2.1';});
    for(const key of ['extensionId','profile','root','installedVersion','artifactPackageHash','installedPackageHash'])
      add('missing '+key,(_v,r,p)=>{delete r[p][key];});
    for(const key of ['artifactPackageHash','installedPackageHash']){
      for(const invalid of ['',null,'g'.repeat(64),'a'.repeat(63),'a'.repeat(65)])
        add('invalid '+key+' '+String(invalid),(_v,r,p)=>{r[p][key]=invalid;});
      add('unchanged '+key,(_v,r,p)=>{r[p][key]=r[p==='before'?'after':'before'][key];});
    }
  }
  for(const [label,alter] of negatives){
    const {report,evidenceFiles}=makeFixture();
    alter(report.cases.manualCosmetic.steps.upgrade);
    writeManualEvidence(report,evidenceFiles);
    assert.throws(()=>verifyAdblockNativeRelease(report,{...inputs,evidenceFiles}),undefined,label);
  }
});

test('uninstall requires queried, removed cosmetic storage; other lifecycle steps retain rules',()=>{
  for(const alter of [
    step=>{step.after.storage[ADBLOCK_COSMETIC_STORE]=present;},
    step=>{step.after.storage[ADBLOCK_COSMETIC_STORE]=empty;},
    step=>{delete step.after.storageReadKeys;},
    step=>{step.after.storageReadKeys=[];},
    step=>{step.after.storageReadKeys=[ADBLOCK_COSMETIC_STORE+'.wrong'];},
    step=>{step.after.storageReadKeys=ADBLOCK_COSMETIC_STORE;}
  ]){
    const {report,evidenceFiles}=makeFixture();
    alter(report.cases.manualCosmetic.steps.uninstall);
    writeManualEvidence(report,evidenceFiles);
    assert.throws(()=>verifyAdblockNativeRelease(report,{...inputs,evidenceFiles}),/uninstall/);
  }
  for(const name of MANUAL_COSMETIC_CASES)for(const phase of ['before','after']){
    if(name==='upgrade'||name==='uninstall'&&phase==='after')continue;
    const {report,evidenceFiles}=makeFixture();
    report.cases.manualCosmetic.steps[name][phase].storage={};
    writeManualEvidence(report,evidenceFiles);
    assert.throws(()=>verifyAdblockNativeRelease(report,{...inputs,evidenceFiles}),/Chrome storage readback required/);
  }
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
  for(const runtime of Object.values(report.cases.manualCosmetic.steps.upgrade.runtime))runtime.root=root;
  report.driverSHA256=digest(await readFile(new URL('../framework/adblock-r12-native.test.mjs',import.meta.url)));
  report.cases.manualCosmetic.driverSHA256=report.driverSHA256;
  report.artifactPackageHash=(await packageFingerprint(root)).packageHash;
  report.packageIdentity.artifactPackageHash=report.artifactPackageHash;
  report.cases.manualCosmetic.artifactPackageHash=report.artifactPackageHash;
  report.cases.manualCosmetic.steps.upgrade.runtime.after.artifactPackageHash=report.artifactPackageHash;
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
    {restoreOneClick:'NOT_TESTED'},{workerRestart:'NOT_TESTED'},
    {candidate:'b'.repeat(40)},{chrome:''},{extensionId:''},
    {installedIdentity:{version:'1.2.1',packageHash:digest(inputs.packageBytes)}},
    {environment:'DEVELOPMENT'},{releaseReady:false},{manualCosmetic:'NOT_TESTED'},
    {installedIdentity:{version:'1.2.3',packageHash:'0'.repeat(64)}}])
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
