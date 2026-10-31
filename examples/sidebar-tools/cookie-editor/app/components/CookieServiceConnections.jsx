import * as React from 'react';

const connectionStatus={UNCONNECTED:'未连接',DISCONNECTED:'已断开',INVALIDATED:'已失效（需重新连接）',CONNECTED:'已连接',SESSION_EXPIRED:'会话已过期',OUTCOME_UNKNOWN:'结果未知'};
const associationStatus={BOUND:'已绑定',PENDING_CONNECTION:'待连接',STALE:'已过期',DISCONNECTED:'已断开',INVALIDATED:'已失效'};
const secondary='od-button od-button--secondary cookie-button--compact';
const primary='od-button od-button--primary cookie-button--compact';
const localOrganization='本机用户';
const nativeMutations=new Set(['serviceConnect','serviceCommitAssociation','serviceUnbindAssociation',
  'serviceRemoteDisconnect','serviceAcceptPolicy','serviceOpenManagement','serviceArchiveOpenUnknown']);
const removable=row=>!row.remoteBindingId||row.remoteRevocation==='CONFIRMED';
const activeBinding=row=>Boolean(row.remoteBindingId)&&row.remoteRevocation==='REQUIRED';
const nativeForm=form=>form&&(['connect','policy','commit','unbind','archive'].includes(form.kind)||
  form.kind==='disconnect'&&form.connectionStatus==='CONNECTED');

function exactCompanyOrigin(value){
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&url.origin===value;}
  catch{return false;}
}

// The parent owns discovery, persistence, Native authorization and state refreshes.
// This component only reviews metadata and dispatches explicit commands.
const unresolved=item=>Boolean(item?.pending)||item?.status==='OUTCOME_UNKNOWN';
// Match managed-service-protocol serviceID and local-origin rules; epochs are opaque IDs.
const serviceID=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(value);
const registered=state=>(state?.nativeServices||[]).filter(item=>item?.serviceId==='ai-account-usage'&&
  serviceID(item.serviceInstanceId)&&serviceID(item.providerEpoch)&&exactLocalOrigin(item.origin));
function exactLocalOrigin(value){
  try{const url=new URL(value);return url.protocol==='http:'&&!url.username&&!url.password&&
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.localhost$/.test(url.hostname)&&Number(url.port)>0&&url.origin===value;}
  catch{return false;}
}
const scopeValid=(scope,desired,rows)=>scope&&desired&&scope.trigger==='MANUAL'&&desired.trigger==='MANUAL'&&
  Number.isInteger(scope.retentionDays)&&scope.retentionDays>=1&&scope.retentionDays<=30&&scope.retentionDays<=desired.retentionDays&&
  scope.bindingIds.length>0&&scope.bindingIds.every(id=>desired.bindingIds?.includes(id)&&rows.some(row=>row.status==='BOUND'&&row.remoteBindingId===id))&&
  scope.dataCategories.length>0&&scope.dataCategories.every(key=>['ACCOUNT_METADATA','USAGE_SUMMARY'].includes(key)&&desired.dataCategories?.includes(key));
export function CookieServiceConnections({origin='',accounts=[],accountReady=false,state,
  busy=false,notice='',onAction,onDirtyChange,onAccounts}){
  const connections=state?.connections||[];
  const associations=state?.associations||[];
  const [form,setForm]=React.useState(null);
  const [error,setError]=React.useState('');
  const [pending,setPending]=React.useState(false);
  const lock=React.useRef(false);
  const mounted=React.useRef(true);
  const trigger=React.useRef(null);
  const restore=React.useRef(false);
  const heading=React.useRef(null);
  const firstField=React.useRef(null);
  const latest=React.useRef(null);
  latest.current={origin,accounts,accountReady,state,busy};
  const available=accounts.filter(item=>item.origin===origin);
  const unknown=connections.some(unresolved);
  const services=registered(state);
  const formConnection=connections.find(item=>item.id===form?.connectionId);
  const nativeAssociation=form?.kind==='associate'&&formConnection?.mode==='local'&&formConnection.status==='CONNECTED';
  const blocked=unknown||busy||pending||typeof onAction!=='function'||!Number.isSafeInteger(state?.revision);
  const dirty=Boolean(form&&(form.kind==='config'
    ?form.label!==form.initial.label||form.mode!==form.initial.mode||form.serviceOrigin!==form.initial.serviceOrigin
    :form.kind==='rename'?form.label!==form.initialLabel
    :form.kind==='associate'?(form.alias||form.organization||form.providerKey||form.remoteAccountId)
    :['connect','policy','commit','unbind','archive','disconnect','remove'].includes(form.kind)));
  React.useEffect(()=>{onDirtyChange?.(dirty);},[dirty,onDirtyChange]);
  React.useEffect(()=>()=>onDirtyChange?.(false),[onDirtyChange]);
  React.useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  React.useLayoutEffect(()=>{
    if(form)firstField.current?.focus({preventScroll:true});
    else if(restore.current){restore.current=false;
      (trigger.current?.isConnected?trigger.current:heading.current)?.focus({preventScroll:true});}
  },[form?.kind,form?.connectionId]);

  const associationValid=draft=>{
    const current=latest.current;
    const service=current.state?.connections?.find(item=>item.id===draft.connectionId);
    const account=current.accounts.find(item=>item.alias===draft.alias&&item.origin===draft.origin);
    return current.accountReady&&current.origin===draft.origin&&service&&service.epoch===draft.epoch&&
      service.origin===draft.serviceOrigin&&service.status===draft.connectionStatus&&!unresolved(service)&&
      (service.mode!=='local'||service.status!=='CONNECTED'||!draft.remoteAccountId||service.resources?.some(row=>row.providerKey==='codex'&&row.remoteAccountId===draft.remoteAccountId))&&
      account&&account.version===draft.accountVersion;
  };
  React.useEffect(()=>{
    if(form?.kind==='associate'&&(form.origin!==origin||(form.alias&&!associationValid(form)))){
      setForm(previous=>previous?{...previous,alias:'',origin,confirmed:false}:previous);
      setError('站点、账号版本或服务状态已变化，请重新选择账号并核对。');
    }
  },[origin,accounts,accountReady,state,form?.alias,form?.confirmed]);

  const close=()=>{if(lock.current||latest.current.busy)return;restore.current=true;setForm(null);setError('');};
  const open=(event,draft)=>{
    if(form||lock.current||busy||(unknown&&draft.kind!=='archive'))return;
    trigger.current=event.currentTarget;setError('');setForm({...draft,revision:state.revision,
      ...(nativeForm(draft)?{sessionRevision:state.sessionRevision}:{})});
  };
  const reread=async()=>{
    try{await onAction?.('serviceStatus',{});}
    catch{if(mounted.current)setError('状态读取未成功，请稍后重新读取。');}
  };
  const update=patch=>{setError('');setForm(previous=>({...previous,...patch,confirmed:false}));};
  const run=async(action,payload,{readOnly=false,keepForm=false}={})=>{
    const current=latest.current;
    if(lock.current||(!readOnly&&current.busy)||typeof onAction!=='function')return;
    if(!readOnly){
      if(nativeMutations.has(action)&&(!Number.isSafeInteger(payload.sessionRevision)||
        payload.sessionRevision!==current.state?.sessionRevision)){setError('本机会话版本已变化，请重新核对当前状态。');return;}
      if(!Number.isSafeInteger(payload.revision)||payload.revision!==current.state?.revision){setError('服务状态版本已变化，请重新核对后保存。');return;}
      if(current.state?.connections?.some(unresolved)&&action!=='serviceArchiveOpenUnknown'){
        setError('原操作结果未知，请先核对原操作；不能重复写入或打开。');return;
      }
    }
    if(action==='serviceRemoveAssociation'){
      const row=current.state?.associations?.find(item=>item.id===payload.associationId);
      if(!row||!removable(row)){setError('远端关联须先解绑，不能直接移除。');return;}
    }
    lock.current=true;setPending(true);setError('');
    try{
      const success=await onAction(action,payload);
      if(!mounted.current)return;
      if(success===true){if(!readOnly&&!keepForm){restore.current=true;setForm(null);}}
      else setError('操作未成功，草稿已保留。请核对当前状态后再试。');
    }catch{if(mounted.current)setError('操作未确认，草稿已保留。请先核对当前状态，不要重复操作。');}
    finally{lock.current=false;if(mounted.current)setPending(false);}
  };
  const confirmNative=async()=>{
    if(!form)return;
    const current=latest.current;
    const service=current.state?.connections?.find(item=>item.id===form.connectionId);
    const row=current.state?.associations?.find(item=>item.id===form.associationId);
    if(!service||service.epoch!==form.epoch||service.status!==form.connectionStatus||service.origin!==form.serviceOrigin){
      setError('服务状态已变化，请取消后重新核对。');return;
    }
    const payload={revision:form.revision,sessionRevision:form.sessionRevision,connectionId:form.connectionId};
    if(form.kind==='connect'){
      const selected=registered(current.state).find(item=>item.serviceInstanceId===form.serviceInstanceId);
      if(service.mode!=='local'||!service.canConnect||!selected||selected.providerEpoch!==form.providerEpoch||selected.origin!==form.registeredOrigin){
        setError('请选择并核对当前已注册本机服务。');return;
      }
      await run('serviceConnect',{...payload,serviceId:selected.serviceId,providerEpoch:selected.providerEpoch});
    }else if(form.kind==='policy'){
      const policy=service.policy;
      const rows=(current.state.associations||[]).filter(item=>item.connectionId===service.id);
      const scope={bindingIds:form.bindingIds,dataCategories:form.dataCategories,trigger:'MANUAL',retentionDays:Number(form.retentionDays)};
      if(service.status!=='CONNECTED'||!Number.isSafeInteger(form.desiredRevision)||form.desiredRevision<1||
        !/^[a-f0-9]{64}$/.test(form.desiredHash)||policy?.authEpoch!==form.authEpoch||
        policy?.desired?.desiredRevision!==form.desiredRevision||policy?.desired?.desiredHash!==form.desiredHash||
        !scopeValid(scope,policy?.desired?.scope,rows)){
        setError('请核对当前策略版本、已绑定资源、数据类别和 1–30 天保留期限。');return;
      }
      await run('serviceAcceptPolicy',{...payload,desiredRevision:form.desiredRevision,desiredHash:form.desiredHash,scope});
    }else if(form.kind==='commit'||form.kind==='unbind'){
      if(service.status!=='CONNECTED'||!row||row.connectionId!==service.id||
        JSON.stringify(row)!==JSON.stringify(form.associationSnapshot)){setError('关联状态已变化，请取消后重新核对。');return;}
      if(form.kind==='commit'){
        const account=current.accounts.find(item=>item.alias===row.localAlias&&item.origin===row.localOrigin);
        if(!current.accountReady||current.origin!==row.localOrigin||!account||account.version!==row.accountVersion||
          row.status!=='PENDING_CONNECTION'||row.remoteBindingId||row.remoteRevocation==='CONFIRMED'||!service.resources?.some(item=>item.remoteAccountId===row.remoteAccountId&&item.providerKey==='codex')){
          setError('站点、账号版本或远端资源已变化，请重新建立草稿。');return;
        }
      }else if(!activeBinding(row))return;
      await run(form.kind==='commit'?'serviceCommitAssociation':'serviceUnbindAssociation',{
        revision:form.revision,sessionRevision:form.sessionRevision,associationId:form.associationId});
    }else if(form.kind==='archive'){
      if(service.pending?.action!=='open'||service.pending.operationId!==form.operationId){setError('原操作已变化，请重新核对。');return;}
      await run('serviceArchiveOpenUnknown',{...payload,operationId:form.operationId});
    }
  };
  const nativeDraft=(kind,item,extra={})=>({kind,connectionId:item.id,epoch:item.epoch,
    serviceOrigin:item.origin,connectionStatus:item.status,...extra});
  const openManagement=(item,associationId='')=>{
    const current=latest.current;
    const service=current.state?.connections?.find(row=>row.id===item.id);
    if(!form&&service?.mode==='local'&&service.status==='CONNECTED'&&service.canOpenManagement&&
      (!associationId||current.state?.associations?.some(row=>row.id===associationId&&row.connectionId===service.id&&row.status==='BOUND'&&row.remoteBindingId)))
      return run('serviceOpenManagement',{revision:current.state.revision,sessionRevision:current.state.sessionRevision,connectionId:item.id,associationId},{keepForm:true});
  };
  const saveAssociation=async()=>{
    if(!form?.confirmed)return;
    if(!associationValid(form)){setError('站点、账号版本或服务状态已变化，请重新选择账号并核对。');return;}
    await run('serviceAssociate',{revision:form.revision,connectionId:form.connectionId,
      alias:form.alias,accountVersion:form.accountVersion,remoteAccountId:form.remoteAccountId.trim(),
      organization:form.organization.trim(),providerKey:form.providerKey.trim()});
  };
  const submit=async event=>{
    event.preventDefault();if(blocked||lock.current||!form)return;
    if(form.revision!==latest.current.state?.revision){setError('服务状态版本已变化，请重新核对后保存。');return;}
    if(form.kind==='rename'){
      const label=form.label.trim();
      if(!label||label.length>64||/[\x00-\x1f\x7f]/.test(label)){setError('请填写 1–64 字的服务名称，不含控制字符。');return;}
      if(label===form.initialLabel)return;
      await run('serviceRename',{revision:form.revision,connectionId:form.connectionId,label});
    }else if(form.kind==='config'){
      if(!form.label.trim()){setError('请填写服务名称。');return;}
      if(form.mode==='company'&&!exactCompanyOrigin(form.serviceOrigin)){
        setError('请输入精确 HTTPS origin，例如 https://company.example，不含路径、尾斜杠、账号密码、查询或片段。');return;
      }
      await run('serviceSave',{revision:form.revision,label:form.label.trim(),mode:form.mode,
        serviceOrigin:form.mode==='local'?'':form.serviceOrigin});
    }else if(form.kind==='associate'){
      const account=available.find(item=>item.alias===form.alias);
      const service=connections.find(item=>item.id===form.connectionId);
      if(!accountReady||!account||!service||origin!==form.origin){setError('请从当前站点已保存账号中重新选择。');return;}
      if(!form.organization.trim()||!form.providerKey.trim()||!form.remoteAccountId.trim()||
        (nativeAssociation&&!service.resources?.some(item=>item.remoteAccountId===form.remoteAccountId&&item.providerKey==='codex'))){
        setError(nativeAssociation?'请选择已读取的 codex 远端资源。':'请填写组织、服务提供方和远端资源 ID。');return;
      }
      setError('');setForm({...form,confirmed:true,accountVersion:account.version,
        epoch:service.epoch,serviceOrigin:service.origin,connectionStatus:service.status});
    }
  };
  const beginConfig=event=>{
    const initial={label:'',mode:'local',serviceOrigin:''};
    open(event,{kind:'config',...initial,initial});
  };
  const onFormKeyDown=event=>{if(event.key==='Escape'){event.preventDefault();close();}};
  const revisionReview=form&&(state?.revision!==form.revision||nativeForm(form)&&
    (!Number.isSafeInteger(form.sessionRevision)||state?.sessionRevision!==form.sessionRevision))&&<div>
    <p role="alert">服务状态版本已变化，请重新核对后保存。已有输入已保留。</p>
    <button type="button" className={secondary} disabled={form.kind==='archive'?(pending||busy||typeof onAction!=='function'):blocked} onClick={()=>{
      setError('');setForm(previous=>({...previous,revision:state.revision,confirmed:false,
        ...(nativeForm(previous)?{sessionRevision:state.sessionRevision}:{}),
        ...(previous.kind==='associate'?{alias:'',origin}:{}),
        ...(previous.kind==='connect'?{serviceInstanceId:'',providerEpoch:null}:{}),
        ...(previous.kind==='policy'?{desiredRevision:formConnection?.policy?.desired?.desiredRevision,
          desiredHash:formConnection?.policy?.desired?.desiredHash,authEpoch:formConnection?.policy?.authEpoch,
          bindingIds:[],dataCategories:[]}:{} )}));
    }}>重新核对当前状态</button>
  </div>;
  return <section className="cookie-business-content" aria-label="服务连接">
    <header className="cookie-business-heading">
      <h3 ref={heading} tabIndex={-1}>服务连接</h3>
      <div className="cookie-business-actions"><button type="button" className={secondary}
        disabled={typeof onAction!=='function'} onClick={reread}>重新读取状态</button>
      <button type="button" className={primary} disabled={blocked||Boolean(form)}
        onClick={event=>beginConfig(event)}>添加服务</button></div>
    </header>
    {!form&&error&&<p role="alert" className="od-form-error">{error}</p>}
    {notice&&<p role="status" className="cookie-account-feedback">{notice}</p>}
    <p className="cookie-business-muted">可保存未连接配置。本机连接仅使用已注册的 ai-account-usage 进程；公司授权尚不可用。保存不会建立连接，也不会上传 Cookie。</p>
    {connections.length===0&&<p role="status">尚未配置服务。</p>}
    {connections.map(item=><article key={item.id} className="cookie-business-callout" aria-label={'服务：'+item.label}>
      <strong>{item.label}</strong>
      <p>{item.mode==='local'?'本机额度服务':item.origin} · {connectionStatus[item.status]||'状态未知'}</p>
      {item.status==='DISCONNECTED'&&!item.canConnect&&<p className="cookie-business-muted">待 Native 接线，暂不能重新连接。</p>}
      {item.reasonCode&&<p className="cookie-business-muted">原因：{item.reasonCode}</p>}
      <div className="cookie-business-actions">
        {item.mode==='local'&&item.status==='CONNECTED'&&item.canOpenManagement
          ?<button type="button" className={secondary} disabled={blocked||Boolean(form)} onClick={()=>openManagement(item)}>管理页</button>
          :<button type="button" className={secondary} disabled title="尚无可靠的管理页打开能力">管理页</button>}
        {item.mode==='local'&&item.status!=='CONNECTED'&&<button type="button" className={primary}
          aria-label={'连接服务：'+item.label} disabled={blocked||Boolean(form)||!item.canConnect||!services.length}
          onClick={event=>open(event,nativeDraft('connect',item,{serviceInstanceId:'',providerEpoch:null}))}>连接服务</button>}
        {item.mode==='local'&&<>
          <button type="button" className={secondary} aria-label={'读取远端资源：'+item.label}
            disabled={pending||typeof onAction!=='function'||item.status!=='CONNECTED'}
            onClick={()=>run('serviceResources',{connectionId:item.id},{readOnly:true})}>读取远端资源</button>
          <button type="button" className={secondary} aria-label={'读取策略：'+item.label}
            disabled={pending||typeof onAction!=='function'||item.status!=='CONNECTED'}
            onClick={()=>run('serviceReadPolicy',{connectionId:item.id},{readOnly:true})}>读取策略</button>
          <button type="button" className={secondary} aria-label={'审阅策略：'+item.label}
            disabled={blocked||Boolean(form)||item.status!=='CONNECTED'||!item.policy?.desired}
            onClick={event=>open(event,nativeDraft('policy',item,{desiredRevision:item.policy.desired.desiredRevision,
              desiredHash:item.policy.desired.desiredHash,authEpoch:item.policy.authEpoch,
              bindingIds:[],dataCategories:[],retentionDays:String(Math.min(30,item.policy.desired.scope?.retentionDays||30))}))}>审阅策略</button>
        </>}
        {unresolved(item)&&<>
          <button type="button" className={secondary} aria-label={'核对原操作：'+item.label}
            disabled={pending||typeof onAction!=='function'} onClick={()=>run('serviceReconcile',{connectionId:item.id},{readOnly:true})}>核对原操作</button>
          {item.pending?.action==='open'&&<button type="button" className={secondary} aria-label={'归档未知打开：'+item.label}
            disabled={busy||pending||Boolean(form)} onClick={event=>open(event,nativeDraft('archive',item,{operationId:item.pending.operationId}))}>归档未知打开</button>}
        </>}
        <button type="button" className={secondary} aria-label={'改名服务：'+item.label}
          disabled={blocked||Boolean(form)} onClick={event=>open(event,{kind:'rename',connectionId:item.id,
            label:item.label,initialLabel:item.label})}>改名</button>
        <button type="button" className={secondary} aria-label={'账号关联：'+item.label}
          disabled={blocked||Boolean(form)||!(item.status==='UNCONNECTED'||item.mode==='local'&&item.status==='CONNECTED')} onClick={event=>open(event,{kind:'associate',connectionId:item.id,
            epoch:item.epoch,serviceOrigin:item.origin,connectionStatus:item.status,origin,alias:'',organization:item.mode==='local'&&item.status==='CONNECTED'?localOrganization:'',providerKey:item.mode==='local'&&item.status==='CONNECTED'?'codex':'',remoteAccountId:'',confirmed:false})}>账号关联</button>
        <button type="button" className={secondary} aria-label={'断开服务：'+item.label}
          disabled={blocked||Boolean(form)||(item.mode==='local'?!['UNCONNECTED','CONNECTED'].includes(item.status):item.status==='DISCONNECTED')}
          onClick={event=>open(event,nativeDraft('disconnect',item,{label:item.label}))}>断开</button>
      </div>
      {item.pending&&<p role="status">原操作结果待核对；请勿重试或新建连接。只有未知的管理页打开可手动归档，历史记录将保留。</p>}
      {item.policy&&<div className="cookie-business-muted">
        <p>期望策略：{item.policy.desired?`版本 ${item.policy.desired.desiredRevision}`:'尚未设置'}</p>
        {item.policy.desired?.scope&&<p>期望范围：{item.policy.desired.scope.dataCategories?.join('、')} · {item.policy.desired.scope.trigger} · {item.policy.desired.scope.retentionDays} 天</p>}
        <p>已接受策略：{item.policy.acceptance?`版本 ${item.policy.acceptance.desiredRevision}`:'尚未接受'} · {item.policy.paused?'已暂停':'未暂停'}</p>
        {item.policy.acceptance?.scope&&<p>已接受范围：{item.policy.acceptance.scope.dataCategories?.join('、')} · {item.policy.acceptance.scope.trigger} · {item.policy.acceptance.scope.retentionDays} 天</p>}
        <p>策略审批仅涉及账号元数据与用量摘要，不代表 Cookie 同步授权。</p>
      </div>}
      {form?.kind==='rename'&&form.connectionId===item.id&&<form className="cookie-business-inquiry"
        aria-label="服务改名" onSubmit={submit} onKeyDown={onFormKeyDown}>
        <label>服务名称<input ref={firstField} className="od-field" aria-label="新服务名称"
          maxLength={64} disabled={blocked} value={form.label} onChange={event=>update({label:event.target.value})}/></label>
        {revisionReview}
        {error&&<p role="alert" className="od-form-error">{error}</p>}
        <div className="cookie-business-actions">
          <button type="submit" className={primary} disabled={blocked||form.label.trim()===form.initialLabel}>保存名称</button>
          <button type="button" className={secondary} disabled={pending||busy} onClick={close}>取消</button>
        </div>
      </form>}
      {associations.filter(row=>row.connectionId===item.id).map(row=><div className="cookie-business-usage-row" key={row.id}>
        <strong>{row.localAlias}</strong><p>{row.localOrigin} · {row.organization} · {row.providerKey} · {row.remoteAccountId}</p>
        <p>未核验 · {associationStatus[row.status]||'状态未知'} · 不代表已确认同一登录身份</p>
        {activeBinding(row)?<>
          {row.status==='BOUND'&&item.mode==='local'&&item.status==='CONNECTED'&&item.canOpenManagement&&<button type="button" className={secondary}
            aria-label={'资源管理页：'+row.localAlias} disabled={blocked||Boolean(form)} onClick={()=>openManagement(item,row.id)}>资源管理页</button>}
          <button type="button" className={secondary} aria-label={'解绑关联：'+row.localAlias}
            disabled={blocked||Boolean(form)||item.status!=='CONNECTED'} onClick={event=>open(event,nativeDraft('unbind',item,{
              associationId:row.id,label:row.localAlias,associationSnapshot:{...row}}))}>解绑关联</button>
        </>:<>
          {item.mode==='local'&&item.status==='CONNECTED'&&row.status==='PENDING_CONNECTION'&&!row.remoteBindingId&&row.remoteRevocation!=='CONFIRMED'&&<button type="button" className={primary}
            aria-label={'提交远端关联：'+row.localAlias} disabled={blocked||Boolean(form)} onClick={event=>open(event,nativeDraft('commit',item,{
              associationId:row.id,label:row.localAlias,associationSnapshot:{...row}}))}>提交远端关联</button>}
          {removable(row)&&<button type="button" className={secondary} aria-label={'移除关联：'+row.localAlias}
            disabled={blocked||Boolean(form)} onClick={event=>open(event,{kind:'remove',associationId:row.id,label:row.localAlias})}>移除关联</button>}
        </>}
      </div>)}
    </article>)}
    {form&&form.kind!=='rename'&&<form className="cookie-business-inquiry" aria-label="服务连接编辑" onSubmit={submit}
      onKeyDown={onFormKeyDown}>
      <h4>{form.kind==='config'?'服务配置':form.kind==='associate'?'待连接账号关联':form.kind==='disconnect'?'断开服务':({connect:'连接本机服务',policy:'审阅期望策略',commit:'提交远端关联',unbind:'解绑远端关联',archive:'归档未知打开'})[form.kind]||'移除关联'}</h4>
      {revisionReview}
      {error&&<p id="cookie-service-form-error" className="od-form-error" role="alert">{error}</p>}
      <div className="cookie-business-features" aria-describedby={error?'cookie-service-form-error':undefined}>
        {form.kind==='config'&&<>
          <label>服务名称<input ref={firstField} className="od-field" aria-label="服务名称" maxLength={64} disabled={blocked}
            value={form.label} onChange={event=>update({label:event.target.value})}/></label>
          <label>服务类型<select className="od-field" aria-label="服务类型" disabled={blocked} value={form.mode}
            onChange={event=>update({mode:event.target.value})}>
            <option value="local">本机额度服务</option><option value="company">公司服务</option>
          </select></label>
          {form.mode==='company'&&<label>服务地址<input className="od-field" aria-label="服务地址" placeholder="https://company.example" disabled={blocked}
            value={form.serviceOrigin} onChange={event=>update({serviceOrigin:event.target.value})}/></label>}
          <p>仅新建未连接配置；每种类型和地址只能保存一份，不会修改已有连接或重新连接。公司登录授权尚不可用。</p>
          <button type="submit" className={primary} disabled={blocked}>保存配置</button>
        </>}
        {form.kind==='associate'&&<>
          <p>本站点：{origin||'当前站点不可用'}。{nativeAssociation?'选择已读取的远端资源，仅保存待核验草稿。':'手动填写远端资源仅保存待核验草稿。'}</p>
          {!accountReady?<p role="status">本站点账号尚未就绪，请先在账号页读取。</p>:available.length===0&&<p>本站点尚无已保存账号，请先保存账号后关联。</p>}
          {(!accountReady||available.length===0)&&typeof onAccounts==='function'&&<button type="button" className={secondary}
            disabled={blocked} onClick={onAccounts}>前往账号保存</button>}
          <label>本站点账号<select ref={firstField} className="od-field" aria-label="本站点账号" value={form.alias}
            disabled={blocked||!accountReady||!available.length} onChange={event=>{
              const service=connections.find(item=>item.id===form.connectionId);
              update({alias:event.target.value,accountVersion:available.find(item=>item.alias===event.target.value)?.version,
                origin,epoch:service?.epoch,serviceOrigin:service?.origin,connectionStatus:service?.status});
            }}>
            <option value="">请选择已保存账号</option>
            {available.map(item=><option key={item.alias} value={item.alias}>{item.displayName} · {item.alias}</option>)}
          </select></label>
          {!nativeAssociation&&<><label>组织<input className="od-field" aria-label="组织" value={form.organization} maxLength={80} disabled={blocked}
            onChange={event=>update({organization:event.target.value})}/></label>
          <label>服务提供方<input className="od-field" aria-label="服务提供方" value={form.providerKey} maxLength={80} disabled={blocked}
            onChange={event=>update({providerKey:event.target.value})}/></label>
          <label>远端资源 ID<input className="od-field" aria-label="远端资源 ID" value={form.remoteAccountId} maxLength={80} disabled={blocked}
            onChange={event=>update({remoteAccountId:event.target.value})}/></label></>}
          {nativeAssociation&&<>
            <p>组织：{form.organization}（本地分类标签，不代表服务端公司组织）。</p>
            <p>服务提供方：codex · 远端身份未核验；仅保存本地草稿。</p>
            <label>远端资源<select className="od-field" aria-label="远端资源" disabled={blocked}
              value={form.remoteAccountId} onChange={event=>update({remoteAccountId:event.target.value})}>
              <option value="">请选择已读取资源</option>
              {(formConnection.resources||[]).filter(item=>item.providerKey==='codex').map(item=><option key={item.remoteAccountId}
                value={item.remoteAccountId}>{item.displayName?`${item.displayName} · `:''}{item.remoteAccountId} · 未核验</option>)}
            </select></label>
          </>}
          {form.confirmed?<section className="cookie-business-callout" aria-label="待连接关联确认">
            <strong>未核验 · 待连接</strong>
            <p>本站点：{form.origin}；账号：{available.find(item=>item.alias===form.alias)?.displayName}（{form.alias}）</p>
            <p>服务：{form.serviceOrigin||'本机额度服务'}；组织：{form.organization}；提供方：{form.providerKey}；远端资源：{form.remoteAccountId}</p>
            <p>尚未验证同一登录身份，不建立远端关联，也不授予 Cookie 上传权限。</p>
            <button type="button" className={primary} disabled={blocked} onClick={saveAssociation}>保存待连接关联</button>
          </section>:<button type="submit" className={primary} disabled={blocked||!accountReady||!available.length}>核对关联</button>}
        </>}
        {form.kind==='disconnect'&&<>
          <p>确认断开「{form.label}」？关联将不可用，本地保存账号不会删除；{form.connectionStatus==='CONNECTED'?'将请求服务端断开，结果以回执为准。':'此操作不代表已完成远端撤权。'}</p>
          <button ref={firstField} type="button" className={primary} disabled={blocked}
            onClick={()=>{
              const current=latest.current.state?.connections?.find(item=>item.id===form.connectionId);
              if(!current||current.status!==form.connectionStatus||current.epoch!==form.epoch||
                (current.mode==='local'&&!['UNCONNECTED','CONNECTED'].includes(current.status))){setError('服务状态已变化，请取消后重新核对。');return;}
              return run(form.connectionStatus==='CONNECTED'?'serviceRemoteDisconnect':'serviceDisconnect',{
                revision:form.revision,connectionId:form.connectionId,
                ...(form.connectionStatus==='CONNECTED'?{sessionRevision:form.sessionRevision}:{})});
            }}>确认断开</button>
        </>}
        {form.kind==='connect'&&<>
          <p>仅连接已注册的 ai-account-usage 固定进程；不会上传 Cookie。公司服务不支持 Native 连接。</p>
          <label>已注册本机服务<select ref={firstField} className="od-field" aria-label="已注册本机服务" disabled={blocked}
            value={form.serviceInstanceId} onChange={event=>{
              const selected=services.find(item=>item.serviceInstanceId===event.target.value);
              update({serviceInstanceId:event.target.value,providerEpoch:selected?.providerEpoch,registeredOrigin:selected?.origin});
            }}><option value="">请选择已注册服务</option>{services.map(item=><option key={item.serviceInstanceId}
              value={item.serviceInstanceId}>{item.productName} · {item.serviceId} · {item.origin}</option>)}</select></label>
          <button type="button" className={primary} disabled={blocked} onClick={confirmNative}>确认连接</button>
        </>}
        {form.kind==='policy'&&<>
          <p>期望版本：{form.desiredRevision} · 摘要：{form.desiredHash}</p>
          <p>仅手动触发（MANUAL），不上传 Cookie；请逐项选择范围后确认。</p>
          {['ACCOUNT_METADATA','USAGE_SUMMARY'].map(key=><label key={key}>
            <input ref={key==='ACCOUNT_METADATA'?firstField:undefined} type="checkbox" aria-label={'批准数据：'+key}
              disabled={blocked||!formConnection?.policy?.desired?.scope?.dataCategories?.includes(key)} checked={form.dataCategories.includes(key)}
              onChange={()=>update({dataCategories:form.dataCategories.includes(key)?form.dataCategories.filter(item=>item!==key):[...form.dataCategories,key]})}/>{key}
          </label>)}
          {associations.filter(row=>row.connectionId===form.connectionId&&row.status==='BOUND'&&row.remoteBindingId&&
            formConnection?.policy?.desired?.scope?.bindingIds?.includes(row.remoteBindingId)).map(row=><label key={row.id}>
            <input type="checkbox" aria-label={'批准资源：'+row.remoteBindingId} disabled={blocked} checked={form.bindingIds.includes(row.remoteBindingId)}
              onChange={()=>update({bindingIds:form.bindingIds.includes(row.remoteBindingId)?form.bindingIds.filter(id=>id!==row.remoteBindingId):[...form.bindingIds,row.remoteBindingId]})}/>
            {row.localAlias} · {row.remoteAccountId} · {row.remoteBindingId}
          </label>)}
          <label>保留天数<input type="number" min="1" max="30" className="od-field" aria-label="保留天数" disabled={blocked}
            value={form.retentionDays} onChange={event=>update({retentionDays:event.target.value})}/></label>
          <button type="button" className={primary} disabled={blocked} onClick={confirmNative}>确认接受策略</button>
        </>}
        {(form.kind==='commit'||form.kind==='unbind')&&<>
          <p>确认{form.kind==='commit'?'提交远端关联':'解绑远端关联'}「{form.label}」？本地账号保留；关联仍为未核验，不授予 Cookie 上传权限。</p>
          <p>本站点：{form.associationSnapshot.localOrigin}；本地账号：{form.associationSnapshot.localAlias}；版本：{form.associationSnapshot.accountVersion}；远端资源：{form.associationSnapshot.remoteAccountId}</p>
          <button ref={firstField} type="button" className={primary} disabled={blocked} onClick={confirmNative}>
            {form.kind==='commit'?'确认远端关联':'确认解绑'}</button>
        </>}
        {form.kind==='archive'&&<>
          <p>请手动确认已核对管理页打开结果。归档仅解除未知打开阻塞，保留历史记录，不宣告原操作失败。</p>
          <button ref={firstField} type="button" className={primary} disabled={pending||busy}
            onClick={confirmNative}>确认归档未知打开</button>
        </>}
        {form.kind==='remove'&&<>
          <p>确认移除「{form.label}」的本地待核验关联？不会删除本站点账号或远端资源。</p>
          <button ref={firstField} type="button" className={primary} disabled={blocked}
            onClick={()=>run('serviceRemoveAssociation',{revision:form.revision,associationId:form.associationId})}>确认移除</button>
        </>}
      </div>
      <button type="button" className={secondary} disabled={pending||busy} onClick={close}>取消</button>
    </form>}
    <details className="cookie-business-disclosure"><summary>本机服务终端入口</summary>
      <p>在仓库根目录的终端运行：</p>
      <code>npm start --prefix examples/sidebar-tools/cookie-editor/ai-account-usage</code>
      <p>使用终端显示的一次性链接完成本机配对并打开管理页。服务停止后会话失效；不会自动发现或扫描端口。</p>
    </details>
  </section>;
}
