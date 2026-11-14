import * as React from 'react';
import {createPortal} from 'react-dom';
import {Button,IconButton} from '../components/ui/button.tsx';
import {Switch} from '../components/ui/switch.tsx';
import {ScrollSiteManager} from '../../../../projects/ai-scroll-navigation/trusted/react-controls.tsx';
import {ConversationAiGlyph} from '../components/conversation.tsx';
import {extensionCenterText} from '../../extension-center-localization.js';
import {localeManagerText} from '../../locale-manager-localization.js';
import {PageCleanupDetails} from '../components/page-cleanup.tsx';

const LocaleManager=React.lazy(()=>import('./locale-manager.tsx'));

// Sole owner of extension-center-list children. All actions delegate to the
// trusted existing Extension Center; user packages stay in their sandbox.
export function ExtensionRows({rows,busy,pendingKey,menuKey,onOpenRow,onMore,onInlineUpdate,locale='zh-CN'}){
  const [openingKey,setOpeningKey]=React.useState(null);
  const [updateError,setUpdateError]=React.useState(null);
  const connectActions=React.useCallback(node=>{
    if(!node)return;
    const measure=()=>{
      if(node.offsetWidth)node.parentElement.style.setProperty('--ec-row-actions-width',node.offsetWidth+'px');
    };
    measure();
    if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(measure);
    observer.observe(node);
    return ()=>observer.disconnect();
  },[]);
  const review=(row,nativeEvent)=>{
    if(nativeEvent?.isTrusted!==true||busy||openingKey||!row.inlineUpdate||row.inlineUpdate.disabled)return;
    setOpeningKey(row.key);setUpdateError(null);
    let attempted;
    try{attempted=onInlineUpdate?.(row.inlineUpdate.record,nativeEvent);}
    catch(error){
      setUpdateError({key:row.key,text:String(error?.message||error).slice(0,140)});
      setOpeningKey(null);return;
    }
    void Promise.resolve(attempted).then(opened=>{
      if(opened!==true)setUpdateError({key:row.key,text:'更新审阅未开启；请核对当前来源和工具状态。'});
    },error=>setUpdateError({key:row.key,text:'审阅未确认：'+String(error?.message||error).slice(0,120)}))
      .finally(()=>setOpeningKey(null));
  };
  const t=(key,params={})=>extensionCenterText(locale,key,params);
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
    const label=row.primaryAction||t('details');
    const identity=row.installed&&titles.get(row.title)>1&&row.key.startsWith('app:')
      ?row.key.slice(4):null;
    const accessible=t('actionTitle',{action:label,title:row.title})+(row.pinned?' · '+t('pinned'):'')+(identity?' · '+t('installationId')+identity:'');
    return <li key={row.key} data-extension-id={row.key}
      className={'ec-row od-collection-row'+(row.installed&&row.key===activeActionKey?' ec-row--action-visible':'')+
        (row.inlineUpdate?' ec-row--has-update':'')}
      aria-busy={busy||pendingKey===row.key?'true':undefined}
      data-pinned={row.pinned?'true':undefined}
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
        <span className="ec-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            {row.kind==='page'?<><rect x="3" y="4" width="18" height="16" rx="2"/>
              <path d="M3 9h18M7 6.5h.01M10 6.5h.01m-2 8 2 2 5-5"/></>:
              <><rect x="3" y="3" width="7" height="7" rx="1.5"/>
                <rect x="14" y="3" width="7" height="7" rx="1.5"/>
                <rect x="3" y="14" width="7" height="7" rx="1.5"/>
                <rect x="14" y="14" width="7" height="7" rx="1.5"/></>}
          </svg>
        </span>
        <span className="ec-copy">
          <span className="ec-name-line">
            <span className="ec-name" title={row.title}>
              <span className="ec-name-text">{row.title}</span>
            </span>
            {row.pinned&&<span className="ec-pin-indicator" role="img" aria-label={t('pinned')} title={t('pinned')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 3 6 6-4 1-4 4-3-3 4-4 1-4ZM11 13l-6 6"/></svg>
            </span>}
            <span className="ec-type" title={row.type}>{row.type}</span>
          </span>
          <span className="ec-description" title={row.description}>{row.description}</span>
          {identity&&<span className="ec-description ec-identity">{t('installationId')}{identity}</span>}
        </span>
      </button>
      <span className="ec-row-actions" ref={connectActions}>
        {row.inlineUpdate&&<button type="button" className="ec-row-update"
          data-extension-key={row.key} data-extension-action="update"
          disabled={busy||Boolean(openingKey)||row.inlineUpdate.disabled}
          title={row.inlineUpdate.reason||row.inlineUpdate.label+' '+row.title+' · v'+row.inlineUpdate.record.version}
          aria-description={row.inlineUpdate.reason||undefined}
          aria-label={row.inlineUpdate.label+' '+row.title+' 的可信更新，进入安装审阅'}
          onClick={event=>review(row,event.nativeEvent)}>{row.inlineUpdate.label}</button>}
        {row.installed&&<IconButton className="ec-row-more" disabled={busy||Boolean(openingKey)}
          label={t('manageTitle',{title:row.title})+(identity?' · '+t('installationId')+identity:'')} data-extension-key={row.key}
          data-extension-action="more" aria-haspopup="menu"
          aria-expanded={menuKey===row.key} aria-controls="extension-center-row-menu"
          onClick={event=>onMore(row.key,event.currentTarget,event.nativeEvent)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5h.01M12 12h.01M12 19h.01" strokeWidth="3.5"/>
          </svg>
        </IconButton>}
      </span>
      {updateError?.key===row.key&&<p className="ec-update-error" role="alert">{updateError.text}</p>}
    </li>;
  });
}

 

/** Shared confirmation shell; the trusted controller still owns uninstall. */
export function UninstallDialog({open=false,title,busy=false,locale='zh-CN',
  onCancel,onEscape,returnFocusSelector,description,identity,children,panelClassName='',
  cancelLabel,closeLabel,busyLabel}) {
  const t=(key,params={})=>extensionCenterText(locale,key,params);
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
      aria-label={cancelLabel||t('cancelUninstall')} disabled={busy}
      onClick={cancel}/>
    <section ref={panelRef} className={["od-uninstall-dialog",panelClassName].filter(Boolean).join(" ")} tabIndex={-1}
      role="dialog" aria-modal="true" aria-labelledby={titleId}
      aria-describedby={description?descriptionId:undefined} aria-busy={busy}>
      <div className="od-uninstall-dialog-head">
        <h2 id={titleId}>{title||t('uninstallTitle')}</h2>
        <IconButton className="od-uninstall-close" label={closeLabel||t('closeUninstall')} disabled={busy} onClick={cancel}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </IconButton>
      </div>
      {identity?.key&&<p className="od-uninstall-identity">
        {identity.kind==='page'?t('page'):t('app')} · {t('idLabel')}{identity.key.slice(identity.key.indexOf(':')+1)}
        {identity.version!=null&&' · '+(identity.kind==='page'?t('revision'):t('version'))+identity.version}
      </p>}
      {description&&<p id={descriptionId}>{description}</p>}
      {children}
      {busy&&<p role="status" aria-live="polite">{busyLabel||t('uninstallWait')}</p>}
    </section>
  </div>;
  return typeof document==='undefined'?surface:createPortal(surface,document.body);
}

// The existing shared IconButton owns button semantics and accessible names.
  // Only known actions become icons; any new/unknown action remains text-labelled.
  // No new dependency, permission, or Host route is created here.
function extensionActionGlyph(id,enabled=false){
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
      {enabled===true?<><path d="M9 6v12M15 6v12"/></>:
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
export function ManagedPageControl({control,title,heading,description,compact=false,onDetails,locale='zh-CN'}){
  const t=(key,params={})=>extensionCenterText(locale,key,params);
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
  return <section className="ec-detail-card ec-page-control" aria-label={t('controlAria')}>
    <div className="ec-page-main" onPointerDownCapture={capture}
      onPointerUpCapture={capture} onKeyDownCapture={capture}
      onKeyUpCapture={capture} onClickCapture={capture}
      onBlurCapture={()=>{gesture.current=null;}}>
      <div className="ec-page-main-copy">
        <h3>{heading||t('controlHeading')}</h3>
        <p>{description||t('controlDescription')}</p>
      </div>
      <Switch data-ec-detail-action="toggle" aria-label={t('enableNamed',{title})}
        isSelected={control.enabled} isDisabled={control.busy||!control.enabledKnown}
        onChange={onChange}/>
    </div>
    {(!compact||!['ready','off'].includes(control.state))&&<p className="ec-page-state" data-state={control.state} role="status" aria-live="polite">
      {control.status}
    </p>}
    {control.note&&control.state!=='ready'&&<p>{control.note}</p>}
    {control.legacyProgramId&&<p className="ec-page-legacy">
      {t('legacy',{id:control.legacyProgramId})}
    </p>}
    {(control.canRestore||control.state==='pending'||control.state==='restricted')&&
      <div className="ec-page-control-actions">
        {control.canRestore&&<Button disabled={control.busy}
          onClick={event=>control.onRestore?.(event.nativeEvent)}>
          {compact?t('restoreAuto'):t('restore')}
        </Button>}
        {compact?<Button id="scroll-status-details" variant="quiet" disabled={control.busy} onClick={onDetails}>
          {t('details')}
        </Button>:<Button disabled={control.busy} onClick={event=>control.onRefresh?.(event.nativeEvent)}>
          {t('refreshTrusted')}
        </Button>}
      </div>}
  </section>;
}

function PageSiteUpgrade({upgrade,locale='zh-CN'}){
  const t=(key,params={})=>extensionCenterText(locale,key,params);
  return <form className="ec-site-upgrade" aria-label={upgrade.title||t('addCustom')}
    onSubmit={event=>{
      event.preventDefault();
      const fields=event.currentTarget.elements;
      upgrade.onSubmit?.({
        origin:fields.namedItem('origin')?.value||'',
        pathScope:fields.namedItem('pathScope')?.value||'/'
      },event.nativeEvent);
    }}>
    <h4>{upgrade.title||t('addCustom')}</h4>
    {upgrade.description&&<p>{upgrade.description}</p>}
    <label>{t('origin')}
      <input name="origin" type="url" required maxLength={256}
        placeholder="https://example.com" autoComplete="off"
        disabled={Boolean(upgrade.disabledReason||upgrade.busy)}/>
    </label>
    <label>{t('path')}
      <input name="pathScope" type="text" defaultValue="/" required maxLength={512}
        autoComplete="off"
        disabled={Boolean(upgrade.disabledReason||upgrade.busy)}/>
    </label>
    {upgrade.permissionNote&&<p>{upgrade.permissionNote}</p>}
    {upgrade.disabledReason&&<p role="status">{upgrade.disabledReason}</p>}
    {upgrade.error&&<p role="alert">{upgrade.error}</p>}
    <Button type="submit" disabled={Boolean(upgrade.disabledReason||upgrade.busy)}>
      {upgrade.busy?t('preparing'):t('reviewSite')}
    </Button>
  </form>;
}

export function PageDiagnostics({info,locale='zh-CN'}){
  const t=(key,params={})=>extensionCenterText(locale,key,params);
  return <>
    <p>{t('sourceLabel')}{info?.source||t('unknownSource')}</p>
    <p>{t('installIdentity')}{info?.installationId||t('checkPending')}</p>
    <p>{t('authorization')}{info?.authorization||t('unknown')}</p>
    <p>{t('native')}{info?.nativeState||t('unknown')}</p>
    {info?.nativeId&&<p>{t('nativeId')}{info.nativeId}</p>}
    {info?.sourceHash&&<p>{t('sourceHash')}{info.sourceHash}</p>}
    {info?.manifestHash&&<p>{t('manifestHash')}{info.manifestHash}</p>}
    {info?.packageHash&&<p>{t('packageHash')}{info.packageHash}</p>}
    {info?.cleanupState&&<p>{t('cleanupState')}{info.cleanupState}</p>}
    {info?.error&&<p role="status">{t('registrationError')}{info.error}</p>}
    <p>{t('excluded')}{info?.excluded?.join('、')||t('none')}</p>
    <p>{t('capabilities')}{info?.capabilities?.join('、')||t('notRecorded')}</p>
    <p>{t('networkOrigins')}{info?.networkOrigins?.join('、')||t('notRecorded')}</p>
    <p>{t('dataRule')}{info?.dataRule}</p>
  </>;
}

function DetailActions({model,actions=model.actions,disabled=false,locale='zh-CN'}){
  const t=(key,params={})=>extensionCenterText(locale,key,params);
  if(!actions.length)return null;
  return <div className="ec-detail-actions">
    {actions.map(action=>{
      const icon=extensionActionGlyph(action.id,model.enabled??model.pageControl?.enabled);
      return icon?<IconButton key={action.id}
        className={action.id==='uninstall'?'ec-detail-action od-icon-button--danger':'ec-detail-action'}
        disabled={model.busy||disabled} label={t('actionTitle',{action:action.label,title:model.title})} title={action.label}
        data-ec-detail-action={action.id}
        onClick={event=>action.onClick?.(event.nativeEvent)}>{icon}</IconButton>:
        <Button key={action.id} disabled={model.busy||disabled} data-ec-detail-action={action.id}
          onClick={event=>action.onClick?.(event.nativeEvent)}>{action.label}</Button>;
    })}
  </div>;
}

// Detail actions retain the originating native event. Identity and permission
// checks remain with the existing Extension Center controller.
export function ExtensionDetail({model,container,onScrollNavigation,scrollNavigation,locale=model?.locale||'zh-CN'}){
  const t=(key,params={})=>extensionCenterText(locale,key,params);
  React.useLayoutEffect(()=>{
    if(!model||model.busy||!model.focusAction)return;
    const target=[...(container?.querySelectorAll('[data-ec-detail-action]')||[])]
      .find(node=>node.dataset.ecDetailAction===model.focusAction);
    (target?.querySelector?.('[role="switch"]')||target)?.focus?.({preventScroll:true});
  },[model,container]);
  if(!model)return null;
  const pageHeader=model.kind==='page';
  const managed=model.kind==='page'&&Boolean(model.pageControl);
  const headerActions=model.scrollManager?model.actions:
    pageHeader?model.actions.filter(action=>action.id==='uninstall'):[];
  const bodyActions=pageHeader?model.actions.filter(action=>action.id!=='uninstall'):model.actions;
  // Render Authority/official scopes only. Never infer capabilities from titles.
  const sites=Array.isArray(model.sites)?model.sites.filter(s=>typeof s==='string'&&s.trim()):[];
  return <>
    <div className={'ec-detail-head'+(pageHeader?' ec-detail-head--page od-page-head':'')}>
      {!pageHeader&&<span className="ec-glyph" aria-hidden="true">▦</span>}
      <div className="ec-detail-copy">
        <strong id={model.scrollManager?'scroll-page-title':undefined} tabIndex={model.scrollManager?-1:undefined}
          className={pageHeader?'od-page-title':undefined}
          role={pageHeader?'heading':undefined} aria-level={pageHeader?1:undefined}
          title={scrollNavigation?.title?model.title+' / '+scrollNavigation.title:model.title}>
          {scrollNavigation?.title||model.title}</strong>{!pageHeader&&<span className="ec-type">{model.type}</span>}
      </div>
      {model.scrollManager&&<div className="od-page-actions">
        {(!scrollNavigation?.view||scrollNavigation.view==='home')&&scrollNavigation?.settingsLabel&&
          <IconButton id="scroll-settings" label={scrollNavigation.settingsLabel} disabled={!scrollNavigation||scrollNavigation.busy}
            onClick={()=>scrollNavigation?.openSettings?.()}>{extensionActionGlyph('settings')}</IconButton>}
        {scrollNavigation?.view==='sites'&&scrollNavigation.addSiteLabel&&
          <IconButton id="scroll-add-sites" label={scrollNavigation.addSiteLabel} disabled={!scrollNavigation.canAdd}
            onClick={()=>scrollNavigation.addSite()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>
          </IconButton>}
        <IconButton id="scroll-ai-toggle" label={scrollNavigation?.aiLabel||'AI'}
          aria-expanded={Boolean(scrollNavigation?.aiOpen)} aria-controls="scroll-ai-panel"
          disabled={!scrollNavigation} onClick={()=>scrollNavigation?.toggleAI?.()}><ConversationAiGlyph/></IconButton>
        <DetailActions locale={locale} model={model} disabled={!scrollNavigation||scrollNavigation.actionsDisabled}/>
      </div>}
      {!model.scrollManager&&headerActions.length>0&&<div className="od-page-actions">
        <DetailActions locale={locale} model={model} actions={headerActions}/>
      </div>}
    </div>
    {model.description&&!model.scrollManager&&<p className="ec-detail-description">{model.description}</p>}
    {!model.scrollManager&&<PageCleanupDetails key={model.key} cleanup={model.oldPageCleanup} locale={locale}/>}
    {managed&&!model.scrollManager&&<ManagedPageControl locale={locale} control={model.pageControl} title={model.title}/>}
    {model.scrollManager&&<ScrollSiteManager key={model.scrollManager.identityKey}
      locale={locale} model={model.scrollManager} pageControl={model.pageControl} title={model.title} detail={model}
      onNavigation={onScrollNavigation} PageControl={ManagedPageControl} Diagnostics={PageDiagnostics}
      CleanupDetails={PageCleanupDetails}/>}
    {!managed&&!model.scrollManager&&<DetailActions locale={locale} model={model} actions={bodyActions}/>}
    {!managed&&<section className="ec-detail-card">
      <h3>{t('installationSource')}</h3>
      <p>{model.installationText}</p>
      <p>{model.kind==='app'?t('version'):t('revision')}{model.version}</p>
      {model.kind==='app'&&<>
        {model.installed?<><p>{t('sourceLabel')}{model.source?.label||t('sourcePending')}</p>
          {model.source?.sha256&&<p>{t('pinnedHash')}{model.source.sha256}</p>}
          <p>{model.usageText||t('appUsage')}</p>
          <p>{model.appDataText}</p></>:<p>{model.cleanupPending?
          t('cleanupFirst'):
          t('marketReview')}</p>}
      </>}
    </section>}
    {model.kind==='page'&&!model.scrollManager&&(sites.length>0||model.siteUpgrade)&&<section className="ec-detail-card ec-page-sites">
      <h3>{t('sites')}</h3>
      {sites.length>0&&<ul className="ec-sites">{sites.map(site=><li key={site}>{site}</li>)}</ul>}
      {model.suspended&&<p role="status">{t('siteRestricted')}</p>}
      {model.siteUpgrade&&<details className="ec-site-review-details od-disclosure od-disclosure--flat">
        <summary>{model.siteUpgrade.summary||t('addCustomReview')}</summary>
        <PageSiteUpgrade locale={locale} upgrade={model.siteUpgrade}/>
      </details>}
    </section>}
    {managed&&!model.scrollManager&&model.pageControl.officialBlock&&
      <p className="ec-page-release-block" role="status">
        {t('releaseBlock',{reason:model.pageControl.officialBlock})}
      </p>}
    {model.kind==='page'&&!model.scrollManager&&model.pageInfo&&<details className="od-disclosure ec-page-diagnostics">
      <summary>{t('diagnostics')}</summary>
      <p>{model.installationText} · {t('revision')}{model.version}</p>
      <PageDiagnostics locale={locale} info={model.pageInfo}/>
    </details>}
  </>;
}


// Search and filter UI belongs to React. The existing Extension Center owns
// query/filter values, refresh, installation/Host actions and locale storage.
// Existing IDs/ARIA/CSS are preserved for accessibility and legacy contracts.
export function ExtensionToolbar({model,locale=model?.locale||model?.language||'zh-CN'}){
  const t=(key,params={})=>extensionCenterText(locale,key,params);
  const current=model||{};
  const kind=current.kind||'all',scope=current.scope||'smart';
  const menuOpen=Boolean(current.menuOpen);
  return <>
    <label className="ec-search" htmlFor="extension-center-search">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
      <input id="extension-center-search" type="search" placeholder={t('search')}
        autoComplete="off" value={current.query||''}
        onChange={event=>current.onSearch?.(event.currentTarget.value,event.nativeEvent)}/>
    </label>
    <IconButton id="extension-center-market" className="ec-icon"
      label={t(current.storeWebsiteStatus==='ready'?'market':
        current.storeWebsiteStatus==='invalid'?'storeConfigInvalid':'storeComingSoon')}
      onClick={event=>current.onMarket?.(event.nativeEvent)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16l-1.5-6h-13L4 10Zm2 0v10h12V10M10 20v-6h4v6"/></svg>
    </IconButton>
    <div id="extension-center-menu-wrap" className="ec-menu-wrap">
      <IconButton id="extension-center-more" className="ec-icon" label={t('filterManage')}
        title={t('filterMore')} aria-haspopup="true"
        aria-expanded={menuOpen} aria-controls="extension-center-menu"
        data-active={String(kind!=='all'||scope!=='smart')}
        onClick={event=>current.onToggleMenu?.(event.nativeEvent)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
      </IconButton>
      <div id="extension-center-menu" className="ec-more" role="group"
        aria-label={t('filterActions')} hidden={!menuOpen}>
        <fieldset><legend>{t('kind')}</legend><div className="ec-filter-group">
          {[[ 'all',t('all')],['app',t('app')],['page',t('page')]].map(([value,label])=>
            <button key={value} type="button" data-ec-kind={value}
              aria-pressed={kind===value} onClick={event=>current.onKind?.(value,event.nativeEvent)}>{label}</button>)}
        </div></fieldset>
        <fieldset><legend>{t('scope')}</legend><div className="ec-filter-group">
          {[[ 'smart',t('installed')],['available',t('available')]].map(([value,label])=>
            <button key={value} type="button" data-ec-scope={value}
              aria-pressed={scope===value} onClick={event=>current.onScope?.(value,event.nativeEvent)}>{label}</button>)}
        </div></fieldset>
        <button id="extension-center-reset" className="ec-menu-action" type="button"
          onClick={event=>current.onReset?.(event.nativeEvent)}>{t('reset')}</button>
        <div className="ec-menu-separator">
          <Button id="extension-center-language-settings" className="ec-menu-action"
            onClick={event=>current.onLanguageSettings?.(event.nativeEvent)}>{t('language')}</Button>
           <button id="extension-center-import" className="ec-menu-action" type="button"
            onClick={event=>current.onImport?.(event.nativeEvent)}>{t('import')}</button>
          <button id="extension-center-reload" className="ec-menu-action" type="button"
            onClick={event=>current.onReload?.(event.nativeEvent)}>{t('reload')}</button>
          <button id="extension-center-update-history" className="ec-menu-action" type="button"
            onClick={event=>current.onUpdateHistory?.(event.nativeEvent)}>更新记录与提醒设置…</button>
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

export function ExtensionRecoveries({model,locale=model?.locale||'zh-CN'}){
  const t=(key,params={})=>extensionCenterText(locale,key,params);
  const ids=model?.ids||[];
  if(!ids.length)return null;
  return <>
    <p>{t('recoveryIntro')}</p>
    {ids.map(id=><p key={id}>
      {id+' · '+t('cleanupPending')}
      <Button disabled={Boolean(model.busy)} aria-label={t('retryNamed',{title:id})}
        onClick={event=>model.onRetry?.(id,event.nativeEvent)}>{t('retryCleanup')}</Button>
    </p>)}
  </>;
}

export function ExtensionStatus({model}){
  return model?.text||'';
}

function preinstallTextKey(state){
  return {'user-scripts-required':'preinstallScripts','check-error':'preinstallCheckError',
    checking:'preinstallChecking',available:'preinstallAvailable',resuming:'preinstallResuming',
    'permission-required':'preinstallSites',attention:'preinstallAttention',error:'preinstallError'}[state]||(state?'preinstallError':'preinstallComplete');
}

function focusPreinstallFallback(doc){
  for(const id of ['extension-preinstall-help-title','extension-preinstall-info','extension-center-search']){
    const target=doc.getElementById(id);
    if(target&&!target.closest('[hidden],[inert]')&&target.getClientRects().length){
      target.focus({preventScroll:true});return;
    }
  }
}

function PreinstallAction({model,settingsVisited,onAction,locale,compact=false}){
  const t=key=>extensionCenterText(locale,key);
  const busy=['checking','resuming'].includes(model?.state);
  const action=model?.state==='available'?'resume':model?.state==='check-error'||
    model?.state==='user-scripts-required'&&settingsVisited?'check':
    model?.state==='user-scripts-required'?'settings':null;
  const actionRef=React.useRef(null);
  const connectAction=React.useCallback(node=>{
    const previous=actionRef.current;
    if(!node&&previous&&previous.ownerDocument.activeElement===previous){
      const doc=previous.ownerDocument;
      queueMicrotask(()=>{
        if(doc.activeElement===previous||doc.activeElement===doc.body||!doc.activeElement?.isConnected)
          focusPreinstallFallback(doc);
      });
    }
    actionRef.current=node;
  },[]);
  React.useLayoutEffect(()=>{
    const button=actionRef.current;
    if(button?.disabled&&button.ownerDocument.activeElement===button)focusPreinstallFallback(button.ownerDocument);
  },[model?.state]);
  if(!action&&!busy)return null;
  const label=busy?(model.state==='checking'?'preinstallCheckingAction':'preinstallResumingAction'):
    {settings:'preinstallSettings',check:'preinstallCheck',resume:'preinstallContinue'}[action];
  const activate=event=>{
    const doc=event.currentTarget.ownerDocument,focused=doc.activeElement===event.currentTarget;
    onAction?.(action,event.nativeEvent);
    queueMicrotask(()=>{if(focused&&doc.activeElement===doc.body)focusPreinstallFallback(doc);});
  };
  if(compact&&action==='settings')return <IconButton ref={connectAction}
    label={t(label)} onClick={activate}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9.5 3-.6 2.3-2 .9-2.1-.7-2.3 4 1.7 1.6v2L2.5 15l2.3 4 2.1-.7 2 .9.6 2.3h5l.6-2.3 2-.9 2.1.7 2.3-4-1.7-1.9v-2l1.7-1.6-2.3-4-2.1.7-2-.9L14.5 3Z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  </IconButton>;
  return <Button ref={connectAction} disabled={busy} onClick={activate}>
    {t(label)}
  </Button>;
}

export function ExtensionPreinstallNotice({model,locale='zh-CN',onAction,onInfo,settingsVisited=false}){
  if(!model?.state)return null;
  const t=key=>extensionCenterText(locale,key);
  return <section id="extension-center-preinstall" className="ec-preinstall od-surface"
    aria-label={t('preinstallPending')} aria-busy={['checking','resuming'].includes(model.state)}>
    <p role="status" aria-live="polite">{t(model.settingsFailed?'preinstallSettingsShort':preinstallTextKey(model.state))}</p>
    <div className="ec-preinstall-actions">
      <PreinstallAction {...{model,settingsVisited,onAction,locale}} compact/>
      <IconButton id="extension-preinstall-info" label={t('preinstallInfo')} onClick={onInfo}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/>
          <path d="M12 11v6m0-10v.01"/></svg>
      </IconButton>
    </div>
  </section>;
}

function PreinstallExplanation({model,locale,onBack,onAction,settingsVisited,titleRef}){
  const t=key=>extensionCenterText(locale,key);
  const scripts=['user-scripts-required','checking','check-error','available','resuming'].includes(model?.state);
  return <section id="extension-preinstall-explanation" className="ec-preinstall-help od-stack"
    aria-labelledby="extension-preinstall-help-title">
    <div className="od-page-head">
      <IconButton label={t('backList')} onClick={onBack}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>
      </IconButton>
      <h2 id="extension-preinstall-help-title" className="od-page-title" ref={titleRef} tabIndex={-1}>{t('preinstallHelpTitle')}</h2>
    </div>
    <p role="status" aria-live="polite">{t(preinstallTextKey(model?.state))}</p>
    <div className="od-toolbar ec-preinstall-help-actions">
      <PreinstallAction {...{model,settingsVisited,onAction,locale}}/>
      {scripts&&settingsVisited&&!['checking','resuming'].includes(model.state)&&
        <Button variant="quiet" onClick={event=>onAction?.('settings',event.nativeEvent)}>{t('preinstallSettings')}</Button>}
    </div>
    <p>{t('preinstallUnaffected')}</p>
    {scripts&&<>
      <p>{t('preinstallReason')}</p>
      <ol className="ec-preinstall-steps">
        <li>{t('preinstallStepSettings')}</li>
        <li>{t('preinstallStepCheck')}</li>
        <li>{t('preinstallStepContinue')}</li>
      </ol>
      <p>{t('preinstallBoundary')}</p>
    </>}
    {model?.state==='permission-required'&&<p>{t('preinstallSitesGuide')}</p>}
    {model?.state==='attention'&&<p>{t('preinstallAttentionGuide')}</p>}
    {model?.state==='error'&&<p>{t('preinstallErrorGuide')}</p>}
    {model?.settingsFailed&&<p role="alert">{t('preinstallSettingsFailed')}</p>}
    {model?.technical&&<details className="od-disclosure od-disclosure--flat ec-preinstall-diagnostic">
      <summary>{t('preinstallTechnical')}</summary><p>{model.technical}</p>
    </details>}
  </section>;
}

 
// One React-owned menu, including its host, placement and listener lifetime.
// The portal remains part of this page/root and escapes the clipped list.
export function ExtensionRowMenu({items=[],model=null,locale=model?.locale||'zh-CN',id='extension-center-row-menu',label}){
  const t=(key,params={})=>extensionCenterText(locale,key,params);
  const menuItems=model?.items||items;
  // Only unadorned two-Han labels in a Chinese menu share a centered axis.
  // Longer, mixed-script or other-language menus retain one reading edge.
  const centered=/^zh(?:-|$)/i.test(locale)&&menuItems.length>0&&menuItems.every(item=>
    typeof item.label==='string'&&/^\p{Script=Han}{2}$/u.test(item.label));
  const ref=React.useRef(null);
  React.useLayoutEffect(()=>{
    const menu=ref.current,trigger=model?.trigger;
    if(!menu||!trigger)return;
    const doc=trigger.ownerDocument,view=doc.defaultView;
    const place=()=>{
      const rect=trigger.getBoundingClientRect();
      const screenW=view?.innerWidth||doc.documentElement.clientWidth;
      const screenH=view?.innerHeight||doc.documentElement.clientHeight;
      const width=menu.offsetWidth,height=menu.offsetHeight,gutter=8;
      menu.style.left=Math.max(gutter,Math.min(rect.right-width,screenW-width-gutter))+'px';
      menu.style.top=(rect.bottom+height+gutter<=screenH?rect.bottom+3:
        Math.max(gutter,rect.top-height-3))+'px';
    };
    place();
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
    view?.addEventListener('resize',place);
    return ()=>{
      doc.removeEventListener('click',clickOutside);doc.removeEventListener('keydown',keyDown);
      doc.removeEventListener('scroll',scroll,true);
      view?.removeEventListener('resize',place);
    };
  },[model,locale]);
  const buttons=menuItems.map(item=><button type="button" key={item.id}
    className="ec-context-action" role="menuitem" data-ec-context-action={item.id}
    onClick={event=>item.onClick?.(event.nativeEvent)}>{item.label}</button>);
  if(!model)return buttons;
  return createPortal(<div ref={ref} id={id} className="ec-context-menu"
    data-align={centered?'center':'start'}
    role="menu" aria-label={label||t('manageTitle',{title:model.title})}>{buttons}</div>,model.trigger.ownerDocument.body);
}

// A read-only discovery result; install authority remains with the existing Host.
export function ExtensionDiscovery({model,onDiscover,showEntry=false,locale=model?.locale||'zh-CN'}){
  const t=(key,params={})=>extensionCenterText(locale,key,params);
  if(!model&&!showEntry)return null;
  const found=model?.state==='found';
  const retry=model?.state==='error'||model?.state==='empty';
  const activate=event=>{
    if(found)model.onReview?.(event.nativeEvent);
    else if(retry)model.onRetry?.(event.nativeEvent);
    else if(!model)onDiscover?.(event.nativeEvent);
  };
  return <section id="extension-center-discovery" className="ec-discovery"
    aria-label={t('webDiscovery')} aria-busy={model?.state==='loading'||Boolean(model?.busy)}>
    <div className="ec-discovery-copy">
      <strong>{found?model.title+' · v'+model.version:
        model?.state==='loading'?t('checkingWeb'):model?t('webEntry'):t('installWeb')}</strong>
      {found&&model.origin&&<span className="ec-discovery-origin">{model.origin}</span>}
      <p role="status" data-state={model?.state}>
        {model?.message||t('discoveryNote')}
      </p>
    </div>
    <div className="ec-discovery-actions">
      <Button id="extension-center-discover" disabled={Boolean(model?.busy)}
        aria-disabled={model?.state==='loading'||undefined}
        onClick={activate}>
        {found?(model.busy?t('checking'):t('appDetails')):
          model?.state==='loading'?t('detecting'):retry?t('retry'):t('checkWeb')}
      </Button>
      {model&&<IconButton label={t('dismissWeb')} title={t('close')}
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
  statusModel=null,preinstallModel=null,onPreinstallAction=null,menuKey=null,rowMenuModel=null,updateCenter=null,view='list',onBack=()=>{}
}){
  const locale=toolbarModel?.locale||toolbarModel?.language||detailModel?.locale||'zh-CN';
  const t=(key,params={})=>extensionCenterText(locale,key,params);
  const languageVisible=Boolean(toolbarModel?.localeManager);
  const detailVisible=view==='detail'&&!languageVisible;
  const [preinstallInfo,setPreinstallInfo]=React.useState(false);
  const [preinstallSettingsVisited,setPreinstallSettingsVisited]=React.useState(false);
  const preinstallHelpVisible=preinstallInfo&&!detailVisible&&!languageVisible;
  const preinstallTitleRef=React.useRef(null),preinstallReturn=React.useRef(null);
  const preinstallAction=(action,event)=>{
    if(action==='settings')setPreinstallSettingsVisited(true);
    onPreinstallAction?.(action,event);
  };
  const openPreinstallInfo=()=>{
    const scroll=[];
    for(let node=pageRef.current;node;node=node.parentElement)scroll.push([node,node.scrollTop]);
    preinstallReturn.current=scroll;setPreinstallInfo(true);
  };
  React.useLayoutEffect(()=>{
    if(preinstallHelpVisible)preinstallTitleRef.current?.focus({preventScroll:true});
    else if(!preinstallInfo&&preinstallReturn.current){
      for(const [node,top] of preinstallReturn.current)node.scrollTop=top;
      preinstallReturn.current=null;
      const doc=pageRef.current?.ownerDocument;
      (doc?.getElementById('extension-preinstall-info')||doc?.getElementById('extension-center-search'))?.focus({preventScroll:true});
    }
  },[preinstallHelpVisible,preinstallInfo]);
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
    if(languageVisible||preinstallHelpVisible||!isFileDrag(event))return;
    event.preventDefault();fileDragDepth.current++;setFileOver(true);
  };
  const onDragOver=event=>{
    if(languageVisible||preinstallHelpVisible||!isFileDrag(event))return;
    event.preventDefault();event.dataTransfer.dropEffect='copy';
  };
  const onDragLeave=event=>{
    if(languageVisible||preinstallHelpVisible||!isFileDrag(event))return;
    fileDragDepth.current=Math.max(0,fileDragDepth.current-1);
    if(!fileDragDepth.current)setFileOver(false);
  };
  const onDrop=event=>{
    if(languageVisible||preinstallHelpVisible||!isFileDrag(event))return;
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
      if(preinstallHelpVisible&&(!preinstallTitleRef.current?.getClientRects().length||
        preinstallTitleRef.current.closest('[hidden],[inert]')))return;
      if(toolbarModel?.menuOpen){event.preventDefault();toolbarModel.onCloseMenu?.(true);}
      else if(preinstallHelpVisible){event.preventDefault();setPreinstallInfo(false);}
      else if(detailVisible){event.preventDefault();detailBackRef.current(event);}
    };
    doc.addEventListener('click',clickOutside);doc.addEventListener('keydown',keyDown);
    return ()=>{doc.removeEventListener('click',clickOutside);doc.removeEventListener('keydown',keyDown);};
  },[toolbarModel,detailVisible,preinstallHelpVisible,onBack]);
  return <div className="ec-drop-surface"
    onDragEnter={onDragEnter} onDragOver={onDragOver}
    onDragLeave={onDragLeave} onDrop={onDrop}>
    <p id="extension-center-status" className="ec-message" role="status"
      aria-live="polite" data-state={statusModel?.state||'info'}
      hidden={!statusModel?.text}>
      <ExtensionStatus model={statusModel}/>
    </p>
    <div ref={pageRef} id="extension-center-list-view" hidden={detailVisible||languageVisible||preinstallHelpVisible}>
      <div className="ec-toolbar">
        <ExtensionToolbar locale={locale} model={toolbarModel}/>
      </div>
      <ExtensionPreinstallNotice model={preinstallModel} locale={locale} onAction={preinstallAction}
        settingsVisited={preinstallSettingsVisited} onInfo={openPreinstallInfo}/>
      {updateCenter}
      <ExtensionDiscovery locale={locale} model={showWebDiscovery?discoveryModel:null}
        showEntry={showWebDiscovery} onDiscover={toolbarModel?.onDiscover}/>
      <input id="extension-center-file" type="file" accept=".json,application/json" hidden
        aria-label={t('selectPackage')} onChange={event=>{
          toolbarModel?.onImportFiles?.(Array.from(event.currentTarget.files||[]));event.currentTarget.value='';
        }}/>
      <div id="extension-center-import-host"></div>
      <span id="extension-center-count" className="visually-hidden" aria-live="polite">
        {feedbackModel?.countText||t('loading')}
      </span>
      <ul id="extension-center-list" className="ec-list od-collection" aria-label={t('listAria')}
        aria-busy={Boolean(rowsModel.busy||rowsModel.pendingKey)}>
        <ExtensionRows {...rowsModel} locale={locale} menuKey={menuKey}/>
      </ul>
      <div id="extension-center-cleanups" className="ec-empty" aria-live="polite"
        hidden={!recoveryModel?.ids?.length}>
        <ExtensionRecoveries locale={locale} model={recoveryModel}/>
      </div>
      <div id="extension-center-empty" className="ec-empty" hidden={!feedbackModel?.showEmpty}>
        <ExtensionEmpty model={feedbackModel}/>
      </div>
    </div>
    {preinstallHelpVisible&&<PreinstallExplanation model={preinstallModel} locale={locale}
      onBack={()=>setPreinstallInfo(false)} onAction={preinstallAction}
      settingsVisited={preinstallSettingsVisited} titleRef={preinstallTitleRef}/>}
    <section id="extension-center-detail" className="ec-detail" aria-label={t('detailAria')}
      data-scroll-app={detailModel?.scrollManager?'true':undefined}
      hidden={!detailVisible}>
      <IconButton id="extension-center-back" className="ec-detail-back"
        label={scrollNav?.back?scrollNav.backLabel||t('back'):t('backList')} disabled={Boolean(scrollNav?.busy)}
        onClick={event=>detailBack(event.nativeEvent)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m14 6-6 6 6 6"/>
        </svg>
      </IconButton>
      <div ref={detailRef} id="extension-center-detail-body">
        <ExtensionDetail locale={locale} model={detailModel} container={detailRef.current}
          onScrollNavigation={setScrollNavigation} scrollNavigation={scrollNav}/>
      </div>
    </section>
    <UninstallDialog locale={locale} open={detailVisible&&Boolean(detailModel?.confirmation)}
      title={t('uninstallNamed',{title:detailModel?.title||t('page')})}
      busy={Boolean(detailModel?.busy)}
      identity={detailModel}
      description={detailModel?.confirmation?.text||''}
      returnFocusSelector='#extension-center-detail [data-ec-detail-action="uninstall"]'
      onCancel={event=>detailModel?.confirmation?.onCancel(event)}>
      <div className="od-uninstall-dialog-actions">
        <Button data-uninstall-cancel="true" disabled={Boolean(detailModel?.busy)}
          onClick={event=>detailModel?.confirmation?.onCancel(event.nativeEvent)}>{t('cancel')}</Button>
        <Button className="od-uninstall-confirm" disabled={Boolean(detailModel?.busy)}
          onClick={event=>detailModel?.confirmation?.onConfirm(event.nativeEvent)}>
          {detailModel?.busy?t('uninstalling'):t('confirmUninstall')}</Button>
      </div>
    </UninstallDialog>
    <UninstallDialog locale={locale} open={Boolean(uninstallModel)}
      title={uninstallModel?.title||t('uninstallTitle')}
      busy={Boolean(uninstallModel?.busy)}
      identity={uninstallModel?.identity}
      description={uninstallModel?.text||''}
      onCancel={event=>uninstallModel?.onCancel?.(event)}>
      <div className="od-uninstall-dialog-actions">
        <Button data-uninstall-cancel="true" disabled={Boolean(uninstallModel?.busy)}
          onClick={event=>uninstallModel?.onCancel?.(event.nativeEvent)}>{t('cancel')}</Button>
        <Button className="od-uninstall-confirm" disabled={Boolean(uninstallModel?.busy)}
          onClick={event=>uninstallModel?.onConfirm?.(event.nativeEvent)}>
          {uninstallModel?.busy?t('uninstalling'):t('confirmUninstall')}</Button>
      </div>
    </UninstallDialog>
    {languageVisible&&<section id="extension-center-locale" className="ec-locale-page" aria-label={t('language')}>
      <React.Suspense fallback={<p role="status">{localeManagerText(toolbarModel.localeManager.localeController?.getLocale?.()||'zh-CN','busy')}</p>}>
        <LocaleManager key={toolbarModel.localeManager.session} model={toolbarModel.localeManager}/>
      </React.Suspense>
    </section>}
    {rowMenuModel&&<ExtensionRowMenu locale={locale} model={rowMenuModel}/>}
    {fileOver&&<div className="ec-file-drop-overlay" role="status" aria-live="polite">
      <strong>{t('drop')}</strong>
      <span>{t('dropNote')}</span>
    </div>}
  </div>;
}
