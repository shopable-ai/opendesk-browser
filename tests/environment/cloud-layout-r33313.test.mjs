import {renderSidebarFixture} from '../helpers/sidebar-react-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
const read=p=>readFile(p,'utf8');

test('R33.3.13 official Cloud Header has one title and the two original icon actions',async()=>{
  const html=await renderSidebarFixture(),$=load(html);
  const head=$('#workbench-cloud .cloud-panel-head');
  assert.equal(head.length,1);
  assert.equal(head.children('.od-page-title').length,1);
  assert.equal(head.children('.od-page-title').text().trim(),'云控');
  assert.deepEqual(head.find('button').map((_,node)=>$(node).attr('id')).get(),
    ['cloud-open-console','cloud-overview-refresh']);
  assert.equal(head.find('p,.hint,#cloud-my-state').length,0);
  for(const id of ['cloud-open-console','cloud-overview-refresh']){
    assert.ok($('#'+id).attr('title'));
    assert.ok($('#'+id).attr('aria-label'));
    assert.equal($('#'+id+' svg').attr('aria-hidden'),'true');
  }
  assert.equal($('#workbench-cloud #cloud-my-state').length,1);
  assert.equal($('#workbench-cloud .cloud-diagnostics #cloud-my-state').length,1);
  assert.equal($('#cloud-overview-state[role=status]').length,1);
  assert.equal($('#cloud-hosting #cloud-brief').length,1);
  assert.equal($('#cloud-hosting>summary #cloud-brief').length,0);
  for(const id of ['cloud-overview-connection','cloud-overview-tasks',
    'cloud-overview-provider','cloud-overview-host','cloud-overview-slot',
    'cloud-overview-requests','cloud-approve','cloud-request-open-result',
    'cloud-client-create','cloud-unpair'])
    assert.equal($('#'+id).length,1,id);
});

test('R33.3.13 adaptive Cloud display preserves CloudHosting and Preview owners',async()=>{
  const [css,host,react,adapter,builder]=await Promise.all([
    read('src/ui/tool-shell.css'),read('src/ui/cloud-hosting.js'),
    read('src/ui/react/main.tsx'),
    read('src/ui/react/preview/sidebar-six-preview.tsx'),
    read('scripts/preview/build-sidebar-six-react-preview.mjs')
  ]);
  assert.match(css,/\.cloud-panel-head>\.cloud-panel-actions\{[^}]*flex-wrap:nowrap/);
  assert.match(css,/#workbench-cloud \.cloud-overview-secondary\{[^}]*grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,200px\),1fr\)\)/);
  assert.match(css,/\.cloud-overview-metrics\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.equal((host.match(/onRefresh:\(\)=>action\(\(\)=>\{\},true\)/g)||[]).length,2);
  assert.match(await read('src/ui/react/tabs/cloud.tsx'),/onConfigure:\(\)=>setPairingOpen\(true\)/);
  assert.match(host,/onApprove:\(\)=>action\(approve\)/);
  assert.match(host,/onUnpair:\(\)=>action\(async\(\)=>/);
  assert.match(react,/renderCloudOverview\(next\)/);
  assert.match(adapter,/UI_PREVIEW_ONLY/);
  assert.match(adapter,/data-preview-cloud-scenario/);
  assert.match(adapter,/cloudScenarios\[cloudScenario\]/);
  for(const key of ['unpaired','ready','approval','disconnected','error','unknown'])
    assert.match(adapter,new RegExp('  '+key+':\\{brief:'));
  for(const id of ['cloud-approve','cloud-stop','cloud-pair','cloud-unpair',
    'cloud-client-create','cloud-client-copy','cloud-request-open-result'])
    assert.ok(adapter.includes("'"+id+"'"),id);
  assert.match(builder,/src\/ui\/sidepanel\.html/);
  assert.match(builder,/src\/ui\/react\/main\.tsx/);
  assert.match(builder,/app=mountSidebarApp\(document,\{debugEnabled:true,onNavigate/);
  assert.doesNotMatch(builder,/src\/ui\/react\/preview\/sidebar-six-preview\.tsx/);
});
