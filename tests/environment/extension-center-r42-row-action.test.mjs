import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {composeExtensionEntries,resolveExtensionRowIntent} from '../../src/ui/extension-center-model.js';

test('R4.2 enabled installed app launches its installed package; missing app opens detail',()=>{
  const installed={id:'notes',title:'Notes',description:'编辑笔记',version:'1.0.0'};
  const latest={toolId:'notes',packageTitle:'Notes',description:'新版',version:'1.1.0'};
  const missing={toolId:'mind-map',packageTitle:'Mind Map',description:'思维导图',version:'1.0.0',installationPolicy:'preinstalled'};
  const rows=composeExtensionEntries({installed:[installed],official:[latest,missing]});
  assert.equal(rows.find(row=>row.id==='notes').update,true);
  assert.equal(resolveExtensionRowIntent(rows.find(row=>row.id==='notes')),'launch');
  assert.equal(resolveExtensionRowIntent(rows.find(row=>row.id==='mind-map')),'detail');
  assert.equal(resolveExtensionRowIntent(null),'detail');
  assert.equal(resolveExtensionRowIntent({installed:true,kind:'unknown',enabled:true}),'detail');
});

test('R4.2 disabled apps use existing settings; Pages are always managed',()=>{
  for(const enabled of [false,undefined])
    assert.equal(resolveExtensionRowIntent({installed:true,kind:'app',enabled}),'settings');
  for(const enabled of [true,false])
    assert.equal(resolveExtensionRowIntent({installed:true,kind:'page',enabled}),'detail');
});

test('R4.2 row main button wraps icon/title/description and preserves independent actions',async()=>{
  const center=await readFile('src/ui/extension-center.js','utf8');
  for(const marker of [
    "const main=button('',()=>openRow(row.key),'ec-row-main')",
    "const name=node('span','ec-name')",
    "name.append(node('span','ec-name-text',titleOf(row)))",
    "main.append(glyph,copy)",
    "item.append(main,primary,manage)",
    "main.dataset.extensionAction='main'",
    "primary.dataset.extensionAction='primary'",
    "manage.dataset.extensionAction='more'",
    "if(resolveExtensionRowIntent(row)==='detail'){openDetail(key);return;}",
    "sidebarTools.openTool(row.id)",
    "sidebarTools.openSettings(row.id)",
    "sidebarTools.openOfficialReview(row.id)",
    "restoreRowFocus(focusKey,focusAction)"
  ])assert.ok(center.includes(marker),'missing route/semantics '+marker);
  assert.doesNotMatch(center,/const name=button\(titleOf\(row\)/);
  assert.doesNotMatch(center,/点击主要区域直接使用|点击主要区域查看详情/);
});

test('R4.2 compact row keeps 72/68/82px minimums, touch action and keyboard focus',async()=>{
  const css=await readFile('src/ui/extension-center.css','utf8');
  const row=css.match(/\.ec-row\{([^}]*)\}/)?.[1]||'';
  const main=css.match(/\.ec-row-main\{([^}]*)\}/)?.[1]||'';
  const name=css.match(/\.ec-name\{([^}]*)\}/)?.[1]||'';
  assert.match(row,/min-height:72px/);
  assert.match(row,/grid-template-columns:minmax\(0,1fr\) auto 34px/);
  assert.match(main,/grid-template-columns:34px minmax\(0,1fr\)/);
  assert.match(main,/max-width:none/);
  assert.match(main,/margin:-9px -8px -9px -10px/);
  assert.doesNotMatch(main,/position:absolute/);
  assert.match(name,/min-height:34px/);
  assert.match(css,/\.ec-name-text\{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/);
  assert.match(css,/@media\(max-width:330px\)\{[^\n]*\.ec-row\{[^}]*min-height:68px/);
  assert.match(css,/\.ec-row\{grid-template-columns:26px minmax\(0,1fr\) 34px;gap:4px;min-height:82px\}/);
  assert.match(css,/@media\(pointer:coarse\)\{\.ec-row\{grid-template-columns:minmax\(0,1fr\) auto 44px\}/);
  assert.match(css,/#extension-center \.ec-row-main:focus-visible\{outline-offset:-2px\}/);
});
