import * as React from 'react';
import {CookieIconButton} from './CookieEditorView.jsx';
import {createAccountSwitchUrl,inspectAccountSwitchUrl} from '../domain/account-switch-url.js';

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
  origin='',accounts=[],route='list',onRoute=()=>{},
  vaultReady=false,switchReady=false,autoRuntimeReady=false,
  autoEnabled=false,autoRefresh=true,
  onCreate,onSwitch,onRename,onUpdate,onDelete,onShare,
  onToggleAuto,onToggleRefresh,onAllowAlias,onCopyLink
}){
  const [query,setQuery]=React.useState('');
  const [menuId,setMenuId]=React.useState(null);
  const [menuUp,setMenuUp]=React.useState(false);
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
    return ()=>{
      document.removeEventListener('pointerdown',outside,true);
      document.removeEventListener('focusin',outside,true);
      document.removeEventListener('keydown',escape,true);
    };
  },[menuId]);
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
  const verify=()=>setTestResult(inspectAccountSwitchUrl(testUrl,{
    expectedOrigin:origin,enabled:autoEnabled&&autoRuntimeReady,
    approvedFragment:autoRuntimeReady,allowedAliases:allowlist
  }));
  const actions=item=>[
    ['重命名',onRename],['更新当前 Cookie 快照',onUpdate],
    ['生成切换链接',onCopyLink],['分享',onShare],['删除',onDelete]
  ].map(([label,action])=><button key={label} type="button" role="menuitem"
    disabled={!vaultReady||typeof action!=='function'||
      (label==='生成切换链接'&&!linkFor(item))}
    onClick={()=>{
      setMenuId(null);
      if(label==='生成切换链接')action(item,linkFor(item));
      else action(item);
    }}>{label}</button>);
  if(route==='auto')return <section className="cookie-account-page od-surface"
    aria-label="管理自动切换">
    <header className="cookie-account-header">
      <CookieIconButton name="undo" label="返回账号" onClick={closeSettings}/>
      <h2>管理自动切换</h2>
    </header>
    <div className="cookie-account-content">
      <label className="cookie-account-setting">
        <span><strong>允许 URL 自动切换</strong>
          <small>仅对白名单内的本站账号生效</small></span>
        <input type="checkbox" role="switch" checked={autoEnabled}
          disabled={!autoRuntimeReady||typeof onToggleAuto!=='function'}
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
          disabled={!vaultReady||!autoRuntimeReady||typeof onAllowAlias!=='function'}
          onChange={event=>onAllowAlias?.(item,event.target.checked)}/>
      </label>):<p className="cookie-account-empty">暂无已保存的账号快照。</p>}
      <h3>账号切换链接</h3>
      {accounts.some(item=>linkFor(item))?
        accounts.filter(item=>linkFor(item)).map(item=><div key={item.alias}
          className="cookie-account-link">
          <strong>{item.displayName}</strong>
          <code>{linkFor(item)}</code>
          <button type="button" className="od-button od-button--secondary"
            disabled={typeof onCopyLink!=='function'}
            onClick={()=>onCopyLink?.(item,linkFor(item))}>复制链接</button>
        </div>):<p className="cookie-account-empty">
          网站兼容性及白名单验证完成后，才能生成可执行切换链接。
        </p>}
      <h3>验证规则</h3>
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
    ref={list}>
    <header className="cookie-account-header">
      <strong>账号 <span className="cookie-account-count">{accounts.length}</span></strong>
      <div className="cookie-account-actions">
        <CookieIconButton name="settings" label="管理自动切换"
          onClick={openSettings}/>
        <button type="button" className="od-button od-button--primary"
          disabled={!vaultReady||typeof onCreate!=='function'}
          onClick={()=>onCreate?.()}>保存当前账号</button>
      </div>
    </header>
    <div className="cookie-account-content">
      <label className="cookie-account-setting">
        <span><strong>切换后自动刷新网页</strong>
          <small>默认开启，确认写入及回读成功后才刷新</small></span>
        <input type="checkbox" role="switch" checked={autoRefresh}
          disabled={!switchReady||typeof onToggleRefresh!=='function'}
          onChange={event=>onToggleRefresh?.(event.target.checked)}/>
      </label>
      {!vaultReady&&<p className="cookie-account-notice" role="status">
        受保护的账号快照仓库尚未接入，不能保存或切换登录 Cookie。
        不会使用普通 localStorage 存放敏感信息。
      </p>}
      {accounts.length>0&&<input className="od-field cookie-account-search"
        type="search" placeholder="搜索账号" aria-label="搜索账号"
        value={query} onChange={event=>setQuery(event.target.value)}/>}
      {filtered.map(item=><article key={item.alias} className="cookie-account-card">
        <span className="cookie-account-avatar" aria-hidden="true">
          {String(item.displayName||'?').slice(0,1)}
        </span>
        <div className="cookie-account-card-text">
          <strong>{item.displayName}</strong><small>{item.siteLabel||origin}</small>
        </div>
        <button type="button" className="od-button od-button--secondary"
          disabled={!switchReady||typeof onSwitch!=='function'}
          onClick={()=>onSwitch?.(item)}>切换</button>
        <div className="cookie-account-menu-anchor">
          <button type="button" className="od-icon-button"
            aria-label={'更多操作：'+item.displayName} aria-haspopup="menu"
            aria-expanded={menuId===item.alias}
            onClick={event=>{
              const opening=menuId!==item.alias;
              if(opening){
                trigger.current=event.currentTarget;
                setMenuUp(event.currentTarget.getBoundingClientRect().bottom>
                  window.innerHeight-230);
              }
              setMenuId(opening?item.alias:null);
            }}>···</button>
          {menuId===item.alias&&<div ref={popup} role="menu"
            className={'cookie-account-menu'+(menuUp?' is-up':'')}>
            {actions(item)}
          </div>}
        </div>
      </article>)}
      {!filtered.length&&<p className="cookie-account-empty">
        {accounts.length?'没有匹配的账号。':
          '尚无账号快照。可信存储接入后，可从当前网站保存账号。'}
      </p>}
    </div>
  </section>;
}

export function CookieAccountMarket(){
  return <section className="cookie-account-page od-surface" aria-label="市场">
    <header className="cookie-account-header"><strong>市场</strong>
      <span className="cookie-market-status">尚未上线</span></header>
    <div className="cookie-account-content">
      <p className="cookie-account-notice">
        尚未接入可信身份、服务端授权和交易服务；目前没有可领取、购买或租用的资源。
      </p>
      <div className="cookie-market-outline">
        <strong>后续方向</strong>
        <span>团队席位 · 可撤销授权 · 邀请领取 · 到期管理</span>
      </div>
    </div>
  </section>;
}
