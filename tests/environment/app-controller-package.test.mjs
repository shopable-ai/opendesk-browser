import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildSidebarTool} from '../../scripts/build-sidebar-tool.mjs';
import {validateSidebarToolPackage,serializeSidebarToolPackage,sidebarToolPackageHash,verifySidebarToolBackground} from '../../src/ui/sidebar-tools/package.js';
import {BUILTIN_ABI} from '../../src/libs/runtime-contract.js';
import {CONTROLLER_SOURCE_LIMIT} from '../../src/platform/source-budgets.js';

const source='if (typeof page === "undefined") throw new Error("Package code must remain inert");\nasync function main() { return await page.title(); }\n';
const sha=value=>createHash('sha256').update(value,'utf8').digest('hex');
const metadata={siteOrigins:['https://example.com'],paramsSchema:{type:'object',properties:{
  query:{type:'string',title:'查询',maxLength:80},limit:{type:'integer',title:'条数',minimum:1,maximum:10}
},required:['query'],additionalProperties:false},deadlineMs:90000,
  builtinIdentity:{abi:BUILTIN_ABI,catalogSha256:'a'.repeat(64),bundleSha256:'b'.repeat(64)},permissions:['page.automation']};
const config={format:'opendesk.sidebar-tool.v2',id:'app-controller-test',version:'1.0.0',title:'Controller App',description:'Fixed controller',
  capabilities:['controllers.run'],requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},
  files:{html:'index.html',css:'style.css',js:'main.js',controller:'controller.js'},controller:metadata};
async function fixture(t){
  const dir=await mkdtemp(join(tmpdir(),'opendesk-app-controller-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  await Promise.all([writeFile(join(dir,'index.html'),'<main>Run</main>'),writeFile(join(dir,'style.css'),''),
    writeFile(join(dir,'main.js'),'void 0;'),writeFile(join(dir,'controller.js'),source)]);
  return async(meta=config,controllerSource=source)=>{
    await writeFile(join(dir,'controller.js'),controllerSource);
    await writeFile(join(dir,'tool.config.json'),JSON.stringify(meta));
    const out=join(dir,'candidate.json');await buildSidebarTool(dir,{out});
    return JSON.parse(await readFile(out,'utf8'));
  };
}
const reverse=value=>Array.isArray(value)?value.map(reverse):value&&typeof value==='object'?
  Object.fromEntries(Object.entries(value).reverse().map(([key,row])=>[key,reverse(row)])):value;

test('real builder packages a fixed Classic controller without executing its source',async t=>{
  const build=await fixture(t),tool=await build();
  assert.deepEqual(tool.controller,{...metadata,sourceUtf8:source,sourceHash:sha(source)});
  assert.equal(tool.background,undefined);
  assert.deepEqual(await verifySidebarToolBackground(tool),tool);
  const {APP_CONTROLLER_OPERATIONS,normalizeAppController,verifyAppController,appControllerReview}=
    await import('../../src/platform/tasks/app-controller-contract.js');
  assert.deepEqual(APP_CONTROLLER_OPERATIONS,['controllers.start','controllers.read','controllers.stop']);
  const normalized=normalizeAppController(tool.controller);assert.deepEqual(normalized,tool.controller);
  normalized.siteOrigins.push('https://other.example');assert.equal(tool.controller.siteOrigins.length,1);
  assert.deepEqual(await verifyAppController(tool.controller),tool.controller);
  const review=appControllerReview(tool);
  for(const text of [sha(source),BUILTIN_ABI,'a'.repeat(64),'b'.repeat(64),'https://example.com','query','90000','page.automation'])
    assert.ok(review.includes(text),text);
  assert.equal(appControllerReview({...tool,controller:undefined}),'');
});

test('controller verification rejects tampered source SHA through the existing package verification and hash entrances',async t=>{
  const tool=await (await fixture(t))();
  for(const sourceHash of ['0'.repeat(64),'bad']){
    const bad={...tool,controller:{...tool.controller,sourceHash}};
    await assert.rejects(verifySidebarToolBackground(bad));await assert.rejects(sidebarToolPackageHash(bad));
  }
  await assert.rejects(verifySidebarToolBackground({...tool,controller:{...tool.controller,sourceUtf8:source+'// changed'}}));
});

test('builder rejects unreviewed capability, invalid runtime, origins, parameter schema, deadline and extra controller metadata',async t=>{
  const build=await fixture(t);
  for(const change of [
    {capabilities:[]}, {controller:undefined}, {files:{html:'index.html',css:'style.css',js:'main.js'}},
    ...[
      {runtime:'background'}, {sourceHash:sha(source)}, {sourceUtf8:source},
      {siteOrigins:['<all_urls>']},{siteOrigins:['https://*.example.com']},{siteOrigins:['https://example.com/path']},
      {siteOrigins:['https://example.com','https://example.com']},{siteOrigins:[]},
      {paramsSchema:{...metadata.paramsSchema,additionalProperties:true}},
      {paramsSchema:{...metadata.paramsSchema,properties:{query:{type:'object',title:'Nested'}}}},
      {deadlineMs:0},{deadlineMs:90001},{deadlineMs:1.5},
      {builtinIdentity:{...metadata.builtinIdentity,abi:'stale'}},
      {builtinIdentity:{...metadata.builtinIdentity,bundleSha256:'bad'}},
      {builtinIdentity:{...metadata.builtinIdentity,catalogSha256:'bad'}},
      {builtinIdentity:{...metadata.builtinIdentity,extra:true}},
      {permissions:[]},{permissions:['page.automation','network']}
    ].map(row=>({controller:{...metadata,...row}}))
  ])await assert.rejects(build({...config,...change}));
  const tool=await build();
  assert.throws(()=>validateSidebarToolPackage({...tool,capabilities:[]}));
  assert.throws(()=>validateSidebarToolPackage({...tool,controller:undefined}));
  assert.throws(()=>validateSidebarToolPackage({...tool,format:'opendesk.sidebar-tool.v1'}));
  for(const deadlineMs of [1,90000])await build({...config,controller:{...metadata,deadlineMs}});
});

test('controller admits only nonempty well-formed UTF-8 Classic source within the shared byte budget',async t=>{
  const build=await fixture(t),tool=await build();
  const {normalizeAppController}=await import('../../src/platform/tasks/app-controller-contract.js');
  for(const sourceUtf8 of ['', '  ', '\ud800', 'export default async function main() {}',
    'import value from "library";\n'+source, '//'+ '中'.repeat(Math.ceil(CONTROLLER_SOURCE_LIMIT/3))])
    assert.throws(()=>normalizeAppController({...tool.controller,sourceUtf8,sourceHash:sha(sourceUtf8)}));
  const sourceUtf8='//'+ 'a'.repeat(CONTROLLER_SOURCE_LIMIT-2);
  assert.equal(normalizeAppController({...tool.controller,sourceUtf8,sourceHash:sha(sourceUtf8)}).sourceUtf8,sourceUtf8);
  assert.equal((await build(config,sourceUtf8)).controller.sourceUtf8,sourceUtf8);
  await assert.rejects(build(config,Buffer.from([0xc3,0x28])),{code:'ERR_ENCODING_INVALID_ENCODED_DATA'});
  await assert.rejects(build(config,sourceUtf8+'a'),/exceeds budget/);
  await assert.rejects(build(config,'export default async function main() {}'),/Classic/);
});

test('canonical package identity sorts all nested controller objects and covers every controller field',async t=>{
  const tool=await (await fixture(t))(),hash=await sidebarToolPackageHash(tool);
  assert.equal(serializeSidebarToolPackage(tool),serializeSidebarToolPackage(reverse(tool)));
  assert.equal(await sidebarToolPackageHash(reverse(tool)),hash);
  for(const row of [
    {sourceUtf8:source+'// fixed revision',sourceHash:sha(source+'// fixed revision')},
    {siteOrigins:['https://other.example']},
    {paramsSchema:{...metadata.paramsSchema,properties:{...metadata.paramsSchema.properties,query:{type:'string',title:'查询',maxLength:90}}}},
    {deadlineMs:80000},
    {builtinIdentity:{...metadata.builtinIdentity,catalogSha256:'c'.repeat(64)}},
    {builtinIdentity:{...metadata.builtinIdentity,bundleSha256:'d'.repeat(64)}}
  ])assert.notEqual(await sidebarToolPackageHash({...tool,controller:{...tool.controller,...row}}),hash);
  const serialized=JSON.parse(serializeSidebarToolPackage(tool));assert.deepEqual(serialized.controller,tool.controller);
});
