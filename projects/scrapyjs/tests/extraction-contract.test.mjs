import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {ItemLoader} from '../engine/browser.js';
import '../src/app-model.js';
import {parseProposal,changes} from '../src/ai-config.js';
import {resolveAiReply,resolveConfigurationEditScope,assertConfigurationEditScope} from '../src/ai-actions.js';

// Independent golden records; execute the serialized callback in a DOM realm,
// never pass the field DSL to Locator CSS. This is component evidence only.
const html=`<section data-list="中文::目录">
  <article><h1>甲 &amp; 乙</h1><a data-key="a::b" href="/detail?id=一&amp;x=2">同名</a>
    <span class="tag">A</span><span class="tag">B</span></article>
  <article><h1>第二行</h1><a data-key="a::b" href="/detail?id=二">同名</a></article>
</section><section><h1>外部同名容器</h1><a href="/wrong">同名</a></section>`;
const config={_listContainer:'[data-list="中文::目录"]',_listItem:'article',
  title:'h1::text',href:'a[data-key="a::b"]::href',
  tags:{selector:'.tag',read:'text',cardinality:'many'},
  optional:'.missing::title',nested:{name:{selector:'a',read:'text',cardinality:'one'}}};
function page(){
  const {document}=parseHTML(html);
  return {evaluate:async(callback,...args)=>vm.runInNewContext(`(${callback.toString()})(...args)`,{document,args})};
}
test('serialized ItemLoader preserves row scope, special characters, nesting and empty values',async()=>{
  assert.deepEqual(JSON.parse(JSON.stringify(await ItemLoader.parse(page(),config,false))),[
    {title:'甲 & 乙',href:'/detail?id=一&x=2',tags:['A','B'],optional:'',nested:{name:'同名'}},
    {title:'第二行',href:'/detail?id=二',tags:[],optional:'',nested:{name:'同名'}}
  ]);
});
test('field one cardinality rejects duplicates instead of silently selecting a tag',async()=>{
  await assert.rejects(ItemLoader.parse(page(),{...config,tags:{selector:'.tag',read:'text',cardinality:'one'}},false),
    {code:'E_ITEMLOADER_CARDINALITY'});
});

// Rules below are supplied by the test. They exercise validation/extraction,
// not model inference or the model's choice of a concise representation.
test('supplied book title shorthand reaches extraction intact and reads full attributes rather than abbreviated text',async()=>{
  const source=`<h3><a title="Outside the list" href="/outside">Outside</a></h3>
    <article class="product_pod"><h3><a title="A Light in the Attic" href="catalogue/a-light-in-the-attic_1000/index.html">A Light in the ...</a></h3><p class="price_color">£51.77</p></article>
    <article class="product_pod"><h3><a title="Tipping the Velvet" href="catalogue/tipping-the-velvet_999/index.html">Tipping the Velvet</a></h3><p class="price_color">£53.74</p></article>`;
  const url='https://books.toscrape.com/',before={url:'',itemConfig:{}};
  const validate=globalThis.ScrapyAppModel.validateConfig;
  const scope=resolveConfigurationEditScope('请采集当前页每本书的完整书名、价格和书籍链接。',before,{page:{url}});
  assert.equal(scope.type,'create');
  const expected=[
    {title:'A Light in the Attic',price:'£51.77',url:'catalogue/a-light-in-the-attic_1000/index.html'},
    {title:'Tipping the Velvet',price:'£53.74',url:'catalogue/tipping-the-velvet_999/index.html'}
  ];
  // Keep descriptor compatibility, including cardinality that a string cannot express.
  for(const title of ['h3 a::title',{selector:'h3 a',read:'attr',attr:'title'},
    {selector:'h3 a',read:'attr',attr:'title',cardinality:'many'}]){
    const candidate={url,itemConfig:{_listItem:'article.product_pod',title,price:'.price_color::text',url:'h3 a::href'},maxPages:1};
    const parsed=parseProposal(JSON.stringify(candidate),validate,url);
    assert.deepEqual(parsed,candidate);
    const reply=resolveAiReply({type:'config.proposal',config:parsed},{base:before,expectedUrl:url,validate,changes,hasSample:true});
    assertConfigurationEditScope(scope,before,reply.config,validate);
    assert.deepEqual(reply.config,candidate);
    const {document}=parseHTML(source);
    const rows=await ItemLoader.parse({evaluate:async(callback,...args)=>
      vm.runInNewContext(`(${callback.toString()})(...args)`,{document,args})},reply.config.itemConfig,false);
    const golden=typeof title==='object'&&title.cardinality==='many'
      ?expected.map(row=>({...row,title:[row.title]})):expected;
    assert.deepEqual(JSON.parse(JSON.stringify(rows)),golden);
  }
  assert.deepEqual(before,{url:'',itemConfig:{}},'proposals never mutate the original draft');
});
