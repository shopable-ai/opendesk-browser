import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkSidebarToolProjectPackage} from '../../scripts/build-sidebar-tool.mjs';

const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');

test('R1.2 SOURCE_ONLY: official catalog and full-height scope are explicit',async()=>{
  const catalog=JSON.parse(await read('official-tools/catalog.json'));
  assert.equal(catalog.tools.length,12,'official-tools/catalog.json remains the live authoritative tool list');
  const ids=new Set(catalog.tools.map(row=>row.id));
  for(const id of ['bookmark-manager','markdown-workbench','knowledge-inbox',
    'web-markdown-clipper','cookie-editor'])assert.ok(ids.has(id),id);
  const host=await read('src/ui/sidebar-tools.js');
  assert.ok(host.includes('const FULL_HEIGHT_OFFICIAL_TOOLS=new Set(['));
  for(const id of ['markdown-workbench','knowledge-inbox','web-markdown-clipper','cookie-editor']){
    assert.ok(host.includes("'"+id+"'"),id);
  }
  for(const id of ['quick-notes','prompt-shortcuts','reading-toc','time-review',
    'stay-focus','adblock','ai-vip-share'])assert.ok(ids.has(id),id);
  assert.ok(host.includes('approvedNavigation&&FULL_HEIGHT_OFFICIAL_TOOLS.has(tool.id)'),
    'catalog-byte verification must precede full-height admission');
  assert.ok(host.includes('matchesOfficialRelease(release,tool)'),
    'forged same-ID packages cannot opt in');
});

test('R1.2 SOURCE_ONLY: all workspace height ownership remains scoped to one Host',async()=>{
  const [hostCss,controller,bridge]=await Promise.all([
    read('src/ui/tool-shell.css'),read('src/ui/sidebar-tools.js'),
    read('src/sidebar-tools/bridge.js')
  ]);
  assert.ok(hostCss.includes('#sidebar-tool-frame[data-official-workspace="true"]>.sidebar-tool-iframe'));
  assert.ok(hostCss.includes('[data-bookmark-trusted="true"],[data-official-workspace="true"]'));
  assert.ok(controller.includes('observer.disconnect()'));
  assert.ok(controller.includes('delete frameRoot.dataset.officialWorkspace'));
  assert.ok(controller.includes("layoutMode:mode"));
  assert.ok(controller.includes("if(frameRoot.dataset?.officialWorkspace==='true'){sendToolAvailableHeight();return;}"),
    'intrinsic child resize must not replace verified flex frame dimensions');
  assert.ok(bridge.includes("message.instance===instance&&message.toolId===toolId"));
  assert.ok(bridge.includes("root.dataset.opendeskHeightMode='workspace'"));
  assert.ok(bridge.includes("message.availableHeight>=80&&message.availableHeight<=1600"));
  for(const id of ['markdown-workbench','knowledge-inbox','web-markdown-clipper']){
    const css=await read('examples/sidebar-tools/'+id+'/src/style.css');
    assert.ok(css.includes('#tool-root[data-opendesk-height-mode="workspace"]'),id);
  }
  const prompt=await read('examples/sidebar-tools/prompt-shortcuts/src/style.css');
  assert.ok(!prompt.includes('min-height:100vh'),'prompt list stays naturally content-sized');
});

test('R1.2 BUILDER: checked-in standalone installers must match the current formal sources',async()=>{
  for(const [id,version] of [
    ['web-markdown-clipper','1.2.8'],['prompt-shortcuts','1.1.9']
  ]){
    const base='examples/sidebar-tools/'+id;
    const result=await checkSidebarToolProjectPackage(base);
    assert.equal(result.status,'PROJECT_PACKAGE_MATCH',id);
    assert.equal(result.version,version,id);
  }
});

test('R1.2 SOURCE_ONLY: working area changes bump formal official tool versions',async()=>{
  for(const [id,version] of [
    ['markdown-workbench','1.0.4'],['knowledge-inbox','1.2.9'],
    ['web-markdown-clipper','1.2.8'],['prompt-shortcuts','1.1.9']
  ]){
    const cfg=JSON.parse(await read('examples/sidebar-tools/'+id+'/tool.config.json'));
    assert.equal(cfg.version,version,id);
  }
});
