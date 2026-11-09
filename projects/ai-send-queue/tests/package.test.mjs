import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../../scripts/build-sidebar-tool.mjs';
import {verifySidebarToolBackground} from '../../../src/ui/sidebar-tools/package.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const path=process.env.SEND_QUEUE_PACKAGE_PATH||resolve(root,'ai-send-queue.opendesk-tool.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('one reviewed Sidebar package contains the complete crown and FIFO Page module',async()=>{
  const bytes=await readFile(path),pkg=await verifySidebarToolBackground(JSON.parse(bytes));
  assert.equal(pkg.format,'opendesk.sidebar-tool.v2');
  assert.equal(pkg.id,'ai-send-queue');
  assert.deepEqual(pkg.capabilities,['page.module','currentPage.read']);
  assert.equal(pkg.uiRuntime,'opendesk.react-ui.v1');
  assert.equal(pkg.pageModule.programId,'app.ai-send-queue');
  assert.equal(pkg.pageModule.version,pkg.version);
  assert.equal(pkg.pageModule.revision,17);
  assert.equal(pkg.pageModule.sourceHash,sha(Buffer.from(pkg.pageModule.sourceUtf8)));
  assert.deepEqual(pkg.pageModule.pageRules,{matches:['https://chatgpt.com/*'],excludeMatches:[],
    runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'});
  assert.match(pkg.pageModule.sourceUtf8,/data:image\/webp;base64,/,'packaged crown image');
  assert.deepEqual(bytes,encodeSidebarToolPackage(await createSidebarToolPackage(root)),
    'current Page source and all assets must reproduce the delivered package');
});

test('current distribution offers only the composite package and no independent Page candidate',async()=>{
  const files=await readdir(root);
  assert.deepEqual(files.filter(name=>/\.opendesk-(?:tool|page)\.json$/.test(name)),
    ['ai-send-queue.opendesk-tool.json']);
  const pages=JSON.parse(await readFile(new URL('../../../official-pages/sources.json',import.meta.url),'utf8'));
  assert.equal(pages.programs.some(row=>row.project==='projects/ai-send-queue'),false);
  const tools=JSON.parse(await readFile(new URL('../../../official-tools/catalog.json',import.meta.url),'utf8'));
  const rows=tools.tools||tools.apps;
  const entries=rows.filter(row=>row.id==='ai-send-queue');
  assert.equal(entries.length,1);
  assert.equal(entries[0].packageFile,'ai-send-queue.opendesk-tool.json');
});
