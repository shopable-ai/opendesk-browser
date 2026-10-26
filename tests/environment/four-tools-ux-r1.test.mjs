import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {generatePreview} from '../../scripts/preview/build-preview.mjs';

const root=new URL('../../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const ids=['markdown-workbench','web-markdown-clipper','knowledge-inbox','ai-knowledge-answers'];

test('R1.0 products retain distinct IDs, original entrypoints and their own persisted data contracts',async()=>{
 const configs=await Promise.all(ids.map(id=>read('examples/sidebar-tools/'+id+'/tool.config.json').then(JSON.parse)));
 assert.deepEqual(configs.map(x=>x.id),ids);
 const js=await Promise.all(ids.map(id=>read('examples/sidebar-tools/'+id+'/src/main.js')));
 assert.match(js[0],/browser\.downloads\.text/);
 assert.match(js[1],/currentPage\.info/);
 assert.match(js[2],/knowledge\.create/);
 assert.match(js[3],/storage\.set/);
 assert.doesNotMatch(js.join('\n'),/\b(?:localStorage|sessionStorage)\s*\./,
  'production tools may not add a second database');
});
test('R1.0 Markdown edit/preview mode controls cannot accidentally include the data-mode workspace',async()=>{
 const path='examples/sidebar-tools/markdown-workbench/src/';
 const [html,css,js]=await Promise.all(['index.html','style.css','main.js'].map(x=>read(path+x)));
 const $=load(html);
 assert.equal($('.mdw-modes button[data-mode]').length,3);
 assert.equal($('#mdw-panes[data-mode]').length,1);
 assert.match(js,/querySelectorAll\('\.mdw-modes button\[data-mode\]'\)/);
 assert.equal($('.mdw-toolbar .od-icon-button').length,2);
 assert.equal($('h1').length,0,'Host renders product title');
 assert.match(css,/^\/\* @opendesk-shared-design \*\//);
 assert.match(css,/\.mdw-inline-review\[hidden\]\{display:none!important\}/);
 assert.match(js,/下载已发起/);
});
test('R1.0 Clipper help and backups are secondary, while existing actions remain',async()=>{
 const html=await read('examples/sidebar-tools/web-markdown-clipper/src/index.html');
 const $=load(html);
 assert.equal($('.clip-brand strong').length,0);
 assert.equal($('.clip-context-help>summary').length,1);
 assert.equal($('.clip-backup-menu #clip-note-backup').length,1);
 for(const id of ['clip-fetch','clip-save','clip-note-new','clip-notes','clip-status'])
  assert.equal($('#'+id).length,1,id);
});
test('R1.0 Inbox hides secondary filters without removing old controls',async()=>{
 const html=await read('examples/sidebar-tools/knowledge-inbox/src/index.html');
 const $=load(html);
 assert.equal($('#ki-filter-panel:not([open])').length,1);
 for(const id of ['ki-search','ki-new','ki-tag-filter','ki-sort','ki-filters','ki-records','ki-active-filter']){
  if(id==='ki-filters')assert.equal($('.ki-filters').length,1);
  else assert.equal($('#'+id).length,1,id);
 }
 assert.equal($('#ki-filter-panel .ki-filters').length,1);
 assert.equal($('#ki-filter-panel #ki-sort').length,1);
 assert.equal($('#ki-storage-usage').length,1);
});
test('R1.0 AI knowledge search uses human-facing citations without pretending to be generated AI',async()=>{
 const dir='examples/sidebar-tools/ai-knowledge-answers/src/';
 const [html,js]=await Promise.all([read(dir+'index.html'),read(dir+'main.js')]);
 assert.doesNotMatch(html,/测试知识回答/);
 assert.match(html,/知识检索/);
 assert.doesNotMatch(js,/createElement\('span'\);key\.className='qa-source-id'/);
 assert.match(js,/ANSWERED_FIXED:'固定答案'/);
 assert.match(js,/RETRIEVED_ONLY:'这是检索候选，不是 AI 生成答案/);
 assert.match(js,/NO_MATCH:'本地知识没有依据/);
});
for(const id of ids){
 test('R1.0 unified source-bound preview compiles exact packaged '+id+' UI',async()=>{
  const pkg=await createSidebarToolPackage(new URL('examples/sidebar-tools/'+id+'/',root).pathname);
  const preview=await generatePreview({tool:id,scenario:'success',theme:'light',width:360,height:760});
  assert.equal(preview.manifest.tool,id);
  assert.equal(preview.manifest.toolVersion,pkg.version);
  assert.equal(preview.manifest.mock,true);
  assert.equal(preview.manifest.installed,false);
  assert.equal(preview.manifest.permissionsGranted,false);
  assert.equal(preview.manifest.viewport.width,360);
  assert.match(preview.frameHtml,/connect-src 'none'/);
  assert.match(preview.html,/sandbox="allow-scripts"/);
  assert.doesNotMatch(preview.html,/allow-same-origin/);
  assert.ok(preview.frameHtml.includes('data:text/css;base64,'+Buffer.from(pkg.css).toString('base64')));
  assert.ok(preview.frameHtml.includes('data:text/javascript;base64,'+Buffer.from(pkg.js).toString('base64')));
  for(const script of pkg.scripts||[])
   assert.ok(preview.frameHtml.includes('data:text/javascript;base64,'+Buffer.from(script.code).toString('base64')));
  assert.ok(/^[a-f0-9]{64}$/.test(preview.manifest.uiSha256));
  assert.ok(/^[a-f0-9]{64}$/.test(preview.manifest.designSha256));
 });
}
