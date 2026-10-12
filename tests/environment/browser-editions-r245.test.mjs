import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveBrowserEdition,compilerResourcesForEdition,editionOutputName,
  editionRecord,editionRecordText,readEditionRecord,DEVELOPER_BROWSER_NAME
} from '../../scripts/browser-editions-r245.mjs';
import {PAGE_BROWSER_PRIVATE_FILES} from '../../src/libs/page-frameworks/contract.js';

test('R24.5 Standard is the default and ships zero browser compiler assets',()=>{
  assert.equal(resolveBrowserEdition(undefined),'standard');
  assert.deepEqual(compilerResourcesForEdition('standard'),[]);
  assert.equal(editionOutputName('production','standard'),'production');
  assert.equal(editionOutputName('development','standard'),'development');
  assert.deepEqual(editionRecord('standard'),{
    format:'opendesk.browser-edition.v1',edition:'standard',browserComponentCompiler:false
  });
});
test('R24.5 Developer bundles exactly the pinned browser compiler closure',()=>{
  const expected=PAGE_BROWSER_PRIVATE_FILES;
  assert.equal(compilerResourcesForEdition('developer'),expected);
  // Independent fixed total for the seven reviewed compiler files; per-file
  // bytes and SHA-256 remain locked in PAGE_BROWSER_PRIVATE_FILES and verifyPackage.
  assert.equal(expected.reduce((n,row)=>n+row.bytes,0),4277251);
  assert.equal(editionOutputName('production','developer'),'production-developer');
  assert.equal(editionOutputName('development','developer'),'development-developer');
  assert.equal(DEVELOPER_BROWSER_NAME,'OpenDesk Browser Developer');
  assert.equal(editionRecord('developer').browserComponentCompiler,true);
});
test('R24.5 malformed or cross-edition resource markers fail closed',()=>{
  for(const edition of ['standard','developer'])
    assert.equal(readEditionRecord(editionRecordText(edition)),edition);
  for(const input of ['{}','{"edition":"developer"}','garbage',
    editionRecordText('developer').replace('"browserComponentCompiler": true','"browserComponentCompiler": false')])
    assert.throws(()=>readEditionRecord(input),/E_BROWSER_EDITION_RECORD/);
  assert.throws(()=>resolveBrowserEdition('full'),/E_BROWSER_EDITION/);
  assert.throws(()=>editionOutputName('production1','standard'),/E_BROWSER_EDITION_MODE/);
});
