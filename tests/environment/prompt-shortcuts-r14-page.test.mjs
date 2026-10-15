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
    tagName:tag,children:[],attributes:{},dataset:{},style:{},hidden:false,isConnected:true,textContent:'',
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
function fixture({pkg,library,grants,insertText=null,noEditor=false,rejectCopy=false}){
  const values=new Map([
    [SIDEBAR_TOOL_STORE,[pkg]],[PROMPT_DATA_STORE,{library}],
    [SIDEBAR_TOOL_ENABLE_STORE,{}],[TOOL_REVOCATION_EPOCHS_STORE,{[PROMPT_ID]:'first'}],
    [PROMPT_SITE_STORE,grants]
  ]);
  const events=new Map(),siteEvents=new Set(),calls=[],copied=[],docEvents=new Map();
  const win={
    location:{href:CHATGPT_ORIGIN+'/c/mock'},innerWidth:1366,innerHeight:768,
    addEventListener(name,fn){events.set(name,fn);},
    removeEventListener(name){events.delete(name);},
    setTimeout:fn=>setTimeout(fn,0),clearTimeout,clearInterval(){},
    setInterval(){return 1;},
    navigator:{clipboard:{writeText:async text=>{if(rejectCopy)throw Error('剪贴板未授权');copied.push(text);}}},
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
      selector.startsWith('main #prompt-textarea')?(noEditor?null:editor):null,
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
  return {api,doc,win,values,change,calls,copied,buttons,rail,root,main,editor,events,siteEvents,docEvents};
}
test('R1.13 ChatGPT rail: no second consent, one click-to-draft, independent enable lifecycle',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const model=globalThis.OpenDeskPromptShortcutsModel;
  const row=model.draft({body:'检查项目\n列出风险'},null,()=> 'prompt-123456');
  const library={schema:1,items:[row],settings:{webButtons:true}};
  const f=fixture({pkg,library,grants:{}});
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  try{
    await settle();
    assert.equal(f.buttons().length,1,'installed and enabled tool renders without a separate grant');
    const grant=await changePromptSiteGrant({},pkg,'first',true);
    f.change(PROMPT_SITE_STORE,grant);await settle();
    assert.equal(f.buttons().length,1,'legacy authorization record does not duplicate the button');
    assert.equal(controller.diagnostics().items,1);
    f.buttons()[0].emit('click',{isTrusted:false});
    await settle();assert.equal(f.calls.length,0,'untrusted click cannot edit a draft');
    f.buttons()[0].emit('click',{isTrusted:true});
    f.buttons()[0].emit('click',{isTrusted:true}); // concurrent click must never double-insert
    await settle();
    const host=f.root.children.find(item=>item.attributes['data-opendesk-prompts']!==undefined);
    const feedback=host?.shadow?.children.find(item=>item.className==='feedback');
    const diagnostic={controller:controller.diagnostics(),feedback:feedback?.textContent};
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
    assert.equal(f.buttons().length,1,'legacy site grant is no longer a separate visibility gate');
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
    const feedback=host?.shadow?.children.find(item=>item.className==='feedback');
    assert.equal(feedback?.hidden,false,'unconfirmed insertion displays a small status');
    assert.match(feedback.textContent,/已复制完整提示词/);
    assert.deepEqual(f.copied,[row.body],'original multiline prompt is copied');
    assert.equal(f.calls.length,1,'never retry an ambiguous native insert automatically');
  }finally{controller?.dispose();}
});

test('R1.5 reconstructs sibling editor paragraphs and empty lines without relying on flattened textContent',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const model=globalThis.OpenDeskPromptShortcutsModel;
  const row=model.draft({body:'第一行\n\n第三行'},null,()=> 'prompt-r15-blocks');
  const grant=await changePromptSiteGrant({},pkg,'first',true);
  const f=fixture({pkg,grants:grant,library:{schema:1,items:[row],settings:{webButtons:true}},
    insertText:(node,value)=>{
      assert.equal(value,'\n第一行\n\n第三行');
      const children=value.split('\n').slice(1).map(part=>({
        tagName:'P',innerText:part||'\n',textContent:part
      }));
      node.children.push(...children);
      // The real DOM's textContent drops the structural <p> line breaks.
      node.textContent=node.children.map(part=>part.textContent).join('');
    }});
  f.editor.children=[{tagName:'P',innerText:'已有草稿',textContent:'已有草稿'}];
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  try{
    await settle();assert.equal(f.buttons().length,1);
    f.buttons()[0].emit('click',{isTrusted:true});await settle();
    assert.equal(f.calls.length,1);
    assert.equal(f.editor.textContent,'已有草稿第一行第三行');
    const host=f.root.children.find(item=>item.attributes['data-opendesk-prompts']!==undefined);
    const feedback=host?.shadow?.children.find(item=>item.className==='feedback');
    assert.equal(feedback?.hidden,false,'verified insertion displays a success status');
    assert.match(feedback.textContent,/已插入输入框/);
    assert.equal(f.copied.length,0,'verified insert never also copies');
  }finally{controller?.dispose();}
});


test('R1.11: when editor is missing, clipboard denial gives no false success',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const model=globalThis.OpenDeskPromptShortcutsModel;
  const row=model.draft({body:'完整提示词\n第二行'},null,()=> 'prompt-r111');
  const grant=await changePromptSiteGrant({},pkg,'first',true);
  const f=fixture({pkg,grants:grant,noEditor:true,rejectCopy:true,
    library:{schema:1,items:[row],settings:{webButtons:true}}});
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  try{
    await settle();assert.equal(f.buttons().length,1);
    f.buttons()[0].emit('click',{isTrusted:true});await settle();
    assert.equal(f.calls.length,0);
    assert.equal(f.copied.length,0);
    const host=f.root.children.find(x=>x.attributes['data-opendesk-prompts']!==undefined);
    const feedback=host.shadow.children.find(x=>x.className==='feedback');
    assert.equal(feedback?.hidden,false);
    assert.match(feedback.textContent,/插入失败，复制也失败/);
    assert.equal(host.shadow.children.some(x=>x.className==='fallback'),false);
  }finally{controller?.dispose();}
});

test('R1.11: when editor is missing, entire multiline prompt is copied',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const model=globalThis.OpenDeskPromptShortcutsModel;
  const row=model.draft({body:'第一行\n\n第三行🧑‍💻'},null,()=> 'prompt-r111-copy');
  const grant=await changePromptSiteGrant({},pkg,'first',true);
  const f=fixture({pkg,grants:grant,noEditor:true,
    library:{schema:1,items:[row],settings:{webButtons:true}}});
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  try{
    await settle();
    f.buttons()[0].emit('click',{isTrusted:true});await settle();
    assert.deepEqual(f.copied,[row.body]);
    const host=f.root.children.find(x=>x.attributes['data-opendesk-prompts']!==undefined);
    const feedback=host.shadow.children.find(x=>x.className==='feedback');
    assert.match(feedback.textContent,/已复制完整提示词/);
    assert.equal(feedback.dataset.kind,'success');
  }finally{controller?.dispose();}
});

test('R1.7 narrow ChatGPT rail starts folded, expands on click, and tooltip retains entire prompt',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const model=globalThis.OpenDeskPromptShortcutsModel;
  const row=model.draft({body:'首行🧑‍💻\n\n第三行',label:'🧑‍💻中'},null,()=> 'prompt-r17-narrow');
  const grant=await changePromptSiteGrant({},pkg,'first',true);
  const f=fixture({pkg,grants:grant,library:{schema:1,items:[row],settings:{webButtons:true}}});
  f.main.getBoundingClientRect=()=>({left:260,top:80,width:540,height:640});
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  try{
    await settle();
    assert.equal(f.rail().classList.items.has('narrow'),true);
    assert.equal(f.rail().classList.items.has('folded'),true);
    assert.equal(f.buttons().length,1);
    assert.deepEqual(f.buttons()[0].children.map(span=>span.textContent),['🧑‍💻','中']);
    f.rail().children[0].emit('click',{isTrusted:true});await settle();
    assert.equal(f.rail().classList.items.has('folded'),false);
    f.buttons()[0].emit('mouseenter');
    const host=f.root.children.find(item=>item.attributes['data-opendesk-prompts']!==undefined);
    const tooltip=host.shadow.children.find(item=>item.className==='tip');
    assert.equal(tooltip.hidden,false);
    assert.equal(tooltip.children[0].textContent,row.name);
    assert.equal(tooltip.children[1].textContent,row.body);
  }finally{controller.dispose();}
});
