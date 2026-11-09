import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {digest,digestUtf8} from '../../src/platform/protocol.js';
import {validateSidebarToolPackage,serializeSidebarToolPackage,verifySidebarToolBackground,
  sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';
import {validatePageInstallPackage} from '../../src/scripting/user-scripts/page-install-package.js';
import {createSidebarToolPackage,buildSidebarTool,promoteSidebarToolPackage}
  from '../../scripts/build-sidebar-tool.mjs';
import {createOfficialToolResources} from '../../scripts/build-official-tools.mjs';
import {validateOfficialReleaseCatalog,loadOfficialTool,OFFICIAL_SOURCE_SCHEMA,
  OFFICIAL_SOURCE_REPOSITORY} from '../../src/sidebar-tools/official-catalog.js';

const rules=()=>({matches:['https://example.com/*'],excludeMatches:[],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'});
const tool=()=>({format:'opendesk.sidebar-tool.v2',id:'page-fixture',version:'1.1.0',
  title:'Page fixture',description:'Embedded Page package',capabilities:['page.module'],
  html:'<p>Fixture</p>',css:'',js:'void 0;',requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]}});
async function fixture(){
  const parent=tool(),sourceUtf8='document.documentElement.dataset.fixture = "ready";';
  const payload={format:'opendesk.page-install.v1',programId:'app.'+parent.id,version:parent.version,
    title:parent.title,revision:1,entryFormat:'classic-userscript',sourceUtf8,
    sourceHash:await digestUtf8(sourceUtf8),pageRules:rules()};
  parent.pageModule={...payload,packageHash:await digest(payload)};
  return parent;
}
const reverse=value=>Array.isArray(value)?value.map(reverse):value&&typeof value==='object'?
  Object.fromEntries(Object.entries(value).reverse().map(([key,row])=>[key,reverse(row)])):value;

test('official offline producer and loader deliver a complete composite app without descriptor placeholders',async t=>{
  const root=await mkdtemp(join(tmpdir(),'official-page-module-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const pkg=await fixture(),project='examples/sidebar-tools/'+pkg.id;
  await mkdir(join(root,project),{recursive:true});
  await mkdir(join(root,'official-tools'));
  await writeFile(join(root,project,pkg.id+'.opendesk-tool.json'),serializeSidebarToolPackage(pkg));
  await writeFile(join(root,'official-tools/catalog.json'),JSON.stringify({schema:OFFICIAL_SOURCE_SCHEMA,
    sourceRepository:OFFICIAL_SOURCE_REPOSITORY,tools:[{id:pkg.id,project,kind:'sidebar-tool',installationPolicy:'optional'}]}));
  const {catalog,resources}=await createOfficialToolResources({root});
  assert.deepEqual(validateOfficialReleaseCatalog(catalog),catalog);
  const release=catalog.apps[0];
  assert.deepEqual(release.capabilities,['page.module']);
  assert.equal(Object.hasOwn(release,'pageModule'),false,'catalog metadata does not carry executable modules');
  const api={runtime:{getURL:path=>'chrome-extension://fixture/'+path}};
  const fetcher=async url=>new Response(resources.get(new URL(url).pathname.slice(1)));
  assert.deepEqual((await loadOfficialTool(release,{api,fetcher})).tool,pkg);
  for(const capabilities of [['page.module','page.module'],['page.module','page.unapproved'],['page.module',null]])
    assert.throws(()=>validateOfficialReleaseCatalog({...catalog,apps:[{...release,capabilities}]}));
  const missing={...pkg};delete missing.pageModule;
  const missingBytes=JSON.stringify(missing),missingRelease={...release,
    bytes:new TextEncoder().encode(missingBytes).length,sha256:await digestUtf8(missingBytes)};
  await assert.rejects(loadOfficialTool(missingRelease,{api,fetcher:async()=>new Response(missingBytes)}),
    {code:'E_TOOL_PAGE_MODULE'});
  const changed=structuredClone(pkg);changed.pageModule.sourceUtf8+='\nvoid 1;';
  await assert.rejects(loadOfficialTool(release,{api,fetcher:async()=>new Response(JSON.stringify(changed))}),
    {code:'E_PACKAGE_INTEGRITY'});
});

test('embedded full Page package survives admission and canonical storage reordering',async()=>{
  const pkg=await fixture();
  assert.deepEqual(validateSidebarToolPackage(pkg),pkg);
  assert.deepEqual((await verifySidebarToolBackground(pkg)).pageModule,
    await validatePageInstallPackage(pkg.pageModule));
  assert.equal(serializeSidebarToolPackage(pkg),serializeSidebarToolPackage(reverse(pkg)));
  assert.equal(await sidebarToolPackageHash(pkg),await sidebarToolPackageHash(reverse(pkg)));
  assert.deepEqual(JSON.parse(serializeSidebarToolPackage(pkg)).pageModule,pkg.pageModule);
});

test('shape admission rejects missing/unknown fields, foreign identity/version, invalid rules and hashes',async()=>{
  const pkg=await fixture();
  for(const change of [
    value=>delete value.pageModule.packageHash,
    value=>value.pageModule.receipt={approved:true},
    value=>value.pageModule.programId='app.other',
    value=>value.pageModule.version='1.0.0',
    value=>value.pageModule.format='opendesk.program-draft.v1',
    value=>value.pageModule.revision=0,
    value=>value.pageModule.entryFormat='esm',
    value=>value.pageModule.sourceHash='bad',
    value=>value.pageModule.packageHash='bad',
    value=>value.pageModule.sourceUtf8='',
    value=>value.pageModule.pageRules.world='MAIN',
    value=>value.pageModule.pageRules.allFrames=true,
    value=>value.pageModule.pageRules.runAt='document_start',
    value=>value.pageModule.pageRules.matches=[],
    value=>value.pageModule=null
  ]){
    const changed=structuredClone(pkg);change(changed);
    assert.throws(()=>validateSidebarToolPackage(changed));
  }
});

test('Page capability is required iff the module exists, and is v2 only',async()=>{
  const pkg=await fixture();
  assert.throws(()=>validateSidebarToolPackage({...pkg,capabilities:[]}),{code:'E_TOOL_PAGE_MODULE'});
  const missing=structuredClone(pkg);delete missing.pageModule;
  assert.throws(()=>validateSidebarToolPackage(missing),{code:'E_TOOL_PAGE_MODULE'});
  const legacy={...pkg,format:'opendesk.sidebar-tool.v1'};
  delete legacy.requires;delete legacy.contributes;
  assert.throws(()=>validateSidebarToolPackage(legacy));
  missing.capabilities=[];
  assert.equal(validateSidebarToolPackage(missing).pageModule,undefined);
});

test('async verification and package hashing reject forged Page package and source digests',async()=>{
  const pkg=await fixture();
  const brokenPackage=structuredClone(pkg);brokenPackage.pageModule.packageHash='0'.repeat(64);
  assert.doesNotThrow(()=>validateSidebarToolPackage(brokenPackage),'shape admission is synchronous');
  await assert.rejects(verifySidebarToolBackground(brokenPackage),{code:'E_PAGE_PACKAGE_HASH'});
  await assert.rejects(sidebarToolPackageHash(brokenPackage),{code:'E_PAGE_PACKAGE_HASH'});
  const brokenSource=structuredClone(pkg);brokenSource.pageModule.sourceUtf8+='\nvoid 1;';
  const {packageHash,...payload}=brokenSource.pageModule;
  brokenSource.pageModule.packageHash=await digest(payload);
  await assert.rejects(verifySidebarToolBackground(brokenSource),{code:'E_SOURCE_HASH'});
  await assert.rejects(sidebarToolPackageHash(brokenSource),{code:'E_SOURCE_HASH'});
});

test('digest-consistent modules still pass the existing offline Page dependency safety gate',async()=>{
  for(const [sourceUtf8,code] of [
    ['import value from "https://example.com/remote.js";','E_DEPENDENCY_MODULE'],
    ['// ==UserScript==\n// @match https://example.com/*\n// @require https://example.com/remote.js\n// ==/UserScript==\nvoid 0;','E_DEPENDENCY_LOCK']
  ]){
    const pkg=await fixture();
    const {packageHash,...payload}=pkg.pageModule;
    payload.sourceUtf8=sourceUtf8;payload.sourceHash=await digestUtf8(sourceUtf8);
    pkg.pageModule={...payload,packageHash:await digest(payload)};
    assert.doesNotThrow(()=>validateSidebarToolPackage(pkg));
    await assert.rejects(verifySidebarToolBackground(pkg),{code});
  }
});

async function project(t){
  const root=await mkdtemp(join(tmpdir(),'sidebar-page-module-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const parent=tool();
  const config={format:parent.format,id:parent.id,version:parent.version,title:parent.title,
    description:parent.description,capabilities:parent.capabilities,requires:parent.requires,
    contributes:parent.contributes,files:{html:'index.html',css:'style.css',js:'main.js'},
    pageModule:{revision:3}};
  const program={name:'page-fixture',version:parent.version,private:true,type:'module',description:'Fixture',
    opendesk:{format:'opendesk.project.v1',id:'app.'+parent.id,runtimeKind:'page-userscript',
      sourceFormat:'esm',entry:'src/page/main.js',pageRules:rules()}};
  await mkdir(join(root,'src/page'),{recursive:true});
  await Promise.all([
    writeFile(join(root,'tool.config.json'),JSON.stringify(config)),
    writeFile(join(root,'package.json'),JSON.stringify(program)),
    writeFile(join(root,'index.html'),parent.html),writeFile(join(root,'style.css'),''),
    writeFile(join(root,'main.js'),parent.js),
    writeFile(join(root,'src/page/main.js'),'import {label} from "./label.js"; export default function(){ document.title=label; }'),
    writeFile(join(root,'src/page/label.js'),'export const label="first source";')
  ]);
  return {root,config,program};
}

test('builder uses the existing compiler and blocks promotion after imported Page source drifts',async t=>{
  const {root}=await project(t),candidate=join(root,'candidate.json');
  await buildSidebarTool(root,{out:candidate});
  const bytes=await readFile(candidate),pkg=JSON.parse(bytes);
  assert.equal(pkg.pageModule.programId,'app.page-fixture');
  assert.equal(pkg.pageModule.version,pkg.version);
  assert.equal(pkg.pageModule.revision,3);
  assert.match(pkg.pageModule.sourceUtf8,/first source/);
  await verifySidebarToolBackground(pkg);
  assert.equal(serializeSidebarToolPackage(await createSidebarToolPackage(root)),bytes.toString(),
    'repeated compiler output must be deterministic');
  await writeFile(join(root,'src/page/label.js'),'export const label="changed source";');
  await assert.rejects(promoteSidebarToolPackage(root,{from:candidate}),/candidate is stale/);
  const latest=await createSidebarToolPackage(root);
  assert.notEqual(latest.pageModule.sourceHash,pkg.pageModule.sourceHash);
  assert.notEqual(latest.pageModule.packageHash,pkg.pageModule.packageHash);
  assert.deepEqual(await readFile(candidate),bytes,'failed promotion preserves candidate');
  await assert.rejects(readFile(join(root,'page-fixture.opendesk-tool.json')),{code:'ENOENT'});
});

test('builder rejects Page config capability and project identity/version mismatches',async t=>{
  const {root,config,program}=await project(t);
  for(const patch of [{id:'other'},{version:'1.0.0'},{capabilities:[]},{pageModule:{revision:0}},
    {pageModule:{revision:1,sourceUtf8:'hand-written'}}]){
    await writeFile(join(root,'tool.config.json'),JSON.stringify({...config,...patch}));
    await assert.rejects(createSidebarToolPackage(root),/Page project must bind|pageModule requires/);
  }
  const missing={...config};delete missing.pageModule;
  await writeFile(join(root,'tool.config.json'),JSON.stringify(missing));
  await assert.rejects(createSidebarToolPackage(root),/pageModule requires/);
  await writeFile(join(root,'tool.config.json'),JSON.stringify(config));
  await writeFile(join(root,'package.json'),JSON.stringify({...program,opendesk:{...program.opendesk,runtimeKind:'controller'}}));
  await assert.rejects(createSidebarToolPackage(root),/Page project must bind/);
});

test('promotion preserves the release when changed Page source reuses its revision',async t=>{
  const {root,config,program}=await project(t),candidate=join(root,'candidate.json');
  await buildSidebarTool(root,{out:candidate});
  await promoteSidebarToolPackage(root,{from:candidate});
  const release=join(root,'page-fixture.opendesk-tool.json'),original=await readFile(release);
  await writeFile(join(root,'tool.config.json'),JSON.stringify({...config,version:'1.1.1'}));
  await writeFile(join(root,'package.json'),JSON.stringify({...program,version:'1.1.1'}));
  await buildSidebarTool(root,{out:candidate});
  await assert.rejects(promoteSidebarToolPackage(root,{from:candidate}),/Page.*revision/);
  assert.deepEqual(await readFile(release),original,'an invalid upgrade must preserve the approved release');
  await writeFile(join(root,'tool.config.json'),JSON.stringify({...config,version:'1.1.1',pageModule:{revision:4}}));
  await buildSidebarTool(root,{out:candidate});
  assert.equal((await promoteSidebarToolPackage(root,{from:candidate})).status,'PROJECT_PACKAGE_PROMOTED');
});
