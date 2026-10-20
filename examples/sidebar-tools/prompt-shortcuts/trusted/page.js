import './model.js';
import {ANALYTICS_PROTOCOL,ANALYTICS_PAGE_SCOPE_CHECK} from '../../../../src/analytics/contract.js';
import {SIDEBAR_TOOL_STORE} from '../../../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,sidebarToolEnabled} from '../../../../src/ui/sidebar-tools/lifecycle.js';
import {PROMPT_ID,PROMPT_DATA_STORE,PROMPT_PICKER_PROTOCOL,supportedOrigin,allowedPromptSite,installedPromptTool} from './policy.js';
import {PROMPT_RAIL_OPEN_PROTOCOL} from './rail-open.js';
import {installJumpToTop} from '../../../programs/chatgpt-jump-top/src/conversation.js';
import {deepSeekConversation,findDeepSeekBindings} from './conversation-sites.js';
const MODEL=globalThis.OpenDeskPromptShortcutsModel;
const builtInPage=url=>Boolean(supportedOrigin(url)||MODEL.builtinSite(url));
const SLOT='__openDeskPromptShortcutsPageV1';
const STYLE=String.raw`
:host{all:initial;position:fixed;z-index:2147483600;pointer-events:none;color-scheme:light;font:13px/1.4 system-ui,sans-serif;
 --od-rail-bg:#fff;--od-rail-border:#e9e9eb;--od-rail-shadow:0 6px 24px #18243b15;
 --od-button-bg:#f4f5f7;--od-button-fg:#303642;--od-button-hover:#e9edf7;--od-focus:#3b6ff5;
 --od-pop-bg:#fff;--od-pop-fg:#263347;--od-pop-border:#d9dbe2}
:host(.dark){color-scheme:dark;--od-rail-bg:#303239;--od-rail-border:#383838;--od-rail-shadow:0 8px 26px #0005;
 --od-button-bg:#444851;--od-button-fg:#f4f5f8;--od-button-hover:#525866;--od-focus:#91b0ff;
 --od-pop-bg:#20242b;--od-pop-fg:#ebedf1;--od-pop-border:#373c45}
:host([hidden]){display:none!important}
.rail{pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:5px;
 max-height:min(248px,calc(100vh - 16px));overflow-y:auto;overflow-x:hidden;
 width:max-content;max-width:calc(100vw - 16px);padding:6px;border-radius:17px;
 background:var(--od-rail-bg);border:1px solid var(--od-rail-border);
 box-shadow:var(--od-rail-shadow);scrollbar-width:thin;overscroll-behavior:contain;box-sizing:border-box}
.rail.horizontal{flex-direction:row;max-height:none;overflow-x:auto;overflow-y:hidden;max-width:calc(100vw - 16px)}
.rail{--ps-image-width:68px;--ps-image-height:48px}
.rail[data-image-size="compact"]{--ps-image-width:48px;--ps-image-height:40px}
.rail[data-image-size="standard"]{--ps-image-width:56px;--ps-image-height:44px}
.item.image{width:var(--ps-image-width);min-width:var(--ps-image-width);
  height:var(--ps-image-height);min-height:var(--ps-image-height);padding:0;border-radius:10px;overflow:hidden}
.item.image img{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none}
button{font:inherit;cursor:pointer;color:var(--od-button-fg);background:var(--od-button-bg);
 border:1px solid transparent;border-radius:11px;outline-offset:2px;box-sizing:border-box;
 box-shadow:none;user-select:none}
button:focus-visible{outline:2px solid var(--od-focus)}
button:hover{background:var(--od-button-hover);border-color:#a4b9ef66}
button:active{transform:scale(.95)}
.item,.brand{display:flex;flex:none;flex-direction:column;align-items:center;justify-content:center;
 gap:2px;width:38px;height:38px;min-width:38px;min-height:38px;padding:3px;
 font-weight:700;font-size:13px;line-height:1.05}
.brand{background:#336bf4;border-color:#2c60dc;color:#fff;font-size:12px;
 font-weight:850;letter-spacing:-.8px}
.brand:hover{background:#245de8;border-color:#245de8}
.tip{pointer-events:auto;position:absolute;left:64px;top:0;width:248px;
 max-width:calc(100vw - 24px);max-height:min(240px,calc(100vh - 24px));
 overflow:auto;overscroll-behavior:contain;background:var(--od-pop-bg);color:var(--od-pop-fg);
 border:1px solid var(--od-pop-border);border-radius:13px;box-shadow:0 10px 32px #00000028;
 padding:13px 15px;overflow-wrap:anywhere}
.tip strong{display:block;margin-bottom:8px;font-size:13px}
.tip pre{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;margin:0;font:12px/1.7 system-ui,sans-serif}
.feedback{pointer-events:none;position:absolute;left:64px;top:0;width:min(300px,calc(100vw - 24px));
 background:var(--od-pop-bg);color:var(--od-pop-fg);border:1px solid var(--od-pop-border);
 border-radius:10px;box-shadow:0 7px 20px #0000001b;
 padding:10px 38px 10px 12px;font:12px/1.55 system-ui,sans-serif;overflow-wrap:anywhere}
.feedback button{pointer-events:auto;position:absolute;right:4px;top:4px;width:28px;height:28px;
 min-height:28px;display:grid;place-items:center;padding:0;background:transparent;color:inherit;
 border:0;border-radius:6px;box-shadow:none;font:20px/1 system-ui,sans-serif}
.feedback[data-kind="error"]{color:#b94b5c;border-color:#d79ba6}
.feedback[data-kind="success"]{color:#157255;border-color:#9accbc}
.feedback[hidden]{display:none!important}
.announcer{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;
 clip:rect(0,0,0,0)!important;white-space:nowrap!important;pointer-events:none!important}
`;
const KEYS=[SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,
  PROMPT_DATA_STORE];
export function initPromptShortcuts({api=globalThis.chrome,doc=globalThis.document,win=globalThis.window}={}){
  if(!doc||!win||win.top!==win||!/^https?:\/\//i.test(win.location.href)||
    !api?.storage?.local?.get||!api.storage?.onChanged)return null;
  let runtimeId;
  try{runtimeId=api.runtime?.id;}catch{return null;}
  if(!runtimeId)return null;
  if(win[SLOT])return win[SLOT];
  let model=MODEL,disposed=false,paused=false,epoch=0,href=win.location.href,visible=false;
  const runtimeCurrent=()=>{
    if(disposed)return false;
    try{if(api.runtime?.id===runtimeId)return true;}catch{}
    // A reloaded extension can leave this context's DOM and timers alive.
    dispose();return false;
  };
  let host=null,shadow=null,rail=null,tip=null,tipOwner=null,hideTipTimer=0;
  let feedback=null,announcer=null,feedbackTimer=0,feedbackToken=0;
  let items=[],imageSize='large',observer=null,observedRoot=null,resizeObserver=null,layoutTimer=0;
  const observedRegions=new Set();
  const themeMedia=win.matchMedia?.('(prefers-color-scheme: dark)');
  let locationTimer=0,retryTimer=0,readFailures=0;
  let composing=false,inserting=false,lastAttempt=0,lastAttemptId=null;
  let activeRule=null,picker=null;
  let jump=null,jumpRoot=null,releaseJump=null;
  const stopJump=()=>{
    jump?.dispose();jump=null;jumpRoot=null;
    releaseJump?.();releaseJump=null;
  };
  const syncJump=()=>{
    const deepSeek=activeRule&&deepSeekConversation(win.location.href);
    if(!supportedOrigin(win.location.href)&&!deepSeek){stopJump();return;}
    if(jump&&jumpRoot===doc.documentElement)return;
    stopJump();
    const root=doc.documentElement,token=epoch,url=win.location.href;
    let alive=true;
    const resources=new Set();
    const current=()=>runtimeCurrent()&&alive&&!paused&&visible&&token===epoch&&
      url===win.location.href&&root===doc.documentElement;
    const track=cleanup=>{
      resources.add(cleanup);
      return ()=>{if(resources.delete(cleanup))cleanup();};
    };
    // Adapt the existing adapter's lifetime, not the USER_SCRIPT entry or its
    // Authority. The scrolling algorithm remains one statically audited source.
    const owner={
      on(target,type,callback,options){
        const wrapped=event=>{
          if(!current())return;
          if(type!=='click'){callback(event);return;}
          event.preventDefault();event.stopPropagation();
          if(event.isTrusted!==true)return;
          void api.storage.local.get(KEYS).then(async values=>{
            const permitted=await allowedPromptSite({
              installed:values[SIDEBAR_TOOL_STORE],enabled:values[SIDEBAR_TOOL_ENABLE_STORE],url,
              sites:supportedOrigin(url)?null:model.sitesLoad(values[PROMPT_DATA_STORE]?.sites)
            });
            if(!current())return;
            const sameRule=!deepSeek||JSON.stringify(model.siteFor(values[PROMPT_DATA_STORE]?.sites,url))===
              JSON.stringify(activeRule);
            if(!permitted||!sameRule||!model.load(values[PROMPT_DATA_STORE]?.library).settings.webButtons){
              stopJump();return;
            }
            callback(event);
          }).catch(()=>{if(current())stopJump();});
        };
        target.addEventListener(type,wrapped,options);
        return track(()=>target.removeEventListener(type,wrapped,options));
      },
      observe(target,callback,options){
        const observer=new win.MutationObserver(records=>{if(current())callback(records);});
        observer.observe(target,options);track(()=>observer.disconnect());return observer;
      },
      setTimeout(callback,delay){
        const cancel=()=>win.clearTimeout(timer);
        const timer=win.setTimeout(()=>{resources.delete(cancel);if(current())callback();},delay);
        track(cancel);return timer;
      },
      onDispose:track
    };
    releaseJump=()=>{
      alive=false;
      for(const cleanup of [...resources]){resources.delete(cleanup);cleanup();}
    };
    jumpRoot=root;
    try{jump=installJumpToTop({doc,win,owner,...(deepSeek?{
      regionSelector:activeRule.containerSelector,
        resolveBindings:()=>checkedEditor()?findDeepSeekBindings(doc,win,siteContainer()):[]
    }:{})});}catch(error){stopJump();throw error;}
  };
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
  const clearFeedback=()=>{
    win.clearTimeout(feedbackTimer);feedbackTimer=0;feedbackToken++;
    if(feedback){feedback.hidden=true;feedback.replaceChildren();feedback.textContent='';}
    if(announcer)announcer.textContent='';
  };
  const stop=()=>{
    stopJump();
    visible=false;items=[];activeRule=null;closePicker();clearFeedback();
    observer?.disconnect();observer=null;observedRoot=null;
    resizeObserver?.disconnect();resizeObserver=null;observedRegions.clear();
    win.clearTimeout(layoutTimer);layoutTimer=0;win.clearTimeout(hideTipTimer);hideTipTimer=0;
    win.clearTimeout(retryTimer);retryTimer=0;
    host?.remove();host=null;rail=null;shadow=null;tip=null;tipOwner=null;
    feedback=null;announcer=null;
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
    if(node.isContentEditable&&['true','plaintext-only'].includes(
      node.getAttribute?.('contenteditable')))return 'richtext';
    return null;
  };
  const siteContainer=()=>{
    const root=one(activeRule?.containerSelector);
    if(activeRule?.builtin!=='deepseek'||!root)return root;
    // DeepSeek has no main landmark. Find the common transcript/composer column
    // from the real structure instead of pinning its generated CSS class.
    const node=one(activeRule.editorSelector);
    const messages=Array.from(root.querySelectorAll?.('.ds-message')||[]);
    if(!node||!root.contains(node)||!messages.length)return root;
    for(let parent=node.parentElement;parent&&parent!==root;parent=parent.parentElement){
      if(messages.every(message=>parent.contains(message)))return parent;
    }
    return root;
  };
  const checkedEditor=()=>{
    const container=siteContainer();
    const node=one(activeRule?.editorSelector);
    // A previously tested selector can retarget after SPA/React reconciliation.
    // Never write into an editor outside the user's chosen button region.
    return container&&available(container)&&node&&container.contains?.(node)&&
      editorKind(node)?node:null;
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
    for(const key of ['data-testid','data-test','data-cy','aria-label','placeholder','name','role']){
      const val=node.getAttribute?.(key);
      if(typeof val!=='string'||!/^[\p{L}\p{N}_ .-]{1,72}$/u.test(val))continue;
      const selector='['+key+'="'+val+'"]';
      if(unique(selector))return selector;
      if(unique(tag+selector))return tag+selector;
    }
    const editableValue=node.getAttribute?.('contenteditable');
    const editableAttr=['true','plaintext-only'].includes(editableValue)?
      '[contenteditable="'+editableValue+'"]':null;
    // Claude/Gemini-like composers can be anonymous contenteditable nodes.
    // Prefer a unique semantic attribute before bare div or an unstable path.
    if(editableAttr&&(unique(editableAttr)||unique(tag+editableAttr)))
      return unique(editableAttr)?editableAttr:tag+editableAttr;
    if(unique(tag))return tag;
    for(let parent=node.parentElement,depth=0;parent&&depth<4;parent=parent.parentElement,depth++){
      const pid=parent.getAttribute?.('id');
      if(typeof pid==='string'&&/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(pid)){
        const scoped='#'+pid+' '+tag;
        if(unique(scoped))return scoped;
        if(editableAttr&&unique('#'+pid+' '+tag+editableAttr))
          return '#'+pid+' '+tag+editableAttr;
      }
      for(const key of ['data-testid','role']){
        const value=parent.getAttribute?.(key);
        if(typeof value!=='string'||!/^[\p{L}\p{N}_ .-]{1,72}$/u.test(value))continue;
        const scoped='['+key+'="'+value+'"] '+tag;
        if(unique(scoped))return scoped;
        if(editableAttr&&unique('['+key+'="'+value+'"] '+tag+editableAttr))
          return '['+key+'="'+value+'"] '+tag+editableAttr;
      }
    }
    return null;
  };
  const pickerCandidate=(target,kind)=>{
    for(let node=target;node&&node!==doc.documentElement;node=node.parentElement){
      if(!available(node))continue;
      if(kind==='editor'){
        if(!editorKind(node))continue;
        // Explicit contenteditable=true/plaintext-only as well as native fields.
        // Never select nested non-editable wrapper text as the editor itself.
        if(['true','plaintext-only'].includes(node.getAttribute?.('contenteditable'))||
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
    if(!container.contains?.(target))
      throw Error('按钮容器必须包含目标输入框；请重新选择同时覆盖编辑器的上层区域');
    return {valid:true,containerMatches:1,editorMatches:1,editorType:kind,origin:here.origin};
  };

  const mainRegion=()=>{
    if(activeRule){
      const node=siteContainer();
      if(!available(node))return null;
      const rect=node.getBoundingClientRect();
      return rect.width>=200&&rect.height>=90?{left:rect.left,top:rect.top,
        width:rect.width,height:rect.height}:null;
    }
    // ChatGPT may keep a hidden old main while mounting a new conversation.
    // Prefer the live composer main and then the first visible main, not the
    // first #main regardless of whether it belongs to the current SPA screen.
    const candidates=[editor()?.closest?.('main'),...Array.from(doc.querySelectorAll?.('main')||[])];
    const preferred=doc.querySelector('main#main')||doc.querySelector('main');
    if(preferred&&!candidates.includes(preferred))candidates.push(preferred);
    let node=null,rect=null;
    for(const candidate of candidates){
      if(!candidate?.isConnected||candidate.hidden||
         candidate.closest?.('[hidden],[inert],[aria-hidden="true"]'))continue;
      const css=win.getComputedStyle?.(candidate);
      if(css&&(css.display==='none'||['hidden','collapse'].includes(css.visibility)||
         css.opacity==='0'))continue;
      const box=candidate.getBoundingClientRect?.();
      if(!box||box.width<200||box.height<160||
         box.left+box.width<=0||box.top+box.height<=0||
         box.left>=win.innerWidth||box.top>=win.innerHeight)continue;
      node=candidate;rect=box;break;
    }
    if(!node)return null;
    const observe=element=>{
      if(resizeObserver&&!observedRegions.has(element)){
        observedRegions.add(element);resizeObserver.observe(element);
      }
    };
    observe(node);
    const right=rect.left+rect.width,bottom=rect.top+rect.height;
    let left=rect.left;
    // On some ChatGPT layouts the native left nav is a SIBLING of <main>,
    // not its descendant. It still reserves real on-screen space.
    const navigations=new Set([
      ...Array.from(node.querySelectorAll('aside, nav, [role="navigation"]')),
      ...Array.from(doc.querySelectorAll?.('aside, nav, [role="navigation"]')||[])
    ]);
    for(const navigation of navigations){
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
    if(content)return {...content,safeLeft:left};
    return right-left>=200?{left,top:rect.top,width:right-left,height:rect.height,safeLeft:left}:null;
  };
  const observeRoot=()=>{
    // React can replace body/html without changing the URL. Rebind the existing
    // observer instead of allocating a second controller or a second observer.
    if(!observer)return;
    const root=doc.documentElement||doc.body;
    if(!root||root===observedRoot)return;
    observer.disconnect();
    observer.observe(root,{subtree:true,childList:true,attributes:true,
      attributeFilter:['class','style','hidden','aria-hidden','inert']});
    observedRoot=root;
  };
  const darkTheme=()=>{
    const root=doc.documentElement;
    const scheme=win.getComputedStyle?.(root)?.colorScheme||'';
    return root?.classList?.contains?.('dark')||root?.getAttribute?.('data-theme')==='dark'||
      scheme==='dark'||(scheme.split(/\s+/).includes('dark')&&themeMedia?.matches);
  };
  const layout=()=>{
    layoutTimer=0;if(!host||!visible||paused||disposed)return;
    if(href!==win.location.href){void refresh();return;}
    observeRoot();
    syncJump();
    for(const old of observedRegions){
      if(old.isConnected)continue;
      resizeObserver?.unobserve?.(old);observedRegions.delete(old);
    }
    const rect=mainRegion(),target=editor();
    if(!rect||(activeRule&&!checkedEditor())){host.hidden=true;return;}
    if(!host.isConnected){
      doc.documentElement?.append(host);
      if(!host.isConnected)return;
    }
    host.classList.toggle('dark',!!darkTheme());
    // A temporarily absent ChatGPT editor must not break the existing
    // no-editor -> copy fallback; never guess a writable field.
    const targetRect=target?.getBoundingClientRect?.()||{
      left:rect.left+Math.min(140,rect.width*0.2),top:rect.top+rect.height/2,
      width:Math.max(200,rect.width*0.6),height:48
    };
    if(targetRect.left>=win.innerWidth||targetRect.top>=win.innerHeight){host.hidden=true;return;}
    // Dock 8 CSS px inside the conversation region, beyond native navigation.
    // The editor only determines whether that gutter can safely fit the rail.
    // Reset from a prior compact route BEFORE measuring vertical width;
    // scrollWidth from the horizontal rail would otherwise trap desktop layout.
    rail.classList.toggle('horizontal',false);
    const verticalWidth=rail.offsetWidth||52;
    const safeLeft=rect.safeLeft??rect.left;
    const left=Math.max(8,rect.left+8,safeLeft+8);
    const vertical=win.innerWidth>=600&&left>=Math.max(8,safeLeft+8)&&
      left+verticalWidth+10<=targetRect.left&&targetRect.width>=200;
    rail.classList.toggle('horizontal',!vertical);
    rail.classList.toggle('narrow',rect.width<680);
    if(vertical){
      const visibleTop=Math.max(0,rect.top),visibleBottom=Math.min(win.innerHeight,rect.top+rect.height);
      const railHeight=Math.min(rail.scrollHeight||222,win.innerHeight-16);
      const center=(visibleTop+visibleBottom)/2;
      const top=Math.max(8+railHeight/2,Math.min(win.innerHeight-8-railHeight/2,center));
      host.style.left=Math.round(left)+'px';host.style.top=Math.round(top)+'px';
      host.style.transform='translateY(-50%)';host.hidden=false;
    }else{
      // At small widths, LEFT align above the composer; never jump to the right.
      // Horizontal rail scrolls; its intrinsic width must never hide every button.
       const width=rail.offsetWidth||Math.min(win.innerWidth-16,250);
      const height=rail.offsetHeight||52;
      const top=targetRect.top-height-18;
      if(top<8||width>win.innerWidth-16){host.hidden=true;hideTip();return;}
      const alignedLeft=Math.max(8,Math.min(targetRect.left,win.innerWidth-width-8));
      host.style.left=Math.round(alignedLeft)+'px';host.style.top=Math.round(top)+'px';
      host.style.transform='none';host.hidden=false;
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
    if(!tip||tip.hidden||!tipOwner||!host?.isConnected||host.hidden)return;
    if(!tipOwner.isConnected){hideTip();return;}
    const hostRect=host.getBoundingClientRect(),buttonRect=tipOwner.getBoundingClientRect();
    const tipRect=tip.getBoundingClientRect(),tipHeight=tipRect.height||220;
    if(rail.classList.contains?.('horizontal')){
      const freeAbove=buttonRect.top-tipHeight-8;
      tip.style.top=Math.round((freeAbove>=8?freeAbove:buttonRect.bottom+8)-hostRect.top)+'px';
      tip.style.left=Math.round(Math.max(8-hostRect.left,
        Math.min(buttonRect.left-hostRect.left,win.innerWidth-hostRect.left-(tipRect.width||248)-8)))+'px';
      tip.style.right='auto';return;
    }
    const maxTop=win.innerHeight-hostRect.top-tipHeight-12;
    const minTop=12-hostRect.top;
    tip.style.top=Math.round(Math.max(minTop,Math.min(buttonRect.top-hostRect.top-12,maxTop)))+'px';
    const offset=Math.max(64,(rail.offsetWidth||52)+12);
    const freeRight=win.innerWidth-hostRect.left-offset;
    tip.style.left=freeRight<260?'auto':offset+'px';
    tip.style.right=freeRight<260?offset+'px':'auto';
  };
  const showTip=(row,button)=>{
    if(!tip||!host||!host.isConnected)return;
    win.clearTimeout(hideTipTimer);hideTipTimer=0;
    if(tipOwner&&tipOwner!==button)tipOwner.removeAttribute?.('aria-describedby');
    tipOwner=button;tip.replaceChildren();
    const title=doc.createElement('strong'),content=doc.createElement('pre');
    title.textContent=row.name;content.textContent=row.body;
    tip.append(title,content);tip.hidden=false;
    button.setAttribute('aria-describedby',tip.id);
    clearFeedback();
    positionTip();
  };
  const showFeedback=(message,kind='success')=>{
    clearFeedback();
    if(disposed||paused||!feedback||!host?.isConnected)return;
    feedback.replaceChildren();feedback.textContent=message;feedback.dataset.kind=kind;feedback.hidden=false;
    const dismiss=doc.createElement('button');
    dismiss.type='button';dismiss.textContent='×';dismiss.setAttribute('aria-label','关闭提示');
    dismiss.addEventListener('click',()=>clearFeedback());
    feedback.append(dismiss);
    if(announcer)announcer.textContent=message;
    const token=feedbackToken;
    feedbackTimer=win.setTimeout(()=>{
      if(token!==feedbackToken||disposed||paused)return;
      clearFeedback();
    },kind==='error'?5000:3000);
  };
  const reportAnalytics=(event,channel='page_button',reason=null)=>{
    // This bundled trusted content script sends no page text, URL or prompt body.
    try{void Promise.resolve(api.runtime?.sendMessage?.({
      protocol:ANALYTICS_PROTOCOL,kind:'event.page_report',
      toolId:PROMPT_ID,event,channel,...(reason?{reason}:{})
    })).catch(()=>{});}catch{/* Never affect editing or clipboard behavior. */}
  };
  const fallbackCopy=async(body,_reason)=>{
    const token=epoch,location=win.location.href;
    const current=()=>!disposed&&!paused&&visible&&token===epoch&&location===win.location.href&&host?.isConnected;
    if(!current())return;
    hideTip();
    try{
      if(!win.navigator?.clipboard?.writeText)throw Error('浏览器没有提供可用的剪贴板写入接口');
      await win.navigator.clipboard.writeText(body);
      if(current()){showFeedback('已复制，请粘贴','success');
        reportAnalytics('prompt.fallback_copied','fallback');}
    }catch(error){
      if(current()){showFeedback('插入失败，复制也失败：'+(error?.message||'剪贴板访问被拒绝')+
        '；请检查剪贴板权限。','error');
        reportAnalytics('prompt.failed','page_button','clipboard_failed');}
    }
  };
  const editor=()=>{
    if(activeRule)return checkedEditor();
    // Logged-in ChatGPT also uses an anonymous markdown composer without
    // the legacy id/testid. Ignore stale hidden fields, but never choose
    // arbitrarily between multiple visible, editable composers.
    const nodes=Array.from(doc.querySelectorAll('main #prompt-textarea[contenteditable="true"],main [data-testid="composer-text-input"][contenteditable="true"],main textarea#prompt-textarea,main textarea#mobile-composer-prompt,main [data-composer-markdown][contenteditable="true"][role="textbox"]'))
      .filter(node=>editorKind(node));
    return nodes.length===1?nodes[0]:null;
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
    if(event?.isTrusted!==true||!visible||disposed||paused||inserting||composing||
       !host?.isConnected||host.hidden)return;
    // A second click after the first async operation completes must not
    // turn one rapid double-click into two edits with ambiguous side effects.
    const now=Date.now();
    if(lastAttemptId===row.id&&now-lastAttempt<700)return;
    lastAttemptId=row.id;lastAttempt=now;inserting=true;
    const location=win.location.href,token=epoch,editorAtClick=editor();
    try{
      // Recheck installation, exact origin, grant, enable and data before effect.
      const data=await api.storage.local.get(KEYS);
      if(token!==epoch||location!==win.location.href||!await allowedPromptSite({
        installed:data[SIDEBAR_TOOL_STORE],enabled:data[SIDEBAR_TOOL_ENABLE_STORE],
        epochs:data[TOOL_REVOCATION_EPOCHS_STORE],url:location,
        sites:supportedOrigin(location)?null:MODEL.sitesLoad(data[PROMPT_DATA_STORE]?.sites)
      }))throw Error('网站授权或页面身份已变化');
      if(activeRule&&JSON.stringify(MODEL.siteFor(data[PROMPT_DATA_STORE]?.sites,location))!==
         JSON.stringify(activeRule))throw Error('网站规则已变化');
      const library=model.load(data[PROMPT_DATA_STORE]?.library);
      if(library.settings.webButtons!==true||
        !library.items.some(item=>item.id===row.id&&item.body===row.body&&item.enabled))throw Error('提示词已变化或停用');
      if(token!==epoch||location!==win.location.href)throw Error('页面已切换');
      const target=editor();
      // A same-URL React reconciliation can replace the composer during the
      // asynchronous permission read. Never insert into a different draft.
      if(target!==editorAtClick)
        throw Object.assign(Error('输入框在点击后被替换，未执行写入'),{code:'E_EDITOR_CHANGED'});
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
      // Web apps may steal focus or replace an editable node synchronously.
      // An execCommand against a different active element could corrupt a
      // separate draft even if our later readback reports failure.
      if(!target.isConnected||doc.activeElement!==target||editor()!==target)
        throw Error('输入框已失焦或被网页替换，未执行写入');
      // Use the browser's real editing command; never assign DOM draft values,
      // dispatch synthetic input events, click Send, or replace a selection.
      if(!doc.execCommand('insertText',false,insertion))throw Error('编辑器未确认插入');
      // Wait for a framework-controlled editor to commit or reject the DOM
      // edit before confirming. Never retry an unknown effect automatically.
      if(activeRule){
        await new Promise(resolve=>win.setTimeout(resolve,90));
        // A controlled rich-text editor can discard an accepted DOM edit on its
        // next reconciliation. Confirm again after the usual rerender window.
        // No unknown-effect retries and no synthetic input event dispatch.
        if(target.isContentEditable)
          await new Promise(resolve=>win.setTimeout(resolve,230));
      }
      if(token!==epoch||location!==win.location.href)throw Error('页面身份在写入期间变化');
      const after=readDraft(target);
      // Check unchanged prefix, complete multiline suffix and ordering.
      // "includes(prompt)" would misreport success if it already existed.
      if(!target.isConnected||typeof after!=='string'||
        normalizeDraft(after)!==normalizeDraft(before+insertion))
        throw Error('草稿正文或换行未得到完整确认，请核对并手动复制');
      hideTip();clearFeedback();
      // The edit is its own visible confirmation; announce silently for screen readers.
      if(announcer&&host?.isConnected)announcer.textContent='提示词已插入草稿，未发送';
      reportAnalytics('prompt.inserted');
    }catch(error){
      if(!disposed&&!paused&&visible&&!composing&&token===epoch&&location===win.location.href&&
         host?.isConnected&&!host.hidden){
        if(error?.code==='E_EDITOR_CHANGED'){
          showFeedback('输入框已切换，请重新点击快捷按钮','error');
          reportAnalytics('prompt.failed','page_button','editor_changed');
        }
        else await fallbackCopy(row.body,error.message);
      }
    }
    finally{inserting=false;}
  }
  const openSidebar=event=>{
    if(event?.isTrusted!==true||disposed||paused||!visible||!host?.isConnected||
      host.hidden||!builtInPage(win.location.href))return;
    hideTip();
    if(typeof api.runtime?.sendMessage!=='function'){
      showFeedback('请点击浏览器工具栏的 OpenDesk 图标打开侧边栏','error');return;
    }
    try{
      // User activation must cross to the existing worker without async preflight.
      Promise.resolve(api.runtime.sendMessage({
        protocol:PROMPT_RAIL_OPEN_PROTOCOL,expectedUrl:win.location.href
      })).then(reply=>{
        if(!disposed&&!paused&&visible&&host?.isConnected&&!host.hidden&&
          reply?.ok!==true)showFeedback('未能打开侧边栏，请点击浏览器工具栏的 OpenDesk 图标','error');
      },()=>{
        if(!disposed&&!paused&&host?.isConnected&&!host.hidden)
          showFeedback('请点击浏览器工具栏的 OpenDesk 图标打开侧边栏','error');
      });
    }catch{
      showFeedback('请点击浏览器工具栏的 OpenDesk 图标打开侧边栏','error');
    }
  };
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
      shadow.addEventListener('keydown',event=>{if(event.key==='Escape'){hideTip();clearFeedback();}});
      feedback=doc.createElement('div');feedback.className='feedback';feedback.hidden=true;
      feedback.setAttribute('aria-hidden','true');
      announcer=doc.createElement('span');announcer.className='announcer';
      announcer.setAttribute('role','status');announcer.setAttribute('aria-live','polite');
      shadow.append(style,rail,tip,feedback,announcer);doc.documentElement.append(host);
    }
    rail.replaceChildren();rail.dataset.imageSize=imageSize;
    if(builtInPage(win.location.href)){
      const brand=doc.createElement('button');brand.type='button';brand.className='brand';
      brand.textContent='OD';brand.title='打开提示词快捷按钮';
      brand.setAttribute('aria-label','打开提示词快捷按钮');
      brand.addEventListener('click',openSidebar);rail.append(brand);
    }
    for(const row of items){
      const button=doc.createElement('button');button.type='button';
      button.className='item';
      button.setAttribute('aria-label','插入提示词：'+row.name);
      button.title=row.name; // Full multiline details appear on focus/hover.
      const fallbackLabel=()=>{
        button.replaceChildren();
        for(const part of model.parts(row.label)){
          const span=doc.createElement('span');span.textContent=part;button.append(span);
        }
      };
      if(row.appearance==='image'){
        try{
          const url=model.normalizeImageUrl(row.imageUrl,true);
          button.classList.add('image');
          const img=doc.createElement('img');
          img.alt='';img.decoding='async';img.loading='lazy';img.referrerPolicy='no-referrer';
          img.addEventListener('error',()=>{if(img.parentNode===button)fallbackLabel();});
          button.append(img);img.src=url;
        }catch{fallbackLabel();}
      }else fallbackLabel();
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
    if(!runtimeCurrent()||paused)return;
    closePicker();
    stopJump();
    const token=++epoch,url=win.location.href;
    if(href!==url){
      clearFeedback();hideTip();
      // Never show controls for the previous conversation while checking the
      // new route's installation, grant and library state.
      if(host)host.hidden=true;
    }
    href=url;
    try{
      const values=await api.storage.local.get(KEYS);
      const sites=supportedOrigin(url)?null:MODEL.sitesLoad(values[PROMPT_DATA_STORE]?.sites);
      const permitted=await allowedPromptSite({
        installed:values[SIDEBAR_TOOL_STORE],
        enabled:values[SIDEBAR_TOOL_ENABLE_STORE],epochs:values[TOOL_REVOCATION_EPOCHS_STORE],
        url,sites
      });
      if(!runtimeCurrent()||paused||token!==epoch)return;
      if(url!==win.location.href){void refresh();return;}
      if(!permitted){stop();return;}
      activeRule=supportedOrigin(url)?null:MODEL.siteFor(sites,url);
      const library=model.load(values[PROMPT_DATA_STORE]?.library);
      if(!library.settings.webButtons){stop();return;}
      const rows=library.items.filter(item=>item.enabled);
      if(!rows.length&&!builtInPage(url)){stop();return;}
      readFailures=0;
      win.clearTimeout(retryTimer);retryTimer=0;
      if(!resizeObserver&&win.ResizeObserver)resizeObserver=new win.ResizeObserver(schedule);
      items=rows.slice(0,4);imageSize=library.settings.imageSize;visible=true;render();
      syncJump();
      if(!observer){
        observer=new win.MutationObserver(records=>{
          if(records.every(record=>record.target===host||host?.contains(record.target)))return;
          schedule();
        });
      }
      observeRoot();
    }catch{
      if(token!==epoch||disposed||paused)return;
      // A transient storage/DOM readiness failure must not permanently erase
      // the buttons until reload. Fail closed, then retry with bounded backoff.
      // An explicit disable/revocation above is definitive and does not retry.
      const retryAfter=Math.min(800*2**Math.min(readFailures++,4),12800);
      stop();
      retryTimer=win.setTimeout(()=>{
        retryTimer=0;
        if(!disposed&&!paused)void refresh();
      },retryAfter);
    }
  }
  const onStorage=(changes,area)=>{
    if(area!=='local'||!KEYS.some(key=>Object.hasOwn(changes,key)))return;
    epoch++;stop();void refresh();
  };
  const onCompositionStart=()=>{composing=true;};
  const onCompositionEnd=()=>{composing=false;};
  const onPageShow=()=>{paused=false;void refresh();};
  const onPageHide=event=>{epoch++;paused=true;stop();if(!event.persisted)dispose();};
  const onNav=()=>{if(href!==win.location.href){clearFeedback();void refresh();}else schedule();};
  function dispose(){
    if(disposed)return;disposed=true;epoch++;stop();
    win.clearInterval(locationTimer);
    // Invalidated Chrome event objects may throw even while removing listeners.
    try{api.storage.onChanged.removeListener(onStorage);}catch{}
    try{api.runtime?.onMessage?.removeListener(onPickerMessage);}catch{}
    try{api.runtime?.onMessage?.removeListener(onAnalyticsScopeMessage);}catch{}
    win.removeEventListener('pageshow',onPageShow);win.removeEventListener('pagehide',onPageHide);
    win.removeEventListener('popstate',onNav);win.removeEventListener('hashchange',onNav);
    win.navigation?.removeEventListener?.('navigatesuccess',onNav);
    win.removeEventListener('resize',schedule);
    themeMedia?.removeEventListener?.('change',schedule);
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

  // Independent from picker and editor health: failed actions still have scope.
  const onAnalyticsScopeMessage=(message,sender,respond)=>{
    if(message?.protocol!==ANALYTICS_PROTOCOL||message.kind!==ANALYTICS_PAGE_SCOPE_CHECK)return false;
    const token=epoch,url=win.location.href;
    const current=()=>runtimeCurrent()&&!paused&&token===epoch&&url===win.location.href;
    const fromWorker=()=>{
      try{
        if(!current()||sender?.id!==runtimeId||sender.tab!==undefined||
           sender.documentId!==undefined)return false;
        const root=api.runtime.getURL('');
        const worker=api.runtime.getManifest().background?.service_worker;
        if(typeof worker!=='string'||!worker)return false;
        const expected=api.runtime.getURL(worker),base=new URL(root),target=new URL(expected);
        const origin=base.protocol+'//'+base.host;
        if(target.protocol!==base.protocol||target.host!==base.host||
           (sender.origin!==undefined&&sender.origin!==origin))return false;
        if(sender.url!==undefined)return sender.url===expected;
        // Some Chrome versions omit SW URL; only an explicit own origin suffices.
        return sender.origin===origin;
      }catch{return false;}
    };
    if(!fromWorker()||message.expectedUrl!==url||
       Object.keys(message).some(key=>!['protocol','kind','expectedUrl'].includes(key))){
      respond(false);return false;
    }
    void (async()=>{
      const values=await api.storage.local.get(KEYS);
      if(!current())return false;
      const sites=MODEL.sitesLoad(values[PROMPT_DATA_STORE]?.sites);
      const allowed=await allowedPromptSite({installed:values[SIDEBAR_TOOL_STORE],
        enabled:values[SIDEBAR_TOOL_ENABLE_STORE],url,sites});
      return allowed===true&&current();
    })().then(allowed=>respond(allowed===true),()=>respond(false));
    return true;
  };

  api.runtime?.onMessage?.addListener(onPickerMessage);
  api.runtime?.onMessage?.addListener(onAnalyticsScopeMessage);
  api.storage.onChanged.addListener(onStorage);
  win.addEventListener('pageshow',onPageShow);win.addEventListener('pagehide',onPageHide);
  win.addEventListener('popstate',onNav);win.addEventListener('hashchange',onNav);
  win.navigation?.addEventListener?.('navigatesuccess',onNav);
  win.addEventListener('resize',schedule);
  themeMedia?.addEventListener?.('change',schedule);
  win.addEventListener('scroll',schedule,true);
  doc.addEventListener('transitionend',schedule,true);
  doc.addEventListener('compositionstart',onCompositionStart,true);
  doc.addEventListener('compositionend',onCompositionEnd,true);
  // A low-frequency fallback also repairs missed DOM events (e.g. document
  // root replacement). MutationObserver handles ordinary updates promptly.
  locationTimer=win.setInterval(()=>{
    if(!runtimeCurrent()||paused)return;
    if(href!==win.location.href)void refresh();
    else if(visible)schedule();
  },1100);
  const controller=Object.freeze({dispose,refresh,diagnostics:()=>({visible,items:items.length})});
  Object.defineProperty(win,SLOT,{value:controller,configurable:true});
  if(doc.body)void refresh();else doc.addEventListener('DOMContentLoaded',()=>void refresh(),{once:true});
  return controller;
}
