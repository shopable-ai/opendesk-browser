import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';

const p='examples/sidebar-tools/cookie-editor/preview/index.html';
async function harness(){
  const html=await readFile(p,'utf8');
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script,'self-contained script required');
  assert.doesNotThrow(()=>new Script(script));
  const handlers=new Map(),downloads=[];
  const root={addEventListener(k,v){handlers.set(k,v)},contains(){return true},querySelectorAll(){return []}};
  const panel={classList:{toggle(){}},querySelector(k){return k==='.toast'?null:{innerHTML:''}},insertAdjacentHTML(){}};
  const scroll={scrollTop:0},content={innerHTML:'',querySelector(){return {focus(){},setSelectionRange(){}}}};
  const document={
    getElementById(id){return {ced42:root,'ce-panel':panel,'ce-content':content,'ce-scroll':scroll}[id]},
    body:{appendChild(){}},createElement(){return {click(){downloads.push(this.download)},remove(){}}}
  };
  const probe="globalThis.__qa={state:()=>S,dirty:hasChanges,previewImport};setScene('ready');";
  const injected=script.replace("setScene('ready');",probe);
  assert.notEqual(injected,script,'instrumentation marker missing');
  const context={document,Blob,URL:{createObjectURL(){return 'blob:fictional'},revokeObjectURL(){}}};
  new Script(injected).runInNewContext(context);
  const emit=(kind,dataset,value,type)=>handlers.get(kind)?.({target:kind==='click'?{
    closest(){return {dataset}}}:{dataset,value,type,checked:!!value}});
  return {
    state:context.__qa.state,dirty:context.__qa.dirty,
    previewImport:context.__qa.previewImport,downloads,html,
    action(a,opts={}){emit('click',{action:a,...opts})},
    scene(scene){emit('click',{scene})},
    lab(lab){emit('click',{lab})},
    edit(key,value,type='text'){emit('input',{edit:key},value,type)},
    change(field,value){emit('change',{field},value)}
  };
}
test('R4.6 uses original 384px list and stands apart from real Chrome',async()=>{
  const h=await harness();
  for(const marker of ['width:min(100%,384px)','class="item-summary"','data-scene="empty"',
    "iconBtn('fileUp','import'","iconBtn('fileDown','export'","iconBtn('plus','new'",'data-lab="saveFailure"'])
    assert.ok(h.html.includes(marker),marker);
  assert.match(h.html,/仅虚构 Cookie/);
  assert.doesNotMatch(h.html,/OpenDeskSDK/);
});
test('empty create, restore, cancel and read-only actions never falsely become dirty',async()=>{
  const h=await harness();
  h.action('new');assert.equal(h.state().expanded,'new');assert.equal(h.dirty(),false);
  h.action('import');assert.equal(h.state().confirm,null);assert.equal(h.state().io,'import');
  h.action('closeIO');h.action('new');h.edit('name','temp');assert.equal(h.dirty(),true);
  h.edit('name','');assert.equal(h.dirty(),false);
  h.edit('sameSite','Strict');assert.equal(h.dirty(),true);
  h.edit('sameSite','Lax');assert.equal(h.dirty(),false);
  h.edit('secure',false,'checkbox');assert.equal(h.dirty(),true);
  h.edit('secure',true,'checkbox');assert.equal(h.dirty(),false);
  h.action('cancelEdit');assert.equal(h.state().expanded,null);assert.equal(h.state().confirm,null);
});
test('filter and sort preserve edited Cookie identity; leaving prompts only for true changes',async()=>{
  const h=await harness();
  h.action('expand',{id:'1'});h.edit('name','renamed');
  h.action('showFilter');h.action('filter',{filter:'secure'});
  h.action('sortDirection');h.change('sort','domain');
  assert.equal(h.state().expanded,1);assert.equal(h.state().draft.name,'renamed');assert.equal(h.dirty(),true);
  h.action('export');assert.equal(h.state().confirm,'discard');
  h.action('cancelConfirm');assert.equal(h.state().draft.name,'renamed');
  h.action('export');h.action('discardConfirm');assert.equal(h.state().io,'export');
});
test('save failure retains draft; retry succeeds',async()=>{
  const h=await harness();
  h.action('new');h.edit('name','new-retry');h.lab('saveFailure');h.action('save');h.action('commit');
  assert.match(h.state().saveError,/模拟写入失败/);
  assert.equal(h.state().draft.name,'new-retry');assert.equal(h.dirty(),true);
  assert.equal(h.state().rows.some(x=>x.name==='new-retry'),false);
  h.action('save');h.action('commit');
  assert.equal(h.state().expanded,null);assert.equal(h.state().rows.some(x=>x.name==='new-retry'),true);
});
test('Cookie Header import collision, error recovery and explicit sensitive export consent',async()=>{
  const h=await harness();
  h.action('import');h.state().ioText='Cookie: theme=light; added=1';h.previewImport();
  assert.equal(h.state().ioPreview.total,2);assert.equal(h.state().ioPreview.created,1);
  assert.equal(h.state().ioPreview.replaced,1);assert.match(h.state().ioPreview.conflictText,/theme/);
  h.state().ioText='invalid';h.previewImport();assert.ok(h.state().ioError);
  h.state().ioText='added=ok';h.previewImport();assert.equal(h.state().ioError,'');
  h.action('applyImport');assert.equal(h.state().rows.some(x=>x.name==='added'),true);
  h.action('export');h.action('runExport');assert.equal(h.downloads.length,1);
  h.state().includeValues=true;h.action('runExport');assert.equal(h.state().ioConfirm,'values');
  h.action('allowExportValues');assert.equal(h.state().ioConfirm,'export');
  assert.equal(h.downloads.length,1);
  h.action('confirmExport');assert.equal(h.downloads.length,2);
});
test('explicit scenario switch retains modified fake data outside empty view',async()=>{
  const h=await harness();const count=h.state().rows.length;
  h.scene('empty');assert.equal(h.state().rows.length,0);
  h.scene('ready');assert.equal(h.state().rows.length,count);
  h.scene('readonly');assert.equal(h.state().grantsBySite['example.com'].write,false);
  h.scene('blocked');assert.equal(h.state().chrome,false);
  h.scene('ready');h.scene('dark');assert.equal(h.state().dark,true);
});

test('editing a redacted Value and then clearing is an intentional empty-value write',async()=>{
  const h=await harness();
  h.action('expand',{id:'1'});assert.equal(h.dirty(),false);
  h.edit('value','temporary-secret');assert.equal(h.dirty(),true);
  h.edit('value','');assert.equal(h.dirty(),true);
  assert.equal(h.state().valueEdited,true);
  h.action('save');assert.equal(h.state().confirm,'save');
  h.action('commit');assert.equal(h.state().rows.find(x=>x.id===1).value,'');
  h.action('expand',{id:'1'});h.edit('value','undo-this');
  assert.equal(h.dirty(),true);
  h.action('resetValue');assert.equal(h.state().valueEdited,false);
  assert.equal(h.state().draft.value,'');
  assert.equal(h.dirty(),false);
  h.action('cancelEdit');assert.equal(h.state().expanded,null);
});
