import './model.js';
import {SIDEBAR_TOOL_STORE} from '../../../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,sidebarToolEnabled} from '../../../../src/ui/sidebar-tools/lifecycle.js';
import {PROMPT_ID,PROMPT_DATA_STORE,PROMPT_PICKER_PROTOCOL,supportedOrigin,allowedPromptSite,installedPromptTool} from './policy.js';
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
  if(!doc||!win||win.top!==win||!/^https?:\/\//i.test(win.location.href)||
    !api?.storage?.local?.get||!api.storage?.onChanged)return null;
  if(win[SLOT])return win[SLOT];
  let model=MODEL,disposed=false,paused=false,epoch=0,href=win.location.href,visible=false;
  let host=null,shadow=null,rail=null,tip=null,tipOwner=null,hideTipTimer=0,toggleButton=null;
  let feedback=null,items=[],observer=null,resizeObserver=null,layoutTimer=0;
  const observedRegions=new Set();
  let locationTimer=0,folded=false,narrowMode=null,composing=false,inserting=false,lastAttempt=0,lastAttemptId=null;
  let activeRule=null,picker=null;
  const PICK_BLOCK_EVENTS=['pointerdown','pointerup','pointercancel','mousedown','mouseup',
    'dblclick','auxclick','contextmenu','touchstart','touchend','touchcancel'];
  const removePickerGuides=entry=>{
    entry.outline?.remove();entry.label?.remove();entry.outline=null;entry.label=null;
  };
  const detachPicker=entry=>{
    if(!entry)return;
    win.clearTimeout(entry.guardTimer);entry.guardTimer=0;
    doc.removeEventListener('pointermove',entry.hover,true);
    for(const type of PICK_BLOCK_EVENTS)doc.removeEventListener(type,entry.block,true);
    doc.removeEventListener('click',entry.choose,true);
    doc.removeEventListener('keydown',entry.escape,true);
    doc.removeEventListener('keyup',entry.keyup,true);
    removePickerGuides(entry);entry.selectedNode=null;
  };
  const closePicker=()=>{
    if(!picker)return;
    detachPicker(picker);
    win.clearTimeout(picker.timer);picker=null;
  };
  const stop=()=>{
    visible=false;items=[];activeRule=null;closePicker();
    observer?.disconnect();observer=null;
    resizeObserver?.disconnect();resizeObserver=null;observedRegions.clear();
    win.clearTimeout(layoutTimer);layoutTimer=0;win.clearTimeout(hideTipTimer);hideTipTimer=0;
    host?.remove();host=null;rail=null;shadow=null;tip=null;tipOwner=null;toggleButton=null;
    feedback=null;narrowMode=null;folded=false;
  };

  // User selectors are inert CSS data. Match exactly one live, visible node.
  const one=selector=>{
    if(!MODEL.validSelector(selector)||typeof doc.querySelectorAll!=='function')return null;
    try{const found=doc.querySelectorAll(selector);return found.length===1?found[0]:null;}
    catch{return null;}
  };
  const available=node=>{
    if(!node?.isConnected||node.hidden||node.disabled||node.readOnly||
       node.closest?.('[hidden],[inert],[aria-hidden="true"],[data-opendesk-prompts],[role="dialog"],[aria-modal="true"]'))return false;
    const css=win.getComputedStyle?.(node);
    if(css&&(css.display==='none'||['hidden','collapse'].includes(css.visibility)||
       css.opacity==='0'))return false;
    const r=node.getBoundingClientRect?.();
    return Boolean(r&&r.width>0&&r.height>0&&r.left<win.innerWidth&&r.top<win.innerHeight&&
       r.left+r.width>0&&r.top+r.height>0);
  };
  const editorKind=node=>{
    if(!available(node))return null;
    const tag=String(node.tagName||'').toLowerCase();
    if(tag==='textarea')return 'textarea';
    if(tag==='input'){
      const type=String(node.type||node.getAttribute?.('type')||'text').toLowerCase();
      const auto=String(node.getAttribute?.('autocomplete')||'').toLowerCase();
      const identity=['name','id','aria-label','placeholder'].map(key=>
        String(node.getAttribute?.(key)||'').toLowerCase()).join(' ');
      if(type!=='text'||/password|cc-|one-time-code|credit-card|iban|bank|email|username/.test(auto)||
         /(?:^|[^a-z])(password|login|sign.?in|user.?name|one.?time.?code|credit.?card|payment|search)(?:$|[^a-z])/.test(identity)||
         node.closest?.('form[autocomplete="on"] input[type="password"]'))
        return null;
      return 'input';
    }
    if(node.getAttribute?.('contenteditable')==='true'&&node.isContentEditable)return 'richtext';
    return null;
  };
  const checkedEditor=()=>{
    const node=one(activeRule?.editorSelector);
    return node&&editorKind(node)?node:null;
  };
  const pickerSelector=node=>{
    if(!node||node===doc.documentElement||node===doc.body)return null;
    const tag=String(node.tagName||'').toLowerCase();
    if(!/^[a-z][a-z0-9-]{0,35}$/.test(tag))return null;
    const unique=sel=>{
      if(!MODEL.validSelector(sel))return false;
      try{const found=doc.querySelectorAll(sel);return found.length===1&&found[0]===node;}
      catch{return false;}
    };
    const id=node.getAttribute?.('id');
    if(typeof id==='string'&&/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(id)&&
       !/(?:^|[-_])(?:react|headlessui|radix|auto|generated)[-_]?\d/i.test(id)&&
       unique('#'+id))return '#'+id;
    for(const key of ['data-testid','data-test','data-cy','aria-label','placeholder','role']){
      const val=node.getAttribute?.(key);
      if(typeof val!=='string'||!/^[\p{L}\p{N}_ .-]{1,72}$/u.test(val))continue;
      const selector='['+key+'="'+val+'"]';
      if(unique(selector))return selector;
      if(unique(tag+selector))return tag+selector;
    }
    if(unique(tag))return tag;
    for(let parent=node.parentElement,depth=0;parent&&depth<4;parent=parent.parentElement,depth++){
      const pid=parent.getAttribute?.('id');
      if(typeof pid==='string'&&/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(pid)){
        const scoped='#'+pid+' '+tag;
        if(unique(scoped))return scoped;
      }
      for(const key of ['data-testid','role']){
        const value=parent.getAttribute?.(key);
        if(typeof value!=='string'||!/^[\p{L}\p{N}_ .-]{1,72}$/u.test(value))continue;
        const scoped='['+key+'="'+value+'"] '+tag;
        if(unique(scoped))return scoped;
      }
    }
    return null;
  };
  const pickerCandidate=(target,kind)=>{
    for(let node=target;node&&node!==doc.documentElement;node=node.parentElement){
      if(!available(node))continue;
      if(kind==='editor'){
        if(!editorKind(node))continue;
        if(node.getAttribute?.('contenteditable')==='true'||
           ['input','textarea'].includes(String(node.tagName||'').toLowerCase()))
          return pickerSelector(node)?node:null;
      }else{
        const box=node.getBoundingClientRect?.();
        if(box?.width>=200&&box?.height>=90&&
           !['input','textarea','button'].includes(String(node.tagName||'').toLowerCase())&&
           pickerSelector(node))return node;
      }
    }
    return null;
  };


  const startPicker=(kind,session)=>{
    closePicker();
    const outline=doc.createElement('div'),label=doc.createElement('div');
    Object.assign(outline.style,{pointerEvents:'none',position:'fixed',zIndex:'2147483646',
      border:'3px solid #365eda',background:'#365eda1a',boxSizing:'border-box',display:'none'});
    Object.assign(label.style,{pointerEvents:'none',position:'fixed',zIndex:'2147483647',
      top:'10px',left:'10px',padding:'8px 11px',borderRadius:'8px',background:'#253b74',
      color:'#fff',font:'13px system-ui,sans-serif'});
    label.textContent=kind==='editor'?'选择目标文本输入框 · Esc 取消':'选择按钮所依附的大区域 · Esc 取消';
    label.setAttribute('aria-hidden','true');
    (doc.documentElement||doc.body).append(outline,label);
    const entry={kind,session,state:'selecting',selected:null,expiresAt:Date.now()+65000,
      outline,label,hover:null,block:null,choose:null,escape:null,timer:0,guardTimer:0,selectedAt:0,selectedNode:null,keyup:null,lastHover:0};
    entry.hover=event=>{
      if(event.isTrusted===false||picker!==entry||entry.state!=='selecting'||
          Date.now()-entry.lastHover<45)return;
      entry.lastHover=Date.now();
      const node=pickerCandidate(event.target,kind);
      if(!node){outline.style.display='none';return;}
      const rect=node.getBoundingClientRect();
      Object.assign(outline.style,{display:'block',left:Math.round(rect.left)+'px',
        top:Math.round(rect.top)+'px',width:Math.round(rect.width)+'px',
        height:Math.round(rect.height)+'px'});
    };
    const isPickedTarget=event=>entry.selectedNode&&
      (event.target===entry.selectedNode||entry.selectedNode.contains?.(event.target));
    entry.block=event=>{
      if(picker!==entry||event.isTrusted===false)return;
      if(entry.state!=='selecting'&&!(entry.state==='selected'&&
         Date.now()-entry.selectedAt<750&&isPickedTarget(event)))return;
      // Touch default must remain available for a final synthesized click.
      if(event.cancelable!==false&&!String(event.type||'').startsWith('touch'))
        event.preventDefault();
      event.stopImmediatePropagation?.();
    };
    entry.choose=event=>{
      if(picker!==entry||event.isTrusted===false)return;
      if(entry.state==='selected'){
        if(Date.now()-entry.selectedAt<750&&isPickedTarget(event)){
          event.preventDefault();event.stopImmediatePropagation?.();
        }
        return;
      }
      if(entry.state!=='selecting')return;
      event.preventDefault();event.stopImmediatePropagation?.();
      const node=pickerCandidate(event.target,kind),selector=pickerSelector(node);
      if(!node||!selector){
        label.textContent='未找到唯一、稳定的目标，请尝试选择其他区域';
        return;
      }
      entry.selected={selector,editorType:kind==='editor'?editorKind(node):null};
      entry.selectedNode=node;entry.selectedAt=Date.now();entry.state='selected';
      doc.removeEventListener('pointermove',entry.hover,true);
      removePickerGuides(entry);
      // Guard late second clicks/dblclicks even after the first selected click.
      entry.guardTimer=win.setTimeout(()=>{
        if(picker===entry&&entry.state==='selected')detachPicker(entry);
      },750);
    };
    entry.escape=event=>{
      if(picker!==entry||entry.state!=='selecting'||event.isTrusted===false)return;
      event.preventDefault();event.stopImmediatePropagation?.();
      if(event.key==='Escape'){entry.state='cancelled';detachPicker(entry);}
    };
    entry.keyup=event=>{
      if(picker!==entry||entry.state!=='selecting'||event.isTrusted===false)return;
      event.preventDefault();event.stopImmediatePropagation?.();
    };
    picker=entry;
    doc.addEventListener('pointermove',entry.hover,true);
    for(const type of PICK_BLOCK_EVENTS)
      doc.addEventListener(type,entry.block,type.startsWith('touch')?
        {capture:true,passive:false}:true);
    doc.addEventListener('click',entry.choose,true);
    doc.addEventListener('keydown',entry.escape,true);
    doc.addEventListener('keyup',entry.keyup,true);
    entry.timer=win.setTimeout(closePicker,66000);
    return {state:'selecting',session};
  };
  const checkRule=input=>{
    const rule=MODEL.siteRule(input),here=new URL(win.location.href);
    if(rule.origin!==here.origin||
       !(rule.pathScope==='/'||here.pathname===rule.pathScope||
         here.pathname.startsWith(rule.pathScope.endsWith('/')?rule.pathScope:rule.pathScope+'/')))
      throw Error('当前页面不在该网站规则的路径范围内');
    const container=one(rule.containerSelector),target=one(rule.editorSelector);
    const box=container?.getBoundingClientRect?.(),kind=editorKind(target);
    if(!container||!available(container)||!box||box.width<200||box.height<90)
      throw Error('容器必须唯一匹配，且尺寸合理、在当前页面可见');
    if(!target||!kind)
      throw Error('输入框必须唯一匹配且是安全、可编辑的文本字段');
    return {valid:true,containerMatches:1,editorMatches:1,editorType:kind,origin:here.origin};
  };

  const mainRegion=()=>{
    if(activeRule){
      const node=one(activeRule.containerSelector);
      if(!available(node))return null;
      const rect=node.getBoundingClientRect();
      return rect.width>=200&&rect.height>=90?{left:rect.left,top:rect.top,
        width:rect.width,height:rect.height}:null;
    }
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
    const rect=mainRegion();if(!rect||(activeRule&&!checkedEditor())){host.hidden=true;return;}
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
      showFeedback(reason==='单行输入框不支持多行提示词'?
        '当前是单行输入框，不支持换行；已复制完整提示词，请改用多行编辑器。':
        reason==='编辑器剩余长度不足，已取消插入'?
        '输入框长度不足；已复制完整提示词，未修改原草稿。':
        reason?
        '编辑器插入未确认；已复制完整提示词。请先检查草稿再粘贴，避免重复。':
        '已复制提示词，可直接粘贴。','success');
    }catch(error){
      showFeedback('插入失败，复制也失败：'+(error?.message||'剪贴板访问被拒绝')+
        '。请检查网页与剪贴板权限后重试。','error');
    }
  };
  const editor=()=>{
    if(activeRule)return checkedEditor();
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
        installed:data[SIDEBAR_TOOL_STORE],enabled:data[SIDEBAR_TOOL_ENABLE_STORE],
        epochs:data[TOOL_REVOCATION_EPOCHS_STORE],url:location,
        sites:supportedOrigin(location)?null:MODEL.sitesLoad(data[PROMPT_DATA_STORE]?.sites)
      }))throw Error('网站授权或页面身份已变化');
      const library=model.load(data[PROMPT_DATA_STORE]?.library);
      if(library.settings.webButtons!==true||
        !library.items.some(item=>item.id===row.id&&item.body===row.body&&item.enabled))throw Error('提示词已变化或停用');
      if(token!==epoch||location!==win.location.href)throw Error('页面已切换');
      const target=editor();
      if(!target)throw Error('找不到唯一且受支持的网页草稿编辑器，请重新验证网站选择器');
      // Composition may have started while the async grant read was pending.
      // Return without focusing the editor or a fallback textarea.
      if(composing)return;
      const before=readDraft(target);
      if(typeof before!=='string')throw Error('编辑器无法确认当前草稿');
      const singleLine=String(target.tagName||'').toLowerCase()==='input';
      if(singleLine&&/[\r\n\u2028\u2029]/u.test(row.body))
        throw Error('单行输入框不支持多行提示词');
      const insertion=(before.trim()?(singleLine?' ':'\n'):'')+row.body;
      if(!target.isContentEditable&&Number.isInteger(target.maxLength)&&
         target.maxLength>=0&&before.length+insertion.length>target.maxLength)
        throw Error('编辑器剩余长度不足，已取消插入');
      target.focus();
      if(target.isContentEditable){
        const selection=doc.getSelection(),range=doc.createRange();
        if(!selection)throw Error('无法取得编辑器插入位置');
        range.selectNodeContents(target);range.collapse(false);
        selection.removeAllRanges();selection.addRange(range);
      }else if(typeof target.setSelectionRange==='function')target.setSelectionRange(before.length,before.length);
      // Use the browser's real editing command; never assign DOM draft values,
      // dispatch synthetic input events, click Send, or replace a selection.
      if(!doc.execCommand('insertText',false,insertion))throw Error('编辑器未确认插入');
      // Wait for a framework-controlled editor to commit or reject the DOM
      // edit before confirming. Never retry an unknown effect automatically.
      if(activeRule)await new Promise(resolve=>win.setTimeout(resolve,90));
      if(token!==epoch||location!==win.location.href)throw Error('页面身份在写入期间变化');
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
    closePicker();
    const token=++epoch,url=win.location.href;href=url;
    try{
      const values=await api.storage.local.get(KEYS);
      const sites=supportedOrigin(url)?null:MODEL.sitesLoad(values[PROMPT_DATA_STORE]?.sites);
      const permitted=await allowedPromptSite({
        installed:values[SIDEBAR_TOOL_STORE],
        enabled:values[SIDEBAR_TOOL_ENABLE_STORE],epochs:values[TOOL_REVOCATION_EPOCHS_STORE],
        url,sites
      });
      if(disposed||paused||token!==epoch)return;
      if(url!==win.location.href){void refresh();return;}
      if(!permitted){stop();return;}
      activeRule=supportedOrigin(url)?null:MODEL.siteFor(sites,url);
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
    api.runtime?.onMessage?.removeListener(onPickerMessage);
    win.removeEventListener('pageshow',onPageShow);win.removeEventListener('pagehide',onPageHide);
    win.removeEventListener('popstate',onNav);win.removeEventListener('resize',schedule);
    win.removeEventListener('scroll',schedule,true);
    doc.removeEventListener('transitionend',schedule,true);
    doc.removeEventListener('compositionstart',onCompositionStart,true);
    doc.removeEventListener('compositionend',onCompositionEnd,true);
    if(win[SLOT]===controller)delete win[SLOT];
  }

  // Existing trusted tab/document messaging, never executable sandbox JS.
  // Only the extension's Side Panel may request the bounded picker protocol.
  const onPickerMessage=(message,sender,respond)=>{
    if(message?.protocol!==PROMPT_PICKER_PROTOCOL)return false;
    const ownUrl=api.runtime?.getURL?.('');
    if(!ownUrl||sender?.id!==api.runtime.id||typeof sender.url!=='string'||
       !sender.url.startsWith(ownUrl)){
      respond({ok:false,error:'E_SENDER'});return false;
    }
    if(message.toolId!==PROMPT_ID||message.expectedUrl!==win.location.href||
       !['prompt.page.pick.start','prompt.page.pick.status','prompt.page.pick.cancel','prompt.page.check'].includes(message.operation)){
      respond({ok:false,error:'E_DOCUMENT_CHANGED'});return false;
    }
    void (async()=>{
      if(disposed||paused)throw Error('页面已暂停');
      const values=await api.storage.local.get(KEYS);
      if(!installedPromptTool(values[SIDEBAR_TOOL_STORE])||
         !sidebarToolEnabled(values[SIDEBAR_TOOL_ENABLE_STORE],PROMPT_ID))
        throw Error('工具已卸载或停用');
      if(disposed||paused||message.expectedUrl!==win.location.href)
        throw Error('文档身份已经发生变化');
      if(message.operation==='prompt.page.check')return checkRule(message.rule);
      if(message.operation==='prompt.page.pick.start'){
        if(!['container','editor'].includes(message.kind)||typeof message.session!=='string'||
           !/^[a-f0-9-]{24,64}$/.test(message.session))throw Error('无效的元素选取请求');
        return startPicker(message.kind,message.session);
      }
      if(!picker||picker.session!==message.session)throw Error('元素选取不再有效');
      if(message.operation==='prompt.page.pick.cancel'){closePicker();return {state:'cancelled'};}
      if(Date.now()>picker.expiresAt){closePicker();return {state:'expired'};}
      return {state:picker.state,session:picker.session,...(picker.selected||{})};
    })().then(data=>respond({ok:true,data}),error=>respond({
      ok:false,error:String(error?.message||error).slice(0,200)
    }));
    return true;
  };

  api.runtime?.onMessage?.addListener(onPickerMessage);
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
