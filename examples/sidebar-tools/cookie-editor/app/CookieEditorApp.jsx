import * as React from 'react';
import {Button} from '@opendesk/ui';
import {createCookieSdkAdapter} from './adapters/browser-sdk.js';
import {createCookieController} from './controller/cookie-controller.js';
import {CookieEditorView,CookieIconButton,CookieSiteBar} from './components/CookieEditorView.jsx';
import CookieInlineEditor from './components/CookieInlineEditor.jsx';
import CookieClearDialog from './components/CookieClearDialog.jsx';
import CookieImport from './components/CookieImport.jsx';
import CookieExport from './components/CookieExport.jsx';
import CookiePermissions from './components/CookiePermissions.jsx';
import CookieOfflineWorkspace from './components/CookieOfflineWorkspace.jsx';
import {CookieAccounts} from './components/CookieAccounts.jsx';
import {CookieAccountMarket} from './components/CookieAccountExperiences.jsx';

// The only transport is Controller -> Adapter -> public OpenDeskSDK.browser.
// Host permission, value grant and native receipts are never replaced in React.
export default function CookieEditorApp({request,hostRoot,setState,previewMode=false,initialSection='cookie'}){
  const [view,setView]=React.useState(null);
  const [mode,setMode]=React.useState('browser');
  const [section,setSection]=React.useState(initialSection);
  const [accountRoute,setAccountRoute]=React.useState('list');
  // Only trusted, redacted account metadata may enter React. The encrypted
  // snapshot, Cookie values and vault key never cross the Host boundary.
  const [accountState,setAccountState]=React.useState(null);
  const [accountBusy,setAccountBusy]=React.useState(false);
  const [accountNotice,setAccountNotice]=React.useState(null);
  const accountInFlight=React.useRef(false);
  const [offlineInitialSite,setOfflineInitialSite]=React.useState(null);
  const modeRef=React.useRef('browser');
  const syncGate=React.useRef({panel:null,selected:null,dirty:false,confirmation:null,working:false,exportOpen:false});
  const [panel,updatePanel]=React.useState(null);
  const setPanel=value=>{syncGate.current.panel=value;updatePanel(value);};
  const [exportOpen,updateExportOpen]=React.useState(false);
  const exportPending=React.useRef(false);
  const setExportOpen=value=>{syncGate.current.exportOpen=value;updateExportOpen(value);};
  const [selected,updateSelected]=React.useState(null);
  const setSelected=value=>{syncGate.current.selected=value;updateSelected(value);};
  const [query,setQuery]=React.useState('');
  const [filter,setFilter]=React.useState('all');
  const [sort,setSort]=React.useState('name');
  const [page,setPage]=React.useState(1);
  const [expanded,setExpanded]=React.useState(false);
  const [dirty,updateDirty]=React.useState(false);
  const setDirty=value=>{syncGate.current.dirty=value;updateDirty(value);};
  const dirtyRef=React.useRef(false);
  dirtyRef.current=dirty;
  const [confirmation,updateConfirmation]=React.useState(null);
  const setConfirmation=value=>{syncGate.current.confirmation=value;updateConfirmation(value);};
  const [status,setStatus]=React.useState('');
  const [importNotice,setImportNotice]=React.useState(null);
  const [working,updateWorking]=React.useState(false);
  const setWorking=value=>{syncGate.current.working=value;updateWorking(value);};
  const appliedSite=React.useRef('');
  const data=React.useRef(null);
  if(data.current===null){
    const adapter=createCookieSdkAdapter({
      getBrowser:()=>globalThis.OpenDeskSDK?.browser,
      request
    });
    const controller=createCookieController({adapter,onChange:s=>setView(s)});
    data.current={adapter,controller};
  }
  const {controller,adapter}=data.current;
  const noteImport=(text,kind='error')=>setImportNotice(text?{text,kind}:null);
  const importDirtyRef=React.useRef(false);
  React.useEffect(()=>{
    if(!importNotice||importNotice.kind!=='success')return;
    const timer=window.setTimeout(()=>setImportNotice(null),3500);
    return ()=>window.clearTimeout(timer);
  },[importNotice]);
  const snapshot=view||controller.snapshot();
  const busy=Boolean(snapshot.busy||working);
  const locked=busy||Boolean(confirmation);
  const scrubSensitive=()=>{
    // Invalidate DOM secrets synchronously on permission changes and navigation,
    // even before React commits the render that removes the editor.
    for(const node of hostRoot.querySelectorAll('[data-cookie-secret-input]'))
      node.value='';
    for(const node of hostRoot.querySelectorAll('[data-cookie-secret-output]')){
      node.textContent='';node.hidden=true;
    }
  };
  const cleanEditor=()=>{
    setPanel(null);setExportOpen(false);setSelected(null);setDirty(false);setStatus('');
  };
  const ask=(text,action,onCancel,kind='discard',details={})=>{
    setConfirmation({text,action,onCancel,kind,...details});
  };
  const guarded=(action)=>{
    if(locked)return;
    if(dirty){ask('放弃未保存修改？',()=>{
      setDirty(false);action();});return;}
    action();
  };
  const endConfirm=accept=>{
    const decision=confirmation;
    setConfirmation(null);
    if(accept&&decision?.action)decision.action();
    if(!accept&&decision?.onCancel)decision.onCancel();
  };
  const refresh=()=>{
    if(busy)return;
    cleanEditor();setPage(1);
    void controller.load(appliedSite.current);
  };
  const invalidate=(reason,siteChanged=false)=>{
    // Permission/page events must not silently connect the isolated offline
    // workspace to Chrome or destroy its independent local input.
    if(modeRef.current==='offline'){
      controller.invalidate(reason);
      return;
    }
    scrubSensitive();setExportOpen(false);
    const hadDirty=dirtyRef.current;
    const hadImportDraft=importDirtyRef.current;
    const uncertain=controller.invalidate(reason);
    cleanEditor();setConfirmation(null);setQuery('');setPage(1);
    if(siteChanged)appliedSite.current='';
    if(!uncertain){
      if(hadImportDraft)setStatus('网站或授权已改变，未提交的导入内容已清除；请确认新网站后重新准备。');
      else if(hadDirty)setStatus('网站或授权已改变，未保存的 Cookie 草稿已清除；请重新编辑。');
      void controller.load(appliedSite.current);
    }
  };
  React.useEffect(()=>{
    const grant=()=>invalidate('授权已改变，敏感值和旧列表已清除。');
    const page=()=>invalidate('当前网站已切换，旧数据已清除。',true);
    hostRoot.addEventListener('opendesk-cookie-grants-changed',grant);
    hostRoot.addEventListener('opendesk-page-changed',page);
    void controller.load();
    return ()=>{
      hostRoot.removeEventListener('opendesk-cookie-grants-changed',grant);
      hostRoot.removeEventListener('opendesk-page-changed',page);
      scrubSensitive();
      controller.dispose();
    };
  },[hostRoot,controller]);
  React.useEffect(()=>{setState?.({busy,dirty});},[busy,dirty,setState]);
  // Auto-sync metadata only while the live list is idle and visible. An open
  // editor or import never loses its draft to an external website update.
  const lastAutoCheck=React.useRef(0);
  React.useEffect(()=>{
    if(snapshot.phase==='ready')lastAutoCheck.current=Date.now();
  },[snapshot.epoch,snapshot.phase]);
  React.useEffect(()=>{
    if(mode!=='browser'||snapshot.phase!=='ready'||selected!==null||
      panel!==null||exportOpen||busy||dirty||confirmation)return;
    let active=true;
    const visible=()=>{
      const surface=hostRoot?.host||hostRoot;
      return document.visibilityState!=='hidden'&&surface?.isConnected!==false&&
        (typeof surface?.getClientRects!=='function'||surface.getClientRects().length>0);
    };
    const sync=()=>{
      if(!active||!visible())return;
      const period=controller.snapshot().syncStale?30000:2000;
      const now=Date.now();
      if(now-lastAutoCheck.current<period)return;
      lastAutoCheck.current=now;
      void controller.syncMetadata({canApply:()=>{
        const gate=syncGate.current;
        return active&&modeRef.current==='browser'&&gate.selected===null&&
          gate.panel===null&&!gate.exportOpen&&!gate.dirty&&!gate.confirmation&&!gate.working&&visible();
      }});
    };
    sync();
    const immediate=()=>{if(!visible())return;lastAutoCheck.current=0;sync();};
    const timer=window.setInterval(sync,1000);
    window.addEventListener('focus',immediate);
    document.addEventListener('visibilitychange',immediate);
    return ()=>{
      active=false;window.clearInterval(timer);
      window.removeEventListener('focus',immediate);
      document.removeEventListener('visibilitychange',immediate);
    };
  },[mode,snapshot.phase,snapshot.epoch,selected,panel,exportOpen,busy,dirty,confirmation,controller,hostRoot]);
  React.useEffect(()=>{
    // A live session invalidation must not discard an offline editor's
    // independent dirty state when an unrelated browser event fires.
    if(modeRef.current==='offline')return;
    if(snapshot.phase!=='ready'){
      setSelected(null);setPanel(null);setExportOpen(false);setDirty(false);setConfirmation(null);
    }
  },[snapshot.epoch,snapshot.phase]);
  const target=snapshot.target;

  React.useEffect(()=>{
    if(mode!=='browser'||section!=='accounts'||!target?.origin){
      setAccountState(null);return;
    }
    let active=true;
    setAccountState(null);
    setAccountNotice(null);
    void adapter.accountRequest('status',{}).then(result=>{
      if(active&&result&&typeof result.configured==='boolean'&&
         Array.isArray(result.accounts))setAccountState(result);
      else if(active)throw Error('E_ACCOUNT_HOST');
    }).catch(error=>{
      if(active)setAccountNotice({kind:'error',
        text:'账号服务不可用（'+String(error?.code||'E_ACCOUNT_HOST')+'）。请确认已安装最新正式版。'});
    });
    return ()=>{active=false;};
  },[adapter,mode,section,target?.origin]);
  const accountAction=(action,payload={},success='账号已更新')=>{
    if(accountInFlight.current||modeRef.current!=='browser'||!target?.origin||
       (action!=='unlock'&&action!=='lock'&&!accountState?.unlocked))return;
    accountInFlight.current=true;
    // Start the Host request in the original button/change gesture. The
    // privileged parent independently observes userActivation synchronously.
    const intent=adapter.accountRequest(action,{
      ...payload,...(action==='unlock'||action==='lock'?{}:
        {revision:accountState.revision})
    });
    const requestedOrigin=target.origin;
    setAccountBusy(true);setAccountNotice(null);
    void Promise.resolve(intent).then(receipt=>{
      if(controller.snapshot().target?.origin!==requestedOrigin)return;
      if(action==='switch'){
        if(receipt?.switched!==true||receipt?.verified!==true)
          throw Object.assign(Error('E_OUTCOME_UNKNOWN'),{code:'E_OUTCOME_UNKNOWN'});
        setAccountState(previous=>previous?{...previous,currentAlias:payload.alias}:previous);
        setAccountNotice({kind:'success',text:receipt.preview===true
          ?'预览模拟：切换流程已返回虚构回执，未操作真实 Cookie。'
          :receipt.reloadRequested
            ?'已验证 Cookie 切换，正在刷新目标网页。'
            :'已验证 Cookie 切换；自动刷新已关闭。'});
        if(!receipt.reloadRequested)void controller.load();
      }else if(action==='lock'){
        setAccountState(previous=>previous?{
          ...previous,unlocked:false,accounts:[],currentAlias:null,revision:null,
          settings:{autoEnabled:false,autoRefresh:true}
        }:null);
        setAccountNotice({kind:'success',text:'账号仓库已锁定。'});
      }else{
        if(typeof receipt?.configured!=='boolean'||!Array.isArray(receipt.accounts))
          throw Object.assign(Error('E_OUTCOME_UNKNOWN'),{code:'E_OUTCOME_UNKNOWN'});
        setAccountState(receipt);
        setAccountNotice({kind:'success',text:receipt.preview===true
          ?'预览模拟：'+success+'（未写入真实账号）':success});
      }
    }).catch(error=>{
      if(controller.snapshot().target?.origin!==requestedOrigin)return;
      const code=String(error?.code||'E_ACCOUNT_HOST');
      const hints={
        E_OUTCOME_UNKNOWN:'可能发生部分 Cookie 写入，请手动核对，勿直接重复切换。',
        E_REFRESH_OUTCOME_UNKNOWN:'Cookie 切换已尝试，但网页刷新结果未确认，请手动核对。',
        E_VAULT_LOCKED_OR_CORRUPT:'口令不正确或加密仓库损坏，原数据未覆盖。',
        E_VAULT_CONFLICT:'另一个操作已修改账号，请重新打开账号页读取最新状态。',
        E_ACCOUNT_PARENT_DOMAIN_UNSUPPORTED:'本站使用跨子域 Cookie，当前安全模式不支持完整快照。',
        E_COOKIE_PARTITION:'Cookie 分区已变化，请重新检查目标标签页及授权。',
        E_COOKIE_STORE:'当前标签页的 Cookie Store 不匹配。',
        E_SITE_GRANT_REQUIRED:'网站 Cookie 授权失效，请在工具可信设置中恢复。',
        E_ACCOUNT_EMPTY:'当前站点没有可保存或切换的 Cookie。'
      };
      setAccountNotice({kind:'error',text:(hints[code]||'本次操作未确认，请检查权限或仓库状态。')+
        '（'+code+'）'});
    }).finally(()=>{accountInFlight.current=false;setAccountBusy(false);});
  };
  const copyAccountLink=(item,url)=>{
    if(!url||accountInFlight.current||!target?.url)return;
    accountInFlight.current=true;
    // Cookie-capable tools MUST reuse the first-party one-use export gate,
    // including for a non-secret link. Direct clipboard SDK calls from this
    // tool are intentionally denied by its stricter Host export policy.
    const pending=(async()=>{
      let ref=null;
      try{
        const intent=await adapter.beginExportIntent(target,'copy');
        if(intent?.authorized!==true||!Number.isSafeInteger(intent.ref)||intent.ref<1)
          throw Object.assign(Error('E_COOKIE_EXPORT'),{code:'E_COOKIE_EXPORT'});
        ref=intent.ref;
        return await adapter.copy(url);
      }finally{
        if(ref!==null)void adapter.finishExportIntent(ref).catch(()=>{});
      }
    })();
    setAccountBusy(true);setAccountNotice(null);
    void pending.then(result=>{
      if(result?.copied!==true)throw Error('E_OUTCOME_UNKNOWN');
      setAccountNotice({kind:'success',text:accountState?.preview
        ?'预览模拟：已处理复制链接操作。'
        :'已复制 '+item.displayName+' 的自动切换链接。'});
    }).catch(error=>setAccountNotice({kind:'error',
      text:'复制结果未确认（'+String(error?.code||'E_CLIPBOARD')+'）。'}))
      .finally(()=>{accountInFlight.current=false;setAccountBusy(false);});
  };
  // Opening import preserves the mounted list, query, page, scroll and draft.
  // Only a later native write needs the editor-dirty conflict gate.
  const openImport=()=>{
    if(locked||panel==='import')return;
    setExportOpen(false);setPanel('import');setImportNotice(null);
  };
  const closeExport=(restoreFocus=false,confirmed=false)=>{
    // A window blur during the Host effect cannot dismiss an unfinished export.
    if(exportPending.current&&!confirmed)return;
    setExportOpen(false);
    if(restoreFocus)hostRoot.querySelector('.cookie-editor-react [aria-label="导出 Cookie"]')
      ?.focus({preventScroll:true});
  };
  const switchMode=next=>guarded(()=>{
    if(next===mode)return;
    scrubSensitive();
    if(next==='offline'){
      // Leaving the live mode invalidates pending reads and any stale Cookie identities.
      setOfflineInitialSite(controller.snapshot().target);
      controller.invalidate('已退出实时 Cookie 模式；重新进入后需重新授权读取。');
    }else{
      // Reenter by explicitly rechecking the current or selected website.
      void controller.load(appliedSite.current);
    }
    modeRef.current=next;
    setMode(next);setSelected(null);setPanel(null);setExportOpen(false);setDirty(false);
  });
  const activeImportRef=React.useRef(null);
  const writeInFlight=React.useRef(false);
  const restoreImportFocus=React.useRef(false);
  React.useLayoutEffect(()=>{
    if(panel!==null)return;
    if(restoreImportFocus.current){
      restoreImportFocus.current=false;
      hostRoot.querySelector('.cookie-editor-react [aria-label="导入 Cookie"]')
        ?.focus({preventScroll:true});
    }
  },[panel]);
  const finishImportIntent=ref=>{
    if(!Number.isSafeInteger(ref)||ref<1)return;
    if(activeImportRef.current===ref)activeImportRef.current=null;
    void adapter.finishImportIntent(ref).catch(()=>{});
  };
  const beginImportIntent=async()=>{
    const state=controller.snapshot();
    if(modeRef.current!=='browser'||state.phase!=='ready'||!state.target)
      return false;
    activeImportRef.current=null;
    const receipt=await adapter.beginImportIntent(state.target);
    if(receipt?.authorized!==true||!Number.isSafeInteger(receipt.ref)||receipt.ref<1)
      return false;
    activeImportRef.current=receipt.ref;
    return true;
  };
  const importFromText=async (text,{overwrite=false}={})=>{
    // Keep Controller's real preflight/Host receipt, but make it one user action.
    // Raw Cookie values are never stored in React state or rendered as a preview.
    const initial=controller.snapshot();
    if(modeRef.current!=='browser'||initial.phase!=='ready')return false;
    if(dirtyRef.current){
      noteImport('请先保存或取消当前 Cookie 编辑草稿，再提交导入。');
      return 'failed';
    }
    const sessionRef=activeImportRef.current;
    try{
    const plan=await controller.previewImport(text,'auto',overwrite,{allSites:true});
    // Never report a stale success/error against a newly selected site.
    const currentSite=controller.snapshot();
    if(initial.epoch!==currentSite.epoch||
      initial.target?.url!==currentSite.target?.url)return false;
    if(!plan){
      controller.dismissImportReport();
      noteImport('无法导入：Cookie 格式不正确或网站授权不可用。');
      return false;
    }
    if(!plan.accepted){
      const first=String(plan.issues?.[0]?.reason||'');
      const reason=/域名|网站范围|Host-only/.test(first)
        ?'Cookie 域名或 Host-only 属性无效。'
        :/过期|expirationDate/.test(first)
          ?'Cookie 已过期。':'内容不符合 Cookie 格式或权限要求。';
      controller.discardImport();controller.dismissImportReport();
      noteImport('未导入 '+plan.total+' 条：'+reason);
      return false;
    }
    const ok=await controller.executeImport(text,'auto',overwrite,{allSites:true});
    if(ok){
      restoreImportFocus.current=true;
      noteImport('已导入 '+plan.accepted+' 条'+
        (plan.skipped?'，跳过 '+plan.skipped+' 条':'')+'。','success');
      setPanel(null);setSelected(null);setDirty(false);
      return true;
    }
    const outcome=controller.snapshot();
    noteImport(outcome.message||
      '导入结果未完全确认，请先核对 Chrome，勿直接重复提交。');
    // Only an explicit pre-write denial without any successful native effect
    // permits another user-initiated attempt. Never auto-replay partial writes.
    return outcome.importOutcome==='denied'?'failed':'unknown';
    }finally{
      finishImportIntent(sessionRef);
    }
  };
  const save=async(row,options)=>{
    // Capture the trusted operation during the original Save click, before any
    // Controller reads or React state updates. Chrome still verifies the write.
    if(writeInFlight.current)return;
    writeInFlight.current=true;
    const state=controller.snapshot();
    let pending=null,ref=null;
    if(modeRef.current==='browser'&&state.phase==='ready'&&state.target){
      const original=options?.originalId?controller.getRow(options.originalId):null;
      const renameFrom=original&&original.name!==row.name?original.name:null;
      pending=adapter.beginWriteIntent(state.target,row,{renameFrom});
    }
    setWorking(true);
    try{
      const admitted=await pending;
      if(admitted?.authorized!==true||!Number.isSafeInteger(admitted.ref)||admitted.ref<1){
        setStatus('保存未获得当前网站的可信操作许可，请重新点击保存。');
        return;
      }
      ref=admitted.ref;
      const saved=await controller.save(row,options);
      if(saved){setSelected(null);setDirty(false);setPage(1);setStatus('');}
    }catch{
      setStatus('本次保存授权失败，未自动重试。请检查网站权限后重新操作。');
    }finally{
      if(ref!==null)void adapter.finishWriteIntent(ref).catch(()=>{});
      writeInFlight.current=false;
      setWorking(false);
    }
  };
    const remove=async id=>{
     if(locked||writeInFlight.current)return;
     const state=controller.snapshot();
     const row=state.rows?.find(item=>item.id===id);
     if(modeRef.current!=='browser'||state.phase!=='ready'||!state.target||!row)return;
     // Mint the narrow, single-delete Host intent in the original button click.
     // Other tools and bulk deletes still use the ordinary Host review.
     writeInFlight.current=true;
     const pending=adapter.beginRemoveIntent(state.target,row);
     let ref=null;
     setWorking(true);
     try{
       const admitted=await pending;
       if(admitted?.authorized!==true||!Number.isSafeInteger(admitted.ref)||admitted.ref<1){
         setStatus('删除没有获得当前网站授权，请检查权限后重新操作。');
         return;
       }
       ref=admitted.ref;
       if(await controller.remove(id)){setSelected(null);setDirty(false);setStatus('');}
     }catch{
       setStatus('删除未确认，请先核对 Chrome，避免重复操作。');
     }finally{
       if(ref!==null)void adapter.finishWriteIntent(ref).catch(()=>{});
       writeInFlight.current=false;
       setWorking(false);
     }
   };
  const clear=async()=>{
    if(locked)return;
    if(dirty){setStatus('请先保存或取消当前修改，再清理本站 Cookie。');return;}
    setStatus('');
    setWorking(true);
    let result;
    try{result=await controller.previewClear();}
    finally{setWorking(false);}
    if(!result)return;
    if(!result.count){
      controller.discardClear();
      setStatus('当前清理范围内没有可删除的 Host-only Cookie。');
      return;
    }
    ask('',
      async()=>{setWorking(true);try{await controller.executeClear();}
        finally{setWorking(false);}},
      ()=>controller.discardClear(),'clear',
      {hostname:result.hostname,count:result.count});
  };
  const select=id=>guarded(()=>{setPanel(null);setExportOpen(false);setSelected(id);setStatus('');});
  const chooseSection=next=>guarded(()=>{
    if(next===section)return;
    setSection(next);setAccountRoute('list');
  });
  const productTabs=[['cookie','Cookie'],['accounts','账号'],['market','市场']];
  const onProductTabKey=e=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();
    const current=productTabs.findIndex(([key])=>key===section);
    const next=e.key==='Home'?0:e.key==='End'?2:
      (current+(e.key==='ArrowRight'?1:2))%3;
    hostRoot.querySelectorAll('.cookie-product-tabs [role="tab"]')[next]
      ?.focus({preventScroll:true});
    chooseSection(productTabs[next][0]);
  };
  const onKeyDown=e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){
      // Child forms own Save; never accidentally save hidden/redacted values.
      if(e.target.closest('.cookie-inline-editor'))return;
      e.preventDefault();return;
    }
    if(!confirmation)return;
    if(e.key==='Escape'&&confirmation.kind==='discard'){
      e.preventDefault();endConfirm(false);
    }
  };
  return <main className="cookie-editor-react od-page" onKeyDown={onKeyDown}>
    {mode==='browser'&&snapshot.phase==='ready'&&<CookieSiteBar
      site={target?.hostname||''} syncStale={snapshot.syncStale}
      busy={locked} onRefresh={()=>guarded(refresh)}/>}
    {mode==='browser'&&!(section==='accounts'&&accountRoute==='auto')&&
      <nav className="cookie-product-tabs" role="tablist" aria-label="Cookie Editor 页面"
        onKeyDown={onProductTabKey}>
        {productTabs.map(([key,label])=><button key={key} type="button"
          id={'cookie-product-tab-'+key}
          aria-controls={'cookie-product-panel-'+key}
          role="tab" aria-selected={section===key} tabIndex={section===key?0:-1}
          className={'od-button od-button--quiet'+(section===key?' is-current':'')}
          onClick={()=>chooseSection(key)}><span className="cookie-tab-label">{label}</span></button>)}
      </nav>}
    {mode==='offline'?<>
      <header className="cookie-offline-toolbar" aria-label="离线文件">
        <strong>离线文件</strong>
        <CookieIconButton name="globe" label="返回浏览器" disabled={locked}
          onClick={()=>switchMode('browser')}/>
      </header>
      <CookieOfflineWorkspace initialTarget={offlineInitialSite}
        adapter={adapter} onDirty={setDirty}/>
    </>:
    <>
      {section==='cookie'&&<section id="cookie-product-panel-cookie"
        role="tabpanel" aria-labelledby="cookie-product-tab-cookie">
      <CookiePermissions phase={snapshot.phase} reason={snapshot.problem} target={target}
        disabled={busy} onRetry={()=>guarded(refresh)}
        onOffline={()=>switchMode('offline')}/>
      {snapshot.phase==='ready'&&<div className="od-surface cookie-editor-workspace">
        <CookieEditorView site={target?.hostname||''} showSiteBar={false} syncStale={snapshot.syncStale}
          importOpen={panel==='import'}
          rows={snapshot.rows} selected={selected} onSelect={select}
          onRefresh={()=>guarded(refresh)}
          query={query} onQuery={v=>{setQuery(v);setPage(1);}}
          filter={filter} onFilter={v=>{setFilter(v);setPage(1);}}
          sort={sort} onSort={v=>{setSort(v);setPage(1);}}
          expandedFilters={expanded} onToggleFilters={()=>setExpanded(x=>!x)}
          page={page} onPage={setPage} busy={locked}
          onImport={openImport}
          onExport={()=>{if(!locked)setExportOpen(!exportOpen);}}
          exportOpen={exportOpen} onCloseExport={closeExport}
          exportContent={exportOpen?<CookieExport controller={controller} disabled={locked}
            onPendingChange={pending=>{exportPending.current=pending;}}
            onDelivered={method=>{
              closeExport(true,true);
              noteImport(method==='copy'?'已复制 Cookie':'Cookie 文件下载已发起','success');
            }}
            onClose={()=>closeExport(true)}/>:null}
          onNew={()=>select('new')} onClear={()=>void clear()}
          clearDisabled={!snapshot.rows.length}
          newEditor={selected==='new'?<CookieInlineEditor key="new" target={target}
            disabled={locked} onSave={save} onDirty={setDirty}
            onCancel={()=>{setSelected(null);setDirty(false);}}/>:null}
          editor={row=><CookieInlineEditor key={row.id} row={row} target={target}
            disabled={locked} readValue={controller.readValue} onSave={save}
            onDirty={setDirty} onCancel={()=>{setSelected(null);setDirty(false);}}
            onDelete={remove}/>}/>
        {panel==='import'&&<CookieImport disabled={locked}
          notice={importNotice} onImportText={importFromText} onNotice={noteImport}
          onPendingChange={value=>{importDirtyRef.current=value;}}
          onBeforeSubmit={()=>{
            if(!dirtyRef.current)return true;
            noteImport('请先保存或取消当前 Cookie 编辑草稿，再提交导入。');
            return false;
          }}
          onBeginImport={beginImportIntent}
          onClose={({committed=false}={})=>{
            if(locked&&!committed)return;
            restoreImportFocus.current=true;
            importDirtyRef.current=false;
            if(!committed){controller.discardImport();finishImportIntent(activeImportRef.current);}
            setPanel(null);
          }}/>}
      </div>}
      </section>}
      {section==='accounts'&&<CookieAccounts
        origin={target?.origin||''} accounts={accountState?.accounts||[]}
        currentAlias={accountState?.currentAlias||null}
        configured={accountState?.configured===true}
        route={accountRoute} onRoute={setAccountRoute}
        vaultReady={accountState?.unlocked===true} switchReady={
          accountState?.unlocked===true&&snapshot.phase==='ready'}
        autoRuntimeReady={accountState?.autoRuntimeReady===true&&
          accountState?.unlocked===true}
        autoEnabled={accountState?.settings?.autoEnabled===true}
        autoRefresh={accountState?.settings?.autoRefresh!==false}
        previewOnly={accountState?.preview===true}
        busy={accountBusy||locked} feedback={accountNotice}
        onUnlock={passphrase=>accountAction('unlock',{passphrase},'账号仓库已解锁。')}
        onLock={()=>accountAction('lock')}
        onCreate={displayName=>accountAction('create',{displayName},'已保存当前账号快照。')}
        onSwitch={item=>accountAction('switch',{alias:item.alias})}
        onRename={(item,displayName)=>accountAction('rename',{
          alias:item.alias,accountVersion:item.version,displayName},'账号已重命名。')}
        onUpdate={item=>accountAction('update',{
          alias:item.alias,accountVersion:item.version},'已更新账号快照。')}
        onDelete={item=>accountAction('delete',{
          alias:item.alias,accountVersion:item.version},'账号快照已删除。')}
        onToggleAuto={enabled=>accountAction('setAutoEnabled',{enabled},'自动切换设置已更新。')}
        onToggleRefresh={enabled=>accountAction('setAutoRefresh',{enabled},'刷新设置已更新。')}
        onAllowAlias={(item,enabled)=>accountAction('allowAlias',{
          alias:item.alias,accountVersion:item.version,enabled},'自动切换白名单已更新。')}
        onCopyLink={copyAccountLink}/>}
      {section==='market'&&<CookieAccountMarket previewOnly={previewMode}/>}
    </>}
    {mode==='browser'&&snapshot.phase==='ready'&&snapshot.message&&
      ['error','warning'].includes(snapshot.messageType)&&
      <p role={snapshot.messageType==='error'?'alert':'status'}
        className={'cookie-message od-alert '+(snapshot.messageType==='error'?'od-alert--error':'od-alert--warning')}>
      {snapshot.message}</p>}
    {status&&<p role="alert" className="cookie-message od-alert od-alert--error">{status}</p>}
    {panel!=='import'&&importNotice&&<div
      role={importNotice.kind==='error'?'alert':'status'}
      className={'cookie-import-toast'+
        (importNotice.kind==='error'?' cookie-import-toast--error':'')}>
      {importNotice.text}
    </div>}
    {confirmation?.kind==='clear'&&<CookieClearDialog
      hostname={confirmation.hostname} count={confirmation.count} busy={working}
      onCancel={()=>endConfirm(false)} onConfirm={()=>endConfirm(true)}/>}
    {confirmation?.kind==='discard'&&<div className="discard-row" role="status">
      <span>{confirmation.text}</span>
      <Button type="button" variant="secondary" onClick={()=>endConfirm(false)}>继续编辑</Button>
      <Button type="button" variant="secondary" onClick={()=>endConfirm(true)}>放弃</Button>
    </div>}
  </main>;
}
