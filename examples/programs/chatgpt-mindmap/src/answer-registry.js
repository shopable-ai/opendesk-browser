import {answerRootOf,discoverAnswers,inspectAnswer,isStreaming} from './chatgpt-adapter.js';
import {extractAnswerTree} from './extract.js';
import {createAnswerView} from './view.js';
import {annotateMindmapError,describeMindmapError} from './diagnostics.js';

// Small DOM convention shared with the independently installed navigation.
// Keep this Page project self-contained; neither program owns the other's UI.
const TOOLS='data-opendesk-chatgpt-answer-tools';
function unmountAnswerTool(host){
  const group=host.parentElement;host.remove();
  if(group?.hasAttribute(TOOLS)&&!group.childNodes.length)group.remove();
}
function mountAnswerTool(bar,host){
  if(!bar?.isConnected||!host||host===bar||host.contains(bar))return null;
  // The native DIL footer may wrap a narrower action row. Both independent
  // Page Programs resolve that same footer without requiring the other Program
  // to have installed a navigation button first.
  const scope=bar.closest?.('.turn-action-controls')||bar;
  const groups=[...scope.querySelectorAll(`[${TOOLS}]`)];
  if(groups.length>1)return null; // Ambiguous ownership: never guess or delete a peer.
  let group=groups[0];
  const target=group?.parentElement||scope;
  if(!target?.isConnected||!scope.contains(target))return null;
  if(!group){
    group=bar.ownerDocument.createElement('span');group.setAttribute(TOOLS,'');
    group.style.cssText='display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:12px;'+
      'background:color-mix(in srgb,currentColor 6%,transparent);'+
      'border:1px solid color-mix(in srgb,currentColor 10%,transparent);'+
      'margin-inline-start:auto;max-width:100%;flex-wrap:wrap;flex:0 0 auto;';
  }
  const previous=host.parentElement;
  if(group.lastElementChild!==host)group.append(host);
  if(previous!==group&&previous?.hasAttribute(TOOLS)&&!previous.childNodes.length)previous.remove();
  // Existing nested shared groups stay inside the native row. A missing group
  // is independently created at the same outer footer by either installation.
  if(target.lastElementChild!==group)target.append(group);
  return group;
}

const MAX_ANSWERS=120,STABLE_MS=700;
const make=(doc,tag,text)=>{
  const element=doc.createElement(tag);
  if(text!==undefined)element.textContent=text;
  return element;
};
const dark=doc=>doc.documentElement.classList.contains('dark')||
  doc.documentElement.getAttribute('data-theme')==='dark';
// Only a non-sensitive theme choice is kept in ChatGPT's origin storage.
// Restrictive/privacy contexts still support the toggle for this session.
// The new Program owns its own preference; legacy data is read-only.
// A theme fallback is not an installation, execution, or authority migration.
const VIEW_THEME_KEY='opendesk.ai-reply-mindmap.viewer-theme.v1';
const LEGACY_VIEW_THEME_KEY='opendesk.chatgpt-mindmap.viewer-theme.v1';
const readViewerTheme=win=>{
  try{
    const current=win.localStorage?.getItem(VIEW_THEME_KEY);
    if(current==='light'||current==='dark')return current;
    return win.localStorage?.getItem(LEGACY_VIEW_THEME_KEY)==='light'?'light':'dark';
  }catch{return 'dark';}
};
const saveViewerTheme=(win,mode)=>{
  try{win.localStorage?.setItem(VIEW_THEME_KEY,mode);}catch{/* optional storage */}
};

function makeButton(doc,css,owner,handleClick){
  const host=make(doc,'span');
  host.setAttribute('data-opendesk-chatgpt-mindmap','button');
  host.style.cssText='display:inline-flex;flex-wrap:wrap;align-items:center;vertical-align:middle;max-width:100%;';
  const shadow=host.attachShadow({mode:'open'});
  const style=make(doc,'style');style.textContent=css;
  const button=make(doc,'button');
  button.type='button';button.className='odmm-trigger';
  button.setAttribute('aria-label','查看本条 AI 回复的思维导图');
  button.setAttribute('aria-pressed','false');
  // Bounded mind-map icon lives only in our Shadow DOM.
  const ns='http://www.w3.org/2000/svg';
  const glyph=doc.createElementNS(ns,'svg');
  glyph.setAttribute('viewBox','0 0 20 20');glyph.setAttribute('aria-hidden','true');
  glyph.setAttribute('focusable','false');
  const branches=doc.createElementNS(ns,'path');
  branches.setAttribute('d','M5 10h5M10 5v10M10 5h5M10 15h5');glyph.append(branches);
  for(const [cx,cy] of [[3.5,10],[16.5,5],[16.5,15]]){
    const node=doc.createElementNS(ns,'circle');
    node.setAttribute('cx',String(cx));node.setAttribute('cy',String(cy));
    node.setAttribute('r','1.5');glyph.append(node);
  }
  button.append(glyph);
  const remove=owner.on(button,'click',handleClick);
  shadow.append(style,button);
  return {host,button,destroy:()=>{
    remove();unmountAnswerTool(host);
  }};
}

function answerController({document,window,owner,css,parts,coordinator,createView,instanceId,themePreference}){
  let {root,content,bar}=parts;
  let hidden=null,view=null,disposed=false,revision=0,viewRevision=-1,lastChange=0,viewSession=0;
  const readMessageId=()=>root.getAttribute('data-message-id')||
    root.getAttribute('data-chatgpt-search-message-ids')||
    root.getAttribute('data-content-search-unit-key')||root.id||null;
  let messageId=readMessageId();
  let busyTimer=null,buttonRef=null,openingAnchor=null;
  const handleClick=async()=>{
    if(disposed||buttonRef?.button.disabled)return;
    if(view){await close({restorePosition:true});return;}
    await open();
  };
  buttonRef=makeButton(document,css,owner,handleClick);
  function captureAnchor(){
    const rect=buttonRef.host.getBoundingClientRect?.();
    if(!rect||!Number.isFinite(rect.top))return null;
    const height=window.innerHeight||document.documentElement?.clientHeight||0;
    if(height&&!(rect.bottom>0&&rect.top<height))return null;
    let scroller=buttonRef.host.parentElement;
    while(scroller&&scroller!==document.documentElement){
      const overflow=window.getComputedStyle?.(scroller)?.overflowY||'';
      if(/^(auto|scroll|overlay)$/.test(overflow)&&scroller.scrollHeight>scroller.clientHeight)break;
      scroller=scroller.parentElement;
    }
    return {top:rect.top,scroller:scroller||document.scrollingElement||document.documentElement,
      messageId};
  }
  function restoreAnchor(anchor){
    if(!anchor||disposed||!buttonRef.host.isConnected||readMessageId()!==anchor.messageId)return;
    const top=buttonRef.host.getBoundingClientRect?.().top;
    const delta=top-anchor.top;
    if(!Number.isFinite(delta)||Math.abs(delta)<2)return;
    const scroller=anchor.scroller;
    if(scroller===document.scrollingElement||scroller===document.documentElement||
      scroller===document.body){
      if(typeof window.scrollBy==='function')window.scrollBy({top:delta,left:0,behavior:'instant'});
      else if(scroller)scroller.scrollTop+=delta;
    }else if(scroller?.isConnected){
      scroller.scrollTop+=delta;
    }
  }
  function syncTheme(){
    if(disposed)return Promise.resolve();
    // The trigger blends into ChatGPT, while the workbook has its own
    // persistent light/dark preference and never changes the page theme.
    const pageTheme=dark(document)?'true':'false';
    if(buttonRef.host.getAttribute('data-dark')!==pageTheme){
      buttonRef.host.setAttribute('data-dark',pageTheme);
    }
    const viewerTheme=themePreference.mode==='dark'?'true':'false';
    if(view&&view.host.getAttribute('data-dark')!==viewerTheme){
      view.host.setAttribute('data-dark',viewerTheme);
      const current=view,session=viewSession;
      return view.setTheme(viewerTheme==='true').catch(error=>
        failed(annotateMindmapError(error,'view.setTheme'),current,session));
    }
    return Promise.resolve();
  }
  function syncButton(){
    if(disposed)return;
    const busy=isStreaming(root)||(lastChange>0&&Date.now()-lastChange<STABLE_MS);
    buttonRef.button.disabled=busy&&!view;
    buttonRef.button.setAttribute('aria-pressed',String(!!view));
    const label=view?'返回完整原文':'查看本条 AI 回复的思维导图';
    buttonRef.button.setAttribute('aria-label',label);
    buttonRef.button.title=label;
    // Keep the native action-bar trigger in its exact slot in either mode.
    buttonRef.host.hidden=false;
    buttonRef.host.removeAttribute('aria-hidden');
    if(busy&&busyTimer===null){
      busyTimer=owner.setTimeout(()=>{busyTimer=null;syncButton();},STABLE_MS+40);
    }
  }
  function insertButton(next){
    if(!next?.isConnected)return;
    // Different old/new installed Program identities can temporarily coexist.
    // Never remove a live foreign trigger: the other installation owns its DOM.
    // An inert clone has no live ShadowRoot and can still be cleaned safely.
    const peers=[...next.querySelectorAll('[data-opendesk-chatgpt-mindmap="button"]')]
      .filter(candidate=>candidate!==buttonRef.host);
    if(peers.some(candidate=>candidate.shadowRoot)){
      if(buttonRef.host.isConnected)unmountAnswerTool(buttonRef.host);
      return;
    }
    for(const clone of peers)clone.remove();
    mountAnswerTool(next,buttonRef.host);
  }
  function restore(){
    if(!hidden)return;
    const {node,oldDisplay,oldPriority,oldAria,hadStyle}=hidden;
    if(node.style.getPropertyValue('display')==='none'&&
       node.style.getPropertyPriority('display')==='important'){
      if(oldDisplay)node.style.setProperty('display',oldDisplay,oldPriority);
      else node.style.removeProperty('display');
    }
    if(!hadStyle&&node.getAttribute('style')?.trim()==='')node.removeAttribute('style');
    if(node.getAttribute('aria-hidden')==='true'){
      if(oldAria===null)node.removeAttribute('aria-hidden');
      else node.setAttribute('aria-hidden',oldAria);
    }
    hidden=null;
  }
  function conceal(){
    hidden={node:content,hadStyle:content.hasAttribute('style'),oldDisplay:content.style.getPropertyValue('display'),
      oldPriority:content.style.getPropertyPriority('display'),
      oldAria:content.getAttribute('aria-hidden')};
    content.style.setProperty('display','none','important');
    content.setAttribute('aria-hidden','true');
  }
  function close({focus=false,restorePosition=focus,reportFailure=true}={}){
    const anchor=openingAnchor;openingAnchor=null;
    const session=viewSession,closingRevision=revision;
    coordinator.releaseFull(api);
    const previous=view;view=null;restore();syncButton();
    // Retire directly; restore the opener position after the old layout is gone.
    const retired=coordinator.retire(previous);
    return retired.catch(async error=>{
      // A user-initiated return can fail retirement after the answer is back.
      // Record it only while this session still has no replacement viewer.
      if(reportFailure&&previous&&!disposed&&viewSession===session&&revision===closingRevision&&!view)
        await failed(annotateMindmapError(error,'view.destroy'),null,session);
      throw error;
    }).finally(()=>{
      if(disposed)return;
      if(focus&&buttonRef.host.isConnected)buttonRef.button.focus({preventScroll:true});
      if(restorePosition)restoreAnchor(anchor);
    });
  }
  async function failed(error,source,session){
    // A retired viewer can still reject a toolbar or renderer operation.
    // Its cleanup error is retained by retire(), never applied to a new view.
    if(disposed||view!==source||viewSession!==session)return;
    const record=coordinator.recordFailure(error,{instanceId,contentRevision:revision,viewSession:session});
    // Restore immediately; preserve the primary error even if cleanup fails.
    // Debug metadata belongs in the console, never in the reply action group.
    const closing=close({reportFailure:false});
    try{await closing;}
    catch(cleanup){
      record.cleanup=describeMindmapError(annotateMindmapError(cleanup,'view.destroy'));
      coordinator.logFailure(record);
    }
  }
  async function open(){
    if(disposed||!root.isConnected||!content.isConnected||!bar.isConnected)return;
    // Recover from late generation; do not take a snapshot during stream.
    if(isStreaming(root)||Date.now()-lastChange<STABLE_MS)return;
    const focusViewer=buttonRef.button.matches(':focus-visible');
    const session=++viewSession;
    let nextView=null,mounted=false,stage='answer.extract';
    try{
      const result=extractAnswerTree(content);
      if(!result.nodeCount)return;
      openingAnchor=captureAnchor();stage='view.create';
      nextView=createView({document,window,owner,css,...result,
        identity:Object.freeze({instanceId,revision}),
        onError:error=>failed(annotateMindmapError(error,'view.operation'),nextView,session),
        onOriginal:()=>close({focus:true}),
        onRefresh:options=>refresh(options),
        onFullscreen:()=>coordinator.setFull(coordinator.full===api?null:api),
        onToggleTheme:()=>themePreference.toggle()});
      stage='view.mount';
      // The original content remains connected, immutable and restorable.
      if(content.contains(document.activeElement))buttonRef.button.focus({preventScroll:true});
      content.insertAdjacentElement('afterend',nextView.host);
      view=nextView;mounted=true;viewRevision=revision;conceal();syncTheme();syncButton();
      stage='view.start';await nextView.start();
      if(focusViewer&&view===nextView)nextView.focusPrimary();
    }catch(error){
      error=annotateMindmapError(error,stage);
      if(viewSession===session&&view===nextView)await failed(error,nextView,session);
      else if(viewSession===session&&!view&&!mounted){
        // A constructor/mount can throw before the viewer becomes current.
        view=nextView;await failed(error,nextView,session);
      }
      else await coordinator.retire(nextView);
    }
  }
  async function refresh({focus=false}={}){
    if(disposed||!view||!content.isConnected)return;
    if(isStreaming(root)||Date.now()-lastChange<STABLE_MS)return false;
    const full=coordinator.full===api;
    await close();await open();
    if(full&&view)await coordinator.setFull(api);
    if(focus&&view)view.focusPrimary();
    return true;
  }
  const api={
    syncTheme,
    get root(){return root;},get content(){return content;},get bar(){return bar;},
    get view(){return view;},get revision(){return revision;},
    get buttonHost(){return buttonRef.host;},get button(){return buttonRef.button;},
    reconcile(next){
      if(disposed)return;
      const nextId=readMessageId();
      if(next.content!==content||nextId!==messageId){
        close();content=next.content;messageId=nextId;lastChange=0;revision++;
      }
      bar=next.bar;
      insertButton(bar);syncTheme();syncButton();
      // If the original content was re-rendered, the old viewer cannot be
      // silently rebound to a different message or content subtree.
      if(view&&!view.host.isConnected&&coordinator.full!==api){
        close();
      }
    },
    contentChanged(){
      if(disposed)return;
      lastChange=Date.now();revision++;
      if(view&&viewRevision!==revision)view.markStale();
      syncButton();
    },
    async setFull(value){
      if(disposed||!view)return;
      const current=view;await current.setFull(value);
      if(disposed||view!==current)return;
      if(!value&&root.isConnected&&content.isConnected&&!view.host.isConnected){
        content.insertAdjacentElement('afterend',view.host);
      }
      syncButton();
    },
    destroy(){
      if(disposed)return;disposed=true;
      coordinator.releaseFull(api);
      const previous=view;view=null;restore();
      coordinator.retire(previous);
      buttonRef.destroy();
    }
  };
  insertButton(bar);syncTheme();syncButton();
  return Object.freeze(api);
}

export function createAnswerRegistry({document,window,owner,css,createView=createAnswerView,
  programRevision={version:'unknown',revision:null}}){
  const byRoot=new WeakMap(),controllers=new Set();
  let nextInstance=0;
  let disposed=false,pending=false,route=window.location.pathname+window.location.search;
  let full=null,lastScanned=0;
  let preferredTheme=readViewerTheme(window);
  const themePreference={
    get mode(){return preferredTheme;},
    toggle(){
      if(disposed)return Promise.resolve();
      preferredTheme=preferredTheme==='dark'?'light':'dark';
      saveViewerTheme(window,preferredTheme);
      // All open replies share one explicit user choice.
      return Promise.all([...controllers].map(controller=>controller.syncTheme()));
    }
  };
  const retiring=new Set(),cleanupErrors=[];
  function retire(view,after=Promise.resolve()){
    if(!view)return Promise.resolve();
    const pending=Promise.resolve(after).then(()=>view.destroy());
    retiring.add(pending);
    pending.then(()=>retiring.delete(pending),error=>{retiring.delete(pending);cleanupErrors.push(error);});
    return pending;
  }
  const diagnostics=[];
  function logFailure(record){
    // Serialize now so later cleanup updates do not change an earlier console entry.
    (window.console||console).error('[OpenDesk ChatGPT Mindmap]',JSON.stringify(record));
  }
  const coordinator={retire,logFailure,recordFailure(error,identity){
    const record={time:new Date().toISOString(),
      program:{id:'opendesk.ai-reply-mindmap',...programRevision},...identity,
      error:describeMindmapError(error)};
    diagnostics.push(record);if(diagnostics.length>8)diagnostics.shift();
    logFailure(record);
    return record;
  },releaseFull(current){if(full===current)full=null;},get full(){return full;},setFull(next){
    if(full===next)return Promise.resolve();
    const old=full;full=null;
    const exiting=old?old.setFull(false).catch(error=>cleanupErrors.push(error)):
      Promise.resolve();
    if(next&&next.view&&next.root.isConnected){
      full=next;next.setFull(true).catch(error=>cleanupErrors.push(error));
    }
    return exiting;
  }};
  function scan(){
    if(disposed||!owner.active())return;
    lastScanned=Date.now();
    const roots=discoverAnswers(document,{max:MAX_ANSWERS});
    const seen=new Set(roots);
    for(const controller of [...controllers]){
      if(!controller.root.isConnected||!seen.has(controller.root)){
        controller.destroy();controllers.delete(controller);
      }
    }
    for(const root of roots){
      const parts=inspectAnswer(root);
      const existing=byRoot.get(root);
      if(!parts.ok){
        if(existing&&controllers.has(existing)){
          existing.destroy();controllers.delete(existing);
        }
        continue;
      }
      if(existing&&controllers.has(existing)){existing.reconcile(parts);continue;}
      const controller=answerController({document,window,owner,css,parts,coordinator,createView,
        instanceId:`answer-${++nextInstance}`,themePreference});
      byRoot.set(root,controller);controllers.add(controller);
    }
  }
  function schedule(){
    if(disposed||pending)return;
    pending=true;
    owner.setTimeout(()=>{pending=false;scan();},140);
  }
  function mutations(records){
    if(disposed)return;
    for(const record of records){
      if(record.type==='attributes'){schedule();continue;}
      const root=answerRootOf(record.target);
      const controller=root&&byRoot.get(root);
      if(controller&&controllers.has(controller)&&controller.content.contains(record.target)){
        controller.contentChanged();
      }
    }
    schedule();
  }
  function checkRoute(){
    const next=window.location.pathname+window.location.search;
    if(next===route)return;
    route=next;
    for(const controller of controllers)controller.destroy();
    controllers.clear();schedule();
  }
  const keydown=event=>{
    if(event.key==='Escape'&&full){
      const previous=full;
      coordinator.setFull(null).then(()=>previous.view?.focusFullscreen());
      event.preventDefault();
    }
  };
  async function destroy(){
    if(disposed){await Promise.all([...retiring]);return;}disposed=true;
    for(const controller of controllers)controller.destroy();
    controllers.clear();
    await Promise.all([...retiring]);
    if(cleanupErrors.length)throw new AggregateError(cleanupErrors,"E_XMIND_CLEANUP");
  }
  function start(){
    if(disposed)throw new Error('E_MINDMAP_DESTROYED');
    owner.observe(document.documentElement,mutations,
      {subtree:true,childList:true,characterData:true,attributes:true,
        attributeFilter:['data-is-streaming','aria-busy','data-message-id','id','data-message-complete',
          'data-talvt-turn-state','data-chatgpt-search-message-ids','data-content-search-unit-key']});
    owner.on(window,'keydown',keydown);
    // A page-theme mutation updates the native trigger only; it never
    // overrides the user's separately saved workbook skin.
    owner.observe(document.documentElement,()=>{
      if(disposed)return;
      for(const controller of controllers)controller.syncTheme();
    },{attributes:true,attributeFilter:['class','data-theme']});
    owner.on(window,'storage',event=>{
      if(disposed||event.key!==VIEW_THEME_KEY)return;
      const next=event.newValue==='light'?'light':'dark';
      if(next===preferredTheme)return;
      preferredTheme=next;
      for(const controller of controllers)controller.syncTheme();
    });
    owner.setInterval(checkRoute,1100);
    scan();
  }
  return Object.freeze({start,destroy,scan,get count(){return controllers.size;},
    get diagnostics(){return JSON.parse(JSON.stringify(diagnostics));},
    get activeFullscreen(){return Boolean(full);},get lastScanned(){return lastScanned;}});
}
