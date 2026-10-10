// CI-only, independent tool project smoke; never installs a tool or Chrome extension.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {stageSidebarTool} from '../../scripts/stage-sidebar-tool.mjs';
import {validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const kind of ['react','vue']){
  const root=join('examples','sidebar-tools',kind+'-starter');
  const receipt=JSON.parse(await readFile(join(root,'dist','build-ready.json'),'utf8'));
  assert.equal(receipt.format,'opendesk.ui-build-ready.v1');
  assert.match(receipt.buildId,/^[0-9a-f-]{36}$/);
  for(const name of ['tool.js','tool.css']){
    const bytes=await readFile(join(root,'dist',name));
    assert.equal(receipt.files['dist/'+name].bytes,bytes.length);
    assert.equal(receipt.files['dist/'+name].sha256,sha(bytes));
  }
  const stage=await stageSidebarTool(root);
  assert.equal(stage.buildId,receipt.buildId);
  assert.equal(stage.installed,false);
  assert.equal(stage.previewAuthorized,false);
  const bytes=await readFile(stage.output);
  assert.equal(stage.sha256,sha(bytes));
  const tool=validateSidebarToolPackage(JSON.parse(bytes.toString('utf8')));
  assert.equal(tool.id,kind+'-notes-starter');
  assert.deepEqual(tool.capabilities,['storage.local']);
  assert.ok(tool.js.length>50000,'bundle must include local runtime dependencies');
  assert.ok(tool.js.length<=220000,'classic JS stays under the existing schema limit');
  assert.ok(bytes.length<=320000,'overall tool package must fit current validator budget');
  console.log(JSON.stringify({kind,status:'PACKAGE_VALIDATED_NOT_INSTALLED',bytes:bytes.length,
    jsChars:tool.js.length,cssChars:tool.css.length,buildId:receipt.buildId,sha256:stage.sha256}));
}
