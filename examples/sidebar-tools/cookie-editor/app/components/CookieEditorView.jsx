import * as React from 'react';
// Independent, unprivileged presentation; identical source is used by the formal app and preview.
// Shared UI primitives are supplied by the official app shell, not by this pure display module.

// The same statically compiled presentation contract can be consumed by a
// preview adapter and a reviewed trusted adapter. Never read Cookie values,
// installed package HTML/JS or privileged browser transport in this module.
const shapes={
  globe:<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18"/></>,
  refresh:<><path d="M20 11a8 8 0 0 0-14.5-4.7L3 9m0-5v5h5M4 13a8 8 0 0 0 14.5 4.7L21 15m0 5v-5h-5"/></>,
  search:<><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
  filter:<path d="M4 6h16M7 12h10m-7 6h4"/>,
  download:<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>,
  upload:<path d="M12 21V9m-4 4 4-4 4 4M4 3v4h16V3"/>,
  plus:<path d="M12 5v14M5 12h14"/>,
  trash:<><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></>,
  close:<path d="M6 6l12 12M18 6 6 18"/>,
  undo:<><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></>,
  check:<path d="m5 12 5 5L20 7"/>,
  more:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  chevron:<path d="m7 10 5 5 5-5"/>,
  eye:<><path d="M2 12s3.4-6.5 10-6.5S22 12 22 12s-3.4 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></>,
  copy:<><rect x="7" y="7" width="13" height="13" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2"/></>,
  eyeoff:<><path d="m3 3 18 18"/><path d="M9.8 5.7A10 10 0 0 1 12 5.5c6.6 0 10 6.5 10 6.5a13 13 0 0 1-3.4 4"/><path d="M6.5 6.5C3.5 8.4 2 12 2 12s3.4 6.5 10 6.5a10 10 0 0 0 4-.8"/></>
};
export function CookieIcon({name}){
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round">{shapes[name]||null}</svg>;
}
function Action({name,label,disabled=false,onClick,pressed,tone='normal',className=''}){
  return <button type="button" title={label} aria-label={label}
    className={'cookie-react-icon icon-btn od-icon-button'+(tone==='danger'?' cookie-clear-action od-icon-button--danger':'')+(className?' '+className:'')}
    disabled={disabled} aria-pressed={pressed===undefined?undefined:pressed}
    onClick={onClick}><CookieIcon name={name}/></button>;
}
export {Action as CookieIconButton};
// The approved Preview and the official native Controller render the same
// label/control DOM. This component knows nothing about Cookie credentials.
export function CookieFormField({label,children,className=''}) {
  return <label className={('field '+className).trim()}>
    <span>{label}</span>{children}
  </label>;
}
// Neutral attribute naming prevents the browser from interpreting a Cookie
// value editor as a username/password form. Never use a password-type input here.
export function CookieValueField({inputRef,inputValue,onChange,disabled=false,
  placeholder='',maxLength=4096,invalid=false,describedBy,showClear=false,onClear}){
  // Input label cannot wrap both a text box and a clear button.
  // Raw Cookie values never enter presentation state.
  return <div className="field cookie-editor-value-field">
    <label className="cookie-value-label" htmlFor="opendesk-cookie-attribute-data">值</label>
    <div className="cookie-value-inline value-input">
      <input id="opendesk-cookie-attribute-data" name="opendesk-cookie-attribute-data"
        aria-label="Cookie 值" aria-invalid={invalid||undefined}
        aria-describedby={describedBy} className="od-field"
        ref={inputRef} type="text" autoComplete="off" autoCapitalize="off"
        autoCorrect="off" spellCheck={false}
        data-cookie-secret-input="true" maxLength={maxLength}
        disabled={disabled} placeholder={placeholder} onChange={onChange}
        {...(inputValue===undefined?{}:{value:inputValue})}/>
      {showClear&&!disabled&&typeof onClear==='function'&&
        <Action name="close" label="清空值" className="cookie-value-clear" onClick={onClear}/>}
    </div>
  </div>;
}
// Pure presentation of the approved Preview IO controls. Both simulated
// and native adapters implement the callbacks; no credentials live here.
export function CookieImportDropzone({dragging=false,fileName='',maxSize='150 KB',
  disabled=false,onPick,onDragEnter,onDragOver,onDragLeave,onDrop}){
  return <button type="button"
    className={'import-dropzone cookie-import-dropzone od-button od-button--secondary'+
      (dragging?' is-dragging':'')}
    aria-label="选择或拖入 Cookie 文件" disabled={disabled} onClick={onPick}
    onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
    <span className="dropzone-symbol"><CookieIcon name="upload"/></span>
    <span className="dropzone-copy">
      <strong>{dragging?'松开即可读取文件':fileName?'拖入新文件替换，或点击选择':
        '拖入 Cookie 文件，或点击选择'}</strong>
      <small>JSON / TXT · 最大 {maxSize}</small>
    </span>
  </button>;
}
export function CookieExportFormatRow({format='json',onFormat,includeValues=true,
  onIncludeValues,disabled=false}){
  return <div className="export-format cookie-export-options">
    <CookieFormField label="格式" className="cookie-export-format">
      <select className="od-field" aria-label="导出格式" value={format}
        disabled={disabled} onChange={e=>onFormat?.(e.target.value)}>
        <option value="json">JSON · 推荐</option>
        <option value="header">Cookie Header</option>
        <option value="netscape">Netscape</option>
      </select>
    </CookieFormField>
    {format==='json'&&<label className="export-inline-values cookie-export-values">
      <input type="checkbox" checked={includeValues} disabled={disabled}
        onChange={e=>onIncludeValues?.(e.target.checked)}/>包含值
    </label>}
  </div>;
}
export function CookieExportActions({onCopy,onDownload,disabled=false,downloadLabel='下载'}){
  return <div className="export-actions cookie-export-actions">
    <button type="button" className="text-btn od-button od-button--secondary"
      disabled={disabled} onClick={onCopy}><CookieIcon name="copy"/>复制</button>
    <button type="button" className="text-btn primary od-button od-button--primary"
      disabled={disabled} onClick={onDownload}><CookieIcon name="download"/>{downloadLabel}</button>
  </div>;
}
// One advanced editor surface; Cookie identity rules and validation remain
// solely with the caller's Domain/Controller, never inside presentation.
export function CookieAdvancedFields({draft,existing=false,disabled=false,onChange=()=>{},
  advancedOpen,onAdvancedToggle,error=''}){
  return <details className="advanced cookie-editor-details od-disclosure"
    open={advancedOpen} onToggle={onAdvancedToggle}>
    <summary>属性</summary>
    <div className="advanced-body">
      <div className="pair">
        <CookieFormField label="Domain">
          <input className="od-field" aria-label="Domain" value={draft.domain||''}
            onChange={e=>onChange('domain',e.target.value)}
            readOnly={existing} disabled={disabled}/>
        </CookieFormField>
        <CookieFormField label="Path">
          <input className="od-field" aria-label="Path" value={draft.path||'/'}
            onChange={e=>onChange('path',e.target.value)}
            readOnly={existing} disabled={disabled}/>
        </CookieFormField>
      </div>
      <CookieFormField label="SameSite">
        <select className="od-field" aria-label="SameSite"
          value={draft.sameSite||'unspecified'} disabled={disabled}
          onChange={e=>onChange('sameSite',e.target.value)}>
          <option value="unspecified">未指定</option>
          <option value="lax">Lax</option><option value="strict">Strict</option>
          <option value="no_restriction">None</option>
        </select>
      </CookieFormField>
      <div className="toggles-row">
        <div className="toggles">
          <label title="仅当前主机"><input type="checkbox"
            checked={draft.hostOnly===true} disabled={existing||disabled}
            onChange={e=>onChange('hostOnly',e.target.checked)}/> Host-only</label>
          <label><input type="checkbox" checked={draft.secure===true}
            disabled={disabled} onChange={e=>onChange('secure',e.target.checked)}/> Secure</label>
          <label><input type="checkbox" checked={draft.httpOnly===true}
            disabled={disabled} onChange={e=>onChange('httpOnly',e.target.checked)}/> HttpOnly</label>
          <label><input type="checkbox" checked={draft.session===true}
            disabled={disabled} onChange={e=>onChange('session',e.target.checked)}/> Session</label>
        </div>
      </div>
      {!draft.session&&<CookieFormField label="过期">
        <input className="od-field" aria-label="过期时间（本地时间）"
          title="本地时间"
          aria-invalid={error.startsWith('请选择有效的未来')||undefined}
          type="datetime-local" step="1" value={draft.expiration||''}
          onChange={e=>onChange('expiration',e.target.value)} disabled={disabled}/>
      </CookieFormField>}
      {existing&&<details className="editor-identity">
        <summary>存储信息</summary>
        <div className="editor-identity-fields">
          <div><span>Store ID</span><code>{draft.storeId??'默认'}</code></div>
          <div><span>PartitionKey</span><code>{draft.partitionKey?JSON.stringify(draft.partitionKey):'—'}</code></div>
        </div>
      </details>}
    </div>
  </details>;
}
// Pure presentation shared by Preview and official React.
export function CookieSiteBar({site,loading=false,readonly=false,busy=false,granted=true,syncStale=false,onRefresh}){
  return <header className="site-bar">
    <strong className="site-hostname" title={site} aria-label={'网站 '+site}>{site}</strong>
    {loading&&<span className="site-status muted">读取中</span>}
    {readonly&&<span className="site-status limited">只读</span>}
    {syncStale&&<span className="site-status limited" title="自动同步暂不可用">未同步</span>}
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
          {row.httpOnly&&<abbr title="HttpOnly · 网页脚本不可读取" aria-label="HttpOnly Cookie">H</abbr>}
          {row.secure&&<abbr title="Secure · 仅安全连接传输" aria-label="Secure Cookie">S</abbr>}
          {row.partitionKey&&<abbr title="Partitioned · 分区 Cookie" aria-label="Partitioned Cookie">P</abbr>}
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
  site,rows=[],selected=null,onSelect=()=>{},onRefresh,syncStale=false,
  query='',onQuery=()=>{},filter='all',onFilter=()=>{},sort='name',
  onSort=()=>{},expandedFilters=false,onToggleFilters=()=>{},
  onImport,onExport,onNew,onClear,clearDisabled=false,
  editor=null,newEditor=null,busy=false,readonly=false,page=1,pageSize=40,onPage=()=>{}
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
    <CookieSiteBar site={site} readonly={readonly} busy={busy}
      syncStale={syncStale} onRefresh={onRefresh}/>
    <CookieToolbar count={rows.length} onImport={onImport} onExport={onExport}
      onNew={onNew} onClear={onClear} clearDisabled={clearDisabled}
      busy={busy} readonly={readonly}/>
    <CookieSearch query={query} onQuery={onQuery}
      expandedFilters={expandedFilters} onToggleFilters={onToggleFilters}
      filter={filter} onFilter={onFilter} sort={sort} onSort={onSort}/>
    <CookieRows rows={currentPage} totalCount={rows.length} selected={selected}
      newEditor={newEditor}
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
