// Pure display adapter for the existing fixed Sidebar Tool Host. This source
// is UI-only: no storage, Native client, Cookie authority or background import.
// It preserves the installed App's result shape; it does not grant operations.
export function presentCookieServiceState(facts){
  if(facts?.format!=='opendesk.cookie-service-facts.v1')
    throw Object.assign(Error('E_SERVICE_RESULT'),{code:'E_SERVICE_RESULT'});
  const native=Object.hasOwn(facts,'sessionRevision'),providers=facts.nativeServices??[];
  const base=new Map(facts.connections.map(c=>[c.id,!c.ownerCurrent?'INVALIDATED':
    c.disconnected?'DISCONNECTED':'UNCONNECTED']));
  const status=new Map();
  const connections=facts.connections.map(c=>{
    const {id,label,mode,origin,epoch,session:r}=c;
    let s=base.get(id);
    if(native&&r){
      if(!c.ownerCurrent||!r.ownerCurrent||!r.epochCurrent)s='INVALIDATED';
      else if(!r.live)s='SESSION_EXPIRED';
      else s=r.pending?'OUTCOME_UNKNOWN':r.status;
    }
    status.set(id,s);
    const reasonCode=s==='INVALIDATED'?'E_TOOL_CHANGED':native?
      s==='SESSION_EXPIRED'?'E_SERVICE_SESSION_EXPIRED':s==='OUTCOME_UNKNOWN'?'E_OUTCOME_UNKNOWN':
        s==='UNCONNECTED'&&!providers.length?'E_SERVICE_BRIDGE_UNAVAILABLE':'':'E_SERVICE_BRIDGE_UNAVAILABLE';
    const row={id,label,mode,origin,epoch,status:s,reasonCode};
    return native?{...row,canConnect:mode==='local'&&c.ownerCurrent&&providers.length>0&&
      (!r||r.ownerCurrent&&r.reconnectable),
      canOpenManagement:s==='CONNECTED'&&r.management,
      resources:s==='CONNECTED'?structuredClone(r.resources):[],
      policy:s==='CONNECTED'?structuredClone(r.policy):null,
      pending:r?.pending?structuredClone(r.pending):null}:row;
  });
  const associations=facts.associations.map(a=>{
    const {accountCurrent,binding,...row}=a,c=facts.connections.find(x=>x.id===a.connectionId);
    const local=base.get(c.id)==='INVALIDATED'?'INVALIDATED':
      base.get(c.id)==='DISCONNECTED'||c.epoch!==a.connectionEpoch?'DISCONNECTED':
        !accountCurrent?'STALE':'PENDING_CONNECTION';
    const s=status.get(c.id);
    return {...row,status:!native?local:!accountCurrent?'STALE':
      binding&&!binding.revoked&&s==='CONNECTED'?'BOUND':s==='CONNECTED'?'PENDING_CONNECTION':
        local==='STALE'?'STALE':s==='UNCONNECTED'?local:s,
      remoteRevocation:binding?binding.revoked?'CONFIRMED':'REQUIRED':'NOT_REQUIRED',
      ...(binding?{remoteBindingId:binding.id}:{}),verification:'UNVERIFIED'};
  });
  return {revision:facts.revision,connections,associations,
    capabilities:{connect:native&&providers.length>0,
      openManagement:native&&providers.some(p=>p.capabilities.includes('management:resource-open')),
      policyAcceptance:native&&providers.length>0},
    ...(native?{sessionRevision:facts.sessionRevision,nativeServices:structuredClone(providers)}:{}),
    ...(facts.opened===true?{opened:true}:{})};
}
