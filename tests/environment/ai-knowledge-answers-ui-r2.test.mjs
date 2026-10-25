import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
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
 assert.match(code,/guard\(\(\)=>void load\(\),\{recover:true\}\)/);
 assert.match(code,/load\(\{silent:true\}\)/);
 assert.ok(code.includes("$('qa-delete').hidden"));
});
test('R2 UI: keyboard and confirmation controls exist without user-modal APIs',()=>{
 const html=read('src/index.html');
 assert.match(html,/role="tablist"/);
 assert.match(html,/aria-selected="true"/);
 assert.match(html,/aria-controls="qa-view-list"/);
 assert.match(html,/aria-label="返回知识列表"/);
 assert.match(html,/aria-labelledby="qa-review-message"/);
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
function mount(storage={value:null,requests:[],unknown:false}){
 const {window}=parseHTML('<html><body>'+read('src/index.html')+'</body></html>');
 const root=window.document.querySelector('main');
 const etag=()=>createHash('sha256').update(JSON.stringify(storage.value)).digest('hex');
 const context={TextEncoder,crypto:{randomUUID},AbortController,
  OpenDeskTool:{root,setState(){},async request(method,args){
   storage.requests.push({method,args:structuredClone(args)});
   if(method==='storage.get')return {value:structuredClone(storage.value),etag:etag()};
   assert.equal(method,'storage.set');assert.equal(args.ifMatch,etag());
   storage.value=structuredClone(args.value);
   if(storage.unknown)throw Object.assign(Error('receipt lost'),{code:'E_OUTCOME_UNKNOWN'});
   return {saved:true};
  }}};
 runInNewContext(read('src/model.js'),context);
 runInNewContext(read('src/main.js'),context);
 const get=id=>root.querySelector('#'+id);
 const click=id=>{assert.equal(Boolean(get(id).disabled),false,id+' must be usable');get(id).click();};
 const input=(id,value)=>{get(id).value=value;get(id).dispatchEvent(new window.Event('input'));};
 const save=()=>get('qa-editor').dispatchEvent(new window.Event('submit',{cancelable:true}));
 return {storage,get,click,input,save,window};
}
test('R2 component: save/read-back, reopen and synonym lookup retain the actual generated knowledge ID',async()=>{
 const ui=mount();await tick();
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
 assert.equal(reopened.get('qa-result-sources').querySelector('.qa-source-id').textContent,id);
 reopened.input('qa-query','退款需要多少天？');reopened.click('qa-ask');
 assert.equal(reopened.get('qa-result-kind').textContent,'检索到相关知识');
 assert.match(reopened.get('qa-result-sources').textContent,new RegExp(id));
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
