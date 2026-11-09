import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import {runInNewContext} from 'node:vm';

const source=await readFile(new URL('../src/Settings.tsx',import.meta.url),'utf8');
const start=source.indexOf('  async function confirmIntent(');
const code=(await transform(source.slice(start,source.indexOf('  const [locationHash',start)),{loader:'tsx'})).code;
function fixture(){
 let resolve,reject,calls=0,revision=1,focused=0;
 const env={getDraftVersion:()=>revision,confirm(_text,{signal}){
  calls++;return new Promise((yes,no)=>{resolve=yes;reject=no;signal.addEventListener('abort',()=>yes(false),{once:true});});
 }};
 const suspended={current:false},generation={current:1},mounted={current:true},etag={current:'original'},request={current:null};
 const dialog={open:true,isConnected:true,close(){this.open=false;assert.equal(suspended.current,true);},showModal(){this.open=true;}};
 const context={AbortController,document:{activeElement:{isConnected:true,focus(){focused++;}}},
  getEnvironment:()=>env,confirmationRequest:request,mounted,latestEtag:etag,editorGeneration:generation,
  editorDialog:{current:dialog},editorSuspended:suspended};
 const confirm=runInNewContext(code+';confirmIntent',context);
 return {confirm,dialog,suspended,generation,mounted,etag,request,get calls(){return calls;},get focused(){return focused;},
  answer:value=>resolve(value),reject:()=>reject(Error('host rejected')),changeDraft:()=>revision++};
}

test('editor yields its native modal synchronously; cancel/rejection restores it and single pending blocks reentry',async()=>{
 for(const ending of ['cancel','reject','abort']){
  const f=fixture(),pending=f.confirm('Discard?');
  assert.equal(f.dialog.open,false);assert.equal(f.suspended.current,true);
  assert.equal(await f.confirm('Again?'),false);assert.equal(f.calls,1);
  if(ending==='reject')f.reject();else if(ending==='abort')f.request.current.abort();else f.answer(false);
  assert.equal(await pending,false);assert.equal(f.dialog.open,true);assert.equal(f.focused,1);
  assert.equal(f.suspended.current,false);assert.equal(f.request.current,null);
 }
});

test('only a live unchanged editor accepts; revision/ETag changes preserve the editor and draft',async()=>{
 for(const ending of ['confirm','revision','etag','generation','destroy']){
  const f=fixture(),pending=f.confirm('Discard?');
  if(ending==='revision')f.changeDraft();
  if(ending==='etag')f.etag.current='newer';
  if(ending==='generation')f.generation.current++;
  if(ending==='destroy'){f.mounted.current=false;f.request.current.abort();}
  f.answer(true);assert.equal(await pending,ending==='confirm');
  assert.equal(f.dialog.open,!['generation','destroy'].includes(ending));
 }
});
