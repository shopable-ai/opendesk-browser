// Dynamic mocked-page controller test; not an installed Chromium/ChatGPT acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {initPromptShortcuts} from '../../examples/sidebar-tools/prompt-shortcuts/trusted/page.js';
import {PROMPT_ID,PROMPT_SITE_STORE,PROMPT_DATA_STORE,CHATGPT_ORIGIN,changePromptSiteGrant}
  from '../../examples/sidebar-tools/prompt-shortcuts/trusted/policy.js';
import {installAnalyticsHost} from '../../src/analytics/host.js';
import {ANALYTICS_STATE_KEY,ANALYTICS_PROTOCOL,ANALYTICS_PAGE_SCOPE_CHECK} from '../../src/analytics/contract.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';

const tick=()=>new Promise(resolve=>setTimeout(resolve,8));
const settle=async()=>{for(let i=0;i<5;i++)await tick();};

function mockElement(tag='div'){
  const handlers=new Map(),node={
    tagName:tag,children:[],attributes:{},dataset:{},style:{},hidden:false,isConnected:true,textContent:'',
    className:'',value:'',title:'',readOnly:false,disabled:false,
    classList:{items:new Set(),contains(name){return this.items.has(name);},
      add(name){this.items.add(name);},remove(name){this.items.delete(name);},toggle(name,enabled){
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
    removeAttribute(name){delete node.attributes[name];},
    remove(){node.isConnected=false;const parent=node.parentNode;if(parent)
      parent.children=parent.children.filter(child=>child!==node);},
    focus(){
      node.focused=true;
      for(let parent=node.parentNode;parent;parent=parent.parentNode){
        if(parent.tagName==='shadow'){parent.activeElement=node;break;}
      }
    },
    select(){node.selected=true;},
    matches(){return false;},
    closest(){return null;},
    querySelectorAll(){return [];},
    contains(other){return node===other||node.children.some(child=>child.contains?.(other));},
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
  const events=new Map(),siteEvents=new Set(),calls=[],copied=[],docEvents=new Map(),runtimeMessages=new Set();
  const mutationObservers=[],intervals=[];
  const activeIntervals=new Set(),pendingTimers=new Map();
  const windowListeners=new Map();
  // Preserve 3s/5s toast timeouts without making the Node suite wait for them.
  const toastTimers=new Map();let nextToastTimer=100000;
  const fireToast=()=>{
    const first=toastTimers.entries().next().value;
    if(!first)return;
    const [id,entry]=first;toastTimers.delete(id);entry.fn();
  };
  const win={
    location:{href:CHATGPT_ORIGIN+'/c/mock'},innerWidth:1366,innerHeight:768,
    addEventListener(name,fn){
      if(!windowListeners.has(name))windowListeners.set(name,new Set());
      windowListeners.get(name).add(fn);
      events.set(name,(event={})=>{for(const listener of [...(windowListeners.get(name)||[])])listener(event);});
    },
    removeEventListener(name,fn){
      const listeners=windowListeners.get(name);listeners?.delete(fn);
      if(!listeners?.size){windowListeners.delete(name);events.delete(name);}
    },
    setTimeout(fn,ms){
      if(ms===3000||ms===5000){
        const id=++nextToastTimer;toastTimers.set(id,{fn,ms});return id;
      }
      const handle=setTimeout(()=>{pendingTimers.delete(handle);fn();},0);
      pendingTimers.set(handle,fn);return handle;
    },
    clearTimeout(handle){toastTimers.delete(handle);pendingTimers.delete(handle);clearTimeout(handle);},
    clearInterval(handle){activeIntervals.delete(handle);},
    setInterval(fn){intervals.push(fn);activeIntervals.add(intervals.length);return intervals.length;},
    navigator:{clipboard:{writeText:async text=>{if(rejectCopy)throw Error('剪贴板未授权');copied.push(text);}}},
    MutationObserver:class{
      constructor(callback){this.callback=callback;mutationObservers.push(this);}
      observe(target){this.target=target;}
      disconnect(){this.target=null;}
      notify(records){if(this.target)this.callback(records);}
    }
  };
  win.top=win;
  const main=mockElement('main'),editor=mockElement('DIV');
  editor.textContent='已有草稿';editor.isContentEditable=true;
  editor.setAttribute('contenteditable','true');
  editor.getBoundingClientRect=()=>({left:350,top:480,width:540,height:100});
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
  doc.querySelectorAll=selector=>{
    const node=doc.querySelector(selector);return node?[node]:[];
  };
  // The fixture's focus must have the same activeElement contract as DOM focus.
  const nativeEditorFocus=editor.focus.bind(editor);
  editor.focus=()=>{nativeEditorFocus();doc.activeElement=editor;};
  const api={runtime:{id:'test-extension',getURL:(path='')=> 'chrome-extension://test-extension/'+path,
    getManifest:()=>({background:{service_worker:'background.js'}}),
    onMessage:{addListener:fn=>runtimeMessages.add(fn),removeListener:fn=>runtimeMessages.delete(fn)}},storage:{
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
  const mutate=records=>{
    for(const observer of [...mutationObservers])observer.notify(records.map(record=>({
      type:'childList',addedNodes:[],removedNodes:[],...record
    })));
  };
  return {api,doc,win,values,change,calls,copied,buttons,rail,root,main,editor,events,siteEvents,
    docEvents,runtimeMessages,toastTimers,fireToast,mutationObservers,mutate,intervals,activeIntervals,pendingTimers};
}
// Real light-DOM shapes for defaults; query descendant/class selectors against
// the tree rather than mirroring the production rule's selector strings.
async function builtinPage(provider,{empty=false,custom=false}={}){
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const row=globalThis.OpenDeskPromptShortcutsModel.draft({body:'完整提示词🙂\n第二行'},null,()=> 'builtin-prompt');
  const library={schema:1,items:empty?[]:[row],settings:{webButtons:true}};
  const f=fixture({pkg,library,grants:{}}),deepSeek=provider==='DeepSeek';
  const url=deepSeek?'https://chat.deepseek.com/a/chat/s/abcd-0123':
    'https://gemini.google.com/app/chat_123';
  const decorate=node=>{
    jumpDOM(node);
    const matches=node.matches;
    node.matches=selector=>selector.split(',').some(part=>{
      const classes=[...part.matchAll(/\.([\w-]+)/gu)].map(match=>match[1]);
      return classes.every(name=>(node.getAttribute('class')||'').split(/\s+/u).includes(name))&&
        matches(part.replace(/\.[\w-]+/gu,''));
    });
    return node;
  };
  const element=tag=>decorate(mockElement(tag));
  for(const node of [f.root,f.doc.body,f.main,f.editor])decorate(node);
  f.win.location.href=url;
  f.doc.createElement=element;
  f.main.tagName=deepSeek?'DIV':'chat-window';
  if(deepSeek)f.main.id='root';
  f.main.getBoundingClientRect=()=>regionRect(0,0,1366,768);
  const column=element('section'),message=element('div'),composer=element('form');
  column.id='builtin-column';column.getBoundingClientRect=()=>regionRect(260,40,900,700);
  message.setAttribute('class',deepSeek?'ds-message':'model-response');
  f.doc.body.append(f.main);f.main.append(element('aside'),column);
  column.append(message,composer);
  f.editor.id='builtin-editor';
  if(deepSeek){
    f.editor.tagName='TEXTAREA';f.editor.isContentEditable=false;
    f.editor.removeAttribute('contenteditable');f.editor.value='保留已有草稿🙂';
    composer.append(f.editor);
  }else{
    const rich=element('rich-textarea');
    f.editor.setAttribute('class','ql-editor');f.editor.textContent='保留已有草稿🙂';
    composer.append(rich);rich.append(f.editor);
  }
  const send=element('button'),submissions=[],selections=[];
  send.setAttribute('type','submit');send.click=()=>submissions.push('click');composer.append(send);
  composer.submit=()=>submissions.push('submit');
  composer.requestSubmit=()=>submissions.push('requestSubmit');
  const dispatch=event=>{
    if(event.type==='submit'||event.key==='Enter')submissions.push(event.type);
    return true;
  };
  f.editor.dispatchEvent=dispatch;composer.dispatchEvent=dispatch;f.doc.dispatchEvent=dispatch;
  f.editor.focus=()=>{f.editor.focused=true;f.doc.activeElement=f.editor;};
  f.editor.setSelectionRange=(start,end)=>selections.push([start,end]);
  f.doc.querySelectorAll=selector=>[...new Set(selector.split(',').flatMap(part=>{
    let found=[f.root];
    for(const term of part.trim().split(/\s+/u))found=found.flatMap(node=>node.querySelectorAll(term));
    return found;
  }))];
  f.doc.querySelector=selector=>f.doc.querySelectorAll(selector)[0]||null;
  f.win.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
  const draft=()=>deepSeek?f.editor.value:f.editor.textContent;
  f.doc.execCommand=(command,_show,text)=>{
    f.calls.push({command,text});
    if(deepSeek)f.editor.value+=text;else f.editor.textContent+=text;
    return true;
  };
  const rule={origin:new URL(url).origin,pathScope:new URL(url).pathname,
    containerSelector:'#builtin-column',editorSelector:'#builtin-editor',enabled:true};
  if(custom)f.values.set(PROMPT_DATA_STORE,{library,sites:{schema:1,rules:[rule]}});
  const setRules=rules=>f.change(PROMPT_DATA_STORE,{library,sites:{schema:1,rules}});
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  await settle();
  const hosts=()=>f.root.children.filter(node=>Object.hasOwn(node.attributes,'data-opendesk-prompts'));
  return {...f,controller,hosts,row,library,rule,setRules,draft,selections,submissions};
}

for(const provider of ['DeepSeek','Gemini']){
  test('R2 builtin '+provider+' preserves a nonempty textarea/Quill draft, never sends, mounts one entry',async()=>{
    const f=await builtinPage(provider);
    try{
      assert.equal(Object.hasOwn(f.values.get(PROMPT_DATA_STORE),'sites'),false,'no saved site rule');
      assert.equal(f.hosts().length,1);assert.equal(f.hosts()[0].hidden,false);
      assert.equal(f.rail().children.filter(node=>node.className==='brand').length,1);
      assert.equal(f.buttons().length,1);
      const before=f.draft();
      f.buttons()[0].emit('click',{isTrusted:true});
      f.buttons()[0].emit('click',{isTrusted:true});
      await settle();
      assert.equal(f.draft(),before+'\n'+f.row.body);
      assert.deepEqual(f.calls,[{command:'insertText',text:'\n'+f.row.body}]);
      if(provider==='DeepSeek')assert.deepEqual(f.selections,[[before.length,before.length]]);
      assert.deepEqual(f.copied,[]);assert.deepEqual(f.submissions,[]);
      f.events.get('resize')?.();f.intervals[0]?.();await settle();
      assert.equal(f.hosts().length,1,'refresh reuses the only host');
      assert.equal(f.buttons().length,1);
      assert.equal(f.rail().children.filter(node=>node.className==='brand').length,1);
    }finally{f.controller.dispose();}
  });

  test('R2 builtin '+provider+' empty library keeps one OD entry without saving defaults',async()=>{
    const f=await builtinPage(provider,{empty:true});
    try{
      assert.equal(f.hosts().length,1);assert.equal(f.hosts()[0].hidden,false);
      assert.equal(f.buttons().length,0);assert.equal(f.rail().children.length,1);
      assert.equal(f.rail().children[0].className,'brand');
      assert.equal(f.rail().children[0].textContent,'OD');
      assert.equal(Object.hasOwn(f.values.get(PROMPT_DATA_STORE),'sites'),false);
      assert.deepEqual(f.calls,[]);assert.deepEqual(f.submissions,[]);
    }finally{f.controller.dispose();}
  });

  for(const transition of ['default-to-custom','custom-to-default','disable-default','disable-custom','disable-tool']){
    test('R2 builtin '+provider+' pending click is discarded on '+transition,async()=>{
      const f=await builtinPage(provider,{custom:transition.startsWith('custom')||transition==='disable-custom'});
      try{
        assert.equal(f.buttons().length,1);
        const before=f.draft(),nativeGet=f.api.storage.local.get;
        const snapshot=await nativeGet(KEYS_FOR_PENDING_READ);
        let release;
        f.api.storage.local.get=()=>{
          // Delay only this click; refresh must observe the new rules normally.
          f.api.storage.local.get=nativeGet;
          // A read started before revocation may still return the old grant.
          return new Promise(resolve=>{release=()=>resolve(snapshot);});
        };
        f.buttons()[0].emit('click',{isTrusted:true});
        assert.equal(typeof release,'function','click reached asynchronous authority read');
        if(transition==='disable-tool')f.change(SIDEBAR_TOOL_ENABLE_STORE,{[PROMPT_ID]:false});
        else if(transition==='custom-to-default')f.setRules([]);
        else f.setRules([{...f.rule,enabled:transition==='default-to-custom'}]);
        await settle();await release();await settle();
        assert.equal(f.draft(),before,'stale click cannot change the current draft');
        assert.deepEqual(f.calls,[]);assert.deepEqual(f.copied,[]);
        assert.deepEqual(f.submissions,[]);
        const disabled=transition.startsWith('disable');
        assert.equal(f.buttons().length,disabled?0:1);
        f.intervals[0]?.();await settle();
        assert.equal(f.buttons().length,disabled?0:1,'periodic refresh cannot revive a disabled rule');
        assert(f.hosts().length<=1,'rule changes never duplicate the host');
      }finally{f.controller.dispose();}
    });
  }
}


test('R1.9 three new default prompts have only one resting entry and expand to safe insert choices',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const f=fixture({pkg,library:pkg.initialData.library,grants:{}});
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  try{
    await settle();
    assert.equal(f.rail().children.length,1,'initial rail is exactly one launcher');
    const launcher=f.rail().children[0];
    assert.equal(launcher.textContent,'快捷');
    assert.equal(launcher.getAttribute('aria-expanded'),'false');
    launcher.emit('click',{isTrusted:false});
    assert.equal(f.rail().children.length,1,'synthetic click cannot expand');
    launcher.emit('click',{isTrusted:true});await settle();
    assert.equal(f.rail().children.length,5,'launcher, three real prompts, one management action');
    assert.deepEqual(f.buttons().slice(0,3).map(button=>button.getAttribute('aria-label')),
      ['插入提示词：浏览器插件定制','插入提示词：软件定制与外包','插入提示词：AI 提示词扩展']);
    const first=f.buttons()[0];
    first.emit('click',{isTrusted:true});
    await settle();
    assert.equal(f.calls.length,1);
    assert.equal(f.calls[0].command,'insertText');
    assert.equal(f.calls[0].text,'\n'+pkg.initialData.library.items[0].body);
    assert.equal(f.editor.textContent,'已有草稿\n'+pkg.initialData.library.items[0].body);
    assert.equal(f.rail().children.length,1,'after insertion the rail collapses again');
    assert.equal(controller.diagnostics().items,3);
    f.change(SIDEBAR_TOOL_ENABLE_STORE,{[PROMPT_ID]:false});await settle();
    assert.equal(f.rail(),undefined,'revocation removes launcher immediately');
  }finally{controller.dispose();}
});

test('R1.13 ChatGPT rail: no second consent, one click-to-draft, independent enable lifecycle',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const model=globalThis.OpenDeskPromptShortcutsModel;
  const row=model.draft({body:'检查项目\n列出风险'},null,()=> 'prompt-123456');
  const library={schema:1,items:[row],settings:{webButtons:true}};
  const f=fixture({pkg,library,grants:{}});
  f.values.set(SIDEBAR_TOOL_STORE,[]);
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  try{
    await settle();
    assert.equal(f.buttons().length,0,'uninstalled tool never renders');
    f.change(SIDEBAR_TOOL_STORE,[pkg]);await settle();
    assert.equal(f.buttons().length,1,'installed and enabled tool renders without a redundant site grant');
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
    assert.equal(f.buttons().length,1,'legacy site grants do not gate the installed adapter');
    f.change(SIDEBAR_TOOL_STORE,[]);await settle();
    assert.equal(f.buttons().length,0,'uninstall tears down page controls');
    f.change(SIDEBAR_TOOL_STORE,[pkg]);
    await settle();
    f.change(PROMPT_SITE_STORE,grant);
    await settle();assert.equal(f.buttons().length,1);
    f.win.location.href='https://chatgpt.com.evil.example/c/mock';
    f.events.get('popstate')?.();
    await settle();assert.equal(f.buttons().length,0,'cross-origin SPA navigation revokes');
  }finally{controller?.dispose();}
  assert.equal(f.siteEvents.size,0,'controller removes storage observer on dispose');
});

// Bounded light-DOM support for the real conversation adapter. This deliberately
// models only tag/id/attribute selectors and does not enter shadow roots.
function jumpDOM(node){
  node.nodeType=1;
  Object.defineProperties(node,{
    parentElement:{get(){return node.parentNode||null;}},
    id:{get(){return node.getAttribute('id')||'';},set(value){node.setAttribute('id',String(value));}},
    nextElementSibling:{get(){
      const siblings=node.parentNode?.children||[];
      return siblings[siblings.indexOf(node)+1]||null;
    }}
  });
  node.hasAttribute=name=>Object.hasOwn(node.attributes,name);
  node.matches=selector=>selector.split(',').some(part=>{
    let rest=part.trim();
    const tag=rest.match(/^[a-z][\w-]*/i)?.[0];
    if(tag){if(tag.toLowerCase()!==node.tagName.toLowerCase())return false;rest=rest.slice(tag.length);}
    const id=rest.match(/^#([\w-]+)/);
    if(id){if(node.id!==id[1])return false;rest=rest.slice(id[0].length);}
    while(rest){
      const attr=rest.match(/^\[([\w-]+)(?:(\^?=)"([^"]*)")?\]/);
      if(!attr)return false;
      const value=node.getAttribute(attr[1]);
      if(!node.hasAttribute(attr[1])||(attr[2]==='='&&value!==attr[3])||
        (attr[2]==='^='&&!String(value).startsWith(attr[3])))return false;
      rest=rest.slice(attr[0].length);
    }
    return Boolean(part.trim());
  });
  node.closest=selector=>{
    for(let current=node;current;current=current.parentElement)if(current.matches(selector))return current;
    return null;
  };
  node.querySelectorAll=selector=>node.children.flatMap(child=>[
    ...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)
  ]);
  node.querySelector=selector=>node.querySelectorAll(selector)[0]||null;
  node.setConnected=connected=>{
    node.isConnected=connected;
    for(const child of node.children)child.setConnected(connected);
    node.shadow?.setConnected(connected);
  };
  node.remove=()=>{
    if(node.parentNode)node.parentNode.children=node.parentNode.children.filter(child=>child!==node);
    node.parentNode=null;node.setConnected(false);
  };
  node.append=(...children)=>{
    for(const child of children){child.remove();child.parentNode=node;node.children.push(child);child.setConnected(node.isConnected);}
  };
  node.replaceChildren=(...children)=>{for(const child of [...node.children])child.remove();node.append(...children);};
  node.before=child=>{
    if(!node.parentNode)return;
    child.remove();child.parentNode=node.parentNode;
    node.parentNode.children.splice(node.parentNode.children.indexOf(node),0,child);
    child.setConnected(node.isConnected);
  };
  node.attachShadow=()=>{node.shadow=jumpDOM(mockElement('shadow'));node.shadow.setConnected(node.isConnected);return node.shadow;};
  return node;
}

async function jumpPage({installed=true,enabled=true,webButtons=true,url=CHATGPT_ORIGIN+'/c/mock',customSite=false}={}){
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const row=globalThis.OpenDeskPromptShortcutsModel.draft({body:'完整正文\n第二行'},null,()=> 'jump-prompt');
  const library={schema:1,items:[row],settings:{webButtons}};
  const f=fixture({pkg,library,grants:{}});
  if(!installed)f.values.set(SIDEBAR_TOOL_STORE,[]);
  if(!enabled)f.values.set(SIDEBAR_TOOL_ENABLE_STORE,{[PROMPT_ID]:false});
  if(customSite)f.values.set(PROMPT_DATA_STORE,{library,sites:{schema:1,rules:[{
    origin:new URL(url).origin,pathScope:'/compose',containerSelector:'main',editorSelector:'textarea',enabled:true
  }]}});
  f.win.location.href=url;
  const element=tag=>jumpDOM(mockElement(tag));
  for(const node of [f.root,f.doc.body,f.main,f.editor])jumpDOM(node);
  if(customSite){f.editor.tagName='textarea';f.editor.isContentEditable=false;}
  f.editor.setAttribute('id','prompt-textarea');
  f.main.getBoundingClientRect=()=>regionRect(260,40,900,700);
  f.doc.body.append(f.main);f.main.append(f.editor);
  f.doc.createElement=element;
  f.doc.createElementNS=(_namespace,tag)=>element(tag);
  const originalQuery=f.doc.querySelector;
  f.doc.querySelectorAll=selector=>selector.startsWith('main ')?
    (originalQuery(selector)?[f.editor]:[]):f.doc.documentElement.querySelectorAll(selector);
  f.doc.querySelector=selector=>f.doc.querySelectorAll(selector)[0]||null;
  f.win.getComputedStyle=node=>({display:'block',visibility:'visible',opacity:'1',position:'static',
    overflowY:node===f.main?'auto':'visible',lineHeight:'20px',fontSize:'16px'});
  f.main.scrollHeight=4000;f.main.clientHeight=650;f.main.scrollTop=1600;f.main.scrollLeft=0;
  const scrolls=[];
  f.main.scrollTo=options=>{scrolls.push(options);f.main.scrollTop=options.top;};
  const conversation=()=>{
    const turn=element('article'),header=element('header'),anchor=element('button'),pre=element('pre');
    turn.setAttribute('data-testid','conversation-turn-1');
    anchor.setAttribute('aria-label','复制');anchor.setAttribute('aria-controls','jump-content');
    pre.setAttribute('id','jump-content');pre.textContent='code\n'.repeat(200);
    header.getBoundingClientRect=()=>regionRect(300,200,800,40);
    pre.getBoundingClientRect=()=>regionRect(300,300,800,1000);
    pre.scrollHeight=1000;pre.clientHeight=1000;
    header.append(anchor);turn.append(header,pre);
    return {turn,header,anchor,pre};
  };
  const content=conversation();f.main.append(content.turn);
  const arrowHosts=()=>f.doc.querySelectorAll('[data-opendesk-chatgpt-jump-top]');
  const arrows=()=>arrowHosts().map(host=>host.shadow.querySelector('button'));
  const click=button=>button.emit('click',{isTrusted:true,preventDefault(){},stopPropagation(){}});
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  return {...f,pkg,row,library,controller,element,conversation,content,scrolls,arrowHosts,arrows,click};
}

test('Prompt jump integration: installed initialization mounts one content arrow; refresh preserves insertion',async()=>{
  const f=await jumpPage();
  try{
    await settle();
    assert.equal(f.arrows().length,1,'installation alone activates the static adapter');
    assert.equal(f.arrowHosts()[0].nextElementSibling,f.content.anchor,'arrow belongs to native content toolbar');
    assert.equal(f.arrows()[0].getAttribute('aria-label'),'回到此内容开头');
    assert.equal(f.buttons().length,1,'existing prompt rail remains available');
    f.click(f.arrows()[0]);await settle();
    assert(f.scrolls.length>0,'live arrow invokes the real scroll algorithm');
    assert(f.scrolls.every(scroll=>Number.isFinite(scroll.top)&&scroll.behavior==='instant'));
    assert.equal(f.calls.length,0,'jump never edits the draft');
    const stale=f.arrows()[0];
    await Promise.all([f.controller.refresh(),f.controller.refresh(),f.controller.refresh()]);await settle();
    assert.equal(f.arrows().length,1,'repeated permission refresh never duplicates arrows');
    const count=f.scrolls.length;f.click(stale);await settle();assert.equal(f.scrolls.length,count);
    f.buttons()[0].emit('click',{isTrusted:true});await settle();
    assert.deepEqual(f.calls,[{command:'insertText',text:'\n'+f.row.body}]);
    assert.equal(f.editor.textContent,'已有草稿\n'+f.row.body);
    assert.deepEqual(f.copied,[],'jump integration preserves confirmed native insertion');
  }finally{f.controller.dispose();}
  assert.equal(f.arrows().length,0);
  assert.equal(f.events.size,0,'all window listeners are released');
  assert(f.mutationObservers.every(observer=>!observer.target),'all observers are disconnected');
});

for(const gate of ['uninstalled','disabled','webButtons off','lookalike origin','custom site']){
  test('Prompt jump integration: initial gate rejects '+gate,async()=>{
    const options={uninstalled:{installed:false},disabled:{enabled:false},'webButtons off':{webButtons:false},
      'lookalike origin':{url:'https://chatgpt.com.evil.example/c/mock'},
      'custom site':{url:'https://example.org/compose',customSite:true}}[gate];
    const f=await jumpPage(options);
    try{
      await settle();assert.equal(f.arrows().length,0);
      if(gate==='custom site')assert.equal(f.buttons().length,1,'custom-site prompt rail does not grant ChatGPT scrolling');
      await f.controller.refresh();await settle();assert.equal(f.arrows().length,0);
      assert.deepEqual(f.scrolls,[]);
    }finally{f.controller.dispose();}
  });
}

for(const gate of ['disable','uninstall','webButtons']){
  test('Prompt jump integration: '+gate+' cleans up and restore mounts a fresh arrow',async()=>{
    const f=await jumpPage();
    try{
      await settle();assert.equal(f.arrows().length,1);
      const stale=f.arrows()[0],host=f.arrowHosts()[0],observers=[...f.mutationObservers];
      const [key,blocked,restored]={disable:[SIDEBAR_TOOL_ENABLE_STORE,{[PROMPT_ID]:false},{}],
        uninstall:[SIDEBAR_TOOL_STORE,[],[f.pkg]],
        webButtons:[PROMPT_DATA_STORE,{library:{...f.library,settings:{webButtons:false}}},{library:f.library}]}[gate];
      f.change(key,blocked);await settle();
      assert.equal(f.arrows().length,0);assert.equal(host.isConnected,false);
      assert.equal(f.buttons().length,0,'existing prompt controls share the same gate');
      assert(observers.every(observer=>!observer.target),'revoked session releases its observers');
      f.click(stale);await settle();assert.deepEqual(f.scrolls,[],'detached arrow cannot scroll');
      f.change(key,restored);await settle();
      assert.equal(f.arrows().length,1);assert.notEqual(f.arrows()[0],stale);
      f.click(stale);await settle();assert.deepEqual(f.scrolls,[],'restoration cannot revive an old listener');
      f.click(f.arrows()[0]);await settle();assert(f.scrolls.length>0,'fresh session works after restoration');
    }finally{f.controller.dispose();}
  });
}

test('Prompt jump integration: same-URL documentElement replacement restores only the current document arrow',async()=>{
  const f=await jumpPage();
  try{
    await settle();assert.equal(f.arrows().length,1);
    const stale=f.arrows()[0],oldRoot=f.doc.documentElement;
    const root=f.element('html'),body=f.element('body'),content=f.conversation();
    oldRoot.setConnected(false);root.append(body);body.append(f.main);
    f.content.turn.remove();f.main.append(content.turn);
    f.doc.documentElement=root;f.doc.body=body;
    f.intervals[0]();await settle();
    assert.equal(f.arrows().length,1,'normal fallback detects root replacement without URL change');
    assert.equal(f.arrowHosts()[0].nextElementSibling,content.anchor);
    assert(!oldRoot.querySelector('[data-opendesk-chatgpt-jump-top]'),'old document host removed');
    f.click(stale);await settle();assert.deepEqual(f.scrolls,[]);
    f.intervals[0]();await settle();assert.equal(f.arrows().length,1);
    f.click(f.arrows()[0]);await settle();assert(f.scrolls.length>0);
  }finally{f.controller.dispose();}
});

test('Prompt jump integration: SPA toolbar replacement and exact-origin exit invalidate stale arrows',async()=>{
  const f=await jumpPage();
  try{
    await settle();assert.equal(f.arrows().length,1);
    const stale=f.arrows()[0],content=f.conversation();
    f.content.turn.remove();f.main.append(content.turn);
    f.win.location.href=CHATGPT_ORIGIN+'/c/next';
    f.click(stale);await settle();assert.deepEqual(f.scrolls,[],'URL changes invalidate clicks before navigation delivery');
    f.events.get('popstate')?.();await settle();
    assert.equal(f.arrows().length,1);assert.equal(f.arrowHosts()[0].nextElementSibling,content.anchor);
    f.click(stale);await settle();assert.deepEqual(f.scrolls,[]);
    const next=f.arrows()[0];
    f.click(next);await settle();assert(f.scrolls.length>0);
    const count=f.scrolls.length;
    f.win.location.href='https://chatgpt.com.evil.example/c/next';
    f.events.get('hashchange')?.();await settle();assert.equal(f.arrows().length,0);
    f.click(next);await settle();assert.equal(f.scrolls.length,count);
    f.win.location.href=CHATGPT_ORIGIN+'/c/returned';
    f.events.get('popstate')?.();await settle();assert.equal(f.arrows().length,1);
    f.click(next);await settle();assert.equal(f.scrolls.length,count);
    f.click(f.arrows()[0]);await settle();assert(f.scrolls.length>count);
  }finally{f.controller.dispose();}
});

function assertRuntimeDisposed(f){
  assert.equal(f.buttons().length,0);
  assert.equal(f.doc.querySelectorAll('[data-opendesk-prompts]').length,0);
  assert.equal(f.arrows().length,0);
  assert.equal(f.activeIntervals.size,0);
  assert.equal(f.pendingTimers.size,0);
  assert.equal(f.toastTimers.size,0);
  assert.equal(f.events.size,0);
  assert.equal(f.docEvents.size,0);
  assert(f.mutationObservers.every(observer=>!observer.target));
  assert.equal(f.win.__openDeskPromptShortcutsPageV1,undefined);
}

test('Prompt runtime lifetime: invalidation removes controls and stale callbacks cannot revive them',async()=>{
  const f=await jumpPage();
  try{
    await settle();assert.equal(f.arrows().length,1);assert.equal(f.buttons().length,1);
    const stale=f.arrows()[0],pageShow=f.events.get('pageshow'),storage=[...f.siteEvents][0];
    f.mutate([{target:f.main,addedNodes:[f.content.turn]}]);
    const callbacks=[...f.pendingTimers.values()];
    assert(callbacks.length>0,'exercise cancellation of pending DOM work');
    let reads=0;const get=f.api.storage.local.get;
    f.api.storage.local.get=keys=>{reads++;return get(keys);};
    f.api.runtime.id=undefined;
    f.intervals[0]();assertRuntimeDisposed(f);
    assert.equal(f.siteEvents.size,0);assert.equal(f.runtimeMessages.size,0);
    assert.doesNotThrow(()=>{f.controller.dispose();f.controller.dispose();});
    for(const callback of callbacks)callback();
    f.click(stale);f.intervals[0]();pageShow({persisted:true});
    storage({[PROMPT_DATA_STORE]:{}},'local');await f.controller.refresh();await settle();
    assert.equal(reads,0);assert.deepEqual(f.scrolls,[]);assertRuntimeDisposed(f);
    assert.equal(initPromptShortcuts({api:f.api,doc:f.doc,win:f.win}),null);
  }finally{f.controller.dispose();}
});

test('Prompt runtime lifetime: throwing Chrome listener removals cannot interrupt DOM cleanup',async()=>{
  const f=await jumpPage();
  try{
    await settle();let removals=0;
    for(const source of [f.api.storage.onChanged,f.api.runtime.onMessage]){
      source.removeListener=()=>{removals++;throw Error('Extension context invalidated');};
    }
    f.api.runtime.id=undefined;
    // Exercise the jump callback guard before the 1100ms poll runs.
    assert.doesNotThrow(()=>f.click(f.arrows()[0]));await settle();
    assert.equal(removals,3);assert.deepEqual(f.scrolls,[]);assertRuntimeDisposed(f);
    assert.doesNotThrow(()=>f.controller.dispose());
    assert.equal(removals,3,'disposal remains idempotent after Chrome removal failures');
  }finally{f.controller.dispose();}
});

test('Prompt jump integration: BFCache suspends the session and restores one fresh arrow',async()=>{
  const f=await jumpPage();
  try{
    await settle();assert.equal(f.arrows().length,1);
    const stale=f.arrows()[0];
    f.events.get('pagehide')({persisted:true});await settle();
    assert.equal(f.arrows().length,0);assert.equal(f.buttons().length,0);
    f.click(stale);f.intervals[0]();await settle();assert.deepEqual(f.scrolls,[]);assert.equal(f.arrows().length,0);
    f.events.get('pageshow')({persisted:true});await settle();
    assert.equal(f.arrows().length,1);assert.equal(f.buttons().length,1);
    f.click(stale);await settle();assert.deepEqual(f.scrolls,[]);
    f.events.get('pageshow')({persisted:true});await settle();assert.equal(f.arrows().length,1);
    f.click(f.arrows()[0]);await settle();assert(f.scrolls.length>0);
  }finally{f.controller.dispose();}
});

test('Prompt jump integration: DOM replacement schedules one new binding and retires the old arrow',async()=>{
  const f=await jumpPage();
  try{
    await settle();assert.equal(f.arrows().length,1);
    const stale=f.arrows()[0],content=f.conversation();
    f.content.turn.remove();f.main.append(content.turn);
    f.mutate([{target:f.main,addedNodes:[content.turn],removedNodes:[f.content.turn]}]);
    f.mutate([{target:f.main,addedNodes:[content.turn]}]);
    await settle();
    assert.equal(f.arrows().length,1,'observer/timer refreshes coalesce without duplicated controls');
    assert.equal(f.arrowHosts()[0].nextElementSibling,content.anchor);
    f.click(stale);await settle();assert.deepEqual(f.scrolls,[]);
    f.click(f.arrows()[0]);await settle();assert(f.scrolls.length>0);
  }finally{f.controller.dispose();}
});

for(const gate of ['disable','uninstall','webButtons']){
  test('Prompt jump integration: trusted click rereads '+gate+' before storage notification',async()=>{
    const f=await jumpPage();
    try{
      await settle();assert.equal(f.arrows().length,1);
      const button=f.arrows()[0],get=f.api.storage.local.get;let reads=0;
      f.api.storage.local.get=keys=>{reads++;return get(keys);};
      button.emit('click',{isTrusted:false,preventDefault(){},stopPropagation(){}});
      await settle();assert.equal(reads,0);assert.deepEqual(f.scrolls,[]);
      const [key,blocked]={disable:[SIDEBAR_TOOL_ENABLE_STORE,{[PROMPT_ID]:false}],
        uninstall:[SIDEBAR_TOOL_STORE,[]],
        webButtons:[PROMPT_DATA_STORE,{library:{...f.library,settings:{webButtons:false}}}]}[gate];
      f.values.set(key,blocked); // Storage changed, but onChanged has not reached this document.
      f.click(button);await settle();
      assert.equal(reads,1,'trusted click rechecks current persisted authorization');
      assert.deepEqual(f.scrolls,[]);assert.equal(f.arrows().length,0);
    }finally{f.controller.dispose();}
  });
}

for(const fence of ['refresh','url','root']){
  test('Prompt jump integration: pending click cannot cross '+fence+' fence',async()=>{
    const f=await jumpPage();let release;
    try{
      await settle();assert.equal(f.arrows().length,1);
      const get=f.api.storage.local.get;
      f.api.storage.local.get=keys=>{
        f.api.storage.local.get=get;
        return new Promise(resolve=>{release=()=>resolve(get(keys));});
      };
      f.click(f.arrows()[0]);assert.equal(typeof release,'function');
      if(fence==='refresh')await f.controller.refresh();
      if(fence==='url')f.win.location.href=CHATGPT_ORIGIN+'/c/changed-before-read';
      if(fence==='root'){
        const root=f.element('html');root.append(f.doc.body);f.doc.documentElement=root;
      }
      release();await settle();assert.deepEqual(f.scrolls,[],'stale asynchronous authorization cannot scroll');
    }finally{release?.();f.controller.dispose();}
  });
}

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
    assert.match(feedback.textContent,/已复制，请粘贴/);
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
    assert.equal(feedback?.hidden,true,'verified insertion must not show a toast');
    assert.equal(feedback.textContent,'');
    const announcer=host.shadow.children.find(item=>item.className==='announcer');
    assert.match(announcer.textContent,/已插入草稿，未发送/);
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
    assert.match(feedback.textContent,/已复制，请粘贴/);
    assert.equal(feedback.dataset.kind,'success');
  }finally{controller?.dispose();}
});

test('R2.6 narrow ChatGPT rail shows shortcuts immediately without a fold button',async()=>{
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
    assert.equal(f.rail().classList.items.has('folded'),false);
    assert.equal(f.buttons().length,1);
    assert.equal(f.rail().children.length,2,'OD plus one shortcut, no fold button');
    assert.deepEqual(f.buttons()[0].children.map(span=>span.textContent),['🧑‍💻','中']);
    f.buttons()[0].emit('mouseenter');
    const host=f.root.children.find(item=>item.attributes['data-opendesk-prompts']!==undefined);
    const tooltip=host.shadow.children.find(item=>item.className==='tip');
    assert.equal(tooltip.hidden,false);
    assert.equal(tooltip.children[0].textContent,row.name);
    assert.equal(tooltip.children[1].textContent,row.body);
  }finally{controller.dispose();}
});

test('R2.6 newly saved library entries appear on injected page via storage change without refresh',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const model=globalThis.OpenDeskPromptShortcutsModel;
  const first=model.draft({body:'检查一：文字润色',label:'润色'},null,()=> 'prompt-r26-one');
  const second=model.draft({body:'检查二：新的提示词',label:'新建'},null,()=> 'prompt-r26-two');
  const settings={webButtons:true};
  const f=fixture({pkg,library:{schema:1,items:[first],settings}});
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  try{
    await settle();
    assert.equal(f.buttons().length,1);
    f.change(PROMPT_DATA_STORE,{library:{schema:1,items:[first,second],settings}});
    await settle();
    assert.equal(f.buttons().length,2,'storage change must update currently opened page');
    assert.equal(f.rail().children.length,3,'one OD plus two shortcuts, no duplicated injection');
    assert.equal(f.buttons()[1].getAttribute('aria-label'),'插入提示词：'+second.name);
    f.change(PROMPT_DATA_STORE,{library:{schema:1,items:[first],settings}});
    await settle();
    assert.equal(f.buttons().length,1,'delete also refreshes the same rail');
  }finally{controller.dispose();}
});

async function readyPage(){
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const row=globalThis.OpenDeskPromptShortcutsModel.draft({body:'完整正文\n第二行'},null,()=> 'prompt-r18');
  const grants=await changePromptSiteGrant({},pkg,'first',true);
  const f=fixture({pkg,grants,library:{schema:1,items:[row],settings:{webButtons:true}}});
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  await settle();
  const host=()=>f.root.children.find(item=>item.attributes['data-opendesk-prompts']!==undefined);
  const panel=className=>host()?.shadow.children.find(item=>item.className===className);
  return {...f,controller,host,panel,row};
}

test('R1.8 tooltip retains focus on itself or descendants, then hides after focus leaves',async()=>{
  const f=await readyPage();
  try{
    const button=f.buttons()[0],tip=f.panel('tip');
    button.focus();button.emit('focus');button.emit('blur');
    tip.focus();tip.emit('focusin');
    // Pointer leaving must not dismiss keyboard-focused, scrollable content.
    tip.emit('mouseleave');await settle();
    assert.equal(tip.hidden,false,'tooltip itself retains focus');
    const child=mockElement('div'),nested=mockElement('button');child.append(nested);tip.append(child);
    nested.focus();tip.emit('focusin');tip.emit('mouseleave');await settle();
    assert.equal(tip.hidden,false,'focus anywhere inside tooltip retains it');
    const outside=mockElement('button');f.rail().append(outside);
    outside.focus();tip.emit('focusout');await settle();
    assert.equal(tip.hidden,true,'leaving tooltip without a pointer event dismisses it');
    assert.equal(button.getAttribute('aria-describedby'),undefined);
    button.focus();button.emit('focus');button.emit('mouseleave');await settle();
    assert.equal(tip.hidden,false,'owner focus still retains tooltip');
    f.host().shadow.emit('keydown',{key:'Escape'});
    assert.equal(tip.hidden,true,'Escape still dismisses focused tooltip');
  }finally{f.controller.dispose();}
});

test('R1.8 open tooltip follows rail scroll and window layout without rewriting content',async()=>{
  const f=await readyPage();
  try{
    const button=f.buttons()[0],host=f.host(),tip=f.panel('tip');
    let buttonTop=180,hostLeft=272,hostTop=100;
    host.getBoundingClientRect=()=>({left:hostLeft,top:hostTop,width:48,height:248});
    button.getBoundingClientRect=()=>({left:hostLeft,top:buttonTop,width:38,height:38});
    tip.getBoundingClientRect=()=>({height:100});
    button.emit('mouseenter');
    const content=tip.children[1];
    assert.equal(tip.style.top,'68px');
    buttonTop=140;
    f.rail().emit('scroll');await settle();
    assert.equal(tip.style.top,'28px','closed shadow rail scroll has its own listener');
    hostLeft=1100;hostTop=120;buttonTop=220;
    f.editor.getBoundingClientRect=()=>regionRect(350,220,540,70);
    f.win.innerHeight=320;f.events.get('resize')();await settle();
    assert.equal(tip.style.top,'88px');
    assert.equal(tip.style.left,'auto');assert.equal(tip.style.right,'64px',
      'narrow rail respects the reviewed 64px minimum tooltip clearance');
    assert.equal(tip.children[1],content,'layout retains the original tooltip content');
    assert.equal(content.textContent,f.row.body);
    f.main.getBoundingClientRect=()=>({left:260,top:80,width:540,height:640});
    f.events.get('resize')();await settle();
    assert.equal(tip.hidden,false,'narrow rail remains visible and does not fold');
    assert.equal(button.getAttribute('aria-describedby'),'opendesk-prompt-tooltip');
  }finally{f.controller.dispose();}
});

for(const scenario of ['navigation','navigation-refresh','disposed','bfcache','revoked','ime-reject','ime-no-editor']){
  test('R1.8 pending insertion cannot copy, show feedback or steal focus after '+scenario,async()=>{
    const f=await readyPage();
    try{
      const read=f.api.storage.local.get,values=await read(KEYS_FOR_PENDING_READ);
      let resolve,reject;
      const pending=new Promise((yes,no)=>{resolve=yes;reject=no;});
      let first=true;
      f.api.storage.local.get=keys=>{if(first){first=false;return pending;}return read(keys);};
      const button=f.buttons()[0],shadow=f.host().shadow;
      button.focus();button.emit('click',{isTrusted:true});
      const priorFeedback=f.panel('feedback');
      if(scenario.startsWith('navigation')){
        f.win.location.href=CHATGPT_ORIGIN+'/c/new-document';
        if(scenario==='navigation-refresh')f.events.get('popstate')();
      }else if(scenario==='disposed')f.controller.dispose();
      else if(scenario==='bfcache'){
        f.events.get('pagehide')({persisted:true});f.events.get('pageshow')();
      }else if(scenario==='revoked')f.change(SIDEBAR_TOOL_STORE,[]);
      else{
        f.docEvents.get('compositionstart')();
        if(scenario==='ime-no-editor')f.editor.isConnected=false;
      }
      await settle();
      if(scenario==='ime-reject')reject(Error('storage read failed during composition'));
      else resolve(values);
      await settle();
      assert.equal(f.calls.length,0,'no editor effect after context changes');
      assert.equal(f.editor.focused,undefined,'no editor focus after context changes');
      assert.deepEqual(f.copied,[],'stale catch must not copy');
      assert.equal(shadow.activeElement,button,'stale catch must not steal trigger focus');
      for(const feedback of new Set([priorFeedback,f.panel('feedback')].filter(Boolean))){
        assert.equal(feedback.hidden,true,'stale catch must not show feedback');
        assert.equal(feedback.textContent,'','stale catch must not report a copy');
        assert.equal(feedback.focused,undefined,'stale catch must not focus feedback');
      }
    }finally{f.controller.dispose();}
  });
}

const KEYS_FOR_PENDING_READ=[SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,
  PROMPT_SITE_STORE,PROMPT_DATA_STORE];

test('R1.8 current insertion failure copies the complete prompt without focusing feedback',async()=>{
  const f=await readyPage();
  try{
    f.doc.execCommand=()=>false;
    f.buttons()[0].emit('click',{isTrusted:true});await settle();
    const feedback=f.panel('feedback');
    assert.deepEqual(f.copied,[f.row.body]);
    assert.equal(feedback.hidden,false);
    assert.match(feedback.textContent,/已复制，请粘贴/);
    assert.equal(feedback.dataset.kind,'success');
    assert.equal(feedback.getAttribute('aria-hidden'),'true');
    assert.equal(f.panel('announcer').getAttribute('role'),'status');
    assert.equal(f.panel('announcer').getAttribute('aria-live'),'polite');
    assert.equal(feedback.focused,undefined);
    assert.equal(f.host().shadow.activeElement,undefined,'copy feedback must not steal editor focus');
  }finally{f.controller.dispose();}
});

function regionRect(left,top,width,height){return {left,top,width,height,right:left+width,bottom:top+height};}

test('R2.15 content-left rail avoids live navigation and never flips to content-right',async()=>{
  const f=await readyPage();
  try{
    const aside=mockElement('aside'),nav=mockElement('nav');
    let edge=260;
    f.main.getBoundingClientRect=()=>regionRect(0,0,1263,843);
    aside.getBoundingClientRect=()=>regionRect(0,0,edge,843);
    nav.getBoundingClientRect=()=>regionRect(0,96,edge,582);
    f.main.querySelectorAll=()=>[aside,nav];
    f.win.innerWidth=1263;f.win.innerHeight=843;
    f.events.get('resize')();await settle();
    assert.equal(f.host().style.left,'268px','rail sits 8px inside the visible conversation region');
    assert.equal(f.host().style.top,'422px');
    assert.equal(f.rail().classList.contains('horizontal'),false);
    assert.equal(Number.parseFloat(f.host().style.left)-edge,8,'rail follows the real navigation edge with an 8px inset');
    edge=320;f.events.get('resize')();await settle();
    assert.equal(f.rail().classList.contains('horizontal'),true,
      'too-wide navigation must force the ABOVE-composer fallback, not right placement');
    assert.equal(f.host().style.left,'350px');
    edge=0;f.events.get('resize')();await settle();
    assert.equal(f.rail().classList.contains('horizontal'),false);
    assert.equal(f.host().style.left,'8px','collapsed navigation restores left rail');
    aside.hidden=true;nav.hidden=true;edge=320;
    f.events.get('resize')();await settle();
    assert.equal(f.host().style.left,'8px','hidden navigation reserves no space');
    aside.hidden=false;nav.hidden=false;
    f.win.getComputedStyle=node=>({visibility:node===aside||node===nav?'hidden':'visible'});
    f.events.get('resize')();await settle();
    assert.equal(f.host().style.left,'8px','CSS-hidden navigation reserves no space');
  }finally{f.controller.dispose();}
});

test('R2.16 rail stays 8px inside its container as the centered composer moves',async()=>{
  const f=await readyPage();
  try{
    f.main.getBoundingClientRect=()=>regionRect(260,0,1100,768);
    for(const editorLeft of [350,500,700]){
      f.editor.getBoundingClientRect=()=>regionRect(editorLeft,480,540,100);
      f.events.get('resize')();await settle();
      assert.equal(f.host().style.left,'268px','composer centering cannot add a large left gutter');
      assert.equal(f.rail().classList.contains('horizontal'),false);
      assert(Number.parseFloat(f.host().style.left)+52+10<=editorLeft,'keep the editor clear');
    }
    f.editor.getBoundingClientRect=()=>regionRect(320,480,540,100);
    f.events.get('resize')();await settle();
    assert.equal(f.rail().classList.contains('horizontal'),true,'retain above-composer fallback when gutter cannot fit');
    assert.equal(f.host().style.left,'320px');
  }finally{f.controller.dispose();}
});

test('R2.15 navigation outside main still blocks unsafe left placement',async()=>{
  const f=await readyPage();
  try{
    const external=mockElement('aside');
    let edge=310;
    f.main.getBoundingClientRect=()=>regionRect(0,0,1200,768);
    external.getBoundingClientRect=()=>regionRect(0,0,edge,768);
    const originalQuery=f.doc.querySelectorAll.bind(f.doc);
    f.doc.querySelectorAll=selector=>selector==='aside, nav, [role="navigation"]'?
      [external]:originalQuery(selector);
    f.win.innerWidth=1200;f.win.innerHeight=768;
    f.events.get('resize')();await settle();
    assert.equal(f.rail().classList.contains('horizontal'),true,
      'external native nav must reserve its actual width');
    assert.equal(f.host().style.left,'350px','compact fallback aligns with composer, never right');
    edge=260;f.events.get('resize')();await settle();
    assert.equal(f.rail().classList.contains('horizontal'),false);
    assert.equal(f.host().style.left,'268px','safe gap allows left vertical B rail');
  }finally{f.controller.dispose();}
});

test('R2.15 only tall left-edge navigation reserves gutter; main excludes navigation once',async()=>{
  const f=await readyPage();
  try{
    const candidates=[regionRect(300,0,180,843),regionRect(0,100,260,200),
      regionRect(0,0,800,843),regionRect(0,-600,260,843)].map(rect=>{
      const aside=mockElement('aside');aside.getBoundingClientRect=()=>rect;return aside;
    });
    f.main.getBoundingClientRect=()=>regionRect(0,0,1263,843);
    f.main.querySelectorAll=()=>candidates;
    f.events.get('resize')();await settle();
    assert.equal(f.host().style.left,'8px','irrelevant floating asides ignored');
    f.main.getBoundingClientRect=()=>regionRect(260,0,1003,843);
    const nav=mockElement('nav');nav.getBoundingClientRect=()=>regionRect(0,96,260,582);
    f.main.querySelectorAll=()=>[nav];
    f.events.get('resize')();await settle();
    assert.equal(f.host().style.left,'268px','main already excludes navigation');
    const navigation=mockElement('div');navigation.setAttribute('role','navigation');
    navigation.getBoundingClientRect=()=>regionRect(0,96,180,582);
    f.main.getBoundingClientRect=()=>regionRect(0,0,1263,843);
    f.main.querySelectorAll=()=>[navigation];
    f.events.get('resize')();await settle();
    assert.equal(f.host().style.left,'188px','role navigation leaves an 8px conversation inset');
  }finally{f.controller.dispose();}
});

test('R1.8 follows the full-height conversation container after a sidebar transition, not its composer',async()=>{
  const f=await readyPage();
  let notify,disconnected=false;
  try{
    const observed=new Set();
    f.win.ResizeObserver=class{
      constructor(callback){notify=callback;}
      observe(node){observed.add(node);}
      disconnect(){disconnected=true;}
    };
    const content=mockElement('div'),composer=mockElement('form');
    f.main.append(content);content.append(composer);composer.append(f.editor);
    f.editor.parentElement=composer;composer.parentElement=content;content.parentElement=f.main;
    let edge=260;
    f.main.getBoundingClientRect=()=>regionRect(0,0,1263,899);
    content.getBoundingClientRect=()=>regionRect(edge,0,1263-edge,899);
    composer.getBoundingClientRect=()=>regionRect(377,461,768,52);
    f.win.innerWidth=1263;f.win.innerHeight=899;
    await f.controller.refresh();await settle();
    assert.equal(f.host().style.left,'268px');
    assert.equal(f.host().style.top,'450px');
    assert(observed.has(content),'observe the actual conversation container');
    assert.equal(f.host().attributes['data-opendesk-prompts-anchor'],'conversation-region-r18');
    edge=0;f.editor.getBoundingClientRect=()=>regionRect(90,480,540,100);
    notify();await settle();
    assert.equal(f.host().style.left,'8px','rail follows the full-height conversation container');
    edge=260;f.editor.getBoundingClientRect=()=>regionRect(350,480,540,100);
    f.docEvents.get('transitionend')();await settle();
    assert.equal(f.host().style.left,'268px','transition completion remeasures editor and gutter');
  }finally{f.controller.dispose();}
  assert(disconnected,'dispose disconnects the layout observer');
  assert(!f.docEvents.has('transitionend'),'dispose removes the transition listener');
});

// Shape observed in the logged-in ChatGPT composer: no legacy id/testid.
function loggedInComposer(f,{before='',extra=[]}={}){
  const query=f.doc.querySelector;
  f.editor.setAttribute('role','textbox');
  f.editor.setAttribute('aria-label','询问 ChatGPT');
  f.editor.setAttribute('data-composer-markdown','');
  f.editor.children=before.split('\n').map(text=>({tagName:'P',innerText:text||'\n'}));
  f.doc.querySelectorAll=selector=>{
    if(!selector.startsWith('main '))return [];
    const legacy=extra;
    return selector.includes('[data-composer-markdown]')?[...legacy,f.editor]:legacy;
  };
  f.doc.querySelector=selector=>selector.startsWith('main ')?
    f.doc.querySelectorAll(selector)[0]||null:query(selector);
  f.doc.execCommand=(command,_show,text)=>{
    f.calls.push({command,text});
    f.editor.children=(before+text).split('\n').map(line=>({tagName:'P',innerText:line||'\n'}));
    return true;
  };
}
for(const before of ['', '已有草稿\n第二段']){
  test('logged-in anonymous ChatGPT composer preserves multiline draft: '+(before?'append':'empty'),async()=>{
    const f=await readyPage();
    try{
      loggedInComposer(f,{before});
      f.buttons()[0].emit('click',{isTrusted:true});await settle();
      const text=(before?'\n':'')+f.row.body;
      assert.deepEqual(f.calls,[{command:'insertText',text}],'only one native edit, no submit');
      assert.equal(f.editor.children.map(p=>p.innerText==='\n'?'':p.innerText).join('\n'),before+text);
      assert.deepEqual(f.copied,[],'successful insertion must not enter clipboard fallback');
      assert.match(f.panel('announcer').textContent,/已插入草稿，未发送/);
    }finally{f.controller.dispose();}
  });
}
for(const state of ['hidden','readonly','noneditable','duplicate','replaced-on-focus']){
  test('ChatGPT composer discovery safely handles legacy candidate: '+state,async()=>{
    const f=await readyPage();
    try{
      const old=mockElement('TEXTAREA');old.value='不能覆盖的旧草稿';
      if(state==='hidden')old.hidden=true;
      if(state==='readonly')old.readOnly=true;
      if(state==='noneditable')old.tagName='DIV';
      loggedInComposer(f,{extra:state==='replaced-on-focus'?[]:[old]});
      if(state==='replaced-on-focus'){
        const focus=f.editor.focus;
        f.editor.focus=()=>{focus();f.doc.querySelectorAll=()=>[old];};
      }
      f.buttons()[0].emit('click',{isTrusted:true});await settle();
      const refuse=['duplicate','replaced-on-focus'].includes(state);
      assert.equal(f.calls.length,refuse?0:1);
      assert.equal(old.value,'不能覆盖的旧草稿');
      assert.deepEqual(f.copied,refuse?[f.row.body]:[]);
      assert.equal(f.panel('announcer').textContent.includes('已插入'),!refuse);
    }finally{f.controller.dispose();}
  });
}

function mobileComposer(f,{accepted=true}={}){
  const query=f.doc.querySelector,selections=[];
  f.editor.tagName='TEXTAREA';
  f.editor.isContentEditable=false;f.editor.id='mobile-composer-prompt';f.editor.value='已有草稿';
  f.editor.setSelectionRange=(start,end)=>selections.push([start,end]);
  f.doc.querySelector=selector=>selector.startsWith('main ')?
    (selector.split(',').includes('main textarea#mobile-composer-prompt')?f.editor:null):query(selector);
  f.doc.execCommand=(command,_show,text)=>{
    f.calls.push({command,text});
    if(!accepted)return false;
    f.editor.value+=text;return true;
  };
  return selections;
}

test('R1.8 logged-out mobile-composer textarea appends complete draft via accepted native command',async()=>{
  const f=await readyPage();
  try{
    const selections=mobileComposer(f),before=f.editor.value;
    f.buttons()[0].emit('click',{isTrusted:true});await settle();
    assert.deepEqual(selections,[[before.length,before.length]],'textarea caret moves to draft end');
    assert.deepEqual(f.calls,[{command:'insertText',text:'\n'+f.row.body}]);
    assert.equal(f.editor.value,before+'\n'+f.row.body);
    assert.equal(f.editor.focused,true);
    const feedback=f.panel('feedback');
    assert.equal(feedback.hidden,true,'verified mobile insertion is visually silent');
    assert.match(f.panel('announcer').textContent,/已插入草稿，未发送/);
    assert.deepEqual(f.copied,[],'verified insertion never also copies');
  }finally{f.controller.dispose();}
});

for(const state of ['hidden','css-hidden','disabled','readonly','disconnected','rejected']){
  test('R1.8 mobile-composer textarea safely falls back when '+state,async()=>{
    const f=await readyPage();
    try{
      const selections=mobileComposer(f,{accepted:state!=='rejected'}),before=f.editor.value;
      if(state==='hidden')f.editor.getBoundingClientRect=()=>({width:0,height:0});
      if(state==='css-hidden')f.win.getComputedStyle=()=>({visibility:'hidden'});
      if(state==='disabled')f.editor.disabled=true;
      if(state==='readonly')f.editor.readOnly=true;
      if(state==='disconnected')f.editor.isConnected=false;
      f.buttons()[0].emit('click',{isTrusted:true});await settle();
      assert.equal(f.editor.value,before,'failed or unavailable editor retains its draft');
      assert.equal(f.calls.length,state==='rejected'?1:0);
      if(state!=='rejected'){
        assert.equal(f.editor.focused,undefined);assert.deepEqual(selections,[]);
      }
      const feedback=f.panel('feedback');
      assert.equal(feedback.hidden,false);
      assert.match(feedback.textContent,/已复制，请粘贴/);
      assert.equal(feedback.dataset.kind,'success');
      assert.deepEqual(f.copied,[f.row.body]);
      assert.equal(feedback.focused,undefined,'copy feedback must not steal focus');
    }finally{f.controller.dispose();}
  });
}


test('R2 custom site exact two selectors, enabled lifecycle, ambiguous editor fail-closed',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const row=globalThis.OpenDeskPromptShortcutsModel.draft({body:'第一段\n\n中文🙂'},null,()=> 'site-prompt-1234');
  const library={schema:1,items:[row],settings:{webButtons:true}};
  const f=fixture({pkg,library});
  const url='https://example.org/compose';
  f.win.location.href=url;f.editor.tagName='textarea';f.editor.isContentEditable=false;
  f.editor.getBoundingClientRect=()=>({left:350,top:480,width:540,height:100});
  f.main.append(f.editor);
  f.editor.value='旧草稿';f.doc.querySelectorAll=s=>s==='main'?[f.main]:s==='textarea'?[f.editor]:[];
  f.doc.execCommand=(command,_show,value)=>{f.calls.push({command,value});f.editor.value+=value;return true;};
  const rule={origin:'https://example.org',pathScope:'/compose',containerSelector:'main',
    editorSelector:'textarea',enabled:true};
  f.values.set(PROMPT_DATA_STORE,{library,sites:{schema:1,rules:[rule]}});
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  try{
    await settle();assert.equal(f.buttons().length,1,'enabled exact site renders');
    f.buttons()[0].emit('click',{isTrusted:true});await settle();
    assert.equal(f.calls.length,1);assert.equal(f.editor.value,'旧草稿\n第一段\n\n中文🙂');
    const other=mockElement('textarea');
    f.doc.querySelectorAll=s=>s==='main'?[f.main]:s==='textarea'?[f.editor,other]:[];
    f.events.get('resize')?.();await settle();
    const host=f.root.children.find(x=>Object.hasOwn(x.attributes,'data-opendesk-prompts'));
    assert.equal(host.hidden,true,'ambiguous editor hides rail before a wrong-field write');
    f.change(PROMPT_DATA_STORE,{library,sites:{schema:1,rules:[{...rule,enabled:false}]}});
    await settle();assert.equal(f.buttons().length,0,'per-site disable tears down rail');
    f.win.location.href='https://example.org.other-site.test/compose';
    f.events.get('popstate')?.();await settle();assert.equal(f.buttons().length,0);
  }finally{controller.dispose();}
});
const multisiteInputs=[
  {name:'DeepSeek',url:'https://chat.deepseek.com/a/chat',containerSelector:'#root ._7780f2e',
    editorSelector:'textarea[placeholder="Message DeepSeek"]',richtext:false},
  {name:'Gemini',url:'https://gemini.google.com/app/mock',containerSelector:'chat-window',
    editorSelector:'rich-textarea div.ql-editor[contenteditable="true"]',richtext:true}
];

// Reuse the page fixture with saved rules and a bounded editing-command model.
// Exact selector lookup and Quill-shaped paragraphs do not run a CSS engine or Quill.
async function multisiteInputPage(site){
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const model=globalThis.OpenDeskPromptShortcutsModel;
  const row=model.draft({body:'第一段\n\n第二段🧑‍💻'},null,()=> 'multisite-prompt');
  const library={schema:1,items:[row],settings:{webButtons:true}};
  const rules=multisiteInputs.map(candidate=>model.siteRule({origin:new URL(candidate.url).origin,
    pathScope:'/',containerSelector:candidate.containerSelector,editorSelector:candidate.editorSelector,
    enabled:true}));
  const rule=rules.find(candidate=>candidate.origin===new URL(site.url).origin);
  const stored={library,sites:{schema:1,rules}};
  const f=fixture({pkg,library,grants:{}}),before='已有草稿🙂\n\n保留最后一行';
  f.values.set(PROMPT_DATA_STORE,stored);f.win.location.href=site.url;
  const caret={start:1,end:4},selections=[],dispatched=[],submissions=[];
  const writeDraft=text=>{
    if(!site.richtext){f.editor.value=text;return;}
    f.editor.children=text.split('\n').map(line=>({tagName:'P',innerText:line||'\n',textContent:line}));
    f.editor.textContent=f.editor.children.map(child=>child.textContent).join('');
  };
  const draft=()=>site.richtext?f.editor.children.map(child=>child.textContent).join('\n'):f.editor.value;
  f.editor.tagName=site.richtext?'DIV':'TEXTAREA';f.editor.isContentEditable=site.richtext;
  if(site.richtext){f.editor.className='ql-editor';f.editor.setAttribute('contenteditable','true');}
  else{f.editor.removeAttribute('contenteditable');f.editor.setAttribute('placeholder','Message DeepSeek');}
  f.editor.setSelectionRange=(start,end)=>{selections.push([start,end]);caret.start=start;caret.end=end;};
  const range={target:null,selectNodeContents(target){this.target=target;caret.start=0;caret.end=draft().length;},
    collapse(toStart){if(toStart)caret.end=caret.start;else caret.start=caret.end;}};
  let selectedRange=null;
  f.doc.createRange=()=>range;
  f.doc.getSelection=()=>({removeAllRanges(){selectedRange=null;},addRange(value){selectedRange=value;}});
  const form=mockElement('form'),send=mockElement('button');
  form.submit=()=>submissions.push('submit');form.requestSubmit=()=>submissions.push('requestSubmit');
  send.click=()=>submissions.push('send');f.editor.form=form;
  f.editor.dispatchEvent=f.doc.dispatchEvent=event=>{dispatched.push(event.type);return true;};
  f.doc.body.append(form);form.append(f.main,send);f.main.append(f.editor);writeDraft(before);
  f.doc.querySelectorAll=selector=>selector===site.containerSelector?[f.main]:
    selector===site.editorSelector?[f.editor]:selector==='form'?[form]:
    selector==='button[type="submit"]'?[send]:[];
  f.doc.querySelector=selector=>f.doc.querySelectorAll(selector)[0]||null;
  f.doc.execCommand=(command,_show,text)=>{
    f.calls.push({command,text});
    if(command!=='insertText'||f.doc.activeElement!==f.editor||
       (site.richtext&&(selectedRange!==range||range.target!==f.editor)))return false;
    const old=draft();writeDraft(old.slice(0,caret.start)+text+old.slice(caret.end));
    caret.start+=text.length;caret.end=caret.start;return true;
  };
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  const panel=name=>f.root.children.find(node=>Object.hasOwn(node.attributes,'data-opendesk-prompts'))
    ?.shadow.children.find(node=>node.className===name);
  return {...f,controller,row,stored,rule,before,caret,selections,draft,dispatched,submissions,panel};
}

function holdNextMultisiteRead(f){
  const get=f.api.storage.local.get;let held=false,resume=()=>{};
  f.api.storage.local.get=keys=>{
    const snapshot=get(keys);
    if(held)return snapshot;
    held=true;
    return new Promise((resolve,reject)=>{resume=()=>snapshot.then(resolve,reject);});
  };
  return {get held(){return held;},release(){return resume();}};
}

for(const site of multisiteInputs){
  test(`Multisite input: ${site.name} ${site.richtext?'Quill-shaped contenteditable':'textarea'} appends multiline draft with caret at end and never sends`,async()=>{
    const f=await multisiteInputPage(site);
    try{
      await settle();assert.equal(f.buttons().length,1,'saved custom rule renders without a second site grant');
      f.buttons()[0].emit('click',{isTrusted:true});await settle();
      const expected=f.before+'\n'+f.row.body;
      assert.deepEqual(f.calls,[{command:'insertText',text:'\n'+f.row.body}]);
      assert.equal(f.draft(),expected,'existing paragraphs, blank lines and emoji survive in order');
      assert.deepEqual(f.caret,{start:expected.length,end:expected.length},'middle selection is replaced by an end caret');
      if(site.richtext){
        assert.notEqual(f.editor.textContent,expected,'paragraph structure supplies the line breaks');
        assert.deepEqual(f.selections,[],'rich text uses a DOM Range');
      }else assert.deepEqual(f.selections,[[f.before.length,f.before.length]]);
      assert.equal(f.doc.activeElement,f.editor);
      assert.match(f.panel('announcer').textContent,/已插入草稿，未发送/);
      assert.equal(f.panel('feedback').hidden,true);
      assert.deepEqual(f.copied,[]);assert.deepEqual(f.dispatched,[]);assert.deepEqual(f.submissions,[]);
    }finally{f.controller.dispose();}
  });

  for(const action of ['disabled','removed']){
    test(`Multisite input: ${site.name} ${action} rule retires stale controls and pending authorization`,async()=>{
      const f=await multisiteInputPage(site);let pending;
      try{
        await settle();assert.equal(f.buttons().length,1);
        const stale=f.buttons()[0];pending=holdNextMultisiteRead(f);
        stale.emit('click',{isTrusted:true});assert.equal(pending.held,true);
        const rules=f.stored.sites.rules.flatMap(rule=>rule.origin!==f.rule.origin?[rule]:
          action==='removed'?[]:[{...rule,enabled:false}]);
        f.change(PROMPT_DATA_STORE,{...f.stored,sites:{schema:1,rules}});await settle();
        const expectedControls=action==='removed'&&globalThis.OpenDeskPromptShortcutsModel.builtinSite(f.win.location.href)?1:0;
        assert.equal(f.buttons().length,expectedControls,'deletion restores a built-in default; explicit disable does not');
        stale.emit('click',{isTrusted:true});await pending.release();await settle();
        assert.equal(f.buttons().length,expectedControls,'old authorization cannot change the resolved rule');
        assert.deepEqual(f.calls,[]);assert.equal(f.draft(),f.before);
        assert.deepEqual(f.caret,{start:1,end:4});assert.equal(f.editor.focused,undefined);
        assert.deepEqual(f.copied,[]);assert.deepEqual(f.dispatched,[]);assert.deepEqual(f.submissions,[]);
        f.change(PROMPT_DATA_STORE,f.stored);await settle();
        assert.equal(f.buttons().length,1,'restoring the saved rule creates fresh controls');
      }finally{f.controller.dispose();await pending?.release();}
    });
  }

  test(`Multisite input: ${site.name} pending authorization never writes after switching to the other configured origin`,async()=>{
    const f=await multisiteInputPage(site);let pending;
    try{
      await settle();assert.equal(f.buttons().length,1);
      pending=holdNextMultisiteRead(f);f.buttons()[0].emit('click',{isTrusted:true});
      assert.equal(pending.held,true);
      // Keep the old editable DOM and suppress popstate: URL identity alone must
      // block a delayed click, even when the destination also has a saved rule.
      f.win.location.href=multisiteInputs.find(candidate=>candidate!==site).url;
      await pending.release();await settle();
      assert.deepEqual(f.calls,[]);assert.equal(f.draft(),f.before);
      assert.deepEqual(f.caret,{start:1,end:4});assert.equal(f.editor.focused,undefined);
      assert.deepEqual(f.copied,[]);assert.deepEqual(f.dispatched,[]);assert.deepEqual(f.submissions,[]);
      f.events.get('popstate')?.();await settle();
      assert.equal(f.buttons().length,1,'the destination gets its own newly checked controls');
      assert.deepEqual(f.calls,[],'refresh never replays the previous click on the destination');
    }finally{f.controller.dispose();await pending?.release();}
  });
}

test('R2 picker uses extension-owned message, exact document, unique semantic selector, Esc',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const library={schema:1,items:[],settings:{webButtons:true}};
  const f=fixture({pkg,library});f.win.location.href='https://example.org/compose';
  f.editor.tagName='textarea';f.editor.attributes.id='composer';
  f.editor.getBoundingClientRect=()=>({left:350,top:480,width:540,height:100});
  f.main.append(f.editor);
  f.doc.querySelectorAll=s=>s==='textarea'||s==='#composer'?[f.editor]:s==='main'?[f.main]:[];
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  const send=(operation,extra={})=>new Promise(resolve=>{
    const fn=[...f.runtimeMessages][0];assert(fn,'trusted listener must exist');
    fn({protocol:'opendesk.prompt-shortcuts.picker.v1',toolId:PROMPT_ID,
      operation,expectedUrl:f.win.location.href,...extra},{
      id:'test-extension',url:'chrome-extension://test-extension/sidepanel.html'
    },resolve);
  });
  const session='01234567-89ab-cdef-0123-456789abcdef';
  try{
    await settle();
    const begin=await send('prompt.page.pick.start',{kind:'editor',session});
    assert.equal(begin.ok,true);assert.equal(begin.data.state,'selecting');
    const evt={isTrusted:true,target:f.editor,preventDefault(){},stopImmediatePropagation(){}};
    f.docEvents.get('click')?.(evt);
    const selected=await send('prompt.page.pick.status',{session});
    assert.equal(selected.ok,true);assert.equal(selected.data.state,'selected');
    assert.equal(selected.data.selector,'#composer');
    const checked=await send('prompt.page.check',{rule:{origin:'https://example.org',
      containerSelector:'main',editorSelector:'#composer',pathScope:'/compose'}});
    assert.equal(checked.ok,true);assert.equal(checked.data.valid,true);
    const deny=await new Promise(resolve=>[...f.runtimeMessages][0]({
      protocol:'opendesk.prompt-shortcuts.picker.v1',toolId:PROMPT_ID,
      operation:'prompt.page.pick.status',expectedUrl:f.win.location.href,session
    },{id:'bad',url:'https://evil.invalid/'},resolve));
    assert.equal(deny.ok,false,'other extensions cannot invoke picker');
  }finally{controller.dispose();}
});


test('R2.1 site picker suppresses pointerup/dblclick, keyboard submission and supports Esc',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const library={schema:1,items:[],settings:{webButtons:true}};
  const f=fixture({pkg,library});f.win.location.href='https://example.org/compose';
  f.editor.tagName='textarea';f.editor.attributes.id='composer';
  f.editor.getBoundingClientRect=()=>({left:350,top:480,width:540,height:100});
  f.doc.querySelectorAll=s=>s==='#composer'?[f.editor]:[];
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  const send=(operation,session,extra={})=>new Promise(resolve=>{
    [...f.runtimeMessages][0]({protocol:'opendesk.prompt-shortcuts.picker.v1',toolId:PROMPT_ID,
      operation,session,expectedUrl:f.win.location.href,...extra},
    {id:'test-extension',url:'chrome-extension://test-extension/sidepanel.html'},resolve);
  });
  const event=(type,key='')=>({type,key,isTrusted:true,target:f.editor,
    prevented:false,stopped:false,
    preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}});
  try{
    await settle();
    const session='11234567-89ab-cdef-0123-456789abcdef';
    assert.equal((await send('prompt.page.pick.start',session,{kind:'editor'})).data.state,'selecting');
    for(const type of ['pointerdown','mousedown','pointerup','mouseup','dblclick',
      'contextmenu','touchstart','touchend']){
      const e=event(type);assert(f.docEvents.has(type),type);
      f.docEvents.get(type)(e);assert(e.stopped,type+' must not reach site handlers');
      if(!type.startsWith('touch'))assert(e.prevented,type+' must cancel default');
    }
    for(const key of ['Enter',' ']){
      const e=event('keydown',key);f.docEvents.get('keydown')(e);
      assert(e.prevented&&e.stopped,'keyboard shortcuts must not submit while picking');
    }
    const click=event('click');f.docEvents.get('click')(click);
    assert(click.prevented&&click.stopped,'selection click itself is blocked');
    for(const type of ['pointerup','mouseup','click','dblclick']){
      const e=event(type);f.docEvents.get(type)?.(e);
      assert(e.prevented&&e.stopped,'late '+type+' must not reach selected control');
    }
    const result=await send('prompt.page.pick.status',session);
    assert.equal(result.data.state,'selected');assert.equal(result.data.selector,'#composer');
    const nextSession='21234567-89ab-cdef-0123-456789abcdef';
    assert.equal((await send('prompt.page.pick.start',nextSession,{kind:'editor'})).data.state,'selecting');
    const esc=event('keydown','Escape');f.docEvents.get('keydown')(esc);
    assert(esc.prevented&&esc.stopped);
    assert.equal((await send('prompt.page.pick.status',nextSession)).data.state,'cancelled');
    assert.equal(f.docEvents.has('pointerup'),false,'Esc releases all event guards');
  }finally{controller.dispose();}
});

for(const scenario of [
  {name:'multiline',body:'第一行\n\n第三行🧑‍💻',draft:'旧草稿',expected:'copy'},
  {name:'maxlength',body:'继续',draft:'旧草稿',maxLength:3,expected:'copy'},
  {name:'plain single-line',body:'继续',draft:'旧草稿',expected:'insert'}
]){
  test('R2.1 input '+scenario.name+' preflights before focus, preserving original text',async()=>{
    const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
    const row=globalThis.OpenDeskPromptShortcutsModel.draft({body:scenario.body},
      null,()=> 'input-12345678');
    const library={schema:1,items:[row],settings:{webButtons:true}};
    const f=fixture({pkg,library});f.win.location.href='https://example.org/compose';
    f.editor.tagName='input';f.editor.type='text';f.editor.isContentEditable=false;
    f.editor.value=scenario.draft;f.editor.maxLength=scenario.maxLength??-1;
    f.editor.getBoundingClientRect=()=>({left:350,top:480,width:540,height:40});
    f.main.append(f.editor);
    f.doc.querySelectorAll=s=>s==='main'?[f.main]:s==='input'?[f.editor]:[];
    f.doc.execCommand=(command,_show,value)=>{
      f.calls.push({command,value});f.editor.value+=value;return true;
    };
    f.values.set(PROMPT_DATA_STORE,{library,sites:{schema:1,rules:[{
      origin:'https://example.org',pathScope:'/compose',containerSelector:'main',
      editorSelector:'input',enabled:true
    }]}});
    const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
    try{
      await settle();assert.equal(f.buttons().length,1);
      f.buttons()[0].emit('click',{isTrusted:true});await settle();
      if(scenario.expected==='copy'){
        assert.equal(f.calls.length,0,'reject before native edit');
        assert.equal(f.editor.value,scenario.draft,'original draft unchanged');
        assert.equal(f.editor.focused,undefined,'no focus theft on known failure');
        assert.deepEqual(f.copied,[scenario.body],'full prompt is copied');
      }else{
        assert.equal(f.calls.length,1);
        assert.equal(f.calls[0].value,' '+scenario.body,'single-line delimiter is a space');
        assert.equal(f.editor.value,scenario.draft+' '+scenario.body);
        assert.deepEqual(f.copied,[]);
      }
    }finally{controller.dispose();}
  });
}


for(const value of ['true','plaintext-only']){
  test('R2.2 cross-site anonymous contenteditable='+value+' uses scoped semantic selector',async()=>{
    const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
    const f=fixture({pkg,library:{schema:1,items:[],settings:{webButtons:true}}});
    f.win.location.href='https://example.org/chat';
    // This fixture normally accelerates all timers to zero. A 65s picker
    // expiry must remain long enough for asynchronous status readback.
    f.win.setTimeout=(fn,ms)=>setTimeout(fn,ms>=65000?ms:0);
    f.editor.tagName='div';f.editor.isContentEditable=true;
    f.editor.getBoundingClientRect=()=>({left:350,top:480,width:540,height:100});
    f.editor.attributes.contenteditable=value;
    const wrapper=mockElement('section'),label=mockElement('div');
    wrapper.attributes.id='rich-container';wrapper.append(label,f.editor);
    f.editor.parentElement=wrapper;f.main.append(wrapper);
    const other=mockElement('div');other.isContentEditable=true;
    other.attributes.contenteditable=value;
    const semantic='[contenteditable="'+value+'"]',scoped='#rich-container div'+semantic;
    const queried=[];
    f.doc.querySelectorAll=selector=>{
      queried.push(selector);
      if(selector===semantic||selector==='div'+semantic)return [f.editor,other];
      if(selector==='div')return [f.editor,other,label];
      if(selector===scoped)return [f.editor];
      if(selector==='main')return [f.main];
      return [];
    };
    const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
    const send=(operation,extra={})=>new Promise(resolve=>{
      [...f.runtimeMessages][0]({protocol:'opendesk.prompt-shortcuts.picker.v1',
        toolId:PROMPT_ID,operation,expectedUrl:f.win.location.href,...extra},
      {id:'test-extension',url:'chrome-extension://test-extension/sidepanel.html'},resolve);
    });
    const session='31234567-89ab-cdef-0123-456789abcdef';
    try{
      await settle();
      assert.equal((await send('prompt.page.pick.start',{session,kind:'editor'})).data.state,'selecting');
      f.docEvents.get('click')({isTrusted:true,target:f.editor,
        preventDefault(){},stopImmediatePropagation(){}});
      const selection=await send('prompt.page.pick.status',{session});
      assert.equal(selection.ok,true);
      assert.equal(selection.data.state,'selected',JSON.stringify({selection,
        editorKind:{tag:f.editor.tagName,editable:f.editor.isContentEditable,
          attribute:f.editor.getAttribute('contenteditable'),connected:f.editor.isConnected},
        queried,labels:f.root.children.map(x=>String(x.textContent||'').slice(0,140))}));
      assert.equal(selection.data.selector,scoped,'scoped editable selector is unique');
      assert.equal(selection.data.editorType,'richtext');
      const checked=await send('prompt.page.check',{rule:{
        origin:'https://example.org',pathScope:'/chat',
        containerSelector:'main',editorSelector:scoped,enabled:true
      }});
      assert.equal(checked.ok,true);
      assert.equal(checked.data.valid,true);
      assert.equal(checked.data.editorType,'richtext');
    }finally{controller.dispose();}
  });
}

test('R2.3 rejects disjoint website selector and hides stale custom rail',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const row=globalThis.OpenDeskPromptShortcutsModel.draft({body:'安全正文🙂'},
    null,()=> 'scope-12345678');
  const library={schema:1,items:[row],settings:{webButtons:true}};
  const f=fixture({pkg,library});f.win.location.href='https://example.org/compose';
  f.editor.tagName='textarea';f.editor.isContentEditable=false;f.editor.value='原草稿';
  f.main.append(f.editor);
  const outsider=mockElement('textarea');
  let selected=f.editor;
  f.doc.querySelectorAll=s=>s==='main'?[f.main]:s==='textarea'?[selected]:[];
  const rule={origin:'https://example.org',pathScope:'/compose',
    containerSelector:'main',editorSelector:'textarea',enabled:true};
  f.values.set(PROMPT_DATA_STORE,{library,sites:{schema:1,rules:[rule]}});
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  const send=(operation,extra={})=>new Promise(resolve=>
    [...f.runtimeMessages][0]({protocol:'opendesk.prompt-shortcuts.picker.v1',
      toolId:PROMPT_ID,expectedUrl:f.win.location.href,operation,...extra},
    {id:'test-extension',url:'chrome-extension://test-extension/sidepanel.html'},resolve));
  try{
    await settle();
    assert.equal(f.buttons().length,1,'valid same-region rule renders buttons');
    selected=outsider;
    const rejected=await send('prompt.page.check',{rule});
    assert.equal(rejected.ok,false,'disjoint editor must fail configuration test');
    assert.match(rejected.error,/按钮容器必须包含目标输入框/);
    f.events.get('resize')?.();await settle();
    const host=f.root.children.find(x=>Object.hasOwn(x.attributes,'data-opendesk-prompts'));
    assert.equal(host.hidden,true,'SPA retarget outside selected container hides rail');
    assert.equal(outsider.value,'','foreign editor untouched');
  }finally{controller.dispose();}
});

test('R2.3 refuses native edit when site steals focus during editor focus()',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const row=globalThis.OpenDeskPromptShortcutsModel.draft({body:'完整提示词🙂'},
    null,()=> 'focus-12345678');
  const library={schema:1,items:[row],settings:{webButtons:true}};
  const f=fixture({pkg,library});f.win.location.href='https://example.org/compose';
  f.editor.tagName='textarea';f.editor.isContentEditable=false;f.editor.value='原草稿';
  f.main.append(f.editor);
  f.doc.querySelectorAll=s=>s==='main'?[f.main]:s==='textarea'?[f.editor]:[];
  const rule={origin:'https://example.org',pathScope:'/compose',
    containerSelector:'main',editorSelector:'textarea',enabled:true};
  f.values.set(PROMPT_DATA_STORE,{library,sites:{schema:1,rules:[rule]}});
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  try{
    await settle();assert.equal(f.buttons().length,1);
    // The page's focus handler synchronously diverts attention to another node.
    f.editor.focus=()=>{f.doc.activeElement=f.main;};
    f.buttons()[0].emit('click',{isTrusted:true});await settle();
    assert.equal(f.calls.length,0,'execCommand must not target a different field');
    assert.equal(f.editor.value,'原草稿','old draft preserved');
    assert.deepEqual(f.copied,[row.body],'copy fallback retains full body');
  }finally{controller.dispose();}
});


test('R2.7 transient fallback toast expires and old callback cannot hide a newer toast',async()=>{
  const f=await readyPage();
  try{
    f.doc.execCommand=()=>false;
    f.buttons()[0].emit('click',{isTrusted:true});await settle();
    const first=f.toastTimers.values().next().value;
    assert.equal(first?.ms,3000);
    assert.equal(f.panel('feedback').hidden,false);
    const second={...f.row,id:'prompt-second-r27',body:'替代的提示词',order:1};
    f.change(PROMPT_DATA_STORE,{library:{schema:1,items:[f.row,second],settings:{webButtons:true}}});
    await settle();
    assert.equal(f.toastTimers.size,0,'storage remount cancels old timeout');
    f.buttons()[1].emit('click',{isTrusted:true});await settle();
    assert.equal(f.panel('feedback').hidden,false);
    first.fn(); // the already-cancelled callback is not allowed to clear the new toast
    assert.equal(f.panel('feedback').hidden,false);
    f.fireToast();
    assert.equal(f.panel('feedback').hidden,true);
    assert.equal(f.panel('feedback').textContent,'');
    assert.equal(f.panel('announcer').textContent,'');
  }finally{f.controller.dispose();}
  assert.equal(f.toastTimers.size,0,'disposal clears remaining timeout handles');
});

test('R2.7 failed clipboard toast is bounded to five seconds and cleaned on disable',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const model=globalThis.OpenDeskPromptShortcutsModel;
  const row=model.draft({body:'未能复制的提示词'},null,()=> 'prompt-r27-failure');
  const f=fixture({pkg,grants:{},noEditor:true,rejectCopy:true,
    library:{schema:1,items:[row],settings:{webButtons:true}}});
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  try{
    await settle();f.buttons()[0].emit('click',{isTrusted:true});await settle();
    const toast=f.root.children.find(x=>x.attributes['data-opendesk-prompts']!==undefined)
      .shadow.children.find(x=>x.className==='feedback');
    assert.equal(toast.hidden,false);assert.equal(toast.dataset.kind,'error');
    assert.equal(f.toastTimers.values().next().value?.ms,5000);
    assert.equal(toast.children.at(-1)?.getAttribute('aria-label'),'关闭提示');
    toast.children.at(-1).emit('click');assert.equal(toast.hidden,true);
    assert.equal(f.toastTimers.size,0,'user close cancels error timer');
    // The trusted adapter intentionally blocks same-prompt double clicks for 700ms.
    await new Promise(resolve=>setTimeout(resolve,760));
    f.buttons()[0].emit('click',{isTrusted:true});await settle();
    assert.equal(toast.hidden,false,'new failure can appear after double-click guard expires');
    f.change(SIDEBAR_TOOL_ENABLE_STORE,{[PROMPT_ID]:false});await settle();
    assert.equal(toast.hidden,true);
    assert.equal(toast.textContent,'');
    assert.equal(f.toastTimers.size,0);
  }finally{controller.dispose();}
});

test('R2.7 storage-confirmed create/edit/reorder/delete/import and enable changes update an open tab immediately',async()=>{
  const f=await readyPage(),first=f.row;
  try{
    const model=globalThis.OpenDeskPromptShortcutsModel;
    const second={...model.draft({body:'新创建的🧑‍💻按钮',label:'新增'},null,()=> 'prompt-r27-created'),order:1};
    const update=items=>f.change(PROMPT_DATA_STORE,{
      library:{schema:1,settings:{webButtons:true},items}
    });
    assert.equal(f.buttons().length,1);
    update([first,second]);await settle();
    assert.equal(f.buttons().length,2,'confirmed create/import immediately appears');
    assert.equal(f.buttons()[1].title,second.name);
    const edited={...second,body:'更改后的正文',label:'更改',name:'自定义新名称',
      labelAuto:false,nameAuto:false};
    update([first,edited]);await settle();
    assert.equal(f.buttons().length,2);
    assert.equal(f.buttons()[1].title,'自定义新名称','confirmed edit updates the mounted label');
    update([{...edited,order:0},{...first,order:1}]);await settle();
    assert.equal(f.buttons()[0].title,'自定义新名称','confirmed reorder updates DOM order');
    update([{...edited,order:0,enabled:false},{...first,order:1}]);await settle();
    assert.equal(f.buttons().length,1,'confirmed disable hides only that shortcut');
    update([{...first,order:0}]);await settle();
    assert.equal(f.buttons().length,1,'confirmed delete removes without page reload');
    f.change(PROMPT_DATA_STORE,{library:{schema:1,items:[first],
      settings:{webButtons:false}}});await settle();
    assert.equal(f.buttons().length,0,'global web disable removes rail');
    update([first,second]);await settle();
    assert.equal(f.buttons().length,2,'global re-enable remounts exactly once');
    assert.equal(f.siteEvents.size,1,'no duplicate storage listener across remounts');
    assert.equal(f.runtimeMessages.size,2,'one picker and one analytics scope handler');
  }finally{f.controller.dispose();}
  assert.equal(f.siteEvents.size,0);
});


// R2.8: Regressions for ChatGPT history navigation and React remounts.
// These use the production controller and a simulated DOM/storage, not an
// installed extension or a real chatgpt.com session.
test('R2.8 history conversation navigation restores one dock on the new composer',async()=>{
  const f=await readyPage();
  try{
    const oldHost=f.host(),oldDraft=f.editor.textContent;
    const nextMain=mockElement('main'),nextEditor=mockElement('DIV');
    nextMain.getBoundingClientRect=()=>regionRect(420,60,700,700);
    nextEditor.isContentEditable=true;nextEditor.setAttribute('contenteditable','true');
    nextEditor.textContent='新会话草稿';
    nextEditor.getBoundingClientRect=()=>regionRect(500,570,550,70);
    nextEditor.closest=selector=>selector==='main'?nextMain:null;
    nextEditor.parentElement=nextMain;
    nextEditor.focus=()=>{f.doc.activeElement=nextEditor;};
    f.doc.querySelectorAll=selector=>selector==='main'?[nextMain]:
      selector.startsWith('main ')?[nextEditor]:[];
    f.doc.querySelector=selector=>selector==='main'||selector==='main#main'?nextMain:null;
    f.doc.execCommand=(command,_show,value)=>{
      f.calls.push({command,value});nextEditor.textContent+=value;return true;
    };
    f.win.location.href=CHATGPT_ORIGIN+'/c/history-conversation';
    oldHost.remove(); // Site DOM rewrite removed the extension-owned node.
    f.mutate([{target:f.doc.body}]);
    await settle();
    assert.equal(f.host(),oldHost,'reuse the original host/shadow, do not duplicate');
    assert.equal(f.host().hidden,false,'dock visible in new conversation');
    assert.equal(f.host().style.left,'428px','re-anchor 8px inside the new conversation');
    assert.equal(f.buttons().length,1,'exactly one shortcut after navigation');
    assert.equal(f.siteEvents.size,1,'single storage listener');
    f.buttons()[0].emit('click',{isTrusted:true});await settle();
    assert.equal(nextEditor.textContent,'新会话草稿\n'+f.row.body);
    assert.equal(f.editor.textContent,oldDraft,'previous composer untouched');
    assert.equal(f.calls.length,1,'one native insertion, no automatic send');
    assert.deepEqual(f.copied,[],'no fallback copy on confirmed insertion');
  }finally{f.controller.dispose();}
});

test('R2.8 recover same-URL host detach, including a replaced html root',async()=>{
  const f=await readyPage();
  try{
    const host=f.host(),newRoot=mockElement('html'),newBody=mockElement('body');
    const dockObserver=f.mutationObservers.at(-1);
    newRoot.append(newBody);
    host.remove();
    f.doc.documentElement=newRoot;f.doc.body=newBody;
    f.intervals[0](); // Bounded fallback covers a replaced observed document root.
    await settle();
    const hosts=newRoot.children.filter(node=>node.attributes['data-opendesk-prompts']!==undefined);
    assert.deepEqual(hosts,[host],'re-attach existing host only once');
    assert.equal(host.hidden,false);
    assert.equal(dockObserver.target,newRoot,'reuse the dock observer on the current root');
    assert.equal(f.mutationObservers.filter(observer=>observer.target).length,2,
      'only the dock and the current jump session observe the new root');
    f.intervals[0]();await settle();
    assert.equal(newRoot.children.filter(node=>node===host).length,1,'periodic checks are idempotent');
  }finally{f.controller.dispose();}
});

test('R2.8 composer temporarily absent and CSS-hidden old main cannot strand the dock',async()=>{
  const f=await readyPage();
  try{
    const oldMain=f.main,newMain=mockElement('main');
    const originalQuery=f.doc.querySelector,originalQueryAll=f.doc.querySelectorAll;
    newMain.getBoundingClientRect=()=>regionRect(530,65,700,620);
    f.doc.querySelectorAll=selector=>selector==='main'?[oldMain,newMain]:originalQueryAll(selector);
    f.doc.querySelector=selector=>selector==='main'||selector==='main#main'?oldMain:originalQuery(selector);
    f.win.getComputedStyle=node=>({display:'block',visibility:node===oldMain?'hidden':'visible',opacity:'1'});
    f.editor.getBoundingClientRect=()=>regionRect(610,480,540,100);
    f.events.get('resize')();await settle();
    assert.equal(f.host().hidden,false);
    assert.equal(f.host().style.left,'538px','ignore the CSS-hidden previous main');
    f.doc.querySelectorAll=()=>[];
    f.doc.querySelector=()=>null;
    f.mutate([{target:f.doc.body}]);await settle();
    assert.equal(f.host().hidden,true,'hide only while no live area exists');
    f.doc.querySelectorAll=selector=>selector==='main'?[newMain]:originalQueryAll(selector);
    f.doc.querySelector=selector=>selector==='main'||selector==='main#main'?newMain:originalQuery(selector);
    f.mutate([{target:f.doc.body}]);await settle();
    assert.equal(f.host().hidden,false,'restore automatically without a reload');
    assert.equal(f.host().style.left,'538px');
  }finally{f.controller.dispose();}
});

test('R2.8 a same-URL editor replacement during permission read never modifies the new draft',async()=>{
  const f=await readyPage();
  try{
    const nativeGet=f.api.storage.local.get;
    let release;
    f.api.storage.local.get=()=>new Promise(resolve=>{release=resolve;});
    f.buttons()[0].emit('click',{isTrusted:true});
    assert.equal(typeof release,'function');
    const replacement=mockElement('DIV');
    replacement.isContentEditable=true;replacement.setAttribute('contenteditable','true');
    replacement.textContent='不要修改这个草稿';
    f.doc.querySelectorAll=selector=>selector==='main'?[f.main]:
      selector.startsWith('main ')?[replacement]:[];
    release(await nativeGet(KEYS_FOR_PENDING_READ));
    await settle();
    assert.equal(f.calls.length,0,'must not write to replaced composer');
    assert.equal(replacement.textContent,'不要修改这个草稿');
    assert.deepEqual(f.copied,[],'stale click must not change clipboard');
    assert.match(f.panel('feedback').textContent,/输入框已切换/);
  }finally{f.controller.dispose();}
});

test('R2.8 temporary storage read failure recovers; disable still blocks revival',async()=>{
  const f=await readyPage();
  try{
    const oldGet=f.api.storage.local.get;let reads=0;
    f.api.storage.local.get=async keys=>{
      reads++;if(reads===1)throw Error('transient storage failure');
      return oldGet(keys);
    };
    f.win.location.href=CHATGPT_ORIGIN+'/c/another-history-conversation';
    f.events.get('popstate')();await settle();
    assert(reads>=2,'bounded retry reads storage again after transient failure');
    assert.equal(f.buttons().length,1,'recovers without manual refresh');
    assert.equal(f.host().hidden,false);
    f.change(SIDEBAR_TOOL_ENABLE_STORE,{[PROMPT_ID]:false});await settle();
    assert.equal(f.buttons().length,0);
    f.intervals[0]();await settle();
    assert.equal(f.buttons().length,0,'disabled extension never resurrects buttons');
  }finally{f.controller.dispose();}
});

test('R2.8 long history scrolling keeps the shortcuts in the visible conversation slice',async()=>{
  const f=await readyPage();
  try{
    f.main.getBoundingClientRect=()=>regionRect(260,-2000,900,5000);
    f.events.get('scroll')();await settle();
    assert.equal(f.host().style.top,'384px','center the visible viewport, not a far-away document midpoint');
  }finally{f.controller.dispose();}
});

test('R2.15 B rail keeps its OD entry with zero prompts, caps at four, respects theme',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const model=globalThis.OpenDeskPromptShortcutsModel;
  const make=i=>model.draft({label:'提'+i,body:'正文'+i},null,()=> 'prompt-r215-'+i);
  const f=fixture({pkg,library:{schema:1,items:[],settings:{webButtons:true}}});
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  try{
    await settle();
    const rail=f.rail();
    assert(rail,'empty ChatGPT library must preserve OD entry');
    assert.equal(f.buttons().length,0);
    assert.equal(rail.children.length,1);
    assert.equal(rail.children[0].className,'brand');
    assert.equal(rail.children[0].textContent,'OD');
    assert.equal(rail.children[0].getAttribute('aria-label'),'打开提示词快捷按钮');
    f.change(PROMPT_DATA_STORE,{library:{schema:1,
      items:[1,2,3,4,5].map(make),settings:{webButtons:true}}});
    await settle();
    assert.equal(f.buttons().length,4,'only four independently clickable prompts');
    assert.equal(f.rail().children.length,5,'one OD, never a duplicated brand');
    f.doc.documentElement.setAttribute('data-theme','dark');
    f.events.get('resize')();await settle();
    const host=f.root.children.find(node=>node.attributes['data-opendesk-prompts']!==undefined);
    assert.equal(host.classList.contains('dark'),true,'theme follows actual page root');
    f.change(SIDEBAR_TOOL_ENABLE_STORE,{[PROMPT_ID]:false});await settle();
    assert.equal(f.rail(),undefined,'explicit revocation removes OD and all prompts');
  }finally{controller.dispose();}
});

test('R2.15 OD click uses one genuine gesture and never triggers draft insert',async()=>{
  const f=await readyPage();
  try{
    const brand=f.rail().children[0];let invoked=0,captured;
    f.api.runtime.sendMessage=message=>{invoked++;captured=message;return Promise.resolve({ok:true,data:{opened:true}});};
    brand.emit('click',{isTrusted:false});await settle();
    assert.equal(invoked,0,'synthetic page click is not eligible');
    brand.emit('click',{isTrusted:true});
    assert.equal(invoked,1,'dispatch occurs synchronously on trusted click');
    assert.equal(captured.protocol,'opendesk.prompt-shortcuts.rail-open.v1');
    assert.equal(captured.expectedUrl,f.win.location.href);
    await settle();
    assert.equal(f.calls.length,0,'opening the panel must not affect ChatGPT draft');
    assert.equal(f.panel('feedback').hidden,true,'successful open requires no extra Toast');
  }finally{f.controller.dispose();}
});

test('R2.15 390px fallback aligns above composer, never overlays the input',async()=>{
  const f=await readyPage();
  try{
    f.win.innerWidth=390;f.win.innerHeight=844;
    f.main.getBoundingClientRect=()=>regionRect(0,0,390,844);
    f.editor.getBoundingClientRect=()=>regionRect(24,700,342,75);
    f.events.get('resize')();await settle();
    assert.equal(f.rail().classList.contains('horizontal'),true);
    assert.equal(f.host().style.left,'24px');
    assert.equal(f.host().style.top,'630px');
    assert.equal(f.host().style.transform,'none');
    assert.equal(f.host().hidden,false);
    f.editor.getBoundingClientRect=()=>regionRect(24,42,342,75);
    f.events.get('resize')();await settle();
    assert.equal(f.host().hidden,true,'insufficient vertical space hides instead of obstructing editor');
  }finally{f.controller.dispose();}
});

test('R2.16 light-dark sites track system theme changes and release the media listener',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const f=fixture({pkg,library:{schema:1,items:[],settings:{webButtons:true}}});
  const listeners=new Set();let dark=false,scheme='light dark';
  f.win.matchMedia=()=>({get matches(){return dark;},
    addEventListener:(event,fn)=>{assert.equal(event,'change');listeners.add(fn);},
    removeEventListener:(event,fn)=>{assert.equal(event,'change');listeners.delete(fn);}});
  f.win.getComputedStyle=()=>({colorScheme:scheme});
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  const host=()=>f.root.children.find(node=>node.attributes['data-opendesk-prompts']!==undefined);
  const change=async()=>{for(const fn of listeners)fn();await settle();};
  try{
    await settle();assert.equal(listeners.size,1);
    assert.equal(host().classList.contains('dark'),false);
    dark=true;await change();assert.equal(host().classList.contains('dark'),true);
    dark=false;await change();assert.equal(host().classList.contains('dark'),false);
    dark=true;scheme='light';await change();
    assert.equal(host().classList.contains('dark'),false,'explicit light scheme overrides system dark');
    dark=false;scheme='dark';await change();
    assert.equal(host().classList.contains('dark'),true,'explicit dark scheme overrides system light');
  }finally{controller.dispose();}
  assert.equal(listeners.size,0,'dispose releases the theme listener');
});

// Scope probes use the real fixed adapter/policy; editor and picker are irrelevant.
const scopeWorker=()=>({id:'test-extension',url:'chrome-extension://test-extension/background.js'});
const scopeMessage=url=>({protocol:ANALYTICS_PROTOCOL,kind:ANALYTICS_PAGE_SCOPE_CHECK,expectedUrl:url});
function pageScope(f,message=scopeMessage(f.win.location.href),sender=scopeWorker()){
  return new Promise(resolve=>{
    let accepted=false,responded=false;
    for(const fn of [...f.runtimeMessages]){
      if(fn(message,sender,value=>{responded=true;resolve(value);})===true)accepted=true;
    }
    if(!accepted&&!responded)resolve(undefined);
  });
}
async function scopePage(t,{url=CHATGPT_ORIGIN+'/c/private',sites}={}){
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const library={schema:1,items:[],settings:{webButtons:false}};
  const f=fixture({pkg,library,noEditor:true});f.win.location.href=url;
  if(sites)f.values.set(PROMPT_DATA_STORE,{library,sites});
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  t.after(()=>controller.dispose());await settle();
  return {...f,controller};
}
const scopeDeferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

test('analytics scope accepts only the real SW URL or explicit own origin when URL is omitted',async t=>{
  const f=await scopePage(t);
  assert.equal(await pageScope(f),true,'missing editor/webButtons do not suppress failure telemetry');
  for(const bad of [
    {...scopeWorker(),id:'other-extension'},
    {...scopeWorker(),tab:{id:2}},{...scopeWorker(),documentId:'other-document'},
    {...scopeWorker(),url:'chrome-extension://test-extension/sidepanel.html'},
    {...scopeWorker(),url:scopeWorker().url+'?worker=1'},
    {...scopeWorker(),url:scopeWorker().url+'#worker'},
    {...scopeWorker(),url:'chrome-extension://other-extension/background.js'},
    {...scopeWorker(),url:'https://test-extension/background.js'},
    {...scopeWorker(),origin:'https://evil.test'},
    {id:'test-extension'}, {id:'test-extension',origin:'null'},
    {id:'test-extension',origin:'chrome-extension://other-extension'},
    {id:'test-extension',url:null,origin:'chrome-extension://test-extension'}
  ])assert.equal(await pageScope(f,undefined,bad),false,JSON.stringify(bad));
  assert.equal(await pageScope(f,undefined,{id:'test-extension',origin:'chrome-extension://test-extension'}),true);
  assert.equal(await pageScope(f,{...scopeMessage(f.win.location.href),body:'private text'}),false);
  assert.equal(await pageScope(f,scopeMessage(f.win.location.href+'/changed')),false);
  f.api.runtime.getManifest=()=>({background:{service_worker:'workers/sw.js'}});
  assert.equal(await pageScope(f),false,'old worker path cannot authorize');
  assert.equal(await pageScope(f,undefined,{id:'test-extension',url:f.api.runtime.getURL('workers/sw.js')}),true);
  delete f.api.runtime.getManifest;
  assert.equal(await pageScope(f),false,'missing manifest fails closed');
});

test('analytics scope reuses exact custom/builtin rules, disabled and removed installations',async t=>{
  const url='https://example.org/compose/private?draft=secret#body';
  const rule={origin:'https://example.org',pathScope:'/compose',containerSelector:'main',editorSelector:'textarea',enabled:true};
  const f=await scopePage(t,{url,sites:{schema:1,rules:[rule]}});
  assert.equal(await pageScope(f),true);
  f.change(PROMPT_DATA_STORE,{sites:{schema:1,rules:[{...rule,enabled:false}]}});await settle();
  assert.equal(await pageScope(f),false);
  f.change(PROMPT_DATA_STORE,{sites:{schema:1,rules:[rule]}});await settle();
  f.win.location.href='https://example.org/unrelated';
  assert.equal(await pageScope(f),false);
  f.win.location.href='https://example.org.evil.test/compose';
  assert.equal(await pageScope(f),false);
  for(const [key,value] of [[SIDEBAR_TOOL_ENABLE_STORE,{[PROMPT_ID]:false}],[SIDEBAR_TOOL_STORE,[]]]){
    f.win.location.href=url;f.change(key,value);await settle();
    assert.equal(await pageScope(f),false);
  }
  const builtin=await scopePage(t,{url:'https://gemini.google.com/app/private'});
  assert.equal(await pageScope(builtin),true);
  builtin.change(PROMPT_DATA_STORE,{sites:{schema:1,rules:[{
    origin:'https://gemini.google.com',pathScope:'/app',containerSelector:'main',editorSelector:'textarea',enabled:false
  }]}});await settle();
  assert.equal(await pageScope(builtin),false,'disabled custom override also blocks builtin fallback');
});

for(const race of ['navigation','paused','dispose','runtime-invalidated','disable','uninstall','epoch']){
  test('analytics scope rejects stale in-flight page state: '+race,async t=>{
    const f=await scopePage(t),entered=scopeDeferred(),release=scopeDeferred();
    const read=f.api.storage.local.get;
    let first=true;
    f.api.storage.local.get=async keys=>{
      const values=await read(keys);
      if(first){first=false;entered.resolve();await release.promise;}
      return values;
    };
    const pending=pageScope(f);await entered.promise;
    if(race==='navigation')f.win.location.href+='/next';
    if(race==='paused')f.events.get('pagehide')({persisted:true});
    if(race==='dispose')f.controller.dispose();
    if(race==='runtime-invalidated')f.api.runtime.id='replacement-extension';
    if(race==='disable')f.change(SIDEBAR_TOOL_ENABLE_STORE,{[PROMPT_ID]:false});
    if(race==='uninstall')f.change(SIDEBAR_TOOL_STORE,[]);
    if(race==='epoch')f.change(TOOL_REVOCATION_EPOCHS_STORE,{[PROMPT_ID]:'replacement-install'});
    release.resolve();assert.equal(await pending,false);
    if(race==='paused')assert.equal(await pageScope(f),false);
    if(race==='dispose'||race==='runtime-invalidated')assert.equal(f.runtimeMessages.size,0);
  });
}

test('analytics scope fails closed on storage error and leaves picker listener lifecycle intact',async t=>{
  const f=await scopePage(t);
  f.api.storage.local.get=async()=>{throw Error('unavailable');};
  assert.equal(await pageScope(f),false);
  assert.equal(f.runtimeMessages.size,2);
  f.controller.dispose();assert.equal(f.runtimeMessages.size,0);
  assert.equal(await pageScope(f),undefined,'disposed adapter cannot answer later probes');
});

test('Host probes real custom-site adapter for failures and fallback, then blocks disabled scope without leaking content',async t=>{
  const url='https://example.org/compose/private?draft=secret#body';
  const f=await scopePage(t,{url,sites:{schema:1,rules:[{
    origin:'https://example.org',pathScope:'/compose',containerSelector:'main',editorSelector:'textarea',enabled:true
  }]}});
  const listeners=[],wire=[],probes=[];
  f.api.storage.local.set=async data=>{for(const [key,value] of Object.entries(data))f.values.set(key,structuredClone(value));};
  const api={...f.api,runtime:{...f.api.runtime,onMessage:{addListener:fn=>listeners.push(fn)}},
    tabs:{async sendMessage(tabId,message,target){
      assert.equal(tabId,29);assert.deepEqual(target,{frameId:0,documentId:'custom-document'});
      assert.deepEqual(message,scopeMessage(f.win.location.href));probes.push(message);
      return pageScope(f,message,scopeWorker());
    },async get(tabId){
      assert.equal(tabId,29);
      return {id:29,url:f.win.location.href,incognito:false};
    }},webNavigation:{async getFrame(target){
      assert.deepEqual(target,{tabId:29,frameId:0});
      return {documentId:'custom-document',url:f.win.location.href,
        documentLifecycle:'active',errorOccurred:false};
    }}};
  const collector=installAnalyticsHost({api,endpoint:'https://receiver.example/v1/events',fetcher:async(_url,options)=>{
    const batch=JSON.parse(options.body);wire.push(batch);
    return {ok:true,json:async()=>({ok:true,accepted:batch.events.map(row=>row.eventId),duplicates:[]})};
  }});
  await collector.setConsent(true);
  const source={id:api.runtime.id,url,frameId:0,documentId:'custom-document',tab:{id:29,url,incognito:false}};
  const report=(event,channel,reason)=>new Promise(resolve=>listeners[0]({
    protocol:ANALYTICS_PROTOCOL,kind:'event.page_report',toolId:PROMPT_ID,event,channel,...(reason?{reason}:{})
  },source,resolve));
  assert.equal((await report('prompt.failed','page_button','editor_unavailable')).data.recorded,true);
  assert.equal((await report('prompt.fallback_copied','fallback')).data.recorded,true);
  assert.equal(probes.length,3,'failure probes once, success probes separately for engagement');
  assert.deepEqual(f.values.get(ANALYTICS_STATE_KEY).queue.map(row=>row.event),[
    'app.inventory','prompt.failed','prompt.fallback_copied','tool.engaged']);
  assert.equal((await collector.flush()).sent,4);
  assert(!JSON.stringify(wire).includes(url));assert(!JSON.stringify(wire).includes('secret'));
  f.change(SIDEBAR_TOOL_ENABLE_STORE,{[PROMPT_ID]:false});await settle();
  assert.equal((await report('prompt.failed','page_button','site_denied')).data.recorded,false);
  assert.deepEqual(f.values.get(ANALYTICS_STATE_KEY).queue.map(row=>row.event),['tool.disabled'],
    'disable lifecycle telemetry remains, but no page action crosses the revoked scope');
});
