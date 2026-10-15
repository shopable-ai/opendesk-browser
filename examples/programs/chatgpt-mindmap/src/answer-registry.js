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

function makeButton(doc,css,handleClick){
  const host=make(doc,'span');
  host.setAttribute('data-opendesk-chatgpt-mindmap','button');
  host.style.cssText='display:inline-flex;vertical-align:middle;max-width:100%;';
  const shadow=host.attachShadow({mode:'open'});
  const style=make(doc,'style');style.textContent=css;
  const button=make(doc,'button','思维导图');
  button.type='button';button.className='odmm-trigger';
  button.setAttribute('aria-label','查看本条 AI 回复的思维导图');
  button.setAttribute('aria-pressed','false');
  // Keep native ChatGPT action buttons fully intact. Our glyph is contained
  // within our own shadow tree, not an injected SVG in a React-owned toolbar.
  const glyph=doc.createElementNS('http://www.w3.org/2000/svg','svg');
  glyph.setAttribute('viewBox','0 0 20 20');glyph.setAttribute('aria-hidden','true');
  for(const [d] of [['M5 4 L14 4 M5 4 L5 10 M5 10 L14 10 M14 10 L14 16 M5 10 L5 16']]){
    const path=doc.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',d);glyph.append(path);
  }
  button.prepend(glyph);
  button.addEventListener('click',handleClick);
  shadow.append(style,button);
  return {host,button,destroy:()=>{
    button.removeEventListener('click',handleClick);host.remove();
  }};
}

function answerController({document,window,owner,css,parts,coordinator}){
  let {root,content,bar}=parts;
  let hidden=null,view=null,disposed=false,revision=0,viewRevision=-1,lastChange=0;
  let busyTimer=null,buttonRef=null;
  const handleClick=()=>{
    if(disposed||buttonRef?.button.disabled)return;
    if(view){close();return;}
    open();
  };
  buttonRef=makeButton(document,css,handleClick);
  function syncTheme(){
    const theme=dark(document)?'true':'false';
    buttonRef.host.setAttribute('data-dark',theme);
    view?.host.setAttribute('data-dark',theme);
  }
  function syncButton(){
    if(disposed)return;
    const busy=isStreaming(root)||(lastChange>0&&Date.now()-lastChange<STABLE_MS);
    buttonRef.button.disabled=busy;
    buttonRef.button.setAttribute('aria-pressed',String(!!view));
    buttonRef.button.setAttribute('aria-label',view?'恢复本条回复原文':'查看本条 AI 回复的思维导图');
    // Fullscreen has an exit button; inline button is kept for normal toggles.
    buttonRef.button.lastChild.textContent=view?'原文':'思维导图';
    if(busy&&busyTimer===null){
      busyTimer=owner.setTimeout(()=>{busyTimer=null;syncButton();},STABLE_MS+40);
    }
  }
  function insertButton(next){
    if(!next?.parentNode)return;
    if(buttonRef.host.parentNode!==next.parentNode||
       buttonRef.host.previousSibling!==next){
      next.parentNode.insertBefore(buttonRef.host,next.nextSibling);
    }
  }
  function restore(){
    if(!hidden)return;
    const {node,oldDisplay,oldPriority,oldAria}=hidden;
    if(node.style.getPropertyValue('display')==='none'&&
       node.style.getPropertyPriority('display')==='important'){
      if(oldDisplay)node.style.setProperty('display',oldDisplay,oldPriority);
      else node.style.removeProperty('display');
    }
    if(node.getAttribute('aria-hidden')==='true'){
      if(oldAria===null)node.removeAttribute('aria-hidden');
      else node.setAttribute('aria-hidden',oldAria);
    }
    hidden=null;
  }
  function conceal(){
    hidden={node:content,oldDisplay:content.style.getPropertyValue('display'),
      oldPriority:content.style.getPropertyPriority('display'),
      oldAria:content.getAttribute('aria-hidden')};
    content.style.setProperty('display','none','important');
    content.setAttribute('aria-hidden','true');
  }
  function close({focus=false}={}){
    if(coordinator.full===api)coordinator.setFull(null);
    view?.destroy();view=null;restore();syncButton();
    if(focus&&buttonRef.host.isConnected)buttonRef.button.focus();
  }
  function open(){
    if(disposed||!root.isConnected||!content.isConnected||!bar.isConnected)return;
    // Recover from late generation; do not take a snapshot during stream.
    if(isStreaming(root)||Date.now()-lastChange<STABLE_MS)return;
    const result=extractAnswerTree(content);
    if(!result.nodeCount)return;
    const nextView=createAnswerView({document,window,css,...result,
      onOriginal:()=>close({focus:true}),
      onRefresh:()=>refresh(),
      onFullscreen:()=>coordinator.setFull(coordinator.full===api?null:api)});
    try{
      // The original content remains connected, immutable and restorable.
      if(content.contains(document.activeElement))buttonRef.button.focus();
      content.insertAdjacentElement('afterend',nextView.host);
      view=nextView;viewRevision=revision;conceal();syncTheme();syncButton();view.fit();
    }catch(error){nextView.destroy();restore();throw error;}
  }
  function refresh(){
    if(disposed||!view||!content.isConnected)return;
    if(isStreaming(root)||Date.now()-lastChange<STABLE_MS)return;
    const full=coordinator.full===api;
    close();open();
    if(full&&view)coordinator.setFull(api);
  }
  const api={
    get root(){return root;},get content(){return content;},get bar(){return bar;},
    get view(){return view;},get revision(){return revision;},
    get buttonHost(){return buttonRef.host;},get button(){return buttonRef.button;},
    reconcile(next){
      if(disposed)return;
      if(next.content!==content){close();content=next.content;lastChange=0;revision++;}
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
    setFull(value){
      if(disposed||!view)return;
      view.setFull(value);
      if(!value&&root.isConnected&&content.isConnected&&!view.host.isConnected){
        content.insertAdjacentElement('afterend',view.host);
      }
      syncButton();
    },
    destroy(){
      if(disposed)return;disposed=true;
      // setFull(null) must not return an orphan viewer to a removed answer.
      if(coordinator.full===api)coordinator.setFull(null);
      view?.destroy();view=null;restore();
      buttonRef.destroy();
    }
  };
  insertButton(bar);syncTheme();syncButton();
  return Object.freeze(api);
}

export function createAnswerRegistry({document,window,owner,css}){
  const byRoot=new WeakMap(),controllers=new Set();
  let disposed=false,pending=false,route=window.location.pathname+window.location.search;
  let full=null,lastScanned=0;
  const coordinator={get full(){return full;},setFull(next){
    if(full===next)return;
    const old=full;full=null;
    if(old)old.setFull(false);
    if(next&&next.view&&next.root.isConnected){full=next;next.setFull(true);}
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
      const controller=answerController({document,window,owner,css,parts,coordinator});
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
    coordinator.setFull(null);
    for(const controller of controllers)controller.destroy();
    controllers.clear();schedule();
  }
  const keydown=event=>{
    if(event.key==='Escape'&&full){
      const previous=full;coordinator.setFull(null);
      previous.button.focus();event.preventDefault();
    }
  };
  function destroy(){
    if(disposed)return;disposed=true;
    coordinator.setFull(null);
    for(const controller of controllers)controller.destroy();
    controllers.clear();
  }
  function start(){
    if(disposed)throw new Error('E_MINDMAP_DESTROYED');
    owner.observe(document.documentElement,mutations,
      {subtree:true,childList:true,characterData:true});
    owner.on(window,'keydown',keydown);
    owner.observe(document.documentElement,()=>schedule(),
      {attributes:true,attributeFilter:['class','data-theme']});
    owner.setInterval(checkRoute,1100);
    scan();
  }
  return Object.freeze({start,destroy,scan,get count(){return controllers.size;},
    get activeFullscreen(){return Boolean(full);},get lastScanned(){return lastScanned;}});
}
