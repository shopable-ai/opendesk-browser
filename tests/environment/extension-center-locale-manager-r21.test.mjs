import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform,build} from 'esbuild';
import * as React from 'react';
import {createExtensionCenter} from '../../src/ui/extension-center.js';
import {createToolLocaleService,toolLocaleStorageKey} from '../../src/ui/sidebar-tools/locale-packs.js';
import {createToolLocalization} from '../../src/ui/sidebar-tools/localization.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {localeManagerLocale,localeManagerText as msg,localeManagerMessageKeys} from '../../src/ui/locale-manager-localization.js';
import {createUiLocaleController} from '../../src/ui/app-localization.js';
import {createSidebarTools} from '../../src/ui/sidebar-tools.js';
import {createSidebarToolsView} from '../../src/ui/sidebar-tools-view.js';
import {MARKET_PROVENANCE_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {OFFICIAL_READING_TOC_RELEASE} from '../../src/sidebar-tools/official-reading-toc.js';
import {officialToolFixture} from '../helpers/official-tools.mjs';
import {createSidebarToolSandboxDOM} from '../helpers/sidebar-tool-sandbox-dom.mjs';

// Compile the production components, with CSS omitted only for the DOM emulator.
const compile=async(path,replacements)=>{
  const sourceUrl=new URL(path,import.meta.url);
  let source=await readFile(sourceUrl,'utf8');
  if(path==='../helpers/extension-center-react-dom.mjs'){
    // This fixture also compiles tools.tsx. Supply its new static import mapping
    // in memory, keeping the shared fixture file untouched.
    source=source.replace(/import\.meta\.resolve\('([^']+)'\)/g,(_,name)=>JSON.stringify(import.meta.resolve(name)));
    source=source.replace("'../components/ui/button.tsx':button",
      "'../components/ui/button.tsx':button,'../../locale-manager-localization.js':"+
      JSON.stringify(new URL('../../src/ui/locale-manager-localization.js',import.meta.url).href));
  }
  const {code}=await transform(source,{loader:'tsx',format:'esm',
    define:{'import.meta.url':JSON.stringify(sourceUrl.href)}});
  let output=code;
  for(const [from,to] of Object.entries(replacements)){
    if(path==='../helpers/extension-center-react-dom.mjs'){
      // Rewrite imports only; the nested compiler's bare-specifier keys must remain intact.
      output=output.replaceAll('from '+JSON.stringify(from),'from '+JSON.stringify(to))
        .replaceAll('import('+JSON.stringify(from)+')','import('+JSON.stringify(to)+')');
    }else output=output.replaceAll(JSON.stringify(from),JSON.stringify(to));
  }
  return 'data:text/javascript;base64,'+Buffer.from(output).toString('base64');
};
const deps={'react':import.meta.resolve('react'),'react-dom':import.meta.resolve('react-dom')};
const {createExtensionCenterDOM}=await import(await compile('../helpers/extension-center-react-dom.mjs',{
  ...deps,'react-dom/client':import.meta.resolve('react-dom/client'),
  esbuild:import.meta.resolve('esbuild'),linkedom:import.meta.resolve('linkedom')
}));
const button=await compile('../../src/ui/react/components/ui/button.tsx',deps);
const toggle=await compile('../../src/ui/react/components/ui/switch.tsx',{
  ...deps,'react-aria-components':import.meta.resolve('react-aria-components')
});
const tools=await compile('../../src/ui/react/tabs/tools.tsx',{...deps,'../components/ui/button.tsx':button,
  '../components/ui/switch.tsx':toggle,
  '../../locale-manager-localization.js':new URL('../../src/ui/locale-manager-localization.js',import.meta.url).href});
const {default:LocaleManager}=await import(await compile('../../src/ui/react/tabs/locale-manager.tsx',{
  ...deps,'../components/ui/button.tsx':button,'./tools.tsx':tools,'./locale-manager.css':'data:text/javascript,export{}',
  '../../locale-manager-localization.js':new URL('../../src/ui/locale-manager-localization.js',import.meta.url).href,
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
const openPacks=doc=>{doc.querySelector('.od-locale-nav').dispatch('click');return doc.getElementById('od-locale-pack-tool');};
const resourceAction=(doc,locale,index)=>[...doc.querySelectorAll('.od-locale-resource')]
  .find(node=>node.textContent.includes(locale))?.querySelectorAll('button')[index];
const backLocale=doc=>doc.querySelector('.od-locale-heading button').dispatch('click');

const selectValue=(select,value)=>{
  Object.defineProperty(select,'value',{configurable:true,value,writable:true});select.dispatch('change');
};

test('R6.10 language and translation lives in More and delegates the original native event',t=>{
  const events=[];
  const ui=createExtensionCenterDOM(t,{props:{toolbarModel:{menuOpen:false,
    onLanguageSettings:event=>events.push(event)}}});
  const action=ui.doc.getElementById('extension-center-language-settings');
  assert.equal(action.textContent,'语言与翻译');
  assert.equal(action.closest('#extension-center-menu').hidden,true);
  assert.deepEqual([...ui.doc.querySelector('.ec-toolbar').children].map(node=>node.id||node.className),
    ['ec-search','extension-center-market','extension-center-menu-wrap']);
  assert.equal(events.length,0,'rendering must not open language settings');
  ui.adapter.renderToolbar({menuOpen:true,onLanguageSettings:event=>events.push(event)});
  assert.equal(action.closest('#extension-center-menu').hidden,false);
  const nativeEvent=action.dispatch('click');
  assert.deepEqual(events,[nativeEvent]);
});

test('daily tool choices save their scope, follow the default only when requested, and retain focus',async t=>{
  const f=await setup(t);await f.service.install(f.pack,f.tool);await f.service.setToolLocale(f.tool.id,'ja');
  const localeController=createUiLocaleController(f.api,{storage:()=>null,languages:['zh-CN']});
  await localeController.ready;t.after(()=>localeController.dispose());
  const untouched=structuredClone(f.saved[SIDEBAR_TOOL_STORE]);
  const ui=createExtensionCenterDOM(t,{component:LocaleManager,props:{model:{
    tools:[f.tool],toolId:f.tool.id,service:f.service,localeController,onClose(){}}}}),{doc}=ui;
  const select=doc.getElementById('od-locale-tool-language');
  const status=()=>doc.getElementById('od-locale-tool-status').textContent;
  assert.equal(doc.getElementById('od-locale-tool'),null);
  assert.match(doc.body.textContent,/当前工具：语言测试工具/);
  assert.equal(doc.querySelector('#od-locale-target'),null,'template target is not on the daily page');
  assert.match(status(),/日本語.*仅此工具/);
  for(const [value,label] of [['zh-CN','简体中文'],['en','English'],['ja','日本語']]){
    select.focus();selectValue(select,value);
    await settle(()=>f.service.getToolLocale(f.tool.id)===value&&!select.disabled);
    assert.equal(f.service.getCatalog(f.tool,localeController.getLocale()).locale,value);
    assert.match(status(),new RegExp(label+'.*仅此工具'));
    assert.equal(localeController.getPreference(),'auto');
  }
  selectValue(select,'follow');
  await settle(()=>f.service.getToolLocale(f.tool.id)===null&&!select.disabled);
  assert.match(status(),/简体中文.*跟随 OpenDesk/);
  await localeController.setLocale('en');await settle(()=>/English.*Follow OpenDesk/.test(status()));
  assert.deepEqual(f.saved[SIDEBAR_TOOL_STORE],untouched,'language settings never rewrite installed code');
});

test('missing default opens language pack subpage without changing actual preference',async t=>{
  const f=await setup(t);await f.service.install(f.pack,f.tool);
  const localeController=createUiLocaleController(f.api,{storage:()=>null,languages:['zh-TW']});
  await localeController.ready;t.after(()=>localeController.dispose());
  const ui=createExtensionCenterDOM(t,{component:LocaleManager,props:{model:{
    tools:[f.tool],toolId:f.tool.id,service:f.service,localeController,onClose(){}}}}),{doc}=ui;
  assert.match(doc.body.textContent,/暂未提供 繁體中文，当前使用 简体中文/);
  const before=structuredClone(f.saved);
  openPacks(doc);
  assert.ok(doc.getElementById('od-locale-pack-tool'));
  assert.equal(doc.getElementById('od-locale-global'),null,'daily settings are replaced, not duplicated');
  assert.equal(f.service.getToolLocale(f.tool.id),null);
  assert.deepEqual(f.saved,before);
  backLocale(doc);assert.ok(doc.getElementById('od-locale-global'));
});

test('failed daily save reports error without claiming the selected language took effect',async t=>{
  const f=await setup(t);let attempts=0;
  const service={...f.service,async setToolLocale(){attempts++;throw Object.assign(Error('quota'),{code:'E_LOCALE_QUOTA'});}};
  const ui=createExtensionCenterDOM(t,{component:LocaleManager,props:{model:{
    tools:[f.tool],toolId:f.tool.id,service,onClose(){}}}}),{doc}=ui;
  const before=structuredClone(f.saved),select=doc.getElementById('od-locale-tool-language');
  selectValue(select,'en');await settle(()=>doc.querySelector('[role=alert]')&&!select.disabled);
  assert.match(doc.querySelector('[role=alert]').textContent,/本地存储空间不足/);
  assert.match(doc.getElementById('od-locale-tool-status').textContent,/简体中文.*跟随 OpenDesk/);
  assert.deepEqual(f.saved,before);assert.equal(attempts,1);
});

for(const getter of ['getAvailableLocales','getToolLocale','getCatalog']){
  test('unreadable daily preference blocks writes until explicit successful readback: '+getter,async t=>{
    const f=await setup(t);let unreadable=true,writes=0;
    const service={...f.service,[getter](...args){if(unreadable)throw Error('工具语言读取失败');return f.service[getter](...args);},
      async setToolLocale(){writes++;}};
    const ui=createExtensionCenterDOM(t,{component:LocaleManager,props:{model:{
      tools:[f.tool],toolId:f.tool.id,service,onClose(){}}}}),{doc}=ui;
    const select=doc.getElementById('od-locale-tool-language');
    assert.equal(select.disabled,true);assert.equal(select.value,'unreadable');
    assert.match(doc.querySelector('[aria-label="工具语言读取错误"]').textContent,/读取失败/);
    selectValue(select,'en');assert.equal(writes,0);
    buttonNamed(doc,'重新核对存储').dispatch('click');
    await settle(()=>!buttonNamed(doc,'重新核对存储').disabled);
    unreadable=false;buttonNamed(doc,'重新核对存储').dispatch('click');
    await settle(()=>!select.disabled&&doc.body.textContent.includes('已重新核对存储，请审阅'));
    assert.equal(writes,0);
  });
}

test('back navigation cancels delete confirmation without deleting custom resources',async t=>{
  const f=await setup(t);await f.service.install(f.pack,f.tool);
  let removals=0;const service={...f.service,async remove(){removals++;}};
  const ui=createExtensionCenterDOM(t,{component:LocaleManager,props:{model:{
    tools:[f.tool],toolId:f.tool.id,service,onClose(){}}}}),{doc}=ui;
  openPacks(doc);
  resourceAction(doc,'ja',1).dispatch('click');
  assert.ok(doc.querySelector('[aria-label="删除语言包确认"]'));
  backLocale(doc);
  assert.equal(doc.querySelector('[aria-label="删除语言包确认"]'),null);
  backLocale(doc);
  assert.ok(doc.getElementById('od-locale-global'));
  assert.equal(removals,0);assert.ok(f.service.exportPack(f.tool.id,'ja'));
});

test('Escape is layered: import preview -> packs -> settings -> close',async t=>{
  const f=await setup(t);let closes=0;
  const ui=createExtensionCenterDOM(t,{component:LocaleManager,props:{model:{
    tools:[f.tool],toolId:f.tool.id,service:f.service,importPack:f.pack,onClose(){closes++;}}}}),{doc}=ui;
  await settle(()=>buttonNamed(doc,'确认导入'));
  doc.dispatch('keydown',{key:'Escape'});
  assert.ok(doc.getElementById('od-locale-pack-tool'));
  doc.dispatch('keydown',{key:'Escape'});
  assert.ok(doc.getElementById('od-locale-global'));
  doc.dispatch('keydown',{key:'Escape'});
  assert.equal(closes,1);
});

test('cancel import and delete are read-only and preserve installed content',async t=>{
  const f=await setup(t);await f.service.install(f.pack,f.tool);
  const before=structuredClone(f.saved);
  const ui=createExtensionCenterDOM(t,{component:LocaleManager,props:{model:{
    tools:[f.tool],toolId:f.tool.id,service:f.service,importPack:f.pack,onClose(){}}}}),{doc}=ui;
  await settle(()=>buttonNamed(doc,'取消导入'));
  buttonNamed(doc,'取消导入').dispatch('click');
  assert.ok(doc.getElementById('od-locale-pack-tool'));
  resourceAction(doc,'ja',1).dispatch('click');
  buttonNamed(doc,'取消删除').dispatch('click');
  assert.equal(doc.querySelector('[aria-label="删除语言包确认"]'),null);
  assert.deepEqual(f.saved,before);
});

test('confirmed Japanese import reaches the running official TOC through real manager, service, host and sandbox',async t=>{
  const tool=await officialToolFixture('reading-toc');
  const pack=JSON.parse(await readFile(new URL('../../examples/sidebar-tools/reading-toc/languages/ja.opendesk-locale.json',import.meta.url),'utf8'));
  // Distinguish imported data from the current built-in Japanese catalog.
  pack.messages.refreshLabel.text='インポート済み目次を更新';
  pack.messages.panelLabel.text='インポート済み目次';
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
  await service.setToolLocale(tool.id,'ja');
  const writesBeforePreview=writes.length;
  const frame=frameRoot.firstElementChild;assert.ok(frame);await frame.onload();
  const toc=sandbox.doc.getElementById('tool-root');
  await settle(()=>toc.querySelector('.toc-link'));
  assert.deepEqual(sandbox.errors,[]);
  assert.equal(sandbox.sent.find(row=>row.kind==='load').tool.js,tool.js,'run exact installed package JS');
  const heading=toc.querySelector('.toc-link'),scroll=toc.querySelector('.toc-scroll');
  scroll.scrollTop=37;heading.focus();
  const refresh=toc.querySelector('#toc-refresh'),builtin=tool.localization.messages.ja;
  assert.equal(refresh.getAttribute('aria-label'),builtin.refreshLabel);
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
  assert.equal(refresh.getAttribute('aria-label'),builtin.refreshLabel,'preview does not affect the running UI');
  assert.equal(writes.length,writesBeforePreview);
  buttonNamed(ui.doc,'取消导入').dispatch('click');
  assert.equal(writes.length,writesBeforePreview);
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
  await settle(()=>refresh.getAttribute('aria-label')===builtin.refreshLabel);
  assert.equal(toc.querySelector('.toc-panel').getAttribute('aria-label'),pack.messages.panelLabel.text,'missing custom text falls back to built-in Japanese');
  buttonNamed(ui.doc,'删除语言包…').dispatch('click');buttonNamed(ui.doc,'取消删除').dispatch('click');
  assert.ok(service.exportPack(tool.id,'ja'));
  buttonNamed(ui.doc,'删除语言包…').dispatch('click');buttonNamed(ui.doc,'确认删除').dispatch('click');
  await settle(()=>ui.doc.body.textContent.includes('语言包已删除。'));
  assert.equal(toc.querySelector('.toc-panel').getAttribute('aria-label'),builtin.panelLabel);
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
  const localeController=createUiLocaleController(f.api,{storage:()=>null,languages:['zh-CN']});await localeController.ready;t.after(()=>localeController.dispose());
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
  const select=doc.getElementById('od-locale-global');
  Object.defineProperty(select,'value',{configurable:true,value:'ja',writable:true});select.dispatch('change');
  await settle(()=>localeController.getPreference()==='ja'&&!picker.disabled);
  assert.equal(f.saved['opendesk.ui.locale.v1'],'ja');
  assert.ok(doc.body.textContent.includes(msg('ja','globalSaved',{language:'日本語'})));
  choose({...f.pack,messages:{title:{source:'标题',text:'<script>'}}});
  await settle(()=>doc.querySelector('[role=alert]'));
  assert.equal(doc.querySelector('[role=alert]').textContent,msg('ja','invalidPack'));
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
  const packChoice=[...ui.doc.querySelectorAll('[aria-label="已安装语言包"] button')]
    .find(node=>node.querySelector('strong')?.textContent==='日本語');
  assert.ok(packChoice);assert.match(packChoice.textContent,/已导入/);packChoice.dispatch('click');
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
    const select=doc.getElementById('od-locale-global');
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
  const localeController=createUiLocaleController(f.api,{storage:()=>null,languages:['zh-CN']});
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
  const select=doc.getElementById('od-locale-global');
  Object.defineProperty(select,'value',{configurable:true,value:'ja',writable:true});select.dispatch('change');
  await settle(()=>localeController.getError()?.code==='E_UI_LOCALE_OUTCOME_UNKNOWN'&&select.disabled);
  assert.match(doc.querySelector('[aria-label="'+msg('ja','globalReadError')+'"]').textContent,/保存結果が不明/);
  await settle(()=>!buttonNamed(doc,msg('ja','recheck')).disabled);
  buttonNamed(doc,msg('ja','recheck')).dispatch('click');
  await settle(()=>!buttonNamed(doc,msg('ja','recheck')).disabled);
  assert.equal(select.disabled,true);assert.equal(writes,1);
  unreadable=false;buttonNamed(doc,msg('ja','recheck')).dispatch('click');
  await settle(()=>!select.disabled&&doc.body.textContent.includes(msg('ja','rechecked')));
  assert.equal(localeController.getError(),null);assert.equal(localeController.getPreference(),'ja');
  assert.equal(writes,1,'recovery reconciles the durable value, never saves again');
});

test('actual extension page and lazy locale manager compile without an unreferenced CSS asset (no browser)',async()=>{
  const result=await build({stdin:{contents:"export {ExtensionCenterPage} from './src/ui/react/tabs/tools.tsx';",
    loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,outdir:'/virtual/locale-manager-compile-r21',
    platform:'browser',format:'esm',logLevel:'silent'});
  assert.ok(result.outputFiles.some(file=>file.path.endsWith('.js')));
  assert.equal(result.outputFiles.some(file=>file.path.endsWith('.css')),false,
    'locale styles are carried by the trusted React root, not a detached component asset');
});

// These are DOM-emulator interactions, not native Chrome evidence.
for(const locale of ['zh-CN','en','ja']){
  test('trusted panel renders and operates entirely in '+locale+' independently of the tool pack',async t=>{
    const f=await setup(t);
    await f.service.install(f.pack,f.tool);
    await f.service.setToolLocale(f.tool.id,'en');
    const controller=createUiLocaleController(f.api,{storage:()=>null,languages:[locale]});
    await controller.ready;t.after(()=>controller.dispose());
    const ui=createExtensionCenterDOM(t,{component:LocaleManager,props:{model:{
      tools:[f.tool],toolId:f.tool.id,service:f.service,localeController:controller,onClose(){}}}}),{doc}=ui;
    const text=(key,params)=>msg(locale,key,params),button=key=>buttonNamed(doc,text(key));
    const before=structuredClone(f.saved);
    assert.ok(doc.body.textContent.includes(text('globalLabel')));
    assert.ok(doc.body.textContent.includes(text('toolHint')));
    assert.equal(doc.querySelector('summary').textContent,text('maintenance'));
    assert.ok(button('close'));assert.ok(button('import'));
    assert.equal(doc.querySelector('input[type=file]').getAttribute('aria-label'),text('fileLabel'));
    const target=doc.getElementById('od-locale-target');target.value='ja';target.dispatch('input');
    assert.equal(f.service.getToolLocale(f.tool.id),'en');assert.deepEqual(f.saved,before);
    assert.ok([...doc.querySelectorAll('datalist option')].some(node=>node.value==='ja'));
    const picker=doc.querySelector('input[type=file]');
    const choose=()=>{Object.defineProperty(picker,'files',{configurable:true,value:[{size:100,text:async()=>JSON.stringify(f.pack)}]});picker.dispatch('change');};
    choose();await settle(()=>button('confirmOverwrite')&&!button('confirmOverwrite').disabled);
    assert.ok(doc.querySelector('[aria-label="'+text('previewLabel')+'"]'));
    assert.equal(doc.activeElement.textContent,text('preview'));
    assert.ok(doc.body.textContent.includes(text('overwriteHint')));
    assert.ok(doc.querySelector('.od-locale-samples').textContent.includes('見出し'),'imported content remains literal data');
    button('cancelImport').dispatch('click');assert.deepEqual(f.saved,before);
    choose();await settle(()=>button('confirmOverwrite')&&!button('confirmOverwrite').disabled);
    button('confirmOverwrite').dispatch('click');
    await settle(()=>doc.body.textContent.includes(text('packSaved',{language:'English'}))&&!picker.disabled);
    assert.equal(f.service.getToolLocale(f.tool.id),'en');assert.equal(controller.getPreference(),'auto');
    button('delete').dispatch('click');
    assert.ok(doc.body.textContent.includes(text('deleteQuestion',{title:f.tool.title,locale:'ja'})));
    button('cancelDelete').dispatch('click');assert.ok(f.service.exportPack(f.tool.id,'ja'));
    button('delete').dispatch('click');button('confirmDelete').dispatch('click');
    await settle(()=>doc.body.textContent.includes(text('deleted'))&&!picker.disabled);
    assert.equal(f.service.exportPack(f.tool.id,'ja'),null);
    const next=locale==='en'?'ja':'en';
    await controller.setLocale(next);await settle(()=>doc.body.textContent.includes(msg(next,'deleted')));
    assert.equal(doc.body.textContent.includes(text('deleted')),false,'existing feedback is retranslated');
    assert.equal(f.service.getToolLocale(f.tool.id),'en');
  });
}

for(const preference of [null,'en']){
  test('import only saves resources and preserves global/tool preference '+preference,async t=>{
    const f=await setup(t);await f.service.setToolLocale(f.tool.id,preference);
    const controller=createUiLocaleController(f.api,{storage:()=>null,languages:['en']});
    await controller.ready;t.after(()=>controller.dispose());
    const ui=createExtensionCenterDOM(t,{component:LocaleManager,props:{model:{
      tools:[f.tool],toolId:f.tool.id,service:f.service,localeController:controller,importPack:f.pack,onClose(){}}}}),{doc}=ui;
    await settle(()=>buttonNamed(doc,msg('en','confirmImport'))&&!buttonNamed(doc,msg('en','confirmImport')).disabled);
    buttonNamed(doc,msg('en','confirmImport')).dispatch('click');
    await settle(()=>doc.body.textContent.includes(msg('en','packSaved',{language:'English'})));
    assert.equal(f.service.getToolLocale(f.tool.id),preference);
    assert.equal(controller.getPreference(),'auto');assert.equal(controller.getLocale(),'en');
    assert.equal(f.saved['opendesk.ui.locale.v1'],undefined);
    assert.equal(f.service.getCatalog(f.tool,'en').locale,'en');
    assert.ok(f.service.exportPack(f.tool.id,'ja'));
  });
}

test('fixed catalog covers every used message in three languages with intact placeholders and explicit fallback',async()=>{
  const source=await readFile(new URL('../../src/ui/react/tabs/locale-manager.tsx',import.meta.url),'utf8');
  for(const key of [...source.matchAll(/(?:\bt\(|key:|localeMessage:|localError\()'([a-zA-Z]+)'/g)].map(row=>row[1])){
    assert.ok(localeManagerMessageKeys.includes(key),key);
  }
  const placeholders=new Proxy({},{get:(_,name)=>'{'+String(name)+'}'});
  for(const key of localeManagerMessageKeys){
    const zh=msg('zh-CN',key,placeholders),tokens=value=>[...value.matchAll(/\{(\w+)\}/g)].map(row=>row[1]).sort();
    assert.ok(zh,key);
    for(const locale of ['en','ja']){
      const translated=msg(locale,key,placeholders);assert.ok(translated,locale+'.'+key);
      // These Japanese terms correctly share the same written form as Chinese.
      if(!(locale==='ja'&&['sourcePrefix','sourceResource'].includes(key)))
        assert.notEqual(translated,zh,locale+'.'+key+' must have its own trusted translation');
      assert.deepEqual(tokens(translated),tokens(zh));
    }
  }
  assert.equal(localeManagerLocale('zh-TW'),'zh-CN');assert.equal(localeManagerLocale('fr'),'zh-CN');
  assert.equal(msg('zh-CN','languageAction'),'语言');
  assert.equal(msg('en','languageAction'),'Language');assert.equal(msg('ja','languageAction'),'言語');
});

test('auto browser language changes retranslate retained errors and preserve raw unknown details',async t=>{
  const f=await setup(t),listeners=new Set();let locale='zh-CN';
  const controller={getLocale:()=>locale,getPreference:()=> 'auto',getError:()=>null,
    subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);}};
  const detail='original backend detail <not HTML> '+ 'x'.repeat(200);
  const service={...f.service,async setToolLocale(){throw Error(detail);}};
  const ui=createExtensionCenterDOM(t,{component:LocaleManager,props:{model:{tools:[f.tool],
    toolId:f.tool.id,service,localeController:controller,onClose(){}}}}),{doc}=ui;
  selectValue(doc.getElementById('od-locale-tool-language'),'en');
  await settle(()=>doc.querySelector('[role=alert]'));
  for(const next of ['en','ja','zh-TW']){
    locale=next;for(const fn of listeners)fn();
    await settle(()=>doc.querySelector('[role=alert]').textContent===msg(next,'unknownError')+' '+detail);
    assert.equal(doc.querySelector('[role=alert]').querySelector('not'),null,'detail is rendered as plain text');
    if(next==='zh-TW')assert.ok(doc.body.textContent.includes(msg(next,'panelFallback',{requested:'繁體中文',effective:'简体中文'})));
  }
});

for(const [code,key,message] of [
  ['E_LOCALE_OUTCOME_UNKNOWN','outcomeUnknown'],['E_LOCALE_RECOVERY_REQUIRED','recoveryRequired'],
  ['E_TOOL_CHANGED','toolChanged'],['E_TOOL_NO_LOCALIZATION','noLocalization'],
  ['E_LOCALE_QUOTA','quota'],['E_UI_LOCALE_STORAGE','localeStorage'],
  ['syntax','invalidJson'],['E_TOOL_LOCALIZATION','blankText','blank message text'],
  ['E_LOCALE_PACK','invalidPack'],['E_TOOL_LOCALIZATION_SCHEMA','invalidPack']
]){
  test('retained safety error re-renders in every panel language: '+code,async t=>{
    const f=await setup(t),listeners=new Set();let locale='zh-CN',writes=0;
    const controller={getLocale:()=>locale,getPreference:()=> 'auto',getError:()=>null,
      subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);}};
    const failure=code==='syntax'?new SyntaxError('invalid'):Object.assign(Error(message||'raw'),{code});
    const service={...f.service,async setToolLocale(){writes++;throw failure;}};
    const ui=createExtensionCenterDOM(t,{component:LocaleManager,props:{model:{tools:[f.tool],
      toolId:f.tool.id,service,localeController:controller,onClose(){}}}}),{doc}=ui;
    selectValue(doc.getElementById('od-locale-tool-language'),'en');
    await settle(()=>doc.querySelector('[role=alert]'));
    for(const next of ['zh-CN','en','ja']){
      locale=next;for(const fn of listeners)fn();
      await settle(()=>doc.querySelector('[role=alert]').textContent===msg(next,key));
    }
    assert.equal(writes,1,'translation changes cannot replay a failed action');
  });
}

for(const locale of ['en','ja']){
  test('busy feedback and close guards stay localized in '+locale,async t=>{
    const f=await setup(t);let finish,closes=0;
    const pending=new Promise(resolve=>{finish=resolve;});t.after(()=>finish());
    const service={...f.service,async setToolLocale(){await pending;}};
    const controller=createUiLocaleController(f.api,{storage:()=>null,languages:[locale]});
    await controller.ready;t.after(()=>controller.dispose());
    const ui=createExtensionCenterDOM(t,{component:LocaleManager,props:{model:{tools:[f.tool],
      toolId:f.tool.id,service,localeController:controller,onClose(){closes++;}}}}),{doc}=ui;
    selectValue(doc.getElementById('od-locale-tool-language'),'en');
    await settle(()=>doc.getElementById('od-locale-global').disabled);
    const statuses=[...doc.querySelectorAll('[role=status]')].map(node=>node.textContent);
    assert.ok(statuses.includes(msg(locale,'busy')));
    assert.ok(!statuses.some(text=>text.includes('正在卸载')),'shared confirmation shell must use the localized busy label');
    doc.dispatch('keydown',{key:'Escape'});assert.equal(closes,0);
    assert.equal(buttonNamed(doc,msg(locale,'close')).disabled,true);
    finish();await settle(()=>!doc.getElementById('od-locale-global').disabled);
    assert.ok(doc.body.textContent.includes(msg(locale,'toolSavedOnly',{language:locale==='en'?'English':'简体中文'})));
    doc.dispatch('keydown',{key:'Escape'});assert.equal(closes,1);
  });
}

for(const panelLocale of ['en','ja'])for(const customName of [false,true]){
  test('current tool title uses its actual catalog only for a source metadata name: '+panelLocale+' custom='+customName,async t=>{
    const f=await setup(t);
    f.tool.title=customName?'我的自定义目录':'标题';
    f.saved[SIDEBAR_TOOL_STORE]=[f.tool];
    await f.service.install(f.pack,f.tool);
    const actualLocale=panelLocale==='en'?'ja':'en';
    await f.service.setToolLocale(f.tool.id,actualLocale);
    const controller=createUiLocaleController(f.api,{storage:()=>null,languages:[panelLocale]});
    await controller.ready;t.after(()=>controller.dispose());
    const ui=createExtensionCenterDOM(t,{component:LocaleManager,props:{model:{
      tools:[f.tool],toolId:f.tool.id,service:f.service,localeController:controller,onClose(){}}}}),{doc}=ui;
    const title=customName?f.tool.title:actualLocale==='ja'?'見出し':'Title';
    assert.ok(doc.body.textContent.includes(msg(panelLocale,'currentTool',{title})),
      'panel prose follows global locale while a default tool title follows the actual tool locale');
    const before=structuredClone(f.saved);
    await controller.setLocale('zh-CN');
    await settle(()=>doc.body.textContent.includes(msg('zh-CN','currentTool',{title})));
    assert.equal(f.service.getToolLocale(f.tool.id),actualLocale);
    assert.deepEqual(f.saved,{...before,'opendesk.ui.locale.v1':'zh-CN'},
      'only the explicitly selected global locale is saved; presenting the title does not alter tool metadata or preferences');
    selectValue(doc.getElementById('od-locale-tool-language'),'follow');
    await settle(()=>f.service.getToolLocale(f.tool.id)===null&&!doc.getElementById('od-locale-tool-language').disabled);
    assert.ok(doc.body.textContent.includes(msg('zh-CN','currentTool',{title:customName?f.tool.title:'标题'})));
  });
}
