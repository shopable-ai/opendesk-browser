import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {ItemLoader} from '../engine/browser.js';

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
