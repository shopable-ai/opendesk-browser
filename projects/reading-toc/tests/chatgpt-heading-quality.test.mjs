import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {createReadingTocIndex} from '../trusted/model.js';

// Real CSS selection/ancestry with explicit synthetic layout. This fixture
// exercises the index, not Chrome geometry or content-script authorization.
function fixture(html,host='chatgpt.com'){
  const $=load(html),nodes=new WeakMap();
  const wrap=node=>{
    if(!node)return null;
    if(!nodes.has(node))nodes.set(node,{
      get tagName(){return node.name?.toUpperCase();},
      get textContent(){return $(node).text();},
      set textContent(text){$(node).text(text);},
      get parentElement(){return wrap(node.parent);},
      isConnected:true,
      closest(selector){return wrap($(node).closest(selector)[0]);},
      matches(selector){return $(node).is(selector);},
      getAttribute(name){return $(node).attr(name)??null;},
      getClientRects(){return this.isConnected?[{}]:[];},
      getBoundingClientRect(){return {top:0};},
    });
    return nodes.get(node);
  };
  const doc={body:wrap($('body')[0]),location:{hostname:host},
    defaultView:{getComputedStyle:()=>({display:'block',visibility:'visible'})},
    querySelector:selector=>wrap($(selector)[0]),
    querySelectorAll:selector=>$(selector).toArray().map(wrap),
  };
  return {doc,index:createReadingTocIndex(doc),node:selector=>wrap($(selector)[0])};
}
const answer=content=>`<div data-message-author-role="assistant"><div class="markdown">${content}</div></div>`;
const labels=snapshot=>snapshot.items.map(row=>row.label);

test('ChatGPT Web Flow sample keeps the document title and six chapters, excluding four display values',()=>{
  const chapters=[
    'OpenDesk Browser · Web Flow UI 重构方案',
    '一、问题已定位到具体代码',
    '二、推荐的新界面结构',
    '三、运行状态应该怎样展示？',
    '四、正式实现需要修改的源码',
    '五、为什么现在的 preview 与实际安装界面可能不同？',
    '六、专家方案评分与反方审计',
  ];
  const html=`<h1>${chapters[0]}</h1><h2>${chapters[1]}</h2><h2>${chapters[2]}</h2>
    <h1>2</h1><h2>0</h2><h3>—</h3>${chapters.slice(3).map(t=>`<h2>${t}</h2>`).join('')}<h1>97/100</h1>`;
  const {index}=fixture(answer(html)),snapshot=index.rebuild();
  assert.deepEqual(labels(snapshot),chapters);
  const [title,...sections]=snapshot.items;
  assert.ok(sections.every(row=>row.parentId===title.id&&row.depth===1));
  snapshot.items.forEach(row=>assert.equal(index.resolve(row.id,row.sourceId)?.label,row.label));
});

test('ChatGPT discards number, score and symbol headings while retaining short and multilingual titles',()=>{
  const noise=['2','0','—','97/100',' １２３ ','9.5 / 10','９７／１００','98%','3.14','−42','---','★★★','🚀','\u200b'];
  const keep=['UI','API','AI','C++','准备','结论','一、方案','2026 年计划','R2','第 2 章','Résumé','日本語','한국어','العربية','Δ'];
  for(const host of ['chatgpt.com','chat.openai.com']){
    const {index}=fixture(answer([...noise,...keep].map(t=>`<h2>${t}</h2>`).join('')),host);
    assert.deepEqual(labels(index.rebuild()),keep);
  }
});

test('noise is removed before the 300 useful-heading limit',()=>{
  const {index}=fixture(answer('<h2>0</h2>'.repeat(310)+'<h2>API</h2>'+
    Array.from({length:305},(_,i)=>`<h2>章节 ${i}</h2>`).join('')));
  const snapshot=index.rebuild();
  assert.equal(snapshot.items.length,300);
  assert.equal(snapshot.items[0].label,'API');
  assert.equal(snapshot.items.at(-1).label,'章节 298');
});

test('noise cannot create an empty answer, a parent or a cross-answer navigation target',()=>{
  const {index}=fixture(answer('<h1>0</h1>')+
    answer('<h1>2</h1><h2>API</h2><h1>—</h1><h3>UI</h3>')+
    answer('<h2>API</h2><h3>UI</h3><h1>97/100</h1>'));
  const snapshot=index.rebuild();
  assert.deepEqual(labels(snapshot),['API','UI','API','UI']);
  assert.equal(snapshot.sources.length,2);
  const [a,childA,b,childB]=snapshot.items;
  assert.equal(childA.parentId,a.id);
  assert.equal(childB.parentId,b.id);
  assert.notEqual(a.id,b.id);
  assert.notEqual(a.sourceId,b.sourceId);
  assert.equal(index.resolve(a.id,b.sourceId),null);
  assert.equal(index.resolve(a.id,a.sourceId)?.label,'API');
});

test('streaming a heading between noise and text rebuilds without stale targets or empty sources',()=>{
  const {index,node}=fixture(answer('<h2 id="streamed">0</h2>'));
  const heading=node('#streamed');
  assert.deepEqual(index.rebuild().items,[]);
  assert.deepEqual(index.snapshot().sources,[]);
  heading.textContent='UI';
  const item=index.rebuild().items[0];
  heading.textContent='API';
  assert.equal(index.rebuild().items[0].id,item.id);
  heading.textContent='97/100';
  assert.deepEqual(index.rebuild().items,[]);
  assert.deepEqual(index.snapshot().sources,[]);
  assert.equal(index.resolve(item.id,item.sourceId),null);
  heading.textContent='结论';
  assert.equal(index.rebuild().items[0].id,item.id);
  heading.isConnected=false;
  assert.deepEqual(index.rebuild().items,[]);
  assert.equal(index.resolve(item.id,item.sourceId),null);
});

test('Writing card short titles remain available and the composer stays excluded',()=>{
  const {index}=fixture(`<div class="group/writing-block-surface"><div class="ProseMirror" contenteditable="true">
    <h1>UI</h1><h2>0</h2><h2>API</h2></div></div>
    <form><div class="group/writing-block-surface"><div class="ProseMirror" contenteditable="true"><h1>输入草稿</h1></div></div></form>`);
  const snapshot=index.rebuild();
  assert.deepEqual(labels(snapshot),['UI','API']);
  assert.equal(snapshot.sources.length,1);
  assert.match(snapshot.sources[0].label,/写作内容/);
});

test('numeric headings on ordinary articles and Zhihu retain their existing behavior',()=>{
  for(const [host,html] of [
    ['example.org','<main><article><h1>2026</h1><h2>0</h2><h3>97/100</h3></article></main>'],
    ['www.zhihu.com','<div class="AnswerItem"><h1>2026</h1><h2>0</h2><h3>97/100</h3></div>'],
  ]){
    const {index}=fixture(html,host);
    assert.deepEqual(labels(index.rebuild()),['2026','0','97/100']);
  }
});
