import test from 'node:test';
import assert from 'node:assert/strict';
import {composeExtensionEntries,filterExtensionEntries} from '../../src/ui/extension-center-model.js';
const tool={id:'shared',title:'阅读目录',description:'目录',version:'1.0.0'};
const page={programId:'shared',manifestHash:'verified',installed:{manifestHash:'verified',
  title:'网页增强',revision:2,enabled:true,pageRules:{matches:['https://example.com/*']}}};
const official={id:'opendesk/shared',toolId:'shared',packageTitle:'阅读目录',description:'官方',version:'1.1.0'};
test('R4 preserves distinct app and Page identities without duplicating official IDs',()=>{
  const rows=composeExtensionEntries({installed:[tool],pages:[page],official:[official],enabled:{shared:false}});
  assert.equal(rows.length,2);
  assert.deepEqual(new Set(rows.map(x=>x.key)),new Set(['app:shared','page:shared']));
  assert.equal(rows.find(x=>x.kind==='app').enabled,false);
  assert.equal(rows.find(x=>x.kind==='app').update,true);
  assert.equal(rows.find(x=>x.kind==='page').enabled,true);
  assert.equal(filterExtensionEntries(rows).length,2);
  assert.equal(filterExtensionEntries(rows,{kind:'page'}).length,1);
  assert.equal(filterExtensionEntries(rows,{scope:'available'}).length,1);
});
test('R4 trusted candidate shows only after search or available filter',()=>{
  const rows=composeExtensionEntries({installed:[tool],official:[official,
    {...official,id:'opendesk/clip',toolId:'clip',packageTitle:'网页剪藏'}]});
  assert.equal(filterExtensionEntries(rows).length,1);
  assert.deepEqual(filterExtensionEntries(rows,{query:'剪藏'}).map(x=>x.id),['clip']);
  assert.equal(filterExtensionEntries(rows,{scope:'available'}).length,2);
  assert.equal(filterExtensionEntries(rows,{scope:'local'}).length,1);
});
test('R4 shows missing trusted preinstalls on the default Extension list, without publishing optional apps',()=>{
  const cookie={id:'opendesk/cookie-editor',toolId:'cookie-editor',
    packageTitle:'Cookie Editor',description:'Cookie 管理',version:'2.0.6',
    installationPolicy:'preinstalled'};
  const optional={id:'opendesk/optional-app',toolId:'optional-app',
    packageTitle:'其他应用',description:'可选工具',version:'1.0.0',installationPolicy:'optional'};
  const entries=composeExtensionEntries({installed:[tool],official:[cookie,optional]});
  assert.deepEqual(new Set(filterExtensionEntries(entries).map(row=>row.id)),
    new Set(['shared','cookie-editor']));
  assert.deepEqual(new Set(filterExtensionEntries(entries,{scope:'available'}).map(row=>row.id)),
    new Set(['cookie-editor','optional-app']));
  assert.equal(filterExtensionEntries(entries,{query:'Cookie Editor'})[0]?.id,'cookie-editor');
  assert.equal(filterExtensionEntries(entries,{scope:'local'}).length,1);
  assert.equal(entries.find(row=>row.id==='cookie-editor').installed,false,
    'discoverability must not pretend the tool is installed or grant any capability');
});
test('R4 discards Page records that do not match their installed manifest hash',()=>{
  assert.deepEqual(composeExtensionEntries({pages:[{...page,manifestHash:'different'}]}),[]);
});

import {readFile} from 'node:fs/promises';

test('R4 source retains one trusted installer, one combined list and high-zoom responsive actions',async()=>{
  const [html,css,center,shell]=await Promise.all([
    readFile('src/ui/tool.html','utf8'),
    readFile('src/ui/extension-center.css','utf8'),
    readFile('src/ui/extension-center.js','utf8'),
    readFile('src/ui/tool-shell.js','utf8')
  ]);
  assert.match(html,/id="extension-center-list" class="ec-list"/);
  assert.match(html,/id="extension-center-menu"/);
  assert.match(html,/id="extension-center-import-host"/);
  assert.match(html,/id="task-search-panel" class="task-search-panel" hidden/);
  assert.doesNotMatch(html,/id="tab-discover"|id="workbench-local-discover"/);
  assert.match(shell,/importHost\.append\(originalImport\)/,'trusted installer is physically reused');
  assert.match(center,/restoreRowFocus\(focusKey,focusAction\)/,'return retains list keyboard identity');
  assert.match(center,/sidebarTools\.openOfficialReview\(row\.id\)/,
    'one trusted official review replaces the extra marketplace hop');
  assert.match(center,/sidebarTools\.openTool\(row\.id\)/,
    'installed version is directly runnable even when an update is available');
  assert.doesNotMatch(center,/if\(row\.update\)\{if\(row\.release\)openMarket/,
    'an update cannot hijack the installed app primary action');
  assert.match(center,/detailFocusAction='toggle'/,'Page switch can restore focus after async authority update');
  assert.match(css,/@media\(max-width:240px\)/,'200 percent zoom retains wrapped controls');
  assert.match(css,/\.ec-name-line\{flex-wrap:wrap/);
  assert.match(css,/@media\(max-width:240px\)\{[\s\S]*?\.ec-row-actions\{top:auto;right:6px;bottom:6px;transform:none\}/,
    'narrow index moves floating actions below the copy instead of reserving a column');
});

test('R4 webpage enable path delegates to original user-gesture permission and installed Page authority',async()=>{
  const [controller,page]=await Promise.all([
    readFile('src/ui/extension-center.js','utf8'),
    readFile('src/ui/installed-page-tools.js','utf8')
  ]);
  assert.match(controller,/if\(!event\.isTrusted\|\|busy\|\|pendingKey\|\|row\.kind!=='page'\)return/);
  assert.match(controller,/setInstalledPageProgramEnabled\(\{api,client,row:row\.record\}\)/);
  assert.match(page,/requireChromePermissions\(\{api,request:\{origins:installed\.pageRules\.matches\}\}\)/);
  assert.match(page,/client\.request\('setInstalledPageEnabled',\{/);
  assert.match(page,/expectedGeneration:installed\.authorization\?\.generation\?\?null/);
});
