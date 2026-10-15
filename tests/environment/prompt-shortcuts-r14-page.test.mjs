// Dynamic mocked-page controller test; not an installed Chromium/ChatGPT acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {initPromptShortcuts} from '../../examples/sidebar-tools/prompt-shortcuts/trusted/page.js';
import {PROMPT_ID,PROMPT_SITE_STORE,PROMPT_DATA_STORE,CHATGPT_ORIGIN,changePromptSiteGrant}
  from '../../examples/sidebar-tools/prompt-shortcuts/trusted/policy.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';

const tick=()=>new Promise(resolve=>setTimeout(resolve,8));
const settle=async()=>{for(let i=0;i<5;i++)await tick();};

function mockElement(tag='div'){
  const handlers=new Map(),node={
    tagName:tag,children:[],attributes:{},style:{},hidden:false,isConnected:true,textContent:'',
    className:'',value:'',title:'',readOnly:false,disabled:false,
    classList:{items:new Set(),toggle(name,enabled){
      if(enabled)this.items.add(name);else this.items.delete(name);
    }},
    addEventListener(name,fn){const list=handlers.get(name)||[];list.push(fn);handlers.set(name,list);},
    removeEventListener(name,fn){handlers.set(name,(handlers.get(name)||[]).filter(f=>f!==fn));},
    emit(name,event={}){for(const fn of handlers.get(name)||[])fn(event);},
    append(...elements){for(const item of elements){item.parentNode=node;item.isConnected=true;node.children.push(item);}},
    replaceChildren(...elements){for(const child of node.children)child.isConnected=false;node.children=[];
      node.append(...elements);},
    setAttribute(name,value){node.attributes[name]=value;},
    getAttribute(name){return node.attributes[name];},
    remove(){node.isConnected=false;const parent=node.parentNode;if(parent)
      parent.children=parent.children.filter(child=>child!==node);},
    focus(){node.focused=true;},
    select(){node.selected=true;},
    matches(){return false;},
    closest(){return null;},
    contains(other){return node.children.includes(other);},
    attachShadow(){node.shadow=mockElement('shadow');return node.shadow;},
    getBoundingClientRect(){return {left:260,top:80,width:900,height:640};}
  };
  return node;
}
function fixture({pkg,library,grants,insertText=null}){
  const values=new Map([
    [SIDEBAR_TOOL_STORE,[pkg]],[PROMPT_DATA_STORE,{library}],
    [SIDEBAR_TOOL_ENABLE_STORE,{}],[TOOL_REVOCATION_EPOCHS_STORE,{[PROMPT_ID]:'first'}],
    [PROMPT_SITE_STORE,grants]
  ]);
  const events=new Map(),siteEvents=new Set(),calls=[],docEvents=new Map();
  const win={
    location:{href:CHATGPT_ORIGIN+'/c/mock'},innerWidth:1366,innerHeight:768,
    addEventListener(name,fn){events.set(name,fn);},
    removeEventListener(name){events.delete(name);},
    setTimeout:fn=>setTimeout(fn,0),clearTimeout,clearInterval(){},
    setInterval(){return 1;},
    navigator:{clipboard:{writeText:async()=>{}}},
    MutationObserver:class{observe(){}disconnect(){}}
  };
  win.top=win;
  const main=mockElement('main'),editor=mockElement('editor');
  editor.textContent='已有草稿';editor.isContentEditable=true;
  editor.getBoundingClientRect=()=>({width:540,height:100});
  const root=mockElement('html'),body=mockElement('body');root.append(body);
  const range={selectNodeContents(){},collapse(){}};
  const selection={removeAllRanges(){},addRange(){}};
  const doc={
    body,documentElement:root,
    createElement:tag=>mockElement(tag),
    querySelector:selector=>selector==='main#main'||selector==='main'?main:
      selector.startsWith('main #prompt-textarea')?editor:null,
    createRange:()=>range,getSelection:()=>selection,
    execCommand(command,_show,text){
      calls.push({command,text});
      if(insertText)insertText(editor,text);
      else editor.textContent+=text;
      return true;
    },
    addEventListener(name,fn){docEvents.set(name,fn);},
    removeEventListener(name){docEvents.delete(name);}
  };
  const api={storage:{
    local:{async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys])
      .filter(key=>values.has(key)).map(key=>[key,structuredClone(values.get(key))]));}},
    onChanged:{addListener:fn=>siteEvents.add(fn),removeListener:fn=>siteEvents.delete(fn)}
  }};
  const change=(key,value)=>{
    values.set(key,structuredClone(value));
    for(const fn of siteEvents)fn({[key]:{newValue:value}},'local');
  };
  const rail=()=>root.children.find(item=>item.attributes['data-opendesk-prompts']!==undefined)
    ?.shadow?.children.find(item=>item.tagName==='nav');
  const buttons=()=>rail()?.children.filter(item=>item.className.includes('item'))||[];
  return {api,doc,win,values,change,calls,buttons,rail,root,editor,events,siteEvents,docEvents};
}
test('R1.4 dynamic ChatGPT rail: origin grant, click-to-draft and independent revocation',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const model=globalThis.OpenDeskPromptShortcutsModel;
  const row=model.draft({body:'检查项目\n列出风险'},null,()=> 'prompt-123456');
  const library={schema:1,items:[row],settings:{webButtons:true}};
  const f=fixture({pkg,library,grants:{}});
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  try{
    await settle();
    assert.equal(f.buttons().length,0,'unapproved origin never renders');
    const grant=await changePromptSiteGrant({},pkg,'first',true);
    f.change(PROMPT_SITE_STORE,grant);await settle();
    assert.equal(f.buttons().length,1,'granted and installed tool renders one real button');
    assert.equal(controller.diagnostics().items,1);
    f.buttons()[0].emit('click',{isTrusted:false});
    await settle();assert.equal(f.calls.length,0,'untrusted click cannot edit a draft');
    f.buttons()[0].emit('click',{isTrusted:true});
    f.buttons()[0].emit('click',{isTrusted:true}); // concurrent click must never double-insert
    await settle();
    const host=f.root.children.find(item=>item.attributes['data-opendesk-prompts']!==undefined);
    const fallback=host?.shadow?.children.find(item=>item.className==='fallback');
    const diagnostic={controller:controller.diagnostics(),fallback:fallback?.children.map(node=>node.textContent)};
    assert.equal(f.calls.length,1,JSON.stringify(diagnostic));
    assert.equal(f.calls[0].command,'insertText');
    assert.equal(f.calls[0].text,'\n检查项目\n列出风险');
    assert.equal(f.editor.textContent,'已有草稿\n检查项目\n列出风险');
    // The web-button setting is independent from the native menu; no menu
    // state or right-click host methods are used by this fixed page module.
    f.change(PROMPT_DATA_STORE,{library:{...library,settings:{webButtons:false}}});
    await settle();assert.equal(f.buttons().length,0,'web-button preference immediately stops');
    f.change(PROMPT_DATA_STORE,{library});await settle();
    assert.equal(f.buttons().length,1);
    f.change(SIDEBAR_TOOL_ENABLE_STORE,{[PROMPT_ID]:false});
    await settle();assert.equal(f.buttons().length,0,'host tool disable removes page controls');
    f.change(SIDEBAR_TOOL_ENABLE_STORE,{});
    await settle();assert.equal(f.buttons().length,1);
    f.change(PROMPT_SITE_STORE,{});await settle();
    assert.equal(f.buttons().length,0,'site revocation tears down page controls');
    f.change(PROMPT_SITE_STORE,grant);
    await settle();assert.equal(f.buttons().length,1);
    f.win.location.href='https://chatgpt.com.evil.example/c/mock';
    f.events.get('popstate')?.();
    await settle();assert.equal(f.buttons().length,0,'cross-origin SPA navigation revokes');
  }finally{controller?.dispose();}
  assert.equal(f.siteEvents.size,0,'controller removes storage observer on dispose');
});

test('R1.5 IME composition prevents edit; corrupted line breaks never count as insertion success',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const model=globalThis.OpenDeskPromptShortcutsModel;
  const row=model.draft({body:'第一行\n\n第三行🧑‍💻'},null,()=> 'prompt-r15');
  const library={schema:1,items:[row],settings:{webButtons:true}};
  const grant=await changePromptSiteGrant({},pkg,'first',true);
  const f=fixture({pkg,library,grants:grant,insertText:(node,value)=>{
    // A broken rich-text bridge may preserve characters but drop paragraph breaks.
    node.textContent+=value.replace(/\n/g,'');
  }});
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  try{
    await settle();assert.equal(f.buttons().length,1);
    f.docEvents.get('compositionstart')?.();
    f.buttons()[0].emit('click',{isTrusted:true});
    await settle();assert.equal(f.calls.length,0,'do not edit while IME is composing');
    f.docEvents.get('compositionend')?.();
    f.buttons()[0].emit('click',{isTrusted:true});
    await settle();
    assert.equal(f.calls.length,1,'native edit is attempted once');
    assert.equal(f.editor.textContent,'已有草稿第一行第三行🧑‍💻');
    const host=f.root.children.find(item=>item.attributes['data-opendesk-prompts']!==undefined);
    const fallback=host?.shadow?.children.find(item=>item.className==='fallback');
    assert.equal(fallback?.hidden,false,'missing line breaks are an uncertain edit, not success');
    assert.match(fallback.children[1].textContent,/草稿正文或换行未得到完整确认/);
    assert.equal(f.calls.length,1,'never retry an ambiguous native insert automatically');
  }finally{controller?.dispose();}
});
