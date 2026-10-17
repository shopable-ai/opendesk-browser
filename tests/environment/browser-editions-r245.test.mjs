import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveBrowserEdition,resolveDevelopmentBrowserEdition,compilerResourcesForEdition,editionOutputName,
  editionRecord,editionRecordText,readEditionRecord,DEVELOPER_BROWSER_NAME,
  STANDARD_BROWSER_NAME,BROWSER_MENU_SHORT_NAME,deriveDeveloperBrowserName
} from '../../scripts/browser-editions-r245.mjs';
import {PAGE_BROWSER_PRIVATE_FILES} from '../../src/libs/page-frameworks/contract.js';
import {readFileSync} from 'node:fs';

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
  // Independent fixed total for the nine reviewed compiler files; per-file
  // bytes and SHA-256 remain locked in PAGE_BROWSER_PRIVATE_FILES and verifyPackage.
  assert.equal(expected.length,9);
  assert.equal(expected.reduce((n,row)=>n+row.bytes,0),4288565);
  assert.equal(editionOutputName('production','developer'),'production-developer');
  assert.equal(editionOutputName('development','developer'),'development-developer');
  const source=JSON.parse(readFileSync(new URL('../../manifest.json',import.meta.url),'utf8'));
  assert.equal(STANDARD_BROWSER_NAME,source.name);
  assert.equal(BROWSER_MENU_SHORT_NAME,source.short_name);
  assert.equal(DEVELOPER_BROWSER_NAME,source.name+' Developer');
  assert.equal(deriveDeveloperBrowserName('New Product'),'New Product Developer');
  assert.throws(()=>deriveDeveloperBrowserName('X'.repeat(70)),/E_BROWSER_BRAND/);
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

test('Daily source development retains JSX/SFC while explicit Standard and packaging defaults stay valid',()=>{
  assert.equal(resolveDevelopmentBrowserEdition(undefined),'developer');
  assert.equal(resolveDevelopmentBrowserEdition('developer'),'developer');
  assert.equal(resolveDevelopmentBrowserEdition('standard'),'standard');
  assert.equal(resolveBrowserEdition(undefined),'standard');
  assert.equal(compilerResourcesForEdition(resolveDevelopmentBrowserEdition(undefined)),PAGE_BROWSER_PRIVATE_FILES);
  assert.throws(()=>resolveDevelopmentBrowserEdition('full'),/E_BROWSER_EDITION/);
});
