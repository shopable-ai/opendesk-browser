import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {checkSidebarToolProjectPackage} from '../../../../scripts/build-sidebar-tool.mjs';
const tool=new URL('../',import.meta.url);
const sha=x=>createHash('sha256').update(x).digest('hex');
test('single promoted App is reproducible and delegates only to the shipped fixed Task revision',async()=>{
  const checked=await checkSidebarToolProjectPackage(tool.pathname);
  assert.equal(checked.status,'PROJECT_PACKAGE_MATCH');
  const app=JSON.parse(await readFile(new URL('scrapyjs.opendesk-tool.json',tool)));
  const task=JSON.parse(await readFile(new URL('controller/scrapyjs.opendesk-task.json',tool)));
  assert.deepEqual(task.manifest.siteOrigins,['http://127.0.0.1:43111']);
  assert.deepEqual(task.manifest.permissions,['page.automation']);
  assert.equal(sha(task.sourceUtf8),task.manifest.program.sourceHash);
  assert.deepEqual(app.delegatedTasks,[{taskId:task.manifest.taskId,version:task.manifest.version,
    manifestHash:task.manifestHash,contentHash:sha(task.sourceUtf8)}]);
  assert.deepEqual(app.capabilities,['storage.local','currentPage.read','user.export','tasks.run']);
});
