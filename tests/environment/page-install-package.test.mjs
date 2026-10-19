import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {digest,digestUtf8,canonical} from '../../src/platform/protocol.js';
import {PAGE_INSTALL_FORMAT,PAGE_INSTALL_INPUT_LIMIT,validatePageInstallPackage} from '../../src/scripting/user-scripts/page-install-package.js';
import {PAGE_FRAME_DRAFT_LIMIT,wrapPageFrameSource} from '../../src/scripting/user-scripts/page-frame-resources.js';
import {createDependencyManager} from '../../src/scripting/user-scripts/dependency-manager.js';
import {createInstalledPagePrograms} from '../../src/scripting/user-scripts/installed-programs.js';
import {fakeBuiltinSource} from './builtin-support.mjs';
import {buildPageInstallPackage} from '../../scripts/build-page-install-package.mjs';
import {programDraft} from '../fixtures/program-draft.mjs';

const source='// ==UserScript==\n// @match https://example.com/*\n// @noframes\n// @run-at document-idle\n// ==/UserScript==\nasync function main(){throw Error("MUST_NOT_EXECUTE");}\n';
const rules={matches:['https://example.com/*'],excludeMatches:[],allFrames:false,runAt:'document_idle',world:'USER_SCRIPT'};
async function packageFor(overrides={}){
  const payload={format:PAGE_INSTALL_FORMAT,programId:'offline-test',version:'1.0.0',title:'Offline test',revision:1,
    entryFormat:'async-main',sourceUtf8:source,sourceHash:await digestUtf8(source),pageRules:rules,...overrides};
  return {...payload,packageHash:await digest(payload)};
}
function fixture(){
  let db=new Map(['frameworkKV','commandJournal','runs'].map(name=>[name,new Map()])),queue=Promise.resolve();
  const host={tag:'host',namespace:'tool:test',registrationId:'host',hostDocumentId:'doc',hostInstanceId:'instance',
    browserSessionIncarnation:'session',hostUrl:'chrome-extension://test/ui/tool.html',active:true};
  db.get('commandJournal').set('host:host',host);
  const storage={transaction(stores,mode,work){
    const next=queue.then(async()=>{
      const copy=structuredClone(db),table=name=>{assert.ok(stores.includes(name));return copy.get(name);};
      const tx={get:async(n,k)=>structuredClone(table(n).get(k)),all:async n=>[...table(n).values()].map(v=>structuredClone(v)),
        put:async(n,v,k)=>{assert.equal(mode,'readwrite');table(n).set(k,structuredClone(v));},
        delete:async(n,k)=>{assert.equal(mode,'readwrite');table(n).delete(k);}};
      const result=await work(tx);if(mode==='readwrite')db=copy;return result;
    });queue=next.catch(()=>{});return next;
  }};
  const f={granted:true,registers:0,executes:0,previews:0,cleanups:0,native:new Map(),host};
  const assertHost=async sender=>{assert.equal(sender?.id,'test');if(!host.active)throw Object.assign(Error('host inactive'),{code:'E_OWNER'});return structuredClone(host);};
  const api={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path},
    permissions:{contains:async()=>f.granted},
    userScripts:{getScripts:async filter=>{
      if(f.nativeReadError)throw f.nativeReadError;
      if(f.unrelatedNative)return [{id:'unrelated-registration'}];
      return [...f.native.values()].filter(r=>!filter||filter.ids.includes(r.id)).map(v=>structuredClone(v));
    },
      configureWorld:async()=>{},register:async rows=>{f.registers++;if(!f.dropNativeReadback)rows.forEach(r=>f.native.set(r.id,structuredClone(r)));},
      unregister:async({ids})=>ids.forEach(id=>f.native.delete(id)),execute:async()=>{f.executes++;throw Error('must not execute');}}};
  const dependencies=createDependencyManager({api,storage,assertHost,loadBuiltin:async()=>fakeBuiltinSource});
  const preview={preview:async()=>{f.previews++;throw Error('must not preview');},
    retireInstalled:async()=>{f.cleanups++;return {state:f.cleanupUncertain?'unknown':'retired',scope:'managed-ui-only'};}};
  const make=()=>createInstalledPagePrograms({api,storage,assertHost,dependencies,preview,admission:{},session:'session',loadBuiltin:async()=>fakeBuiltinSource});
  f.service=make();f.restart=()=>{f.service=make();};f.rows=()=>[...db.get('frameworkKV').values()];
  f.installation=()=>f.rows().find(r=>r.tag==='page-installed-v1');f.storage=storage;
  f.import=async(pkg,previous=null)=>f.service.importPageInstallPackage({package:pkg,expectedInstalledManifestHash:previous?.manifestHash??null,
    expectedGeneration:previous?.authorization?.generation??null},{id:'test'});
  return f;
}

test('package validates frozen data, source and package hashes, with frame budget',async()=>{
  const pkg=await packageFor(),checked=await validatePageInstallPackage(pkg);
  assert.equal(PAGE_INSTALL_INPUT_LIMIT,PAGE_FRAME_DRAFT_LIMIT);
  assert.ok(Object.isFrozen(checked)&&Object.isFrozen(checked.pageRules.matches));
  await assert.rejects(validatePageInstallPackage({...pkg,title:'tampered'}),{code:'E_PAGE_PACKAGE_HASH'});
  await assert.rejects(validatePageInstallPackage(await packageFor({sourceHash:'a'.repeat(64)})),{code:'E_SOURCE_HASH'});
  await assert.rejects(validatePageInstallPackage({...pkg,receipt:{state:'preview-evaluated'}}),{code:'E_PAGE_PACKAGE'});
  for(const version of ['1.2','01.2.3','1.2.3-01'])await assert.rejects(validatePageInstallPackage(await packageFor({version})),{code:'E_PAGE_PACKAGE'});
  const framed=await wrapPageFrameSource(source,[{resourceId:'frame',code:'throw Error("never");'}]);
  await validatePageInstallPackage(await packageFor({sourceUtf8:framed,sourceHash:await digestUtf8(framed)}));
  await assert.rejects(validatePageInstallPackage(await packageFor({pageRules:{...rules,allFrames:true}})));
});

test('external requires, invalid frame hashes and unsupported timing cannot import',async()=>{
  const external=source.replace('// @match','// @require https://example.com/fixed.js\n// @match');
  await assert.rejects(validatePageInstallPackage(await packageFor({sourceUtf8:external,sourceHash:await digestUtf8(external)})),{code:'E_DEPENDENCY_LOCK'});
  for(const code of [source+'\nimport("https://example.com/module.js");',
    await wrapPageFrameSource(source,[{resourceId:'frame',code:'import("https://example.com/module.js");'}])])
    await assert.rejects(validatePageInstallPackage(await packageFor({sourceUtf8:code,sourceHash:await digestUtf8(code)})),{code:'E_DEPENDENCY_MODULE'});
  const framed=await wrapPageFrameSource(source,[{resourceId:'frame',code:'void 0;'}]);
  const broken=framed.replace('void 0;','void 1;');
  await assert.rejects(validatePageInstallPackage(await packageFor({sourceUtf8:broken,sourceHash:await digestUtf8(broken)})),{code:'E_PAGE_FRAME_RESOURCE_HASH'});
  const early=source.replace('document-idle','document-start');
  await assert.rejects(validatePageInstallPackage(await packageFor({sourceUtf8:early,sourceHash:await digestUtf8(early),pageRules:{...rules,runAt:'document_start'}})),{code:'E_PAGE_RULES'});
});

test('fresh import persists registered installation and explicit local proof without executing source',async()=>{
  const f=fixture(),pkg=await packageFor(),installed=await f.import(pkg);
  assert.equal(installed.nativeState,'registered');assert.equal(installed.authorization.status,'active');
  assert.equal(installed.authorization.generation,1);assert.equal(installed.enabled,true);
  for(const k of ['programId','revision','sourceHash','manifestHash','pageRules','enabled','nativeState','authorization','error'])assert.ok(Object.hasOwn(installed,k));
  assert.equal(f.executes,0);assert.equal(f.previews,0);assert.equal(f.registers,1);
  const proof=f.rows().find(r=>r.tag==='page-verification-v1');
  assert.equal(proof.receipt.state,'package-validated');assert.equal(proof.receipt.packageHash,pkg.packageHash);
  assert.equal(proof.receipt.documentId,undefined);assert.equal(proof.status,'Available');
  f.restart();await f.service.reconcile();
  assert.equal((await f.service.listPagePrograms({},{id:'test'})).installed[0].nativeState,'registered');
  assert.equal(f.executes,0);assert.equal(f.registers,1);
});

test('same identity is a no-op including token/generation/proof/unknown cleanup; disabled stays disabled',async()=>{
  const f=fixture(),pkg=await packageFor(),first=await f.import(pkg),snapshot=structuredClone(f.rows()),cleanups=f.cleanups;
  assert.deepEqual(await f.import(pkg,first),first);assert.deepEqual(f.rows(),snapshot);
  assert.equal(f.cleanups,cleanups);assert.equal(f.registers,1);assert.equal(f.previews,0);
  const disabled=await f.service.setInstalledPageEnabled({programId:pkg.programId,manifestHash:first.manifestHash,
    expectedGeneration:first.authorization.generation,enabled:false},{id:'test'});
  const before=structuredClone(f.rows());
  assert.equal((await f.import(pkg,disabled)).enabled,false);assert.deepEqual(f.rows(),before);
  assert.equal(f.native.size,0);assert.equal(f.registers,1);
});

test('fixed revision conflicts, stale CAS, inactive Host and denied site permission are fenced',async()=>{
  const f=fixture(),pkg=await packageFor(),installed=await f.import(pkg),before=structuredClone(f.rows());
  const changedSource=source+'\n// changed revision bytes';
  await assert.rejects(f.import(await packageFor({sourceUtf8:changedSource,sourceHash:await digestUtf8(changedSource)}),installed),{code:'E_REQUEST_CONFLICT'});
  await assert.rejects(f.import(await packageFor({entryFormat:'classic-userscript'}),installed),{code:'E_REQUEST_CONFLICT'});
  await assert.rejects(f.import(pkg),{code:'E_REVISION'});
  await assert.rejects(f.import(pkg,{...installed,authorization:{...installed.authorization,generation:9}}),{code:'E_REVISION'});
  f.host.active=false;await assert.rejects(f.import(pkg,installed),{code:'E_OWNER'});f.host.active=true;
  assert.deepEqual(f.rows(),before);
  const denied=fixture();denied.granted=false;
  await assert.rejects(denied.import(pkg),{code:'E_PERMISSION'});assert.equal(denied.installation(),undefined);assert.equal(denied.registers,0);
});

test('package upgrades reuse original installer CAS, scope approval and disabled state',async()=>{
  for(const enabled of [true,false]){
    const f=fixture(),pkg=await packageFor();let previous=await f.import(pkg);
    if(!enabled)previous=await f.service.setInstalledPageEnabled({programId:pkg.programId,
      manifestHash:previous.manifestHash,expectedGeneration:previous.authorization.generation,enabled:false},{id:'test'});
    const oldToken=f.installation().token,oldProof=structuredClone(f.rows().find(r=>r.tag==='page-verification-v1'));
    const nextSource=source.replace('https://example.com/*','https://example.net/*');
    const nextRules={...rules,matches:['https://example.net/*']};
    const next=await packageFor({revision:2,version:'1.1.0',sourceUtf8:nextSource,
      sourceHash:await digestUtf8(nextSource),pageRules:nextRules});
    await assert.rejects(f.import(next,{...previous,authorization:{...previous.authorization,
      generation:previous.authorization.generation+1}}),{code:'E_REVISION'});
    f.granted=false;await assert.rejects(f.import(next,previous),{code:'E_PERMISSION'});
    assert.equal(f.installation().token,oldToken);
    assert.equal(f.installation().authorization.generation,previous.authorization.generation);
    f.granted=true;const upgraded=await f.import(next,previous);
    assert.equal(upgraded.revision,2);assert.notEqual(upgraded.manifestHash,previous.manifestHash);
    assert.equal(upgraded.authorization.installationId,previous.authorization.installationId);
    assert.equal(upgraded.authorization.generation,previous.authorization.generation+1);
    assert.notEqual(f.installation().token,oldToken);assert.equal(upgraded.nativeId,previous.nativeId);
    assert.deepEqual(upgraded.pageRules,nextRules);assert.deepEqual(upgraded.authorization.scope.pageRules,nextRules);
    assert.equal(upgraded.enabled,enabled);assert.equal(upgraded.authorization.status,enabled?'active':'disabled');
    assert.equal(upgraded.nativeState,enabled?'registered':'disabled');assert.equal(f.native.size,enabled?1:0);
    assert.deepEqual(f.rows().find(r=>r.tag==='page-verification-v1'&&r.revision===1),oldProof);
    const snapshot=structuredClone(f.rows());assert.deepEqual(await f.import(next,upgraded),upgraded);
    assert.deepEqual(f.rows(),snapshot);assert.equal(f.previews,0);assert.equal(f.executes,0);
  }
});

test('pending managed UI cleanup cannot be overwritten by an upgrade',async()=>{
  const f=fixture(),pkg=await packageFor(),first=await f.import(pkg);
  f.cleanupUncertain=true;
  const disabled=await f.service.setInstalledPageEnabled({
    programId:pkg.programId,manifestHash:first.manifestHash,
    expectedGeneration:first.authorization.generation,enabled:false
  },{id:'test'});
  assert.equal(f.installation().managedCleanup?.state,'unknown');
  const altered=source+'\n// new content';
  const next=await packageFor({revision:2,version:'1.1.0',
    sourceUtf8:altered,sourceHash:await digestUtf8(altered)});
  const before=structuredClone(f.installation()),registers=f.registers;
  const nativeBefore=structuredClone([...f.native.entries()]);
  await assert.rejects(f.import(next,disabled),{code:'E_PAGE_CLEANUP_PENDING'});
  // Preparing a new candidate/proof may persist those independent records.
  // The installed version, authorization, native registration and execution
  // MUST remain untouched after the cleanup-pending rejection.
  assert.deepEqual(f.installation(),before);
  assert.deepEqual([...f.native.entries()],nativeBefore);
  assert.equal(f.registers,registers);
  assert.equal(f.previews,0);assert.equal(f.executes,0);
});

test('native unknown readback is queryable and re-import never replays registration',async()=>{
  const f=fixture();f.dropNativeReadback=true;
  const pkg=await packageFor(),unknown=await f.import(pkg);
  assert.equal(unknown.nativeState,'blocked');assert.equal(unknown.error.code,'E_EFFECT_UNKNOWN');
  const snapshot=structuredClone(f.rows()),registers=f.registers;
  assert.deepEqual(await f.import(pkg,unknown),unknown);
  assert.deepEqual(f.rows(),snapshot);assert.equal(f.registers,registers);
  assert.equal((await f.service.listPagePrograms({},{id:'test'})).installed[0].error.code,'E_EFFECT_UNKNOWN');
});

test('same-version import rejects missing or unrelated native registration without state changes or replay',async()=>{
  for(const unrelated of [false,true]){
    const f=fixture(),pkg=await packageFor(),installed=await f.import(pkg),snapshot=structuredClone(f.rows());
    const cleanups=f.cleanups;
    f.native.clear();f.unrelatedNative=unrelated;
    await assert.rejects(f.import(pkg,installed),{code:'E_PAGE_INSTALLATION'});
    assert.deepEqual(f.rows(),snapshot);assert.equal(f.registers,1);assert.equal(f.executes,0);
    assert.equal(f.previews,0);assert.equal(f.cleanups,cleanups);
  }
});

test('same-version import rejects failed native readback without returning stored registered receipt',async()=>{
  const f=fixture(),pkg=await packageFor(),installed=await f.import(pkg),snapshot=structuredClone(f.rows());
  const cleanups=f.cleanups;
  // Reproduce Chrome's exact disabled-userScripts guard and verify generic
  // native errors retain a separate, actionable error classification.
  f.nativeReadError=Error("'userScripts.getScripts' is not available in this context.");
  await assert.rejects(f.import(pkg,installed),{code:'E_USER_SCRIPTS_UNAVAILABLE'});
  f.nativeReadError=Error('userScripts unavailable');
  await assert.rejects(f.import(pkg,installed),{code:'E_USER_SCRIPTS_NATIVE'});
  assert.deepEqual(f.rows(),snapshot);assert.equal(f.registers,1);assert.equal(f.executes,0);
  assert.equal(f.previews,0);assert.equal(f.cleanups,cleanups);
});

test('CLI validates draft and preserves actual compiled async-main bytes and source identity',async()=>{
  const draft=await programDraft('page-userscript');draft.sourceUtf8=source;
  draft.build={...draft.build,sourceHash:await digestUtf8(source),byteLength:Buffer.byteLength(source)};
  const built=await buildPageInstallPackage(draft,{revision:1,title:'CLI'});
  assert.equal(built.sourceUtf8,draft.sourceUtf8);assert.equal(built.sourceHash,draft.build.sourceHash);
  assert.equal(built.entryFormat,'async-main');assert.equal(built.programId,draft.project.id);
  const dir=await mkdtemp(join(tmpdir(),'page-install-'));
  try{
    await writeFile(join(dir,'draft.json'),JSON.stringify(draft));
    await promisify(execFile)(process.execPath,['scripts/build-page-install-package.mjs','--input',join(dir,'draft.json'),'--out',join(dir,'package.json'),'--revision','1','--title','CLI']);
    assert.equal(canonical(JSON.parse(await readFile(join(dir,'package.json'),'utf8'))),canonical(built));
    await assert.rejects(buildPageInstallPackage({...draft,sourceUtf8:source+' '},{revision:1,title:'CLI'}),{code:'E_PROGRAM_HASH'});
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('RPC is on the existing authenticated Host route',async()=>{
  const broker=await readFile(new URL('../../src/platform/host/broker.js',import.meta.url),'utf8');
  assert.match(broker,/createMethodRoutes\(installedPages,\['importPageInstallPackage'/);
});
