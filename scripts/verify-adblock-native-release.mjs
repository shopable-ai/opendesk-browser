import assert from 'node:assert/strict';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,isAbsolute,relative,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {packageFingerprint} from './verify-package.mjs';
import {ADBLOCK_COSMETIC_STORE,readCosmeticState,validCosmeticSelector}
  from '../projects/adblock/trusted/cosmetic-policy.js';
import {ADBLOCK_STORE,readAdblockState}
  from '../projects/adblock/trusted/policy.js';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const required=['nativePermission','network','globalToggle','siteException',
  'otherSite','iframe','closedPanel','workerRestart','browserRestart',
  'revocation','uninstall','installedUiParity','siteScopeSwitch','restoreOneClick'];

// Native driver contract for 1.2.3. A DNR-only receipt cannot satisfy this gate.
// report.manualCosmetic = 'PASS'; report.cases.manualCosmetic = {
//   schemaVersion:1, status:'PASS', host, selector, steps, evidence:{file,bytes,sha256},
//   candidate, artifactPackageHash, extensionId, packageSHA256, driverSHA256
// }.
// Each step is {status:'PASS', before, after, screenshots:{before:file,after:file}}.
// Snapshots contain url, tabId, documentId, targetPresent, targetHidden and
// storage:{[ADBLOCK_COSMETIC_STORE]:{version:1,entries:[{host,selector}]}}.
// pick/cancel/restore also require input:{isTrusted:true,type:'pointerdown'|'keydown'}.
// upgrade additionally requires fromVersion:'1.2.1', toVersion:'1.2.3'.
// Its snapshots query both storage keys: 1.2.1 has no cosmetic key, and 1.2.3
// has no manual rules yet. Preserve enabled DNR state/exceptions and approval
// epoch; rebind only the approval hash to the installed package in each phase.
// step.runtime.{before,after} records extensionId, profile, root,
// artifactPackageHash, installedVersion and installedPackageHash for each load.
// Runtime roots bind to report.deployedRoot (fallback: report.root); report.root
// remains the frozen artifact source used for independent package verification.
// evidence is a separate JSON copy of the manualCosmetic object without its
// evidence descriptor; all screenshots use the existing report.screenshots format.
export const MANUAL_COSMETIC_CASES=Object.freeze(['pick','cancel','reload','reopen',
  'dynamic','siteIsolation','restore','globalOff','siteException','disable',
  'revocation','uninstall','upgrade']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const sha256=/^[0-9a-f]{64}$/;
const pngSignature=Buffer.from('89504e470d0a1a0a','hex');
function evidencePath(file){
  assert.ok(typeof file==='string'&&file.length>0&&!isAbsolute(file)&&
    !/[\\\x00-\x1f%:?#]/.test(file)&&file.split('/').every(part=>part&&part!=='.'&&part!=='..'),
  'native evidence path must stay inside the receipt directory');
  return file;
}
function artifact(descriptor,files,label){
  assert.ok(object(descriptor),`${label} descriptor required`);
  const file=evidencePath(descriptor.file);
  assert.ok(Number.isSafeInteger(descriptor.bytes)&&descriptor.bytes>0,`${label} bytes required`);
  assert.match(descriptor.sha256,sha256,`${label} SHA256 required`);
  const bytes=files?.get(file);
  assert.ok(Buffer.isBuffer(bytes),`${label} file missing: ${file}`);
  assert.equal(bytes.length,descriptor.bytes,`${label} byte count drift`);
  assert.equal(digest(bytes),descriptor.sha256,`${label} SHA256 drift`);
  return bytes;
}
function verifyManualCosmetic(report,evidenceFiles){
  assert.equal(report.manualCosmetic,'PASS','native manualCosmetic incomplete');
  const manual=report.cases?.manualCosmetic;
  assert.ok(object(manual),'native manualCosmetic cases required');
  assert.equal(manual.schemaVersion,1,'native manualCosmetic schema required');
  assert.equal(manual.status,'PASS','native manualCosmetic cases incomplete');
  for(const key of ['candidate','artifactPackageHash','extensionId','packageSHA256','driverSHA256'])
    assert.equal(manual[key],report[key],`manualCosmetic ${key} drift`);
  assert.ok(typeof manual.host==='string'&&manual.host&&
    new URL('https://'+manual.host).hostname===manual.host,'exact cosmetic hostname required');
  assert.ok(validCosmeticSelector(manual.selector),'safe cosmetic selector required');
  const raw=artifact(manual.evidence,evidenceFiles,'manualCosmetic evidence');
  assert.ok(manual.evidence.file.endsWith('.json'),'manualCosmetic JSON evidence required');
  const {evidence,...record}=manual;
  assert.deepEqual(JSON.parse(raw.toString('utf8')),record,'manualCosmetic raw evidence drift');
  assert.ok(Array.isArray(report.screenshots)&&report.screenshots.length>0,'native screenshots required');
  const shots=new Set();
  for(const shot of report.screenshots){
    const bytes=artifact(shot,evidenceFiles,'native screenshot');
    assert.ok(shot.file.endsWith('.png')&&bytes.subarray(0,8).equals(pngSignature)&&bytes.length>8,
      'native screenshot must contain PNG bytes');
    assert.ok(!shots.has(shot.file),'duplicate native screenshot');shots.add(shot.file);
  }
  assert.ok(object(manual.steps),'native manualCosmetic steps required');
  const usedShots=new Set();
  const snapshot=(value,label,{uninstalled=false,upgrade=false}={})=>{
    assert.ok(object(value),`${label} snapshot required`);
    const url=new URL(value.url);
    assert.ok(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password,
      `${label} ordinary webpage required`);
    assert.ok(Number.isSafeInteger(value.tabId)&&value.tabId>0,`${label} tab identity required`);
    assert.ok(typeof value.documentId==='string'&&value.documentId.length>0,`${label} document identity required`);
    assert.equal(typeof value.targetPresent,'boolean',`${label} target presence required`);
    assert.equal(typeof value.targetHidden,'boolean',`${label} visibility required`);
    assert.ok(object(value.storage),`${label} Chrome storage readback required`);
    const removed=!Object.hasOwn(value.storage,ADBLOCK_COSMETIC_STORE);
    if(upgrade){
      assert.ok(Array.isArray(value.storageReadKeys)&&
        [ADBLOCK_STORE,ADBLOCK_COSMETIC_STORE].every(key=>value.storageReadKeys.includes(key)),
      `${label} upgrade storage query required`);
      if(removed)return {url,state:{version:1,entries:[]},present:false};
    }
    if(uninstalled){
      // The existing trusted lifecycle removes this key on uninstall. Preserve
      // the raw Chrome result, and require proof that the missing key was read.
      assert.ok(Array.isArray(value.storageReadKeys)&&
        value.storageReadKeys.includes(ADBLOCK_COSMETIC_STORE),
      `${label} uninstall storage query required`);
      assert.ok(removed,`${label} uninstall must remove cosmetic storage`);
      return {url,state:{version:1,entries:[]},present:false};
    }
    assert.ok(!removed,`${label} Chrome storage readback required`);
    const state=readCosmeticState(value.storage[ADBLOCK_COSMETIC_STORE]);
    // undefined cannot stand in for a Chrome readback of the persisted schema.
    assert.deepEqual(value.storage[ADBLOCK_COSMETIC_STORE],state,`${label} rule readback schema drift`);
    return {url,state,present:state.entries.some(row=>row.host===manual.host&&row.selector===manual.selector)};
  };
  for(const name of MANUAL_COSMETIC_CASES){
    const step=manual.steps[name],label='manualCosmetic '+name;
    assert.ok(object(step),`${label} evidence required`);
    assert.equal(step.status,'PASS',`${label} incomplete`);
    const before=snapshot(step.before,label+' before',{upgrade:name==='upgrade'}),
      after=snapshot(step.after,label+' after',{uninstalled:name==='uninstall',upgrade:name==='upgrade'});
    assert.equal(before.url.hostname,manual.host,`${label} source host drift`);
    assert.equal(step.before.targetPresent,name!=='dynamic',`${label} initial target presence drift`);
    assert.equal(step.after.targetPresent,true,`${label} target must remain in DOM`);
    const initialRule=!['pick','cancel','upgrade'].includes(name);
    const finalRule=!['cancel','restore','uninstall','upgrade'].includes(name);
    const finalHidden=['pick','reload','reopen','dynamic'].includes(name);
    assert.equal(before.present,initialRule,`${label} initial rule readback drift`);
    assert.equal(after.present,finalRule,`${label} final rule readback drift`);
    assert.equal(step.before.targetHidden,initialRule&&name!=='dynamic',`${label} initial visibility drift`);
    assert.equal(step.after.targetHidden,finalHidden,`${label} final visibility drift`);
    if(name==='siteIsolation')assert.notEqual(after.url.hostname,manual.host,'cosmetic site isolation must change host');
    else assert.equal(after.url.hostname,manual.host,`${label} destination host drift`);
    if(name==='pick')assert.deepEqual(after.state.entries,
      [...before.state.entries,{host:manual.host,selector:manual.selector}].sort((a,b)=>
        a.host.localeCompare(b.host)||a.selector.localeCompare(b.selector)),`${label} must only add the selected rule`);
    else if(name==='restore')assert.deepEqual(after.state.entries,before.state.entries.filter(row=>
      row.host!==manual.host||row.selector!==manual.selector),`${label} must only remove the selected rule`);
    else if(name!=='uninstall')assert.deepEqual(after.state,before.state,`${label} must preserve stored rules`);
    if(['reload','reopen'].includes(name))
      assert.notEqual(step.after.documentId,step.before.documentId,`${label} must create a new document`);
    if(name==='reopen')assert.notEqual(step.after.tabId,step.before.tabId,'reopen must create a new tab');
    if(['pick','cancel','restore'].includes(name)){
      assert.equal(step.input?.isTrusted,true,`${label} trusted input required`);
      assert.ok(['pointerdown','keydown'].includes(step.input?.type),`${label} input type required`);
    }
    if(name==='upgrade'){
      assert.equal(step.fromVersion,'1.2.1','manualCosmetic upgrade source version required');
      assert.equal(step.toVersion,'1.2.3','manualCosmetic upgrade target version required');
      assert.ok(!Object.hasOwn(step.before.storage,ADBLOCK_COSMETIC_STORE),
        `${label} 1.2.1 must have no cosmetic key`);
      for(const phase of ['before','after']){
        const storage=step[phase].storage;
        assert.ok(Object.hasOwn(storage,ADBLOCK_STORE),`${label} ${phase} complete DNR state required`);
        const state=readAdblockState(storage[ADBLOCK_STORE]);
        assert.equal(state.enabled,true,`${label} ${phase} global enabled required`);
        assert.ok(state.exceptions.length>0,`${label} ${phase} nonempty exceptions required`);
        const runtime=step.runtime?.[phase];
        assert.ok(object(runtime),`${label} ${phase} runtime identity required`);
        assert.equal(runtime.extensionId,report.extensionId,`${label} ${phase} extension ID drift`);
        assert.ok(typeof runtime.root==='string'&&isAbsolute(runtime.root),
          `${label} ${phase} absolute deployed root required`);
        assert.equal(runtime.root,report.deployedRoot??report.root,`${label} ${phase} deployed root drift`);
        assert.ok(typeof runtime.profile==='string'&&isAbsolute(runtime.profile),
          `${label} ${phase} profile required`);
        assert.equal(runtime.installedVersion,phase==='before'?'1.2.1':'1.2.3',
          `${label} ${phase} installed version drift`);
        for(const key of ['artifactPackageHash','installedPackageHash'])
          assert.match(runtime[key],sha256,`${label} ${phase} ${key} required`);
        assert.equal(state.approvedHash,runtime.installedPackageHash,
          `${label} ${phase} approval must bind installed package`);
      }
      for(const key of ['enabled','exceptions','version','approvedEpoch'])
        assert.deepEqual(step.after.storage[ADBLOCK_STORE][key],step.before.storage[ADBLOCK_STORE][key],
          `${label} must preserve DNR ${key}`);
      assert.equal(step.runtime.after.profile,step.runtime.before.profile,`${label} profile drift`);
      assert.equal(step.runtime.after.root,step.runtime.before.root,`${label} deployed root must remain unchanged`);
      for(const key of ['artifactPackageHash','installedPackageHash'])
        assert.notEqual(step.runtime.after[key],step.runtime.before[key],`${label} ${key} must change`);
      assert.equal(step.runtime.after.artifactPackageHash,report.artifactPackageHash,
        `${label} reviewed artifact drift`);
      assert.equal(step.runtime.after.installedPackageHash,report.installedIdentity.packageHash,
        `${label} installed package drift`);
    }
    for(const phase of ['before','after']){
      const file=step.screenshots?.[phase];
      assert.ok(shots.has(file),`${label} ${phase} screenshot missing`);
      assert.ok(!usedShots.has(file),`${label} reused screenshot evidence`);usedShots.add(file);
    }
  }
}

// Job success alone also accepts a skipped node:test. Bind the actual receipt
// to the reviewed driver, runtime and exact official package before publishing.
export function verifyAdblockNativeRelease(report,{head,driver,runtime,manifest,packageBytes,artifactPackageHash,evidenceFiles}){
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
  const pkg=JSON.parse(packageBytes),loadedManifest=JSON.parse(manifest);
  assert.equal(pkg.id,'adblock','official AdBlock identity required');
  assert.equal(pkg.version,'1.2.3','manual cosmetic release requires version 1.2.3');
  assert.equal(loadedManifest.manifest_version,3,'native MV3 manifest required');
  assert.equal(loadedManifest.background?.service_worker,'sw.js','native reviewed worker required');
  assert.match(loadedManifest.version,/^\d+\.\d+(?:\.\d+){0,2}$/,'native manifest version required');
  assert.ok(typeof loadedManifest.name==='string'&&loadedManifest.name.length>0,'native manifest name required');
  assert.equal(report.environment,'PRODUCTION','native production evidence required');
  assert.equal(report.releaseReady,true,'native release readiness required');
  assert.ok(typeof report.root==='string'&&isAbsolute(report.root)&&
    report.root.replaceAll('\\','/').endsWith('/dist/production'),'native dist/production root required');
  assert.deepEqual(report.cleanupErrors,[],'native cleanup errors must be empty');
  assert.deepEqual(report.evidenceErrors,[],'native evidence errors must be empty');
  const identity=report.packageIdentity;
  assert.ok(object(identity),'native loaded package identity required');
  assert.equal(identity.root,report.root,'native loaded root drift');
  assert.equal(identity.loadedManifestMatched,true,'native loaded manifest must match');
  assert.equal(identity.manifestVersion,loadedManifest.version,'native loaded manifest version drift');
  assert.equal(identity.manifestName,loadedManifest.name,'native loaded manifest name drift');
  for(const key of ['artifactPackageHash','swSHA256','manifestSHA256','packageSHA256'])
    assert.equal(identity[key],report[key],`native loaded ${key} drift`);
  assert.equal(identity.installedPackageHash,report.installedIdentity.packageHash,'native loaded installed package drift');
  verifyManualCosmetic(report,evidenceFiles);
  return {status:'PASS',evidenceLevel:'MANUAL_COSMETIC_NATIVE',candidate:head,
    artifactPackageHash,packageSHA256:report.packageSHA256,chrome:report.chrome};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [reportFile,root='dist/production',head=process.env.GITHUB_SHA]=process.argv.slice(2);
  assert.ok(reportFile,'native report path is required');
  const report=JSON.parse(await readFile(reportFile,'utf8'));
  const fingerprint=await packageFingerprint(root);
  assert.ok(!fingerprint.files.some(row=>row.path.endsWith('.map')||row.path==='development-update.json'),
    'native release artifact must be production without development outputs');
  // Never follow report-controlled traversal or symlinks out of its evidence directory.
  const evidenceRoot=await realpath(dirname(resolve(reportFile))),evidenceFiles=new Map();
  const descriptors=[report.cases?.manualCosmetic?.evidence,...(Array.isArray(report.screenshots)?report.screenshots:[])];
  for(const descriptor of descriptors){
    if(!descriptor)continue;
    const file=evidencePath(descriptor.file),absolute=resolve(evidenceRoot,file);
    let current=evidenceRoot;
    for(const part of file.split('/')){
      current=resolve(current,part);assert.ok(!(await lstat(current)).isSymbolicLink(),'native evidence symlink forbidden');
    }
    const actual=await realpath(absolute),within=relative(evidenceRoot,actual);
    assert.ok(within&&!within.startsWith('..'+sep)&&!isAbsolute(within),'native evidence escaped receipt directory');
    assert.ok((await lstat(actual)).isFile(),'native evidence must be a regular file');
    evidenceFiles.set(file,await readFile(actual));
  }
  const [driver,runtime,manifest,packageBytes]=await Promise.all([
    readFile(new URL('../tests/framework/adblock-r12-native.test.mjs',import.meta.url)),
    readFile(resolve(root,'sw.js')),readFile(resolve(root,'manifest.json')),
    readFile(resolve(root,'official-tools/adblock/adblock.opendesk-tool.json'))]);
  console.log(JSON.stringify(verifyAdblockNativeRelease(report,
    {head,driver,runtime,manifest,packageBytes,artifactPackageHash:fingerprint.packageHash,evidenceFiles})));
}
