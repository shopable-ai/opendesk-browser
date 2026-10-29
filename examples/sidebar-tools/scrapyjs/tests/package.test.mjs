import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {checkSidebarToolProjectPackage,createSidebarToolPackage,encodeSidebarToolPackage} from '../../../../scripts/build-sidebar-tool.mjs';
import {CAPTURE_ORIGINS} from '../adapters/capture-policy.js';
const tool=new URL('../',import.meta.url);
const sha=x=>createHash('sha256').update(x).digest('hex');
test('single promoted App is reproducible and delegates only to the shipped fixed Task revision',async()=>{
  const candidate=process.env.SCRAPYJS_CANDIDATE;
  if(candidate)assert.equal(sha(await readFile(candidate)),sha(encodeSidebarToolPackage(await createSidebarToolPackage(tool.pathname))));
  else assert.equal((await checkSidebarToolProjectPackage(tool.pathname)).status,'PROJECT_PACKAGE_MATCH');
  const app=JSON.parse(await readFile(candidate || new URL('scrapyjs.opendesk-tool.json',tool)));
  assert.equal(app.uiRuntime,'opendesk.react-ui.v1');
  assert.equal(app.html.trim(),'<div id="tool-app"></div>');
  assert.doesNotMatch(app.js,/__opendeskPreview|E_PREVIEW_(?:UNSUPPORTED|KEY|ETAG|EXPORT|LIMIT|IDENTITY|BUSY)|chrome\.(?:tabs|scripting)|allow-same-origin/);
  const task=JSON.parse(await readFile(process.env.SCRAPYJS_TASK_CANDIDATE || new URL('controller/scrapyjs.opendesk-task.json',tool)));
  assert.deepEqual(task.manifest.siteOrigins,CAPTURE_ORIGINS);
  assert.deepEqual(task.manifest.permissions,['page.automation']);
  assert.equal(sha(task.sourceUtf8),task.manifest.program.sourceHash);
  assert.deepEqual(app.delegatedTasks,[{taskId:task.manifest.taskId,version:task.manifest.version,
    manifestHash:task.manifestHash,contentHash:sha(task.sourceUtf8)}]);
  assert.deepEqual(app.capabilities,['ai.generate','localTasks','storage.local','currentPage.read','user.export','tasks.run']);
});
