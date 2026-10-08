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

test('trusted Side Panel run sends the exact unsaved draft to the original Controller authority', async () => {
  const [html, editor, host, broker]=await Promise.all([
    read('src/ui/tool.html'), read('src/ui/script-editor.js'),
    read('src/run-host.js'), read('src/platform/host/controller-methods.js')]);
  assert.match(html,/id="script-run" disabled>运行草稿/);
  assert.match(editor,/sourceUtf8 = find\('script-source'\)\.value/);
  assert.match(editor,/host\.start\(\{source:\{kind:'draft',sourceUtf8\}/);
  assert.match(editor,/permissions\.request/);
  assert.doesNotMatch(editor,/请先保存或加载要运行的持久版本/);
  assert.match(host,/sourceRequest = source === undefined/);
  assert.match(broker,/sourceKind: isDraft \? 'draft' : 'saved'/);
  assert.match(broker,/digestUtf8\(run\.draftSourceUtf8\)/);
  assert.match(broker,/if \(host && run\.revision\?\.pinKey\)/);
  assert.doesNotMatch(editor,/\beval\s*\(|scripting\.executeScript/);
});

test('ordinary Sidebar sections precede folded engineering tools and preserve every control ID',async()=>{
  const html=await read('src/ui/tool.html'), css=await read('src/ui/tool-shell.css');
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>id);
  assert.equal(new Set(ids).size,ids.length);
  for(const id of ['current-page-title','script-title','task-title','result-title','tool-diagnostics','script-advanced'])assert(ids.includes(id));
  const advanced=html.slice(html.indexOf('<details id="tool-diagnostics">'));
  for(const id of ['sdk-install','check-source','check-target','scraping-panel'])assert(advanced.includes(`id="${id}"`));
  assert.match(css,/min-width:0/);assert.match(css,/overflow-wrap:anywhere/);
});
