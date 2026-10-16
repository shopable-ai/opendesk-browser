import * as React from 'react';
import {Button,IconButton} from '../components/ui/button.tsx';

// Sole owner of extension-center-list children. All actions delegate to the
// trusted existing Extension Center; user packages stay in their sandbox.
export function ExtensionRows({rows,busy,pendingKey,menuKey,onOpenRow,onMore}){
  return rows.map(row=>{
    const label=row.primaryAction||'查看详情';
    return <li key={row.key} data-extension-id={row.key}
      className={['ec-row',row.primaryAction?'ec-row--has-primary':'',
        !row.primaryAction&&!row.installed?'ec-row--no-actions':''].filter(Boolean).join(' ')}
      aria-busy={busy||pendingKey===row.key?'true':undefined}>
      <button type="button" className="ec-row-main" data-extension-key={row.key}
        data-extension-action="main" disabled={busy}
        aria-label={label+'「'+row.title+'」'} title={label+'「'+row.title+'」'}
        onClick={()=>onOpenRow(row.key)}>
        <span className="ec-glyph" aria-hidden="true">{row.kind==='page'?'◇':'▦'}</span>
        <span className="ec-copy">
          <span className="ec-name-line">
            <span className="ec-name" title={row.title}>
              <span className="ec-name-text">{row.title}</span>
            </span>
            <span className="ec-type">{row.type}</span>
          </span>
          <span className="ec-description" title={row.description}>{row.description}</span>
        </span>
      </button>
      <span className="ec-row-actions">
        {row.primaryAction&&<Button className="ec-action" disabled={busy}
          data-extension-key={row.key} data-extension-action="primary"
          aria-label={row.primaryAction+'「'+row.title+'」'}
          title={row.primaryAction+'「'+row.title+'」'}
          onClick={()=>onOpenRow(row.key)}>{row.primaryAction}</Button>}
        {row.installed&&<IconButton className="ec-row-more" disabled={busy}
          label={'管理「'+row.title+'」'} data-extension-key={row.key}
          data-extension-action="more" aria-haspopup="menu"
          aria-expanded={menuKey===row.key} aria-controls="extension-center-row-menu"
          onClick={event=>onMore(row.key,event.currentTarget)}>⋮</IconButton>}
      </span>
    </li>;
  });
}

 
// Extension Detail uses a Portal within the same trusted React root; the
// parent back button, selection epoch and permission checks remain with the
// existing Extension Center controller.
export function ExtensionDetail({model,container}){
  React.useLayoutEffect(()=>{
    if(!model||model.busy||!model.focusAction)return;
    const target=[...container.querySelectorAll('button[data-ec-detail-action]')]
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
        onClick={action.onClick}>{action.label}</Button>)}
    </div>
    <section className="ec-detail-card">
      <h3>安装与来源</h3>
      <p>{model.installationText}</p>
      <p>{model.kind==='app'?'版本：v':'修订：r'}{model.version}</p>
      {model.kind==='app'&&<>
        {model.installed?<><p>来源：{model.source?.label||'暂未读取安装来源'}</p>
          {model.source?.sha256&&<p>固定包 SHA-256：{model.source.sha256}</p>}
          <p>设置不会自动运行应用。</p></>:<p>{model.cleanupPending?
            '请先恢复上次卸载的数据与权限清理，不会自动重新安装。':
            '正式安装必须在现有应用市场审阅固定包和能力清单。'}</p>}
      </>}
    </section>
    {model.kind==='page'&&<section className="ec-detail-card">
      <h3>网站范围与授权</h3>
      <ul className="ec-sites">{model.sites.map(site=><li key={site}>{site}</li>)}</ul>
      <p>{model.suspended?
        '网站访问受限；需要按照原授权规则重新授权。':
        '启用时仅按现有固定网站规则申请必要权限，不扩大安装范围。'}</p>
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
        onChange={event=>current.onSearch?.(event.currentTarget.value)}/>
    </label>
    <IconButton id="extension-center-market" className="ec-icon" label="在新标签页打开应用市场"
      onClick={()=>current.onMarket?.()}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16l-1.5-6h-13L4 10Zm2 0v10h12V10M10 20v-6h4v6"/></svg>
    </IconButton>
    <div id="extension-center-menu-wrap" className="ec-menu-wrap">
      <IconButton id="extension-center-more" className="ec-icon" label="筛选和管理扩展"
        title="扩展筛选与更多操作" aria-haspopup="true"
        aria-expanded={menuOpen} aria-controls="extension-center-menu"
        data-active={String(kind!=='all'||scope!=='smart')}
        onClick={()=>current.onToggleMenu?.()}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
      </IconButton>
      <div id="extension-center-menu" className="ec-more" role="group"
        aria-label="扩展筛选和操作" hidden={!menuOpen}>
        <fieldset><legend>类型</legend><div className="ec-filter-group">
          {[[ 'all','全部'],['app','应用'],['page','网页增强']].map(([value,label])=>
            <button key={value} type="button" data-ec-kind={value}
              aria-pressed={kind===value} onClick={()=>current.onKind?.(value)}>{label}</button>)}
        </div></fieldset>
        <fieldset className="ec-language"><legend>OpenDesk 界面语言</legend>
          <label htmlFor="extension-center-language" className="visually-hidden">界面语言</label>
          <select id="extension-center-language" aria-label="OpenDesk 界面语言"
            value={current.language||'zh-CN'}
            onChange={event=>current.onLanguage?.(event.currentTarget.value)}>
            <option value="zh-CN">简体中文</option><option value="en">English</option>
          </select>
        </fieldset>
        <fieldset><legend>显示范围</legend><div className="ec-filter-group">
          {[[ 'smart','已安装'],['available','可安装 / 更新']].map(([value,label])=>
            <button key={value} type="button" data-ec-scope={value}
              aria-pressed={scope===value} onClick={()=>current.onScope?.(value)}>{label}</button>)}
        </div></fieldset>
        <button id="extension-center-reset" className="ec-menu-action" type="button"
          onClick={()=>current.onReset?.()}>恢复默认筛选</button>
        <div className="ec-menu-separator">
          <button id="extension-center-import" className="ec-menu-action" type="button"
            onClick={()=>current.onImport?.()}>导入本地工具包</button>
          <button id="extension-center-reload" className="ec-menu-action" type="button"
            onClick={()=>current.onReload?.()}>刷新扩展</button>
        </div>
      </div>
    </div>
  </>;
}


// The trusted React shell alone owns these remaining Extension Center DOM
// children and their hidden/status attributes. Host/permission/cleanup
// decisions still belong to the existing Extension Center controller.
export function ExtensionEmpty({model,container}){
  const show=Boolean(model?.showEmpty);
  React.useLayoutEffect(()=>{container.hidden=!show;},[container,show]);
  return <p id="extension-center-empty-text">{model?.emptyText||''}</p>;
}

export function ExtensionRecoveries({model,container}){
  const ids=model?.ids||[];
  React.useLayoutEffect(()=>{container.hidden=ids.length===0;},[container,ids.length]);
  if(!ids.length)return null;
  return <>
    <p>以下扩展已从安装记录移除，但清理仍待完成：</p>
    {ids.map(id=><p key={id}>
      {id+' · 卸载清理待恢复'}
      <Button disabled={Boolean(model.busy)} aria-label={'恢复「'+id+'」的卸载清理'}
        onClick={event=>model.onRetry?.(id,event)}>恢复清理</Button>
    </p>)}
  </>;
}

export function ExtensionStatus({model,container}){
  React.useLayoutEffect(()=>{container.dataset.state=model?.state||'info';},
    [container,model?.state]);
  return model?.text||'';
}
