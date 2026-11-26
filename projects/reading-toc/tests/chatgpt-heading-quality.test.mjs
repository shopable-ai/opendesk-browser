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
      get children(){return $(node).children().toArray().map(wrap);},
      isConnected:true,
      closest(selector){return wrap($(node).closest(selector)[0]);},
      matches(selector){return $(node).is(selector);},
      querySelector(selector){return wrap(selector.startsWith(':scope > ')?
        $(node).children(selector.slice(9))[0]:$(node).find(selector)[0]);},
      getAttribute(name){return $(node).attr(name)??null;},
      setAttribute(name,value){$(node).attr(name,value);},
      removeAttribute(name){$(node).removeAttr(name);},
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
// Attributes and sibling structure read from the live answer on 2026-11-08.
// CSS class hashes, URL, displayed value and label text are not classifiers.
const metric=(value,{layout='box',label='指标',id=''}={})=>`<div data-d-component="${layout}">
  <h1 ${id?`id="${id}"`:''} data-d-component="title" data-d-tabular-nums="true">${value}</h1>
  <p data-d-component="text">${label}</p></div>`;
const labels=snapshot=>snapshot.items.map(row=>row.label);

test('ChatGPT preserves year and Unicode Roman numeral chapters in answer prose',()=>{
  const keep=['年度报告','2026','Ⅰ','Ⅱ','API'];
  const {index}=fixture(answer('<h1>年度报告</h1>'+keep.slice(1).map(t=>`<h2>${t}</h2><p>章节正文</p>`).join('')));
  const snapshot=index.rebuild();
  assert.deepEqual(labels(snapshot),keep);
  assert.ok(snapshot.items.slice(1).every(row=>row.parentId===snapshot.items[0].id));
});

test('incidental assistant markup cannot replace ordinary article or Zhihu sources',()=>{
  const widget=answer('<h2>2026</h2><h3>Ⅰ</h3><h3>API</h3>');
  for(const host of ['example.org','chatgpt.com.example.org']){
    const {index}=fixture(`<main><article><h1>年度报告</h1><h2>Ⅱ</h2></article>${widget}</main>`,host);
    const snapshot=index.rebuild();
    assert.equal(snapshot.adapter,'article');
    assert.deepEqual(labels(snapshot),['年度报告','Ⅱ','2026','Ⅰ','API']);
    assert.equal(snapshot.sources.length,1);
    assert.equal(snapshot.sources[0].kind,'article');
  }
  const {index}=fixture(`<main><div class="AnswerItem"><h2>2026</h2><h3>Ⅰ</h3></div>${widget}</main>`,'www.zhihu.com');
  const snapshot=index.rebuild();
  assert.equal(snapshot.adapter,'zhihu');
  assert.deepEqual(labels(snapshot),['2026','Ⅰ']);
  assert.equal(snapshot.sources.length,1);
});

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
    ${metric('2',{label:'可用脚本'})}${metric('0',{label:'运行中'})}${metric('—',{label:'最近执行'})}
    ${chapters.slice(3).map(t=>`<h2>${t}</h2>`).join('')}${metric('97/100',{layout:'row',label:'设计方案目标评估'})}`;
  const {index}=fixture(answer(html)),snapshot=index.rebuild();
  assert.deepEqual(labels(snapshot),chapters);
  const [title,...sections]=snapshot.items;
  assert.ok(sections.every(row=>row.parentId===title.id&&row.depth===1));
  snapshot.items.forEach(row=>assert.equal(index.resolve(row.id,row.sourceId)?.label,row.label));
});

test('ChatGPT R7 keeps reply sections and excludes headings inside interactive preview buttons',()=>{
  const prose=['R7：已调整当前网站状态和统计筛选','当前对话直接查看 R7 交互',
    '预览文件和截图','评分与剩余门槛'];
  // The reported Chrome page exposes the four values as headings under
  // statistics buttons. Heading tags here style the values, not the reply.
  const preview=`<div>
    <button><h1>2</h1><span>自动检测</span></button>
    <button><h2>1</h2><span>已复核</span></button>
    <button><h2>1</h2><span>待公开</span></button>
    <button><h2>0</h2><span>异常</span></button>
    <div role="button" tabindex="0"><h2>查看结果</h2></div>
  </div>`;
  const {index}=fixture(answer(`<h2>${prose[0]}</h2><h2>${prose[1]}</h2>${preview}
    <h3>${prose[2]}</h3><h2>${prose[3]}</h2><h3>2</h3>
    <h2><button>可展开的真实章节</button></h2>`));
  const snapshot=index.rebuild();
  assert.deepEqual(labels(snapshot),[...prose,'2','可展开的真实章节']);
  assert.equal(snapshot.items[2].parentId,snapshot.items[1].id);
  assert.equal(index.resolve(snapshot.items[2].id,snapshot.sources[0].id)?.label,prose[2]);
});

test('ChatGPT R11 keeps the reply hierarchy and skips labeled values in a DIL grid',()=>{
  const [title,first,second,third,fourth,fifth]=[
    'R11 · 脚本开发导航与当前进度','一、本轮已经实际修改并提交','二、当前目录结构',
    '三、实际提交及验证结果','四、专家评分','五、R11 当前具体进展',
  ];
  const metrics=[['README 更新','2/2'],['导航链接核验','41/41'],['独立链接目标','23'],['无效文件路径','0']];
  const grid=metrics.map(([caption,value])=>`<div data-d-component="grid-item">
    <span data-d-component="caption">${caption}</span><h1 data-d-component="title"><strong>${value}</strong></h1>
  </div>`).join('');
  const {index,node}=fixture(`<div data-chatgpt-selection-conversation-id="conversation" data-chatgpt-selection-message-id="r11">
    <div data-markdown-text-style="assistant-message"><div data-dil-response>
    <h1 data-d-component="title">${title}</h1><h2>${first}</h2><h2>${second}</h2><h2>${third}</h2>
    <div data-d-component="card"><div data-d-component="grid">${grid}</div></div>
    <h2 id="review">${fourth}</h2><h2>${fifth}</h2>
    </div></div></div>`);
  const snapshot=index.rebuild();
  assert.deepEqual(labels(snapshot),[title,first,second,third,fourth,fifth]);
  const [top,...chapters]=snapshot.items;
  assert.ok(chapters.every(row=>row.parentId===top.id&&row.depth===1));
  const review=chapters[3];
  assert.equal(index.resolve(review.id,review.sourceId)?.element,node('#review'));
});

test('ChatGPT keeps real numeric headings and chapters laid out in a DIL grid',()=>{
  const {index}=fixture(answer(`<div data-dil-response>
    <h2 data-d-component="title">23</h2>
    <div data-d-component="grid">
      <div data-d-component="grid-item"><h2 data-d-component="title">2026</h2></div>
      <div data-d-component="grid-item"><span data-d-component="caption">背景</span>
        <h2 data-d-component="title">研究范围</h2><p>章节正文</p></div>
      <div data-d-component="grid-item"><span data-d-component="caption">状态</span>
        <h2 data-d-component="title">未运行</h2></div>
    </div></div>`));
  assert.deepEqual(labels(index.rebuild()),['23','2026','研究范围']);
});

test('ChatGPT keeps the latest reply sections and nests its inline Writing prompt under section four',()=>{
  const [one,two,three,four]=['一、本轮继续修复的关键结果','二、实际测试与尚未完成的交付',
    '三、当前专家评分','四、本地 Codex 测试、修复与验收提示词'];
  const goal='GOAL：OpenDesk Browser · 提示词快捷按钮单行操作浮层修复与真实验收';
  const caption=text=>'<span data-d-component="caption">'+text+'</span>';
  const text=value=>'<p data-d-component="text">'+value+'</p>';
  const value=(label,tabular=false)=>'<h1 data-d-component="title"'+
    (tabular?' data-d-tabular-nums="true"':'')+'>'+label+'</h1>';
  const cell=(label,metric,note)=>'<div data-d-component="grid-item"><div data-d-component="card">'+
    caption(label)+value(metric,true)+caption(note)+'</div></div>';
  const response=(id,content)=>
    '<div data-chatgpt-selection-message-id="'+id+'" data-chatgpt-selection-conversation-id="conv">'+
    '<div data-markdown-text-style="assistant-message"><div data-dil-response>'+content+'</div></div></div>';
  const first=response('earlier','<h2>四、UI 专家评分</h2><div data-d-component="row" data-d-direction="row">'+
    value('97.0',true)+'<div data-d-component="box" data-d-direction="col">'+
    text('综合设计自评')+caption('满分 100 · 六项算术平均')+'</div></div>');
  const {index,node}=fixture(first+response('latest',
    '<h2>'+one+'</h2><h2 id="second">'+two+'</h2>'+text('测试正文')+
    '<div data-d-component="grid">'+cell('局部 Chromium 测试','14 / 14','全部通过')+
    cell('测试宽度范围','180–440 px','鼠标与触屏模式')+
    '<div data-d-component="grid-item"><div data-d-component="card">'+caption('章节')+
    '<h2 data-d-component="title" data-d-tabular-nums="true">2026</h2>'+caption('更新')+text('章节正文')+'</div></div></div>'+
    '<h2 id="third">'+three+'</h2><div data-d-component="box" data-d-direction="col">'+
    '<div data-d-component="row" data-d-direction="row">'+text('评分项')+text('分值')+'</div>'+
    '<div data-d-component="divider"></div><div data-d-component="row" data-d-direction="row">'+
    text('综合设计自评')+'<div data-d-component="spacer"></div>'+value('97.2 / 100')+'</div></div>'+
    '<h2>'+four+'</h2>'+text('以下为交给 Codex 的提示词。')+
    '<div data-client-defined-widget="writing_block"><div class="group/writing-block-surface">'+
    '<div class="ProseMirror" contenteditable="true"><h1 id="goal">'+goal+'</h1><h2>一、原始目标</h2>'+
    '<h2>二、尚未完成的关键任务</h2><h3>P0-1：核对最新源码</h3></div></div></div>'+
    '<h3>第四节续文</h3><h2>第五节</h2>'));
  const snapshot=index.rebuild();
  const latest=snapshot.items.filter(item=>item.sourceId===snapshot.sources[1].id);
  assert.deepEqual(labels(snapshot),['四、UI 专家评分',one,two,'2026',three,four,goal,
    '一、原始目标','二、尚未完成的关键任务','P0-1：核对最新源码','第四节续文','第五节']);
  const [,second,,third,fourth,prompt,original,remaining,task,continued,fifth]=latest;
  assert.deepEqual([second,third,fourth,prompt,original,remaining,task,continued,fifth].map(item=>[item.depth,item.parentId]),
    [[0,null],[0,null],[0,null],[1,fourth.id],[2,prompt.id],[2,prompt.id],[3,remaining.id],
      [1,fourth.id],[0,null]]);
  for(const [item,selector] of [[second,'#second'],[third,'#third'],[prompt,'#goal']]){
    assert.equal(index.resolve(item.id,item.sourceId)?.element,node(selector));
  }
});

test('ChatGPT distinguishes metric components from prose without text or language thresholds',()=>{
  const values=['2','0','—','97/100','１２３','9.5 / 10','９７／１００','98%','3.14','−42','---','★★★','🚀','2026','Ⅰ','N/A'];
  const keep=[...values,'UI','API','AI','C++','准备','结论','一、方案','2026 年计划','R2','第 2 章','Résumé','日本語','한국어','العربية','Δ'];
  for(const host of ['chatgpt.com','chat.openai.com']){
    const {index}=fixture(answer(values.map(value=>metric(value)).join('')+keep.map(t=>`<h2>${t}</h2>`).join('')),host);
    assert.deepEqual(labels(index.rebuild()),keep);
  }
});

test('tabular formatting or a layout container alone does not exclude a real heading',()=>{
  const {index}=fixture(answer(`<h2 data-d-tabular-nums="true">2026</h2>
    <h2 data-d-component="title" data-d-tabular-nums="true">Ⅰ</h2>
    <div data-d-component="box"><h2>Ⅱ</h2><p data-d-component="text">正文</p></div>
    <div data-d-component="row"><h2 data-d-component="title" data-d-tabular-nums="true">API</h2></div>`));
  assert.deepEqual(labels(index.rebuild()),['2026','Ⅰ','Ⅱ','API']);
});

test('noise is removed before the 300 useful-heading limit',()=>{
  const {index}=fixture(answer(metric('0').repeat(310)+'<h2>API</h2>'+
    Array.from({length:305},(_,i)=>`<h2>章节 ${i}</h2>`).join('')));
  const snapshot=index.rebuild();
  assert.equal(snapshot.items.length,300);
  assert.equal(snapshot.items[0].label,'API');
  assert.equal(snapshot.items.at(-1).label,'章节 298');
});

test('noise cannot create an empty answer, a parent or a cross-answer navigation target',()=>{
  const {index}=fixture(answer(metric('0'))+
    answer(metric('2')+'<h2>API</h2>'+metric('—')+'<h3>UI</h3>')+
    answer('<h2>API</h2><h3>UI</h3>'+metric('97/100',{layout:'row'})));
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

test('dynamic metric/prose changes keep DOM identity but reject removed navigation targets',()=>{
  const {index,node}=fixture(answer(metric('0',{id:'streamed'})));
  const heading=node('#streamed');
  assert.deepEqual(index.rebuild().items,[]);
  assert.deepEqual(index.snapshot().sources,[]);
  heading.removeAttribute('data-d-tabular-nums');
  heading.textContent='2026';
  const item=index.rebuild().items[0];
  assert.equal(item.label,'2026');
  heading.textContent='API';
  assert.equal(index.rebuild().items[0].id,item.id);
  heading.setAttribute('data-d-tabular-nums','true');
  assert.deepEqual(index.rebuild().items,[]);
  assert.deepEqual(index.snapshot().sources,[]);
  assert.equal(index.resolve(item.id,item.sourceId),null);
  heading.removeAttribute('data-d-tabular-nums');
  heading.textContent='Ⅰ';
  assert.equal(index.rebuild().items[0].id,item.id);
  heading.isConnected=false;
  assert.deepEqual(index.rebuild().items,[]);
  assert.equal(index.resolve(item.id,item.sourceId),null);
});

test('Writing card short titles remain available and the composer stays excluded',()=>{
  const {index}=fixture(`<div class="group/writing-block-surface"><div class="ProseMirror" contenteditable="true">
    <h1>UI</h1><h2>2026</h2><h2>Ⅰ</h2><h2>API</h2></div></div>
    <form><div class="group/writing-block-surface"><div class="ProseMirror" contenteditable="true"><h1>输入草稿</h1></div></div></form>`);
  const snapshot=index.rebuild();
  assert.deepEqual(labels(snapshot),['UI','2026','Ⅰ','API']);
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
