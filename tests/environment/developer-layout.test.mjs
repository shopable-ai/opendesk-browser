import {renderSidebarFixture,loadSidebarReact} from '../helpers/sidebar-react-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
const {createDeveloperView}=await loadSidebarReact();
const view=createDeveloperView();
view.patchDependencies('classic',{visible:true,entries:[],locks:[],selectedLockId:'',status:'',review:null});
const [html,css,editor,design]=await Promise.all([
  renderSidebarFixture({developerView:view}),readFile('src/ui/tool-shell.css','utf8'),
  readFile('src/ui/script-editor.js','utf8'),readFile('src/ui/design-system.css','utf8')]);
view.dispose();const $=load(html),dev=$('#workbench-develop');
test('Dev has one live run-status row and keeps technical identity below results',()=>{
  assert.equal($('#developer-run-feedback[role=status][aria-live=polite]').length,1);
  assert.match($('#script-status').text(),/正在连接公共运行入口/);
  assert.ok($('#script-task-status').is('[hidden]'));
  assert.notEqual($('#script-task-status').attr('role'),'status');
  assert.ok(html.indexOf('id="developer-results-panel"')<html.indexOf('id="developer-run-technical"'));
  assert.match(editor,/display\('results', focused \? '任务状态：' : '已读取持久结果'\)/);
  assert.match(editor,/patchDeveloperField\(view,taskStatus,\{hidden:state !== 'results' \|\| !taskStatus.textContent\}\)/);
});
test('Dev editor retains readable minimum and user resizing',()=>{
  assert.equal($('#script-source').attr('rows'),'6');
  assert.match(css,/#script-source\{[^}]*min-height:216px;height:clamp\(216px,32vh,320px\);max-height:max\(216px,70vh\)/);
  assert.match(css,/#script-source\{[^}]*resize:vertical|textarea\{[^}]*resize:vertical/);
});
test('Dev disclosures inherit shared typography and content inset',()=>{
  assert.ok($('#developer-results-panel').hasClass('developer-results'));
  assert.ok($('#developer-results-panel').hasClass('od-disclosure'));
  assert.match(design,/\.od-disclosure>summary\{[^}]*font-weight:650/);
  assert.match(design,/\.od-disclosure>:not\(summary\)\{[^}]*max-width:calc\(100% - var\(--space-3\) - var\(--space-3\)\);margin:var\(--space-2\) var\(--space-3\) 0/);
  assert.doesNotMatch(css,/#workbench-develop \.developer-editor>details>summary\{/);
  assert.match(css,/\.developer-run-feedback\{display:flex;align-items:baseline;flex-wrap:wrap/);
  assert.doesNotMatch(css,/#workbench-develop \.developer-editor \.row\{margin:0\}/);
  assert.match(css,/\.row:not\(\.od-disclosure>\.row\)\{margin:0\}/);
});
test('Develop primary cards and nested diagnostics retain their shared hierarchy',()=>{
  for(const id of ['developer-target-detail','manual-project-params-tools','developer-results-panel',
    'developer-run-technical','page-preview-tools','script-library-tools','script-advanced','tool-diagnostics','local-project-params-tools']){
    assert.equal($('details#'+id).length,1,id);assert.ok($('#'+id).hasClass('od-disclosure'),id);
    assert.ok(!$('#'+id).hasClass('od-disclosure--flat'),id);
  }
  assert.ok($('#local-project-diagnostics').closest('details').hasClass('od-disclosure--flat'));
  for(const id of ['script-history-panel','page-dependency-panel','program-generated'])assert.ok($('#'+id).hasClass('od-disclosure--flat'),id);
  assert.match(design,/\.od-disclosure\{[^}]*border:1px solid var\(--od-line\);[^}]*background:var\(--od-paper\)/);
  assert.match(css,/#workspace-content #workbench-develop\{display:grid;gap:var\(--space-4\)/);
  assert.match(css,/#workbench-develop \.developer-editor\{display:grid;gap:var\(--space-4\)/);
  assert.match(design,/\.od-disclosure>summary\{[^}]*min-height:44px/);
  assert.doesNotMatch(css,/#tool-diagnostics>section\{/);
});
test('Advanced tools follow parameters and retain SDK authority actions',()=>{
  const body=dev.html();assert.ok(body.indexOf('id="manual-project-params-tools"')<body.indexOf('id="tool-diagnostics"'));
  assert.equal($('#tool-diagnostics>summary').text(),'高级诊断与网页 SDK');
  for(const id of ['developer-sdk-diagnostics','developer-health-diagnostics'])assert.ok($('#'+id).hasClass('od-disclosure--flat'));
  assert.equal($('#scraping-panel').attr('aria-label'),'采集模块');assert.ok($('#scraping-panel').is('[hidden]'));
  for(const id of ['sdk-install','sdk-inspect','sdk-revoke','sdk-approval-preview','create-target','check-source','check-target'])assert.equal($('#tool-diagnostics #'+id).length,1,id);
  assert.match(css,/#workbench-develop #sdk-capabilities\{display:grid;gap:var\(--space-2\)/);
  assert.doesNotMatch(css,/#scraping-panel\{border-left/);
});
