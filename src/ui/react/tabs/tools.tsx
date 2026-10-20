import * as React from 'react';
import {createPortal} from 'react-dom';
import {Button,IconButton} from '../components/ui/button.tsx';

// Sole owner of extension-center-list children. All actions delegate to the
// trusted existing Extension Center; user packages stay in their sandbox.
export function ExtensionRows({rows,busy,pendingKey,menuKey,onOpenRow,onMore}){
  // Distinct package IDs remain visible to people and assistive technologies
  // when two independently installed tools intentionally reuse a title.
  const titles=new Map();
  for(const row of rows)if(row.installed)
    titles.set(row.title,(titles.get(row.title)||0)+1);
  return rows.map(row=>{
    const label=row.primaryAction||'查看详情';
    const identity=row.installed&&titles.get(row.title)>1&&row.key.startsWith('app:')
      ?row.key.slice(4):null;
    const accessible=label+'「'+row.title+'」'+(identity?' · 安装 ID：'+identity:'');
    return <li key={row.key} data-extension-id={row.key}
      className="ec-row"
      aria-busy={busy||pendingKey===row.key?'true':undefined}>
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
          onClick={event=>onMore(row.key,event.currentTarget,event.nativeEvent)}>⋮</IconButton>}
      </span>
    </li>;
  });
}

 

/** Shared confirmation shell; the trusted controller still owns uninstall. */
export function UninstallDialog({open=false,title='卸载扩展？',busy=false,
  onCancel,returnFocusSelector,description,identity,children}) {
  const panelRef=React.useRef(null),titleId=React.useId(),descriptionId=React.useId();
  const latest=React.useRef({busy,onCancel});
  latest.current={busy,onCancel};
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
      (panel.querySelector('[data-uninstall-cancel]:not([disabled])')||panel).focus({preventScroll:true});
    };
    focusInside();
    const onFocusIn=event=>{if(!panel.contains(event.target))focusInside();};
    const onKeyDown=event=>{
      if(event.key==='Escape'){
        event.preventDefault();event.stopPropagation();
        cancel(event);
        return;
      }
      if(event.key!=='Tab')return;
      const focusable=[...panel.querySelectorAll(
        'button:not([disabled]),[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])')]
        .filter(node=>!node.closest('[hidden]')&&node.getClientRects().length);
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
      aria-label="取消卸载" disabled={busy}
      onClick={cancel}/>
    <section ref={panelRef} className="od-uninstall-dialog" tabIndex={-1}
      role="dialog" aria-modal="true" aria-labelledby={titleId}
      aria-describedby={description?descriptionId:undefined} aria-busy={busy}>
      <div className="od-uninstall-dialog-head">
        <h2 id={titleId}>{title}</h2>
        <IconButton className="od-uninstall-close" label="关闭卸载确认" disabled={busy} onClick={cancel}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </IconButton>
      </div>
      {identity?.key&&<p className="od-uninstall-identity">
        {identity.kind==='page'?'网页增强':'应用'} · ID：{identity.key.slice(identity.key.indexOf(':')+1)}
        {identity.version!=null&&' · '+(identity.kind==='page'?'修订：r':'版本：v')+identity.version}
      </p>}
      {description&&<p id={descriptionId}>{description}</p>}
      {children}
      {busy&&<p role="status" aria-live="polite">正在卸载，请稍候…</p>}
    </section>
  </div>;
  return typeof document==='undefined'?surface:createPortal(surface,document.body);
}

// Detail actions retain the originating native event. Identity and permission
// checks remain with the existing Extension Center controller.
export function ExtensionDetail({model,container}){
  React.useLayoutEffect(()=>{
    if(!model||model.busy||!model.focusAction)return;
    const target=[...(container?.querySelectorAll('button[data-ec-detail-action]')||[])]
      .find(node=>node.dataset.ecDetailAction===model.focusAction);
    target?.focus?.({preventScroll:true});
  },[model,container]);
  if(!model)return null;
  return <>
    <div className="ec-detail-head">
      <span className="ec-glyph" aria-hidden="true">{model.kind==='page'?'◇':'▦'}</span>
      <div className="ec-detail-copy">
        <strong>{model.title}</strong><span className="ec-type">{model.type}</span>
      </div>
    </div>
    <p>{model.description}</p>
    <div className="ec-detail-actions">
      {model.actions.map(action=><Button key={action.id} disabled={model.busy}
        data-ec-detail-action={action.id}
        onClick={event=>action.onClick?.(event.nativeEvent)}>{action.label}</Button>)}
    </div>
    <section className="ec-detail-card">
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
    </section>
    {model.kind==='page'&&<section className="ec-detail-card">
      <h3>网站范围与授权</h3>
      <ul className="ec-sites">{model.sites.map(site=><li key={site}>{site}</li>)}</ul>
      <p>{model.suspended?
        '网站访问受限；需要按照原授权规则重新授权。':
        '仅在原安装批准的网站范围内运行，不因扩展本身具备网站访问权限而扩大程序授权。'}</p>
      <p>排除网站：{model.pageInfo?.excluded?.join('、')||'无'}</p>
      <p>授权能力：{model.pageInfo?.capabilities?.join('、')||'未记录'}</p>
      <p>网络来源：{model.pageInfo?.networkOrigins?.join('、')||'未记录'}</p>
    </section>}
    {model.kind==='page'&&<section className="ec-detail-card">
      <h3>Chrome 注册与数据</h3>
      <p>来源：{model.pageInfo?.source||'来源未记录'}</p>
      <p>安装身份：{model.pageInfo?.installationId||'待核对'}</p>
      <p>授权状态：{model.pageInfo?.authorization||'未知'}</p>
      <p>Chrome 注册：{model.pageInfo?.nativeState||'未知'}</p>
      {model.pageInfo?.nativeId&&<p>注册 ID：{model.pageInfo.nativeId}</p>}
      {model.pageInfo?.sourceHash&&<p>固定源码 SHA-256：{model.pageInfo.sourceHash}</p>}
      {model.pageInfo?.cleanupState&&<p>受管界面清理：{model.pageInfo.cleanupState}</p>}
      {model.pageInfo?.error&&<p role="status">注册错误：{model.pageInfo.error}</p>}
      <p>数据规则：{model.pageInfo?.dataRule}</p>
    </section>}
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
        <fieldset className="ec-language"><legend>OpenDesk 界面语言</legend>
          <label htmlFor="extension-center-language" className="visually-hidden">界面语言</label>
          <select id="extension-center-language" aria-label="OpenDesk 界面语言"
            value={current.language||'zh-CN'}
            onChange={event=>current.onLanguage?.(event.currentTarget.value,event.nativeEvent)}>
            <option value="zh-CN">简体中文</option><option value="en">English</option>
          </select>
        </fieldset>
        <fieldset><legend>显示范围</legend><div className="ec-filter-group">
          {[[ 'smart','已安装'],['available','可安装 / 更新']].map(([value,label])=>
            <button key={value} type="button" data-ec-scope={value}
              aria-pressed={scope===value} onClick={event=>current.onScope?.(value,event.nativeEvent)}>{label}</button>)}
        </div></fieldset>
        <button id="extension-center-reset" className="ec-menu-action" type="button"
          onClick={event=>current.onReset?.(event.nativeEvent)}>恢复默认筛选</button>
        <div className="ec-menu-separator">
          <button id="extension-center-import" className="ec-menu-action" type="button"
            onClick={event=>current.onImport?.(event.nativeEvent)}>导入本地工具包</button>
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

// React owns the complete Extension Center presentation within one subtree.
// The pre-existing Installer is mounted into one explicit host-owned slot;
// security decisions and dynamically installed UI are never executed here.
export function ExtensionCenterPage({
  rowsModel={rows:[],busy:false,pendingKey:null,onOpenRow:()=>{},onMore:()=>{}},
  toolbarModel=null,detailModel=null,uninstallModel=null,feedbackModel=null,recoveryModel=null,
  statusModel=null,menuKey=null,rowMenuModel=null,view='list',onBack=()=>{}
}){
  const detailVisible=view==='detail';
  const detailRef=React.useRef(null),pageRef=React.useRef(null);
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
  return <>
    <div ref={pageRef} id="extension-center-list-view" hidden={detailVisible}>
      <div className="ec-toolbar"><ExtensionToolbar model={toolbarModel}/></div>
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
    {rowMenuModel&&<ExtensionRowMenu model={rowMenuModel}/>}
    <p id="extension-center-status" className="ec-message" role="status"
      aria-live="polite" data-state={statusModel?.state||'info'}
      hidden={!statusModel?.text}>
      <ExtensionStatus model={statusModel}/>
    </p>
  </>;
}
