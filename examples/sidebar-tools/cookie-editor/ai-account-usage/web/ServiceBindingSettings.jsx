import React,{useEffect,useState} from 'react';
import {createPolicyApi,createPolicyLedger,refreshArchivedPolicy} from './service-binding-api.mjs';
const api=createPolicyApi();
const label=status=>({ACCEPTED:'设备已接受',PENDING:'等待本机审阅',PAUSED:'本机已暂停'}[status]??'未知');
function PolicyDevice({device:initialDevice,readOnly,reload}) {
  const [device,setDevice]=useState(initialDevice);
  const key='od-desired-pending:'+device.deviceId;
  const ledger=createPolicyLedger(sessionStorage,key);
  const [record,setRecord]=useState(()=>{try{return ledger.read();}catch{return {blocked:true,pending:null,archived:[],needsRevisionRead:true};}});
  const pending=record.pending;
  const [archiveConfirmed,setArchiveConfirmed]=useState(false);
  const [selected,setSelected]=useState(device.desired?.scope.bindingIds??[]);
  const [days,setDays]=useState(device.desired?.scope.retentionDays??7);
  const [category,setCategory]=useState(device.desired?.scope.dataCategories.includes('USAGE_SUMMARY')?'USAGE_SUMMARY':'ACCOUNT_METADATA');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{setDevice(initialDevice);setSelected(initialDevice.desired?.scope.bindingIds??[]);
    setDays(initialDevice.desired?.scope.retentionDays??7);
    setCategory(initialDevice.desired?.scope.dataCategories.includes('USAGE_SUMMARY')?'USAGE_SUMMARY':'ACCOUNT_METADATA');
  },[initialDevice]);
  async function save(event){event.preventDefault();if(busy||pending||readOnly||record.blocked||record.needsRevisionRead)return;
    const change={deviceId:device.deviceId,operationId:crypto.randomUUID(),expectedRevision:device.desired?.desiredRevision??0,
      scope:{bindingIds:selected,dataCategories:[category],trigger:'MANUAL',retentionDays:Number(days)}};
    try{setRecord(ledger.savePending(change));}catch{setMessage('无法保留操作记录，未发送保存请求。');return;}
    setBusy(true);setMessage('');
    try{await api.save(change);setRecord(ledger.clearPending(change.operationId));setMessage('期望策略已保存；等待本机独立审阅。');await reload();}
    catch(error){if(error.code==='SAVE_REJECTED'){setRecord(ledger.clearPending(change.operationId));}setMessage(error.message);}
    finally{setBusy(false);}
  }
  async function reconcile(){if(busy||!pending||pending.blocked)return;setBusy(true);
    try{const receipt=await api.reconcile(pending);if(receipt.status!=='CONFIRMED'||receipt.operationId!==pending.operationId)throw Error('结果尚未确认。');
      setRecord(ledger.clearPending(pending.operationId));setMessage('已确认原保存操作；设备接受状态单独显示。');await reload();}
    catch{setMessage('原操作仍未知；可继续查询，或明确留档后重新读取当前策略。');}finally{setBusy(false);}
  }
  async function readCurrent(){if(busy||readOnly)return;setBusy(true);
    try{const current=await refreshArchivedPolicy({ledger,api,deviceId:device.deviceId});
      setDevice(current);setSelected(current.desired?.scope.bindingIds??[]);setDays(current.desired?.scope.retentionDays??7);
      setCategory(current.desired?.scope.dataCategories.includes('USAGE_SUMMARY')?'USAGE_SUMMARY':'ACCOUNT_METADATA');
      setRecord(ledger.read());setMessage('已读取当前版本；请重新审阅范围，再手动保存独立新操作。原留档操作结果仍未知。');
    }catch{setMessage('未能读取当前有效版本；旧操作已留档但结果仍未知，新保存保持禁用。');}
    finally{setBusy(false);}
  }
  async function archive(){if(busy||readOnly||!archiveConfirmed||!pending)return;
    try{setRecord(ledger.archiveUnknown(archiveConfirmed));setArchiveConfirmed(false);}
    catch{setMessage('留档未保存；原未知操作仍保留，未发送任何保存请求。');return;}
    await readCurrent();
  }
  return <section className="drawer-section" aria-label={device.label??device.deviceId}>
    <h3>{device.label??'连接设备'}</h3>
    <p>{device.revoked?'设备已撤销':label(device.status)} · 授权代际 {device.authEpoch}</p>
    <dl className="secondary"><dt>设备</dt><dd>{device.deviceId}</dd>
      <dt>期望策略</dt><dd>版本 {device.desired?.desiredRevision??0} · {device.desired?.desiredHash??'未设置'}</dd>
      <dt>设备已接受</dt><dd>{device.acceptance?`版本 ${device.acceptance.desiredRevision} · ${device.acceptance.desiredHash}`:'尚未接受'}</dd></dl>
    {device.bindings?.map(binding=><p key={binding.bindingId}>{binding.localAccount.origin} · {binding.localAccount.alias} → {binding.remoteAccountId} · 手动关联，尚未验证同一登录身份</p>)}
    {!readOnly&&!device.revoked&&<form onSubmit={save}>
      <fieldset disabled={busy||!!pending||record.blocked||record.needsRevisionRead}><legend>期望范围（仅状态，不传输 Cookie）</legend>
        {(device.bindings??[]).map(binding=><label key={binding.bindingId} style={{display:'block'}}>
          <input type="checkbox" checked={selected.includes(binding.bindingId)} onChange={e=>setSelected(old=>e.target.checked?[...old,binding.bindingId]:old.filter(x=>x!==binding.bindingId))}/>
          {binding.localAccount.alias} → {binding.remoteAccountId}</label>)}
        <label>数据类别 <select value={category} onChange={e=>setCategory(e.target.value)}><option value="ACCOUNT_METADATA">账号元数据</option><option value="USAGE_SUMMARY">额度摘要</option></select></label>{' '}
        <label>留存天数 <input type="number" min="1" max="30" required value={days} onChange={e=>setDays(e.target.value)}/></label>
        <p>触发方式：手动。Cookie 备份、上传、服务端处理尚未提供。</p>
        <button type="submit" className="outline">保存期望策略</button>
      </fieldset>
    </form>}
    {record.blocked&&<p role="status">本页操作记录无法读取，不能发送新保存请求。</p>}
    {pending&&<div><p role="status">保存结果待确认 · {pending.operationId}</p>
      <button type="button" className="outline" disabled={busy} onClick={reconcile}>查询原操作结果</button>
      {!readOnly&&<div><p>留档不代表原操作失败或未保存。原 operationId 和完整请求将保留；只会 GET 读取当前版本，不会重传。之后必须重新审阅并手动保存独立新操作。</p>
        <label><input type="checkbox" checked={archiveConfirmed} disabled={busy} onChange={e=>setArchiveConfirmed(e.target.checked)}/>我已理解原操作仍可能已保存，并确认留档。</label>{' '}
        <button type="button" className="outline" disabled={busy||!archiveConfirmed} onClick={archive}>留档未知操作并读取当前版本</button></div>}
    </div>}
    {record.needsRevisionRead&&!record.blocked&&!pending&&!readOnly&&<button type="button" className="outline" disabled={busy} onClick={readCurrent}>读取当前版本以重新审阅</button>}
    {!!record.archived.length&&<details><summary>已留档未知操作（{record.archived.length}）</summary>
      {record.archived.map(row=><div key={row.operationId}><p>{row.operationId} · archived · 留档不代表失败或未保存</p>
        <pre>{JSON.stringify(row.payload,null,2)}</pre>
        <button type="button" className="outline" disabled={busy} onClick={async()=>{setBusy(true);
          try{const receipt=await api.reconcile(row.payload);setMessage(receipt.status==='CONFIRMED'&&receipt.operationId===row.operationId?'已查到该留档操作回执；留档记录继续保留，未重传。':'该留档操作仍未知。');}
          catch{setMessage('该留档操作仍未知，未重传。');}finally{setBusy(false);}}}>查询留档操作结果</button></div>)}
    </details>}
    {message&&<p role="status">{message}</p>}
  </section>;
}
export function ServiceBindingSettings(){
  const [data,setData]=useState(null),[error,setError]=useState('');
  async function load(){try{setData(await api.devices());setError('');}catch(e){setError(e.message);}}
  useEffect(()=>{void load();},[]);
  return <section className="drawer-section" aria-labelledby="cookie-sync-title">
    <div className="drawer-controls"><h2 id="cookie-sync-title">Cookie 同步设置</h2><button className="outline" type="button" onClick={load}>重新读取状态</button></div>
    <p>后台保存只产生期望策略，不代表设备已批准。接受、暂停、恢复和撤销必须由可信本机操作；本页不会读取、上传 Cookie 或刷新上游额度。</p>
    {error&&<p role="alert">{error}</p>}
    {!data&&!error&&<p role="status">正在读取设备状态…</p>}
    {data?.devices.length===0&&<p>尚无已认证的连接设备。Native 秘密通道未接入时，请保留此未连接状态。</p>}
    {data?.devices.map(d=><PolicyDevice key={d.deviceId+':'+(d.desired?.desiredRevision??0)} device={d} readOnly={data.readOnly} reload={load}/>)}
  </section>;
}
