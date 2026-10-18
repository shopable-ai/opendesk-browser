import * as React from 'react';
// Independent, unprivileged presentation; identical source is used by the formal app and preview.
// Shared UI primitives are supplied by the official app shell, not by this pure display module.

// The same statically compiled presentation contract can be consumed by a
// preview adapter and a reviewed trusted adapter. Never read Cookie values,
// installed package HTML/JS, Chrome APIs or OpenDeskSDK in this module.
const shapes={
  globe:<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18"/></>,
  refresh:<><path d="M20 11a8 8 0 0 0-14.5-4.7L3 9m0-5v5h5M4 13a8 8 0 0 0 14.5 4.7L21 15m0 5v-5h-5"/></>,
  search:<><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
  filter:<path d="M4 6h16M7 12h10m-7 6h4"/>,
  download:<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>,
  upload:<path d="M12 21V9m-4 4 4-4 4 4M4 3v4h16V3"/>,
  plus:<path d="M12 5v14M5 12h14"/>,
  trash:<><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></>,
  chevron:<path d="m7 10 5 5 5-5"/>,
  eye:<><path d="M2 12s3.4-6.5 10-6.5S22 12 22 12s-3.4 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></>,
  eyeoff:<><path d="m3 3 18 18"/><path d="M9.8 5.7A10 10 0 0 1 12 5.5c6.6 0 10 6.5 10 6.5a13 13 0 0 1-3.4 4"/><path d="M6.5 6.5C3.5 8.4 2 12 2 12s3.4 6.5 10 6.5a10 10 0 0 0 4-.8"/></>
};
export function CookieIcon({name}){
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round">{shapes[name]||null}</svg>;
}
function Action({name,label,disabled=false,onClick,pressed,tone='normal'}){
  return <button type="button" title={label} aria-label={label}
    className={'cookie-react-icon icon-btn od-icon-button'+(tone==='danger'?' cookie-clear-action od-icon-button--danger':'')}
    disabled={disabled} aria-pressed={pressed===undefined?undefined:pressed}
    onClick={onClick}><CookieIcon name={name}/></button>;
}
// Pure presentation; this exact JSX is imported by preview and trusted pilot.
export function CookieSiteBar({site,loading=false,readonly=false,busy=false,granted=true,onRefresh}){
  return <header className="site-bar">
    <span className="site-symbol"><CookieIcon name="globe"/></span>
    <div className="site-name"><span>当前网站</span><strong title={site}>{site}</strong></div>
    {loading&&<span className="site-status muted">读取中</span>}
    {readonly&&<span className="site-status limited">仅查看</span>}
    <Action name="refresh" label="刷新 Cookie" onClick={onRefresh}
      disabled={busy||!granted||typeof onRefresh!=='function'}/>
  </header>;
}
export function CookieToolbar({count=0,onImport,onExport,onNew,onClear,
  busy=false,readonly=false,clearDisabled=false}){
  return <div className="list-toolbar">
    <strong>Cookie <span>{count}</span></strong>
    <div className="toolbar-actions">
      <Action name="upload" label="导入 Cookie" onClick={onImport}
        disabled={busy||readonly||typeof onImport!=='function'}/>
      <Action name="download" label="导出 Cookie" onClick={onExport}
        disabled={busy||typeof onExport!=='function'}/>
      <span data-action="new"><Action name="plus" label="新建 Cookie"
        onClick={onNew} disabled={busy||readonly||typeof onNew!=='function'}/></span>
      <span className="action-separator" aria-hidden="true"/>
      <Action name="trash" label="安全清理本站 Cookie" tone="danger"
        onClick={onClear} disabled={busy||readonly||clearDisabled||typeof onClear!=='function'}/>
    </div>
  </div>;
}
export function CookieSearch({
  query='',onQuery=()=>{},expandedFilters=false,onToggleFilters=()=>{},
  filter='all',onFilter=()=>{},sort='name',onSort=()=>{}
}){
  return <>
    <div className="searchbar">
      <div className="searchbox"><CookieIcon name="search"/>
        <input className="od-field" value={query} type="search" onChange={e=>onQuery(e.target.value)}
          placeholder="搜索名称、域名或路径" aria-label="搜索 Cookie"/>
      </div>
      <Action name="filter" label="筛选与排序" pressed={expandedFilters}
        onClick={onToggleFilters}/>
    </div>
    {expandedFilters&&<section className="filter-panel" aria-label="筛选与排序">
      <div className="filter-chips">
        {[['all','全部'],['secure','Secure'],['httpOnly','HttpOnly'],
          ['session','会话'],['partitioned','分区']].map(([key,label])=>
          <button key={key} type="button" className={'chip od-button '+(filter===key?'selected':'od-button--secondary')}
            onClick={()=>onFilter(key)} aria-pressed={filter===key}>{label}</button>)}
      </div>
      <label className="sort-field">排序
        <select className="od-field" value={sort} onChange={e=>onSort(e.target.value)}>
          <option value="name">名称</option><option value="domain">域名</option>
          <option value="path">路径</option><option value="expiration">过期时间</option>
        </select>
      </label>
    </section>}
  </>;
}
export function CookieRows({
  rows=[],totalCount=rows.length,selected=null,onSelect=()=>{},
  pinnedNote=false,newEditor=null,renderEditor=null,idPrefix='editor-'
}){
  return <section className="cookie-list" aria-label="Cookie 列表">
    {newEditor}
    {pinnedNote&&<p className="pinned-note">当前编辑项不符合筛选条件，暂时保留显示。</p>}
    {rows.map(row=><article key={row.id}
      className={'cookie-row '+(selected===row.id?'expanded':'')}>
      <button className="row-trigger od-button od-button--quiet" data-row={row.id} type="button"
        aria-expanded={selected===row.id} aria-controls={idPrefix+row.id}
        onClick={()=>onSelect(row.id)}>
        <span className="row-text"><strong>{row.name}</strong>
          <small>{row.domain} <span>·</span> {row.path}</small></span>
        <span className="row-flags">
          {row.httpOnly&&<abbr title="HttpOnly">H</abbr>}
          {row.secure&&<abbr title="Secure">S</abbr>}
          {row.partitionKey&&<abbr title="Partitioned">P</abbr>}
        </span>
        <CookieIcon name="chevron"/>
      </button>
      {selected===row.id&&<div id={idPrefix+row.id}>
        {renderEditor?renderEditor(row):
          <div className="cookie-react-detail" role="status">
            <span>仅展示虚构元数据，不读取 Cookie 值。</span>
            <button type="button" className="od-button od-button--secondary" onClick={()=>onSelect(null)}>收起</button>
          </div>}
      </div>}
    </article>)}
    {rows.length===0&&!newEditor&&<div className="empty-list">
      <strong>{totalCount===0?'本站暂无 Cookie':'没有匹配的 Cookie'}</strong>
      <span>{totalCount===0?'可以新建或导入。':'尝试更换关键词或筛选条件。'}</span>
    </div>}
  </section>;
}
export function CookieEditorView({
  site,rows=[],selected=null,onSelect=()=>{},onRefresh,
  query='',onQuery=()=>{},filter='all',onFilter=()=>{},sort='name',
  onSort=()=>{},expandedFilters=false,onToggleFilters=()=>{},
  onImport,onExport,onNew,onClear,clearDisabled=false,
  editor=null,busy=false,readonly=false,page=1,pageSize=40,onPage=()=>{}
}){
  const matching=row=>[row.name,row.domain,row.path].some(value=>
    String(value||'').toLowerCase().includes(query.toLowerCase()))&&
    (filter==='all'||(filter==='partitioned'?Boolean(row.partitionKey):
      filter==='session'?Boolean(row.session):Boolean(row[filter])));
  const visible=rows.filter(matching).sort((a,b)=>sort==='name'
    ?a.name.localeCompare(b.name):sort==='domain'
      ?a.domain.localeCompare(b.domain):sort==='path'
        ?a.path.localeCompare(b.path):(Number(a.expirationDate)||0)-(Number(b.expirationDate)||0));
  const current=rows.find(row=>row.id===selected);
  if(current&&!visible.includes(current))visible.unshift(current);
  const pages=Math.max(1,Math.ceil(visible.length/pageSize));
  const safePage=Math.min(Math.max(1,page),pages);
  const currentPage=visible.slice((safePage-1)*pageSize,safePage*pageSize);
  // Keep expanded editor reachable even when the filter or page changes.
  if(current&&!currentPage.includes(current))currentPage.unshift(current);
  return <main className="cookie-react-view" aria-label="Cookie Editor">
    <CookieSiteBar site={site} readonly={readonly} busy={busy} onRefresh={onRefresh}/>
    <CookieToolbar count={rows.length} onImport={onImport} onExport={onExport}
      onNew={onNew} onClear={onClear} clearDisabled={clearDisabled}
      busy={busy} readonly={readonly}/>
    <CookieSearch query={query} onQuery={onQuery}
      expandedFilters={expandedFilters} onToggleFilters={onToggleFilters}
      filter={filter} onFilter={onFilter} sort={sort} onSort={onSort}/>
    <CookieRows rows={currentPage} totalCount={rows.length} selected={selected}
      onSelect={id=>onSelect(id===selected?null:id)} renderEditor={editor}
      idPrefix="cookie-react-editor-"/>
    {pages>1&&<nav className="cookie-pages" aria-label="Cookie 分页">
      <button type="button" className="od-button od-button--secondary" disabled={safePage===1||busy}
        onClick={()=>onPage(safePage-1)}>上一页</button>
      <span>{safePage} / {pages}</span>
      <button type="button" className="od-button od-button--secondary" disabled={safePage===pages||busy}
        onClick={()=>onPage(safePage+1)}>下一页</button>
    </nav>}
  </main>;
}
