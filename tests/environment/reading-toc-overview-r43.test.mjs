import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectReadingTocOverview,TOC_OVERVIEW_TARGET,TOC_OVERVIEW_LIMIT}
  from '../../src/reading-toc/overview.js';
import {createReadingTocIndex} from '../../src/reading-toc/model.js';
import {readingTocDisplayMode} from '../../src/reading-toc/view.js';
import {officialToolFixture,officialFixtures} from '../helpers/official-tools.mjs';
import {compileToolLocaleCatalog} from '../../src/ui/app-localization.js';

const root=id=>({id,sourceId:'s-1',depth:0,parentId:null,topId:id,label:id});
const child=(parent,n)=>({id:parent.id+'-'+n,sourceId:'s-1',depth:parent.depth+1,
  parentId:parent.id,topId:parent.topId,label:'小节 '+n});

test('R4.3 single H1 automatically includes H2 children, never just one heading',()=>{
  const top=root('a'),rows=[top,...Array.from({length:5},(_,i)=>child(top,i))];
  const result=selectReadingTocOverview(rows,rows.at(-1).id);
  assert.equal(TOC_OVERVIEW_TARGET,5);
  assert.deepEqual(result.ids,rows.map(r=>r.id));
  assert.equal(result.depth,1);
  assert.equal(result.representedId,rows.at(-1).id,'active visible H2 highlights itself');
  assert.equal(result.hiddenCount,0);
});

test('R4.3 five H1 keep only H1, while sparse H2-only trees expand deeper',()=>{
  const roots=Array.from({length:5},(_,i)=>root('r'+i));
  const many=roots.flatMap(r=>[r,child(r,0),child(r,1)]);
  const result=selectReadingTocOverview(many,'r4-1');
  assert.deepEqual(result.ids,roots.map(r=>r.id));
  assert.equal(result.representedId,'r4');
  assert.equal(result.depth,0);
  const h2=root('h2'),h3=child(h2,1),h4=child(h3,1),h5=child(h4,1),h6=child(h5,1);
  const sparse=selectReadingTocOverview([h2,h3,h4,h5,h6],h6.id);
  assert.deepEqual(sparse.ids,[h2,h3,h4,h5].map(x=>x.id));
  assert.equal(sparse.depth,3,'do not auto-expand unboundedly');
  assert.equal(sparse.representedId,h5.id,'hidden deep item highlights nearest visible parent');
});

test('R4.3 overflow stays bounded, keeps all scarce roots and balances branch sampling',()=>{
  const roots=Array.from({length:3},(_,i)=>root('section'+i));
  const rows=roots.flatMap(top=>[top,...Array.from({length:20},(_,i)=>child(top,i))]);
  const summary=selectReadingTocOverview(rows,'section2-19');
  assert.equal(summary.ids.length,TOC_OVERVIEW_LIMIT);
  assert.equal(summary.hiddenCount,rows.length-TOC_OVERVIEW_LIMIT);
  assert.equal(summary.representedId,'section2-19',
    'long outline keeps the actual active H2 visible instead of falling back to its H1');
  assert(summary.ids.includes('section2-19'));
  const shown=new Set(summary.ids);
  for(const top of roots){
    assert(shown.has(top.id),'all roots remain represented');
    assert(rows.some(item=>item.parentId===top.id&&shown.has(item.id)),
      'do not let the first root consume every child slot');
  }
  for(const item of rows.filter(item=>shown.has(item.id)&&item.depth>0))
    assert(shown.has(item.parentId),'never orphan a displayed heading');
  assert.deepEqual(summary.ids,rows.filter(item=>shown.has(item.id)).map(item=>item.id));
});

test('R4.3 even 50 H2 rows show an explicit remainder, but no invented headings',()=>{
  const top=root('only'),rows=[top,...Array.from({length:50},(_,i)=>child(top,i))];
  const overview=selectReadingTocOverview(rows,rows.at(-1).id);
  assert.equal(overview.ids.length,12);
  assert.equal(overview.hiddenCount,39);
  assert.equal(overview.representedId,rows.at(-1).id);
  assert(overview.ids.includes(rows.at(-1).id),'the active late chapter is kept in the summary');
  assert(overview.ids.includes(rows.at(-2).id),'neighbor before the active chapter gives reading context');
  assert.deepEqual(selectReadingTocOverview([top],top.id).ids,[top.id],
    'when the page truly has one heading the outline must not invent entries');
  assert.deepEqual(selectReadingTocOverview([]).ids,[]);
});

test('R4.3 trusted index publishes per-answer overview, parent identity and stable duplicates',()=>{
  const assistantA={type:'assistant'},assistantB={type:'assistant'};
  const headings=[...['H1','H2','H2','H1','H2'].map((tag,i)=>({tagName:tag,textContent:'重复',parentElement:assistantA})),
    ...['H1','H2','H3'].map((tag,i)=>({tagName:tag,textContent:'重复',parentElement:assistantB}))];
  for(const node of headings){
    node.isConnected=true;node.getClientRects=()=>[1];
    node.closest=sel=>sel==='[data-message-author-role="assistant"]'?node.parentElement:null;
  }
  const doc={body:{},defaultView:{getComputedStyle:()=>({display:'block',visibility:'visible'})},
    querySelector:sel=>sel==='[data-message-author-role="assistant"]'?assistantA:null,
    querySelectorAll:()=>headings};
  const index=createReadingTocIndex(doc),first=index.rebuild();
  assert.equal(first.sources.length,2);
  const [sourceA,sourceB]=first.sources.map(row=>row.id);
  assert.deepEqual(first.overview[sourceA].ids,first.items.filter(item=>item.sourceId===sourceA).map(item=>item.id));
  assert.deepEqual(first.overview[sourceB].ids,first.items.filter(item=>item.sourceId===sourceB).map(item=>item.id));
  assert.equal(first.items[1].parentId,first.items[0].id);
  assert.notEqual(first.items[1].id,first.items[2].id,'duplicate labels do not collide');
  const active=index.snapshot(first.items.at(-1).id);
  assert.equal(active.overview[sourceB].representedId,active.activeId);
  assert.equal(active.overview[sourceA].representedId,first.items[0].id);
  headings[2].textContent='改写后的重复';
  const rebuilt=index.rebuild();
  assert.deepEqual(rebuilt.items.map(x=>x.id),first.items.map(x=>x.id));
  assert(!rebuilt.overview[sourceA].ids.some(id=>rebuilt.overview[sourceB].ids.includes(id)));
});

test('R4.3 installed tool has the same adaptive UI source and a discoverable patch update',async()=>{
  const [config,bundled,host,html,css,js]=await Promise.all([
    readFile('examples/sidebar-tools/reading-toc/tool.config.json','utf8').then(JSON.parse),
    officialToolFixture('reading-toc'),
    readFile('src/ui/sidebar-tools.js','utf8'),
    readFile('examples/sidebar-tools/reading-toc/src/index.html','utf8'),
    readFile('examples/sidebar-tools/reading-toc/src/style.css','utf8'),
    readFile('examples/sidebar-tools/reading-toc/src/main.js','utf8')
  ]);
  const release=(await officialFixtures()).catalog.apps.find(row=>row.toolId==='reading-toc');
  assert.equal(config.version,release.version);
  assert.equal(bundled.version,release.version);
  assert.match(host,/officialToolStatus/);
  assert.match(html,/章节概览/);
  assert.match(html,/data-toc-mode="focus"[^>]*aria-pressed="true"/);
  assert.match(html,/data-toc-mode="top"[^>]*aria-pressed="false"/);
  assert.match(js,/let mode='focus'/);
  assert(js.includes('data.overview?.[selected]'));
  assert.equal(bundled.html,html);
  assert.equal(bundled.css,css);
  const locales=compileToolLocaleCatalog(JSON.parse(await readFile(
    'examples/sidebar-tools/reading-toc/locales.json','utf8')));
  assert.equal(bundled.js,js.replace('__OPENDESK_TOOL_MESSAGES__',JSON.stringify(locales)));
  assert(!bundled.js.includes('__OPENDESK_TOOL_MESSAGES__'),'runtime gets fixed, verified offline translations');
});

test('R4.4 moving through long H2 headings keeps the current section visible without losing the main structure',()=>{
  const first=root('one'),headings=[first,...Array.from({length:20},(_,i)=>child(first,i))];
  for(const active of [headings[1],headings[8],headings[15],headings[20]]){
    const summary=selectReadingTocOverview(headings,active.id);
    assert.equal(summary.ids.length,TOC_OVERVIEW_LIMIT,'bounded summary avoids a huge overlay');
    assert(summary.ids.includes(first.id),'the only H1 remains navigable');
    assert(summary.ids.includes(active.id),'the reading position should never disappear');
    assert.equal(summary.representedId,active.id,'highlight follows the visible active item');
    const chosen=new Set(summary.ids);
    assert.deepEqual(summary.ids,headings.filter(item=>chosen.has(item.id)).map(item=>item.id),
      'the selected IDs keep the actual document order');
  }
  const foreign=selectReadingTocOverview(headings,'foreign-source');
  assert.equal(foreign.ids.length,TOC_OVERVIEW_LIMIT);
  assert.equal(foreign.representedId,first.id,'another answer must not hijack this source');
});

test('R4.4 deeply nested late headings keep their parent chain while capped',()=>{
  const main=root('main');
  const group=child(main,0);
  const deep=Array.from({length:30},(_,i)=>child(group,i));
  const headings=[main,group,...deep];
  const result=selectReadingTocOverview(headings,deep.at(-1).id);
  assert.equal(result.depth,2);
  assert.equal(result.ids.length,TOC_OVERVIEW_LIMIT);
  assert(result.ids.includes(group.id),'show the parent H2');
  assert(result.ids.includes(deep.at(-1).id),'pin the active H3');
  assert.equal(result.representedId,deep.at(-1).id);
  assert(result.ids.includes(deep.at(-2).id),'show the nearby H3 for context');
  const selected=new Set(result.ids);
  for(const row of headings.filter(item=>selected.has(item.id)&&item.parentId))
    assert(selected.has(row.parentId),'all visible deep chapters have a visible parent');
});

test('R1.5 compact overlay never overwrites an explicitly chosen reading mode',()=>{
  for(const mode of ['top','focus','full']){
    assert.equal(readingTocDisplayMode(mode,false,false),mode);
    assert.equal(readingTocDisplayMode(mode,false,true),mode);
    assert.equal(readingTocDisplayMode(mode,true,true),mode,
      'short outline must retain the user-selected mode across snapshot updates');
  }
  assert.equal(readingTocDisplayMode('focus',true,false),'top',
    'automatic short-outline overview remains the initial product behavior');
  assert.equal(readingTocDisplayMode('focus',false,false),'focus',
    'longer outlines return to focus without losing the preference');
});
