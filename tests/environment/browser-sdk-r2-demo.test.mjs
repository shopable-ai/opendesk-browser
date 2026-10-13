import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
const file=new URL('../../examples/sidebar-tools/browser-sdk-r2/browser-operations.opendesk-tool.json',import.meta.url);

test('Browser SDK R2–R4 demo is a valid installable v2 tool, not a fake privileged page',async()=>{
 const pkg=validateSidebarToolPackage(JSON.parse(await readFile(file,'utf8')));
 assert.equal(pkg.format,'opendesk.sidebar-tool.v2');
 assert.equal(pkg.version,'1.0.1','Updated compact SDK demo must not reuse the old installed package version');
 assert.equal(pkg.requires.browserSdk,'1.0.0');
 assert.deepEqual(pkg.contributes.contextMenus,[]);
 assert.deepEqual(pkg.capabilities,['browser.tabs','browser.sidePanel','network',
  'browser.network.observe','browser.events','browser.operations','browser.screenshot']);
 assert.match(pkg.js,/OpenDeskSDK\.browser/);
 assert.match(pkg.js,/browser\.tabs\.create/);
 assert.match(pkg.js,/browser\.network\.watch/);
 assert.match(pkg.js,/currentWatch\(\)\.read/);
 assert.match(pkg.js,/currentWatch\(\)\.stop/);
 assert.match(pkg.js,/currentWatch\(\)\.export/);
 assert.doesNotMatch(pkg.js,/browser\.network\.observe\.start/);
 assert.match(pkg.js,/currentWatch\(\)\.cancel/);
 assert.match(pkg.js,/browser\.screenshot\.captureVisible/);
 assert.doesNotMatch(pkg.js,/chrome\.tabs|chrome\.downloads|document\.createElement\(['"]script/);
});
