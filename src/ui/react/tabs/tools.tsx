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

 
// The trusted Detail view has a separate React root. The parent back button,
// filtering, selection epoch and all permission checks stay with Extension Center.
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
