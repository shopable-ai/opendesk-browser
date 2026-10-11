import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Side Panel and official tools must use inline choices instead of blocking JS
// dialogs. PermissionConsent.confirm() is a trusted API method (not window.confirm)
// and Chrome-native permission prompts remain owned by the browser.
const TRUSTED_UI=[
  'src/ui/sidebar-tools.js',
  'src/ui/tool-shell.js',
  'src/ui/workflow/workflow-view.js',
  'src/ui/site-access.js',
  'src/ui/sdk-approval.js',
  'src/native-agent/workspace.js',
  'src/native-agent/settings.js',
  'src/marketplace/page.js'
];
const BUNDLED_TOOL_SOURCES=[
  'examples/sidebar-tools/reading-toc/src/main.js',
  'examples/sidebar-tools/web-markdown-clipper/src/main.js',
  'examples/sidebar-tools/knowledge-inbox/src/main.js',
  'examples/sidebar-tools/quick-notes/src/main.js',
  'examples/sidebar-tools/markdown-workbench/src/main.js'
];
test('R5.4 trusted UI and bundled tools contain no blocking JavaScript browser dialogs',async()=>{
  for(const path of [...TRUSTED_UI,...BUNDLED_TOOL_SOURCES]){
    const content=await readFile(path,'utf8');
    assert.doesNotMatch(content,/\b(?:globalThis|window|self)\s*\.\s*(?:confirm|alert|prompt)\s*\(/,
      path+' must not call browser JS dialogs');
    // These selected files have no application-local confirm() callback.
    assert.doesNotMatch(content,/(^|[^.\w])(?:confirm|alert|prompt)\s*\(/m,
      path+' must use inline permission/review controls');
    assert.doesNotMatch(content,/\b(?:onbeforeunload\s*=|addEventListener\s*\(\s*['"]beforeunload['"])/,
      path+' must not trigger a native leave-page confirmation');
  }
});

test('R5.4 no-modal interaction still keeps explicit undo/cancel and Chrome authority boundaries',async()=>{
  const [html,source,workflow,manifestText,markdown]=await Promise.all([
    readFile('src/ui/tool.html','utf8'),
    readFile('src/ui/sidebar-tools.js','utf8'),
    readFile('src/ui/workflow/workflow-view.js','utf8'),
    readFile('manifest.json','utf8'),
    readFile('examples/sidebar-tools/markdown-workbench/src/main.js','utf8')
  ]);
  for(const id of [
    'sidebar-tool-inline-leave','sidebar-tool-inline-leave-confirm','sidebar-tool-inline-leave-cancel',
    'sidebar-tool-inline-remove','sidebar-tool-inline-remove-confirm','sidebar-tool-inline-remove-cancel',
    'workflow-new-review','workflow-new-discard','workflow-new-cancel'
  ])assert.match(html,new RegExp('id="'+id+'"'),'missing inline action '+id);
  assert.match(source,/requireCompleteInstalledSidebarTools/,'uninstall still verifies installed identities');
  assert.match(source,/writeVerifiedLocalValue/,'installed changes retain verified writes');
  assert.match(workflow,/newReviewSignature!==workflowReviewSignature\(\)/,'workflow discards must verify current draft');
  assert.match(markdown,/mdw-review-cancel/,'editor still exposes inline Cancel');
  const manifest=JSON.parse(manifestText);
  assert.match(manifest.content_security_policy.sandbox,/sandbox allow-scripts/);
  assert.doesNotMatch(manifest.content_security_policy.sandbox,/allow-modals/,
    'untrusted sandbox tools may not open browser modal dialogs');
});
