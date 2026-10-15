import {createMindMapRenderer} from './mindmap-renderer.js';

// The viewer host may be moved into body for fullscreen, but the same
// AnswerController always owns it. None of the original ChatGPT DOM is moved.
export function createAnswerView({document,window,css,tree,nodeCount,truncated,
  onOriginal,onRefresh,onFullscreen}){
  const el=(tag,className,label)=>{
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(label!==undefined)node.textContent=label;
    return node;
  };
  const host=el('section');host.setAttribute('data-opendesk-chatgpt-mindmap','viewer');
  host.className='odmm-viewer-host';
  const shadow=host.attachShadow({mode:'open'});
  const style=el('style');style.textContent=css;
  const shell=el('div','odmm-shell');
  const heading=el('div','odmm-heading');
  const titleBlock=el('div','odmm-title-block');
  titleBlock.append(el('strong','odmm-title','思维导图'),el('span','odmm-subtitle','来自本条 AI 回复 · 本地生成'));
  heading.append(titleBlock,el('span','odmm-mode','只读'));
  const toolbar=el('div','odmm-toolbar');
  const actions=[];
  function action(label,fn,title){
    const button=el('button','odmm-tool',label);button.type='button';
    button.title=title||label;button.setAttribute('aria-label',title||label);
    button.addEventListener('click',fn);actions.push([button,fn]);
    toolbar.append(button);return button;
  }
  action('原文',onOriginal,'恢复本条回复原文');
  action('刷新',onRefresh,'重新读取本条回复内容');
  const zoomOut=action('−',()=>renderer.zoomBy(.8,canvas.clientWidth/2,canvas.clientHeight/2),'缩小');
  const zoomIn=action('+',()=>renderer.zoomBy(1.25,canvas.clientWidth/2,canvas.clientHeight/2),'放大');
  action('适配',()=>renderer.fit(),'适配画布');
  const fold=action('折叠',()=>{const folded=renderer.toggleAll();fold.textContent=folded?'展开':'折叠';},'展开或折叠节点');
  const full=action('全屏',onFullscreen,'切换全屏工作区');
  const canvas=el('div','odmm-canvas');canvas.tabIndex=0;
  canvas.setAttribute('aria-label','思维导图画布，按住鼠标拖动，使用工具栏缩放');
  const footer=el('div','odmm-footer');
  const count=el('span','odmm-count',`${nodeCount} 个主题 · 只读 · Ctrl/⌘/Alt + 滚轮缩放`);
  const status=el('span','odmm-status');status.setAttribute('role','status');
  footer.append(count,status);
  const note=el('div','odmm-note');note.hidden=true;
  if(truncated){
    const warning=el('div','odmm-warning','导图内容较长，已按节点、深度或备注上限截断；原文保持完整。');
    warning.setAttribute('role','status');shell.append(warning);
  }
  shell.append(heading,toolbar,canvas,note,footer);shadow.append(style,shell);
  let renderer=createMindMapRenderer({document,window,canvas,tree,onSelection:node=>{
    note.hidden=false;
    note.textContent=node.content?`${node.title}\n${node.content}`:node.title;
  }});
  let fullscreen=false,disposed=false,inlineParent=null,inlineNext=null;
  function setFull(value){
    if(disposed||fullscreen===value)return;
    fullscreen=value;
    if(value){
      inlineParent=host.parentNode;inlineNext=host.nextSibling;
      host.classList.add('odmm-fullscreen');
      document.body.append(host);
      full.textContent='退出全屏';
    }else{
      host.classList.remove('odmm-fullscreen');
      if(inlineParent?.isConnected){
        if(inlineNext?.parentNode===inlineParent)inlineParent.insertBefore(host,inlineNext);
        else inlineParent.append(host);
      }
      full.textContent='全屏';
    }
    renderer.fit();
  }
  function markStale(){
    status.textContent='原回复内容已变化，请点击「刷新」更新导图';
    status.setAttribute('data-stale','true');
  }
  function destroy(){
    if(disposed)return;disposed=true;
    renderer.destroy();
    for(const [button,fn] of actions)button.removeEventListener('click',fn);
    host.remove();
  }
  return Object.freeze({host,destroy,setFull,markStale,fit:()=>renderer.fit(),
    get fullscreen(){return fullscreen;},get nodeCount(){return renderer.nodeCount;}});
}
