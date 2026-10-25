import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('R1.5 AdBlock official React has shared nested navigation without granting operations',async()=>{
  const jsx=await readFile('examples/sidebar-tools/adblock/src/App.jsx','utf8');
  assert.match(jsx,/api\.setNavigation\(\{page:view,title:titles\[view\]/);
  assert.match(jsx,/api\.setState\?\.\(\{dirty:selectorDraftDirty,busy\}\)/);
  assert.match(jsx,/opendesk-tool-navigation/);
  assert.match(jsx,/if\(selectorDraftDirty\)/);
  assert.match(jsx,/const back=sharedNavigation\?null:<IconButton/);
  assert.match(jsx,/navigationGuard\.current\|\|locked\.current/);
});
