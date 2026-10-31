// Browser session only: no device credential, cookie snapshot or upstream request.
const unknown=()=>Object.assign(new Error('保存结果未知；请查询原操作，勿重复保存。'),{code:'RESULT_UNKNOWN'});
export async function initializeManagementOpen({location=globalThis.location,history=globalThis.history,fetcher=globalThis.fetch}={}) {
  const code=new URLSearchParams(location.hash.slice(1)).get('open');
  if(!code)return;
  history.replaceState(null,'',location.pathname+location.search);
  const response=await fetcher('/opendesk/open-session',{method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({code})});
  if(!response.ok)throw Error('管理页打开上下文已失效；请回到 Cookie Editor 重新打开。');
  const data=await response.json();
  if(data.path!==location.pathname+location.search)throw Error('管理资源不匹配。');
}
export function createPolicyApi(fetcher=globalThis.fetch) {
  const options={credentials:'same-origin',cache:'no-store',redirect:'error'};
  return {
    async devices(){const response=await fetcher('/opendesk/admin/api/devices',{...options,method:'GET'});
      if(!response.ok)throw Error('无法读取连接设备；请核实本机管理会话。');
      const data=await response.json();if(!Array.isArray(data.devices))throw Error('设备列表格式无效。');return data;},
    async save(change){let response;
      try{response=await fetcher('/opendesk/admin/api/sync-policy',{...options,method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(change)});}
      catch{throw unknown();}
      if(!response.ok){
        if(response.status>=500)throw unknown();
        throw Object.assign(Error(response.status===409?'期望策略已变化；请重新读取后审阅。':'策略未保存；请核实会话和范围。'),{code:'SAVE_REJECTED'});
      }
      try{return await response.json();}catch{throw unknown();}
    },
    async reconcile({operationId,deviceId}){
      const response=await fetcher(`/opendesk/admin/api/operations/${encodeURIComponent(operationId)}?device=${encodeURIComponent(deviceId)}`,{...options,method:'GET'});
      if(!response.ok)throw unknown();return response.json();
    }
  };
}

// Same sessionStorage key as the original pending record. Archiving is a local,
// atomic ledger replacement, never evidence that the server rejected a request.
export function createPolicyLedger(storage,key) {
  const empty=()=>({schemaVersion:1,pending:null,archived:[],needsRevisionRead:false});
  function read(){
    const raw=storage.getItem(key);if(raw===null)return empty();
    const value=JSON.parse(raw);
    const payload=v=>v&&typeof v.operationId==='string'&&typeof v.deviceId==='string'&&Number.isSafeInteger(v.expectedRevision)&&v.expectedRevision>=0&&v.scope&&typeof v.scope==='object';
    if(payload(value))return {...empty(),pending:value}; // Preserve legacy pending payload verbatim.
    if(value?.schemaVersion!==1||!Array.isArray(value.archived)||typeof value.needsRevisionRead!=='boolean'||
      (value.pending!==null&&!payload(value.pending))||value.archived.some(row=>row?.status!=='archived'||!payload(row.payload)||row.operationId!==row.payload.operationId))throw Error('LEDGER_INVALID');
    return value;
  }
  const write=value=>{storage.setItem(key,JSON.stringify(value));return value;};
  return {
    read,
    savePending(change){const state=read();if(state.needsRevisionRead)throw Error('REVISION_READ_REQUIRED');
      if(state.pending)throw Error('PENDING_OPERATION');
      if(state.archived.some(row=>row.operationId===change.operationId))throw Error('ARCHIVED_OPERATION');
      return write({...state,pending:change});},
    clearPending(operationId){const state=read();if(state.pending?.operationId!==operationId)throw Error('OPERATION_CHANGED');return write({...state,pending:null});},
    archiveUnknown(confirmed){if(confirmed!==true)throw Error('CONFIRMATION_REQUIRED');const state=read();
      if(!state.pending)throw Error('PENDING_REQUIRED');
      return write({...state,pending:null,needsRevisionRead:true,archived:[...state.archived,
        {status:'archived',operationId:state.pending.operationId,payload:state.pending,archivedAt:new Date().toISOString()}]});},
    revisionReadComplete(){const state=read();if(state.pending)throw Error('PENDING_OPERATION');return write({...state,needsRevisionRead:false});}
  };
}
export async function refreshArchivedPolicy({ledger,api,deviceId}) {
  const data=await api.devices(); // GET only. No receipt replay or save.
  if(!Array.isArray(data.devices))throw Error('REVISION_READ_REQUIRED');
  const matches=data.devices.filter(d=>d.deviceId===deviceId),device=matches[0],desired=device?.desired;
  if(data.readOnly!==false||matches.length!==1||device.revoked||
    (desired!==null&&desired!==undefined&&(!Number.isSafeInteger(desired.desiredRevision)||desired.desiredRevision<1||
      typeof desired.desiredHash!=='string'||!/^[a-f0-9]{64}$/.test(desired.desiredHash)||
      !Array.isArray(desired.scope?.bindingIds)||!Array.isArray(desired.scope?.dataCategories)||
      !Number.isInteger(desired.scope?.retentionDays)||desired.scope.retentionDays<1||desired.scope.retentionDays>30)))throw Error('REVISION_READ_REQUIRED');
  ledger.revisionReadComplete();return device;
}
