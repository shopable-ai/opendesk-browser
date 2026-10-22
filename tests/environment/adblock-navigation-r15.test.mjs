import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('R1.5 AdBlock official React has shared nested navigation without granting operations',async()=>{
  const [jsx,cfg]=await Promise.all([
    readFile('examples/sidebar-tools/adblock/src/App.jsx','utf8'),
    readFile('examples/sidebar-tools/adblock/tool.config.json','utf8').then(JSON.parse)
  ]);
  assert.equal(cfg.version,'1.2.3');
  assert.match(jsx,/api\.setNavigation\(\{page:view,title:titles\[view\]/);
  assert.match(jsx,/api\.setState\?\.\(\{dirty:selectorDraftDirty,busy\}\)/);
  assert.match(jsx,/opendesk-tool-navigation/);
  assert.match(jsx,/if\(selectorDraftDirty\)/);
  assert.match(jsx,/const back=sharedNavigation\?null:<IconButton/);
  assert.match(jsx,/navigationGuard\.current\|\|locked\.current/);
});

test('R1.2 AdBlock normal-operation copy matches one-click DNR write/readback',async()=>{
  const [jsx,host]=await Promise.all([
    readFile('examples/sidebar-tools/adblock/src/App.jsx','utf8'),
    readFile('examples/sidebar-tools/adblock/trusted/tool-host.js','utf8')
  ]);
  assert.match(jsx,/正在提交设置并核对 Chrome 规则/);
  assert.doesNotMatch(jsx,/请在可信宿主中确认此次操作/);
  // Advanced CSS changes retain their trusted approval; routine controls do not.
  assert.match(host,/\['adblock\.cosmetic\.add','adblock\.cosmetic\.replace'\]/);
  assert.match(host,/return requestBrowserClick\(\{toolId:ADBLOCK_ID/);
  assert.match(host,/const latest=await send\('adblock\.status',\{\}\)/);
  assert.match(host,/canApply\(operation,payload,latest\)/);
  assert.match(host,/return send\(operation,payload\)/);
});
