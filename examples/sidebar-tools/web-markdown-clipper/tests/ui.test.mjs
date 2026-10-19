import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
class Node {
  constructor(id=''){this.id=id;this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.dataset={};this.events={};this.children=[];}
  addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
  async fire(name){await Promise.all((this.events[name]||[]).map(fn=>fn()));}
  setAttribute(key,value){this[key]=value;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=[...items];}
  focus(){this.focused=true;}
  select(){this.selected=true;}
}
function mounted({request=async()=>({}),clipboard=async()=>({copied:true}),download=async()=>({started:true})}={}){
  const ids=['clip-source','clip-preview','clip-status','clip-site','clip-meta','clip-fetch',
    'clip-show-source','clip-show-preview','clip-copy','clip-download'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Node(id)]));
  nodes['clip-meta'].value='none';
  const modes=['article','selection','quote','link'].map(name=>{const n=new Node(name);n.dataset.clipMode=name;return n;});
  const root={querySelector:key=>nodes[key.slice(1)],querySelectorAll:()=>modes,events:{},
    addEventListener(name,fn){this.events[name]=fn;}};
  const document={createElement:tag=>new Node(tag),createDocumentFragment:()=>new Node('fragment')};
  runInNewContext(source,{globalThis:{OpenDeskTool:{root,request},OpenDeskSDK:{browser:{
    clipboard:{writeText:clipboard},downloads:{text:download}}}},document});
  return {nodes,modes,root};
}
test('switching modes invalidates stale extraction without unlocking a newer request',async()=>{
  const first=deferred(),second=deferred();let count=0;
  const {nodes,modes}=mounted({request:()=>++count===1?first.promise:second.promise});
  const original=nodes['clip-fetch'].fire('click');
  assert.equal(nodes['clip-fetch'].disabled,true);
  await modes[1].fire('click');
  assert.equal(nodes['clip-fetch'].disabled,false,'new mode should allow a new request');
  const next=nodes['clip-fetch'].fire('click');
  assert.equal(nodes['clip-fetch'].disabled,true);
  first.resolve({markdown:'OLD',source:'https://example.com',title:'Old',site:'A'});
  await original;
  assert.equal(nodes['clip-fetch'].disabled,true,'old completion must not unlock current fetch');
  assert.equal(nodes['clip-source'].value,'');
  second.resolve({markdown:'NEW',source:'https://example.com',title:'New',site:'A'});
  await next;
  assert.equal(nodes['clip-fetch'].disabled,false);
  assert.equal(nodes['clip-source'].value,'NEW');
});
test('copy/download use accepted Markdown and strip unsafe leading-dot filename',async()=>{
  let copied='',downloaded;
  const {nodes}=mounted({
    request:async()=>({markdown:'# text\n',source:'https://example.com',title:'... unsafe/name',site:'A'}),
    clipboard:async text=>{copied=text;return {copied:true};},
    download:async data=>{downloaded=data;return {started:true};}
  });
  await nodes['clip-fetch'].fire('click');
  await nodes['clip-copy'].fire('click');
  assert.equal(copied,'# text\n');
  await nodes['clip-download'].fire('click');
  assert.equal(downloaded.text,copied);
  assert.equal(downloaded.filename.startsWith('.'),false);
  assert.match(downloaded.filename,/\.md$/);
});
test('changing pages clears cached Markdown before subsequent copy',async()=>{
  let copied=false;
  const {nodes,root}=mounted({
    request:async()=>({markdown:'SENSITIVE',source:'https://example.com',title:'A',site:'A'}),
    clipboard:async()=>{copied=true;return {copied:true};}
  });
  await nodes['clip-fetch'].fire('click');
  root.events['opendesk-page-changed']();
  await nodes['clip-copy'].fire('click');
  assert.equal(copied,false);
  assert.equal(nodes['clip-source'].value,'');
  assert.equal(nodes['clip-status'].dataset.error,'true');
});

test('quote mode folds unsafe multiline titles into one escaped source link',async()=>{
 const {nodes,modes}=mounted({request:async()=>({
  markdown:'正文内容\n',source:'https://example.com/article',title:'复杂 [标题]\n另一行  ',site:'A'
 })});
 await modes[2].fire('click');
 await nodes['clip-fetch'].fire('click');
 assert.equal(nodes['clip-source'].value,
  '> 正文内容\n\n来源：[复杂 \\[标题\\] 另一行](https://example.com/article)\n');
});
test('late clipboard and download replies cannot override navigation or mode changes',async()=>{
 const copy=deferred(),download=deferred();
 let copyPayload='',downloadPayload='';
 const {nodes,modes,root}=mounted({
  request:async()=>({markdown:'# 正文\n',source:'https://example.com/a',title:'现在',site:'A'}),
  clipboard:text=>{copyPayload=text;return copy.promise;},
  download:data=>{downloadPayload=data.text;return download.promise;}
 });
 await nodes['clip-fetch'].fire('click');
 const copying=nodes['clip-copy'].fire('click');
 root.events['opendesk-page-changed']();
 copy.resolve({copied:true});
 await copying;
 assert.equal(copyPayload,'# 正文\n');
 assert.equal(nodes['clip-status'].textContent,'网页已变化，请重新剪藏');
 assert.equal(nodes['clip-source'].value,'');
 await nodes['clip-fetch'].fire('click');
 const downloading=nodes['clip-download'].fire('click');
 await modes[3].fire('click');
 download.resolve({started:true});
 await downloading;
 assert.equal(downloadPayload,'# 正文\n');
 assert.equal(nodes['clip-status'].textContent,'点击剪藏获取内容');
 assert.equal(nodes['clip-source'].value,'');
});
