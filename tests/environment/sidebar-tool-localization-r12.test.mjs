import {renderSidebarFixture} from '../helpers/sidebar-react-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {OFFICIAL_READING_TOC_RELEASE} from '../../src/sidebar-tools/official-reading-toc.js';
import {validateSidebarToolPackage,serializeSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {
  canonicalUiLocale,resolveUiLocale,compileToolLocaleCatalog,uiMessage,
  createUiLocaleController,UI_LOCALE_STORE
} from '../../src/ui/app-localization.js';

import {createReadingTocView} from '../../examples/sidebar-tools/reading-toc/trusted/view.js';
const root='examples/sidebar-tools/reading-toc/';
const getCatalog=async()=>JSON.parse(await readFile(root+'locales.json','utf8'));

test('R1.2 language resolution prefers exact, falls back to base then source',()=>{
  assert.equal(canonicalUiLocale('EN-us'),'en-US');
  assert.equal(canonicalUiLocale('ja_JP'),null);
  assert.equal(resolveUiLocale('en-US',['zh-CN','en']),'en');
  assert.equal(resolveUiLocale('en-GB',['zh-CN','en']),'en');
  assert.equal(resolveUiLocale('en-GB',['zh-CN','en-US','en-GB']),'en-GB');
  assert.equal(resolveUiLocale('en-AU',['zh-CN','en-GB','en-US']),'zh-CN',
    'ambiguous regional dialects must not be selected arbitrarily');
  assert.equal(resolveUiLocale('fr-FR',['zh-CN','en']),'zh-CN');
  assert.equal(resolveUiLocale(undefined,['zh-CN','en']),'zh-CN');
});

test('R1.2 reviewed source and EN resource compile safely with placeholder fallback',async()=>{
  const catalog=compileToolLocaleCatalog(await getCatalog());
  assert.equal(uiMessage(catalog,'en-US','refreshLabel'),'Refresh table of contents');
  assert.equal(uiMessage(catalog,'zh-CN','refreshLabel'),'刷新阅读目录');
  assert.equal(uiMessage(catalog,'en-GB','moreAria',{count:3}),
    '3 sections are hidden. View full contents');
  const partial=structuredClone(catalog);
  delete partial.messages.en.refreshLabel;
  assert.equal(uiMessage(partial,'en','refreshLabel'),'刷新阅读目录');
  assert.equal(uiMessage(partial,'de','refreshLabel'),'刷新阅读目录');
  const source=await getCatalog();
  const outdated=structuredClone(source);
  outdated.messages['zh-CN'].refreshLabel='重新刷新目录';
  assert.throws(()=>compileToolLocaleCatalog(outdated),/E_TOOL_LOCALE_STALE_OR_UNSAFE/);
  const unsafe=structuredClone(source);
  unsafe.messages.en.refreshLabel.text='<img onerror=alert(1)>';
  assert.throws(()=>compileToolLocaleCatalog(unsafe),/E_TOOL_LOCALE_STALE_OR_UNSAFE/);
  const tokens=structuredClone(source);
  tokens.messages.en.moreAria.text='See {items} more';
  assert.throws(()=>compileToolLocaleCatalog(tokens),/E_TOOL_LOCALE_STALE_OR_UNSAFE/);
});

test('current pinned official Reading TOC package stays strict with reviewed offline words',async()=>{
  const pkg=await createSidebarToolPackage(root);
  assert.equal(pkg.version,OFFICIAL_READING_TOC_RELEASE.version);
  assert.equal(pkg.id,'reading-toc');
  assert.equal(pkg.format,'opendesk.sidebar-tool.v1');
  assert.deepEqual(pkg.capabilities,['page.toc']);
  assert.equal(Object.hasOwn(pkg,'locales'),false);
  assert.equal(Object.hasOwn(pkg,'scripts'),false);
  assert.equal(validateSidebarToolPackage(pkg).version,pkg.version);
  assert(!pkg.js.includes('__OPENDESK_TOOL_MESSAGES__'));
  assert(pkg.js.includes('Refresh table of contents'));
  assert(pkg.js.includes('正在读取当前网页目录'));
  assert(pkg.js.includes('onLocaleChange'));
  assert.equal(await readFile(root+'reading-toc.opendesk-tool.json','utf8'),
    serializeSidebarToolPackage(pkg),
    'source-directory manual install file must be byte-identical to the official packer');
  assert(!/fetch\s*\(|https?:\/\//.test(pkg.js),'tool translation needs no remote translation service');
});

test('R1.2 application choice is stored only by trusted host; read/write errors keep source',async()=>{
  const callbacks=new Set();
  const saved={};
  const api={storage:{
    local:{async get(key){return {[key]:saved[key]};},async set(values){
      Object.assign(saved,values);
      for(const fn of callbacks)fn(Object.fromEntries(Object.entries(values).map(
        ([key,newValue])=>[key,{newValue}])), 'local');
    }},
    onChanged:{addListener(fn){callbacks.add(fn);},removeListener(fn){callbacks.delete(fn);}}
  }};
  const controller=createUiLocaleController(api);
  await controller.ready;
  assert.equal(controller.getLocale(),'zh-CN');
  const seen=[];const unsubscribe=controller.subscribe(value=>seen.push(value));
  await controller.setLocale('en');
  assert.equal(saved[UI_LOCALE_STORE],'en');
  assert.equal(controller.getLocale(),'en');
  assert.deepEqual(seen,['en']);
  await assert.rejects(controller.setLocale('en<script>'),/E_UI_LOCALE_INVALID/);
  unsubscribe();controller.dispose();
  const missing=createUiLocaleController({storage:{local:{async get(){throw Error('no disk');}}}});
  await missing.ready;assert.equal(missing.getLocale(),'zh-CN');missing.dispose();
});

test('R1.2 source wiring covers both trusted webpage overlay and sandbox without a new SDK',async()=>{
  const [overlay,page,bridge,host,pkgBuilder,official] = await Promise.all([
    readFile('examples/sidebar-tools/reading-toc/trusted/view.js','utf8'),
    readFile('examples/sidebar-tools/reading-toc/trusted/page.js','utf8'),
    readFile('src/sidebar-tools/bridge.js','utf8'),
    readFile('src/ui/sidebar-tools.js','utf8'),
    readFile('scripts/build-sidebar-tool.mjs','utf8'),
    readFile('scripts/build-official-tools.mjs','utf8')
  ]);
  assert.match(overlay,/setLocale\(next,nextCatalog=catalog\)/);
  assert.match(overlay,/readingTocCatalog/);
  assert.match(page,/UI_LOCALE_STORE/);
  assert.match(page,/view\?\.setLocale\(uiLocale,uiCatalog\)/);
  assert.match(bridge,/kind==='locale-changed'/);
  assert.match(bridge,/onLocaleChange/);
  assert.match(host,/kind:'locale-changed'/);
  assert.match(pkgBuilder,/compileToolLocaleCatalog/);
  assert.match(official,/config\.locales\?\[config\.locales\]/);
});

test('R1.3 trusted TOC settings change language without importing tool permission copy',async()=>{
  const {readingTocHostText,READING_TOC_HOST_KEYS}=await import('../../src/ui/reading-toc-settings-localization.js');
  assert(READING_TOC_HOST_KEYS.includes('eyePageExcluded'));
  assert.equal(readingTocHostText('en','languageLabel'),'Interface language');
  assert.equal(readingTocHostText('zh-CN','siteDisable'),'停用当前网站');
  assert.equal(readingTocHostText('en-US','siteDisable'),'Disable on this website');
  assert.equal(readingTocHostText('en','noPages'),'No excluded pages');
  assert.equal(readingTocHostText('ja','languageLabel'),'表示言語');
  for(const key of READING_TOC_HOST_KEYS)assert(readingTocHostText('ja',key).trim(),key);
  assert.equal(readingTocHostText('fr','siteDisable'),'停用当前网站');
  assert.equal(readingTocHostText('en','unknown'),'');
  const [host,markup,react]=await Promise.all([
    readFile('src/ui/sidebar-tools.js','utf8'),
    renderSidebarFixture(),
    readFile('src/ui/react/tabs/tool-host.tsx','utf8')
  ]);
  assert.match(host,/readingTocHostText/);
  assert.match(host,/isToc\?tocLocale:null/);
  assert.match(host,/if\(active\?\.localization\)render\(\)/);
  assert.match(host,/tocLocale=isToc\?toolLocaleContext\(active\)\.locale/,'TOC settings use effective tool language');
  assert.match(host,/view\.patchLabels\(/,'trusted Host must update locale state');
  assert.match(react,/snapshot\.labels\[name\]/,'React must consume trusted, localized labels');
  assert.match(react,/ToolLabel name="overlayHint"/);
  assert.match(react,/ToolLabel name="exceptionsHeading"/);
  assert.match(markup,/网站可用且工具启用时显示/);
  assert.match(markup,/阅读目录已排除的页面/);
  assert.match(markup,/id="sidebar-tool-toc-language-select"/);
  assert.match(host,/listen\(tocLanguageSelect,'change'/);
});

// Same lightweight DOM fixture as the existing placement component tests.
class MockElement {
  constructor(tag,win){
    this.tagName=tag.toUpperCase();this.win=win;this.children=[];this.options=[];
    this.events=new Map();this.attributes=new Map();this.dataset={};
    this.style={removeProperty(key){delete this[key];},setProperty(key,value){this[key]=value;}};
    this.scrollTop=0;
  }
  setAttribute(key,value){this.attributes.set(key,value);}
  removeAttribute(key){this.attributes.delete(key);}
  append(...nodes){
    this.children.push(...nodes);
    if(this.tagName==='SELECT')this.options.push(...nodes);
  }
  replaceChildren(...nodes){
    this.children=nodes.flatMap(node=>node.tagName==='FRAGMENT'?node.children:[node]);
    if(this.tagName==='SELECT')this.options=[...this.children];
  }
  attachShadow(){return this.shadow=new MockElement('shadow',this.win);}
  addEventListener(type,handler){
    if(!this.events.has(type))this.events.set(type,new Set());
    this.events.get(type).add(handler);
  }
  removeEventListener(type,handler){this.events.get(type)?.delete(handler);}
  fire(type,event={}){for(const fn of [...(this.events.get(type)||[])])fn(event);}
  setPointerCapture(id){this.pointerCapture=id;}
  hasPointerCapture(id){return this.pointerCapture===id;}
  releasePointerCapture(id){if(this.pointerCapture===id)this.pointerCapture=null;}
  getBoundingClientRect(){
    if(this.attributes.has('data-opendesk-toc-root')){
      const width=this.win.innerWidth<=1100?220:254,height=180;
      const left=this.style.left!==undefined?parseFloat(this.style.left):this.win.innerWidth-width-8;
      const top=this.style.top!==undefined?parseFloat(this.style.top):8;
      return {width,height,left,top,right:left+width,bottom:top+height};
    }
    return {width:220,height:160,left:0,top:0,right:220,bottom:160};
  }
  querySelectorAll(selector){
    if(selector!=='button')return [];
    return this.children.flatMap(child=>[child,...child.querySelectorAll(selector)])
      .filter(child=>child.tagName==='BUTTON');
  }
  querySelector(){return null;}
  remove(){this.removed=true;}
}
function viewFixture(){
  const win={
    innerWidth:800,innerHeight:600,events:new Map(),
    addEventListener(type,fn){
      if(!this.events.has(type))this.events.set(type,new Set());
      this.events.get(type).add(fn);
    },
    removeEventListener(type,fn){this.events.get(type)?.delete(fn);},
    fire(type){for(const fn of this.events.get(type)||[])fn();}
  };
  const doc={body:new MockElement('body',win),defaultView:win,
    createElement:tag=>new MockElement(tag,win),
    createDocumentFragment:()=>new MockElement('fragment',win)};
  const host=()=>doc.body.children[0];
  const handle=()=>host().shadow.children[0].children[0].children[0];
  const pointer=(x,y)=>({pointerId:7,button:0,isPrimary:true,clientX:x,clientY:y,
    preventDefault(){}});
  return {doc,win,host,handle,pointer};
}

test('R2.1 dynamic Japanese catalog replaces same-language text and removal falls back without remount',async()=>{
 const {readFile}=await import('node:fs/promises');
 const pkg=await createSidebarToolPackage(root);
 const pack=JSON.parse(await readFile('examples/sidebar-tools/reading-toc/languages/ja.opendesk-locale.json','utf8'));
 const prior=globalThis.CSSStyleSheet;globalThis.CSSStyleSheet=class{replaceSync(){}};
 try{
  const f=viewFixture(),view=createReadingTocView({doc:f.doc,win:f.win,onNavigate(){}});
  const host=f.host(),panel=host.shadow.children[0],scroll=panel.children[1];
  const catalog={...pkg.localization,messages:{...pkg.localization.messages,ja:Object.fromEntries(Object.entries(pack.messages).map(([k,v])=>[k,v.text]))}};
  view.render({adapter:'article',items:[{id:'h-1',label:'Actual page heading',sourceId:'s-1',depth:0,topId:'h-1'}],activeId:'h-1',sources:[{id:'s-1',label:'Original source'}]});
  const list=scroll.children[0],item=list.children[0];scroll.scrollTop=37;
  view.setLocale('ja',catalog);
  assert.equal(panel.attributes.get('aria-label'),pack.messages.pageLabel.text);
  assert.equal(panel.children[0].children[0].children[0].textContent,pack.messages.contents.text,'visible title follows the tool language');
  assert.equal(f.host(),host);assert.equal(list.children[0],item);assert.equal(scroll.scrollTop,37);
  const changed=structuredClone(catalog);changed.messages.ja.pageLabel='更新した目次';
  view.setLocale('ja',changed);assert.equal(panel.attributes.get('aria-label'),'更新した目次');
  view.setLocale('ja',null);assert.equal(panel.attributes.get('aria-label'),pkg.localization.messages.ja.pageLabel,'removing a custom pack retains built-in Japanese');
  view.setLocale('fr',null);assert.equal(panel.attributes.get('aria-label'),pkg.localization.messages['zh-CN'].pageLabel);
  assert.equal(f.host(),host);assert.equal(list.children[0],item);assert.equal(scroll.scrollTop,37);
  view.dispose();
 }finally{globalThis.CSSStyleSheet=prior;}
});
