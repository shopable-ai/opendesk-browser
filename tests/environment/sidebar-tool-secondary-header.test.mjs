// R40 signed official secondary toolbar: source contract and safe fallback.
// Node/static source tests do not claim a live Chrome file-picker result.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeToolNavigation} from '../../src/sidebar-tools/navigation-state.js';

const read=path=>readFile(path,'utf8');
test('R40 navigation keeps old hints and rejects unbounded or forged secondary action',()=>{
  assert.deepEqual(normalizeToolNavigation({page:'index',title:'列表',canBack:false,primary:'new'}),
    {page:'index',title:'列表',canBack:false,primary:'new'});
  const transfer=normalizeToolNavigation({page:'index',title:'提示词快捷按钮',canBack:false,
    primary:'new',secondary:'transfer',secondaryExpanded:true});
  assert.equal(transfer.secondary,'transfer');
  assert.equal(transfer.secondaryExpanded,true);
  assert(Object.isFrozen(transfer));
  for(const extra of [
    {secondary:'delete'}, {secondary:'transfer',secondaryExpanded:'true'},
    {secondaryExpanded:true},{secondary:'transfer',secondaryExpanded:true,arbitrary:'chrome.cookies'},
    {secondary:'transfer',secondaryExpanded:false,provider:'trusted'}
  ])assert.equal(normalizeToolNavigation({page:'index',title:'列表',canBack:false,...extra}),null);
});
test('R40 Host owns header trigger but sandbox retains actual file and export gestures',async()=>{
  const [tool,toolCSS,bridge,host,react,hostCSS,sharedCSS,preview]=await Promise.all([
    read('examples/sidebar-tools/prompt-shortcuts/src/main.js'),
    read('examples/sidebar-tools/prompt-shortcuts/src/style.css'),
    read('src/sidebar-tools/bridge.js'),read('src/ui/sidebar-tools.js'),
    read('src/ui/react/tabs/tool-host.tsx'),read('src/ui/tool-shell.css'),
    read('src/ui/design-system.css'),
    read('examples/sidebar-tools/prompt-shortcuts/preview/index.html')
  ]);
  assert.match(tool,/secondary:'transfer'/);
  assert.match(tool,/action==='secondary'&&mode==='index'/);
  assert.match(tool,/el\('ps-import-file'\)\.click\(\)/);
  assert.match(tool,/request\('user\.export'/);
  assert.match(bridge,/navigationAllowed&&\(\['back','primary'\]/);
  assert.match(host,/requestBusinessNavigation\('secondary'\)/);
  assert.match(react,/id="sidebar-tool-secondary-action"/);
  assert.match(toolCSS,/\.ps\.ps-host-nav \.ps-head\{position:absolute/);
  assert.match(toolCSS,/\.ps\.ps-host-nav #ps-new,\.ps\.ps-host-nav #ps-transfer/);
  assert.match(hostCSS,/\.sidebar-tool-view-head\{[^\n]*gap:var\(--space-1\)/);
  assert.match(sharedCSS,/\.od-page-head \.od-icon-button\{border-color:transparent;background:transparent/);
  assert.match(preview,/Side Panel 交互预览 R4\.1/);
});
