import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');

test('R1.0 SOURCE_ONLY: admitted Bookmark workspace inherits host height through one flex chain',async()=>{
  const [shell,pilot,app,dock,host]=await Promise.all([
    read('src/ui/tool-shell.css'),read('src/ui/react/tabs/bookmark-pilot.css'),
    read('src/ui/react/app-shell.tsx'),read('src/ui/react/components/conversation-dock.css'),
    read('src/ui/react/tabs/tool-host.tsx')
  ]);
  assert.match(app,/<main id="workspace-content">/);
  assert.match(app,/<div id="workbench-tools"/);
  assert.match(app,/<section id="sidebar-tools"/);
  assert.ok(shell.includes('#workspace-content:has(> #workbench-tools:not([hidden]) #sidebar-tool-frame[data-bookmark-trusted="true"]:not([hidden]))'),
    'height mode must be scoped to the visible Tools tab and admitted Bookmark portal');
  assert.ok(shell.includes('#workbench-tools:has(#sidebar-tool-frame[data-bookmark-trusted="true"]:not([hidden])) > #sidebar-tools'));
  // Existing #workspace-content > .od-page:not(...):not(...) grid has higher
  // specificity than a bare #workbench-tools:has(...). Keep the flex override
  // strictly stronger so the workspace actually gets a definite flex height.
  assert.ok(shell.includes('#workspace-content > #workbench-tools:not([hidden]):has(#sidebar-tool-frame[data-bookmark-trusted="true"]:not([hidden])){'),
    'the admitted Flex rule must outrank the existing workbench-tools Grid rule');
  assert.ok(shell.includes('#workspace-content>.od-page:not([hidden]):not(#workbench-workflow):not(#workbench-discover){display:grid;'));
  assert.match(host,/<div className="sidebar-tool-host od-stack">/);
  assert.ok(shell.includes('#sidebar-tools:has(#sidebar-tool-frame[data-bookmark-trusted="true"]:not([hidden])) > .sidebar-tool-host,'),
    'the actual React ToolHost wrapper must participate in the admitted height chain');
  assert.ok(shell.includes('#sidebar-tools:has(#sidebar-tool-frame[data-bookmark-trusted="true"]:not([hidden])) > .sidebar-tool-host > #sidebar-tool-display:not([hidden])'));
  assert.match(pilot,/flex:1 1 0;/);
  assert.match(pilot,/height:auto;/);
  assert.match(pilot,/max-height:none;/);
  assert.doesNotMatch(pilot,/100dvh|100vh|900px|height:clamp\(/,
    'trusted workspace must not guess Chrome navbar offsets or enforce a 900px ceiling');
  assert.match(dock,/\.od-conversation-business\{[^\n]*flex:1/);
  assert.match(dock,/\.od-conversation-log\{[^\n]*overflow:auto/);
  assert.match(dock,/\.od-conversation-composer\{[^\n]*flex:none/);
});

test('R1.0 SOURCE_ONLY: sandbox iframe stays content-sized and tool settings can scroll',async()=>{
  const [shell,host,controller]=await Promise.all([
    read('src/ui/tool-shell.css'),read('src/ui/react/tabs/tool-host.tsx'),read('src/ui/sidebar-tools.js')
  ]);
  assert.match(shell,/\.sidebar-tool-iframe\{[^\n]*height:220px;max-height:1600px/);
  assert.match(shell,/#sidebar-tool-settings-view:not\(\[hidden\]\)\{[\s\S]*?overflow-y:auto;/);
  assert.match(host,/id="sidebar-tool-frame" className="sidebar-tool-frame"/);
  assert.match(controller,/frameRoot\.dataset\.bookmarkTrusted='true'/);
  assert.match(controller,/delete frameRoot\.dataset\.bookmarkTrusted/);
  assert.match(controller,/frame=doc\.createElement\('iframe'\)/);
});
