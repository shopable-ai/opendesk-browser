import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createSidebarToolPackage,encodeSidebarToolPackage}
  from '../../../../scripts/build-sidebar-tool.mjs';
import {validatePageInstallPackage}
  from '../../../../src/scripting/user-scripts/page-install-package.js';
import {SEND_QUEUE_PIN,admitsPinnedQueueTool,admitsPinnedQueuePage}
  from '../../../../src/platform/host/send-queue-admission.js';
const app={id:'ai-send-queue',version:SEND_QUEUE_PIN.toolVersion,uiRuntime:'opendesk.react-ui.v1',capabilities:['currentPage.read']};
const page={programId:'opendesk.ai-send-queue',revision:13,sourceHash:SEND_QUEUE_PIN.pageSourceHash,
  pageRules:{matches:['https://chatgpt.com/*'],excludeMatches:[],world:'USER_SCRIPT',
    runAt:'document_idle',allFrames:false}};
test('only the exact built React package may request queue control',()=>{
  assert.equal(admitsPinnedQueueTool(app,SEND_QUEUE_PIN.toolPackageSha256),true);
  for(const [name,tool,sha] of [
    ['spurious code same ID',app,'0'.repeat(64)],
    ['different version',{...app,version:'999.0.0'},SEND_QUEUE_PIN.toolPackageSha256],
    ['extra capability',{...app,capabilities:['currentPage.read','storage.local']},SEND_QUEUE_PIN.toolPackageSha256],
    ['wrong framework',{...app,uiRuntime:undefined},SEND_QUEUE_PIN.toolPackageSha256],
    ['wrong ID',{...app,id:'other'},SEND_QUEUE_PIN.toolPackageSha256]
  ])assert.equal(admitsPinnedQueueTool(tool,sha),false,name);
});
test('Page source and site grant remain exact and never trust an expanded same-ID script',()=>{
  assert.equal(admitsPinnedQueuePage(page),true);
  for(const bad of [
    {...page,revision:11},
    {...page,revision:12},
    {...page,sourceHash:'0'.repeat(64)},
    {...page,pageRules:{...page.pageRules,matches:['https://chatgpt.com/*','https://example.com/*']}},
    {...page,pageRules:{...page.pageRules,world:'MAIN'}},
    {...page,pageRules:{...page.pageRules,allFrames:true}}
  ])assert.equal(admitsPinnedQueuePage(bad),false);
});

test('the deliverable bytes, source receipt and catalog all match exact Host admission',async()=>{
  const root=new URL('../',import.meta.url);
  const bytes=await readFile(new URL('ai-send-queue.opendesk-tool.json',root));
  const tool=JSON.parse(bytes);
  assert.equal(admitsPinnedQueueTool(tool,createHash('sha256').update(bytes).digest('hex')),true);
  assert.deepEqual(bytes,encodeSidebarToolPackage(await createSidebarToolPackage(root.pathname)));
  const pkg=await validatePageInstallPackage(JSON.parse(
    await readFile(new URL('ai-send-queue.opendesk-page.json',root),'utf8')));
  assert.equal(admitsPinnedQueuePage(pkg),true);
  const catalog=JSON.parse(await readFile(new URL('../../../../official-pages/sources.json',import.meta.url)));
  const release=catalog.programs.find(row=>row.programId===pkg.programId);
  assert.equal(release.revision,pkg.revision);
  assert.equal(release.version,pkg.version);
  assert.equal(release.publication,'blocked','building a package cannot approve publication');
});
