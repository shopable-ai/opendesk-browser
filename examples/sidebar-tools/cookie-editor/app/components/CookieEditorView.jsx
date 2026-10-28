import * as React from 'react';
import {compareCookieExpiration,localExpirationText} from '../domain/cookie-expiration.js';
// Independent, unprivileged presentation; identical source is used by the formal app and preview.
// Shared UI primitives are supplied by the official app shell, not by this pure display module.

// The same statically compiled presentation contract can be consumed by a
// preview adapter and a reviewed trusted adapter. Never read Cookie values,
// installed package HTML/JS or privileged browser transport in this module.
const shapes={
  users:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  globe:<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18"/></>,
  refresh:<><path d="M20 11a8 8 0 0 0-14.5-4.7L3 9m0-5v5h5M4 13a8 8 0 0 0 14.5 4.7L21 15m0 5v-5h-5"/></>,
  search:<><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,
  filter:<path d="M4 7h16M7 12h10M10 17h4"/>,
  download:<path d="M12 4v15m-5-5 5 5 5-5M4 20v2h16v-2"/>,
  upload:<path d="M12 20V5m-5 5 5-5 5 5M4 4V2h16v2"/>,
  plus:<path d="M12 5v14M5 12h14"/>,
  trash:<><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></>,
  close:<path d="M6 6l12 12M18 6 6 18"/>,
  undo:<><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></>,
  check:<path d="m5 12 5 5L20 7"/>,
  more:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  chevron:<path d="m7 10 5 5 5-5"/>,
  right:<path d="m9 18 6-6-6-6"/>,
  eye:<><path d="M2 12s3.4-6.5 10-6.5S22 12 22 12s-3.4 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></>,
  copy:<><rect x="7" y="7" width="13" height="13" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2"/></>,
  settings:<><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10 2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></>,
  edit:<path d="M15 5l4 4M4 20l4-.7L20 7a2 2 0 0 0-4-4L4 15v5z"/>,
  link:<path d="M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>,
  share:<><circle cx="18" cy="5" r="3"/><circle cx="5" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8 11 7-5M8 13l7 5"/></>,
  lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  eyeoff:<><path d="m3 3 18 18"/><path d="M9.8 5.7A10 10 0 0 1 12 5.5c6.6 0 10 6.5 10 6.5a13 13 0 0 1-3.4 4"/><path d="M6.5 6.5C3.5 8.4 2 12 2 12s3.4 6.5 10 6.5a10 10 0 0 0 4-.8"/></>
};
export function CookieIcon({name}){
  // An unregistered icon is a source contract failure, never an empty SVG.
  // All icon names used by the Cookie/Accounts presenters must be registered.
  if(!Object.hasOwn(shapes,name))throw Error('E_COOKIE_ICON_UNREGISTERED: '+String(name));
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round">{shapes[name]}</svg>;
}
function Action({name,label,disabled=false,onClick,pressed,tone='normal',appearance='default',className='',
  expanded,controls,haspopup,buttonRef}){
  return <button ref={buttonRef} type="button" title={label} aria-label={label}
    aria-expanded={expanded} aria-controls={controls} aria-haspopup={haspopup}
    className={'cookie-react-icon icon-btn od-icon-button'+(tone==='danger'?' cookie-clear-action od-icon-button--danger':'')+(appearance==='quiet'?' od-icon-button--quiet':'')+(className?' '+className:'')}
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
  const hintId=React.useId();
  // Input label cannot wrap both a text box and a clear button.
  // Raw Cookie values never enter presentation state.
  return <div className="field cookie-editor-value-field">
    <label className="cookie-value-label" htmlFor="opendesk-cookie-attribute-data">值</label>
    <div className="cookie-value-inline value-input">
      <input id="opendesk-cookie-attribute-data" name="opendesk-cookie-attribute-data"
        aria-label="Cookie 值" aria-invalid={invalid||undefined}
        aria-describedby={[describedBy,hintId].filter(Boolean).join(' ')} className="od-field"
        ref={inputRef} type="text" autoComplete="off" autoCapitalize="off"
        autoCorrect="off" spellCheck={false}
        data-cookie-secret-input="true" maxLength={maxLength}
        disabled={disabled} placeholder={placeholder} onChange={onChange}
        {...(inputValue===undefined?{}:{value:inputValue})}/>
      {showClear&&!disabled&&typeof onClear==='function'&&
        <Action name="close" label="清空值" className="cookie-value-clear" onClick={onClear}/>}
    </div>
    <span className="cookie-value-note" id={hintId}>修改将在点击保存后生效。</span>
  </div>;
}
// Pure presentation of the approved Preview IO controls. Both simulated
// and native adapters implement the callbacks; no credentials live here.
export function CookieImportDropzone({dragging=false,fileName='',maxSize='150 KB',
  disabled=false,onPick,onDragEnter,onDragOver,onDragLeave,onDrop}){
  return <button type="button"
    className={'cookie-import-file-picker od-button od-button--secondary cookie-button--compact'+
      (dragging?' is-dragging':'')}
    aria-label="选择或拖入 Cookie 文件" title={"JSON / TXT · 最大 "+maxSize} disabled={disabled} onClick={onPick}
    onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
    {dragging?'松开即可读取文件':fileName?'选择其他文件':'选择文件（可选）'}
  </button>;
}
// Two directly visible formats, with native buttons and keyboard-accessible tabs.
// Netscape remains a legacy domain format, but is not offered in the UI.
export function CookieExportFormatRow({format='json',onFormat,includeValues=true,
  onIncludeValues,disabled=false,panelId}){
  const tabs=React.useRef(null);
  const jsonId=React.useId();
  const headerId=React.useId();
  const changeFromKeys=event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||disabled)return;
    event.preventDefault();
    const next=event.key==='Home'?'json':event.key==='End'?'header':
      format==='json'?'header':'json';
    onFormat?.(next);
    tabs.current?.querySelector('[data-export-format="'+next+'"]')?.focus();
  };
  return <div className="export-format cookie-export-options">
    <div className="cookie-export-tabs" ref={tabs} role="tablist"
      aria-label="导出格式" onKeyDown={changeFromKeys}>
      {[['json','JSON',jsonId],['header','Cookie Header',headerId]].map(([key,label,id])=>
        <button key={key} id={id} data-export-format={key} type="button" role="tab"
          className="od-button cookie-button--choice"
          aria-selected={format===key} aria-controls={panelId} tabIndex={format===key?0:-1}
          disabled={disabled} onClick={()=>onFormat?.(key)}>{label}</button>)}
    </div>
    <label className="export-inline-values cookie-export-values">
      <input type="checkbox" checked={includeValues} disabled={disabled}
        onChange={e=>onIncludeValues?.(e.target.checked)}/>包含 Cookie 值
    </label>
  </div>;
}
export function CookieExportActions({onCopy,onDownload,disabled=false,downloadLabel='下载'}){
  return <div className="export-actions cookie-export-actions">
    <button type="button" className="text-btn od-button od-button--secondary cookie-button--compact"
      disabled={disabled} onClick={onCopy}><CookieIcon name="copy"/>{' '}复制</button>
    <button type="button" className="text-btn primary od-button od-button--primary cookie-button--compact"
      disabled={disabled} onClick={onDownload}><CookieIcon name="download"/>{' '}{downloadLabel}</button>
  </div>;
}
// Compact, visible Expiration choice. Domain/Controller own actual Cookie rules;
// mode selection only converts safe UI input into existing session/expiration draft.
export function CookieExpirationField({draft,disabled=false,onChange=()=>{},error=''}) {
  const [mode,setMode]=React.useState(()=>draft.session?'session':'date');
  const [duration,setDuration]=React.useState('7d');
  const durations=React.useMemo(()=>[
    ['1h','1 小时',3600],['1d','1 天',86400],
    ['7d','7 天',604800],['30d','30 天',2592000]
  ],[]);
  const chooseDuration=key=>{
    const seconds=durations.find(([value])=>value===key)?.[2]||86400;
    setDuration(key);
    onChange('expiration',localExpirationText(Math.floor(Date.now()/1000)+seconds));
  };
  const changeMode=next=>{
    setMode(next);
    onChange('session',next==='session');
    if(next!=='session'&&(next==='duration'||!draft.expiration)){
      chooseDuration(duration);
    }
  };
  return <section className="cookie-expiration-compact" aria-label="有效期设置">
    <label className="cookie-expiration-mode">
      <span>有效期<small>Expiration</small></span>
      <select className="od-field" aria-label="有效期方式" value={mode}
        disabled={disabled} onChange={event=>changeMode(event.target.value)}>
        <option value="session">会话（Session）</option>
        <option value="date">指定日期</option>
        <option value="duration">相对时长</option>
      </select>
    </label>
    {mode==='session'?<p className="editor-timezone" role="status">
      按浏览器会话管理，不设置固定到期日。
    </p>:mode==='date'?<label className="cookie-expiration-date">
      <span>到期日期和时间（本机时区）</span>
      <input className="od-field" type="datetime-local" step="1"
        aria-label="过期时间（Expiration，本地时间）"
        aria-invalid={/过期时间|本地时间|夏令时/.test(error)||undefined}
        value={draft.expiration||''} disabled={disabled}
        onChange={event=>onChange('expiration',event.target.value)}/>
      <small>到期时间：{draft.expiration?new Date(draft.expiration).toLocaleString('zh-CN'):'—'}（本机时间）</small>
    </label>:<label className="cookie-expiration-duration">
      <span>从保存时刻起</span>
      <select className="od-field" aria-label="有效时长" value={duration}
        disabled={disabled} onChange={event=>chooseDuration(event.target.value)}>
        {durations.map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select>
      <small>保存后预计到期：{draft.expiration?new Date(draft.expiration).toLocaleString('zh-CN'):'—'}（本机时间）</small>
    </label>}
  </section>;
}

// One advanced editor surface; Cookie identity rules and validation remain
// solely with the caller's Domain/Controller, never inside presentation.
export function CookieAdvancedFields({draft,existing=false,disabled=false,onChange=()=>{},
  advancedOpen,onAdvancedToggle,error=''}){
  return <details className="advanced cookie-editor-details"
    open={advancedOpen} onToggle={onAdvancedToggle}>
    <summary>其他属性 / 存储信息</summary>
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
          {!existing&&<label title="仅当前主机"><input type="checkbox"
            checked={draft.hostOnly===true} disabled={disabled}
            onChange={e=>onChange('hostOnly',e.target.checked)}/> Host-only</label>
          }
          <label><input type="checkbox" checked={draft.secure===true}
            disabled={disabled} onChange={e=>onChange('secure',e.target.checked)}/> Secure</label>
          <label><input type="checkbox" checked={draft.httpOnly===true}
            disabled={disabled} onChange={e=>onChange('httpOnly',e.target.checked)}/> HttpOnly</label>
        </div>
      </div>
      <p className="cookie-attribute-note">Session 不保存固定到期日；指定日期或相对时长会保存 expirationDate（Unix 秒，可在 JSON 中查看）。</p>
      {existing&&<details className="editor-identity">
        <summary>存储信息</summary>
        <div className="editor-identity-fields">
          <div><span>Host-only</span><code>{draft.hostOnly?'是（仅当前主机）':'否（跨子域）'}</code></div>
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
    <Action name="refresh" label="重新读取 Cookie" appearance="quiet" onClick={onRefresh}
      disabled={busy||!granted||typeof onRefresh!=='function'}/>
  </header>;
}
export function CookieToolbar({count=0,onImport,onExport,onNew,onClear,
  busy=false,readonly=false,clearDisabled=false,exportOpen=false,importOpen=false,
  exportContent=null,onCloseExport}){
  const exportButton=React.useRef(null);
  const exportPopup=React.useRef(null);
  const exportPopupId=React.useId();
  React.useEffect(()=>{
    if(!exportOpen)return;
    const inside=target=>exportButton.current?.contains(target)||
      exportPopup.current?.contains(target);
    const dismiss=event=>{
      if(!busy&&!inside(event.target))onCloseExport?.(false);
    };
    const escape=event=>{
      if(event.key!=='Escape'||busy)return;
      event.preventDefault();event.stopPropagation();
      onCloseExport?.(true);
    };
    const blurred=()=>{if(!busy)onCloseExport?.(false);};
    document.addEventListener('pointerdown',dismiss,true);
    document.addEventListener('focusin',dismiss,true);
    document.addEventListener('keydown',escape,true);
    window.addEventListener('blur',blurred);
    return ()=>{
      document.removeEventListener('pointerdown',dismiss,true);
      document.removeEventListener('focusin',dismiss,true);
      document.removeEventListener('keydown',escape,true);
      window.removeEventListener('blur',blurred);
    };
  },[exportOpen,busy,onCloseExport]);
  return <div className="list-toolbar">
    <strong>Cookie <span>{count}</span></strong>
    <div className="toolbar-actions">
      <Action name="upload" label="导入 Cookie" appearance="quiet" onClick={onImport}
        expanded={importOpen}
        controls={importOpen?"cookie-import-drawer":undefined}
        disabled={busy||importOpen||readonly||typeof onImport!=='function'}/>
      <Action name="download" label="导出 Cookie" appearance="quiet" onClick={onExport}
        buttonRef={exportButton} haspopup="dialog" expanded={exportOpen}
        controls={exportOpen?exportPopupId:undefined}
        disabled={busy||typeof onExport!=='function'}/>
      <span data-action="new"><Action name="plus" label="新建 Cookie" appearance="quiet"
        onClick={onNew} disabled={busy||readonly||typeof onNew!=='function'}/></span>
      <span className="action-separator" aria-hidden="true"/>
      <Action name="trash" label="安全清理本站 Cookie" tone="danger" appearance="quiet"
        onClick={onClear} disabled={busy||readonly||clearDisabled||typeof onClear!=='function'}/>
      {exportOpen&&<div className="cookie-export-popover" id={exportPopupId} ref={exportPopup}>
        {exportContent}
      </div>}
    </div>
  </div>;
}
export function CookieSearch({
  query='',onQuery=()=>{},expandedFilters=false,onToggleFilters=()=>{},
  filter='all',onFilter=()=>{},sort='source',onSort=()=>{}
}){
  const searchRef=React.useRef(null);
  return <>
    <div className="searchbar">
      <div className="searchbox" role="search">
        <span className="cookie-search-symbol"><CookieIcon name="search"/></span>
        <input ref={searchRef} value={query} type="search" onChange={e=>onQuery(e.target.value)}
          placeholder="搜索名称、域名或路径" aria-label="搜索 Cookie"/>
        {query&&<Action name="close" label="清除搜索" className="cookie-search-clear"
          onClick={()=>{onQuery("");searchRef.current?.focus({preventScroll:true});}}/>}
      </div>
      <Action name="filter" label="筛选与排序" appearance="quiet" pressed={expandedFilters}
        onClick={onToggleFilters}/>
    </div>
    {expandedFilters&&<section className="filter-panel" aria-label="筛选与排序">
      <div className="filter-chips">
        {[['all','全部'],['secure','Secure'],['httpOnly','HttpOnly'],
          ['session','会话'],['partitioned','分区']].map(([key,label])=>
          <button key={key} type="button" className="chip od-button cookie-button--choice"
            onClick={()=>onFilter(key)} aria-pressed={filter===key}>{label}</button>)}
      </div>
      <label className="sort-field" title="排序">
        <select className="od-field" aria-label="Cookie 排序" value={sort} onChange={e=>onSort(e.target.value)}>
          <option value="source">原始顺序</option>
          <option value="name">名称</option><option value="domain">域名</option>
          <option value="path">路径</option><option value="expiration">过期时间</option>
        </select>
      </label>
    </section>}
  </>;
}
// Session Cookies have no absolute expiration; presentation reads only redacted metadata.
export function cookieRowExpiryLabel(row,nowSeconds=Date.now()/1000){
  if(row.session===true)return '会话 · 结束时间由浏览器决定';
  if(!Number.isFinite(row.expirationDate))return '到期时间未知';
  if(row.expirationDate<=nowSeconds)return '已过期';
  const local=localExpirationText(row.expirationDate);
  return local?'到期 '+local.slice(5,16).replace('-','/').replace('T',' '):'到期时间未知';
}
export function CookieRows({
  rows=[],totalCount=rows.length,selected=null,onSelect=()=>{},
  pinnedNote=false,beforeRows=null,newEditor=null,renderEditor=null,idPrefix='editor-',site=''
}){
  return <section className="cookie-list" aria-label="Cookie 列表">
    {beforeRows}
    {newEditor}
    {pinnedNote&&<p className="pinned-note">当前编辑项不符合筛选条件，暂时保留显示。</p>}
    {rows.map(row=>{
      const expired=row.session!==true&&Number.isFinite(row.expirationDate)&&
        row.expirationDate<=Date.now()/1000;
      const details=[
        cookieRowExpiryLabel(row),
        ...(String(row.domain||'').replace(/^\./,'')===site?[]:[row.domain]),
        ...(row.path==='/'?[]:[row.path]),
        ...(row.hostOnly===false?['跨子域']:[])
      ].filter(Boolean);
      return <article key={row.id} className={'cookie-row '+(selected===row.id?'expanded':'')}>
        <button className="row-trigger" data-row={row.id} type="button"
          aria-expanded={selected===row.id} aria-controls={idPrefix+row.id}
          onClick={()=>onSelect(row.id)}>
          <span className="row-text"><strong>{row.name}</strong>
            <small className={expired?'cookie-row-expired':undefined}>{details.join(' · ')}</small>
          </span>
          <span className="row-flags">
            {row.httpOnly===true&&<abbr title="HttpOnly" aria-label="HttpOnly">H</abbr>}
            {row.secure===true&&<abbr title="Secure" aria-label="Secure">S</abbr>}
            {Boolean(row.partitionKey)&&<abbr title="Partitioned" aria-label="Partitioned">P</abbr>}
          </span>
          <CookieIcon name="chevron"/>
        </button>
        {selected===row.id&&<div id={idPrefix+row.id}>
          {renderEditor?renderEditor(row):
            <div className="cookie-react-detail" role="status">
              <span>仅展示 Cookie 元数据；读取敏感值需要额外授权。</span>
              <button type="button" className="od-button od-button--secondary"
                onClick={()=>onSelect(null)}>收起</button>
            </div>}
        </div>}
      </article>;
    })}
    {rows.length===0&&!newEditor&&<div className="empty-list">
      <strong>{totalCount===0?'本站暂无 Cookie':'没有匹配的 Cookie'}</strong>
      <span>{totalCount===0?'可以新建或导入。':'尝试更换关键词或筛选条件。'}</span>
    </div>}
  </section>;
}
export function CookieEditorView({
  site,rows=[],selected=null,onSelect=()=>{},onRefresh,syncStale=false,
  query='',onQuery=()=>{},filter='all',onFilter=()=>{},sort='source',
  onSort=()=>{},expandedFilters=false,onToggleFilters=()=>{},
  onImport,onExport,onNew,onClear,clearDisabled=false,exportOpen=false,
  exportContent=null,onCloseExport,importOpen=false,importContent=null,
  editor=null,newEditor=null,busy=false,readonly=false,page=1,pageSize=40,onPage=()=>{},showSiteBar=true
}){
  const matching=row=>[row.name,row.domain,row.path].some(value=>
    String(value||'').toLowerCase().includes(query.toLowerCase()))&&
    (filter==='all'||(filter==='partitioned'?Boolean(row.partitionKey):
      filter==='session'?Boolean(row.session):Boolean(row[filter])));
  const visible=rows.filter(matching).sort((a,b)=>sort==='source'?0:sort==='name'
    ?a.name.localeCompare(b.name):sort==='domain'
      ?a.domain.localeCompare(b.domain):sort==='path'
        ?a.path.localeCompare(b.path):compareCookieExpiration(a,b));
  const current=rows.find(row=>row.id===selected);
  if(current&&!visible.includes(current))visible.unshift(current);
  const pages=Math.max(1,Math.ceil(visible.length/pageSize));
  const safePage=Math.min(Math.max(1,page),pages);
  const currentPage=visible.slice((safePage-1)*pageSize,safePage*pageSize);
  // Keep expanded editor reachable even when the filter or page changes.
  if(current&&!currentPage.includes(current))currentPage.unshift(current);
  return <main className="cookie-react-view" aria-label="Cookie Editor">
    {showSiteBar&&<CookieSiteBar site={site} readonly={readonly} busy={busy}
      syncStale={syncStale} onRefresh={onRefresh}/>}
    {/* Keep search accessible in one click while the export popover is open.
        The menu still floats over the list, never over the search field. */}
    <CookieSearch query={query} onQuery={onQuery}
      expandedFilters={expandedFilters} onToggleFilters={onToggleFilters}
      filter={filter} onFilter={onFilter} sort={sort} onSort={onSort}/>
    <CookieToolbar count={rows.length} onImport={onImport} onExport={onExport}
      onNew={onNew} onClear={onClear} clearDisabled={clearDisabled}
      exportOpen={exportOpen} exportContent={exportContent} onCloseExport={onCloseExport}
      importOpen={importOpen} busy={busy} readonly={readonly}/>
    <CookieRows site={site} rows={currentPage} totalCount={rows.length} selected={selected}
      beforeRows={importContent} newEditor={newEditor}
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
