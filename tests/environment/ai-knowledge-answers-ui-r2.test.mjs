import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
const base=new URL('../../examples/sidebar-tools/ai-knowledge-answers/',import.meta.url);
const read=path=>readFileSync(new URL(path,base),'utf8');
test('R2 UI: source pages are separate and there is no ever-expanded CRUD column',()=>{
 const html=read('src/index.html');
 for(const id of ['qa-view-ask','qa-view-list','qa-view-edit','qa-tab-ask','qa-tab-list',
  'qa-search','qa-editor','qa-manage','qa-review','qa-query'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/id="qa-view-list"[^>]*hidden/);
 assert.match(html,/id="qa-view-edit"[^>]*hidden/);
 assert.doesNotMatch(html,/<h1/);
 const all=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(new Set(all).size,all.length);
});
test('R2 UI: host storage, model, permission restrictions remain unchanged',()=>{
 const config=JSON.parse(read('tool.config.json'));
 assert.deepEqual(config.capabilities,['storage.local','user.export']);
 const js=read('src/main.js');new Function(js);
 assert.match(js,/storage\.get/);assert.match(js,/storage\.set/);
 assert.match(js,/withEtag:true/);assert.match(js,/ifMatch:etag/);
 assert.match(js,/aria-selected/);
 assert.doesNotMatch(js,/chrome\.runtime|fetch\(/);
 const css=read('src/style.css');
 assert.match(css,/@opendesk-shared-design/);
 assert.match(css,/min-width:0/);
});
test('R2 UI: lost-write recovery is an explicit read, not a tab-navigation claim',()=>{
 const code=read('src/main.js');
 assert.match(code,/if\(uncertain&&!recover\)/);
 assert.match(code,/guard\(\(\)=>load\(\),\{recover:true\}\)/);
 assert.match(code,/load\(\{silent:true\}\)/);
 assert.ok(code.includes("$('qa-delete').hidden"));
});
test('R2 UI: keyboard and confirmation controls exist without user-modal APIs',()=>{
 const html=read('src/index.html');
 assert.match(html,/role="tablist"/);
 assert.match(html,/aria-selected="true"/);
 assert.match(html,/aria-controls="qa-view-list"/);
 assert.match(html,/aria-label="返回知识列表"/);
 assert.match(html,/aria-labelledby="qa-review-title"/);
 assert.match(html,/aria-describedby="qa-review-message"/);
 const code=read('src/main.js');
 assert.match(code,/Escape/);
 assert.match(code,/ArrowLeft/);
 assert.doesNotMatch(code,/window\.alert|window\.confirm|window\.prompt/);
});
test('R2 UI: preview references actual source rather than duplicating business implementation',()=>{
 const preview=read('preview/index.html');
 for(const name of ['../src/index.html','../src/style.css','../src/main.js','../src/model.js'])
   assert.ok(preview.includes(name));
 assert.match(preview,/preview-only/);
 assert.match(preview,/样本|示例|模拟|预览/);
 const data=JSON.parse(read('fixtures/sample-knowledge.json'));
 assert.equal(data.version,1);assert.ok(data.items.length>=10&&data.items.length<=20);
 assert.ok(new TextEncoder().encode(JSON.stringify(data)).byteLength<=8192);
});

test('R2 UI: current source packs with canonical design and describes the trusted AI entry',async()=>{
 const tool=await createSidebarToolPackage(new URL('.',base).pathname);
 assert.match(tool.css,/^\/\* opendesk\.shared-design\.v1 sha256=/);
 assert.doesNotMatch(tool.html+tool.js,/Provider 尚未接通/);
 assert.match(tool.html,/可信.*AI 问答/);
});

// Component tests only: actual editor/model scripts with an in-memory storage
// transport. This does not prove Chrome installation, persistence or Provider IO.
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function mount(storage={value:null,requests:[],unknown:false},{beforeWrite,beforeRead,exportRequest,outerRoot=false}={}){
 const {window}=parseHTML('<html><body>'+read('src/index.html')+'</body></html>');
 const root=outerRoot?window.document.body:window.document.querySelector('main');
 // Linkedom has no native focus navigation. Record attempts and model disabled
 // controls rejecting focus, without changing the shared HTMLElement prototype.
 const document=window.document,focusCalls=[];
 Object.defineProperty(document,'activeElement',{configurable:true,writable:true,value:document.body});
 for(const element of document.querySelectorAll('*')){
  if(!(element instanceof window.HTMLElement))continue;
  element.focus=()=>{
   focusCalls.push({id:element.id,disabled:Boolean(element.disabled)});
   if(!element.disabled)element.ownerDocument.activeElement=element;
  };
 }
 const etag=()=>createHash('sha256').update(JSON.stringify(storage.value)).digest('hex');
 const context={TextEncoder,crypto:{randomUUID},AbortController,
  OpenDeskTool:{root,setState(){},async request(method,args){
   storage.requests.push({method,args:structuredClone(args)});
   if(method==='storage.get'){
    if(beforeRead)await beforeRead();
    return {value:structuredClone(storage.value),etag:etag()};
   }
   if(method==='file.download'||method==='clipboard.writeText'){
    assert.equal(typeof exportRequest,'function');return exportRequest(method,args);
   }
   assert.equal(method,'storage.set');assert.equal(args.ifMatch,etag());
   if(beforeWrite)await beforeWrite();
   if(storage.conflict)throw Object.assign(Error('storage changed'),{code:'E_STORAGE_CONFLICT'});
   storage.value=structuredClone(args.value);
   if(storage.unknown)throw Object.assign(Error('receipt lost'),{code:'E_OUTCOME_UNKNOWN'});
   return {saved:true};
  }}};
 runInNewContext(read('src/model.js'),context);
 runInNewContext(read('src/main.js'),context);
 const get=id=>root.querySelector('#'+id);
 const click=id=>{assert.equal(Boolean(get(id).disabled),false,id+' must be usable');get(id).click();};
 const input=(id,value)=>{get(id).value=value;get(id).dispatchEvent(new window.Event('input'));};
 // Activate the real save control. A synthetic submit bypasses Chrome's
 // sandbox allow-forms restriction and previously concealed the native failure.
 const save=()=>get('qa-save').click();
 const press=(id,key)=>{
  const event=new window.Event('keydown',{bubbles:true,cancelable:true});
  event.key=key;get(id).dispatchEvent(event);
 };
 return {storage,get,click,input,save,press,focusCalls,window};
}
test('R2 component: save/read-back retains the stored ID without exposing technical IDs in answer sources',async()=>{
 const ui=mount();await tick();
 assert.equal(ui.get('qa-save').type,'button');
 assert.equal(ui.get('qa-save').closest('form'),null,'opaque sandbox does not allow native form submission');
 assert.equal(ui.get('qa-status').textContent,'');
 ui.click('qa-tab-list');ui.click('qa-new');
 ui.input('qa-question','退款期限是多少');ui.input('qa-answer','7 天内可退款');
 ui.input('qa-aliases','多久可以退款');ui.save();await tick();
 assert.equal(ui.get('qa-view-list').hidden,false);
 assert.match(ui.get('qa-list').textContent,/退款期限是多少/);
 const id=ui.storage.value.items[0].id;assert.match(id,/^qa_/);
 assert.deepEqual(ui.storage.requests.map(row=>row.method),['storage.get','storage.set','storage.get']);
 const reopened=mount(ui.storage);await tick();
 reopened.input('qa-query','多久可以退款');reopened.click('qa-ask');
 assert.equal(reopened.get('qa-result-kind').textContent,'固定答案');
 assert.equal(reopened.get('qa-result-text').textContent,'7 天内可退款');
 assert.equal(reopened.get('qa-result-sources').querySelector('.qa-source-id'),null,
  'internal storage IDs must not be shown to users');
 assert.match(reopened.get('qa-result-sources').textContent,/退款期限是多少/);
 assert.doesNotMatch(reopened.get('qa-result-sources').textContent,new RegExp(id));
 reopened.input('qa-query','退款需要多少天？');reopened.click('qa-ask');
 assert.equal(reopened.get('qa-result-kind').textContent,'检索到相关知识');
 assert.match(reopened.get('qa-result-sources').textContent,/退款期限是多少/,
  'retrieval citations should display question names instead of storage IDs');
 assert.doesNotMatch(reopened.get('qa-result-sources').textContent,new RegExp(id));
 reopened.input('qa-query','飞船位置');reopened.click('qa-ask');
 assert.equal(reopened.get('qa-result-kind').textContent,'没有可信依据');
 assert.equal(reopened.get('qa-result-sources').children.length,0);
});
test('R2 component: dirty navigation can be cancelled; unknown save blocks a second write until read-back',async()=>{
 const ui=mount();await tick();ui.click('qa-tab-list');ui.click('qa-new');
 ui.input('qa-question','退款期限是多少');ui.input('qa-answer','7 天内可退款');
 ui.click('qa-back');assert.equal(ui.get('qa-review').hidden,false);
 ui.click('qa-cancel');assert.equal(ui.get('qa-view-edit').hidden,false);
 assert.equal(ui.get('qa-question').value,'退款期限是多少');
 ui.storage.unknown=true;ui.save();await tick();
 assert.equal(ui.get('qa-save').disabled,true);ui.save();await tick();
 assert.equal(ui.storage.requests.filter(row=>row.method==='storage.set').length,1);
 const requests=ui.storage.requests.length;
 for(const button of ['qa-tab-ask','qa-back']){
  ui.click(button);
  assert.equal(ui.get('qa-view-edit').hidden,false);
  assert.equal(ui.get('qa-review').hidden,true);
 }
 assert.equal(ui.storage.requests.length,requests);
 ui.click('qa-refresh');ui.click('qa-accept');await tick();
 assert.equal(ui.storage.requests.at(-1).method,'storage.get');
 assert.equal(ui.get('qa-view-list').hidden,false);
 assert.match(ui.get('qa-list').textContent,/退款期限是多少/);
 assert.equal(ui.get('qa-save').disabled,false);
});

test('R2.1: answer-first, long names and source verdicts are in real source',()=>{
 const html=read('src/index.html'),css=read('src/style.css'),js=read('src/main.js');
 for(const id of ['qa-ready-label','qa-result-advice','qa-source-title','qa-danger','qa-review-backdrop'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/qa-ready-label/);assert.match(js,/qa-source-title/);
 assert.match(js,/e\.ctrlKey\|\|e\.metaKey/);assert.match(css,/-webkit-line-clamp:2/);
 assert.doesNotMatch(html,/aria-modal="false"/);
});
test('R2.1: visible confirmation preserves dirty input on cancel',async()=>{
 const ui=mount();await tick();ui.click('qa-tab-list');ui.click('qa-new');
 assert.equal(ui.get('qa-danger').hidden,true);
 ui.input('qa-question','模拟客户提问');ui.input('qa-answer','已核实');
 ui.click('qa-back');assert.equal(ui.get('qa-review-backdrop').hidden,false);
 ui.click('qa-cancel');assert.equal(ui.get('qa-review-backdrop').hidden,true);
 assert.equal(ui.get('qa-question').value,'模拟客户提问');
 assert.match(read('src/main.js'),/e\.key==='Tab'/);
});

test('R2.1 regression: successful save focuses search only after the busy controls unlock',async()=>{
 let releaseWrite;
 const pendingWrite=new Promise(resolve=>{releaseWrite=resolve;});
 const ui=mount(undefined,{beforeWrite:()=>pendingWrite});await tick();
 ui.click('qa-tab-list');ui.click('qa-new');
 ui.input('qa-question','退款期限是多少');ui.input('qa-answer','7 天内可退款');
 ui.get('qa-save').focus();ui.focusCalls.length=0;
 ui.save();await tick();
 try{
  assert.equal(ui.storage.requests.at(-1).method,'storage.set');
  assert.equal(ui.get('qa-search').disabled,true);
  assert.deepEqual(ui.focusCalls,[],'pending save must not move focus');
 }finally{releaseWrite();}
 await tick();
 assert.equal(ui.get('qa-view-list').hidden,false);
 assert.equal(ui.get('qa-search').disabled,false);
 assert.ok(ui.focusCalls.every(call=>!call.disabled),'focus must wait for controls to unlock');
 assert.equal(ui.window.document.activeElement?.id,'qa-search');
});

async function dirtyArrowReview(){
 const ui=mount();await tick();ui.click('qa-tab-list');ui.click('qa-new');
 ui.input('qa-question','尚未保存的问题');
 ui.get('qa-tab-list').focus();ui.press('qa-tab-list','ArrowLeft');
 assert.equal(ui.get('qa-review').hidden,false);
 return ui;
}
test('R2.1 regression: arrow navigation keeps focus on cancel while dirty review is open',async()=>{
 const ui=await dirtyArrowReview();
 assert.equal(ui.window.document.activeElement?.id,'qa-cancel');
});
test('R2.1 regression: cancelling arrow navigation restores focus to the initiating tab',async()=>{
 const ui=await dirtyArrowReview();ui.click('qa-cancel');
 assert.equal(ui.get('qa-review').hidden,true);
 assert.equal(ui.get('qa-view-edit').hidden,false);
 assert.equal(ui.get('qa-question').value,'尚未保存的问题');
 assert.equal(ui.window.document.activeElement?.id,'qa-tab-list');
});

for(const [field,value] of [['qa-query','新的客户问题'],['qa-query-scope','产品 B']]){
 test(`R2.1 regression: ${field} input hides the previous answer`,async()=>{
  const ui=mount({requests:[],value:{version:1,items:[{
   id:'qa_test_refund01',question:'退款期限是多少',aliases:[],
   answer:'7 天内可退款',scope:'',enabled:true
  }]}});await tick();
  ui.input('qa-query','退款期限是多少');ui.click('qa-ask');
  assert.equal(ui.get('qa-result').hidden,false);
  assert.equal(ui.get('qa-result-text').textContent,'7 天内可退款');
  ui.input(field,value);
  assert.equal(ui.get('qa-result').hidden,true);
 });
}

test('R2.1 regression: cancelling import review restores focus to import after its async read',async()=>{
 const ui=mount();await tick();ui.click('qa-tab-list');ui.click('qa-manage-toggle');
 const text=read('fixtures/sample-knowledge.json');
 ui.get('qa-file').files=[{name:'sample.json',size:new TextEncoder().encode(text).byteLength,
  text:async()=>text}];
 // A disabled import button loses native focus while file.text() is pending.
 ui.window.document.body.focus();ui.click('qa-import');await tick();
 assert.equal(ui.get('qa-review').hidden,false);
 ui.click('qa-cancel');
 assert.equal(ui.get('qa-review').hidden,true);
 assert.equal(ui.window.document.activeElement?.id,'qa-import');
 assert.equal(ui.storage.requests.filter(row=>row.method==='storage.set').length,0);
});

for(const [field,other,label] of [
 ['qa-question','qa-answer','标准问题'],['qa-answer','qa-question','标准答案']
]){
 test(`R2.1 regression: blank ${field} focuses its labelled validation error without writing`,async()=>{
  const ui=mount();await tick();ui.click('qa-tab-list');ui.click('qa-new');
  ui.input(other,'已填写');ui.input(field,' \n\t ');ui.get('qa-save').focus();ui.save();
  assert.equal(ui.window.document.activeElement?.id,field);
  assert.equal(ui.get(field).getAttribute('aria-invalid'),'true');
  assert.equal(ui.get(field).getAttribute('aria-describedby'),'qa-status');
  assert.equal(ui.get('qa-status').hidden,false);
  assert.match(ui.get('qa-status').textContent,new RegExp(label));
  assert.equal(ui.storage.requests.filter(row=>row.method==='storage.set').length,0);
 });
 test(`R2.1 regression: editing invalid ${field} clears its stale validation association`,async()=>{
  const ui=mount();await tick();ui.click('qa-tab-list');ui.click('qa-new');
  ui.input(other,'已填写');ui.save();
  assert.equal(ui.get(field).getAttribute('aria-invalid'),'true');
  ui.input(field,'已补充');
  assert.equal(ui.get(field).hasAttribute('aria-invalid'),false);
  assert.equal(ui.get(field).hasAttribute('aria-describedby'),false);
 });
}

test('R2.1 regression: reopening the editor clears the previous draft validation error',async()=>{
 const ui=mount();await tick();ui.click('qa-tab-list');ui.click('qa-new');
 ui.save();assert.equal(ui.get('qa-question').getAttribute('aria-invalid'),'true');
 ui.click('qa-back');ui.click('qa-new');
 for(const id of ['qa-question','qa-answer']){
  assert.equal(ui.get(id).hasAttribute('aria-invalid'),false);
  assert.equal(ui.get(id).hasAttribute('aria-describedby'),false);
 }
});

test('R2.1 regression: knowledge tab controls the currently visible list or edit panel',async()=>{
 const ui=mount();await tick();ui.click('qa-tab-list');
 const assertPanel=id=>{
  assert.equal(ui.get('qa-tab-list').getAttribute('aria-controls'),id);
  assert.equal(ui.get('qa-tab-list').getAttribute('aria-selected'),'true');
  assert.equal(ui.get(id).hidden,false);
  assert.equal(ui.get(id).getAttribute('role'),'tabpanel');
  assert.equal(ui.get(id).getAttribute('aria-labelledby'),'qa-tab-list');
 };
 assertPanel('qa-view-list');ui.click('qa-new');assertPanel('qa-view-edit');
 ui.click('qa-back');assertPanel('qa-view-list');
});

test('R2.1 regression: each knowledge row describes its own status metadata',async()=>{
 const ui=mount({requests:[],value:JSON.parse(read('fixtures/sample-knowledge.json'))});await tick();
 ui.click('qa-tab-list');
 const buttons=[...ui.get('qa-list').querySelectorAll('button')];
 assert.ok(buttons.length>1);
 const descriptions=buttons.map(button=>{
  const id=button.getAttribute('aria-describedby');assert.ok(id);
  const meta=ui.window.document.getElementById(id);assert.ok(meta);
  assert.equal(meta.className,'qa-record-meta');
  assert.equal(button.contains(meta),true);
  assert.match(meta.textContent,/已启用|已停用/);
  return id;
 });
 assert.equal(new Set(descriptions).size,buttons.length);
});

test('R2.1 regression: review makes only backdrop siblings inert with an outer SDK root',async()=>{
 const ui=mount(undefined,{outerRoot:true});await tick();ui.click('qa-tab-list');ui.click('qa-new');
 ui.input('qa-question','未保存');ui.click('qa-back');
 const backdrop=ui.get('qa-review-backdrop'),panel=backdrop.parentElement;
 assert.notEqual(panel,ui.window.document.body);
 assert.equal(Boolean(panel.inert),false);
 assert.equal(Boolean(backdrop.inert),false);
 for(const child of panel.children)if(child!==backdrop)assert.equal(child.inert,true);
 ui.click('qa-cancel');
 for(const child of panel.children)if(child!==backdrop)assert.equal(child.inert,false);
});

test('R2.1 regression: unknown-write reconciliation waits for the read before restoring enabled search focus',async()=>{
 let releaseRead,reads=0;
 const pendingRead=new Promise(resolve=>{releaseRead=resolve;});
 const ui=mount({value:null,requests:[],unknown:true},{
  beforeRead:()=>++reads===2?pendingRead:undefined
 });await tick();ui.click('qa-tab-list');ui.click('qa-new');
 ui.input('qa-question','退款期限是多少');ui.input('qa-answer','7 天内可退款');
 ui.save();await tick();assert.equal(ui.get('qa-save').disabled,true);
 ui.click('qa-refresh');ui.click('qa-accept');ui.focusCalls.length=0;await tick();
 try{
  assert.equal(reads,2);
  assert.equal(ui.get('qa-search').disabled,true);
  assert.deepEqual(ui.focusCalls,[],'reconciliation must await the actual storage read');
 }finally{releaseRead();}
 await tick();
 assert.equal(ui.get('qa-view-list').hidden,false);
 assert.equal(ui.get('qa-search').disabled,false);
 assert.ok(ui.focusCalls.every(call=>!call.disabled));
 assert.equal(ui.window.document.activeElement?.id,'qa-search');
});

async function uncertainDraft(fault){
 const ui=mount({value:null,requests:[],unknown:fault==='unknown',conflict:fault==='conflict'});
 await tick();ui.click('qa-tab-list');ui.click('qa-new');
 const draft={'qa-question':'退款期限是多少','qa-answer':'7 天内可退款',
  'qa-aliases':'多久可以退款','qa-scope':'产品 A'};
 for(const [id,value] of Object.entries(draft))ui.input(id,value);
 ui.save();await tick();
 assert.match(ui.get('qa-status').textContent,new RegExp(fault==='unknown'?'E_OUTCOME_UNKNOWN':'E_STORAGE_CONFLICT'));
 return {ui,draft};
}
for(const fault of ['unknown','conflict']){
 test(`R2.1 recovery: ${fault} keeps draft text focusable and read-only while blocking mutations`,async()=>{
  const {ui,draft}=await uncertainDraft(fault);
  assert.equal(ui.window.document.activeElement?.id,'qa-answer');
  // Enabled read-only text permits native selection/copy. Linkedom only models
  // focus here; this is not an assertion of native clipboard or selection IO.
  for(const [id,value] of Object.entries(draft)){
   assert.equal(Boolean(ui.get(id).disabled),false,id+' must remain available for copying');
   assert.equal(ui.get(id).readOnly,true,id+' must reject edits');
   assert.equal(ui.get(id).value,value);
   ui.get(id).focus();assert.equal(ui.window.document.activeElement?.id,id);
  }
  assert.equal(ui.get('qa-save').disabled,true);
  assert.equal(ui.get('qa-enabled').disabled,true);
  ui.save();await tick();
  assert.equal(ui.storage.requests.filter(row=>row.method==='storage.set').length,1);
 });
 test(`R2.1 recovery: ${fault} refresh cancellation preserves the copyable draft`,async()=>{
  const {ui,draft}=await uncertainDraft(fault),requests=ui.storage.requests.length;
  ui.get('qa-refresh').focus();ui.click('qa-refresh');
  assert.equal(ui.get('qa-review').hidden,false);ui.click('qa-cancel');
  assert.equal(ui.get('qa-view-edit').hidden,false);
  assert.equal(ui.window.document.activeElement?.id,'qa-refresh');
  for(const [id,value] of Object.entries(draft)){
   assert.equal(ui.get(id).value,value);
   assert.equal(Boolean(ui.get(id).disabled),false);
   assert.equal(ui.get(id).readOnly,true);
  }
  assert.equal(ui.get('qa-save').disabled,true);
  assert.equal(ui.get('qa-enabled').disabled,true);
  assert.equal(ui.storage.requests.length,requests,'cancel must not reread or rewrite storage');
 });
 test(`R2.1 recovery: ${fault} explicit successful reread unlocks read-only draft fields`,async()=>{
  const {ui,draft}=await uncertainDraft(fault);
  ui.click('qa-refresh');ui.click('qa-accept');await tick();
  assert.equal(ui.get('qa-view-list').hidden,false);
  for(const id of Object.keys(draft)){
   assert.equal(Boolean(ui.get(id).disabled),false);
   assert.equal(ui.get(id).readOnly,false);
  }
  assert.equal(ui.get('qa-save').disabled,false);
  assert.equal(ui.get('qa-enabled').disabled,false);
  assert.deepEqual(ui.storage.requests.map(row=>row.method),['storage.get','storage.set','storage.get']);
  assert.equal(ui.storage.value?.items.length??0,fault==='unknown'?1:0);
 });
}

test('R2.1 recovery: invalid JSON restores import focus without changing storage',async()=>{
 const ui=mount();await tick();ui.click('qa-tab-list');ui.click('qa-manage-toggle');
 const text='{"version":1,"items":[';
 ui.get('qa-file').files=[{name:'broken.json',size:new TextEncoder().encode(text).byteLength,
  text:async()=>text}];
 ui.window.document.body.focus();ui.focusCalls.length=0;ui.click('qa-import');
 assert.equal(ui.get('qa-import').disabled,true);await tick();
 assert.match(ui.get('qa-status').textContent,/导入校验失败，原知识未修改/);
 assert.equal(ui.get('qa-review').hidden,true);
 assert.equal(ui.get('qa-import').disabled,false);
 assert.equal(ui.window.document.activeElement?.id,'qa-import');
 assert.ok(ui.focusCalls.every(call=>!call.disabled));
 assert.equal(ui.storage.value,null);
 assert.deepEqual(ui.storage.requests.map(row=>row.method),['storage.get']);
});

for(const [format,method,receipt,success,error] of [
 ['json','file.download',{downloadId:'fixture-download'},/已提交 JSON 下载/,/导出失败/],
 ['csv','clipboard.writeText',{copied:true},/CSV 已复制到剪贴板/,/复制 CSV 失败/]
])for(const outcome of ['success','error']){
 test(`R2.1 recovery: ${format} export ${outcome} restores focus to its enabled trigger`,async()=>{
  let resolveExport,rejectExport;
  const pendingExport=new Promise((resolve,reject)=>{resolveExport=resolve;rejectExport=reject;});
  const ui=mount(undefined,{exportRequest:()=>pendingExport});await tick();
  ui.click('qa-tab-list');ui.click('qa-manage-toggle');
  const button='qa-export-'+format;
  ui.window.document.body.focus();ui.focusCalls.length=0;ui.click(button);await tick();
  try{
   assert.equal(ui.storage.requests.at(-1).method,method);
   assert.equal(ui.get(button).disabled,true);
   assert.deepEqual(ui.focusCalls,[],'pending export must not focus a disabled trigger');
  }finally{
   if(outcome==='success')resolveExport(receipt);else rejectExport(Error('fixture export failure'));
  }
  await tick();
  assert.match(ui.get('qa-status').textContent,outcome==='success'?success:error);
  assert.equal(ui.get(button).disabled,false);
  assert.equal(ui.window.document.activeElement?.id,button);
  assert.ok(ui.focusCalls.every(call=>!call.disabled));
 });
}

test('R2.1: preview stays source-linked and models Host failure separately from Provider',()=>{
 const html=read('preview/index.html');
 for(const value of ['../src/index.html','../src/style.css','../src/model.js','../src/main.js',
  'preview-fault','preview-seed','E_OUTCOME_UNKNOWN','E_STORAGE_CONFLICT','preview-ai'])
  assert.ok(html.includes(value),value);
});
test('R2.1: project release is exact canonical source build',async()=>{
 const tool=await createSidebarToolPackage(new URL('.',base).pathname);
 assert.equal(tool.version,'0.1.5');
 const candidate=process.env.OPENDESK_KNOWLEDGE_CANDIDATE;
 if(candidate!==undefined)assert.ok(isAbsolute(candidate),'OPENDESK_KNOWLEDGE_CANDIDATE must be an absolute path');
 const packagePath=candidate??new URL('ai-knowledge-answers.opendesk-tool.json',base);
 assert.ok(readFileSync(packagePath).equals(encodeSidebarToolPackage(tool)),
  'candidate or project release must match canonical source bytes exactly');
});
