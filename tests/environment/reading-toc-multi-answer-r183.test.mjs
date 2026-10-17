import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {generatePreview} from '../../scripts/preview/build-preview.mjs';

// Evaluate the REAL two renderers' visibility expressions. A CSS-only fix
// cannot pass: with three sources the full mode must return all eight items.
const sidebarPath='examples/sidebar-tools/reading-toc/src/main.js';
const overlayPath='src/reading-toc/view.js';
const data=[
 {id:'h-20',sourceId:'s-1',label:'回答一 H1',depth:0},
 {id:'h-21',sourceId:'s-1',label:'重复标题',depth:1},
 {id:'h-22',sourceId:'s-1',label:'同回答第二个 H1',depth:0},
 {id:'h-23',sourceId:'s-1',label:'第三个 H2',depth:1},
 {id:'h-24',sourceId:'s-2',label:'回答二 H1',depth:0},
 {id:'h-25',sourceId:'s-2',label:'重复标题',depth:1},
 {id:'h-26',sourceId:'s-3',label:'回答三 H1',depth:0},
 {id:'h-27',sourceId:'s-3',label:'重复标题',depth:1}
];
const sourceOf=async file=>readFile(file,'utf8');
function presentation(source,kind,adapter,mode,items=data){
 const match=source.match(kind==='sidebar'
  ? /const shown=([\s\S]*?);\n  const key=/
  : /const show=([\s\S]*?);\n    const key=/);
 assert(match,'presentation expression must remain source-bound for '+kind);
 const selected='s-2',scoped=items.filter(item=>item.sourceId===selected);
 const active=scoped[0],current=active;
 const expression=match[1];
 const isChatFull=adapter==='chatgpt'&&mode==='full';
 const context={items,scoped,active,current,isChatFull,mode,
   displayMode:mode,overviewShowsAll:true,overviewIds:new Set(scoped.map(item=>item.id)),
   compact:false};
 const shown=vm.runInNewContext('('+expression+')',context);
 return Array.from(shown,item=>({id:item.id,sourceId:item.sourceId,label:item.label}));
}
function boundaryCount(source,kind,shown,mode,adapter){
 const match=source.match(kind==='sidebar'
  ? /if\((isChatFull&&index>0&&shown\[index-1\]\.sourceId!==item\.sourceId)\)li\.classList\.add\('toc-answer-start'\)/
  : /if\((isChatFull&&index>0&&show\[index-1\]\.sourceId!==item\.sourceId)\)li\.classList\.add\('answer-start'\)/);
 assert(match,'non-focusable CSS boundary must be attached to the actual first heading: '+kind);
 const isChatFull=adapter==='chatgpt'&&mode==='full';
 return shown.filter((item,index)=>vm.runInNewContext(match[1],{isChatFull,index,item,shown,show:shown})).length;
}
test('R1.8.3 both official renderers show every assistant turn ONLY in ChatGPT full mode',async()=>{
 const [sidebar,overlay]=await Promise.all([sourceOf(sidebarPath),sourceOf(overlayPath)]);
 for(const [kind,source] of [['sidebar',sidebar],['overlay',overlay]]){
  for(const n of [1,2,3]){
   const subset=data.filter(item=>['s-1','s-2','s-3'].slice(0,n).includes(item.sourceId));
   const full=presentation(source,kind,'chatgpt','full',subset);
   assert.deepEqual(full.map(row=>row.id),subset.map(row=>row.id),kind+' returns all '+n+' turns');
   assert.equal(boundaryCount(source,kind,full,'full','chatgpt'),n-1,kind+' '+n+' turns');
  }
  for(const adapter of ['article','zhihu']){
   const result=presentation(source,kind,adapter,'full');
   assert.deepEqual(result.map(row=>row.id),['h-24','h-25'],kind+' keeps '+adapter+' source-scoped');
   assert.equal(boundaryCount(source,kind,result,'full',adapter),0);
  }
  for(const mode of ['top','focus']){
   const result=presentation(source,kind,'chatgpt',mode);
   assert.deepEqual(result.map(row=>row.id),['h-24','h-25']);
   assert.equal(boundaryCount(source,kind,result,mode,'chatgpt'),0);
  }
  const withEmptyRemoved=data.filter(row=>row.sourceId!=='s-2');
  const full=presentation(source,kind,'chatgpt','full',withEmptyRemoved);
  assert.equal(boundaryCount(source,kind,full,'full','chatgpt'),1,'no empty source produces a line');
  assert.equal(full.filter(row=>row.label==='重复标题').length,2,'same label in separate turns is preserved');
  assert.notEqual(full[1].id,full[full.length-1].id,'duplicate text has independent target');
 }
});
test('R1.8.3 preview supports three genuine source IDs without modifying approved tool toolbar',async()=>{
 const [sidebar,overlay,styles,prototype]=await Promise.all([
  sourceOf(sidebarPath),sourceOf(overlayPath),
  sourceOf('examples/sidebar-tools/reading-toc/src/style.css'),
  sourceOf('examples/sidebar-tools/reading-toc/preview/reading-toc-r183-chatgpt-multi-preview.html')
 ]);
 assert.match(sidebar,/source\.hidden=true/,'the old source selector stays hidden');
 assert.match(overlay,/modes\.hidden=compact&&!modeExplicit&&!\(adapter==='chatgpt'&&sources\.length>1\)/,
  'full mode remains selectable when an active answer happens to be short');
 assert.match(styles,/li\.toc-answer-start\{border-top:1px solid/);
 assert.match(prototype,/const records=\[\['overview',1,'sectionOverview','s-1'\]/);
 assert.match(prototype,/const records=.*'s-3'/);
 assert.match(prototype,/mode='full',state='guest'/);
 const generated=await generatePreview({tool:'reading-toc',surface:'side-panel',
   scenario:'chatgpt-multi',theme:'light',width:360});
 assert.equal(generated.manifest.scenario,'chatgpt-multi');
 assert(generated.frameHtml.includes('Y2hhdGdwdC1tdWx0aQ')||generated.frameHtml.includes('chatgpt-multi'));
 assert(generated.manifest.mock&& !generated.manifest.installed);
 const overlayPreview=await generatePreview({tool:'reading-toc',surface:'page-overlay',
   scenario:'chatgpt-multi',theme:'light',width:360});
 assert.equal(overlayPreview.manifest.trustedOverlaySourceSha256.length,64);
 assert(overlayPreview.html.includes('value="chatgpt-multi" selected'));
});
