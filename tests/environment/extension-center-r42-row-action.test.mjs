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

test('R4.3 full-row main target retains trusted actions and independent floating buttons',async()=>{
  const center=await readFile('src/ui/extension-center.js','utf8');
  for(const marker of [
    "const main=button('',()=>openRow(row.key),'ec-row-main')",
    "const copy=node('span','ec-copy'),line=node('span','ec-name-line')",
    "const name=node('span','ec-name')",
    "name.append(node('span','ec-name-text',titleOf(row)))",
    "main.append(glyph,copy)",
    "const actions=node('span','ec-row-actions')",
    "actions.append(primary,manage)",
    "item.append(main,actions)",
    "main.dataset.extensionAction='main'",
    "primary.dataset.extensionAction='primary'",
    "manage.dataset.extensionAction='more'",
    "if(resolveExtensionRowIntent(row)==='detail'){openDetail(key);return;}",
    "sidebarTools.openTool(row.id)",
    "sidebarTools.openSettings(row.id)",
    "sidebarTools.openOfficialReview(row.id)",
    "restoreRowFocus(focusKey,focusAction)"
  ])assert.ok(center.includes(marker),'missing route/semantics '+marker);
  assert.match(center,/ec-action od-button od-button--secondary/);
  assert.match(center,/ec-row-more od-icon-button/);
  assert.match(center,/description\.title=description\.textContent/);
  assert.match(center,/primary\.title=primary\.getAttribute\('aria-label'\)/);
  assert.doesNotMatch(center,/item\.append\(main,primary,manage\)/,
    'actions should overlay the row, not reserve sibling grid columns');
  assert.doesNotMatch(center,/点击主要区域直接使用|点击主要区域查看详情/);
});

test('R4.3 row hover spans full item while floating buttons reveal on hover or focus',async()=>{
  const css=await readFile('src/ui/extension-center.css','utf8');
  const row=css.match(/\.ec-row\{([^}]*)\}/)?.[1]||'';
  const main=css.match(/\.ec-row-main\{([^}]*)\}/)?.[1]||'';
  const overlay=css.match(/\.ec-row-actions\{([^}]*)\}/)?.[1]||'';
  const name=css.match(/\.ec-name\{([^}]*)\}/)?.[1]||'';
  assert.match(row,/position:relative/);
  assert.match(row,/min-height:72px/);
  assert.doesNotMatch(row,/grid-template-columns/);
  assert.match(main,/width:100%/);
  assert.match(main,/grid-template-columns:34px minmax\(0,1fr\)/);
  assert.match(main,/max-width:none/);
  assert.match(main,/padding:9px 108px 9px 10px/);
  assert.doesNotMatch(main,/margin:-9px|position:absolute/);
  assert.match(overlay,/position:absolute/);
  assert.match(overlay,/opacity:0;pointer-events:none/);
  assert.match(css,/\.ec-row:hover,\.ec-row:focus-within\{background:var\(--od-muted\)\}/);
  assert.match(css,/\.ec-row:hover \.ec-row-actions,\.ec-row:focus-within \.ec-row-actions\{opacity:1;pointer-events:auto\}/);
  assert.match(css,/\.ec-row:hover \.ec-glyph,\.ec-row:focus-within \.ec-glyph\{background:var\(--od-paper\)\}/);
  assert.match(name,/min-height:34px/);
  assert.match(css,/\.ec-name-text\{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/);
  assert.match(css,/@media\(max-width:330px\)\{[\s\S]*?\.ec-row-main\{[^}]*min-height:68px/);
  assert.match(css,/@media\(max-width:240px\)\{[\s\S]*?\.ec-row-main\{[^}]*min-height:82px/);
  assert.match(css,/@media\(hover:none\),\(pointer:coarse\)\{[\s\S]*?\.ec-row-actions\{opacity:1;pointer-events:auto\}/);
  assert.match(css,/\.ec-action,\.ec-row-more\{min-width:44px;min-height:44px\}/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.ec-row-actions\{transition:none\}\}/);
  assert.match(css,/#extension-center \.ec-row-main:focus-visible\{outline-offset:-2px\}/);
});
