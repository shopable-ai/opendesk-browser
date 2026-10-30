// R2.3 source contract: the discontinued host DOM cannot be a product fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('trusted AdBlock exports the existing service, not a second product UI',async()=>{
  const entry=await readFile(new URL('../../src/entrypoints/sidebar-tool-host.js',import.meta.url),'utf8');
  assert.match(entry,/prepareUninstallCleanup:prepareAdblockUninstallCleanup/);
  assert.match(entry,/request:requestAdblockOperation/);
  assert.doesNotMatch(entry,/createPermissionControls:createAdblockPermissionControls/);
});
test('legacy UI shows read-only upgrade guidance with normal management retained',async()=>{
  const text=await readFile(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8');
  assert.doesNotMatch(text,/adblock\.createPermissionControls\(/);
  assert.doesNotMatch(text,/adblockControls\?/);
  assert.match(text,/const legacyAdblock=managed&&id===ADBLOCK_ID/);
  assert.match(text,/view\.setLegacyAdblockVisible\(legacyAdblock&&!tocSettingsOpen\)/);
  const ui=await readFile(new URL('../../src/ui/react/tabs/tool-host.tsx',import.meta.url),'utf8');
  assert.match(ui,/此版本 AdBlock 的旧控制界面已退役/);
  assert.match(ui,/id="sidebar-tool-adblock-native" hidden=\{!snapshot\.legacyAdblockVisible\}/);
  assert.match(text,/frameRoot\.hidden=.*[\s\S]*?legacyAdblock;/);
});
test('legacy cleanup and DNR authorization remain under installed package gates',async()=>{
  const host=await readFile(new URL('../../projects/adblock/trusted/tool-host.js',import.meta.url),'utf8');
  const cleanup=await readFile(new URL('../../projects/adblock/trusted/host-controls.js',import.meta.url),'utf8');
  assert.match(host,/sameSidebarToolPackage/);
  assert.match(host,/requestBrowserClick/);
  assert.match(host,/event\?\.isTrusted!==true/);
  assert.match(cleanup,/prepareAdblockUninstallCleanup/);
});
