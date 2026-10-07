import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = path => readFile(path, 'utf8');

test('manifest exposes tool.html as a global Chrome Side Panel', async () => {
  const manifest=JSON.parse(await read('manifest.json'));
  assert.ok(manifest.permissions.includes('sidePanel'));
  assert.deepEqual(manifest.side_panel,{default_path:'ui/tool.html'});
  assert.equal(manifest.action.default_popup,undefined);
});

test('product shell has no popup-window fallback', async () => {
  const [environment,worker]=await Promise.all([read('src/environment.js'),read('src/sw.js')]);
  assert.match(environment,/configureSidePanel/);
  assert.doesNotMatch(environment,/createWindowShell|windows\.create\(/);
  assert.doesNotMatch(worker,/createWindowShell|shell\.open\(/);
});

test('default Run freezes Current Page then revalidates before existing RunHost', async () => {
  const [html,editor,target]=await Promise.all([read('src/ui/tool.html'),read('src/ui/script-editor.js'),read('src/ui/current-page-target.js')]);
  assert.match(html,/<option value="current">当前网页（默认）<\/option>/);
  assert.match(html,/id="script-running-target"/);
  const capture=editor.indexOf('currentPageTarget.capture()');
  const revalidate=editor.indexOf('await currentPageTarget.revalidate(chosen.candidate)');
  const start=editor.indexOf('const claim = await host.start');
  assert.ok(capture>=0 && revalidate>capture && start>revalidate);
  assert.match(target,/windows\.getCurrent\(\)/);
  assert.match(target,/tabs\.query\(\{active: true, windowId: boundWindowId\}\)/);
  assert.match(target,/documentId/);
  assert.match(target,/E_DOCUMENT_STALE/);
});

test('editor makes saved revision semantics explicit and does not execute source directly', async () => {
  const editor=await read('src/ui/script-editor.js');
  assert.match(editor,/存在未保存修改 · 本次 Run/);
  assert.match(editor,/revision:revision\.revision, contentHash:revision\.contentHash/);
  assert.doesNotMatch(editor,/\beval\s*\(|scripting\.executeScript/);
});
