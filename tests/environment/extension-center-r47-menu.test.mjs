import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {composeExtensionEntries,resolveExtensionPrimaryAction,resolveExtensionRowIntent} from '../../src/ui/extension-center-model.js';

const installed={id:'notes',title:'Notes',description:'笔记',version:'1.0.0'};
const program={programId:'reader',manifestHash:'fixed',installed:{
  manifestHash:'fixed',title:'网页增强',enabled:true,revision:1,
  nativeState:'registered',authorization:{status:'suspended',generation:7},
  pageRules:{matches:['https://example.com/*']}
}};
const release={id:'opendesk/new-app',toolId:'new-app',packageTitle:'新版候选',
  description:'未安装',version:'1.0.0',installationPolicy:'preinstalled'};

test('R4.7 zero-or-one primary: active app only; false, unknown, Page and uninstalled are detail-only',()=>{
  const rows=composeExtensionEntries({installed:[installed],pages:[program],official:[release]});
  const app=rows.find(row=>row.key==='app:notes');
  assert.deepEqual(resolveExtensionPrimaryAction(app),{id:'open',label:'打开'});
  assert.equal(resolveExtensionRowIntent(app),'launch');
  for(const row of rows.filter(row=>row.key!=='app:notes')){
    assert.equal(resolveExtensionPrimaryAction(row),null);
    assert.equal(resolveExtensionRowIntent(row),'detail');
  }
  const disabled=composeExtensionEntries({installed:[installed],enabled:{notes:false}})[0];
  assert.equal(resolveExtensionPrimaryAction(disabled),null);
  assert.equal(resolveExtensionRowIntent(disabled),'detail');
  const unknown=composeExtensionEntries({installed:[installed],appStatusKnown:false})[0];
  assert.equal(unknown.enabled,null);
  assert.equal(unknown.stateKnown,false);
  assert.equal(resolveExtensionPrimaryAction(unknown),null);
  const pageUnknown=composeExtensionEntries({pages:[program],pageStatusKnown:false})[0];
  assert.equal(pageUnknown.enabled,null);
  assert.equal(resolveExtensionPrimaryAction(pageUnknown),null);
});

test('R4.7 one trusted app toggle from both settings and row overflow',async()=>{
  const [center,host,installer]=await Promise.all([
    readFile('src/ui/extension-center.js','utf8'),
    readFile('src/ui/sidebar-tools.js','utf8'),
    readFile('src/ui/sidebar-tools/installation.js','utf8')
  ]);
  assert.match(center,/sidebarTools\.toggleEnabled\(row\.id,event\)/);
  assert.match(center,/typeof sidebarTools\.toggleEnabled==='function'/);
  assert.match(host,/async function toggleEnabled\(id,event\)/);
  assert.match(host,/if\(!event\?\.isTrusted\|\|disposed\|\|busy/);
  assert.match(host,/if\(active\?\.id===id&&!canLeave\(apply\)\)return false/);
  assert.match(host,/await setInstalledSidebarToolEnabled\(\{api,lockManager,tool,enabled\}\)/);
  assert.match(host,/listen\(enableButton,'click',event=>\{/);
  assert.match(host,/openSettings,toggleEnabled,openOfficialReview/);
  assert.match(installer,/sameSidebarToolPackage\(current,tool\)/);
  assert.match(installer,/TOOL_REVOCATION_EPOCHS_STORE/);
  assert.match(installer,/stopAdblockForTool\(api,tool\.id\)/);
});

test('R4.7 installed Page still uses user gesture, grants, manifest and generation',async()=>{
  const [center,page]=await Promise.all([
    readFile('src/ui/extension-center.js','utf8'),
    readFile('src/ui/installed-page-tools.js','utf8')
  ]);
  assert.match(center,/if\(!event\.isTrusted\|\|busy\|\|pendingKey\|\|row\.kind!=='page'\)return/);
  assert.match(center,/if\(find\(row\.key\)\?\.record!==row\.record\)/);
  assert.match(center,/setInstalledPageProgramEnabled\(\{api,client,row:row\.record\}\)/);
  assert.match(page,/await requireChromePermissions\(\{api,request:\{origins:installed\.pageRules\.matches\}\}\)/);
  assert.match(page,/expectedGeneration:installed\.authorization\?\.generation\?\?null/);
});

test('R4.7 accessible context menu and low frequency controls, no invented preview/install shortcut',async()=>{
  const [center,css]=await Promise.all([
    readFile('src/ui/extension-center.js','utf8'),
    readFile('src/ui/extension-center.css','utf8')
  ]);
  assert.match(center,/rowMenu\.setAttribute\('role','menu'\)/);
  assert.match(center,/b\.setAttribute\('role','menuitem'\)/);
  assert.match(center,/manage\.setAttribute\('aria-haspopup','menu'\)/);
  assert.match(center,/manage\.setAttribute\('aria-expanded','false'\)/);
  assert.match(center,/rowMenu\.hidden=false/);
  assert.match(center,/if\(event\.key==='Escape'\)\{event\.preventDefault\(\);closeRowMenu\(true\);return;\}/);
  assert.match(center,/\['ArrowDown','ArrowUp','Home','End'\]/);
  assert.match(center,/doc\.addEventListener\('scroll',onScroll,true\)/);
  assert.match(center,/if\(!row\.installed\)actions\.append\(detailButton\('审阅并安装'/);
  assert.doesNotMatch(center,/const actionName=!row\.installed/);
  assert.doesNotMatch(center,/button\('预览'/);
  assert.match(css,/\.ec-context-menu\{position:fixed;z-index:1000/);
  assert.match(css,/\.ec-row-actions\{[^}]*opacity:1;pointer-events:auto/);
});
