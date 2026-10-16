import './model.js';
import {SIDEBAR_TOOL_STORE} from '../../../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../../../src/ui/sidebar-tools/lifecycle.js';
import {PROMPT_ID,PROMPT_DATA_STORE,supportedOrigin,allowedPromptSite} from './policy.js';
const MODEL=globalThis.OpenDeskPromptShortcutsModel;
const SLOT='__openDeskPromptShortcutsPageV1';
const STYLE=String.raw`
:host{all:initial;position:fixed;z-index:2147483600;pointer-events:none;color-scheme:light;font:13px/1.4 system-ui,sans-serif}
:host([hidden]){display:none!important}
.rail{pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:8px;max-height:min(248px,calc(100vh - 24px));overflow-y:auto;overflow-x:hidden;width:48px;padding:4px;border-radius:12px;background:transparent;scrollbar-width:thin;overscroll-behavior:contain}
button{font:inherit;cursor:pointer;color:#293549;background:#fff;border:1px solid #d9dbe2;border-radius:10px;outline-offset:2px;box-sizing:border-box;box-shadow:0 2px 7px #00000011}
button:focus-visible{outline:2px solid #365eda}
button:hover{background:#eef2ff;border-color:#365eda}
.item{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:38px;height:38px;min-height:38px;padding:3px;font-weight:650;font-size:12px;line-height:1.05}
.fold{display:none}
.rail.narrow .fold{display:flex;align-items:center;justify-content:center;width:38px;height:38px;min-height:38px;background:#365eda;border-color:#365eda;color:#fff}
.rail.narrow.folded{max-height:48px;overflow:hidden}
.rail.narrow.folded .item{display:none}
.tip{pointer-events:auto;position:absolute;left:60px;top:0;width:360px;max-width:calc(100vw - 80px);max-height:min(340px,calc(100vh - 24px));overflow:auto;overscroll-behavior:contain;background:#fff;color:#263347;border:1px solid #ccd2df;border-radius:12px;box-shadow:0 10px 32px #00000028;padding:13px 15px;overflow-wrap:anywhere}
.tip strong{display:block;margin-bottom:8px;font-size:13px}
.tip pre{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;margin:0;font:12px/1.7 system-ui,sans-serif}
.tip small{display:block;margin-top:12px;padding-top:8px;border-top:1px solid #ccd2df;color:#53647e;font-size:11px}
/* No blocking fallback dialog: status is announced without changing focus. */
.feedback{pointer-events:none;position:absolute;left:60px;top:0;width:min(300px,calc(100vw - 84px));
 background:#fff;color:#263347;border:1px solid #d9dbe2;border-radius:10px;box-shadow:0 7px 20px #0000001b;
 padding:10px 12px;font:12px/1.55 system-ui,sans-serif;overflow-wrap:anywhere}
.feedback[data-kind="error"]{color:#992f42;border-color:#d79ba6}
.feedback[data-kind="success"]{color:#157255;border-color:#9accbc}
`;
const KEYS=[SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,
  PROMPT_DATA_STORE];
export function initPromptShortcuts({api=globalThis.chrome,doc=globalThis.document,win=globalThis.window}={}){
  if(!doc||!win||win.top!==win||!supportedOrigin(win.location.href)||
    !api?.storage?.local?.get||!api.storage?.onChanged)return null;
  if(win[SLOT])return win[SLOT];
  let model=MODEL,disposed=false,paused=false,epoch=0,href=win.location.href,visible=false;
  let host=null,shadow=null,rail=null,tip=null,tipOwner=null,hideTipTimer=0,toggleButton=null;
  let feedback=null,items=[],observer=null,resizeObserver=null,layoutTimer=0;
  const observedRegions=new Set();
  let locationTimer=0,folded=false,narrowMode=null,composing=false,inserting=false,lastAttempt=0,lastAttemptId=null;
  const stop=()=>{
    visible=false;items=[];observer?.disconnect();observer=null;
    resizeObserver?.disconnect();resizeObserver=null;observedRegions.clear();
    win.clearTimeout(layoutTimer);layoutTimer=0;win.clearTimeout(hideTipTimer);hideTipTimer=0;
    host?.remove();host=null;rail=null;shadow=null;tip=null;tipOwner=null;toggleButton=null;
    feedback=null;narrowMode=null;folded=false;
  };
  const mainRegion=()=>{
    const node=doc.querySelector('main#main')||doc.querySelector('main');
    if(!node||!node.isConnected)return null;
    const rect=node.getBoundingClientRect();
    if(rect.width<200||rect.height<160)return null;
    const observe=element=>{
      if(resizeObserver&&!observedRegions.has(element)){
        observedRegions.add(element);resizeObserver.observe(element);
      }
    };
    observe(node);
    const right=rect.left+rect.width,bottom=rect.top+rect.height;
    let left=rect.left;
    for(const navigation of node.querySelectorAll('aside, nav, [role="navigation"]')){
      observe(navigation);
      if(!navigation.isConnected||navigation.hidden||navigation.closest('[hidden], [aria-hidden="true"], [inert]'))continue;
      const style=win.getComputedStyle?.(navigation);
      if(style&&(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||style.opacity==='0'))continue;
      const box=navigation.getBoundingClientRect(),edge=box.left+box.width;
      const visibleHeight=Math.min(bottom,win.innerHeight,box.top+box.height)-Math.max(rect.top,0,box.top);
      // Only a visible, tall left-edge navigation region may narrow main.
      // Offscreen collapsed rails and unrelated floating asides reserve nothing.
      if(box.width>0&&box.left<=rect.left&&edge>Math.max(rect.left,0)&&
        edge<=rect.left+rect.width/2&&visibleHeight>=rect.height/2)left=Math.max(left,edge);
    }
    // The mobile shell includes history inside main. Prefer the outermost
    // full-height editor ancestor beyond that column, never the input box.
    let content=null;
    for(let area=editor()?.parentElement;area&&area!==node;area=area.parentElement){
      if(!node.contains(area))break;
      observe(area);
      const box=area.getBoundingClientRect();
      if(box.left>=left&&box.left+box.width<=right+1&&box.width>=200&&
        box.height>=rect.height/2&&box.top>=rect.top-1&&box.top+box.height<=bottom+1){
        content={left:box.left,top:box.top,width:box.width,height:box.height};
      }
    }
    if(content)return content;
    return right-left>=200?{left,top:rect.top,width:right-left,height:rect.height}:null;
  };
  const layout=()=>{
    layoutTimer=0;if(!host||paused||disposed)return;
    if(href!==win.location.href){href=win.location.href;void refresh();return;}
    const rect=mainRegion();if(!rect){host.hidden=true;return;}
    host.hidden=false;
    const left=Math.max(4,Math.min(win.innerWidth-52,Math.round(rect.left+12)));
    const top=Math.max(28,Math.min(win.innerHeight-28,Math.round(rect.top+rect.height/2)));
    if(host.style.left!==left+'px')host.style.left=left+'px';
    if(host.style.top!==top+'px')host.style.top=top+'px';
    host.style.transform='translateY(-50%)';
    const narrow=rect.width<680;
    if(narrow!==narrowMode){narrowMode=narrow;folded=narrow;}
    rail.classList.toggle('narrow',narrow);rail.classList.toggle('folded',narrow&&folded);
    if(toggleButton){
      toggleButton.textContent=folded?'＋':'−';
      toggleButton.setAttribute('aria-label',folded?'展开提示词按钮栏':'收起提示词按钮栏');
      toggleButton.setAttribute('aria-expanded',String(!folded));
    }
    positionTip();
  };
  const schedule=()=>{if(!layoutTimer)layoutTimer=win.setTimeout(layout,120);};
  const hideTip=()=>{
    win.clearTimeout(hideTipTimer);hideTipTimer=0;
    if(tip)tip.hidden=true;
    tipOwner?.removeAttribute?.('aria-describedby');tipOwner=null;
  };
  const delayHideTip=()=>{
    win.clearTimeout(hideTipTimer);
    hideTipTimer=win.setTimeout(()=>{
      hideTipTimer=0;
      const active=shadow?.activeElement;
      if(!tip?.matches(':hover')&&active!==tipOwner&&!tip?.contains(active))hideTip();
    },150);
  };
  const positionTip=()=>{
    if(!tip||tip.hidden||!tipOwner||!host?.isConnected)return;
    if(!tipOwner.isConnected||(narrowMode&&folded)){hideTip();return;}
    const hostRect=host.getBoundingClientRect(),buttonRect=tipOwner.getBoundingClientRect();
    const tipHeight=tip.getBoundingClientRect().height||240;
    const maxTop=win.innerHeight-hostRect.top-tipHeight-12;
    const minTop=12-hostRect.top;
    tip.style.top=Math.round(Math.max(minTop,Math.min(buttonRect.top-hostRect.top-12,maxTop)))+'px';
    const freeRight=win.innerWidth-hostRect.left-60;
    tip.style.left=freeRight<260?'auto':'60px';
    tip.style.right=freeRight<260?'55px':'auto';
  };
  const showTip=(row,button)=>{
    if(!tip||!host||!host.isConnected)return;
    win.clearTimeout(hideTipTimer);hideTipTimer=0;
    if(tipOwner&&tipOwner!==button)tipOwner.removeAttribute?.('aria-describedby');
    tipOwner=button;tip.replaceChildren();
    const title=doc.createElement('strong'),content=doc.createElement('pre'),hint=doc.createElement('small');
    title.textContent=row.name;content.textContent=row.body;
    hint.textContent='点击仅追加到草稿，不会自动发送';
    tip.append(title,content,hint);tip.hidden=false;
    button.setAttribute('aria-describedby',tip.id);
    if(feedback)feedback.hidden=true;
    positionTip();
  };
  const showFeedback=(message,kind='info')=>{
    if(!feedback||!host?.isConnected)return;
    feedback.textContent=message;feedback.dataset.kind=kind;feedback.hidden=false;
  };
  const fallbackCopy=async(body,reason)=>{
    hideTip();
    try{
      if(!win.navigator?.clipboard?.writeText)throw Error('浏览器没有提供可用的剪贴板写入接口');
      await win.navigator.clipboard.writeText(body);
      showFeedback(reason?
        '编辑器插入未确认；已复制完整提示词。请先检查草稿再粘贴，避免重复。':
        '已复制提示词，可直接粘贴。','success');
    }catch(error){
      showFeedback('插入失败，复制也失败：'+(error?.message||'剪贴板访问被拒绝')+
        '。请检查网页与剪贴板权限后重试。','error');
    }
  };
  const editor=()=>{
    const node=doc.querySelector('main #prompt-textarea[contenteditable="true"],main [data-testid="composer-text-input"][contenteditable="true"],main textarea#prompt-textarea,main textarea#mobile-composer-prompt');
    if(!node||!node.isConnected||node.disabled||node.readOnly||node.hidden||node.closest('[data-opendesk-prompts]'))return null;
    const style=win.getComputedStyle?.(node);
    if(style&&(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||style.opacity==='0'))return null;
    const box=node.getBoundingClientRect();
    return box.width>0&&box.height>0?node:null;
  };
  const readDraft=target=>{
    if(!target.isContentEditable)return target.value;
    // Paragraph textContent drops all line breaks; paragraph innerText can
    // produce double separators. Reconstruct sibling blocks as draft lines.
    const children=Array.from(target.children||[]);
    if(children.length&&children.every(node=>node.tagName==='P'||node.tagName==='DIV')){
      return children.map(node=>{
        const text=typeof node.innerText==='string'?node.innerText:node.textContent;
        return text==='\n'?'':text;
      }).join('\n');
    }
    return typeof target.innerText==='string'?target.innerText:target.textContent;
  };
  const normalizeDraft=text=>text.replace(/\r\n?/gu,'\n').replace(/\u00a0/gu,' ');
  async function insert(row,event){
    if(event?.isTrusted!==true||!visible||disposed||paused||inserting||composing)return;
    // A second click after the first async operation completes must not
    // turn one rapid double-click into two edits with ambiguous side effects.
    const now=Date.now();
    if(lastAttemptId===row.id&&now-lastAttempt<700)return;
    lastAttemptId=row.id;lastAttempt=now;inserting=true;
    const location=win.location.href,token=epoch;
    try{
      // Recheck installation, exact origin, grant, enable and data before effect.
      const data=await api.storage.local.get(KEYS);
      if(token!==epoch||location!==win.location.href||!await allowedPromptSite({
        installed:data[SIDEBAR_TOOL_STORE],
        enabled:data[SIDEBAR_TOOL_ENABLE_STORE],epochs:data[TOOL_REVOCATION_EPOCHS_STORE],url:location
      }))throw Error('网站授权或页面身份已变化');
      const library=model.load(data[PROMPT_DATA_STORE]?.library);
      if(library.settings.webButtons!==true||
        !library.items.some(item=>item.id===row.id&&item.body===row.body&&item.enabled))throw Error('提示词已变化或停用');
      if(token!==epoch||location!==win.location.href)throw Error('页面已切换');
      const target=editor();
      if(!target)throw Error('找不到受支持的 ChatGPT 草稿编辑器');
      // Composition may have started while the async grant read was pending.
      // Return without focusing the editor or a fallback textarea.
      if(composing)return;
      const before=readDraft(target);
      if(typeof before!=='string')throw Error('编辑器无法确认当前草稿');
      target.focus();
      if(target.isContentEditable){
        const selection=doc.getSelection(),range=doc.createRange();
        if(!selection)throw Error('无法取得编辑器插入位置');
        range.selectNodeContents(target);range.collapse(false);
        selection.removeAllRanges();selection.addRange(range);
      }else if(typeof target.setSelectionRange==='function')target.setSelectionRange(before.length,before.length);
      // Use the browser's real editing command; never assign DOM draft values,
      // dispatch synthetic input events, click Send, or replace a selection.
      const insertion=(before.trim()? '\n':'')+row.body;
      if(!doc.execCommand('insertText',false,insertion))throw Error('编辑器未确认插入');
      const after=readDraft(target);
      // Check unchanged prefix, complete multiline suffix and ordering.
      // "includes(prompt)" would misreport success if it already existed.
      if(!target.isConnected||typeof after!=='string'||
        normalizeDraft(after)!==normalizeDraft(before+insertion))
        throw Error('草稿正文或换行未得到完整确认，请核对并手动复制');
      hideTip();showFeedback('已插入输入框，未发送。','success');
    }catch(error){
      if(!disposed&&!paused&&visible&&!composing&&token===epoch&&location===win.location.href&&host?.isConnected)
        await fallbackCopy(row.body,error.message);
    }
    finally{inserting=false;}
  }
  function render(){
    if(!visible)return;
    if(!host){
    host=doc.createElement('div');host.setAttribute('data-opendesk-prompts','');
    host.setAttribute('data-opendesk-prompts-anchor','conversation-region-r18');
      shadow=host.attachShadow({mode:'closed'});
      const style=doc.createElement('style');style.textContent=STYLE;
      rail=doc.createElement('nav');rail.className='rail';rail.setAttribute('aria-label','提示词快捷按钮');
      rail.addEventListener('scroll',schedule);
      tip=doc.createElement('aside');tip.className='tip';tip.id='opendesk-prompt-tooltip';tip.hidden=true;
      tip.setAttribute('tabindex','0');
      tip.addEventListener('mouseenter',()=>win.clearTimeout(hideTipTimer));
      tip.addEventListener('mouseleave',delayHideTip);
      tip.addEventListener('focusin',()=>win.clearTimeout(hideTipTimer));
      tip.addEventListener('focusout',delayHideTip);
      shadow.addEventListener('keydown',event=>{if(event.key==='Escape'){hideTip();if(feedback)feedback.hidden=true;}});
      feedback=doc.createElement('div');feedback.className='feedback';feedback.hidden=true;
      feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
      shadow.append(style,rail,tip,feedback);doc.documentElement.append(host);
    }
    rail.replaceChildren();
    const toggle=doc.createElement('button');toggle.type='button';toggle.className='fold';
    toggleButton=toggle;
    toggle.addEventListener('click',event=>{if(event.isTrusted===false)return;folded=!folded;schedule();});
    rail.append(toggle);
    for(const row of items){
      const button=doc.createElement('button');button.type='button';
      button.className='item';
      button.setAttribute('aria-label','插入提示词：'+row.name);
      button.title=row.name; // Full multiline details appear on focus/hover.
      for(const part of model.parts(row.label)){
        const span=doc.createElement('span');span.textContent=part;button.append(span);
      }
      button.addEventListener('mouseenter',()=>showTip(row,button));
      button.addEventListener('focus',()=>showTip(row,button));
      button.addEventListener('mouseleave',delayHideTip);
      button.addEventListener('blur',delayHideTip);
      button.addEventListener('click',event=>void insert(row,event));
      rail.append(button);
    }
    schedule();
  }
  async function refresh(){
    if(disposed||paused)return;
    const token=++epoch,url=win.location.href;href=url;
    try{
      const values=await api.storage.local.get(KEYS);
      const permitted=await allowedPromptSite({
        installed:values[SIDEBAR_TOOL_STORE],
        enabled:values[SIDEBAR_TOOL_ENABLE_STORE],epochs:values[TOOL_REVOCATION_EPOCHS_STORE],url
      });
      if(disposed||paused||token!==epoch)return;
      if(url!==win.location.href){void refresh();return;}
      if(!permitted){stop();return;}
      const library=model.load(values[PROMPT_DATA_STORE]?.library);
      if(!library.settings.webButtons){stop();return;}
      const rows=library.items.filter(item=>item.enabled);
      if(!rows.length){stop();return;}
      if(!resizeObserver&&win.ResizeObserver)resizeObserver=new win.ResizeObserver(schedule);
      items=rows;visible=true;render();
      if(!observer){
        observer=new win.MutationObserver(records=>{
          if(records.every(record=>record.target===host||host?.contains(record.target)))return;
          schedule();
        });
        observer.observe(doc.body||doc.documentElement,{subtree:true,childList:true,attributes:true,
          attributeFilter:['class','style','hidden','aria-hidden','inert']});
      }
    }catch{if(token===epoch)stop();}
  }
  const onStorage=(changes,area)=>{
    if(area!=='local'||!KEYS.some(key=>Object.hasOwn(changes,key)))return;
    epoch++;stop();void refresh();
  };
  const onCompositionStart=()=>{composing=true;};
  const onCompositionEnd=()=>{composing=false;};
  const onPageShow=()=>{paused=false;void refresh();};
  const onPageHide=event=>{epoch++;paused=true;stop();if(!event.persisted)dispose();};
  const onNav=()=>{if(href!==win.location.href)void refresh();else schedule();};
  function dispose(){
    if(disposed)return;disposed=true;epoch++;stop();
    win.clearInterval(locationTimer);
    api.storage.onChanged.removeListener(onStorage);
    win.removeEventListener('pageshow',onPageShow);win.removeEventListener('pagehide',onPageHide);
    win.removeEventListener('popstate',onNav);win.removeEventListener('resize',schedule);
    win.removeEventListener('scroll',schedule,true);
    doc.removeEventListener('transitionend',schedule,true);
    doc.removeEventListener('compositionstart',onCompositionStart,true);
    doc.removeEventListener('compositionend',onCompositionEnd,true);
    if(win[SLOT]===controller)delete win[SLOT];
  }
  api.storage.onChanged.addListener(onStorage);
  win.addEventListener('pageshow',onPageShow);win.addEventListener('pagehide',onPageHide);
  win.addEventListener('popstate',onNav);win.addEventListener('resize',schedule);
  win.addEventListener('scroll',schedule,true);
  doc.addEventListener('transitionend',schedule,true);
  doc.addEventListener('compositionstart',onCompositionStart,true);
  doc.addEventListener('compositionend',onCompositionEnd,true);
  locationTimer=win.setInterval(()=>{if(href!==win.location.href)void refresh();},1100);
  const controller=Object.freeze({dispose,refresh,diagnostics:()=>({visible,items:items.length})});
  Object.defineProperty(win,SLOT,{value:controller,configurable:true});
  if(doc.body)void refresh();else doc.addEventListener('DOMContentLoaded',()=>void refresh(),{once:true});
  return controller;
}
