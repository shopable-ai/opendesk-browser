import {answerRootOf,discoverAnswers,inspectAnswer,isStreaming} from './chatgpt-adapter.js';
import {extractAnswerTree} from './extract.js';
import {createAnswerView} from './view.js';

const MAX_ANSWERS=120,STABLE_MS=700;
const make=(doc,tag,text)=>{
  const element=doc.createElement(tag);
  if(text!==undefined)element.textContent=text;
  return element;
};
const dark=doc=>doc.documentElement.classList.contains('dark')||
  doc.documentElement.getAttribute('data-theme')==='dark';

function makeButton(doc,css,owner,handleClick){
  const host=make(doc,'span');
  host.setAttribute('data-opendesk-chatgpt-mindmap','button');
  host.style.cssText='display:inline-flex;vertical-align:middle;max-width:100%;';
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
  const error=make(doc,'span');error.hidden=true;error.className='odmm-error';error.setAttribute('role','alert');
  shadow.append(style,button,error);
  return {host,button,error,destroy:()=>{
    remove();host.remove();
  }};
}

function answerController({document,window,owner,css,parts,coordinator,createView,instanceId}){
  let {root,content,bar}=parts;
  let hidden=null,view=null,disposed=false,revision=0,viewRevision=-1,lastChange=0,viewSession=0;
  const readMessageId=()=>root.getAttribute('data-message-id')||root.id||null;
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
    if(disposed)return;
    const theme=dark(document)?'true':'false';
    if(buttonRef.host.getAttribute('data-dark')!==theme){
      buttonRef.host.setAttribute('data-dark',theme);
    }
    if(view&&view.host.getAttribute('data-dark')!==theme){
      view.host.setAttribute('data-dark',theme);
      // Keep the original XMind workbook skin in step with the host, not
      // just the shadow-toolbar colors. Rendering is serialized per answer.
      const current=view,session=viewSession;
      view.setTheme(theme==='true').catch(error=>failed(error,current,session));
    }
  }
  function syncButton(){
    if(disposed)return;
    const busy=isStreaming(root)||(lastChange>0&&Date.now()-lastChange<STABLE_MS);
    buttonRef.button.disabled=busy&&!view;
    buttonRef.button.setAttribute('aria-pressed',String(!!view));
    const label=view?'恢复本条回复原文':'查看本条 AI 回复的思维导图';
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
    if(buttonRef.host.parentNode!==next)next.append(buttonRef.host);
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
  function close({focus=false,restorePosition=focus}={}){
    const anchor=openingAnchor;openingAnchor=null;
    coordinator.releaseFull(api);
    const previous=view;view=null;restore();syncButton();
    // Retire directly; restore the opener position after the old layout is gone.
    const retired=coordinator.retire(previous);
    return retired.finally(()=>{
      if(disposed)return;
      if(focus&&buttonRef.host.isConnected)buttonRef.button.focus({preventScroll:true});
      if(restorePosition)restoreAnchor(anchor);
    });
  }
  async function failed(error,source,session){
    // A retired viewer can still reject a toolbar or renderer operation.
    // Its cleanup error is retained by retire(), never applied to a new view.
    if(disposed||view!==source||viewSession!==session)return;
    await close();
    if(disposed||viewSession!==session)return;
    buttonRef.error.hidden=false;
    buttonRef.error.textContent=error?.code==='E_FRAME_UNAVAILABLE'
      ?'当前预览没有已授权的 XMind 固定资源入口，暂无法生成导图，原文已恢复。'
      :error?.code==='E_FRAME_RESOURCE'||error?.code==='E_XMIND_RUNTIME_UNAVAILABLE'
      ?'当前版本未包含 XMind 运行资源，暂无法生成导图，原文已恢复。'
      :'XMind 打开失败，原文已恢复。';
    buttonRef.button.title=String(error?.code||"E_XMIND_RENDER");
  }
  async function open(){
    if(disposed||!root.isConnected||!content.isConnected||!bar.isConnected)return;
    // Recover from late generation; do not take a snapshot during stream.
    if(isStreaming(root)||Date.now()-lastChange<STABLE_MS)return;
    buttonRef.error.hidden=true;
    const focusViewer=buttonRef.button.matches(':focus-visible');
    const result=extractAnswerTree(content);
    if(!result.nodeCount)return;
    const session=++viewSession;
    openingAnchor=captureAnchor();
    const nextView=createView({document,window,owner,css,...result,
      identity:Object.freeze({instanceId,revision}),
      onError:error=>failed(error,nextView,session),
      onOriginal:()=>close({focus:true}),
      onRefresh:()=>refresh(),
      onFullscreen:()=>coordinator.setFull(coordinator.full===api?null:api)});
    try{
      // The original content remains connected, immutable and restorable.
      if(content.contains(document.activeElement))buttonRef.button.focus({preventScroll:true});
      content.insertAdjacentElement('afterend',nextView.host);
      view=nextView;viewRevision=revision;conceal();syncTheme();syncButton();
      await nextView.start();
      if(focusViewer&&view===nextView)nextView.focusPrimary();
    }catch(error){
      if(view===nextView)await failed(error,nextView,session);
      else await coordinator.retire(nextView);
    }
  }
  async function refresh(){
    if(disposed||!view||!content.isConnected)return;
    if(isStreaming(root)||Date.now()-lastChange<STABLE_MS)return;
    const full=coordinator.full===api;
    await close();await open();
    if(full&&view)coordinator.setFull(api);
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

export function createAnswerRegistry({document,window,owner,css,createView=createAnswerView}){
  const byRoot=new WeakMap(),controllers=new Set();
  let nextInstance=0;
  let disposed=false,pending=false,route=window.location.pathname+window.location.search;
  let full=null,lastScanned=0;
  const retiring=new Set(),cleanupErrors=[];
  function retire(view,after=Promise.resolve()){
    if(!view)return Promise.resolve();
    const pending=Promise.resolve(after).then(()=>view.destroy());
    retiring.add(pending);
    pending.then(()=>retiring.delete(pending),error=>{retiring.delete(pending);cleanupErrors.push(error);});
    return pending;
  }
  const coordinator={retire,releaseFull(current){if(full===current)full=null;},get full(){return full;},setFull(next){
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
        instanceId:`answer-${++nextInstance}`});
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
        attributeFilter:['data-is-streaming','aria-busy','data-message-id','id','data-message-complete']});
    owner.on(window,'keydown',keydown);
    // A theme mutation is visible at the next microtask, before a delayed
    // 140 ms answer rescan. This also updates already-open A/B viewers.
    owner.observe(document.documentElement,()=>{
      if(disposed)return;
      for(const controller of controllers)controller.syncTheme();
    },{attributes:true,attributeFilter:['class','data-theme']});
    owner.setInterval(checkRoute,1100);
    scan();
  }
  return Object.freeze({start,destroy,scan,get count(){return controllers.size;},
    get activeFullscreen(){return Boolean(full);},get lastScanned(){return lastScanned;}});
}
