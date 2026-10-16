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
  const api={runtime:{id:'test-extension',getURL:()=> 'chrome-extension://test-extension/',
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
  return {api,doc,win,values,change,calls,copied,buttons,rail,root,main,editor,events,siteEvents,docEvents,runtimeMessages};
}
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
    f.rail().children[0].focus();tip.emit('focusout');await settle();
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
    f.win.innerHeight=320;f.events.get('resize')();await settle();
    assert.equal(tip.style.top,'88px');
    assert.equal(tip.style.left,'auto');assert.equal(tip.style.right,'55px');
    assert.equal(tip.children[1],content,'layout retains the original tooltip content');
    assert.equal(content.textContent,f.row.body);
    f.main.getBoundingClientRect=()=>({left:260,top:80,width:540,height:640});
    f.events.get('resize')();await settle();
    assert.equal(tip.hidden,true,'folded rail cannot retain a tooltip for a hidden owner');
    assert.equal(button.getAttribute('aria-describedby'),undefined);
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
    assert.match(feedback.textContent,/已复制完整提示词/);
    assert.equal(feedback.dataset.kind,'success');
    assert.equal(feedback.getAttribute('role'),'status');
    assert.equal(feedback.getAttribute('aria-live'),'polite');
    assert.equal(feedback.focused,undefined);
    assert.equal(f.host().shadow.activeElement,undefined,'copy feedback must not steal editor focus');
  }finally{f.controller.dispose();}
});

function regionRect(left,top,width,height){return {left,top,width,height,right:left+width,bottom:top+height};}

test('R1.8 full-width ChatGPT main trims expanded semantic navigation and restores collapsed region',async()=>{
  const f=await readyPage();
  try{
    const aside=mockElement('aside'),nav=mockElement('nav');
    let expanded=true;
    f.main.getBoundingClientRect=()=>regionRect(0,0,1263,843);
    aside.getBoundingClientRect=()=>regionRect(expanded?0:-260,0,260,843);
    nav.getBoundingClientRect=()=>regionRect(expanded?0:-260,96,260,582);
    f.main.querySelectorAll=selector=>{
      assert.equal(selector,'aside, nav, [role="navigation"]');return [aside,nav];
    };
    f.win.innerWidth=1263;f.win.innerHeight=843;
    f.events.get('resize')();await settle();
    assert.equal(f.host().style.left,'272px','rail starts inside chat, beyond the real expanded sidebar');
    assert.equal(f.host().style.top,'422px','only the horizontal region changes');
    expanded=false;f.events.get('resize')();await settle();
    assert.equal(f.host().style.left,'12px','fully offscreen collapsed navigation reserves no space');
    expanded=true;aside.hidden=true;nav.hidden=true;
    f.events.get('resize')();await settle();
    assert.equal(f.host().style.left,'12px','hidden semantic navigation reserves no space');
    aside.hidden=false;nav.hidden=false;
    f.win.getComputedStyle=()=>({visibility:'hidden'});
    f.events.get('resize')();await settle();
    assert.equal(f.host().style.left,'12px','CSS-hidden navigation is ignored');
  }finally{f.controller.dispose();}
});

test('R1.8 region ignores unrelated floating asides and preserves main already right of navigation',async()=>{
  const f=await readyPage();
  try{
    const candidates=[regionRect(300,0,180,843),regionRect(0,100,260,200),
      regionRect(0,0,800,843),regionRect(0,-600,260,843)].map(rect=>{
      const aside=mockElement('aside');aside.getBoundingClientRect=()=>rect;return aside;
    });
    f.main.getBoundingClientRect=()=>regionRect(0,0,1263,843);
    f.main.querySelectorAll=()=>candidates;
    f.events.get('resize')();await settle();
    assert.equal(f.host().style.left,'12px','floating, short, overly wide and vertically offscreen asides are ignored');
    f.main.getBoundingClientRect=()=>regionRect(260,0,1003,843);
    const nav=mockElement('nav');nav.getBoundingClientRect=()=>regionRect(0,96,260,582);
    f.main.querySelectorAll=()=>[nav];
    f.events.get('resize')();await settle();
    assert.equal(f.host().style.left,'272px','main already excludes navigation; do not offset it twice');
    const navigation=mockElement('div');navigation.setAttribute('role','navigation');
    navigation.getBoundingClientRect=()=>regionRect(0,96,180,582);
    f.main.getBoundingClientRect=()=>regionRect(0,0,1263,843);
    f.main.querySelectorAll=()=>[navigation];
    f.events.get('resize')();await settle();
    assert.equal(f.host().style.left,'192px','role navigation uses its measured width');
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
    assert.equal(f.host().style.left,'272px');
    assert.equal(f.host().style.top,'450px');
    assert(observed.has(content),'observe the actual conversation container');
    assert.equal(f.host().attributes['data-opendesk-prompts-anchor'],'conversation-region-r18');
    edge=0;notify();await settle();
    assert.equal(f.host().style.left,'12px','content resizing updates layout without window resize');
    edge=260;f.docEvents.get('transitionend')();await settle();
    assert.equal(f.host().style.left,'272px','transition completion remeasures final position');
  }finally{f.controller.dispose();}
  assert(disconnected,'dispose disconnects the layout observer');
  assert(!f.docEvents.has('transitionend'),'dispose removes the transition listener');
});

function mobileComposer(f,{accepted=true}={}){
  const query=f.doc.querySelector,selections=[];
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
    assert.equal(feedback.hidden,false);assert.match(feedback.textContent,/已插入输入框/);
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
      assert.match(feedback.textContent,/已复制完整提示词/);
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
test('R2 picker uses extension-owned message, exact document, unique semantic selector, Esc',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
  const library={schema:1,items:[],settings:{webButtons:true}};
  const f=fixture({pkg,library});f.win.location.href='https://example.org/compose';
  f.editor.tagName='textarea';f.editor.attributes.id='composer';
  f.editor.getBoundingClientRect=()=>({left:350,top:480,width:540,height:100});
  f.doc.querySelectorAll=s=>s==='textarea'||s==='#composer'?[f.editor]:s==='main'?[f.main]:[];
  const controller=initPromptShortcuts({api:f.api,doc:f.doc,win:f.win});
  const send=(operation,extra={})=>new Promise(resolve=>{
    const fn=[...f.runtimeMessages][0];assert(fn,'trusted listener must exist');
    fn({protocol:'opendesk.prompt-shortcuts.picker.v1',toolId:PROMPT_ID,
      operation,expectedUrl:f.win.location.href,...extra},{
      id:'test-extension',url:'chrome-extension://test-extension/tool.html'
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
