// Local-only visual proof. Imports the PRODUCT registry and renderer; no mock engine.
import {createAnswerRegistry} from '/src/answer-registry.js';
import {requireXmindRuntime} from '/src/xmind-adapter.js';

const status=document.getElementById('preview-status');
const conversation=document.getElementById('preview-conversation');
const controls=[...document.querySelectorAll('.preview-controls button')];
const initialStyles=document.querySelectorAll('style').length;
const removers=[];
let registry=null;
let active=true;
const state={level:'LOCAL_PREVIEW_ONLY',sdk:'NOT_TESTED',installed:'NOT_TESTED',
  loggedInChatGPT:'NOT_TESTED',styleIsolation:'NOT_TESTED',errors:[]};
window.mindmapPreview=state;

function announce(message,kind='ready'){
  status.textContent=message;status.dataset.state=kind;
}
function fail(error){
  const message=String(error?.code||error?.message||error);
  state.errors.push(message);
  announce('预览失败：'+message+'。原文仍可查看；绝不会改用模拟引擎。','error');
  for(const control of controls)control.disabled=true;
}
function bind(element,type,handler,options){
  element.addEventListener(type,handler,options);
  const remove=()=>element.removeEventListener(type,handler,options);
  removers.push(remove);return remove;
}
const owner={
  active:()=>active,
  on(element,type,handler,options){
    return bind(element,type,event=>{
      try{Promise.resolve(handler(event)).catch(fail);}
      catch(error){fail(error);}
    },options);
  },
  observe(element,callback,options){
    const observer=new MutationObserver(callback);
    observer.observe(element,options);
    removers.push(()=>observer.disconnect());
    return observer;
  },
  setTimeout(callback,ms){
    const id=setTimeout(callback,ms);
    removers.push(()=>clearTimeout(id));return id;
  },
  setInterval(callback,ms){
    const id=setInterval(callback,ms);
    removers.push(()=>clearInterval(id));return id;
  }
};
const answer=n=>document.querySelector('[data-testid="conversation-turn-'+n+'"]');
async function stop(){
  if(!active)return;
  active=false;
  for(const control of controls)control.disabled=true;
  try{await registry?.destroy();}
  catch(error){state.errors.push(String(error?.message||error));}
  finally{for(const remove of removers.splice(0).reverse())remove();}
  const residual=document.querySelectorAll('style').length-initialStyles;
  state.residualStyles=residual;
  state.remainingOwnNodes=document.querySelectorAll('[data-opendesk-chatgpt-mindmap]').length;
  state.styleIsolation=residual>0?'BLOCKED_STYLE_RESIDUE':'NO_STYLE_GROWTH_OBSERVED';
  state.sdk='STOPPED';
  announce('Stop 已执行；拥有的 UI 节点剩余 '+state.remainingOwnNodes+
    '；全局 style 节点变化 '+residual+
    '。此数据属于独立预览文档，不代表 ChatGPT 隔离验收。','stopped');
}
async function start(){
  requireXmindRuntime(window);
  const response=await fetch('/assets/ui.css',{cache:'no-store'});
  if(!response.ok)throw new Error('E_PREVIEW_CSS_MISSING');
  const css=await response.text();
  registry=createAnswerRegistry({document,window,owner,css});
  registry.start();
  if(registry.count!==3)throw new Error('E_PREVIEW_ANSWERS');
  state.sdk='FIXED_RESOURCES_LOADED';
  announce('四份本地引擎资源已由服务器完成 SHA-256/Git blob 校验；已识别 3 条回复。点击操作栏「思维导图」验证真实画布；正式安装仍为 NOT_TESTED。');
  bind(document.getElementById('preview-width'),'click',event=>{
    const narrow=conversation.classList.toggle('is-narrow');
    event.currentTarget.setAttribute('aria-pressed',String(narrow));
  });
  bind(document.getElementById('preview-redraw'),'click',()=>{
    const bar=answer(2).querySelector('.actions');
    bar.replaceWith(bar.cloneNode(true));
  });
  bind(document.getElementById('preview-update'),'click',()=>{
    answer(2).querySelector('.markdown p').append(' 已更新：请重新读取对应的 B 回复。');
  });
  bind(document.getElementById('preview-stop'),'click',()=>{stop().catch(fail);});
  bind(window,'pagehide',()=>{stop().catch(()=>{});},{once:true});
}
start().catch(fail);
