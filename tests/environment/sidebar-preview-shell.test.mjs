import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generatePreview} from '../../scripts/preview/build-preview.mjs';
import {extractSidebarPreviewShell,sidebarPreviewShellSource} from '../../scripts/preview/sidebar-shell-source.mjs';

const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');

test('preview shell extracts live Side Panel navigation, toolbar and public host rules',async()=>{
  const [html,css]=await Promise.all([read('src/ui/tool.html'),read('src/ui/tool-shell.css')]);
  const extracted=extractSidebarPreviewShell(html,css);
  const live=await sidebarPreviewShellSource();
  assert.deepEqual(extracted,live);
  assert.match(extracted.digest,/^[0-9a-f]{64}$/);
  assert.ok(html.includes(extracted.nav));
  assert.ok(html.includes(extracted.head));
  assert.match(extracted.nav,/id="tab-tools"[^>]*>扩展<\/button>/);
  for(const id of ['sidebar-tool-back','sidebar-tool-title','sidebar-tool-remove'])
    assert.ok(extracted.head.includes('id="'+id+'"'));
  assert.ok(extracted.css.includes('.workbench-nav{'));
  assert.ok(extracted.css.includes('.sidebar-tool-view-head{'));
  assert.ok(!extracted.css.includes('#workflow-'), 'unrelated host pages are not copied');
});

test('preview shell rejects missing real button or stylesheet owners instead of redrawing',async()=>{
  const [html,css]=await Promise.all([read('src/ui/tool.html'),read('src/ui/tool-shell.css')]);
  assert.throws(()=>extractSidebarPreviewShell(html.replace('id="sidebar-tool-remove"','id="unsupported-action"'),css),
    /E_PREVIEW_SHELL/);
  assert.throws(()=>extractSidebarPreviewShell(html,css.replace('.workbench-nav{','.other-nav{')),
    /E_PREVIEW_SHELL/);
  assert.throws(()=>extractSidebarPreviewShell(html.replace('id="tab-tools"','id="old-tools"'),css),
    /E_PREVIEW_SHELL/);
});

test('one light preview shell frames the same real sandboxed tool without other tab bodies',async()=>{
  for(const tool of ['quick-notes','bookmark-manager']){
    const preview=await generatePreview({tool,scenario:'success',theme:'light',width:360});
    assert.equal(preview.manifest.shellTheme,'light');
    assert.match(preview.manifest.shellSha256,/^[0-9a-f]{64}$/);
    assert.ok(preview.html.includes('id="sidebar-tool-back"'));
    assert.ok(preview.html.includes('id="sidebar-tool-remove"'));
    assert.ok(preview.html.includes('id="od-preview-confirm-uninstall"'));
    assert.ok(preview.html.includes('id="od-preview-reopen"'));
    assert.ok(preview.html.includes('id="od-preview-reset"'));
    assert.ok(preview.html.includes('id="tab-tools"'));
    assert.ok(!preview.html.includes('id="workbench-workflow"'),
      'five navigation items must not embed five complete workbench pages');
    assert.ok(preview.html.includes('sandbox="allow-scripts"'));
    assert.ok(!preview.html.includes('sandbox="allow-scripts allow-same-origin"'));
    assert.ok(preview.html.includes(':root{color-scheme:light;'));
    assert.ok(!preview.html.includes('id="preview-theme-switch"'));
    assert.ok(preview.html.includes('模拟预览 · 非真实安装、权限或网络执行'));
    assert.ok(preview.html.includes('iframe.srcdoc=trustedFrameHtml;'));
    assert.ok(preview.html.includes("iframe.srcdoc='';"));
  }
});

test('dark diagnostic tool rendering does not darken the reusable preview shell',async()=>{
  const preview=await generatePreview({tool:'quick-notes',theme:'dark',scenario:'empty'});
  assert.equal(preview.manifest.theme,'dark');
  assert.equal(preview.manifest.shellTheme,'light');
  assert.ok(preview.html.includes('预览外壳：浅色'));
  assert.match(preview.html,/:root\{color-scheme:light;/);
  assert.ok(preview.frameHtml.includes('color-scheme:dark'));
});
