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
  accountReady=false,legacyLocked=false,switchReady=false,autoRuntimeReady=false,
  busy=false,feedback=null,previewOnly=false,resumeRevision=0,
  autoEnabled=false,autoRefresh=true,cookieDetails=[],
  onCreate,onSwitch,onRename,onUpdate,onDelete,onShare,onDirty,onDiscardRequest,
  onToggleAuto,onToggleRefresh,onAllowAlias,onCopyLink
}){
  const [query,setQuery]=React.useState('');
  const [shareItem,setShareItem]=React.useState(null);
  const [menuId,setMenuId]=React.useState(null);
  const [menuPosition,setMenuPosition]=React.useState({left:8,top:8});
  const [inline,setInline]=React.useState(null);
  const [draft,setDraft]=React.useState('');
  const [formAttempted,setFormAttempted]=React.useState(false);
  const [localError,setLocalError]=React.useState('');
  const [justSavedAlias,setJustSavedAlias]=React.useState(null);
  const savingRef=React.useRef(false);
  const [testUrl,setTestUrl]=React.useState('');
  const [testResult,setTestResult]=React.useState(null);
  const trigger=React.useRef(null);
  const popup=React.useRef(null);
  const list=React.useRef(null);
  const scroll=React.useRef(0);
  const returning=React.useRef(false);
  const formReturn=React.useRef(null);
  const draftFocusReturn=React.useRef(false);
  const resumedRevision=React.useRef(resumeRevision);
  const draftInput=React.useRef(null);
  const autoHeading=React.useRef(null);
  const draftDirty=Boolean(inline&&inline.kind!=='delete'&&
    draft!==(inline.initialName||''));
  React.useEffect(()=>{onDirty?.(draftDirty);},[draftDirty,onDirty]);
  React.useEffect(()=>()=>onDirty?.(false),[onDirty]);
  React.useEffect(()=>{
    if(!justSavedAlias)return;
    const timer=window.setTimeout(()=>setJustSavedAlias(null),4500);
    return ()=>window.clearTimeout(timer);
  },[justSavedAlias]);
  React.useLayoutEffect(()=>{
    if(route==='auto')autoHeading.current?.focus({preventScroll:true});
  },[route]);
  React.useLayoutEffect(()=>{
    if(!busy&&(draftFocusReturn.current||resumedRevision.current!==resumeRevision)){
      draftInput.current?.focus({preventScroll:true});draftFocusReturn.current=false;
      resumedRevision.current=resumeRevision;
    }
    if(route==='list'&&list.current)list.current.scrollTop=scroll.current;
    if(route==='list'&&returning.current){
      returning.current=false;
      list.current?.querySelector('[aria-label="管理自动切换规则"]')
        ?.focus({preventScroll:true});
    }
    if(!busy&&!inline&&formReturn.current){
      const alias=formReturn.current.alias;
      const control=alias
        ?list.current?.querySelector('[data-account-alias="'+CSS.escape(alias)+'"] [aria-haspopup="menu"]')
        :list.current?.querySelector('[aria-label="保存当前 Cookie 为账号"]');
      control?.focus({preventScroll:true});formReturn.current=null;
    }
  },[route,inline,busy,resumeRevision]);
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
  const startInline=(kind,item=null)=>{
    setMenuId(null);
    setFormAttempted(false);setLocalError('');
    let initialName=kind==='rename'?item.displayName:'';
    if(kind==='create'){
      const used=new Set(accounts.map(account=>account.displayName));
      let n=1;
      while(used.has('新账号 '+n))n++;
      initialName='新账号 '+n;
    }
    setInline({kind,item,initialName});
    setDraft(initialName);
  };
  const closeInline=(savedAlias=null)=>{
    formReturn.current={alias:savedAlias||inline?.item?.alias};
    if(savedAlias)setJustSavedAlias(savedAlias);
    setInline(null);setDraft('');setLocalError('');onDirty?.(false);
  };
  const cancelInline=()=>{
    if(busy)return;
    if(draftDirty&&onDiscardRequest){
      onDiscardRequest(closeInline,()=>{draftFocusReturn.current=true;});
    }else closeInline();
  };
  const commitInline=async()=>{
    if(!inline||busy||savingRef.current)return;
    setFormAttempted(true);setLocalError('');
    const name=draft.trim();
    if(inline.kind!=='delete'){
      if(!name){setLocalError('请输入账号名称。');draftInput.current?.focus();return;}
      if(accounts.some(account=>account.displayName===name&&
        account.alias!==inline.item?.alias)){
        setLocalError('账号名称已存在，请换一个名称。');
        draftInput.current?.focus();return;
      }
    }
    savingRef.current=true;
    try{
      let result;
      if(inline.kind==='create')result=onCreate?.(name);
      if(inline.kind==='rename'&&name!==inline.item.displayName)
        result=onRename?.(inline.item,name);
      if(inline.kind==='delete')result=onDelete?.(inline.item);
      const receipt=await result;
      if(receipt===true||receipt?.ok===true)closeInline(receipt?.alias||null);
      else if(receipt===undefined)setLocalError('账号服务未响应，未保存。');
      // false is accompanied by the Host/Controller's explicit error feedback.
    }catch{
      setLocalError('账号操作失败，请核对账号状态；未确认成功。');
    }finally{savingRef.current=false;}
  };
  const positionMenu=button=>{
    const rect=button.getBoundingClientRect();
    const width=Math.min(176,window.innerWidth-16);
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
  const avatarClass=item=> 'cookie-account-avatar cookie-account-avatar--'+
    (item?['violet','coral','mint','grey'][accounts.indexOf(item)%4]:'grey');
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
    ['重命名','edit',()=>startInline('rename',item),Boolean(onRename)],
    ['更新快照','refresh',()=>onUpdate?.(item),
      Boolean(onUpdate)&&switchReady&&item.alias===currentAlias],
    ['生成切换链接','link',()=>onCopyLink?.(item,linkFor(item)),
      Boolean(onCopyLink)&&Boolean(linkFor(item))],
    ['分享账号配置','share',()=>setShareItem(item),true],
    ['删除快照','trash',()=>startInline('delete',item),Boolean(onDelete)]
  ].map(([label,icon,action,available])=><React.Fragment key={label}>
    {icon==='trash'&&<div className="cookie-account-menu-separator" role="separator"/>}
    <button type="button"
    className={'od-button od-button--quiet cookie-button--compact'+(icon==='trash'?' cookie-account-menu-delete':'')}
    role="menuitem" disabled={busy||!accountReady||!available}
    onClick={()=>{
      setMenuId(null);
      trigger.current?.focus({preventScroll:true});
      action();
    }}><CookieIcon name={icon}/><span>{label}</span></button>
    </React.Fragment>);
  const currentItem=accounts.find(item=>item.alias===currentAlias);
  if(shareItem)return <CookieAccountShare account={shareItem} previewOnly={previewOnly}
    onBack={()=>setShareItem(null)}/>;
  if(route==='auto')return <section className="cookie-account-page od-surface"
    aria-label="管理自动切换">
    <header className="cookie-account-header">
      <CookieIconButton name="undo" label="返回账号" onClick={closeSettings}/>
      <h2 ref={autoHeading} tabIndex={-1}>管理自动切换</h2>
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
          disabled={busy||!accountReady||!autoRuntimeReady||typeof onToggleAuto!=='function'}
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
          disabled={busy||!accountReady||!autoRuntimeReady||typeof onAllowAlias!=='function'}
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
  if(inline&&accountReady)return <section className="cookie-account-page od-surface"
    id="cookie-product-panel-accounts" role="tabpanel"
    aria-labelledby="cookie-product-tab-accounts" ref={list}>
    <div className="cookie-account-content cookie-account-form-page">
      <header className="cookie-account-header cookie-account-form-header">
        <CookieIconButton name="undo" label="返回账号" appearance="quiet"
          disabled={busy} onClick={cancelInline}/>
        <h2>{inline.kind==='create'?'添加账号':
          inline.kind==='rename'?'重命名账号':'删除账号快照'}</h2>
        {inline.kind!=='delete'&&<CookieIconButton name="save" label="保存账号"
          appearance="quiet" disabled={busy||!draft.trim()||
            inline.kind==='rename'&&draft.trim()===inline.item.displayName}
          onClick={()=>void commitInline()}/>}
      </header>
      <div className="cookie-account-inline" role="group" aria-label="账号操作"
        aria-busy={busy} onKeyDown={event=>{
          if(event.key==='Enter'&&event.target===draftInput.current){
            event.preventDefault();void commitInline();
          }
          if(event.key==='Escape'&&!busy){
            event.preventDefault();event.stopPropagation();cancelInline();
          }
        }}>
        {inline.kind!=='delete'?<label className="cookie-account-name-field">账号名称
          <input type="text" className="od-field" aria-label="账号名称"
            value={draft} maxLength={inline.kind==='create'?28:64}
            ref={draftInput} autoComplete="off" disabled={busy}
            placeholder="例如：工作账号"
            onChange={event=>{setDraft(event.target.value);setLocalError('');}}/>
        </label>:<p>删除「{inline.item.displayName}」的本机快照，不会删除网站中的 Cookie。</p>}
        {inline.kind==='create'&&<div className="cookie-account-scope">
          <strong>默认关联当前授权网站的全部可用 Cookie</strong>
          <small>可信 Host 会在保存时重新读取并核对站点、Store、Partition 和权限。</small>
          <details>
            <summary>Cookie 明细（只读 · 当前页面 {cookieDetails.length} 条）</summary>
            <ul>
              {cookieDetails.map((row,index)=><li key={row.id||index}>
                <strong>{row.name}</strong>
                <small>{row.domain}{row.path} · Store {row.storeId}
                  {row.partition?' · '+row.partition:''}</small>
              </li>)}
              {!cookieDetails.length&&<li>尚无可显示的 Cookie 元数据。</li>}
            </ul>
          </details>
        </div>}
        {inline.kind==='rename'&&<p>只修改显示名称，不改变 Cookie 或网址别名。</p>}
        {localError&&<p role="alert" className="cookie-account-feedback is-error">{localError}</p>}
        {formAttempted&&feedback&&<p role={feedback.kind==='error'?'alert':'status'}
          className={'cookie-account-feedback'+(feedback.kind==='error'?' is-error':'')}>{feedback.text}</p>}
        {inline.kind==='delete'&&<div className="cookie-account-inline-controls cookie-account-form-actions">
          <button className="od-button od-button--quiet cookie-button--compact" type="button"
            disabled={busy} onClick={cancelInline}>取消</button>
          <button className="od-button od-button--danger cookie-button--compact"
            type="button" onClick={()=>void commitInline()} disabled={busy}>删除快照</button>
        </div>}
      </div>
    </div>
  </section>;
  const filtered=accounts.filter(item=>
    String(item.displayName||'').toLowerCase().includes(query.toLowerCase()));
  return <section className="cookie-account-page od-surface" aria-label="账号"
    id="cookie-product-panel-accounts" role="tabpanel"
    aria-labelledby="cookie-product-tab-accounts" ref={list}>
    <div className="cookie-account-content">
      <div className="cookie-account-current" aria-label="当前账号状态">
        <span className={avatarClass(currentItem)} aria-hidden="true">
          {String(currentItem?.displayName||'?').slice(0,1)}</span>
        <div><small>{currentItem?'当前已应用的快照（非登录验证）':'当前账号状态'}</small>
          <strong>{currentItem?.displayName||
            (!accountReady?'正在读取账号':accounts.length?'待核对':'尚未保存账号')}</strong></div>
        {currentItem
          ?<CookieIconButton name="refresh" appearance="quiet"
            label={'更新'+currentItem.displayName+'的 Cookie 快照'}
            disabled={busy||!switchReady||typeof onUpdate!=='function'}
            onClick={()=>onUpdate?.(currentItem)}/>
          :<span className="cookie-account-current-status" title="无已验证账号切换收据">
            {!accountReady?'读取中':'待核对'}</span>}
      </div>
      <label className="cookie-account-setting">
        <span><strong>切换后自动刷新网页</strong>
          <small title="仅目标标签页 · 回读确认后刷新；未保存的网页内容可能丢失">仅目标标签页 · 未保存的网页内容可能丢失</small></span>
        <input type="checkbox" role="switch" checked={autoRefresh}
          aria-label="切换后自动刷新网页"
          disabled={busy||!switchReady||typeof onToggleRefresh!=='function'}
          onChange={event=>onToggleRefresh?.(event.target.checked)}/>
      </label>
      {legacyLocked&&<p className="cookie-account-empty" role="status">
        旧版加密快照已保留，当前无法读取，未迁移；可重新保存当前网站账号。
      </p>}
      {feedback&&<p role={feedback.kind==='error'?'alert':'status'}
        className={'cookie-account-feedback'+(feedback.kind==='error'?' is-error':'')}>
        {feedback.text}
      </p>}
      <header className="cookie-account-header" aria-label="已保存账号操作">
        <strong>已保存账号 <span className="cookie-account-count">{accountReady?accounts.length:'—'}</span></strong>
        <div className="cookie-account-actions">
          <CookieIconButton name="settings" label="管理自动切换规则" appearance="quiet"
            onClick={openSettings}/>
          <CookieIconButton name="plus" label="保存当前 Cookie 为账号" appearance="quiet"
            disabled={busy||!accountReady||typeof onCreate!=='function'}
            onClick={()=>startInline('create')}/>
        </div>
      </header>
      {(accounts.length>3||query.length>0)&&<input className="od-field cookie-account-search"
        type="search" placeholder="搜索账号" aria-label="搜索账号"
        value={query} onChange={event=>setQuery(event.target.value)}/>}
      {filtered.length>0&&<div className="cookie-account-list" aria-label="已保存账号">
      {filtered.map(item=><article key={item.alias} data-account-alias={item.alias} className={'cookie-account-card'+(item.alias===currentAlias?' is-current':'')+
          (item.alias===justSavedAlias?' is-just-saved':'')}>
        <span className={avatarClass(item)} aria-hidden="true">
          {String(item.displayName||'?').slice(0,1)}
        </span>
        <div className="cookie-account-card-text">
          <strong>{item.displayName}</strong>
          <small>{Number.isSafeInteger(item.cookieCount)?item.cookieCount+' 条 Cookie · ':''}本机快照</small>
        </div>
        {item.alias===currentAlias
          ?<span className="cookie-account-applied"
            title="最近一次可信切换确认；不代表网站已经登录">● 已应用</span>
          :<button type="button" className="od-button od-button--secondary cookie-button--compact cookie-button--row-action"
            disabled={busy||!switchReady||typeof onSwitch!=='function'}
            onClick={()=>onSwitch?.(item)}>切换</button>}
        <div className="cookie-account-menu-anchor">
          <button type="button" className="od-icon-button od-icon-button--quiet"
            disabled={busy||!accountReady}
            title={item.displayName+'更多操作'}
            aria-label={item.displayName+'更多操作'} aria-haspopup="menu"
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
          !accountReady?'正在读取账号。':'此网站尚未保存账号。'}
      </p>}
      {accounts.length===0&&!query&&<section className="cookie-account-examples"
        aria-label="账号布局示例">
        <div className="cookie-account-example-heading"><strong>账号示例</strong><small>仅展示布局 · 非真实账号</small></div>
        <div className="cookie-account-list">
          {['工作账号','个人账号','备用账号'].map((name,index)=><article
            className="cookie-account-card" key={name}>
            <span className={'cookie-account-avatar cookie-account-avatar--'+['violet','coral','mint'][index]} aria-hidden="true">{name.slice(0,1)}</span>
            <div className="cookie-account-card-text"><strong>{name}</strong><small>示例占位 · 尚未保存快照</small></div>
            <button type="button" className="od-button od-button--secondary cookie-button--compact cookie-button--row-action"
              disabled aria-label={'切换'+name+'（示例不可用）'}>切换</button>
            <CookieIconButton name="more" label={name+'更多操作（示例不可用）'} appearance="quiet" disabled/>
          </article>)}
        </div>
      </section>}
      <CookieMembershipRecommendations origin={origin}/>
      <p className="cookie-account-security-note">
        每个网站独立管理账号。快照仅保存在本机，可能包含登录凭据；分享配置与切换链接不包含 Cookie 或 Session Token。
      </p>
    </div>
  </section>;
}

