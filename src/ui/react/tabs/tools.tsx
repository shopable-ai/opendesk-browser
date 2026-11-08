import * as React from 'react';
import {createPortal} from 'react-dom';
import {Button,IconButton} from '../components/ui/button.tsx';
import {Switch} from '../components/ui/switch.tsx';
import {localeManagerText} from '../../locale-manager-localization.js';

const LocaleManager=React.lazy(()=>import('./locale-manager.tsx'));

// Sole owner of extension-center-list children. All actions delegate to the
// trusted existing Extension Center; user packages stay in their sandbox.
export function ExtensionRows({rows,busy,pendingKey,menuKey,onOpenRow,onMore}){
  // Distinct package IDs remain visible to people and assistive technologies
  // when two independently installed tools intentionally reuse a title.
  const titles=new Map();
  for(const row of rows)if(row.installed)
    titles.set(row.title,(titles.get(row.title)||0)+1);
  // Keep the last hovered/focused installed row's menu visible after pointer exit.
  // Until the user interacts, the first installed row demonstrates the control.
  const [lastInteractedKey,setLastInteractedKey]=React.useState(null);
  const activeActionKey=rows.some(row=>row.installed&&row.key===lastInteractedKey)
    ?lastInteractedKey:rows.find(row=>row.installed)?.key;
  return rows.map(row=>{
    const label=row.primaryAction||'查看详情';
    const identity=row.installed&&titles.get(row.title)>1&&row.key.startsWith('app:')
      ?row.key.slice(4):null;
    const accessible=label+'「'+row.title+'」'+(identity?' · 安装 ID：'+identity:'');
    return <li key={row.key} data-extension-id={row.key}
      className={row.installed&&row.key===activeActionKey?'ec-row ec-row--action-visible':'ec-row'}
      aria-busy={busy||pendingKey===row.key?'true':undefined}
      onPointerEnter={event=>{
        if(row.installed&&event.pointerType!=='touch')setLastInteractedKey(row.key);
      }}
      onFocusCapture={()=>{
        if(row.installed)setLastInteractedKey(row.key);
      }}>
      <button type="button" className="ec-row-main" data-extension-key={row.key}
        data-extension-action="main" disabled={busy}
        aria-label={accessible} title={accessible}
        onClick={event=>onOpenRow(row.key,event.nativeEvent)}>
        <span className="ec-glyph" aria-hidden="true">{row.kind==='page'?'◇':'▦'}</span>
        <span className="ec-copy">
          <span className="ec-name-line">
            <span className="ec-name" title={row.title}>
              <span className="ec-name-text">{row.title}</span>
            </span>
            <span className="ec-type">{row.type}</span>
          </span>
          <span className="ec-description" title={row.description}>{row.description}</span>
          {identity&&<span className="ec-description ec-identity">安装 ID：{identity}</span>}
        </span>
      </button>
      <span className="ec-row-actions">
        {row.installed&&<IconButton className="ec-row-more" disabled={busy}
          label={'管理「'+row.title+'」'+(identity?' · 安装 ID：'+identity:'')} data-extension-key={row.key}
          data-extension-action="more" aria-haspopup="menu"
          aria-expanded={menuKey===row.key} aria-controls="extension-center-row-menu"
          onClick={event=>onMore(row.key,event.currentTarget,event.nativeEvent)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5h.01M12 12h.01M12 19h.01" strokeWidth="3.5"/>
          </svg>
        </IconButton>}
      </span>
    </li>;
  });
}

 

/** Shared confirmation shell; the trusted controller still owns uninstall. */
export function UninstallDialog({open=false,title='卸载扩展？',busy=false,
  onCancel,onEscape,returnFocusSelector,description,identity,children,panelClassName='',
  cancelLabel='取消卸载',closeLabel='关闭卸载确认',busyLabel='正在卸载，请稍候…'}) {
  const panelRef=React.useRef(null),titleId=React.useId(),descriptionId=React.useId();
  const latest=React.useRef({busy,onCancel,onEscape});
  latest.current={busy,onCancel,onEscape};
  const cancel=event=>{
    if(!latest.current.busy)latest.current.onCancel?.(event.nativeEvent||event);
  };
  React.useLayoutEffect(()=>{
    if(!open)return;
    const panel=panelRef.current;
    if(!panel)return;
    const doc=panel.ownerDocument,overlay=panel.parentElement;
    const previous=doc.activeElement;
    const previousOverflow=doc.body.style.overflow;
    const isolated=new Map();
    const isolate=()=>{
      for(const node of doc.body.children){
        if(node===overlay||node.contains(overlay)||isolated.has(node))continue;
        isolated.set(node,{inert:node.inert,hidden:node.getAttribute('aria-hidden')});
        node.inert=true;node.setAttribute('aria-hidden','true');
      }
    };
    isolate();
    const observer=new doc.defaultView.MutationObserver(isolate);
    observer.observe(doc.body,{childList:true});
    doc.body.style.overflow='hidden';
    // The legacy ToolHost provides its own description paragraph and actions.
    const explanation=panel.querySelector('p:not(.od-uninstall-identity)');
    if(explanation){
      if(!explanation.id)explanation.id=descriptionId;
      panel.setAttribute('aria-describedby',explanation.id);
    }
    const focusInside=()=>{
      (panel.querySelector('.od-locale-maintenance[open]>summary')||panel.querySelector('[data-uninstall-cancel]:not([disabled])')||panel).focus({preventScroll:true});
    };
    focusInside();
    const onFocusIn=event=>{if(!panel.contains(event.target))focusInside();};
    const onKeyDown=event=>{
      if(event.key==='Escape'){
        event.preventDefault();event.stopPropagation();
        if(latest.current.onEscape?.(event)!==true)cancel(event);
        return;
      }
      if(event.key!=='Tab')return;
      const focusable=[...panel.querySelectorAll(
        'button:not([disabled]),[href],summary,input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
        .filter(node=>!node.closest('[hidden],[inert],[aria-hidden="true"]')&&node.getClientRects().length);
      const first=focusable[0],last=focusable.at(-1);
      if(!first){event.preventDefault();panel.focus({preventScroll:true});return;}
      if(event.shiftKey&&(doc.activeElement===first||!panel.contains(doc.activeElement))){
        event.preventDefault();last.focus({preventScroll:true});
      }else if(!event.shiftKey&&(doc.activeElement===last||!panel.contains(doc.activeElement))){
        event.preventDefault();first.focus({preventScroll:true});
      }
    };
    doc.addEventListener('keydown',onKeyDown,true);
    doc.addEventListener('focusin',onFocusIn,true);
    return ()=>{
      observer.disconnect();
      doc.removeEventListener('keydown',onKeyDown,true);
      doc.removeEventListener('focusin',onFocusIn,true);
      doc.body.style.overflow=previousOverflow;
      for(const [node,value] of isolated){
        node.inert=Boolean(value.inert);
        if(value.hidden===null)node.removeAttribute('aria-hidden');
        else node.setAttribute('aria-hidden',value.hidden);
      }
      const preferred=returnFocusSelector?doc.querySelector(returnFocusSelector):null;
      const visible=node=>node?.isConnected&&!node.disabled&&!node.closest?.('[hidden],[inert]')&&
        node.getClientRects().length>0;
      const replacement=previous?.dataset?.extensionKey?[...doc.querySelectorAll('[data-extension-key]')]
        .find(node=>node.dataset.extensionKey===previous.dataset.extensionKey&&
          node.dataset.extensionAction===previous.dataset.extensionAction):null;
      const target=visible(preferred)?preferred:
        visible(previous)?previous:visible(replacement)?replacement:doc.getElementById('extension-center-search');
      target?.focus?.({preventScroll:true});
    };
  },[open,returnFocusSelector]);
  React.useLayoutEffect(()=>{
    const panel=panelRef.current;
    if(open&&busy&&panel?.contains(panel.ownerDocument.activeElement)&&
      panel.ownerDocument.activeElement.disabled)panel.focus({preventScroll:true});
  },[open,busy]);
  if(!open)return null;
  const surface=<div className="od-uninstall-overlay">
    <button type="button" className="od-uninstall-backdrop" tabIndex={-1}
      aria-label={cancelLabel} disabled={busy}
      onClick={cancel}/>
    <section ref={panelRef} className={["od-uninstall-dialog",panelClassName].filter(Boolean).join(" ")} tabIndex={-1}
      role="dialog" aria-modal="true" aria-labelledby={titleId}
      aria-describedby={description?descriptionId:undefined} aria-busy={busy}>
      <div className="od-uninstall-dialog-head">
        <h2 id={titleId}>{title}</h2>
        <IconButton className="od-uninstall-close" label={closeLabel} disabled={busy} onClick={cancel}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </IconButton>
      </div>
      {identity?.key&&<p className="od-uninstall-identity">
        {identity.kind==='page'?'网页增强':'应用'} · ID：{identity.key.slice(identity.key.indexOf(':')+1)}
        {identity.version!=null&&' · '+(identity.kind==='page'?'修订：r':'版本：v')+identity.version}
      </p>}
      {description&&<p id={descriptionId}>{description}</p>}
      {children}
      {busy&&<p role="status" aria-live="polite">{busyLabel}</p>}
    </section>
  </div>;
  return typeof document==='undefined'?surface:createPortal(surface,document.body);
}

// The existing shared IconButton owns button semantics and accessible names.
  // Only known actions become icons; any new/unknown action remains text-labelled.
  // No new dependency, permission, or Host route is created here.
function extensionActionGlyph(id,label){
  switch(id){
    case 'settings': return <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h8m4 0h4M4 17h4m4 0h8"/>
      <circle cx="14" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>
    </svg>;
    case 'install': return <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12m-4-4 4 4 4-4M4 18v3h16v-3"/>
    </svg>;
    case 'update': return <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 7v5h-5M4 17v-5h5M5 9a8 8 0 0 1 14-2l1 1M19 15a8 8 0 0 1-14 2l-1-1"/>
    </svg>;
    case 'cleanup': return <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 11a8 8 0 1 1 2 6M4 4v7h7"/>
    </svg>;
    case 'toggle': return <svg viewBox="0 0 24 24" aria-hidden="true">
      {label?.startsWith('停用')?<><path d="M9 6v12M15 6v12"/></>:
        <path d="m8 5 11 7-11 7V5Z"/>}
    </svg>;
    case 'uninstall': return <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7M10 11v6m4-6v6"/>
    </svg>;
    case 'develop': return <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m8 8-4 4 4 4m8-8 4 4-4 4M14 4l-4 16"/>
    </svg>;
    default:return null;
  }
}

// A React Aria Switch carries a boolean, not the native trusted event.
// Capture the real gesture within the same React subtree and require it
// before delegating to the original Controller/Authority. Never optimistically
// change the displayed persisted state.
function ManagedPageControl({control,title,heading='启用此网页增强',compact=false}){
  const gesture=React.useRef(null);
  const capture=event=>{
    gesture.current=event.nativeEvent?.isTrusted===true?event.nativeEvent:null;
  };
  const onChange=next=>{
    const event=gesture.current;
    gesture.current=null;
    if(event?.isTrusted===true&&typeof next==='boolean'&&next!==control.enabled)
      control.onToggle?.(next,event);
  };
  return <section className="ec-detail-card ec-page-control" aria-label="网页增强启用状态">
    <div className="ec-page-main" onPointerDownCapture={capture}
      onPointerUpCapture={capture} onKeyDownCapture={capture}
      onKeyUpCapture={capture} onClickCapture={capture}
      onBlurCapture={()=>{gesture.current=null;}}>
      <div className="ec-page-main-copy">
        <h3>{heading}</h3>
        <p>{compact?'在已授权的网站显示导航按钮':'在已授权的网站自动运行'}</p>
      </div>
      <Switch data-ec-detail-action="toggle" aria-label={'启用「'+title+'」'}
        isSelected={control.enabled} isDisabled={control.busy||!control.enabledKnown}
        onChange={onChange}/>
    </div>
    <p className="ec-page-state" data-state={control.state} role="status" aria-live="polite">
      {control.status}
    </p>
    {control.note&&control.state!=='ready'&&<p>{control.note}</p>}
    {control.legacyProgramId&&<p className="ec-page-legacy">
      检测到同时安装的旧版：{control.legacyProgramId}。
      两者安装身份和授权完全独立；请在扩展列表中单独停用或卸载旧版，不会自动迁移或删除。
    </p>}
    {(control.canRestore||control.state==='pending'||control.state==='restricted')&&
      <div className="ec-page-control-actions">
        {control.canRestore&&<Button disabled={control.busy}
          onClick={event=>control.onRestore?.(event.nativeEvent)}>
          尝试恢复原有授权与注册
        </Button>}
        <Button disabled={control.busy} onClick={event=>control.onRefresh?.(event.nativeEvent)}>
          刷新可信状态
        </Button>
      </div>}
  </section>;
}

const EMPTY_SCROLL_SITE=Object.freeze({
  origin:'',pathScope:'/',mainSelector:'',scrollSelector:'',
  messageSelector:'',anchorSelector:'',enabled:true
});
const SCROLL_CSS_FIELDS=[
  ['mainSelector','对话主区域','main',true],
  ['scrollSelector','滚动容器','scroller',true],
  ['messageSelector','消息节点','messages',false],
  ['anchorSelector','按钮锚点','anchor',false]
];
const SCROLL_BUILTINS=[
  {name:'ChatGPT',origin:'https://chatgpt.com'},
  {name:'DeepSeek',origin:'https://chat.deepseek.com'},
  {name:'Gemini',origin:'https://gemini.google.com'}
];
const SCROLL_FLAGS=[
  ['regionTop','回到回复顶部'],['regionBottom','跳到回复底部'],
  ['conversationTop','回到对话顶部'],['conversationBottom','跳到对话底部'],
  ['floatingTop','滚动后悬浮回顶']
];
const SCROLL_FLAG_GROUPS=[
  ['单条长回复',SCROLL_FLAGS.slice(0,2)],
  ['整段对话',SCROLL_FLAGS.slice(2,4)],
  ['悬浮导航',SCROLL_FLAGS.slice(4)]
];
function scrollOrigin(value){
  try{
    const url=new URL(value.trim());
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||
      url.pathname!=='/'||url.search||url.hash)return null;
    return url.origin;
  }catch{return null;}
}
function suggestedScrollPath(href){
  try{
    const path=new URL(href).pathname, parts=path.split('/').filter(Boolean);
    if(!parts.length)return '/';
    // ChatGPT /c/<id>, DeepSeek /a/chat/s/<id> and similar SPA routes
    // must not persist the session identifier as an authorization prefix.
    const id=/^(?:[0-9a-f]{8,}(?:-[0-9a-f]{4,})*|[A-Za-z0-9_-]{18,}|\d{6,})$/i;
    const prefix=parts.length>1&&(id.test(parts.at(-1))||
      ['c','s','conversation','chat','app','session'].includes(parts.at(-2).toLowerCase()));
    return '/'+(prefix?parts.slice(0,-1):parts).join('/');
  }catch{return '/';}
}
function validScrollPath(value){
  return typeof value==='string'&&value.length>0&&value.length<=512&&
    value.startsWith('/')&&!value.startsWith('//')&&
    !/[?#\\*\u0000-\u001f\u007f]/.test(value)&&
    !value.includes('/../')&&!value.endsWith('/..')&&!value.includes('/./');
}
function scrollCssError(value,required){
  if(!value.trim())return required?'请填写 CSS 选择器':'';
  if(value.length>256||/[\u0000-\u001f\u007f{};]/.test(value))
    return 'CSS 选择器过长或包含无效字符';
  try{document.querySelector(value);}catch{return 'CSS 语法无效';}
  return '';
}
function ScrollSiteManager({model,pageControl,title,detail,onNavigation}){
  const resumed=model.resumeDraft||null;
  const [snapshot,setSnapshot]=React.useState(null);
  const [loading,setLoading]=React.useState(true);
  const [view,setView]=React.useState(resumed?'editor':'home');
  const [editorFrom,setEditorFrom]=React.useState(
    ['home','sites','builtins'].includes(resumed?.returnView)?resumed.returnView:'home');
  const [editingKey,setEditingKey]=React.useState(resumed?.editKey??null);
  const [draft,setDraft]=React.useState(resumed?Object.fromEntries(
    Object.keys(EMPTY_SCROLL_SITE).map(key=>[key,resumed[key]??EMPTY_SCROLL_SITE[key]])):null);
  const [touched,setTouched]=React.useState({});
  const [busy,setBusy]=React.useState(false);
  const [error,setError]=React.useState('');
  const [notice,setNotice]=React.useState('');
  const [confirmDelete,setConfirmDelete]=React.useState(false);
  const [expandedSite,setExpandedSite]=React.useState(null);
  const [discard,setDiscard]=React.useState(false);
  const [needsReconcile,setNeedsReconcile]=React.useState(false);
  const ref=React.useRef(model);ref.current=model;
  const originInput=React.useRef(null);
  const selectorInputs=React.useRef({});
  const contentRef=React.useRef(null);
  const pendingFocus=React.useRef(resumed?'scroll-origin':null);
  const returnFocus=React.useRef({});
  const navigate=next=>{
    returnFocus.current[view]=document.activeElement?.id;
    pendingFocus.current='scroll-page-title';setView(next);
  };
  const returnTo=next=>{
    pendingFocus.current=returnFocus.current[next]||'scroll-page-title';setView(next);
  };
  // A resumed permission-review draft has not been saved. Do not turn it into
  // the clean baseline merely because the Installer remounted this view.
  const seed=React.useRef(null);
  const inFlight=React.useRef(false);
  const navigationGesture=React.useRef(null);
  const captureNavigation=event=>{
    navigationGesture.current=event.nativeEvent?.isTrusted===true?event.nativeEvent:null;
  };
  const fillEpoch=React.useRef(0);
  const pathEdited=React.useRef(Boolean(resumed));
  React.useEffect(()=>{
    let live=true;setLoading(true);
    ref.current.onRead().then(value=>{
      if(!live)return;
      if(value?.value?.version!==1||!Array.isArray(value.value.sites)||
        typeof value.etag!=='string')throw new Error('可信配置读回格式错误');
      setSnapshot(value);setError('');setLoading(false);
    }).catch(e=>{if(live){setError('读取失败：'+(e?.code||e?.message||e));setLoading(false);}});
    return ()=>{live=false;};
  },[model.identityKey]);
  const update=(key,value)=>{
    fillEpoch.current++;
    const next={...(draft||EMPTY_SCROLL_SITE),[key]:value};
    if(key==='origin'&&!pathEdited.current)next.pathScope='/';
    if(key==='pathScope')pathEdited.current=true;
    setDraft(next);ref.current.onDraftChange({...next,returnView:editorFrom},editingKey);
    setTouched(old=>({...old,[key]:true}));
    setError('');setNotice('');
  };
  const open=async(item=null,from=view)=>{
    const value=item?{...item}:{...EMPTY_SCROLL_SITE};
    const key=item?item.origin+'\n'+item.pathScope:null;
    const epoch=++fillEpoch.current;
    returnFocus.current[from]=document.activeElement?.id;
    pendingFocus.current='scroll-origin';
    setView('editor');setEditorFrom(from);setEditingKey(key);setDraft(value);
    seed.current={...value};
    setTouched({});pathEdited.current=Boolean(item);
    setNotice('');setError('');setConfirmDelete(false);setDiscard(false);
    ref.current.onDraftChange({...value,returnView:from},key);
    if(!item){
      try{
        const page=await ref.current.onCurrentPageDetails();
        if(fillEpoch.current!==epoch)return;
        const origin=scrollOrigin(page?.origin||'');
        if(!origin)return;
        const next={...value,origin,pathScope:suggestedScrollPath(page.url)};
        seed.current={...next};setDraft(next);ref.current.onDraftChange({...next,returnView:from},null);
      }catch(e){if(fillEpoch.current===epoch)setNotice('当前网页不可用于自动填充，可手动输入网站地址。');}
    }
    queueMicrotask(()=>originInput.current?.focus({preventScroll:true}));
  };
  const dirty=Boolean(draft)&&JSON.stringify(draft)!==JSON.stringify(seed.current);
  const leaveEditor=()=>{
    fillEpoch.current++;
    returnTo(editorFrom);setDraft(null);setEditingKey(null);setConfirmDelete(false);setDiscard(false);
    setTouched({});setError('');ref.current.onDraftChange(null,null);
  };
  const closeEditor=()=>{
    if(busy)return;
    if(discard){setDiscard(false);pendingFocus.current='scroll-origin';return;}
    if(dirty){setDiscard(true);return;}
    leaveEditor();
  };
  const goBack=()=>{
    if(view==='editor')closeEditor();
    else if(view==='management')returnTo('settings');
    else {returnTo('home');setError('');}
  };
  const backRef=React.useRef(goBack);backRef.current=goBack;
  React.useLayoutEffect(()=>{
    onNavigation?.({identityKey:model.identityKey,busy:busy||Boolean(detail?.busy),view,
      canAdd:!busy&&!detail?.busy&&!loading&&!needsReconcile&&Boolean(snapshot)&&!model.disabledReason,
      title:({builtins:'内置网站',sites:'自定义网站',settings:'导航设置',
        management:'权限与技术信息',editor:editingKey?'编辑网站':'添加网站'})[view]||'',
      backLabel:view==='editor'?(editorFrom==='home'?'返回应用首页':editorFrom==='builtins'?'返回内置网站':'返回自定义网站'):
        view==='management'?'返回导航设置':'返回应用首页',
      openSettings:()=>navigate('settings'),
      addSite:()=>void open(null,'sites'),
      back:view==='home'?null:()=>backRef.current()});
  },[view,busy,detail?.busy,loading,needsReconcile,Boolean(snapshot),model.disabledReason,
    editingKey,editorFrom,model.identityKey,onNavigation]);
  React.useLayoutEffect(()=>{
    if(busy)return;
    if(discard){
      contentRef.current?.querySelector('[data-keep-editing]')?.focus({preventScroll:false});
      return;
    }
    if(!pendingFocus.current)return;
    if(contentRef.current)contentRef.current.scrollTop=0;
    (document.getElementById(pendingFocus.current)||document.getElementById('scroll-page-title'))?.focus({preventScroll:true});
    pendingFocus.current=null;
  },[view,discard,busy]);
  React.useEffect(()=>()=>onNavigation?.(null),[onNavigation]);
  const readAgain=async()=>{
    if(inFlight.current)return;inFlight.current=true;setBusy(true);
    try{
      const result=await ref.current.onRead();
      if(result?.value?.version!==1||!Array.isArray(result.value.sites)||
        typeof result.etag!=='string')throw new Error('可信读回格式错误');
      setSnapshot(result);setNeedsReconcile(false);setError('');
      const observed=draft&&result.value.sites.find(site=>
        Object.keys(EMPTY_SCROLL_SITE).every(key=>site[key]===
          (key==='origin'?scrollOrigin(draft[key]):
            typeof draft[key]==='string'?draft[key].trim():draft[key])));
      if(observed){
        const key=observed.origin+'\n'+observed.pathScope;
        setEditingKey(key);seed.current={...draft};ref.current.onDraftChange({...draft,returnView:editorFrom},key);
      }
      setNotice(observed?'已从存储核对到相同规则，当前草稿已同步；原写入回执仍未知，未重复写入。':
        '已重新读取真实配置。保留当前草稿，请核对是否已写入后再操作。');
    }catch(e){setError('重新读取失败：'+(e?.code||e?.message||e));}
    finally{inFlight.current=false;setBusy(false);}
  };
  const origin=draft?scrollOrigin(draft.origin):null;
  const pathValid=draft?validScrollPath(draft.pathScope.trim()):false;
  const duplicateBuiltIn=Boolean(origin&&!editingKey&&SCROLL_BUILTINS.some(x=>x.origin===origin));
  const duplicateSaved=Boolean(draft&&snapshot?.value?.sites?.some(x=>
    x.origin===origin&&x.pathScope===draft.pathScope.trim()&&
    x.origin+'\n'+x.pathScope!==editingKey));
  const approved=Boolean(draft&&origin&&pathValid&&ref.current.isApproved(origin,draft.pathScope.trim()));
  const needPermission=Boolean(origin&&pathValid&&!approved&&!duplicateBuiltIn&&!duplicateSaved);
  const fieldErrors=Object.fromEntries(SCROLL_CSS_FIELDS.map(([key,, ,required])=>
    [key,draft?scrollCssError(draft[key],required):'']));
  const valid=Boolean(draft&&origin&&pathValid&&!duplicateBuiltIn&&!duplicateSaved&&
    !Object.values(fieldErrors).some(Boolean));
  const persist=async(event,rule,remove=false,editKey=editingKey,returnView=editorFrom)=>{
    if(inFlight.current||loading||!snapshot||needsReconcile)return false;
    inFlight.current=true;setBusy(true);setError('');setNotice('');
    try{
      const result=await ref.current.onSave(rule,snapshot.etag,editKey,event.nativeEvent);
      if(result?.review){
        setNotice('已进入原安装器权限审阅；授权完成后仍需回来保存规则。');
        return false;
      }
      if(result?.value?.version!==1||!Array.isArray(result.value.sites)||
        typeof result.etag!=='string')throw new Error('持久化读回格式错误');
      setSnapshot(result);setDraft(null);setEditingKey(null);setConfirmDelete(false);
      seed.current=null;ref.current.onDraftChange(null,null);
      returnTo(remove?'sites':returnView);setExpandedSite(null);
      setNotice(remove?'已删除规则，并从可信存储确认。':'规则已保存并读回；实际页面运行需在目标网页确认。');
      return true;
    }catch(e){
      if(['E_CONFIG_UNKNOWN','E_CONFIG_CONFLICT'].includes(e?.code))setNeedsReconcile(true);
      setError((e?.code||'E_SITE_SAVE')+'：'+(e?.message||e)+
        '。草稿已保留；结果未知时请先只读对账。');
      return false;
    }finally{inFlight.current=false;setBusy(false);}
  };
  const save=event=>{
    event.preventDefault();
    if(!valid||!approved||!dirty||busy||discard||detail?.busy)return;
    const rule={...EMPTY_SCROLL_SITE,...Object.fromEntries(
      Object.keys(EMPTY_SCROLL_SITE).map(key=>[key,
        typeof draft[key]==='string'?draft[key].trim():Boolean(draft[key])])),
      origin};
    void persist(event,rule);
  };
  const review=async event=>{
    if(!needPermission||inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');setNotice('');
    try{
      const ok=await ref.current.onReviewSite(
        {origin,pathScope:draft.pathScope.trim()},event.nativeEvent);
      if(!ok)throw new Error('安装审阅未开始；草稿仍保留。');
      setNotice('已转入网站访问权限审阅；批准并不等于规则已保存。');
    }catch(e){setError((e?.code||'E_SITE_REVIEW')+'：'+(e?.message||e));}
    finally{inFlight.current=false;setBusy(false);}
  };
  const pick=async(field,key,event)=>{
    if(inFlight.current||!draft)return;
    inFlight.current=true;setBusy(true);setError('');setNotice('请在当前网页点选目标，按 Esc 可取消。');
    try{
      const result=await ref.current.onPick(field,draft.origin,draft.mainSelector,event.nativeEvent);
      if(result?.state==='selected'&&typeof result.selector==='string'){
        update(key,result.selector);
        setNotice('已取得当前网页的 CSS；保存前仍会验证真实 DOM。');
      }else if(result?.state==='cancelled'){
        setNotice('点选已取消，所有输入保持不变。');
      }else throw new Error(result?.state==='timeout'?'点选超时，请重新选择':
        '当前目标不可选，或网页/授权状态已变化。');
    }catch(e){setError((e?.code||'E_PICK')+'：'+(e?.message||e));setNotice('');}
    finally{
      pendingFocus.current='scroll-'+key;
      inFlight.current=false;setBusy(false);
    }
  };
  const toggleNavigation=async(key,value,event)=>{
    if(inFlight.current||loading||!snapshot||needsReconcile)return;
    const navigation=Object.fromEntries(SCROLL_FLAGS.map(([name])=>
      [name,name===key?value:snapshot.value.navigation?.[name]!==false]));
    inFlight.current=true;setBusy(true);setError('');setNotice('');
    try{
      const result=await ref.current.onSaveNavigation(navigation,snapshot.etag,event.nativeEvent||event);
      setSnapshot(result);setNotice('导航设置已保存并读回。');
    }catch(e){
      if(['E_CONFIG_UNKNOWN','E_CONFIG_CONFLICT'].includes(e?.code))setNeedsReconcile(true);
      setError((e?.code||'E_CONFIG_UNKNOWN')+'：'+(e?.message||e));
    }finally{inFlight.current=false;setBusy(false);}
  };
  const toggleRule=(site,event)=>{
    const key=site.origin+'\n'+site.pathScope;
    void persist(event,{...site,enabled:!site.enabled},false,key,view);
  };
  const writesDisabled=busy||Boolean(detail?.busy)||loading||needsReconcile||!snapshot||Boolean(model.disabledReason);
  const builtinList=(all=false)=><ul className="ec-scroll-builtins">
    {(all?SCROLL_BUILTINS:SCROLL_BUILTINS.slice(0,2)).map(x=><li key={x.origin}>
      <span className="ec-scroll-mark" aria-hidden="true">{x.name[0]}</span>
      <div className="ec-scroll-site-copy"><strong>{x.name}</strong><span>{x.origin.replace('https://','')}</span></div>
    </li>)}
  </ul>;
  const siteList=(all=false)=>!snapshot
    ?<p className="ec-scroll-empty" role="status">网站规则尚未读取，请重新读取真实状态。</p>
    :snapshot.value.sites.length
    ?<ul className="ec-scroll-saved">{snapshot.value.sites.map((site,index)=>{
      const key=site.origin+'\n'+site.pathScope,host=site.origin.replace(/^https?:\/\//,'');
      const expanded=all&&expandedSite===key;
      return <li key={key}>
        <div className="ec-scroll-site-row">
          <span className="ec-scroll-mark" aria-hidden="true">{host[0].toUpperCase()}</span>
          <div className="ec-scroll-site-copy"><strong>{host}</strong>
            <span>{site.enabled?'规则已启用':'规则已停用'} · {site.pathScope}</span></div>
          <div className="ec-scroll-row-actions">
            <Button id={'scroll-edit-'+index} variant="quiet" aria-label={'编辑 '+site.origin}
              disabled={writesDisabled} onClick={()=>void open(site,all?'sites':'home')}>编辑适配</Button>
            {all&&<IconButton id={'scroll-more-'+index} label={'更多操作：'+site.origin}
              aria-expanded={expanded} aria-controls={'scroll-rule-actions-'+index} disabled={busy}
              onClick={()=>{setExpandedSite(expanded?null:key);setConfirmDelete(false);}}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3.5"/></svg>
            </IconButton>}
          </div>
        </div>
        {expanded&&<div id={'scroll-rule-actions-'+index} className="ec-scroll-rule-actions">
          {!confirmDelete?<>
            <Button disabled={writesDisabled} onClick={event=>toggleRule(site,event)}>{site.enabled?'停用规则':'恢复规则'}</Button>
            <Button variant="danger" disabled={writesDisabled} onClick={()=>setConfirmDelete(true)}>删除规则…</Button>
          </>:<><p>确认删除 {host} 的 {site.pathScope} 规则？</p>
            <Button variant="danger" disabled={writesDisabled}
              onClick={event=>void persist(event,null,true,key,'sites')}>确认删除</Button>
            <Button disabled={busy} onClick={()=>setConfirmDelete(false)}>取消删除</Button></>}
        </div>}
      </li>;
    })}</ul>
    :<p className="ec-scroll-empty">尚未添加自定义网站</p>;
  return <section className="ec-scroll-site-manager" data-view={view}
    aria-label="AI 对话滚动导航设置" aria-busy={loading||busy}>
    <div className="ec-scroll-content" ref={contentRef}>
    {view==='home'&&<div className="ec-scroll-home">
      {pageControl?<ManagedPageControl control={pageControl} title={title} heading="自动运行" compact/>:
        <p role="status">自动运行状态尚未读取，请刷新可信状态。</p>}
      <section className="ec-scroll-group" aria-labelledby="scroll-builtins-title">
        <div className="ec-scroll-title"><h3 id="scroll-builtins-title">内置网站</h3>
          <IconButton id="scroll-builtins" label="查看全部内置网站" title="查看全部内置网站（3 个）"
            onClick={()=>navigate('builtins')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>
          </IconButton></div>
        {builtinList()}
      </section>
      <section className="ec-scroll-group" aria-labelledby="scroll-custom-title">
        <div className="ec-scroll-title"><h3 id="scroll-custom-title">自定义网站</h3>
          <div className="ec-scroll-title-actions">
            <IconButton id="scroll-sites" label="管理自定义网站" onClick={()=>navigate('sites')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16 11-11 4 4-11 11H4zM13 7l4 4"/></svg>
            </IconButton>
            <IconButton id="scroll-add-home" label="添加自定义网站" disabled={writesDisabled}
              onClick={()=>void open(null,'home')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>
            </IconButton>
          </div></div>
        {loading?<p role="status" className="ec-scroll-empty">正在读取网站规则…</p>:siteList()}
      </section>
    </div>}
    {view==='builtins'&&<div className="ec-scroll-subview">
      <h3>当前已内置 {SCROLL_BUILTINS.length} 个网站</h3>
      {builtinList(true)}
      <p className="ec-scroll-help">内置支持不代表当前网页已获得访问权限或 DOM 适配成功。</p>
      <Button id="scroll-add-builtin" disabled={writesDisabled} onClick={()=>void open(null,'builtins')}>添加其他 AI 网站</Button>
    </div>}
    {view==='sites'&&<div className="ec-scroll-subview">
      <p className="ec-scroll-help">这里仅管理已添加的网站；导航功能统一在设置中控制。</p>
      {loading?<p role="status">正在读取网站规则…</p>:siteList(true)}
    </div>}
    {view==='settings'&&<div className="ec-scroll-subview">
      {!snapshot?<p role="status">{loading?'正在读取导航设置…':'导航设置尚未读取，请重新读取真实状态。'}</p>:
        <div className="ec-scroll-flags">{SCROLL_FLAG_GROUPS.map(([group,flags])=><div role="group" aria-label={group} key={group}>
          <h3 className="ec-scroll-flag-group">{group}</h3>
          {flags.map(([key,label])=><div key={key} className="ec-scroll-flag"
            onPointerDownCapture={captureNavigation} onPointerUpCapture={captureNavigation}
            onKeyDownCapture={captureNavigation} onKeyUpCapture={captureNavigation} onClickCapture={captureNavigation}
            onBlurCapture={()=>{navigationGesture.current=null;}}><span>{label}</span><Switch
              isSelected={snapshot.value.navigation?.[key]!==false} isDisabled={writesDisabled}
              aria-label={label} onChange={value=>{
                const event=navigationGesture.current;navigationGesture.current=null;
                if(event?.isTrusted===true)void toggleNavigation(key,value,event);
              }}/></div>)}
        </div>)}</div>}
      <p className="ec-scroll-help">所有网站共用一组设置，更改后自动保存并读回；仅在已授权且适配成功的网站生效。</p>
      <Button id="scroll-management" variant="quiet" onClick={()=>navigate('management')}>权限与技术信息</Button>
    </div>}
    {view==='management'&&detail&&<div className="ec-scroll-subview">
      <p className="ec-scroll-help">管理已安装应用的更新、网站权限和卸载。</p>
      <DetailActions model={detail}/>
      <p>{detail.installationText} · 修订：r{detail.version}</p>
      {detail.pageInfo&&<PageDiagnostics info={detail.pageInfo}/>}
    </div>}
    {view==='editor'&&draft&&<>
      {discard&&<div className="ec-scroll-discard" role="alert">
        <p>放弃未保存的网站更改？此前已保存的规则会保留。</p>
        <Button data-keep-editing onClick={()=>{pendingFocus.current='scroll-origin';setDiscard(false);}}>继续编辑</Button>
        <Button variant="danger" onClick={leaveEditor}>放弃更改</Button>
      </div>}
      <form id="scroll-site-form" className="ec-scroll-editor" onSubmit={save} noValidate>
      <h4>网站信息</h4>
      <div className="ec-scroll-field">
        <label htmlFor="scroll-origin">网站地址<span className="ec-scroll-required" aria-hidden="true">*</span></label>
        <div className="ec-scroll-origin">
          <input id="scroll-origin" ref={originInput} type="url" value={draft.origin}
            maxLength={256} autoComplete="off" placeholder="https://example.ai"
            aria-required="true" aria-invalid={Boolean(touched.origin&&!origin)}
            aria-describedby="scroll-origin-help scroll-origin-error" disabled={busy}
            onChange={event=>update('origin',event.target.value)}/>
          {draft.origin&&<IconButton className="ec-scroll-clear" label="清空网站地址" disabled={busy}
            onClick={()=>{update('origin','');originInput.current?.focus({preventScroll:true});}}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </IconButton>}
        </div>
        <p id="scroll-origin-help" className="ec-scroll-help">自动使用当前网页域名；仅匹配相同网站，页面路径请单独设置。</p>
        <div id="scroll-origin-error">
          {touched.origin&&!origin&&<p className="ec-scroll-error" role="alert">请输入精确的 HTTP(S) 网站 Origin，网页路径请单独填写。</p>}
          {duplicateBuiltIn&&<p className="ec-scroll-notice">此网站已内置支持，不需要重复添加规则。</p>}
        </div>
      </div>
      <div className="ec-scroll-field">
        <label htmlFor="scroll-path">适用路径<span className="ec-scroll-required" aria-hidden="true">*</span></label>
        <input id="scroll-path" type="text" value={draft.pathScope} maxLength={512}
          placeholder="/" autoComplete="off" aria-required="true" disabled={busy}
          aria-describedby="scroll-path-help scroll-path-error" aria-invalid={Boolean((touched.pathScope&&!pathValid)||duplicateSaved)}
          onChange={event=>update('pathScope',event.target.value)}/>
        <p id="scroll-path-help" className="ec-scroll-help">按路径前缀匹配，建议使用稳定的 /chat，而不是具体会话编号。</p>
        <div id="scroll-path-error">
          {touched.pathScope&&!pathValid&&<p className="ec-scroll-error" role="alert">路径需以 / 开始，不能包含通配符、查询参数或跳转片段。</p>}
          {duplicateSaved&&<p className="ec-scroll-error" role="alert">同一网站和路径已存在规则，请编辑已有配置。</p>}
        </div>
      </div>
      {needPermission&&<div className="ec-scroll-permission">
        <p>此范围尚未在安装记录中获批，请先审阅权限；授权完成后返回编辑，仍需单击保存。</p>
        <Button disabled={busy||Boolean(model.disabledReason)} onClick={event=>void review(event)}>审阅网站权限</Button>
      </div>}
      <h4>网站适配</h4>
      {SCROLL_CSS_FIELDS.map(([key,label,field,required])=><div className="ec-scroll-field ec-scroll-css-field" key={key}>
        <label htmlFor={'scroll-'+key}>{label}{required&&<span className="ec-scroll-required" aria-hidden="true">*</span>}</label>
        <div className="ec-scroll-selector"><input type="text" id={'scroll-'+key}
          ref={node=>{selectorInputs.current[key]=node;}} value={draft[key]} maxLength={256}
          aria-required={required?'true':undefined} aria-describedby={'scroll-'+key+'-error'}
          aria-invalid={Boolean(fieldErrors[key]&&touched[key])} spellCheck={false}
          autoComplete="off" disabled={busy} placeholder="CSS 或点选"
          onChange={event=>update(key,event.target.value)} onBlur={()=>setTouched(old=>({...old,[key]:true}))}/>
          <IconButton label={'在网页选取'+label} className="ec-scroll-picker"
            disabled={busy||needsReconcile||!approved||Boolean(model.disabledReason)} onClick={event=>void pick(field,key,event)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg>
          </IconButton>
        </div>
        <div id={'scroll-'+key+'-error'}>{fieldErrors[key]&&touched[key]&&<p className="ec-scroll-error" role="alert">{fieldErrors[key]}</p>}</div>
      </div>)}
      </form>
    </>}
    {(needsReconcile||(!snapshot&&!loading))&&<Button disabled={busy} onClick={()=>void readAgain()}>重新读取核对</Button>}
    {model.disabledReason&&<p role="status">{model.disabledReason}</p>}
    {notice&&<p role="status" className="ec-scroll-notice">{notice}</p>}
    {error&&<p role="alert" className="ec-scroll-error">{error}</p>}
    </div>
    {view==='editor'&&draft&&<div className="ec-scroll-actionbar" aria-label="保存网站操作">
      <span role="status" aria-live="polite">{busy?'正在处理，请稍候':needsReconcile?'写入结果待核对':
        loading?'正在读取配置':!snapshot?'配置尚未读取':!valid?'请先完成必填项或检查网站信息与 CSS':
        !approved?'需要先审阅权限':!dirty?'没有未保存的更改':'可保存网站规则'}</span>
      <Button type="submit" form="scroll-site-form" variant="primary" className="ec-scroll-save"
        disabled={writesDisabled||discard||!dirty||!valid||!approved}>{busy?'正在核对…':editingKey?'保存更改':'保存网站'}</Button>
    </div>}
  </section>;
}

function PageSiteUpgrade({upgrade}){
  return <form className="ec-site-upgrade" aria-label={upgrade.title||'添加自定义网站'}
    onSubmit={event=>{
      event.preventDefault();
      const fields=event.currentTarget.elements;
      upgrade.onSubmit?.({
        origin:fields.namedItem('origin')?.value||'',
        pathScope:fields.namedItem('pathScope')?.value||'/'
      },event.nativeEvent);
    }}>
    <h4>{upgrade.title||'添加自定义网站'}</h4>
    {upgrade.description&&<p>{upgrade.description}</p>}
    <label>网站 Origin
      <input name="origin" type="url" required maxLength={256}
        placeholder="https://example.com" autoComplete="off"
        disabled={Boolean(upgrade.disabledReason||upgrade.busy)}/>
    </label>
    <label>运行路径前缀
      <input name="pathScope" type="text" defaultValue="/" required maxLength={512}
        autoComplete="off"
        disabled={Boolean(upgrade.disabledReason||upgrade.busy)}/>
    </label>
    {upgrade.permissionNote&&<p>{upgrade.permissionNote}</p>}
    {upgrade.disabledReason&&<p role="status">{upgrade.disabledReason}</p>}
    {upgrade.error&&<p role="alert">{upgrade.error}</p>}
    <Button type="submit" disabled={Boolean(upgrade.disabledReason||upgrade.busy)}>
      {upgrade.busy?'正在准备候选…':'审阅新增网站权限'}
    </Button>
  </form>;
}

function PageDiagnostics({info}){
  return <>
    <p>来源：{info?.source||'来源未记录'}</p>
    <p>安装身份：{info?.installationId||'待核对'}</p>
    <p>授权状态：{info?.authorization||'未知'}</p>
    <p>Chrome 注册：{info?.nativeState||'未知'}</p>
    {info?.nativeId&&<p>注册 ID：{info.nativeId}</p>}
    {info?.sourceHash&&<p>固定源码 SHA-256：{info.sourceHash}</p>}
    {info?.manifestHash&&<p>安装 Manifest SHA-256：{info.manifestHash}</p>}
    {info?.packageHash&&<p>安装包 SHA-256：{info.packageHash}</p>}
    {info?.cleanupState&&<p>受管界面清理：{info.cleanupState}</p>}
    {info?.error&&<p role="status">注册错误：{info.error}</p>}
    <p>排除网站：{info?.excluded?.join('、')||'无'}</p>
    <p>授权能力：{info?.capabilities?.join('、')||'未记录'}</p>
    <p>网络来源：{info?.networkOrigins?.join('、')||'未记录'}</p>
    <p>数据规则：{info?.dataRule}</p>
  </>;
}

function DetailActions({model}){
  return <div className="ec-detail-actions">
    {model.actions.map(action=>{
      const icon=extensionActionGlyph(action.id,action.label);
      return icon?<IconButton key={action.id}
        className={action.id==='uninstall'?'ec-detail-action od-icon-button--danger':'ec-detail-action'}
        disabled={model.busy} label={action.label+'「'+model.title+'」'} title={action.label}
        data-ec-detail-action={action.id}
        onClick={event=>action.onClick?.(event.nativeEvent)}>{icon}</IconButton>:
        <Button key={action.id} disabled={model.busy} data-ec-detail-action={action.id}
          onClick={event=>action.onClick?.(event.nativeEvent)}>{action.label}</Button>;
    })}
  </div>;
}

// Detail actions retain the originating native event. Identity and permission
// checks remain with the existing Extension Center controller.
export function ExtensionDetail({model,container,onScrollNavigation,scrollNavigation}){
  React.useLayoutEffect(()=>{
    if(!model||model.busy||!model.focusAction)return;
    const target=[...(container?.querySelectorAll('[data-ec-detail-action]')||[])]
      .find(node=>node.dataset.ecDetailAction===model.focusAction);
    (target?.querySelector?.('[role="switch"]')||target)?.focus?.({preventScroll:true});
  },[model,container]);
  if(!model)return null;
  const managed=model.kind==='page'&&Boolean(model.pageControl);
  // Render Authority/official scopes only. Never infer capabilities from titles.
  const sites=Array.isArray(model.sites)?model.sites.filter(s=>typeof s==='string'&&s.trim()):[];
  return <>
    <div className="ec-detail-head">
      {!model.scrollManager&&<span className="ec-glyph" aria-hidden="true">{model.kind==='page'?'◇':'▦'}</span>}
      <div className="ec-detail-copy">
        <strong id={model.scrollManager?'scroll-page-title':undefined} tabIndex={model.scrollManager?-1:undefined}
          role={model.scrollManager?'heading':undefined} aria-level={model.scrollManager?1:undefined}
          title={scrollNavigation?.title?model.title+' / '+scrollNavigation.title:model.title}>
          {scrollNavigation?.title||model.title}</strong>{!model.scrollManager&&<span className="ec-type">{model.type}</span>}
      </div>
      {model.scrollManager&&(!scrollNavigation?.view||scrollNavigation.view==='home')&&
        <IconButton id="scroll-settings" label="导航设置" disabled={!scrollNavigation||scrollNavigation.busy}
          onClick={()=>scrollNavigation?.openSettings?.()}>{extensionActionGlyph('settings')}</IconButton>}
      {model.scrollManager&&scrollNavigation?.view==='sites'&&
        <IconButton id="scroll-add-sites" label="添加网站" disabled={!scrollNavigation.canAdd}
          onClick={()=>scrollNavigation.addSite()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>
        </IconButton>}
    </div>
    {model.description&&!model.scrollManager&&<p className="ec-detail-description">{model.description}</p>}
    {managed&&!model.scrollManager&&<ManagedPageControl control={model.pageControl} title={model.title}/>}
    {model.scrollManager&&<ScrollSiteManager key={model.scrollManager.identityKey}
      model={model.scrollManager} pageControl={model.pageControl} title={model.title} detail={model}
      onNavigation={onScrollNavigation}/>}
    {!managed&&<DetailActions model={model}/>}
    {!managed&&<section className="ec-detail-card">
      <h3>安装与来源</h3>
      <p>{model.installationText}</p>
      <p>{model.kind==='app'?'版本：v':'修订：r'}{model.version}</p>
      {model.kind==='app'&&<>
        {model.installed?<><p>来源：{model.source?.label||'暂未读取安装来源'}</p>
          {model.source?.sha256&&<p>固定包 SHA-256：{model.source.sha256}</p>}
          <p>{model.usageText||'应用已安装，可按需打开界面。'}</p>
          <p>{model.appDataText}</p></>:<p>{model.cleanupPending?
          '请先恢复上次卸载的数据与权限清理，不会自动重新安装。':
          '正式安装必须在现有应用市场审阅固定包和能力清单。'}</p>}
      </>}
    </section>}
    {model.kind==='page'&&!model.scrollManager&&(sites.length>0||model.siteUpgrade)&&<section className="ec-detail-card ec-page-sites">
      <h3>适用网站</h3>
      {sites.length>0&&<ul className="ec-sites">{sites.map(site=><li key={site}>{site}</li>)}</ul>}
      {model.suspended&&<p role="status">网站访问受限，需按原授权流程恢复。</p>}
      {model.siteUpgrade&&<details className="ec-site-review-details">
        <summary>{model.siteUpgrade.summary||'添加自定义网站（需审阅）'}</summary>
        <PageSiteUpgrade upgrade={model.siteUpgrade}/>
      </details>}
    </section>}
    {managed&&!model.scrollManager&&<section className="ec-detail-card ec-page-management">
      <div className="ec-page-management-head">
        <h3>设置与管理</h3>
        <span className="ec-page-version">r{model.version}</span>
      </div>
      {model.pageControl.officialBlock&&<p className="ec-page-release-block" role="status">
        官方发行仍受限：{model.pageControl.officialBlock}
      </p>}
      <DetailActions model={model}/>
    </section>}
    {model.kind==='page'&&!model.scrollManager&&model.pageInfo&&<details className="ec-detail-card ec-page-diagnostics">
      <summary>权限、版本与技术信息</summary>
      <p>{model.installationText} · 修订：r{model.version}</p>
      <PageDiagnostics info={model.pageInfo}/>
    </details>}
  </>;
}


// Search and filter UI belongs to React. The existing Extension Center owns
// query/filter values, refresh, installation/Host actions and locale storage.
// Existing IDs/ARIA/CSS are preserved for accessibility and legacy contracts.
export function ExtensionToolbar({model}){
  const current=model||{};
  const kind=current.kind||'all',scope=current.scope||'smart';
  const menuOpen=Boolean(current.menuOpen);
  return <>
    <label className="ec-search" htmlFor="extension-center-search">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
      <input id="extension-center-search" type="search" placeholder="搜索当前列表"
        autoComplete="off" value={current.query||''}
        onChange={event=>current.onSearch?.(event.currentTarget.value,event.nativeEvent)}/>
    </label>
    <IconButton id="extension-center-market" className="ec-icon" label="在新标签页打开应用市场"
      onClick={event=>current.onMarket?.(event.nativeEvent)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16l-1.5-6h-13L4 10Zm2 0v10h12V10M10 20v-6h4v6"/></svg>
    </IconButton>
    <div id="extension-center-menu-wrap" className="ec-menu-wrap">
      <IconButton id="extension-center-more" className="ec-icon" label="筛选和管理扩展"
        title="扩展筛选与更多操作" aria-haspopup="true"
        aria-expanded={menuOpen} aria-controls="extension-center-menu"
        data-active={String(kind!=='all'||scope!=='smart')}
        onClick={event=>current.onToggleMenu?.(event.nativeEvent)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
      </IconButton>
      <div id="extension-center-menu" className="ec-more" role="group"
        aria-label="扩展筛选和操作" hidden={!menuOpen}>
        <fieldset><legend>类型</legend><div className="ec-filter-group">
          {[[ 'all','全部'],['app','应用'],['page','网页增强']].map(([value,label])=>
            <button key={value} type="button" data-ec-kind={value}
              aria-pressed={kind===value} onClick={event=>current.onKind?.(value,event.nativeEvent)}>{label}</button>)}
        </div></fieldset>
        <fieldset><legend>显示范围</legend><div className="ec-filter-group">
          {[[ 'smart','已安装'],['available','可安装 / 更新']].map(([value,label])=>
            <button key={value} type="button" data-ec-scope={value}
              aria-pressed={scope===value} onClick={event=>current.onScope?.(value,event.nativeEvent)}>{label}</button>)}
        </div></fieldset>
        <button id="extension-center-reset" className="ec-menu-action" type="button"
          onClick={event=>current.onReset?.(event.nativeEvent)}>恢复默认筛选</button>
        <div className="ec-menu-separator">
          <Button id="extension-center-language-settings" className="ec-menu-action"
            onClick={event=>current.onLanguageSettings?.(event.nativeEvent)}>语言与翻译</Button>
           <button id="extension-center-import" className="ec-menu-action" type="button"
            onClick={event=>current.onImport?.(event.nativeEvent)}>导入扩展…</button>
          <button id="extension-center-reload" className="ec-menu-action" type="button"
            onClick={event=>current.onReload?.(event.nativeEvent)}>刷新扩展</button>
        </div>
      </div>
    </div>
  </>;
}


// The trusted React shell alone owns these remaining Extension Center DOM
// children and their hidden/status attributes. Host/permission/cleanup
// decisions still belong to the existing Extension Center controller.
export function ExtensionEmpty({model}){
  return <p id="extension-center-empty-text">{model?.emptyText||''}</p>;
}

export function ExtensionRecoveries({model}){
  const ids=model?.ids||[];
  if(!ids.length)return null;
  return <>
    <p>以下扩展已从安装记录移除，但清理仍待完成：</p>
    {ids.map(id=><p key={id}>
      {id+' · 卸载清理待恢复'}
      <Button disabled={Boolean(model.busy)} aria-label={'恢复「'+id+'」的卸载清理'}
        onClick={event=>model.onRetry?.(id,event.nativeEvent)}>恢复清理</Button>
    </p>)}
  </>;
}

export function ExtensionStatus({model}){
  return model?.text||'';
}

 
// One React-owned menu, including its host, placement and listener lifetime.
// The portal remains part of this page/root and escapes the clipped list.
export function ExtensionRowMenu({items=[],model=null}){
  const ref=React.useRef(null);
  React.useLayoutEffect(()=>{
    const menu=ref.current,trigger=model?.trigger;
    if(!menu||!trigger)return;
    const doc=trigger.ownerDocument,view=doc.defaultView;
    const rect=trigger.getBoundingClientRect();
    const screenW=view?.innerWidth||doc.documentElement.clientWidth;
    const screenH=view?.innerHeight||doc.documentElement.clientHeight;
    const width=menu.offsetWidth,height=menu.offsetHeight,gutter=8;
    menu.style.left=Math.max(gutter,Math.min(rect.right-width,screenW-width-gutter))+'px';
    menu.style.top=(rect.bottom+height+gutter<=screenH?rect.bottom+3:
      Math.max(gutter,rect.top-height-3))+'px';
    menu.querySelector('button')?.focus({preventScroll:true});
    const clickOutside=event=>{
      if(!menu.contains(event.target)&&!trigger.contains(event.target))model.onClose?.(false);
    };
    const keyDown=event=>{
      if(event.key==='Escape'){
        event.preventDefault();model.onClose?.(true);return;
      }
      if(!menu.contains(doc.activeElement))return;
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();
        const buttons=[...menu.querySelectorAll('button')],index=buttons.indexOf(doc.activeElement);
        const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:
          (index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
        buttons[next]?.focus({preventScroll:true});
      }else if(event.key==='Tab')model.onClose?.(true);
    };
    const scroll=event=>{if(!menu.contains(event.target))model.onClose?.(false);};
    doc.addEventListener('click',clickOutside);doc.addEventListener('keydown',keyDown);
    doc.addEventListener('scroll',scroll,true);
    return ()=>{
      doc.removeEventListener('click',clickOutside);doc.removeEventListener('keydown',keyDown);
      doc.removeEventListener('scroll',scroll,true);
    };
  },[model]);
  const buttons=(model?.items||items).map(item=><button type="button" key={item.id}
    className="ec-context-action" role="menuitem" data-ec-context-action={item.id}
    onClick={event=>item.onClick?.(event.nativeEvent)}>{item.label}</button>);
  if(!model)return buttons;
  return createPortal(<div ref={ref} id="extension-center-row-menu" className="ec-context-menu"
    role="menu" aria-label={'管理「'+model.title+'」'}>{buttons}</div>,model.trigger.ownerDocument.body);
}

// A read-only discovery result; install authority remains with the existing Host.
export function ExtensionDiscovery({model,onDiscover,showEntry=false}){
  if(!model&&!showEntry)return null;
  const found=model?.state==='found';
  const retry=model?.state==='error'||model?.state==='empty';
  const activate=event=>{
    if(found)model.onReview?.(event.nativeEvent);
    else if(retry)model.onRetry?.(event.nativeEvent);
    else if(!model)onDiscover?.(event.nativeEvent);
  };
  return <section id="extension-center-discovery" className="ec-discovery"
    aria-label="当前网页安装发现" aria-busy={model?.state==='loading'||Boolean(model?.busy)}>
    <div className="ec-discovery-copy">
      <strong>{found?model.title+' · v'+model.version:
        model?.state==='loading'?'正在检测当前网页':model?'当前网页安装入口':'从当前网页安装'}</strong>
      {found&&model.origin&&<span className="ec-discovery-origin">{model.origin}</span>}
      <p role="status" data-state={model?.state}>
        {model?.message||'仅检查网页声明的 OpenDesk 官方应用，不会直接安装。'}
      </p>
    </div>
    <div className="ec-discovery-actions">
      <Button id="extension-center-discover" disabled={Boolean(model?.busy)}
        aria-disabled={model?.state==='loading'||undefined}
        onClick={activate}>
        {found?(model.busy?'正在核对…':'查看应用详情'):
          model?.state==='loading'?'正在检测…':retry?'重新检测':'检查网页安装入口'}
      </Button>
      {model&&<IconButton label="关闭网页发现结果" title="关闭"
        onClick={event=>model.onDismiss?.(event.nativeEvent)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </IconButton>}
    </div>
  </section>;
}

// React owns the complete Extension Center presentation within one subtree.
// The pre-existing Installer is mounted into one explicit host-owned slot;
// security decisions and dynamically installed UI are never executed here.
export function ExtensionCenterPage({
  rowsModel={rows:[],busy:false,pendingKey:null,onOpenRow:()=>{},onMore:()=>{}},
  toolbarModel=null,detailModel=null,uninstallModel=null,feedbackModel=null,recoveryModel=null,discoveryModel=null,
  statusModel=null,menuKey=null,rowMenuModel=null,view='list',onBack=()=>{}
}){
  const languageVisible=Boolean(toolbarModel?.localeManager);
  const detailVisible=view==='detail'&&!languageVisible;
  const showWebDiscovery=toolbarModel?.scope==='available'&&toolbarModel?.kind!=='page'&&
    toolbarModel?.marketDiscoveryAvailable===true;
  const detailRef=React.useRef(null),pageRef=React.useRef(null);
  const [scrollNavigation,setScrollNavigation]=React.useState(null);
  const scrollNav=detailVisible&&detailModel?.scrollManager?.identityKey===scrollNavigation?.identityKey
    ?scrollNavigation:null;
  const detailBack=event=>{
    if(scrollNav?.busy)return;
    if(scrollNav?.back)scrollNav.back();else onBack(event);
  };
  const detailBackRef=React.useRef(detailBack);detailBackRef.current=detailBack;
  const [fileOver,setFileOver]=React.useState(false);
  const fileDragDepth=React.useRef(0);
  const isFileDrag=event=>Array.from(event.dataTransfer?.types||[]).includes('Files');
  const onDragEnter=event=>{
    if(languageVisible||!isFileDrag(event))return;
    event.preventDefault();fileDragDepth.current++;setFileOver(true);
  };
  const onDragOver=event=>{
    if(languageVisible||!isFileDrag(event))return;
    event.preventDefault();event.dataTransfer.dropEffect='copy';
  };
  const onDragLeave=event=>{
    if(languageVisible||!isFileDrag(event))return;
    fileDragDepth.current=Math.max(0,fileDragDepth.current-1);
    if(!fileDragDepth.current)setFileOver(false);
  };
  const onDrop=event=>{
    if(languageVisible||!isFileDrag(event))return;
    event.preventDefault();event.stopPropagation();
    fileDragDepth.current=0;setFileOver(false);
    toolbarModel?.onImportFiles?.(Array.from(event.dataTransfer.files||[]));
  };
  React.useEffect(()=>{
    const doc=pageRef.current?.ownerDocument;
    if(!doc)return;
    const clickOutside=event=>{
      if(toolbarModel?.menuOpen&&!doc.getElementById('extension-center-menu-wrap')?.contains(event.target))
        toolbarModel.onCloseMenu?.(false);
    };
    const keyDown=event=>{
      if(event.defaultPrevented||event.key!=='Escape')return;
      if(doc.documentElement.dataset.opendeskTab&&doc.documentElement.dataset.opendeskTab!=='tools')return;
      if(detailVisible&&detailRef.current?.closest('[hidden],[inert]'))return;
      if(toolbarModel?.menuOpen){event.preventDefault();toolbarModel.onCloseMenu?.(true);}
      else if(detailVisible){event.preventDefault();detailBackRef.current(event);}
    };
    doc.addEventListener('click',clickOutside);doc.addEventListener('keydown',keyDown);
    return ()=>{doc.removeEventListener('click',clickOutside);doc.removeEventListener('keydown',keyDown);};
  },[toolbarModel,detailVisible,onBack]);
  return <div className="ec-drop-surface"
    onDragEnter={onDragEnter} onDragOver={onDragOver}
    onDragLeave={onDragLeave} onDrop={onDrop}>
    <div ref={pageRef} id="extension-center-list-view" hidden={detailVisible||languageVisible}>
      <div className="ec-toolbar"><ExtensionToolbar model={toolbarModel}/></div>
      <ExtensionDiscovery model={showWebDiscovery?discoveryModel:null}
        showEntry={showWebDiscovery} onDiscover={toolbarModel?.onDiscover}/>
      <input id="extension-center-file" type="file" accept=".json,application/json" hidden
        aria-label="选择扩展安装包或语言包" onChange={event=>{
          toolbarModel?.onImportFiles?.(Array.from(event.currentTarget.files||[]));event.currentTarget.value='';
        }}/>
      <div id="extension-center-import-host"></div>
      <span id="extension-center-count" className="visually-hidden" aria-live="polite">
        {feedbackModel?.countText||'正在读取扩展…'}
      </span>
      <ul id="extension-center-list" className="ec-list" aria-label="扩展中心当前筛选列表"
        aria-busy={Boolean(rowsModel.busy||rowsModel.pendingKey)}>
        <ExtensionRows {...rowsModel} menuKey={menuKey}/>
      </ul>
      <div id="extension-center-cleanups" className="ec-empty" aria-live="polite"
        hidden={!recoveryModel?.ids?.length}>
        <ExtensionRecoveries model={recoveryModel}/>
      </div>
      <div id="extension-center-empty" className="ec-empty" hidden={!feedbackModel?.showEmpty}>
        <ExtensionEmpty model={feedbackModel}/>
      </div>
    </div>
    <section id="extension-center-detail" className="ec-detail" aria-label="扩展详情"
      data-scroll-app={detailModel?.scrollManager?'true':undefined}
      hidden={!detailVisible}>
      <IconButton id="extension-center-back" className="ec-detail-back"
        label={scrollNav?.back?scrollNav.backLabel||'返回上一页':'返回扩展列表'} disabled={Boolean(scrollNav?.busy)}
        onClick={event=>detailBack(event.nativeEvent)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m14 6-6 6 6 6"/>
        </svg>
      </IconButton>
      <div ref={detailRef} id="extension-center-detail-body">
        <ExtensionDetail model={detailModel} container={detailRef.current}
          onScrollNavigation={setScrollNavigation} scrollNavigation={scrollNav}/>
      </div>
    </section>
    <UninstallDialog open={detailVisible&&Boolean(detailModel?.confirmation)}
      title={'卸载「'+(detailModel?.title||'网页增强')+'」？'}
      busy={Boolean(detailModel?.busy)}
      identity={detailModel}
      description={detailModel?.confirmation?.text||''}
      returnFocusSelector='#extension-center-detail [data-ec-detail-action="uninstall"]'
      onCancel={event=>detailModel?.confirmation?.onCancel(event)}>
      <div className="od-uninstall-dialog-actions">
        <Button data-uninstall-cancel="true" disabled={Boolean(detailModel?.busy)}
          onClick={event=>detailModel?.confirmation?.onCancel(event.nativeEvent)}>取消</Button>
        <Button className="od-uninstall-confirm" disabled={Boolean(detailModel?.busy)}
          onClick={event=>detailModel?.confirmation?.onConfirm(event.nativeEvent)}>
          {detailModel?.busy?'正在卸载…':'确认卸载'}</Button>
      </div>
    </UninstallDialog>
    <UninstallDialog open={Boolean(uninstallModel)}
      title={uninstallModel?.title||'卸载扩展？'}
      busy={Boolean(uninstallModel?.busy)}
      identity={uninstallModel?.identity}
      description={uninstallModel?.text||''}
      onCancel={event=>uninstallModel?.onCancel?.(event)}>
      <div className="od-uninstall-dialog-actions">
        <Button data-uninstall-cancel="true" disabled={Boolean(uninstallModel?.busy)}
          onClick={event=>uninstallModel?.onCancel?.(event.nativeEvent)}>取消</Button>
        <Button className="od-uninstall-confirm" disabled={Boolean(uninstallModel?.busy)}
          onClick={event=>uninstallModel?.onConfirm?.(event.nativeEvent)}>
          {uninstallModel?.busy?'正在卸载…':'确认卸载'}</Button>
      </div>
    </UninstallDialog>
    {languageVisible&&<section id="extension-center-locale" className="ec-locale-page" aria-label="语言与翻译">
      <React.Suspense fallback={<p role="status">{localeManagerText(toolbarModel.localeManager.localeController?.getLocale?.()||'zh-CN','busy')}</p>}>
        <LocaleManager key={toolbarModel.localeManager.session} model={toolbarModel.localeManager}/>
      </React.Suspense>
    </section>}
    {rowMenuModel&&<ExtensionRowMenu model={rowMenuModel}/>}
    <p id="extension-center-status" className="ec-message" role="status"
      aria-live="polite" data-state={statusModel?.state||'info'}
      hidden={!statusModel?.text}>
      <ExtensionStatus model={statusModel}/>
    </p>
    {fileOver&&<div className="ec-file-drop-overlay" role="status" aria-live="polite">
      <strong>松开以导入扩展安装包或语言包</strong>
      <span>语言包进入翻译预览；代码安装包仍需审阅版本与权限</span>
    </div>}
  </div>;
}
