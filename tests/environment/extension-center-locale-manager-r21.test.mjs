import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform,build} from 'esbuild';
import * as React from 'react';
import {createExtensionCenterDOM} from '../helpers/extension-center-react-dom.mjs';
import {createExtensionCenter} from '../../src/ui/extension-center.js';
import {createToolLocaleService,toolLocaleStorageKey} from '../../src/ui/sidebar-tools/locale-packs.js';
import {createToolLocalization} from '../../src/ui/sidebar-tools/localization.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {createUiLocaleController} from '../../src/ui/app-localization.js';
import {createSidebarTools} from '../../src/ui/sidebar-tools.js';
import {createSidebarToolsView} from '../../src/ui/sidebar-tools-view.js';
import {MARKET_PROVENANCE_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {OFFICIAL_READING_TOC_RELEASE} from '../../src/sidebar-tools/official-reading-toc.js';
import {officialToolFixture} from '../helpers/official-tools.mjs';
import {createSidebarToolSandboxDOM} from '../helpers/sidebar-tool-sandbox-dom.mjs';

// Compile the production components, with CSS omitted only for the DOM emulator.
const compile=async(path,replacements)=>{
  const {code}=await transform(await readFile(new URL(path,import.meta.url),'utf8'),{loader:'tsx',format:'esm'});
  let output=code;
  for(const [from,to] of Object.entries(replacements))output=output.replaceAll(JSON.stringify(from),JSON.stringify(to));
  return 'data:text/javascript;base64,'+Buffer.from(output).toString('base64');
};
const deps={'react':import.meta.resolve('react'),'react-dom':import.meta.resolve('react-dom')};
const button=await compile('../../src/ui/react/components/ui/button.tsx',deps);
const tools=await compile('../../src/ui/react/tabs/tools.tsx',{...deps,'../components/ui/button.tsx':button});
const {default:LocaleManager}=await import(await compile('../../src/ui/react/tabs/locale-manager.tsx',{
  ...deps,'../components/ui/button.tsx':button,'./tools.tsx':tools,'./locale-manager.css':'data:text/javascript,export{}',
  '../../sidebar-tools/locale-packs.js':new URL('../../src/ui/sidebar-tools/locale-packs.js',import.meta.url).href
}));
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
async function settle(check){for(let i=0;i<100&&!check();i++)await tick();assert.ok(check(),'UI did not settle');}
const app={format:'opendesk.sidebar-tool.v1',id:'locale-demo',version:'1.0.0',title:'语言测试工具',
  description:'Translation fixture',capabilities:[],html:'<main>demo</main>',css:'',js:'void 0;'};
async function setup(t){
  const tool={...app,localization:await createToolLocalization({sourceLocale:'zh-CN',messages:{'zh-CN':{title:'标题',hello:'你好 {name}'},en:{title:'Title'}}})};
  const saved={[SIDEBAR_TOOL_STORE]:[tool]},listeners=new Set();
  const api={runtime:{getURL:path=>'chrome-extension://fixture/'+path},storage:{
    onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},
    local:{async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,structuredClone(saved[key])]));},
      async set(values){Object.assign(saved,structuredClone(values));},async remove(key){delete saved[key];}}}};
  const lockManager={request:async(name,work)=>work()};
  const service=createToolLocaleService({api,lockManager});await service.ready;t.after(()=>service.dispose());
  const pack={format:'opendesk.locale-pack.v1',toolId:tool.id,sourceLocale:'zh-CN',targetLocale:'ja',
    sourceCatalogHash:tool.localization.sourceCatalogHash,messages:{title:{source:'标题',text:'見出し'}}};
  return {tool,saved,api,service,pack};
}
const buttonNamed=(doc,text)=>[...doc.querySelectorAll('button')].find(node=>node.textContent===text);

test('confirmed Japanese import reaches the running official TOC through real manager, service, host and sandbox',async t=>{
  const tool=await officialToolFixture('reading-toc');
  const pack=JSON.parse(await readFile(new URL('../../examples/sidebar-tools/reading-toc/languages/ja.opendesk-locale.json',import.meta.url),'utf8'));
  const pin=OFFICIAL_READING_TOC_RELEASE;
  const saved={[SIDEBAR_TOOL_STORE]:[tool],
    [MARKET_PROVENANCE_STORE]:{[tool.id]:{marketId:pin.marketId,version:pin.version,sha256:pin.sha256}},
    business:{readingPosition:42}};
  const before=structuredClone(saved),writes=[],listeners=new Set();
  const api={runtime:{getURL:path=>'chrome-extension://fixture/'+path,async sendMessage(){}},storage:{
    onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},
    local:{async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,structuredClone(saved[key])]));},
      async set(values){writes.push(Object.keys(values));Object.assign(saved,structuredClone(values));},
      async remove(key){delete saved[key];}}}};
  const lockManager={request:async(name,work)=>work()};
  const service=createToolLocaleService({api,lockManager});await service.ready;t.after(()=>service.dispose());
  const ui=createExtensionCenterDOM(t,{component:LocaleManager,props:{model:{tools:[tool],toolId:tool.id,service,onClose(){}}}});
  const bridge=await build({entryPoints:[new URL('../../src/sidebar-tools/bridge.js',import.meta.url).pathname],
    bundle:true,write:false,format:'iife',globalName:'SandboxBridge',platform:'browser',define:{'import.meta.env.MODE':'"production"'}});
  const sandbox=createSidebarToolSandboxDOM(t,{hostWindow:ui.window,bridgeCode:bridge.outputFiles[0].text});
  const createElement=ui.doc.createElement.bind(ui.doc);
  ui.doc.createElement=tag=>{
    const node=createElement(tag);
    if(tag==='iframe')Object.defineProperty(node,'contentWindow',{value:sandbox.transport});
    return node;
  };
  const view=createSidebarToolsView(),frameRoot=ui.doc.createElement('div');
  ui.doc.body.append(frameRoot);view.attachRuntime({frameRoot,settingsControl:ui.doc.createElement('button')});
  const url='https://example.com/article',pageCalls=[];
  api.tabs={async sendMessage(tabId,message,options){
    pageCalls.push(message);assert.equal(tabId,7);assert.equal(message.expectedUrl,url);
    assert.deepEqual(options,{frameId:0,documentId:'locale-document'});
    return {ok:true,data:{items:[{id:'h-1',sourceId:'s-1',label:'业务标题保持原样',depth:0}],
      sources:[{id:'s-1',label:'当前文章'}],activeId:'h-1'}};
  }};
  const target={snapshot:{status:'available',url},
    capture:()=>({url,origin:'https://example.com',tabId:7,documentId:'locale-document'}),async revalidate(){return true;}};
  const host=createSidebarTools({api,doc:ui.doc,view,toolLocaleService:service,lockManager,currentPageTarget:target,
    fetcher:async()=>new Response('catalog intentionally offline',{status:503}),taskWorkbench:{}});
  t.after(()=>{host.dispose();view.dispose();});
  await host.ready;host.setVisible(true);host.openTool(tool.id);
  const frame=frameRoot.firstElementChild;assert.ok(frame);await frame.onload();
  const toc=sandbox.doc.getElementById('tool-root');
  await settle(()=>toc.querySelector('.toc-link'));
  assert.deepEqual(sandbox.errors,[]);
  assert.equal(sandbox.sent.find(row=>row.kind==='load').tool.js,tool.js,'run exact installed package JS');
  const heading=toc.querySelector('.toc-link'),scroll=toc.querySelector('.toc-scroll');
  scroll.scrollTop=37;heading.focus();
  const refresh=toc.querySelector('#toc-refresh'),source=tool.localization.messages['zh-CN'];
  assert.equal(refresh.getAttribute('aria-label'),source.refreshLabel);
  const picker=ui.doc.querySelector('input[type=file]');
  async function choose(next){
    Object.defineProperty(picker,'files',{configurable:true,value:[{size:JSON.stringify(next).length,text:async()=>JSON.stringify(next)}]});
    picker.dispatch('change');
    await settle(()=>Boolean(buttonNamed(ui.doc,'确认导入')||buttonNamed(ui.doc,'确认覆盖'))&&!picker.disabled);
  }
  async function confirm(label){
    buttonNamed(ui.doc,label).dispatch('click');
    await settle(()=>ui.doc.body.textContent.includes('语言包已保存。')&&!picker.disabled);
  }
  await choose(pack);
  assert.equal(refresh.getAttribute('aria-label'),source.refreshLabel,'preview does not affect the running UI');
  assert.equal(writes.length,0);
  buttonNamed(ui.doc,'取消导入').dispatch('click');
  assert.equal(writes.length,0);
  await choose(pack);await confirm('确认导入');
  await settle(()=>refresh.getAttribute('aria-label')===pack.messages.refreshLabel.text);
  assert.equal(sandbox.doc.documentElement.lang,'ja');
  assert.equal(toc.querySelector('.toc-panel').getAttribute('aria-label'),pack.messages.panelLabel.text);
  const updated=structuredClone(pack);updated.messages.refreshLabel.text='目次を再読み込み';
  await choose(updated);assert.equal(refresh.getAttribute('aria-label'),pack.messages.refreshLabel.text);
  await confirm('确认覆盖');await settle(()=>refresh.getAttribute('aria-label')==='目次を再読み込み');
  assert.equal(sandbox.doc.documentElement.lang,'ja','same language updates the live catalog');
  const invalid=structuredClone(updated);invalid.messages.refreshLabel.text='\u3000\u00a0';
  const writesBeforeInvalid=writes.length;
  Object.defineProperty(picker,'files',{configurable:true,value:[{size:100,text:async()=>JSON.stringify(invalid)}]});
  picker.dispatch('change');await settle(()=>ui.doc.querySelector('[role=alert]'));
  assert.equal(refresh.getAttribute('aria-label'),'目次を再読み込み','invalid data cannot blank the running button');
  assert.equal(writes.length,writesBeforeInvalid,'invalid import cannot overwrite the saved catalog');
  const partial=structuredClone(updated);delete partial.messages.refreshLabel;
  await choose(partial);await confirm('确认覆盖');
  await settle(()=>refresh.getAttribute('aria-label')===source.refreshLabel);
  assert.equal(toc.querySelector('.toc-panel').getAttribute('aria-label'),pack.messages.panelLabel.text,'only missing text falls back');
  buttonNamed(ui.doc,'删除语言包…').dispatch('click');buttonNamed(ui.doc,'取消删除').dispatch('click');
  assert.ok(service.exportPack(tool.id,'ja'));
  buttonNamed(ui.doc,'删除语言包…').dispatch('click');buttonNamed(ui.doc,'确认删除').dispatch('click');
  await settle(()=>ui.doc.body.textContent.includes('语言包已删除。'));
  assert.equal(toc.querySelector('.toc-panel').getAttribute('aria-label'),source.panelLabel);
  assert.equal(service.exportPack(tool.id,'ja'),null);
  assert.equal(frameRoot.firstElementChild,frame,'locale actions never recreate the iframe');
  assert.equal(toc.querySelector('.toc-link'),heading,'locale actions retain business DOM');
  assert.equal(heading.textContent,'业务标题保持原样');assert.equal(scroll.scrollTop,37);
  assert.equal(sandbox.doc.activeElement,heading,'emulated focus retains the business node');
  assert.equal(pageCalls.length,1,'locale actions never request a new TOC snapshot or navigate');
  assert.deepEqual(saved[SIDEBAR_TOOL_STORE],before[SIDEBAR_TOOL_STORE]);
  assert.deepEqual(saved[MARKET_PROVENANCE_STORE],before[MARKET_PROVENANCE_STORE]);
  assert.deepEqual(saved.business,before.business);
  assert.ok(writes.every(keys=>keys.length===1&&keys[0]===toolLocaleStorageKey(tool.id)),'only locale storage may change');
  assert.deepEqual(sandbox.errors,[]);
});

test('language preview, cancellation, confirmed import/overwrite/delete and shared global preference',async t=>{
  const f=await setup(t);
  const localeController=createUiLocaleController(f.api,{storage:()=>null,languages:['en']});await localeController.ready;t.after(()=>localeController.dispose());
  const model={tools:[f.tool],service:f.service,toolId:f.tool.id,localeController,onClose(){}};
  const ui=createExtensionCenterDOM(t,{component:LocaleManager,props:{model}}),{doc}=ui;
  const picker=doc.querySelector('input[type=file]');
  const choose=pack=>{Object.defineProperty(picker,'files',{configurable:true,value:[{size:100,text:async()=>JSON.stringify(pack)}]});picker.dispatch('change');};
  choose(f.pack);
  await settle(()=>buttonNamed(doc,'确认导入')&&!buttonNamed(doc,'确认导入').disabled);
  assert.equal(f.saved[toolLocaleStorageKey(f.tool.id)],undefined,'preview does not write');
  assert.match(doc.body.textContent,/缺失翻译：1 项/);
  buttonNamed(doc,'取消导入').dispatch('click');
  assert.equal(doc.querySelector('[aria-label="语言包导入预览"]'),null);
  choose(f.pack);await settle(()=>buttonNamed(doc,'确认导入')&&!buttonNamed(doc,'确认导入').disabled);
  buttonNamed(doc,'确认导入').dispatch('click');
  await settle(()=>doc.body.textContent.includes('语言包已保存。'));
  assert.equal(f.service.exportPack(f.tool.id,'ja').messages.title.text,'見出し');
  choose({...f.pack,messages:{title:{source:'标题',text:'題名'}}});
  await settle(()=>buttonNamed(doc,'确认覆盖')&&!buttonNamed(doc,'确认覆盖').disabled);
  assert.equal(f.service.exportPack(f.tool.id,'ja').messages.title.text,'見出し');
  buttonNamed(doc,'确认覆盖').dispatch('click');await settle(()=>doc.body.textContent.includes('语言包已保存。'));
  assert.equal(f.service.exportPack(f.tool.id,'ja').messages.title.text,'題名');
  buttonNamed(doc,'删除语言包…').dispatch('click');
  buttonNamed(doc,'取消删除').dispatch('click');assert.ok(f.service.exportPack(f.tool.id,'ja'));
  buttonNamed(doc,'删除语言包…').dispatch('click');buttonNamed(doc,'确认删除').dispatch('click');
  await settle(()=>doc.body.textContent.includes('语言包已删除。'));
  assert.equal(f.service.exportPack(f.tool.id,'ja'),null);
  const select=doc.querySelector('select');
  Object.defineProperty(select,'value',{configurable:true,value:'ja',writable:true});select.dispatch('change');
  await settle(()=>localeController.getPreference()==='ja'&&!picker.disabled);
  assert.equal(f.saved['opendesk.ui.locale.v1'],'ja');
  choose({...f.pack,messages:{title:{source:'标题',text:'<script>'}}});
  await settle(()=>doc.querySelector('[role=alert]'));
  assert.match(doc.querySelector('[role=alert]').textContent,/语言包不符合规则/);
  assert.equal(f.service.exportPack(f.tool.id,'ja'),null);
});

test('blank-label feedback explains source fallback without reporting storage corruption',async t=>{
  const f=await setup(t);await f.service.install(f.pack,f.tool);
  const ui=createExtensionCenterDOM(t,{component:LocaleManager,props:{model:{
    tools:[f.tool],service:f.service,toolId:f.tool.id,onClose(){}}}}),{doc}=ui;
  const before=structuredClone(f.saved),picker=doc.querySelector('input[type=file]');
  const invalid=structuredClone(f.pack);invalid.messages.title.text='\u3000\u00a0';
  Object.defineProperty(picker,'files',{value:[{size:100,text:async()=>JSON.stringify(invalid)}]});
  picker.dispatch('change');await settle(()=>doc.querySelector('[role=alert]'));
  assert.match(doc.querySelector('[role=alert]').textContent,/空白文案.*删除该词条以回退原文/);
  assert.doesNotMatch(doc.body.textContent,/语言存储状态需要核对/);
  assert.equal(doc.querySelector('[aria-label="语言包导入预览"]'),null);
  assert.equal(f.service.getState().status,'ready');assert.deepEqual(f.saved,before);
});

test('external pack opens preview and unavailable tool cannot import',async t=>{
  const f=await setup(t),ui=createExtensionCenterDOM(t,{component:LocaleManager,props:{model:{
    tools:[f.tool],service:f.service,toolId:f.tool.id,importPack:f.pack,onClose(){}}}});
  await settle(()=>buttonNamed(ui.doc,'确认导入')&&!buttonNamed(ui.doc,'确认导入').disabled);
  assert.equal(f.service.exportPack(f.tool.id,'ja'),null);
});

test('file selection/drop routes locale data away from code installer, including mixed and failed packs',async t=>{
  const f=await setup(t),ui=createExtensionCenterDOM(t),calls=[];
  // Keep this routing test synchronous: it inspects the actual controller model
  // without asking React.lazy to load a filesystem module from a data URL.
  let toolbar;
  const adapter={...ui.adapter,renderToolbar(model){toolbar=model;}};
  const center=createExtensionCenter({api:f.api,doc:ui.doc,client:{request:async()=>({installed:[]})},
    extensionList:adapter,toolLocaleService:f.service,sidebarTools:{openImportFiles(files){calls.push(files);return true;}},taskWorkbench:{}});
  t.after(()=>center.dispose());await center.refresh();
  const file=value=>({size:100,text:async()=>JSON.stringify(value)});
  await toolbar.onImportFiles([file(f.pack)]);
  assert.equal(calls.length,0);assert.equal(toolbar.localeManager.importPack.targetLocale,'ja');
  await toolbar.onImportFiles([file(f.pack),file(app)]);assert.equal(calls.length,0);
  await toolbar.onImportFiles([file({...f.pack,toolId:'unknown'})]);assert.equal(calls.length,0);
  await toolbar.onImportFiles([file(app)]);assert.equal(calls.length,1);
  ui.doc.dispatch('opendesk-language-settings',{detail:{toolId:f.tool.id}});
  assert.equal(toolbar.localeManager.toolId,f.tool.id);
  assert.equal(toolbar.localeManager.service,f.service);
  const before=toolbar.localeManager.session;
  center.dispose();ui.doc.dispatch('opendesk-language-settings',{detail:{toolId:'other'}});
  assert.equal(toolbar.localeManager.session,before);
});

test('exports real JSON data and missing AI tasks for an arbitrary target language',async t=>{
  const f=await setup(t),ui=createExtensionCenterDOM(t,{component:LocaleManager,props:{model:{
    tools:[f.tool],service:f.service,toolId:f.tool.id,onClose(){}}}}),{doc,window}=ui;
  const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
  const originalClick=window.HTMLElement.prototype.click,downloads=[];
  URL.createObjectURL=blob=>{downloads.push({blob});return 'blob:locale-export';};
  URL.revokeObjectURL=()=>{};
  window.HTMLElement.prototype.click=function(){
    if(this.tagName==='A')downloads.at(-1).filename=this.download;else originalClick.call(this);
  };
  t.after(()=>{URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;
    window.HTMLElement.prototype.click=originalClick;});
  const target=doc.querySelector('input[list]');target.value='fr';target.dispatch('input');
  buttonNamed(doc,'导出缺失翻译 AI 任务').dispatch('click');
  await settle(()=>downloads.length===1);
  const task=JSON.parse(await downloads[0].blob.text());
  assert.equal(task.pack.targetLocale,'fr');assert.equal(task.pack.toolId,f.tool.id);
  assert.equal(Object.keys(task.pack.messages).length,2);
  assert.match(downloads[0].filename,/\.fr\.translation-task\.json$/);
  assert.equal(f.service.exportPack(f.tool.id,'fr'),null,'task export never installs translations');
  await settle(()=>!doc.querySelector('input[type=file]').disabled);
  const picker=doc.querySelector('input[type=file]');
  Object.defineProperty(picker,'files',{value:[{size:100,text:async()=>JSON.stringify({...f.pack,targetLocale:'fr'})}]});
  picker.dispatch('change');await settle(()=>buttonNamed(doc,'确认导入')&&!buttonNamed(doc,'确认导入').disabled);
  buttonNamed(doc,'确认导入').dispatch('click');await settle(()=>doc.body.textContent.includes('语言包已保存。'));
  buttonNamed(doc,'导出语言包').dispatch('click');await settle(()=>downloads.length===2);
  assert.equal(JSON.parse(await downloads[1].blob.text()).targetLocale,'fr');
});

test('unknown/error storage recovery reloads without replaying install; samples and pack choices remain text',async t=>{
  const f=await setup(t);await f.service.install(f.pack,f.tool);
  let current=f.service.getState(),listener,reloads=0,installs=0;
  current.status='unknown';current.error={message:'结果未知'};
  const service={...f.service,getState:()=>current,subscribe(fn){listener=fn;return ()=>{};},
    async reload(){reloads++;current={...current,status:'ready',error:null};listener(current);return current;},
    install(){installs++;throw Error('must not replay');}};
  const ui=createExtensionCenterDOM(t,{component:LocaleManager,props:{model:{tools:[f.tool],toolId:f.tool.id,service,onClose(){}}}});
  await settle(()=>buttonNamed(ui.doc,'重新核对存储'));
  assert.match(ui.doc.body.textContent,/不会自动重放导入/);
  buttonNamed(ui.doc,'重新核对存储').dispatch('click');
  await settle(()=>ui.doc.body.textContent.includes('已重新核对存储'));
  assert.equal(reloads,1);assert.equal(installs,0);
  const picker=ui.doc.querySelector('input[type=file]');
  Object.defineProperty(picker,'files',{value:[{size:100,text:async()=>JSON.stringify(f.pack)}]});
  picker.dispatch('change');await settle(()=>buttonNamed(ui.doc,'确认覆盖')&&!buttonNamed(ui.doc,'确认覆盖').disabled);
  assert.match(ui.doc.querySelector('.od-locale-samples').textContent,/原文：标题译文：見出し/);
  const packChoice=ui.doc.querySelector('[aria-label="已安装语言包"] button');
  assert.match(packChoice.textContent,/ja/);packChoice.dispatch('click');
  assert.equal(ui.doc.querySelector('input[list]').value,'ja');
});

test('closing from tool settings restores that specific opener',async t=>{
  const f=await setup(t);let ui;
  function SettingsFixture({open=true}){
    return React.createElement(React.Fragment,null,
      React.createElement('button',{id:'sidebar-tool-language-manage'},'语言与翻译管理'),
      open&&React.createElement(LocaleManager,{model:{tools:[f.tool],service:f.service,toolId:f.tool.id,
        returnFocusSelector:'#sidebar-tool-language-manage',onClose(){ui.state.open=false;ui.paint();}}}));
  }
  ui=createExtensionCenterDOM(t,{component:SettingsFixture});
  buttonNamed(ui.doc,'关闭').dispatch('click');
  assert.equal(ui.doc.querySelector('[role=dialog]'),null);
  assert.equal(ui.doc.activeElement.id,'sidebar-tool-language-manage');
});

test('React file picker and drop surface forward the selected files to the same classifier',t=>{
  const received=[],ui=createExtensionCenterDOM(t,{props:{toolbarModel:{onImportFiles:files=>received.push(files)}}});
  const file={name:'fr.json',size:100,text:async()=>'{}'};
  const picker=ui.doc.getElementById('extension-center-file');
  Object.defineProperty(picker,'files',{value:[file]});picker.dispatch('change');
  ui.doc.querySelector('.ec-drop-surface').dispatch('drop',{dataTransfer:{types:['Files'],files:[file]}});
  assert.deepEqual(received,[[file],[file]]);
});

for(const outcome of ['success','global-error','pack-error']){
  test('global unknown requires explicit dual readback, no write replay: '+outcome,async t=>{
    const f=await setup(t),subscribers=new Set();
    let globalError=Object.assign(Error('全局语言保存结果未知'),{code:'E_UI_LOCALE_OUTCOME_UNKNOWN'});
    let loads=0,reloads=0,writes=0,installs=0,finishGlobal,finishPacks;
    const globalPending=new Promise(resolve=>{finishGlobal=resolve;});
    const packPending=new Promise(resolve=>{finishPacks=resolve;});
    const localeController={getPreference:()=> 'auto',getError:()=>globalError,
      subscribe(fn){subscribers.add(fn);return ()=>subscribers.delete(fn);},
      async setLocale(){writes++;},async load(){loads++;await globalPending;
        if(outcome!=='global-error')globalError=null;
        for(const fn of subscribers)fn();return 'en';}};
    const service={...f.service,async reload(){reloads++;await packPending;
      if(outcome==='pack-error')throw Error('语言包存储读取失败');return f.service.getState();},
      install(){installs++;throw Error('must not replay install');}};
    const ui=createExtensionCenterDOM(t,{component:LocaleManager,props:{model:{
      tools:[f.tool],toolId:f.tool.id,service,localeController,onClose(){}}}}),{doc}=ui;
    const select=doc.querySelector('select');
    assert.equal(select.disabled,true);
  assert.match(doc.querySelector('[aria-label="默认语言存储错误"]').textContent,/保存结果未知.*重新核对存储/);
    assert.match(doc.body.textContent,/已暂停写入/);
    await tick();assert.equal(loads,0,'mount never silently clears unknown outcome');
    buttonNamed(doc,'重新核对存储').dispatch('click');
    await settle(()=>loads===1&&reloads===1);
    finishPacks();await tick();
    assert.equal(buttonNamed(doc,'重新核对存储').disabled,true,'wait for BOTH reads');
    assert.equal(select.disabled,true);
    assert.equal(doc.body.textContent.includes('已重新核对存储，请审阅当前状态后继续。'),false);
    finishGlobal();
    if(outcome==='success'){
      await settle(()=>doc.body.textContent.includes('已重新核对存储，请审阅当前状态后继续。'));
      assert.equal(select.disabled,false);
      assert.equal(doc.querySelector('[aria-label="默认语言存储错误"]'),null);
    }else{
      await settle(()=>!buttonNamed(doc,'重新核对存储').disabled);
      assert.equal(doc.body.textContent.includes('已重新核对存储，请审阅当前状态后继续。'),false);
      if(outcome==='global-error')assert.equal(select.disabled,true);
      else assert.match(doc.body.textContent,/语言包存储读取失败/);
    }
    assert.equal(writes,0);assert.equal(installs,0);assert.equal(loads,1);assert.equal(reloads,1);
  });
}

test('real locale controller unknown outcome stays blocked until explicit manager readback',async t=>{
  const f=await setup(t),key='opendesk.ui.locale.v1';
  const localeController=createUiLocaleController(f.api,{storage:()=>null,languages:['en']});
  await localeController.ready;t.after(()=>localeController.dispose());
  const originalGet=f.api.storage.local.get,originalSet=f.api.storage.local.set;
  let unreadable=false,writes=0;
  f.api.storage.local.get=async keys=>{
    if(keys===key&&unreadable)throw Error('global readback unavailable');return originalGet(keys);
  };
  f.api.storage.local.set=async values=>{
    if(Object.hasOwn(values,key)){writes++;await originalSet(values);unreadable=true;return;}
    return originalSet(values);
  };
  const ui=createExtensionCenterDOM(t,{component:LocaleManager,props:{model:{
    tools:[f.tool],toolId:f.tool.id,service:f.service,localeController,onClose(){}}}}),{doc}=ui;
  const select=doc.querySelector('select');
  Object.defineProperty(select,'value',{configurable:true,value:'ja',writable:true});select.dispatch('change');
  await settle(()=>localeController.getError()?.code==='E_UI_LOCALE_OUTCOME_UNKNOWN'&&select.disabled);
  assert.match(doc.querySelector('[aria-label="默认语言存储错误"]').textContent,/保存结果未知.*重新核对存储/);
  await settle(()=>!buttonNamed(doc,'重新核对存储').disabled);
  buttonNamed(doc,'重新核对存储').dispatch('click');
  await settle(()=>!buttonNamed(doc,'重新核对存储').disabled);
  assert.equal(select.disabled,true);assert.equal(writes,1);
  unreadable=false;buttonNamed(doc,'重新核对存储').dispatch('click');
  await settle(()=>!select.disabled&&doc.body.textContent.includes('已重新核对存储'));
  assert.equal(localeController.getError(),null);assert.equal(localeController.getPreference(),'ja');
  assert.equal(writes,1,'recovery reconciles the durable value, never saves again');
});

test('actual extension page and lazy locale manager compile with scoped CSS (no browser)',async()=>{
  const result=await build({stdin:{contents:"export {ExtensionCenterPage} from './src/ui/react/tabs/tools.tsx';",
    loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,outdir:'/virtual/locale-manager-compile-r21',
    platform:'browser',format:'esm',logLevel:'silent'});
  assert.ok(result.outputFiles.some(file=>file.path.endsWith('.js')));
  const css=result.outputFiles.find(file=>file.path.endsWith('.css'))?.text;
  assert.match(css,/\.od-locale-manager/);assert.match(css,/flex-wrap: wrap/);
});
