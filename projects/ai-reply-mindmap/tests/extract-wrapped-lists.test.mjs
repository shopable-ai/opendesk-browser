import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {extractAnswerTree} from '../src/extract.js';

const fixture=readFileSync(new URL('./fixtures/extract-wrapped-lists.html',import.meta.url),'utf8');
const extract=html=>extractAnswerTree(parseHTML(`<html><body>${html}</body></html>`).document.body);
const flatten=node=>[node,...node.children.flatMap(flatten)];
const shape=node=>[node.title,node.kind,node.children.map(shape)];

test('real candidate 6 transparent DIVs preserve three levels, sibling order and ownership',()=>{
  const {tree,nodeCount,truncated}=extract(fixture);
  assert.deepEqual(tree.children.map(shape),[
    ['确认时间与人员','list',[
      ['选择周六或周日的上午时段','list',[
        ['提前查看天气预报，避开雨天和高温','list',[]]]],
      ['组织 2–3 位朋友同行','list',[
        ['确认集合时间、地点与联系方式','list',[]]]]]],
    ['整理随身物品','list',[
      ['准备水、轻食、防晒霜和纸巾','list',[
        ['携带 10 张纸巾、充足饮水及垃圾袋','list',[]]]],
      ['检查电子设备','list',[
        ['手机充满电，开启地图导航与紧急联系人','list',[]]]]]]
  ]);
  assert.equal(nodeCount,10);
  assert.equal(truncated,false);
  assert.deepEqual(flatten(tree).slice(1).map(n=>n.depth),[1,2,3,2,3,1,2,3,2,3]);
  assert.equal(new Set(flatten(tree).map(n=>n.id)).size,11);
});

test('mixed UL/OL, wrapped PRE and TABLE belong to the nearest LI exactly once',()=>{
  const {tree,nodeCount}=extract(`<ol><li><div><p>父 Parent 1</p><section>
    <ul><li><div>中文 <a href="https://example.com">English 42 链接</a><div>
      <ol><li><div>末级 3</div></li></ol></div></div></li></ul>
    <div><pre><code>const answer = 42;</code></pre>
      <table><tr><td>甲</td><td>Beta 2</td></tr></table></div>
    <ol><li>尾项 4</li></ol>
  </section></div></li><li>同级 5</li></ol>`);
  assert.deepEqual(tree.children.map(shape),[
    ['父 Parent 1','ordered',[
      ['中文 English 42 链接','list',[
        ['末级 3','ordered',[]]]],
      ['表格','table',[
        ['甲 ｜ Beta 2','row',[]]]],
      ['尾项 4','ordered',[]]]],
    ['同级 5','ordered',[]]
  ]);
  assert.equal(tree.children[0].content,'const answer = 42;');
  assert.equal(nodeCount,7);
});

test('hidden and skipped subtrees cannot leak titles or nested structures into lists',()=>{
  const {tree,nodeCount}=extract(`<ul><li><div><p>可见 <a>English 2026</a>
    <span hidden>隐藏标题</span><span aria-hidden="true">隐藏文字</span>
    <button>按钮文字<ul><li>按钮子项</li></ul></button>
    <script>private script</script><style>private style</style>
    <span contenteditable="true">编辑文字</span>
    <span data-opendesk-chatgpt-mindmap>导图自身</span></p>
    <div hidden><ul><li>隐藏子项</li></ul></div>
    <div aria-hidden="true"><pre>隐藏代码</pre><table><tr><td>隐藏表格</td></tr></table></div>
    <div><ul><li hidden>隐藏 LI</li><li aria-hidden="true">隐藏 LI 2</li>
      <li><span>保留链接 <a>Link 7</a></span></li></ul></div>
  </div></li></ul>`);
  assert.deepEqual(tree.children.map(shape),[
    ['可见 English 2026','list',[
      ['保留链接 Link 7','list',[]]]]
  ]);
  assert.equal(tree.children[0].content,undefined);
  assert.equal(nodeCount,2);
});

test('long own title retains bounded notes without stealing descendant titles or code',()=>{
  const long='中文 English 123 链接 😀 '.repeat(100);
  const {tree,truncated}=extract(`<ul><li><div><p>${long}</p><div>
    <ul><li>独立后代</li></ul><pre>只属于代码 notes</pre>
  </div></div></li></ul>`);
  const parent=tree.children[0];
  assert.equal(Array.from(parent.title).length,72);
  assert.ok(parent.content.startsWith(long.slice(0,200)));
  assert.ok(parent.content.length<=1200);
  assert.ok(!/[\uD800-\uDBFF]$/.test(parent.content));
  assert.ok(!parent.content.includes('独立后代'));
  assert.equal(parent.children[0].title,'独立后代');
  assert.equal(parent.children[0].content,undefined);
  assert.equal(truncated,true);
});

test('wrapped lists retain node and semantic depth limits',()=>{
  const wide=extract(`<ul>${Array.from({length:240},(_,i)=>`<li><div>项目 ${i}</div></li>`).join('')}</ul>`);
  assert.equal(wide.nodeCount,159);
  assert.equal(wide.truncated,true);
  let html='终点';
  for(let i=12;i>0;i--)html=`<ul><li><div><p>层 ${i}</p><div>${html}</div></div></li></ul>`;
  const deep=extract(html);
  assert.equal(deep.nodeCount,8);
  assert.equal(Math.max(...flatten(deep.tree).map(n=>n.depth)),8);
  assert.equal(deep.truncated,true);
});

test('wrapped code notes retain the total storage budget',()=>{
  const html=`<ul>${Array.from({length:30},(_,i)=>`<li><div>项目 ${i}<div><pre>${'😀'.repeat(1000)}</pre></div></div></li>`).join('')}</ul>`;
  const {tree,truncated}=extract(html);
  const nodes=flatten(tree);
  assert.equal(nodes.reduce((n,item)=>n+(item.content?.length||0),0),22000);
  assert.ok(nodes.every(n=>(n.content?.length||0)<=1200));
  assert.ok(nodes.every(n=>!/[\uD800-\uDBFF]$/.test(n.content||'')));
  assert.equal(truncated,true);
});
