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
