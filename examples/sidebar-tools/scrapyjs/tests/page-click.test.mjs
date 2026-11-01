import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {globSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,dirname} from 'node:path';
import {runClickedInspection} from '../controller/pick-page.js';
const require=createRequire(import.meta.url);
let JSDOM;
try{({JSDOM}=require('jsdom'));}
catch(error){
  const cached=globSync(join(homedir(),'.npm/_npx/*/node_modules/jsdom/package.json'))[0];
  if(!cached)throw error;
  ({JSDOM}=require(dirname(cached)));
}
const url='http://127.0.0.1:43111/inspection.html';
const html='<ul id="books"><li><a class="title" href="/a">A</a></li><li><a class="title" href="/b">B</a></li></ul>';
function fixture(){
  const {window}=new JSDOM('<html><body>'+html+'<input type="password"></body></html>',{url});
  const page={evaluate:async(fn,input)=>vm.runInNewContext('('+fn.toString()+')(input)',{
    input,document:window.document,location:window.location,window,Element:window.Element,setTimeout,clearTimeout
  })};
  return {window,page,inspect:kind=>runClickedInspection({url,kind,container:'#books',item:'li'},page)};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('actual DOM click produces text/href choices with record samples and cleans highlight',async()=>{
  const f=fixture(),pending=f.inspect('fields');await tick();
  assert.equal(f.window.document.querySelectorAll('[data-opendesk-scrapyjs-picker]').length,1);
  const event=new f.window.MouseEvent('click',{bubbles:true,cancelable:true});
  f.window.document.querySelector('a').dispatchEvent(event);
  const result=await pending;
  assert.equal(event.defaultPrevented,true);
  assert.equal(result.choices.length,2);
  assert.equal(result.choices[0].rule,'a.title::text');
  assert.equal(result.choices[0].status,'pass');
  assert.deepEqual(result.choices[0].samples.map(sample=>sample.value),['A','B']);
  assert.equal(f.window.document.querySelectorAll('[data-opendesk-scrapyjs-picker]').length,0);
});
test('clicking the real list selects its unique container and direct children',async()=>{
  const f=fixture(),pending=f.inspect('lists');await tick();
  f.window.document.querySelector('li').dispatchEvent(new f.window.MouseEvent('click',{bubbles:true,cancelable:true}));
  const row=(await pending).choices[0];
  assert.equal(row.container,'#books');assert.equal(row.item,'li');assert.equal(row.count,2);
});
test('sensitive controls are never selected; Escape removes listeners and overlay',async()=>{
  const f=fixture(),pending=f.inspect('fields');await tick();
  const event=new f.window.MouseEvent('click',{bubbles:true,cancelable:true});
  f.window.document.querySelector('input').dispatchEvent(event);
  assert.equal(event.defaultPrevented,false);
  f.window.document.dispatchEvent(new f.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  await assert.rejects(pending,/E_PICK_CANCELLED/);
  assert.equal(f.window.document.querySelectorAll('[data-opendesk-scrapyjs-picker]').length,0);
});
