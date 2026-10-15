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
  const handlers=new Map(),downloads=[],exportBlobs=[],copiedTexts=[];
  let clipboardError=null;
  const navigator={clipboard:{writeText(text){if(clipboardError)return Promise.reject(new Error(clipboardError));copiedTexts.push(text);return Promise.resolve();}}};
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
  const context={document,Blob,URL:{createObjectURL(blob){exportBlobs.push(blob);return 'blob:fictional'},revokeObjectURL(){}},navigator};
  new Script(injected).runInNewContext(context);
  const emit=(kind,dataset,value,type)=>handlers.get(kind)?.({target:kind==='click'?{
    closest(selector){return ['action','scene','lab'].some(k=>Object.hasOwn(dataset,k)&&selector.includes('[data-'+k+']'))?{dataset}:null}}:{dataset,value,type,checked:!!value}});
  return {
    state:context.__qa.state,dirty:context.__qa.dirty,
    previewImport:context.__qa.previewImport,downloads,exportBlobs,copiedTexts,html,
    rejectClipboard(message){clipboardError=message},
    disableClipboard(){navigator.clipboard=null},
    async flushClipboard(){await new Promise(resolve=>setImmediate(resolve))},
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
  h.action('new');h.edit('name','new-retry');h.lab('saveFailure');assert.equal(h.state().simulateSaveFailure,true,'save failure lab click must be handled by real event selector');h.action('save');h.action('commit');
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

test('partitioned Cookie identity is not silently overwritten by an unpartitioned import',async()=>{
  const h=await harness();
  h.action('import');
  h.state().ioText=JSON.stringify([{name:'ab_variant',domain:'example.com',path:'/',value:'unpartitioned-new'}]);
  h.previewImport();
  assert.equal(h.state().ioError,'');
  assert.equal(h.state().ioPreview.created,1);assert.equal(h.state().ioPreview.replaced,0);
  h.action('applyImport');
  const matches=h.state().rows.filter(x=>x.name==='ab_variant');
  assert.equal(matches.length,2);
  assert.equal(matches.filter(x=>x.partitioned).length,1);
  assert.equal(matches.find(x=>x.partitioned).value,'B');
  h.action('import');
  h.state().ioText=JSON.stringify([{name:'p',domain:'example.com',path:'/',value:'x',partitioned:true}]);
  h.previewImport();assert.match(h.state().ioError,/分区 Cookie/);
});

test('R4.7 export actions use production labels and share identical redacted JSON output',async()=>{
  const h=await harness();
  assert.match(h.html,/data-action="copyExport"[^>]*>复制到剪贴板<\/button>/);
  assert.match(h.html,/data-action="runExport"[^>]*>导出文件<\/button>/);
  assert.doesNotMatch(h.html,/导出模拟文件/);
  h.action('export');h.action('copyExport');await h.flushClipboard();
  assert.equal(h.copiedTexts.length,1);assert.equal(h.downloads.length,0);
  const values=JSON.parse(h.copiedTexts[0]);
  assert.ok(values.every(c=>!('value' in c)&&c.valueRedacted===true));
  h.action('runExport');
  assert.equal(h.downloads.length,1);
  assert.equal(await h.exportBlobs[0].text(),h.copiedTexts[0]);
});
test('R4.7 copying sensitive values requires scoped grant then explicit final confirmation',async()=>{
  const h=await harness();
  h.action('export');h.change('exportValues',true);h.action('copyExport');
  assert.equal(h.state().ioConfirm,'values');assert.equal(h.copiedTexts.length,0);
  h.action('allowExportValues');
  assert.equal(h.state().exportMethod,'copy');
  assert.equal(h.state().ioConfirm,'export');
  assert.equal(h.copiedTexts.length,0);
  h.action('confirmExport');await h.flushClipboard();
  assert.equal(h.copiedTexts.length,1);
  assert.match(h.copiedTexts[0],/fictional-session-4cd7/);
  assert.equal(h.downloads.length,0);
  h.action('runExport');
  assert.equal(h.state().ioConfirm,'export','a new sensitive export needs a new confirmation');
  h.action('cancelIOConfirm');assert.equal(h.downloads.length,0);
});
test('R4.7 clipboard failure preserves export panel and allows retry or file download',async()=>{
  const h=await harness();
  h.action('export');h.rejectClipboard('permission denied');h.action('copyExport');
  await h.flushClipboard();
  assert.match(h.state().ioError,/复制失败/);
  assert.equal(h.state().io,'export');
  assert.equal(h.state().exportBusy,false);
  assert.equal(h.copiedTexts.length,0);assert.equal(h.downloads.length,0);
  h.rejectClipboard(null);h.action('copyExport');await h.flushClipboard();
  assert.equal(h.copiedTexts.length,1);assert.equal(h.state().ioError,'');
  h.action('runExport');assert.equal(h.downloads.length,1);
});
test('R4.7 unavailable clipboard reports failure instead of pretending it copied',async()=>{
  const h=await harness();
  h.action('export');h.disableClipboard();h.action('copyExport');
  await h.flushClipboard();
  assert.match(h.state().ioError,/无法访问剪贴板/);
  assert.equal(h.copiedTexts.length,0);assert.equal(h.downloads.length,0);
  h.action('runExport');assert.equal(h.downloads.length,1);
});
test('R4.7 non-JSON formats keep value and partition restrictions for both export paths',async()=>{
  const h=await harness();
  h.action('export');h.change('exportFormat','header');h.action('copyExport');
  assert.match(h.state().ioError,/必须包含 Cookie 值/);
  assert.equal(h.copiedTexts.length,0);
  h.change('exportValues',true);h.action('copyExport');
  assert.equal(h.state().ioConfirm,'values');
  h.action('allowExportValues');assert.equal(h.state().ioConfirm,'export');
  h.action('confirmExport');await h.flushClipboard();
  assert.equal(h.copiedTexts.length,1);
  assert.match(h.copiedTexts[0],/session_id=fictional-session-4cd7/);
  h.change('exportFormat','netscape');h.action('copyExport');
  assert.match(h.state().ioError,/Netscape 不支持分区 Cookie/);
  assert.equal(h.state().ioConfirm,null);
  assert.equal(h.copiedTexts.length,1);
});
