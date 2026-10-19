import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {prepareExtensionRelease} from '../../scripts/prepare-extension-release.mjs';
import {SIDEBAR_TOOL_FORMAT} from '../../src/ui/sidebar-tools/package.js';
import {PAGE_INSTALL_FORMAT} from '../../src/scripting/user-scripts/page-install-package.js';
import {TASK_PACKAGE_FORMAT,createTaskPackage} from '../../src/platform/tasks/contract.js';
import {digest,digestUtf8} from '../../src/platform/protocol.js';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const b=value=>Buffer.from(JSON.stringify(value)+'\n','utf8');
const metadata={schema:'opendesk.release-preflight-input.v1',publisherName:'Example author',
  license:'MIT',summary:'Example extension',releaseNotes:'First version',
  sourceDisclosure:'package-includes-executable-source',screenshots:[]};
const sidebar={format:SIDEBAR_TOOL_FORMAT,id:'offline-notes',version:'1.0.0',
  title:'Notes',description:'Example',capabilities:['storage.local'],
  html:'<main>Notes</main>',css:'',js:'void 0;'};
const pageSource='// ==UserScript==\n// @match https://example.com/*\n// @noframes\n// @run-at document-idle\n// ==/UserScript==\nasync function main(){return document.title;}\n';
const pageRules={matches:['https://example.com/*'],excludeMatches:[],
  allFrames:false,runAt:'document_idle',world:'USER_SCRIPT'};
async function pagePackage(){
  const payload={format:PAGE_INSTALL_FORMAT,programId:'offline-page',version:'1.1.0',
    title:'Page',revision:2,entryFormat:'async-main',sourceUtf8:pageSource,
    sourceHash:await digestUtf8(pageSource),pageRules};
  return {...payload,packageHash:await digest(payload)};
}
async function taskPackage(){
  const source='async function main(){return 7;}';
  return createTaskPackage({format:'opendesk.task.v1',taskId:'offline-task',version:'1.0.0',
    title:'Task',description:'Example task',author:'example',source:'local-project',
    siteOrigins:['https://example.com'],permissions:['page.automation'],
    entryFormat:'async-main',program:{revision:1,sourceHash:await digestUtf8(source)},
    paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false}},source);
}

test('three unchanged package formats pass the same offline-only preflight, with independent authorities',async()=>{
  const inputs=[[sidebar,'sidebar-app',SIDEBAR_TOOL_FORMAT],
    [await pagePackage(),'page-program',PAGE_INSTALL_FORMAT],
    [await taskPackage(),'controller-task',TASK_PACKAGE_FORMAT]];
  for(const [pkg,kind,format] of inputs){
    const raw=b(pkg),before=Buffer.from(raw);
    const output=await prepareExtensionRelease(raw,metadata);
    assert.equal(output.state,'OFFLINE_PACKAGE_VALIDATED');
    assert.equal(output.publication,'ONLINE_PUBLISH_NOT_IMPLEMENTED');
    assert.equal(output.artifact.kind,kind);assert.equal(output.artifact.format,format);
    assert.equal(output.artifact.sha256,sha(raw));
    assert.equal(output.artifact.bytes,raw.length);
    assert.deepEqual(raw,before,'preflight must not mutate executable install bytes');
    assert.ok(output.pending.includes('PUBLIC_UPLOAD_NOT_AUTHORIZED'));
    assert.ok(output.pending.includes('PUBLISHER_IDENTITY_UNVERIFIED'));
    assert.ok(output.release.sourceDisclosure.includes('executable-source'));
  }
});

test('malformed installation bytes, extra release metadata or false source disclosure cannot pass',async()=>{
  const pkg=await pagePackage();
  await assert.rejects(prepareExtensionRelease(b({...pkg,sourceHash:'0'.repeat(64)}),metadata));
  await assert.rejects(prepareExtensionRelease(b({...sidebar,format:'chrome-crx'}),metadata),
    {code:'E_RELEASE_FORMAT'});
  await assert.rejects(prepareExtensionRelease(b(sidebar),{...metadata,published:true}),
    {code:'E_RELEASE_METADATA'});
  await assert.rejects(prepareExtensionRelease(b(sidebar),{...metadata,sourceDisclosure:'private'}),
    {code:'E_RELEASE_METADATA'});
});

test('screenshots are exact local file resources, never unverified display-only paths',async()=>{
  // Known small PNG fixture, sourced as bytes rather than an external URL.
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLZ6QAAAABJRU5ErkJggg==','base64');
  const source={...metadata,screenshots:[{relativePath:'shots/preview.png',sha256:sha(png)}]};
  const result=await prepareExtensionRelease(b(sidebar),source,{readScreenshot:async name=>{
    assert.equal(name,'shots/preview.png');return png;
  }});
  assert.deepEqual(result.release.screenshots,[{relativePath:'shots/preview.png',sha256:sha(png),bytes:png.length}]);
  await assert.rejects(prepareExtensionRelease(b(sidebar),source,{readScreenshot:async()=>Buffer.from('bad')}),
    {code:'E_RELEASE_SCREENSHOT'});
  await assert.rejects(prepareExtensionRelease(b(sidebar),{...source,
    screenshots:[{relativePath:'../private.png',sha256:sha(png)}]}),{code:'E_RELEASE_SCREENSHOT'});
});

test('CLI writes a separate non-published report and leaves source package untouched',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'opendesk-release-preflight-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const packagePath=join(dir,'app.opendesk-tool.json'),metaPath=join(dir,'metadata.json'),out=join(dir,'report.json');
  const original=b(sidebar);await writeFile(packagePath,original);
  await writeFile(metaPath,JSON.stringify(metadata));
  const exec=promisify(execFile);
  const {stdout}=await exec(process.execPath,['scripts/prepare-extension-release.mjs',
    '--package',packagePath,'--metadata',metaPath,'--out',out],{cwd:process.cwd()});
  assert.equal(JSON.parse(stdout).publication,'ONLINE_PUBLISH_NOT_IMPLEMENTED');
  assert.equal(JSON.parse(await readFile(out,'utf8')).state,'OFFLINE_PACKAGE_VALIDATED');
  assert.deepEqual(await readFile(packagePath),original);
  await assert.rejects(exec(process.execPath,['scripts/prepare-extension-release.mjs',
    '--package',packagePath,'--metadata',metaPath,'--out',out],{cwd:process.cwd()}));
});
