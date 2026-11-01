import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {globSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,dirname} from 'node:path';
import {runInspection} from '../controller/inspect-page.js';

// Prefer the project's installation; this workspace also has an existing npx
// cache copy. Reuse it without installing or changing package dependencies.
const require=createRequire(import.meta.url);
let JSDOM;
try{({JSDOM}=require('jsdom'));}
catch(error){
  const cached=globSync(join(homedir(),'.npm/_npx/*/node_modules/jsdom/package.json'))[0];
  if(!cached)throw error;
  ({JSDOM}=require(dirname(cached)));
}

const url='http://127.0.0.1:43111/inspection.html';
function fixture(html,{pageUrl=url,documentUrl=url}={}) {
  const {window}=new JSDOM('<html><body>'+html+'</body></html>',{url:documentUrl});
  const {document}=window;
  const calls=[];
  const page={url:async()=>{calls.push('url');return pageUrl;},evaluate:async(fn,input)=>{
    calls.push('evaluate');
    return JSON.parse(JSON.stringify(vm.runInNewContext('('+fn.toString()+')(input)',{
      document,location:window.location,input
    })));
  }};
  const inspect=(overrides={})=>runInspection({url,kind:'fields',container:'',item:'',...overrides},page);
  return {document,calls,inspect};
}
const choice=(result,selector,read='text')=>result.choices.find(row=>row.selector===selector&&row.read===read);

test('container records are direct children in document order, with relative row association',async()=>{
  const f=fixture('<main><section class="scope"><article class="row"><b class="title">A</b><i class="price">10</i></article><div><article class="row"><b>nested</b></article></div><article class="row"><b class="title">B</b></article></section></main>');
  const result=await f.inspect({container:'.scope',item:'.row'});
  const title=result.choices.find(row=>row.samples[0]?.value==='A');
  assert.equal(title.total,2);assert.equal(title.status,'pass');
  assert.deepEqual(title.samples,[{index:1,value:'A'},{index:2,value:'B'}]);
  const price=result.choices.find(row=>row.samples[0]?.value==='10');
  assert.equal(price.missing,1);assert.equal(price.status,'warning');
  assert.ok(!result.choices.some(row=>row.samples.some(sample=>sample.value==='nested')));
  assert.deepEqual(f.calls,['url','evaluate']);
});

test('item-only records span parents; self fields and attribute reads stay separate',async()=>{
  const f=fixture('<section><a class="row" href="/a">A</a></section><aside><a class="row" href="/b">B</a></aside>');
  const result=await f.inspect({item:'.row'});
  assert.deepEqual(choice(result,'.').samples.map(row=>row.value),['A','B']);
  assert.deepEqual(choice(result,'.','href').samples.map(row=>row.value),['/a','/b']);
  assert.equal(choice(result,'.','href').rule,'.::href');
  const images=await fixture('<img src="a.png" data-src="lazy.png">').inspect();
  assert.deepEqual(images.choices.map(row=>row.read).sort(),['data-src','src','text']);
});

test('single-page mode uses body and preserves empty scope as no matches',async()=>{
  const f=fixture('<h1>Title</h1><p>Body</p>');
  const result=await f.inspect();
  assert.ok(result.choices.some(row=>row.samples[0]?.value==='Title'&&row.total===1));
  for(const scope of [{container:'.absent'},{item:'.absent'},{container:'body',item:'.absent'}])
    assert.deepEqual((await f.inspect(scope)).choices,[]);
  await assert.rejects(f.inspect({item:'['}),/E_INSPECTION_CSS/);
});

test('all rows are validated for missing, ambiguous and complete-value emptiness',async()=>{
  const f=fixture('<div class="row"><b class="name">first</b></div><div class="row"><b class="name">one</b><b class="name">two</b></div><div class="row"><b class="name"> </b></div><div class="row"></div>');
  const row=(await f.inspect({item:'.row'})).choices[0];
  assert.equal(row.total,4);assert.equal(row.missing,1);assert.equal(row.ambiguous,1);assert.equal(row.empty,1);assert.equal(row.status,'warning');
  const value=' '.repeat(260)+'tail';
  const complete=(await fixture('<b>'+value+'</b>').inspect()).choices[0];
  assert.equal(complete.empty,0);assert.ok(complete.samples[0].value.length<=240);
});

test('stable classes and positional fallbacks resolve within each original record',async()=>{
  const f=fixture('<article><b class="title">A</b><i class="active">one</i><i class="selected">two</i></article><article><b class="title">B</b><i>three</i><i>four</i></article>');
  const result=await f.inspect({item:'article'});
  assert.ok(result.choices.some(row=>row.selector==='b.title'));
  const second=result.choices.find(row=>row.samples[0]?.value==='two');
  assert.match(second.selector,/:nth-of-type\(2\)/);
  assert.deepEqual(second.samples.map(row=>row.value),['two','four']);
  for(const candidate of result.choices){
    assert.equal(candidate.status,'pass');
    for(const row of f.document.querySelectorAll('article'))assert.equal(row.querySelectorAll(candidate.selector).length,1);
  }
});

test('inspection snapshots its input before awaiting the current URL',async()=>{
  const f=fixture('<b>Allowed</b>');
  const input={url,kind:'fields',container:'',item:''};
  const result=runInspection(input,{
    url:async()=>{input.url=url+'#changed';return url;},
    evaluate:async(fn,value)=>JSON.parse(JSON.stringify(vm.runInNewContext('('+fn.toString()+')(input)',{
      document:f.document,location:{href:url},input:value
    })))
  });
  assert.equal((await result).url,url);
});

test('list discovery finds multiple unique containers and repeated child containers',async()=>{
  const f=fixture('<ul class="same"><li>A</li><li>B</li></ul><ul class="same"><li>C</li><li>D</li></ul><section><article>E</article><article>F</article></section>');
  const result=await f.inspect({kind:'lists'});
  assert.equal(result.choices.length,3);
  for(const row of result.choices){
    assert.equal(f.document.querySelectorAll(row.container).length,1);
    const node=f.document.querySelector(row.container);
    assert.ok(!['html','body'].includes(node.localName));
    assert.equal([...node.children].filter(child=>child.matches(row.item)).length,row.count);
    assert.equal(row.count,2);assert.equal(row.samples.length,2);
  }
  const filtered=await f.inspect({kind:'lists',item:'li'});
  assert.equal(filtered.choices.length,2);assert.ok(filtered.choices.every(row=>row.item==='li'));
  assert.deepEqual((await f.inspect({kind:'lists',item:'.absent'})).choices,[]);
});

test('URL allowlist and both exact URL checks reject before reading content',async()=>{
  const f=fixture('<b>Allowed</b>');
  await assert.rejects(f.inspect({url:'https://example.com/'}),/E_CAPTURE_ORIGIN/);
  assert.deepEqual(f.calls,[]);
  const moved=fixture('<b>Moved</b>',{pageUrl:url+'#changed'});
  await assert.rejects(moved.inspect(),/E_INSPECTION_URL/);assert.deepEqual(moved.calls,['url']);
  await assert.rejects(fixture('<b>Moved</b>',{documentUrl:url+'?changed'}).inspect(),/E_INSPECTION_URL/);
});

test('sensitive subtrees are never read, no HTML, listeners or DOM writes are used',async()=>{
  const f=fixture('<a href="/ok">Public<input value="secret"><script>secret</script></a><input type="password" value="secret"><textarea>secret</textarea><form><b>secret</b></form><div contenteditable><span>secret</span></div><img src="public.png">');
  const denied=()=>{throw Error('sensitive content read or page mutated');};
  for(const node of f.document.querySelectorAll('input,textarea,script,form,[contenteditable],form *,[contenteditable] *')){
    for(const property of ['textContent','innerHTML','outerHTML','value'])Object.defineProperty(node,property,{get:denied});
    node.getAttribute=denied;
  }
  for(const node of f.document.querySelectorAll('*')){
    node.addEventListener=denied;node.appendChild=denied;node.setAttribute=denied;
    for(const property of ['innerHTML','outerHTML'])if(!Object.getOwnPropertyDescriptor(node,property))Object.defineProperty(node,property,{get:denied});
  }
  const result=await f.inspect();
  assert.ok(result.choices.some(row=>row.samples[0]?.value==='Public'));
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('limits reject over 100 rows and oversize UTF-8 output; discovery truncation is explicit',async()=>{
  const rows=Array.from({length:101},()=>'<li><b>Row</b></li>').join('');
  await assert.rejects(fixture('<ul>'+rows+'</ul>').inspect({container:'ul',item:'li'}),/E_INSPECTION_LIMIT/);
  await assert.rejects(fixture('<ul>'+rows+'</ul>').inspect({kind:'lists'}),/E_INSPECTION_LIMIT/);
  assert.equal((await fixture(rows.replace('<li><b>Row</b></li>','')).inspect({item:'li'})).choices[0].total,100);
  const fields=await fixture(Array.from({length:40},(_,i)=>'<b class="field-'+i+'">'+i+'</b>').join('')).inspect();
  assert.equal(fields.choices.length,32);assert.equal(fields.truncated,true);
  const lists=await fixture(Array.from({length:33},()=>'<ul><li>A</li><li>B</li></ul>').join('')).inspect({kind:'lists'});
  assert.equal(lists.choices.length,32);assert.equal(lists.truncated,true);
  const huge=Array.from({length:32},(_,i)=>'<b class="'+('界'.repeat(400))+i+'">'+('界'.repeat(240))+'</b>').join('');
  await assert.rejects(fixture(huge).inspect(),/E_INSPECTION_LIMIT/);
});
