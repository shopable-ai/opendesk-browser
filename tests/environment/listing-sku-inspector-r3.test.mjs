import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {readListing,inspectListing,FIXTURE_SELECTOR,FIXTURE_URL} from '../../examples/programs/listing-sku-inspector/src/listing.js';
import {renderInspector} from '../../examples/programs/listing-sku-inspector/src/view.js';

const project='examples/programs/listing-sku-inspector';
const valid=()=>({title:'灯具',description:'简单描述',parentSku:'LAMP-001',
  variants:[{sku:'LAMP-RED',option:'红色',price:'12.80',stock:'3'},
    {sku:'LAMP-BLUE',option:'蓝色',price:'18.00',stock:'0'}],source:{kind:'local-fixture'}});
const control=value=>({tagName:'INPUT',value});
function fixture(data=valid(),{missing='',repeat=false,count=1}={}){
  const rows=data.variants.map(variant=>({querySelectorAll(selector){
    const key=/data-listing-field="([^"]+)"/.exec(selector)?.[1];
    return key===missing?[]:key in variant?[control(variant[key])]:[];
  }}));
  const scope={querySelectorAll(selector){
    if(selector==='[data-listing-variant]')return rows;
    const key=/data-listing-field="([^"]+)"/.exec(selector)?.[1];
    return key===missing?[]:key in data?[control(data[key])]:[];
  }};
  return {defaultView:{location:new URL(FIXTURE_URL)},querySelectorAll(selector){
    assert.equal(selector,FIXTURE_SELECTOR);
    return Array.from({length:count},()=>scope);
  }};
}

test('P2 reads only the exact authorized local fixture, strips whitespace and preserves variant row order',()=>{
  const data=valid();data.title='  新商品  ';
  const actual=readListing(fixture(data));
  assert.equal(actual.title,'新商品');
  assert.equal(actual.variants[1].sku,'LAMP-BLUE');
  assert.deepEqual(actual.source,{kind:'local-fixture',url:FIXTURE_URL});
  assert.deepEqual(inspectListing(actual),{status:'ok',errors:0,warnings:0,variants:2,issues:[],source:'local-fixture'});
});

test('P2 rejects wrong URL, absent/ambiguous fixture and malformed field instead of scanning full page',()=>{
  const elsewhere=fixture();elsewhere.defaultView.location=new URL('https://seller.example.test/item');
  assert.throws(()=>readListing(elsewhere),{code:'E_LISTING_SCOPE'});
  const otherPort=fixture();otherPort.defaultView.location=new URL('http://127.0.0.1:43112/demo-form.html');
  assert.throws(()=>readListing(otherPort),{code:'E_LISTING_SCOPE'});
  assert.throws(()=>readListing(fixture(valid(),{count:0})),{code:'E_LISTING_FIXTURE'});
  assert.throws(()=>readListing(fixture(valid(),{count:2})),{code:'E_LISTING_FIXTURE'});
  assert.throws(()=>readListing(fixture(valid(),{missing:'title'})),{code:'E_LISTING_FIELD'});
  const overlong=valid();overlong.title='x'.repeat(257);
  assert.throws(()=>readListing(fixture(overlong)),{code:'E_LISTING_VALUE'});
  const huge=valid();huge.variants=Array.from({length:31},()=>({...huge.variants[0]}));
  assert.throws(()=>readListing(fixture(huge)),{code:'E_LISTING_LIMIT'});
});

test('P2 reports missing title and SKU with actionable field identifiers',()=>{
  const data=valid();data.title='';data.parentSku='';data.variants[1].sku='';
  const report=inspectListing(data);
  assert.equal(report.errors,3);
  assert.deepEqual(report.issues.map(x=>x.code),['TITLE_REQUIRED','PARENT_SKU_REQUIRED','VARIANT_SKU_REQUIRED']);
  assert.equal(report.issues[2].field,'variants[1].sku');
});

test('P2 finds duplicate parent/variant SKU and duplicate normalized variant options',()=>{
  const data=valid();data.variants[0].sku=' lamp-001 ';
  data.variants[1].sku=' LAMP-001';data.variants[1].option=' 红色 ';
  const report=inspectListing(data);
  assert.equal(report.issues.filter(x=>x.code==='DUPLICATE_SKU').length,2);
  assert.equal(report.issues.filter(x=>x.code==='DUPLICATE_OPTION').length,1);
});

test('P2 distinguishes invalid positive money and stock formats from warnings',()=>{
  const data=valid();data.variants[0].price='0';data.variants[0].stock='-1';
  data.variants[1].price='12.345';data.variants[1].stock='4.2';
  data.description='';data.title='标题'.repeat(70);
  const report=inspectListing(data);
  assert.equal(report.errors,4);assert.equal(report.warnings,2);
  assert.deepEqual(report.issues.filter(x=>x.severity==='error').map(x=>x.code),
    ['INVALID_PRICE','INVALID_STOCK','INVALID_PRICE','INVALID_STOCK']);
  const noVariants=valid();noVariants.variants=[];
  assert.equal(inspectListing(noVariants).issues[0].code,'VARIANTS_EMPTY');
  assert.throws(()=>inspectListing({variants:null}),{code:'E_LISTING_DATA'});
});

class Element extends EventTarget{
  constructor(tag,doc){super();this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];
    this.textContent='';this.className='';this.dataset={};this.attributes={};}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(k,v){this.attributes[k]=v;}
  click(){this.dispatchEvent(new Event('click'));}
}
function uiHarness(){
  const doc={createElement(tag){return new Element(tag,doc);}};
  const content=doc.createElement('div');let destroyed=0;
  const ui={content,on:(target,type,fn)=>target.addEventListener(type,fn),destroy:()=>{destroyed++;}};
  const find=(cls,node=content)=>{
    if(node.className?.split(' ').includes(cls))return node;
    for(const child of node.children){const result=find(cls,child);if(result)return result;}
    return null;
  };
  return {ui,find,get destroyed(){return destroyed;}};
}

test('P2 real panel button is the only read trigger; success, error and close are visible and safe',()=>{
  const h=uiHarness();let reads=0;let broken=false;const data=valid();
  renderInspector(h.ui,{read:()=>{reads++;if(broken)throw Object.assign(Error('标记区域缺失'),{code:'E_LISTING_FIXTURE'});return data;},
    inspect:inspectListing});
  assert.equal(reads,0,'mount must never scrape immediately');
  assert.match(h.find('listing-status').textContent,/尚未读取/);
  const btn=h.find('listing-run');assert.equal(btn.type,'button');btn.click();
  assert.equal(reads,1);assert.match(h.find('listing-status').textContent,/0 项错误/);
  data.variants[1].sku='LAMP-RED';btn.click();
  assert.equal(h.find('listing-issues').children.length,1);
  assert.match(h.find('listing-status').textContent,/1 项错误/);
  broken=true;btn.click();
  assert.equal(h.find('listing-issues').children.length,0,'stale results must be cleared');
  assert.match(h.find('listing-status').textContent,/E_LISTING_FIXTURE/);
  assert.equal(h.find('listing-status').dataset.state,'error');
  h.find('listing-close').click();assert.equal(h.destroyed,1);
});

test('P2 project remains existing Page USER_SCRIPT with isolated CSS and official standard demo page',async()=>{
  const meta=JSON.parse(await readFile(project+'/package.json','utf8')).opendesk;
  assert.equal(meta.runtimeKind,'page-userscript');assert.equal(meta.pageRules.world,'USER_SCRIPT');
  assert.deepEqual(meta.pageRules.matches,['http://127.0.0.1/*']);
  assert.equal(meta.pageRules.allFrames,false);
  const main=await readFile(project+'/src/main.js','utf8');
  assert.match(main,/createPageUI/);assert.match(main,/renderInspector/);
  const css=await readFile(project+'/assets/ui.css','utf8');
  assert.match(css,/\.listing-issues/);
  const html=await readFile('examples/tasks/demo-form.html','utf8');
  assert.match(html,/id="listing-sku-fixture"/);
  assert.match(html,/data-opendesk-listing-fixture="seller-listing-v1"/);
  assert.match(html,/EXP005_FIXTURE_START/);
  assert.match(html,/data-listing-preset/);
  assert.doesNotMatch(html,/<script[^>]+src=/);
});


test('P2 the actual local page preset buttons switch valid/missing/duplicate/variant inputs',async()=>{
  const html=await readFile('examples/tasks/demo-form.html','utf8');
  const source=html.match(/\/\/ EXP005_FIXTURE_START\n([\s\S]*?)\n\s*\/\/ EXP005_FIXTURE_END/)?.[1];
  assert.ok(source,'Fixture code must live in the canonical inline script');
  const data=valid();
  const keys=['title','description','parentSku'];
  const top=Object.fromEntries(keys.map(key=>[key,control(data[key])]));
  const rows=data.variants.map(variant=>({fields:Object.fromEntries(
    Object.keys(variant).map(key=>[key,control(variant[key])]))}));
  const buttons=['valid','missing','duplicate','variant'].map(name=>({
    name,listener:null,addEventListener(type,fn){assert.equal(type,'click');this.listener=fn;},
    getAttribute(){return this.name;},click(){this.listener();}
  }));
  const scope={querySelectorAll(selector){
    if(selector==='[data-listing-variant]')return rows.map(({fields})=>({
      querySelector(pattern){return fields[/data-listing-field="([^"]+)"/.exec(pattern)[1]];}
    }));
    if(selector==='[data-listing-preset]')return buttons;
    throw Error('unexpected '+selector);
  },querySelector(pattern){return top[/data-listing-field="([^"]+)"/.exec(pattern)[1]];}};
  const feedback={textContent:''};
  const doc={querySelector(){return scope;},getElementById(id){assert.equal(id,'listing-fixture-scenario');return feedback;}};
  runInNewContext(source,{document:doc,structuredClone},{filename:'listing-sku-fixture.js'});
  assert.equal(top.title.value,'便携式阅读灯 · 暖白色');
  assert.equal(rows[1].fields.sku.value,'READ-COOL-02');
  buttons[1].click();assert.equal(top.title.value,'');assert.equal(rows[1].fields.sku.value,'');
  buttons[2].click();assert.match(rows[1].fields.sku.value,/read-warm-01/);
  buttons[3].click();assert.equal(rows[1].fields.stock.value,'-1');
  buttons[0].click();assert.equal(rows[1].fields.stock.value,'12');
  assert.match(feedback.textContent,/正常商品/);
});
