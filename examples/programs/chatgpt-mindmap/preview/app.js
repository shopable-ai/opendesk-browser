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
  // Snowbrush may insert global styles WHILE its scripts are loading (before
  // this app gets control), so a 0 style-count delta must NEVER be called clean.
  const retained=[...document.querySelectorAll('head style, body style')]
    .filter(node=>node.id==='snowbrush_style'||
      /\.workbook-item|\.sb-container/.test(node.textContent||''));
  state.globalSdkStyles=retained.map(node=>node.id||'(unnamed XMind global style)');
  state.styleIsolation=(retained.length||residual>0)?
    'BLOCKED_GLOBAL_STYLE_RESIDUE':'NO_MATCHING_GLOBAL_STYLE_OBSERVED';
  state.sdk='STOPPED';
  announce('Stop 已执行；拥有的 UI 节点剩余 '+state.remainingOwnNodes+
    '；全局 style 数量变化 '+residual+
    '；仍存在的 XMind 全局 style '+retained.length+
    '。这些脚本样式不属于 ChatGPT 安全沙箱，不能算正式 USER_SCRIPT 隔离验收。','stopped');
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
  // The developer's one-command launcher opens ?autostart=1. Click the REAL
  // product button once; never create a fixture-only renderer or fake canvas.
  // The browser probe also tests this path separately from manual A/B/C.
  if(new URLSearchParams(window.location.search).get('autostart')==='1'){
    const first=answer(1)?.querySelector('[data-opendesk-chatgpt-mindmap="button"]')
      ?.shadowRoot?.querySelector('button');
    if(!first)throw new Error('E_PREVIEW_AUTOSTART_TRIGGER_MISSING');
    state.autostart='REAL_PRODUCT_BUTTON_CLICKED';
    first.click();
  }
  bind(document.getElementById('preview-width'),'click',event=>{
    const narrow=conversation.classList.toggle('is-narrow');
    event.currentTarget.setAttribute('aria-pressed',String(narrow));
  });
  // Fixture-only input generation. All parsing, conversion and canvas
  // rendering still use exactly the same product modules as the real program.
  const cContent=answer(3).querySelector('.markdown');
  const originalC=[...cContent.childNodes].map(node=>node.cloneNode(true));
  bind(document.getElementById('preview-large'),'click',event=>{
    const button=event.currentTarget;
    const large=button.getAttribute('aria-pressed')!=='true';
    button.setAttribute('aria-pressed',String(large));
    button.textContent=large?'恢复 C 默认回复':'将 C 切换为大型导图';
    if(!large){
      cContent.replaceChildren(...originalC.map(node=>node.cloneNode(true)));
      return;
    }
    const nodes=[];
    const heading=document.createElement('h2');
    heading.textContent='大型多层级导图：95 个内容节点';
    nodes.push(heading);
    for(let section=1;section<=5;section++){
      const title=document.createElement('h3');
      title.textContent='工作流阶段 '+section;
      const list=document.createElement('ul');
      for(let item=1;item<=6;item++){
        const li=document.createElement('li');
        li.append(document.createTextNode('任务 '+section+'.'+item+'：真实节点与分支'));
        const children=document.createElement('ul');
        for(let depth=1;depth<=2;depth++){
          const sub=document.createElement('li');
          sub.textContent='检查项 '+section+'.'+item+'.'+depth+'：内容与生命周期';
          children.append(sub);
        }
        li.append(children);
        list.append(li);
      }
      nodes.push(title,list);
    }
    cContent.replaceChildren(...nodes);
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
