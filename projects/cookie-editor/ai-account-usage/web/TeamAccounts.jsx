import React,{useEffect,useRef,useState} from 'react';

const base='/opendesk/admin/api/';
const journalKey='od-team-account-operation:v1';
const actions={publish:'发布账号元数据',assign:'分配加密会话邀请',revoke:'撤销设备分配'};
const paths={publish:'team-accounts',assign:'team-assignments',revoke:'team-revoke'};
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(value);
const version=value=>Number.isSafeInteger(value)&&value>=0;
const unknown=()=>Object.assign(Error('操作结果未知；请读取原回执，勿重复提交。'),{code:'UNKNOWN'});

export function createTeamApi(fetcher=globalThis.fetch) {
  async function request(path,body) {
    let response;
    try{response=await fetcher(base+path,{method:body?'POST':'GET',credentials:'same-origin',redirect:'error',cache:'no-store',
      ...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});}
    catch{throw body?unknown():Error('无法读取团队管理数据；请核实管理员会话。');}
    if(!response.ok){
      let denial;try{denial=await response.json();}catch{}
      if(body&&[400,401,403,404,409,410,422].includes(response.status)&&
        ['BAD_INPUT','ADMIN_REQUIRED','NOT_FOUND','VERSION_CONFLICT','ASSIGNMENT_CONFLICT','ACCOUNT_EXPIRED',
          'INVITATION_REUSED','OPERATION_CONFLICT'].includes(denial?.error))
        throw Object.assign(Error('操作未接受；请重新读取账号版本和设备分配后审阅。'),{code:'REJECTED'});
      throw body?unknown():Error('无法读取团队管理数据或原回执；未发送写入请求。');
    }
    try{return await response.json();}catch{throw body?unknown():Error('团队管理数据格式无效。');}
  }
  return {devices:()=>request('devices'),list:()=>request('team-accounts'),
    submit:(action,body)=>{if(!Object.hasOwn(paths,action))throw Error('无效动作。');return request(paths[action],body);},
    receipt:operationId=>{if(!validId(operationId))throw Error('无效操作编号。');return request('team-operations/'+encodeURIComponent(operationId));}};
}

// Persist only an ID and an action, never a request body, invitation or fingerprint.
// An unreadable journal fails closed; there is deliberately no archive/retry shortcut.
export function createTeamManager({api=createTeamApi(),storage=globalThis.localStorage,newId=()=>crypto.randomUUID(),locks=globalThis.navigator?.locks}={}) {
  let busy=false,allowed=false,data=null,pending=null,blocked=false;
  function readJournal(){
    try{const raw=storage.getItem(journalKey);let value=null;
      if(raw!==null){value=JSON.parse(raw);
        if(!value||Object.keys(value).sort().join(',')!=='action,operationId'||!validId(value.operationId)||!Object.hasOwn(actions,value.action))throw Error();}
      pending=value;
    }catch{blocked=true;throw Error('操作记录无法安全读取，写入已禁用。');}
  }
  try{readJournal();}catch{}
  if(typeof locks?.request!=='function')blocked=true;
  // Web Locks, not localStorage, provides same-origin exclusion across pages.
  // Keep the lock through the response/receipt so no other page can replace the journal.
  async function withJournalLock(task){
    let entered=false;
    try{
      if(typeof locks?.request!=='function')throw Error();
      return await locks.request(journalKey,{mode:'exclusive'},()=>{entered=true;return task();});
    }catch(error){if(!entered){blocked=true;throw Error('无法串行保护操作记录，写入已禁用。');}throw error;}
  }
  const clear=operationId=>{
    readJournal();
    if(pending?.operationId!==operationId)throw unknown();
    try{storage.removeItem(journalKey);pending=null;}catch{blocked=true;throw unknown();}
  };
  function confirmed(receipt,operationId){return receipt?.operationId===operationId&&receipt.status==='CONFIRMED';}
  return {
    state:()=>({busy,allowed,data,pending,blocked}),
    async load(){
      if(busy)throw Error('请等待当前操作结束。');busy=true;allowed=false;
      try{const gate=await api.devices();if(gate?.readOnly!==false)throw Error('仅已登录管理员可管理团队账号。');
        const result=await api.list();
        if(!Array.isArray(result?.accounts)||result.accounts.some(a=>!validId(a.accountId)||!version(a.version)||a.version<1))throw Error('团队账号列表格式无效。');
        const devices=result.devices??gate.devices;
        if(!Array.isArray(devices)||devices.some(d=>!validId(d.deviceId)))throw Error('团队设备列表格式无效。');
        if(result.assignments!==undefined&&(!Array.isArray(result.assignments)||result.assignments.some(a=>!validId(a.accountId)||!validId(a.deviceId)||!version(a.assignmentRevision)||typeof a.revoked!=='boolean')))throw Error('团队分配列表格式无效。');
        try{readJournal();}catch{}
        data={accounts:result.accounts,devices,assignments:result.assignments??null};allowed=result.readOnly!==true;return data;
      }finally{busy=false;}
    },
    async submit(action,body){
      if(busy||!allowed||pending||blocked)throw Error('当前不能提交；请先读取列表或原回执。');
      if(!Object.hasOwn(actions,action))throw Error('无效动作。');
      busy=true;
      try{return await withJournalLock(async()=>{
        readJournal();
        if(pending||blocked)throw unknown();
        const operationId=newId();if(!validId(operationId))throw Error('无法生成操作编号。');
        const record={operationId,action};
        try{storage.setItem(journalKey,JSON.stringify(record));pending=record;}catch{blocked=true;throw Error('无法保留操作记录；未发送请求。');}
        let receipt;
        try{receipt=await api.submit(action,{...body,operationId});}
        catch(error){allowed=false;if(error.code==='REJECTED'){clear(operationId);throw error;}throw unknown();}
        allowed=false;
        if(!confirmed(receipt,operationId))throw unknown();
        clear(operationId);return receipt;
      });}finally{busy=false;}
    },
    async reconcile(){
      if(busy||!allowed||blocked)throw Error('请先读取管理员列表，再读取原回执。');busy=true;
      try{return await withJournalLock(async()=>{
        readJournal();if(!pending)throw Error('没有待确认的原操作。');
        const operationId=pending.operationId;
        const receipt=await api.receipt(operationId);if(!confirmed(receipt,operationId))throw unknown();
        allowed=false;clear(operationId);return receipt;
      });}
      finally{busy=false;}
    }
  };
}

const dateInput=value=>Number.isFinite(value)?new Date(value-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
const deviceLabel=d=>`${d.userId?d.userId+' · ':''}${d.label||'设备'} · ${d.deviceId}`;
function TeamDialog({manager,close}) {
  const ref=useRef(null),[state,setState]=useState(manager.state()),[message,setMessage]=useState('');
  const [editing,setEditing]=useState(''),[accountId,setAccountId]=useState(''),[displayName,setDisplayName]=useState(''),[origin,setOrigin]=useState(''),[expiresAt,setExpiresAt]=useState('');
  const [target,setTarget]=useState(''),[deviceId,setDeviceId]=useState(''),[inviteUrl,setInviteUrl]=useState(''),[fingerprint,setFingerprint]=useState('');
  useEffect(()=>{const previous=document.activeElement,dialog=ref.current;dialog.showModal();return ()=>{dialog.close();if(previous?.isConnected)previous.focus();};},[]);
  const data=state.data,account=data?.accounts.find(a=>a.accountId===target);
  const assignment=data?.assignments?.find(a=>a.accountId===target&&a.deviceId===deviceId);
  const device=data?.devices.find(d=>d.deviceId===deviceId);
  const disabled=state.busy||!state.allowed||!!state.pending||state.blocked;
  async function run(action){
    setMessage('');const task=action();setState(manager.state());
    try{const receipt=await task;
      if(receipt?.status==='CONFIRMED'){
        setInviteUrl('');setFingerprint('');
        setMessage(`原回执已确认 · ${receipt.operationId}。这仅确认元数据或分配记录；会话交付需在原分享功能核实。`);
        await manager.load();
      }
    }catch(error){setMessage(error.code==='UNKNOWN'?'操作结果未知；请读取原回执，不能生成新操作重发。':
      error.code==='REJECTED'?'操作未接受；请重新读取列表后审阅版本与范围。':'未能完成操作；请核实会话、列表与原回执。未自动重试。');}
    finally{setState(manager.state());}
  }
  function edit(a){setEditing(a?.accountId??'');setAccountId(a?.accountId??'');setDisplayName(a?.displayName??'');setOrigin(a?.origin??'');setExpiresAt(dateInput(a?.expiresAt));}
  function publish(event){event.preventDefault();if(disabled)return;
    const expiry=Date.parse(expiresAt);let parsed;try{parsed=new URL(origin);}catch{return setMessage('请输入完整的站点 Origin。');}
    if(!validId(accountId)||!displayName.trim()||parsed.origin!==origin||!['http:','https:'].includes(parsed.protocol)||!Number.isFinite(expiry)||expiry<=Date.now())return setMessage('请核实账号 ID、名称、站点 Origin 与未来到期时间。');
    const previous=data.accounts.find(a=>a.accountId===accountId);
    if(!editing&&previous)return setMessage('该账号已存在，请从列表选择更新元数据。');
    run(()=>manager.submit('publish',{accountId,expectedVersion:previous?.version??0,displayName:displayName.trim(),origin,expiresAt:expiry}));
  }
  function assign(event){event.preventDefault();if(disabled||!account||!device||device.revoked||!data.assignments)return;
    let url;try{url=new URL(inviteUrl);}catch{return setMessage('请输入原分享功能生成的加密会话邀请。');}
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!/^\/i\/[A-Za-z0-9_-]{22,80}$/.test(url.pathname)||inviteUrl!==url.origin+url.pathname||(fingerprint!==''&&!/^[a-f0-9]{64}$/.test(fingerprint)))return setMessage('请核实邀请地址；填写指纹时须为 64 位小写十六进制。');
    run(()=>manager.submit('assign',{accountId:account.accountId,accountVersion:account.version,deviceId,expectedRevision:assignment?.assignmentRevision??0,inviteUrl,senderFingerprint:fingerprint||null}));
  }
  return <dialog ref={ref} className="team-accounts" aria-labelledby="team-accounts-title" onCancel={e=>{e.preventDefault();close();}}>
    <header><h2 id="team-accounts-title">团队账号管理</h2><button type="button" className="outline" onClick={close}>关闭团队账号管理</button></header>
    <div className="team-accounts-body">
      <div className="team-accounts-tags"><span>额度缓存：仅观测</span><span>账号元数据：版本化发布</span><span>加密会话邀请：精确到设备</span></div>
      <p>会话通过 Cookie Editor 原分享功能发布。接收端配对后，发送端核对接收端指纹再交付，按接收设备单次加密。这里仅登记邀请引用；填写邀请地址不代表已上传 Cookie 或完成交付。不要输入原始 Cookie 或密码。</p>
      <button type="button" className="outline" disabled={state.busy} onClick={()=>run(()=>manager.load())}>重新读取账号与设备</button>
      {message&&<p role="status">{message}</p>}
      {state.blocked&&<p role="alert">操作记录无法安全读取或保存，写入已禁用。</p>}
      {state.pending&&<section aria-label="待确认原操作"><p>{actions[state.pending.action]} · 操作 {state.pending.operationId} · 结果待确认；禁止重复提交。请先重新读取账号与设备，再读取原操作回执。</p>
        <button type="button" className="outline" disabled={state.busy||!state.allowed} onClick={()=>run(()=>manager.reconcile())}>读取原操作回执</button></section>}
      <section><h3>已发布账号元数据</h3>
        {!data?.accounts.length?<p>尚无已发布团队账号。</p>:<ul>{data.accounts.map(a=><li key={a.accountId}>
          <strong>{a.displayName}</strong> · {a.accountId} · 版本 {a.version} · {a.origin} · 到期 {new Date(a.expiresAt).toLocaleString('zh-CN')}
          <button type="button" className="outline" disabled={disabled} onClick={()=>edit(a)}>更新 {a.displayName} 元数据</button>
        </li>)}</ul>}
      </section>
      <form onSubmit={publish}><fieldset disabled={disabled}><legend>{editing?'更新账号元数据':'发布账号元数据'}</legend>
        {editing&&<button type="button" className="outline" onClick={()=>edit(null)}>改为发布新账号</button>}
        <label>账号 ID<input required maxLength={96} value={accountId} disabled={!!editing} onChange={e=>setAccountId(e.target.value)}/></label>
        <label>显示名称<input required maxLength={80} value={displayName} onChange={e=>setDisplayName(e.target.value)}/></label>
        <label>站点 Origin<input required type="url" placeholder="https://example.com" value={origin} onChange={e=>setOrigin(e.target.value)}/></label>
        <label>到期时间<input required type="datetime-local" value={expiresAt} onChange={e=>setExpiresAt(e.target.value)}/></label>
        <p>期望版本 {data?.accounts.find(a=>a.accountId===accountId)?.version??0}；保存后生成新版本，已有分配需按新版本重新审阅。</p>
        <button type="submit" className="primary">{editing?'保存账号新版本':'发布账号元数据'}</button>
      </fieldset></form>
      <form onSubmit={assign}><fieldset disabled={disabled||!data?.assignments}><legend>精确设备分配与撤销</legend>
        {!data?.assignments&&<p>分配列表未提供，暂不可修改设备分配。</p>}
        <label>团队账号<select required value={target} onChange={e=>{setTarget(e.target.value);setInviteUrl('');setFingerprint('');}}><option value="">选择已发布账号</option>{data?.accounts.map(a=><option key={a.accountId} value={a.accountId}>{a.displayName} · 版本 {a.version}</option>)}</select></label>
        <label>接收设备<select required value={deviceId} onChange={e=>{setDeviceId(e.target.value);setInviteUrl('');setFingerprint('');}}><option value="">选择精确设备</option>{data?.devices.filter(d=>!d.revoked).map(d=><option key={d.deviceId} value={d.deviceId}>{deviceLabel(d)}</option>)}</select></label>
        <p>当前分配：{assignment?`${assignment.revoked?'已撤销':'已登记'} · 账号版本 ${assignment.accountVersion} · 分配修订 ${assignment.assignmentRevision}`:'无分配'}。初次分配可留空指纹；接收端配对、原发送端核对指纹交付后，选择同一账号与设备、重新粘贴原邀请并补填发送端指纹，保存后分配修订加一。保存邀请引用不证明会话已交付。</p>
        <label>原分享功能的加密会话邀请地址<input required type="url" autoComplete="off" maxLength={2048} value={inviteUrl} onChange={e=>setInviteUrl(e.target.value)}/></label>
        <label>发送端指纹（初次分配可留空）<input autoComplete="off" spellCheck={false} maxLength={64} value={fingerprint} onChange={e=>setFingerprint(e.target.value)}/></label>
        <button type="submit" className="primary" disabled={!account||!device||account.expiresAt<=Date.now()}>{assignment&&!assignment.revoked?'更新该设备分配 / 补填指纹':'保存该设备的邀请分配'}</button>{' '}
        <button type="button" className="outline" disabled={!assignment||assignment.revoked||!device||device.revoked} onClick={()=>{
          if(disabled||!assignment||assignment.revoked||!device||device.revoked)return;
          run(()=>manager.submit('revoke',{accountId:target,deviceId,expectedRevision:assignment.assignmentRevision}));
        }}>撤销所选设备分配</button>
      </fieldset></form>
    </div>
  </dialog>;
}

export function TeamAccounts({resourceView=false,isDemo=false}) {
  const manager=useRef(null),[visible,setVisible]=useState(false),[open,setOpen]=useState(false);
  useEffect(()=>{if(resourceView||isDemo)return;let active=true;
    try{manager.current=createTeamManager();manager.current.load().then(()=>{if(active)setVisible(manager.current.state().allowed);},()=>{if(active)setVisible(false);});}catch{setVisible(false);}
    return ()=>{active=false;};
  },[resourceView,isDemo]);
  if(resourceView||isDemo||!visible)return null;
  return <><button type="button" className="outline" onClick={()=>setOpen(true)}>团队账号管理</button>
    {open&&<TeamDialog manager={manager.current} close={()=>setOpen(false)}/>}</>;
}
