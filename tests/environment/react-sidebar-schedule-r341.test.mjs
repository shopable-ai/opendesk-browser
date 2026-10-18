import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithEsbuild} from 'vite';

const read=path=>readFile(path,'utf8');
test('R34.1 trusted scheduler and preview share one React schedule card',async()=>{
  const [ui,root,owner,shell,preview,builder]=await Promise.all([
    read('src/ui/react/tabs/schedule.tsx'),read('src/ui/react/main.tsx'),
    read('src/ui/scheduled-task-workbench.js'),read('src/ui/tool-shell.js'),
    read('src/ui/react/preview/sidebar-six-my-flows.tsx'),
    read('scripts/preview/build-sidebar-six-react-preview.mjs')
  ]);
  assert.ok((await transformWithEsbuild(ui,'schedule.tsx',
    {loader:'tsx',jsx:'transform',target:'es2022'})).code.length>1000);
  for(const snippet of ['export function SchedulePlanRows','schedulePlanStatusLabel(presentation)',
      'schedulePlanNeedsNotice(presentation)','role="img"','event.nativeEvent?.isTrusted===true',
      'activeFire.runId===currentRunId'])assert.ok(ui.includes(snippet),snippet);
  assert.doesNotMatch(ui,/chrome\.|client\.request\(|host\.stop\(|createRoot\(/);
  assert.match(root,/createRoot\(shell\?\.mount\|\|section\)/);
  assert.match(root,/createPortal\(\s*<SchedulePlanRows/);
  assert.match(root,/renderScheduledPlanRows\(next\)/);
  assert.match(root,/renderScheduledCurrentRun\(runId\)/);
  assert.match(owner,/reactUI\.renderScheduledPlanRows\(/);
  assert.match(owner,/reactUI\.renderScheduledCurrentRun\(host\.currentRun\)/);
  assert.match(owner,/if\(!reactOwned\)parent\.replaceChildren\(\)/);
  assert.match(owner,/if\(reactOwned\)publishReactRows\(\)/);
  assert.match(shell,/reactUI:extensionList/);
  assert.match(preview,/createPortal\(<SchedulePlanRows/);
  assert.match(preview,/createPortal\(<ScheduleManagerRows/);
  assert.match(ui,/export function ScheduleManagerRows/);
  assert.match(root,/createPortal\(\s*<ScheduleManagerRows/);
  assert.match(root,/renderScheduledManagerRows\(next\)/);
  assert.match(owner,/reactUI\.renderScheduledManagerRows\(/);
  assert.doesNotMatch(preview,/return <article key=\{p\.id\} className="schedule-card/);
  assert.match(builder,/src\/ui\/react\/tabs\/schedule\.tsx/);
  // The installed shell verifier consumes strict non-self-closing HTML tags.
  // A self-closing SVG path in tool.html previously blocked all WXT builds.
  const officialHtml=await read('src/ui/tool.html');
  assert.doesNotMatch(officialHtml,/<path\s+[^>]*\/\s*>/);

});
