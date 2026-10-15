import './model.js';
import {SIDEBAR_TOOL_STORE} from '../../../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../../../src/ui/sidebar-tools/lifecycle.js';
import {PROMPT_ID,PROMPT_SITE_STORE,PROMPT_DATA_STORE,supportedOrigin,allowedPromptSite} from './policy.js';
const MODEL=globalThis.OpenDeskPromptShortcutsModel;
const SLOT='__openDeskPromptShortcutsPageV1';
const STYLE=String.raw`
:host{all:initial;position:fixed;z-index:2147483600;pointer-events:none;color-scheme:light;font:13px/1.4 system-ui,sans-serif}
:host([hidden]){display:none!important}
.rail{pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:6px;max-height:min(68vh,420px);overflow-y:auto;overflow-x:hidden;width:48px;padding:5px;border:1px solid #d9dbe2;border-radius:14px;background:#fffefb;box-shadow:0 5px 20px #0002;scrollbar-width:thin}
button{font:inherit;cursor:pointer;color:#293549;background:#f9fafb;border:1px solid #d9dbe2;border-radius:10px;outline-offset:2px;box-sizing:border-box}
button:focus-visible{outline:2px solid #2563eb}
button:hover{background:#eff5ff;border-color:#2563eb}
.item{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:38px;height:38px;min-height:38px;padding:3px;font-weight:700;font-size:12px;line-height:1.04}
.round{border-radius:50%}.fold{display:none}.narrow .fold{display:block;min-height:36px;width:38px}
.narrow.folded .item{display:none}
.tip{pointer-events:auto;position:absolute;left:55px;top:0;width:min(350px,calc(100vw - 90px));max-height:min(68vh,340px);overflow:auto;background:#fff;color:#263347;border:1px solid #ccd2df;border-radius:12px;box-shadow:0 8px 28px #0003;padding:12px;overflow-wrap:anywhere}
.tip strong{display:block;margin-bottom:8px}
.tip pre{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;margin:0;font:12px/1.55 system-ui,sans-serif}
.fallback{pointer-events:auto;position:absolute;left:55px;top:0;width:min(350px,calc(100vw - 90px));max-height:55vh;overflow:auto;background:#fff;color:#263347;border:1px solid #ccd2df;border-radius:12px;box-shadow:0 8px 28px #0003;padding:12px}
.fallback textarea{display:block;width:100%;min-height:120px;box-sizing:border-box;margin:8px 0;resize:vertical;white-space:pre-wrap}
.fallback button{padding:6px 10px;margin-right:8px}
`;
const KEYS=[SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,
  PROMPT_SITE_STORE,PROMPT_DATA_STORE];
export function initPromptShortcuts({api=globalThis.chrome,doc=globalThis.document,win=globalThis.window}={}){
  if(!doc||!win||win.top!==win||!supportedOrigin(win.location.href)||
    !api?.storage?.local?.get||!api.storage?.onChanged)return null;
  if(win[SLOT])return win[SLOT];
  let model=MODEL,disposed=false,paused=false,epoch=0,href=win.location.href,visible=false;
  let host=null,shadow=null,rail=null,tip=null,fallback=null,items=[],observer=null,layoutTimer=0;
  let locationTimer=0,folded=false,composing=false,inserting=false;
  const stop=()=>{
    visible=false;items=[];observer?.disconnect();observer=null;
    win.clearTimeout(layoutTimer);layoutTimer=0;
    host?.remove();host=null;rail=null;shadow=null;tip=null;fallback=null;
  };
  const mainRegion=()=>{
    const node=doc.querySelector('main#main')||doc.querySelector('main');
    if(!node||!node.isConnected)return null;
    const rect=node.getBoundingClientRect();
    return rect.width>=200&&rect.height>=160?rect:null;
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
    const narrow=rect.width<560;
    rail.classList.toggle('narrow',narrow);rail.classList.toggle('folded',narrow&&folded);
  };
  const schedule=()=>{if(!layoutTimer)layoutTimer=win.setTimeout(layout,120);};
  const hideTip=()=>{if(tip)tip.hidden=true;};
  const showTip=(row)=>{
    if(!tip||!host||!host.isConnected)return;
    tip.replaceChildren();
    const title=doc.createElement('strong'),content=doc.createElement('pre');
    title.textContent=row.name;content.textContent=row.body;
    tip.append(title,content);tip.hidden=false;
    if(fallback)fallback.hidden=true;
  };
  const fallbackCopy=(body,reason)=>{
    if(!fallback)return;
    hideTip();fallback.replaceChildren();
    const title=doc.createElement('strong'),note=doc.createElement('p');
    title.textContent='手动复制完整提示词';
    note.textContent=(reason||'编辑器未确认文本插入。')+' 请先核对草稿中是否已有部分内容，避免重复粘贴。未自动发送。';
    const textarea=doc.createElement('textarea');textarea.readOnly=true;textarea.value=body;
    const copy=doc.createElement('button');copy.type='button';copy.textContent='复制';
    copy.addEventListener('click',event=>{
      if(event.isTrusted!==true)return;
      if(!win.navigator.clipboard?.writeText){textarea.focus();textarea.select();return;}
      void win.navigator.clipboard.writeText(body).then(()=>{note.textContent='已复制完整正文，可粘贴到聊天输入框。';})
        .catch(()=>{textarea.focus();textarea.select();note.textContent='请选择并手动复制正文。';});
    });
    const close=doc.createElement('button');close.type='button';close.textContent='关闭';
    close.addEventListener('click',()=>{fallback.hidden=true;});
    fallback.append(title,note,textarea,copy,close);fallback.hidden=false;
    textarea.focus();textarea.select();
  };
  const editor=()=>{
    const node=doc.querySelector('main #prompt-textarea[contenteditable="true"],main [data-testid="composer-text-input"][contenteditable="true"],main textarea#prompt-textarea');
    if(!node||!node.isConnected||node.closest('[data-opendesk-prompts]'))return null;
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
    inserting=true;
    const location=win.location.href,token=epoch;
    try{
      // Recheck installation, exact origin, grant, enable and data before effect.
      const data=await api.storage.local.get(KEYS);
      if(token!==epoch||location!==win.location.href||!await allowedPromptSite({
        installed:data[SIDEBAR_TOOL_STORE],grants:data[PROMPT_SITE_STORE],
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
      hideTip();if(fallback)fallback.hidden=true;
    }catch(error){fallbackCopy(row.body,error.message);}
    finally{inserting=false;}
  }
  function render(){
    if(!visible)return;
    if(!host){
      host=doc.createElement('div');host.setAttribute('data-opendesk-prompts','');
      shadow=host.attachShadow({mode:'closed'});
      const style=doc.createElement('style');style.textContent=STYLE;
      rail=doc.createElement('nav');rail.className='rail';rail.setAttribute('aria-label','提示词快捷按钮');
      tip=doc.createElement('aside');tip.className='tip';tip.id='opendesk-prompt-tooltip';tip.hidden=true;
      fallback=doc.createElement('aside');fallback.className='fallback';fallback.hidden=true;
      shadow.append(style,rail,tip,fallback);doc.documentElement.append(host);
    }
    rail.replaceChildren();
    const toggle=doc.createElement('button');toggle.type='button';toggle.className='fold';
    toggle.textContent=folded?'展开':'收起';toggle.setAttribute('aria-label',folded?'展开提示词按钮栏':'收起提示词按钮栏');
    toggle.addEventListener('click',()=>{folded=!folded;schedule();});
    rail.append(toggle);
    for(const row of items){
      const button=doc.createElement('button');button.type='button';
      button.className='item'+(row.shape==='round'?' round':'');
      button.setAttribute('aria-label','插入提示词：'+row.name);
      button.setAttribute('aria-describedby',tip.id);
      button.title=row.name; // Full multiline text is available through hover/focus panel.
      for(const part of model.parts(row.label)){
        const span=doc.createElement('span');span.textContent=part;button.append(span);
      }
      button.addEventListener('mouseenter',()=>showTip(row));
      button.addEventListener('focus',()=>showTip(row));
      button.addEventListener('mouseleave',()=>{if(shadow.activeElement!==button)hideTip();});
      button.addEventListener('blur',()=>{if(!tip.matches(':hover'))hideTip();});
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
        installed:values[SIDEBAR_TOOL_STORE],grants:values[PROMPT_SITE_STORE],
        enabled:values[SIDEBAR_TOOL_ENABLE_STORE],epochs:values[TOOL_REVOCATION_EPOCHS_STORE],url
      });
      if(disposed||paused||token!==epoch)return;
      if(url!==win.location.href){void refresh();return;}
      if(!permitted){stop();return;}
      const library=model.load(values[PROMPT_DATA_STORE]?.library);
      if(!library.settings.webButtons){stop();return;}
      const rows=library.items.filter(item=>item.enabled);
      if(!rows.length){stop();return;}
      items=rows;visible=true;render();
      if(!observer){
        observer=new win.MutationObserver(records=>{
          if(records.every(record=>record.target===host||host?.contains(record.target)))return;
          schedule();
        });
        observer.observe(doc.body||doc.documentElement,{subtree:true,childList:true,attributes:true,
          attributeFilter:['class','style','hidden']});
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
    doc.removeEventListener('compositionstart',onCompositionStart,true);
    doc.removeEventListener('compositionend',onCompositionEnd,true);
    if(win[SLOT]===controller)delete win[SLOT];
  }
  api.storage.onChanged.addListener(onStorage);
  win.addEventListener('pageshow',onPageShow);win.addEventListener('pagehide',onPageHide);
  win.addEventListener('popstate',onNav);win.addEventListener('resize',schedule);
  doc.addEventListener('compositionstart',onCompositionStart,true);
  doc.addEventListener('compositionend',onCompositionEnd,true);
  locationTimer=win.setInterval(()=>{if(href!==win.location.href)void refresh();},1100);
  const controller=Object.freeze({dispose,refresh,diagnostics:()=>({visible,items:items.length})});
  Object.defineProperty(win,SLOT,{value:controller,configurable:true});
  if(doc.body)void refresh();else doc.addEventListener('DOMContentLoaded',()=>void refresh(),{once:true});
  return controller;
}
