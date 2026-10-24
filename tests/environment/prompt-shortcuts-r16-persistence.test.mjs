// Source-bound standalone HTML preview regressions, not installed Chrome acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const path='examples/sidebar-tools/prompt-shortcuts/preview/index.html';
const keys=['regionTop','regionBottom','conversationTop','conversationBottom','floatingTop'];
async function fixture(){
  const html=await readFile(path,'utf8');
  const script=html.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/)[1];
  const slice=(start,end)=>{const i=script.indexOf(start),j=script.indexOf(end,i);assert(i>=0&&j>i);return script.slice(i,j);};
  const controls=keys.map(key=>({dataset:{scrollNavPreview:key},checked:true,addEventListener(_name,callback){this.change=callback;}}));
  const nodes=new Map(),saved=new Map();let failWrite=false;
  const el=id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:true,dataset:{},handlers:[],classList:{remove(){}},setAttribute(){},addEventListener(_name,fn){this.handlers.push(fn);}});return nodes.get(id);};
  const context={el,document:{querySelectorAll:()=>controls,querySelector:()=>({})},
    localStorage:{getItem:key=>saved.get(key)??null,setItem(key,value){if(failWrite)throw Error('quota');saved.set(key,value);},removeItem:key=>saved.delete(key)},
    notice(){},renderIndex(){},renderRail(){},returnIndex(){},closeUninstall(){},discardImport(){},showFormError(){},
    COPY:()=>[{id:'example',body:'preserved prompt'}],resolveSite:()=>({editor:true}),demoNavigationReady:result=>Boolean(result.editor),
    demoTranscript:{scrollTop:500,clientHeight:400},DEMO_SETTINGS_KEY:'settings',DEMO_ITEM_KEY:'items',DEMO_ASSET_KEY:'assets'};
  runInNewContext(`const IMAGE_SIZES=['compact','standard','large'];
    ${slice('const SCROLL_NAV_DEFAULTS=', 'function restoreDemoItems()')}
    ${slice('function persistDemoSettings(', 'let state=')}
    let state={revision:1,settings:restoreDemoSettings(),items:COPY(),toolEnabled:true};
    let installed=true,currentView='index',dirty=false,imageAssets={},draftImageAssetId='',previewCompactExpanded=true,nextSaveFailure=null,expandedId=null,deleteId=null,copyId=null;
    function setSettings(){document.querySelectorAll().forEach(control=>control.checked=state.settings.scrollNavigation[control.dataset.scrollNavPreview]);}
    ${slice("document.querySelectorAll('[data-scroll-nav-preview]').forEach(control=>\n  control.addEventListener", "el('imageSizeGroup').querySelectorAll")}
    ${slice("el('resetButton').addEventListener('click',()=>{if(currentView==='form'&&dirty){", "for(const [id,mode,label]")}
  `,context);
  return {context,controls,el,saved,setFailure:value=>{failWrite=value;},
    run:source=>runInNewContext(source,context),script,slice};
}
test('R1.16.1 preview switches independently save, restore and recover from local storage failure',async()=>{
  const f=await fixture();
  for(const control of f.controls){control.checked=false;control.change();}
  assert.deepEqual(Object.values(JSON.parse(f.saved.get('settings')).scrollNavigation),[false,false,false,false,false]);
  assert.equal(f.run('restoreDemoSettings().scrollNavigation.regionTop'),false);
  const before=f.saved.get('settings');f.setFailure(true);
  f.controls[0].checked=true;f.controls[0].change();
  assert.equal(f.controls[0].checked,false);assert.equal(f.saved.get('settings'),before);
  assert.equal(f.run('state.items[0].body'),'preserved prompt');
});
test('R1.16.1 preview reset restores five defaults without missing-state exceptions',async()=>{
  const f=await fixture();f.controls[0].checked=false;f.controls[0].change();
  f.el('resetButton').handlers[0]();
  assert.doesNotThrow(()=>f.run('setSettings()'));
  assert(f.controls.every(control=>control.checked));
});
test('R1.16.1 preview scroll events keep floating navigation hidden while disabled or uninstalled',async()=>{
  const f=await fixture();
  f.run(f.slice('function updateDemoFloating(){','function renderDemoNavigation('));
  for(const setting of ['state.toolEnabled=false','state.settings.showBar=false','installed=false']){
    f.run('state.toolEnabled=true;state.settings.showBar=true;installed=true;'+setting+';updateDemoFloating()');
    assert.equal(f.el('mockConversationNav').hidden,true,setting);
  }
  f.run('state.toolEnabled=true;state.settings.showBar=true;installed=true;updateDemoFloating()');
  assert.equal(f.el('mockConversationNav').hidden,false);
});
