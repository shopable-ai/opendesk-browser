import test from 'node:test';
import assert from 'node:assert/strict';
import {decideSidebarAppUpdate,nextPatchVersion} from '../../scripts/app-update-plan.mjs';
const app=(version='1.0.9')=>({id:'reading-toc',format:'opendesk.sidebar-tool.v1',version,capabilities:['page.toc']});

test('user app update: new, unchanged, patch, and explicitly versioned releases',()=>{
  assert.equal(decideSidebarAppUpdate({previous:null,proposed:app(),bytesEqual:false}).kind,'NEW_APP');
  assert.equal(decideSidebarAppUpdate({previous:app(),proposed:app(),bytesEqual:true}).kind,'ALREADY_CURRENT');
  assert.deepEqual(decideSidebarAppUpdate({previous:app(),proposed:app(),bytesEqual:false}),{kind:'BUMP_PATCH',version:'1.0.10'});
  assert.deepEqual(decideSidebarAppUpdate({previous:app(),proposed:app('1.1.0'),bytesEqual:false}),
    {kind:'READY_WITH_VERSION',version:'1.1.0'});
});
test('same ID updates never silently downgrade, swap format, or grant extra capabilities',()=>{
  assert.throws(()=>decideSidebarAppUpdate({previous:app(),proposed:app('1.0.8'),bytesEqual:false}),/E_APP_DOWNGRADE/);
  assert.throws(()=>decideSidebarAppUpdate({previous:app(),proposed:{...app(),id:'other'},bytesEqual:false}),/E_APP_IDENTITY/);
  assert.throws(()=>decideSidebarAppUpdate({previous:app(),proposed:{...app(),format:'opendesk.sidebar-tool.v2'},bytesEqual:false}),/E_APP_IDENTITY/);
  assert.throws(()=>decideSidebarAppUpdate({previous:app(),proposed:{...app(),capabilities:['page.toc','browser.cookies']},bytesEqual:false}),/E_APP_REVIEW_REQUIRED/);
});
test('patch increment uses exact version segments',()=>{
  assert.equal(nextPatchVersion('1.0.9'),'1.0.10');
  assert.equal(nextPatchVersion('0.0.999999999999999999'),'0.0.1000000000000000000');
  assert.throws(()=>nextPatchVersion('1.0'),/E_APP_VERSION/);
});
