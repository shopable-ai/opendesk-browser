import * as React from 'react';
import {CookieIcon,CookieIconButton} from './CookieEditorView.jsx';
import {createAccountSwitchUrl,inspectAccountSwitchUrl} from '../domain/account-switch-url.js';
import {CookieAccountShare} from './CookieAccountExperiences.jsx';
import {CookieMembershipRecommendations} from './CookieBusinessPanels.jsx';

const ruleHelp={
  E_URL_INVALID:'请输入普通 HTTP(S) 网页地址。',
  E_QUERY_NOT_SUPPORTED:'不接受 Query 自动切换参数。',
  E_ALIAS_INVALID:'账号别名无效。',
  E_ROUTE_CONFLICT:'链接与网站现有路由冲突。',
  E_SITE_NOT_APPROVED:'未确认目标网站授权。',
  E_SITE_MISMATCH:'链接不属于当前网站。',
  E_SITE_ADAPTER_REQUIRED:'此网站尚未通过 URL 路由兼容性验证。',
  E_AUTO_SWITCH_OFF:'URL 自动切换尚未开启。',
  E_ALIAS_NOT_ALLOWED:'该账号未列入自动切换白名单。'
};

// This screen renders only metadata. Raw Cookie values stay in the trusted
// controller/adapter and must never be passed to presentation props.
export function CookieAccounts({
  origin='',accounts=[],currentAlias=null,route='list',onRoute=()=>{},
  configured=false,vaultReady=false,switchReady=false,autoRuntimeReady=false,
  busy=false,feedback=null,previewOnly=false,onUnlock,onLock,
  autoEnabled=false,autoRefresh=true,
  onCreate,onSwitch,onRename,onUpdate,onDelete,onShare,
  onToggleAuto,onToggleRefresh,onAllowAlias,onCopyLink
}){
  const [query,setQuery]=React.useState('');
  const [shareItem,setShareItem]=React.useState(null);
  const [menuId,setMenuId]=React.useState(null);
  const [menuPosition,setMenuPosition]=React.useState({left:8,top:8});
  const [inline,setInline]=React.useState(null);
  const [draft,setDraft]=React.useState('');
  const passphrase=React.useRef(null);
  const [testUrl,setTestUrl]=React.useState('');
  const [testResult,setTestResult]=React.useState(null);
  const trigger=React.useRef(null);
  const popup=React.useRef(null);
  const list=React.useRef(null);
  const scroll=React.useRef(0);
  const returning=React.useRef(false);
  React.useLayoutEffect(()=>{
    if(route==='list'&&list.current)list.current.scrollTop=scroll.current;
    if(route==='list'&&returning.current){
      returning.current=false;
      list.current?.querySelector('[aria-label="管理自动切换"]')
        ?.focus({preventScroll:true});
    }
  },[route]);
  React.useEffect(()=>{
    if(menuId===null)return;
    const outside=event=>{
      if(!trigger.current?.contains(event.target)&&
        !popup.current?.contains(event.target))setMenuId(null);
    };
    const escape=event=>{
      if(event.key==='Escape'){
        event.stopPropagation();setMenuId(null);
        trigger.current?.focus({preventScroll:true});
      }
    };
    document.addEventListener('pointerdown',outside,true);
    document.addEventListener('focusin',outside,true);
    document.addEventListener('keydown',escape,true);
    const closeOnScroll=()=>setMenuId(null);
    window.addEventListener('scroll',closeOnScroll,true);
    window.addEventListener('resize',closeOnScroll);
    return ()=>{
      document.removeEventListener('pointerdown',outside,true);
      document.removeEventListener('focusin',outside,true);
      document.removeEventListener('keydown',escape,true);
      window.removeEventListener('scroll',closeOnScroll,true);
      window.removeEventListener('resize',closeOnScroll);
    };
  },[menuId]);
  const commitPassword=()=>{
    const input=passphrase.current;
    if(!input||typeof onUnlock!=='function'||busy)return;
    const password=input.value;input.value='';
    if(password.length>=12)onUnlock(password);
  };
  const startInline=(kind,item=null)=>{
    setMenuId(null);
    setInline({kind,item});
    setDraft(kind==='rename'?item.displayName:'');
  };
  const commitInline=()=>{
    if(!inline||busy)return;
    if(inline.kind==='create'&&draft.trim())onCreate?.(draft.trim());
    if(inline.kind==='rename'&&draft.trim())
      onRename?.(inline.item,draft.trim());
    if(inline.kind==='delete')onDelete?.(inline.item);
    setInline(null);setDraft('');
  };
  const positionMenu=button=>{
    const rect=button.getBoundingClientRect();
    const width=Math.min(190,Math.max(160,window.innerWidth-16));
    const left=Math.max(8,Math.min(window.innerWidth-width-8,rect.right-width));
    const estimatedHeight=204;
    const top=rect.bottom+4+estimatedHeight>window.innerHeight-8
      ?Math.max(8,rect.top-estimatedHeight-4):rect.bottom+4;
    setMenuPosition({left,top});
  };
  const onMenuKeyDown=event=>{
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();
    const candidates=[...(popup.current?.querySelectorAll('[role="menuitem"]:not(:disabled)')||[])];
    if(!candidates.length)return;
    const at=candidates.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?candidates.length-1:
      (at+(event.key==='ArrowDown'?1:-1)+candidates.length)%candidates.length;
    candidates[next].focus({preventScroll:true});
  };
  const openSettings=()=>{
    scroll.current=list.current?.scrollTop||0;
    setMenuId(null);setTestResult(null);onRoute('auto');
  };
  const closeSettings=()=>{returning.current=true;onRoute('list');};
  const allowlist=accounts.filter(item=>item.allowAuto===true).map(item=>item.alias);
  const linkFor=item=>{
    if(!autoRuntimeReady||!autoEnabled||!item.allowAuto)return null;
    try{
      return createAccountSwitchUrl(item.siteUrl||origin+'/',item.alias,{
        expectedOrigin:origin,approvedFragment:true
      });
    }catch{return null;}
  };
  const verify=()=>{
    const check=inspectAccountSwitchUrl(testUrl,{
      expectedOrigin:origin,enabled:autoEnabled&&autoRuntimeReady,
      approvedFragment:autoRuntimeReady,allowedAliases:allowlist
    });
    // The initial audited runtime only acts on canonical root links.
    // Do not label deeper SPA routes eligible before an adapter is reviewed.
    let path='/';
    try{path=new URL(testUrl).pathname;}catch{}
    setTestResult(check.status==='eligible'&&path!=='/'
      ?{status:'blocked',code:'E_SITE_ADAPTER_REQUIRED'}:check);
  };
  const actions=item=>[
    ['重命名',()=>startInline('rename',item),Boolean(onRename)],
    ['更新当前 Cookie 快照',()=>onUpdate?.(item),Boolean(onUpdate)],
    ['生成切换链接',()=>onCopyLink?.(item,linkFor(item)),
      Boolean(onCopyLink)&&Boolean(linkFor(item))],
    ['分享配置',()=>setShareItem(item),true],
    ['删除',()=>startInline('delete',item),Boolean(onDelete)]
  ].map(([label,action,available])=><button key={label} type="button"
    className="od-button od-button--quiet" role="menuitem" disabled={busy||!vaultReady||!available}
    onClick={()=>{
      setMenuId(null);
      trigger.current?.focus({preventScroll:true});
      action();
    }}>{label}</button>);
  if(shareItem)return <CookieAccountShare account={shareItem} previewOnly={previewOnly}
    onBack={()=>setShareItem(null)}/>;
  if(route==='auto')return <section className="cookie-account-page od-surface"
    aria-label="管理自动切换">
    <header className="cookie-account-header">
      <CookieIconButton name="undo" label="返回账号" onClick={closeSettings}/>
      <h2>管理自动切换</h2>
    </header>
    <div className="cookie-account-content">
      {feedback&&<p role={feedback.kind==='error'?'alert':'status'}
        className={'cookie-account-feedback'+(feedback.kind==='error'?' is-error':'')}>
        {feedback.text}
      </p>}
      <label className="cookie-account-setting">
        <span><strong>允许 URL 自动切换</strong>
          <small>仅对白名单内的本站账号生效</small></span>
        <input type="checkbox" role="switch" checked={autoEnabled}
          disabled={busy||!vaultReady||!autoRuntimeReady||typeof onToggleAuto!=='function'}
          onChange={event=>onToggleAuto?.(event.target.checked)}/>
      </label>
      {!autoRuntimeReady&&<p className="cookie-account-notice" role="status">
        尚未接入页面关闭后仍可工作的可信自动切换后台，当前无法开启。
      </p>}
      <h3>允许自动切换的账号</h3>
      {accounts.length?accounts.map(item=><label key={item.alias}
        className="cookie-account-setting">
        <span>{item.displayName}<small>{item.alias}</small></span>
        <input type="checkbox" role="switch" checked={item.allowAuto===true}
          disabled={busy||!vaultReady||!autoRuntimeReady||typeof onAllowAlias!=='function'}
          onChange={event=>onAllowAlias?.(item,event.target.checked)}/>
      </label>):<p className="cookie-account-empty">暂无已保存的账号快照。</p>}
      <h3>账号切换链接</h3>
      {accounts.some(item=>linkFor(item))?
        accounts.filter(item=>linkFor(item)).map(item=><div key={item.alias}
          className="cookie-account-link">
          <strong>{item.displayName}</strong>
          <code>{linkFor(item)}</code>
          <button type="button" className="od-button od-button--secondary"
            disabled={busy||typeof onCopyLink!=='function'}
            onClick={()=>onCopyLink?.(item,linkFor(item))}>复制链接</button>
        </div>):<p className="cookie-account-empty">
          网站兼容性及白名单验证完成后，才能生成可执行切换链接。
        </p>}
      <h3>验证规则</h3>
      <p className="cookie-account-empty">当前仅支持本站根路径上的固定 Fragment 协议；不会修改原有 Query 或 SPA 路由。</p>
      <div className="cookie-account-verify">
        <input type="url" className="od-field" aria-label="待验证的账号切换链接"
          placeholder="粘贴链接" value={testUrl}
          onChange={event=>{setTestUrl(event.target.value);setTestResult(null);}}/>
        <button type="button" className="od-button od-button--secondary"
          disabled={!testUrl.trim()} onClick={verify}>验证</button>
      </div>
      {testResult&&<p className="cookie-account-feedback" role="status">
        {testResult.status==='eligible'
          ?'规则匹配；仅验证，不执行 Cookie 切换。'
          :testResult.status==='none'
            ?'没有识别到自动切换请求。'
            :ruleHelp[testResult.code]||'验证未通过。'}
      </p>}
    </div>
  </section>;
  const filtered=accounts.filter(item=>
    String(item.displayName||'').toLowerCase().includes(query.toLowerCase()));
  return <section className="cookie-account-page od-surface" aria-label="账号"
    id="cookie-product-panel-accounts" role="tabpanel"
    aria-labelledby="cookie-product-tab-accounts" ref={list}>
    <header className="cookie-account-header">
      <strong>账号 <span className="cookie-account-count">{accounts.length}</span></strong>
      <div className="cookie-account-actions">
        <CookieIconButton name="settings" label="管理自动切换"
          onClick={openSettings}/>
        {vaultReady&&<CookieIconButton name="lock" label="锁定账号仓库"
          disabled={busy||typeof onLock!=='function'} onClick={()=>onLock?.()}/>}
        <button type="button" className="od-button od-button--primary"
          disabled={busy||!vaultReady||typeof onCreate!=='function'}
          onClick={()=>startInline('create')}>保存当前账号</button>
      </div>
    </header>
    <div className="cookie-account-content">
      {vaultReady&&accounts.length>0&&<div className="cookie-account-current" aria-label="当前账号状态">
        <span className="cookie-account-avatar" aria-hidden="true">{String(accounts.find(item=>item.alias===currentAlias)?.displayName||'?').slice(0,1)}</span>
        <div><small>{currentAlias?'当前已应用的快照（非登录验证）':'当前账号状态'}</small><strong>{accounts.find(item=>item.alias===currentAlias)?.displayName||'尚未验证'}</strong>
          <small>{currentAlias&&accounts.some(item=>item.alias===currentAlias)?'最近一次可信切换结果 · 非网页登录验证':'无法根据 Cookie 快照推断网站登录身份'}</small></div>
      </div>}
      <label className="cookie-account-setting">
        <span><strong>切换后自动刷新网页</strong>
          <small>默认开启，确认写入及回读成功后才刷新</small></span>
        <input type="checkbox" role="switch" checked={autoRefresh}
          disabled={busy||!switchReady||typeof onToggleRefresh!=='function'}
          onChange={event=>onToggleRefresh?.(event.target.checked)}/>
      </label>
      {!vaultReady&&<div className="cookie-account-unlock">
        <label htmlFor="cookie-account-passphrase">
          <strong>{configured?'解锁本机账号仓库':'首次设置账号仓库口令'}</strong>
          <small>至少 12 个字符；仅用于本机加密，不保存到网页或账号列表。请妥善保管，丢失后无法解密原快照。</small>
        </label>
        <div className="cookie-account-inline-controls">
          <input id="cookie-account-passphrase" className="od-field"
            type="password" ref={passphrase} autoComplete="new-password"
            aria-label="账号仓库口令" disabled={busy}
            onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();commitPassword();}}}/>
          <button className="od-button od-button--primary" type="button"
            disabled={busy||typeof onUnlock!=='function'}
            onClick={commitPassword}>{configured?'解锁':'设置并解锁'}</button>
        </div>
      </div>}
      {feedback&&<p role={feedback.kind==='error'?'alert':'status'}
        className={'cookie-account-feedback'+(feedback.kind==='error'?' is-error':'')}>
        {feedback.text}
      </p>}
      {inline&&vaultReady&&<div className="cookie-account-inline" aria-label="账号操作">
        <strong>{inline.kind==='create'?'保存当前账号':
          inline.kind==='rename'?'重命名账号':'确认删除账号快照'}</strong>
        {inline.kind!=='delete'?<input type="text" className="od-field"
          aria-label="账号名称" value={draft} maxLength={64}
          autoFocus onChange={event=>setDraft(event.target.value)}
          onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();commitInline();}
            if(event.key==='Escape'){setInline(null);setDraft('');}}}/>:
          <p>删除「{inline.item.displayName}」的本机快照，不会删除网站中的 Cookie。</p>}
        <div className="cookie-account-inline-controls">
          <button className="od-button od-button--secondary" type="button"
            disabled={busy} onClick={()=>{setInline(null);setDraft('');}}>取消</button>
          <button className="od-button od-button--primary" type="button"
            disabled={busy||inline.kind!=='delete'&&!draft.trim()}
            onClick={commitInline}>{inline.kind==='delete'?'删除快照':'保存'}</button>
        </div>
      </div>}
      {!vaultReady&&<p className="cookie-account-notice" role="status">
        加密仓库保持锁定。解锁前不会读取、保存或切换任何登录 Cookie。
      </p>}
      {accounts.length>0&&<input className="od-field cookie-account-search"
        type="search" placeholder="搜索账号" aria-label="搜索账号"
        value={query} onChange={event=>setQuery(event.target.value)}/>}
      {filtered.length>0&&<div className="cookie-account-list" aria-label="已保存账号">
      {filtered.map(item=><article key={item.alias} className={'cookie-account-card'+(item.alias===currentAlias?' is-current':'')}>
        <span className="cookie-account-avatar" aria-hidden="true">
          {String(item.displayName||'?').slice(0,1)}
        </span>
        <div className="cookie-account-card-text">
          <strong>{item.displayName}</strong><small>{item.siteLabel||origin}</small>
        </div>
        {item.alias===currentAlias
          ?<span className="cookie-account-applied"
            title="最近一次可信切换确认；不代表网站已经登录">● 已应用</span>
          :<button type="button" className="od-button od-button--secondary"
            disabled={busy||!switchReady||typeof onSwitch!=='function'}
            onClick={()=>onSwitch?.(item)}>切换</button>}
        <div className="cookie-account-menu-anchor">
          <button type="button" className="od-icon-button"
            disabled={busy||!vaultReady}
            aria-label={'更多操作：'+item.displayName} aria-haspopup="menu"
            aria-expanded={menuId===item.alias}
            onKeyDown={event=>{
              if(event.key==='ArrowDown'&&menuId===item.alias){
                event.preventDefault();
                popup.current?.querySelector('[role="menuitem"]:not(:disabled)')
                  ?.focus({preventScroll:true});
              }
            }}
            onClick={event=>{
              const opening=menuId!==item.alias;
              if(opening){
                trigger.current=event.currentTarget;
                positionMenu(event.currentTarget);
              }
              setMenuId(opening?item.alias:null);
            }}><CookieIcon name="more"/></button>
          {menuId===item.alias&&<div ref={popup} role="menu"
            className="cookie-account-menu" style={menuPosition}
            aria-label={'账号操作：'+item.displayName}
            onKeyDown={onMenuKeyDown}>
            {actions(item)}
          </div>}
        </div>
      </article>)}
      </div>}
      {!filtered.length&&<p className="cookie-account-empty">
        {accounts.length?'没有匹配的账号。':
          '尚无账号快照。解锁后可保存当前网站的 Cookie 账号。'}
      </p>}
      <p className="cookie-account-security-note">
        账号快照保存在本机加密仓库；分享配置与切换链接不包含 Cookie 或 Session Token。
      </p>
      <CookieMembershipRecommendations origin={origin}/>
    </div>
  </section>;
}

