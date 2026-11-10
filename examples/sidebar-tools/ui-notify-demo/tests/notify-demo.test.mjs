import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSidebarToolPackage,encodeSidebarToolPackage}
  from '../../../../scripts/build-sidebar-tool.mjs';
import {validateSidebarToolPackage,SIDEBAR_TOOL_FORMAT}
  from '../../../../src/ui/sidebar-tools/package.js';

const root=new URL('../',import.meta.url).pathname;
test('ui.notify laboratory uses one valid standalone v1 tool and no capabilities',async()=>{
  const pkg=validateSidebarToolPackage(await createSidebarToolPackage(root));
  assert.equal(pkg.id,'ui-notify-demo');
  assert.equal(pkg.version,'1.1.0');
  assert.equal(pkg.format,SIDEBAR_TOOL_FORMAT);
  assert.deepEqual(pkg.capabilities,[]);
  assert.match(pkg.html,/通知组件实验室/);
  for(const key of ['info','success','warning','error','group','separate',
    'persistent','duration','legacy','invalid','loading-success','loading-fail','handle-close','rate-probe'])
    assert.match(pkg.html,new RegExp('data-sample="'+key+'"'));
  assert.match(pkg.js,/tool\.ui\?\.notify/);
  assert.match(pkg.js,/notify\.open/);
  assert.match(pkg.js,/handle\.update/);
  assert.match(pkg.js,/previous\.dismiss/);
  assert.match(pkg.js,/retryAfterMs/);
  assert.doesNotMatch(pkg.js,/\bchrome\.(?:tabs|runtime|scripting|storage)\b/);
  assert.equal(typeof pkg.background,'undefined');
  assert.equal(typeof pkg.controller,'undefined');
  assert.equal(typeof pkg.pageModule,'undefined');
});
test('checked-in demo package (when present) matches current tested source bytes',async t=>{
  const pkg=await createSidebarToolPackage(root);
  const bytes=encodeSidebarToolPackage(pkg);
  let existing;
  try{existing=await readFile(new URL('../ui-notify-demo.opendesk-tool.json',import.meta.url));}
  catch(error){
    if(error.code==='ENOENT'){t.skip('Formal package not yet promoted; candidate generated separately');return;}
    throw error;
  }
  assert.equal(existing.toString('utf8'),bytes.toString('utf8'),
    'do not hand-edit installable JSON; promote exact packer output');
});
