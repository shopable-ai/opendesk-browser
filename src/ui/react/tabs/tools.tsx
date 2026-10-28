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
function ManagedPageControl({control,title}){
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
        <h3>启用此网页增强</h3>
        <p>在已授权的网站自动运行</p>
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
  ['mainSelector','对话主区域','main'],
  ['scrollSelector','滚动容器','scroller'],
  ['messageSelector','消息节点（可选）','messages'],
  ['anchorSelector','按钮锚点（可选）','anchor']
];
function ScrollSiteManager({model}){
  const [snapshot,setSnapshot]=React.useState(null);
  const [loading,setLoading]=React.useState(true);
  const [error,setError]=React.useState('');
  const [notice,setNotice]=React.useState('');
  const [busy,setBusy]=React.useState(false);
  const [editingKey,setEditingKey]=React.useState(model.resumeDraft?.editKey??null);
  const [draft,setDraft]=React.useState(model.resumeDraft||null);
  const [confirmDelete,setConfirmDelete]=React.useState(false);
  const ref=React.useRef(model);ref.current=model;
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
  const change=(key,value)=>{
    const next={...(draft||EMPTY_SCROLL_SITE),[key]:value};
    setDraft(next);
    ref.current.onDraftChange(next,editingKey);
    setError('');setNotice('');
  };
  const open=(item=null)=>{
    const value=item?{...item}:{...EMPTY_SCROLL_SITE};
    const key=item?item.origin+'\n'+item.pathScope:null;
    setEditingKey(key);setDraft(value);setNotice('');setError('');setConfirmDelete(false);
  };
  const cancel=()=>{
    const saved=editingKey?snapshot?.value?.sites?.find(x=>x.origin+'\n'+x.pathScope===editingKey):null;
    if(draft&&JSON.stringify(draft)!==JSON.stringify(saved||EMPTY_SCROLL_SITE)&&
      typeof window!=='undefined'&&window.confirm&&!window.confirm('放弃未保存的网站更改？'))return;
    ref.current.onDraftChange(null,null);
    setDraft(null);setEditingKey(null);setError('');setNotice('');setConfirmDelete(false);
  };
  const current=()=>{
    const target=model.currentPage;
    if(target?.status!=='available'){setError('当前窗口没有可用的 HTTP(S) 网页。');return;}
    change('origin',target.origin);
  };
  const pick=async(field,event)=>{
    if(busy||!draft)return;
    setBusy(true);setError('');setNotice('请在当前网页悬停并单击目标；Esc 取消。');
    try{
      const result=await ref.current.onPick(field,draft.origin,draft.mainSelector,event.nativeEvent);
      if(result?.state==='selected'&&typeof result.selector==='string'){
        change(({main:'mainSelector',scroller:'scrollSelector',
          messages:'messageSelector',anchor:'anchorSelector'})[field],result.selector);
        setNotice('已从当前网页选取真实 CSS：'+result.selector);
      }else if(result?.state==='cancelled')setNotice('已取消点选，其他输入保持不变。');
      else throw new Error(result?.state==='timeout'?'点选已超时，请重新选取':'目标不可选或网页已变化，请重新选取');
    }catch(e){setError((e?.code||'E_PICK')+'：'+(e?.message||e));setNotice('');}
    finally{setBusy(false);}
  };
  const submit=async(event,remove=false)=>{
    event.preventDefault();if(busy||!snapshot||!draft)return;
    setError('');setNotice('');setBusy(true);
    try{
      let rule=null;
      if(!remove){
        const url=new URL(draft.origin);
        if(!['http:','https:'].includes(url.protocol)||url.username||url.password)
          throw new Error('网站地址必须是有效的 HTTP(S) 地址');
        rule={origin:url.origin,pathScope:draft.pathScope.trim()||'/',
          mainSelector:draft.mainSelector.trim(),scrollSelector:draft.scrollSelector.trim(),
          messageSelector:draft.messageSelector.trim(),anchorSelector:draft.anchorSelector.trim(),
          enabled:Boolean(draft.enabled)};
        if(!rule.mainSelector||!rule.scrollSelector)
          throw new Error('对话主区域和滚动容器为必填项');
      }
      const saved=await ref.current.onSave(rule,snapshot.etag,editingKey,event.nativeEvent);
      if(saved?.review){setNotice('已转入原安装器审阅权限；授权后返回编辑，不代表保存成功。');return;}
      if(saved?.value?.version!==1||typeof saved.etag!=='string')
        throw new Error('缺少持久化确认');
      setSnapshot(saved);setDraft(null);setEditingKey(null);setConfirmDelete(false);
      setNotice(remove?'已删除规则并确认持久化。':'已保存网站并从可信 Host 读回；导航运行需在网页另外验证。');
    }catch(e){setError((e?.code||'E_SITE_SAVE')+'：'+(e?.message||e)+
      '。草稿保留；未知写入不能自动重试，请重新读取核对。');}
    finally{setBusy(false);}
  };
  return <section className="ec-detail-card ec-scroll-site-manager" aria-label="AI 对话滚动导航 · 网站管理">
    {!draft?<div className="ec-scroll-home">
      <div className="ec-scroll-title"><h3>内置网站</h3><span>已有适配</span></div>
      <ul className="ec-scroll-builtins">{model.builtIn.map(name=><li key={name}>{name}</li>)}</ul>
      <div className="ec-scroll-title"><h3>自定义网站</h3>
        <Button type="button" disabled={busy||loading||Boolean(model.disabledReason)}
          onClick={()=>open()}>添加网站</Button></div>
      {loading?<p role="status">正在从可信 Host 读取规则…</p>:
        snapshot?.value?.sites?.length?<ul className="ec-scroll-saved">
          {snapshot.value.sites.map(site=><li key={site.origin+site.pathScope}>
            <div><strong>{site.origin}</strong><span>{site.pathScope}</span></div>
            <Button type="button" disabled={Boolean(model.disabledReason)||busy}
              onClick={()=>open(site)}>编辑</Button>
          </li>)}</ul>:<p>尚未添加自定义网站。</p>}
    </div>:<form className="ec-scroll-editor" onSubmit={submit}>
      <div className="ec-scroll-title"><h3>{editingKey?'编辑网站':'添加网站'}</h3>
        <Button type="button" disabled={busy} onClick={cancel}>返回</Button></div>
      <label>网站地址
        <div className="ec-scroll-origin"><input type="url" value={draft.origin} maxLength={256}
          placeholder="https://example.com" autoComplete="off" required
          disabled={busy} onChange={e=>change('origin',e.target.value)}/>
          <Button type="button" disabled={busy} onClick={current}>当前页</Button></div>
      </label>
      <label>适用路径<input value={draft.pathScope} maxLength={512} required
        autoComplete="off" disabled={busy} placeholder="/" onChange={e=>change('pathScope',e.target.value)}/></label>
      {SCROLL_CSS_FIELDS.map(([key,label,field])=><label key={key}>{label}
        <div className="ec-scroll-selector"><input type="text" value={draft[key]} maxLength={256}
          required={key==='mainSelector'||key==='scrollSelector'} spellCheck={false}
          autoComplete="off" disabled={busy} placeholder={key==='anchorSelector'?'不填则自动定位':'CSS 或真实网页点选'}
          onChange={e=>change(key,e.target.value)}/>
          <IconButton type="button" disabled={busy} label={'在当前网页选取'+label}
            title={'选取'+label} onClick={event=>void pick(field,event)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/>
              <circle cx="12" cy="12" r="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg>
          </IconButton>
        </div></label>)}
      <label className="ec-scroll-enabled"><input type="checkbox" checked={draft.enabled}
        onChange={e=>change('enabled',e.target.checked)} disabled={busy}/>启用此规则</label>
      <Button type="submit" className="ec-scroll-save" disabled={busy||loading||Boolean(model.disabledReason)}>
        {busy?'正在核对…':'保存网站'}</Button>
      {editingKey&&<div className="ec-scroll-delete">
        {!confirmDelete?<Button type="button" disabled={busy} onClick={()=>setConfirmDelete(true)}>删除此规则…</Button>:
          <><span>删除这条网站规则？</span>
            <Button type="button" disabled={busy} onClick={e=>void submit(e,true)}>确认删除</Button>
            <Button type="button" disabled={busy} onClick={()=>setConfirmDelete(false)}>取消</Button></>}
      </div>}
    </form>}
    {model.disabledReason&&<p role="status">{model.disabledReason}</p>}
    {notice&&<p role="status" className="ec-scroll-notice">{notice}</p>}
    {error&&<p role="alert" className="ec-scroll-error">{error}</p>}
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
export function ExtensionDetail({model,container}){
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
      <span className="ec-glyph" aria-hidden="true">{model.kind==='page'?'◇':'▦'}</span>
      <div className="ec-detail-copy">
        <strong>{model.title}</strong><span className="ec-type">{model.type}</span>
      </div>
    </div>
    {model.description&&<p className="ec-detail-description">{model.description}</p>}
    {managed&&<ManagedPageControl control={model.pageControl} title={model.title}/>}
    {model.scrollManager&&<ScrollSiteManager key={model.scrollManager.identityKey} model={model.scrollManager}/>}
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
    {managed&&<section className="ec-detail-card ec-page-management">
      <div className="ec-page-management-head">
        <h3>设置与管理</h3>
        <span className="ec-page-version">r{model.version}</span>
      </div>
      {model.pageControl.officialBlock&&<p className="ec-page-release-block" role="status">
        官方发行仍受限：{model.pageControl.officialBlock}
      </p>}
      <DetailActions model={model}/>
    </section>}
    {model.kind==='page'&&model.pageInfo&&<details className="ec-detail-card ec-page-diagnostics">
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
  const detailVisible=view==='detail';
  const showWebDiscovery=toolbarModel?.scope==='available'&&toolbarModel?.kind!=='page'&&
    toolbarModel?.marketDiscoveryAvailable===true;
  const detailRef=React.useRef(null),pageRef=React.useRef(null);
  const [fileOver,setFileOver]=React.useState(false);
  const fileDragDepth=React.useRef(0);
  const isFileDrag=event=>Array.from(event.dataTransfer?.types||[]).includes('Files');
  const onDragEnter=event=>{
    if(!isFileDrag(event))return;
    event.preventDefault();fileDragDepth.current++;setFileOver(true);
  };
  const onDragOver=event=>{
    if(!isFileDrag(event))return;
    event.preventDefault();event.dataTransfer.dropEffect='copy';
  };
  const onDragLeave=event=>{
    if(!isFileDrag(event))return;
    fileDragDepth.current=Math.max(0,fileDragDepth.current-1);
    if(!fileDragDepth.current)setFileOver(false);
  };
  const onDrop=event=>{
    if(!isFileDrag(event))return;
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
      if(toolbarModel?.menuOpen){event.preventDefault();toolbarModel.onCloseMenu?.(true);}
      else if(detailVisible){event.preventDefault();onBack(event);}
    };
    doc.addEventListener('click',clickOutside);doc.addEventListener('keydown',keyDown);
    return ()=>{doc.removeEventListener('click',clickOutside);doc.removeEventListener('keydown',keyDown);};
  },[toolbarModel,detailVisible,onBack]);
  return <div className="ec-drop-surface"
    onDragEnter={onDragEnter} onDragOver={onDragOver}
    onDragLeave={onDragLeave} onDrop={onDrop}>
    <div ref={pageRef} id="extension-center-list-view" hidden={detailVisible}>
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
      hidden={!detailVisible}>
      <IconButton id="extension-center-back" className="ec-detail-back" label="返回扩展列表"
        onClick={event=>onBack(event.nativeEvent)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m14 6-6 6 6 6"/>
        </svg>
      </IconButton>
      <div ref={detailRef} id="extension-center-detail-body">
        <ExtensionDetail model={detailModel} container={detailRef.current}/>
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
    {toolbarModel?.localeManager&&<React.Suspense fallback={<p role="status">{localeManagerText(toolbarModel.localeManager.localeController?.getLocale?.()||'zh-CN','busy')}</p>}>
      <LocaleManager key={toolbarModel.localeManager.session} model={toolbarModel.localeManager}/>
    </React.Suspense>}
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
