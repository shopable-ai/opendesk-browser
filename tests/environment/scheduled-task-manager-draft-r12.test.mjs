import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canStartScheduleFromManager} from '../../src/ui/scheduled-task-workbench.js';

// Runtime policy: a manager detour from a dirty editor is never a create action.
test('R1.2 task manager cannot replace an unsaved schedule draft',()=>{
  assert.equal(canStartScheduleFromManager('form'),false);
  assert.equal(canStartScheduleFromManager('detail'),true);
  assert.equal(canStartScheduleFromManager('list'),true);
});

test('R1.2 the original Chrome manager tests the unsafe shortcut and retains stable Task actions',async()=>{
  const [ui,native]=await Promise.all([
    readFile('src/ui/scheduled-task-workbench.js','utf8'),
    readFile('tests/framework/scheduled-tasks-r1-native-mac.test.mjs','utf8')
  ]);
  assert.match(ui,/if\(canStartScheduleFromManager\(managerReturn\)\)\{/);
  assert.match(ui,/managerReturn=returnView;\s*renderManager\(\);show\('manager'\)/);
  assert.match(ui,/view==='form'&&prior==='manager'&&managerReturn==='form'\?formScrollTop:0/);
  assert.match(ui,/pendingCreateFromForm=activeView==='form'\|\|\(activeView==='manager'&&managerReturn==='form'\)/);
  assert.match(native,/report\.tests\.nativeManagerBlocksDraftOverwrite='PASS'/);
  assert.match(native,/assert\(!managerActions\.includes\('设置定时'\)/);
  assert.match(native,/schedule-manager-toggle/);
  assert.match(native,/schedule-manager-uninstall/);
  assert.doesNotMatch(native,/#schedule-manager-list \.schedule-manager-card \.schedule-actions button:nth-child/);
});
