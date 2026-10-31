// Fixed Cookie Editor metadata only. No transport, credentials, Cookie capture,
// service probing or background work is provided by a saved configuration.
export const COOKIE_SERVICE_CONNECTIONS_KEY='opendesk.cookie-editor.service-connections.v1';
import {COOKIE_SERVICE_FIELDS,COOKIE_SERVICE_NATIVE_OPERATIONS} from './account-contract.js';
const fail=code=>Object.assign(Error(code),{code});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&
  keys.every(key=>Object.hasOwn(value,key));
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const text=(value,max=80)=>typeof value==='string'&&value.trim()===value&&
  value.length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value);
const id=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{2,79}$/.test(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const empty=()=>({format:1,revision:0,connections:[],associations:[]});
function site(value){
  try{const url=new URL(value);
    if(!['https:','http:'].includes(url.protocol)||url.origin!==value||url.username||url.password)throw Error();
    return value;
  }catch{throw fail('E_SERVICE_INPUT');}
}
function serviceOrigin(mode,value){
  if(mode==='local'&&value==='')return '';
  if(mode!=='company'||typeof value!=='string'||value.length>320)throw fail('E_SERVICE_INPUT');
  try{
    const url=new URL(value),host=url.hostname;
    // This is configuration validation, NOT DNS/SSRF authorization. A future
    // connector must validate and pin every resolved address before connecting.
    if(url.protocol!=='https:'||url.origin!==value||url.username||url.password||
      host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
      host.startsWith('[')||/^\d+(?:\.\d+){3}$/.test(host)||!host.includes('.'))throw Error();
    return value;
  }catch{throw fail('E_SERVICE_INPUT');}
}
function validate(value){
  if(!exact(value,['format','revision','connections','associations'])||value.format!==1||
    !integer(value.revision)||!Array.isArray(value.connections)||value.connections.length>16||
    !Array.isArray(value.associations)||value.associations.length>128||JSON.stringify(value).length>65536)
    throw fail('E_SERVICE_STORE');
  const seen=new Set();
  for(const row of value.connections){
    if(!exact(row,['id','label','mode','origin','epoch','disconnected','packageHash','installEpoch'])||
      !id(row.id)||seen.has(row.id)||!text(row.label,64)||!integer(row.epoch)||row.epoch<1||
      typeof row.disconnected!=='boolean'||!text(row.packageHash,80)||!text(row.installEpoch,160))
      throw fail('E_SERVICE_STORE');
    try{serviceOrigin(row.mode,row.origin);}catch{throw fail('E_SERVICE_STORE');}
    seen.add(row.id);
  }
  const associations=new Set();
  for(const row of value.associations){
    if(!exact(row,['id','connectionId','connectionEpoch','localAlias','localOrigin','accountVersion',
      'remoteAccountId','organization','providerKey','verification'])||!id(row.id)||associations.has(row.id)||
      !seen.has(row.connectionId)||!integer(row.connectionEpoch)||!id(row.localAlias)||
      !integer(row.accountVersion)||!id(row.remoteAccountId)||!text(row.organization)||
      !id(row.providerKey)||row.verification!=='UNVERIFIED')throw fail('E_SERVICE_STORE');
    try{site(row.localOrigin);}catch{throw fail('E_SERVICE_STORE');}
    associations.add(row.id);
  }
  return value;
}
function present(value,{identity,accounts,origin}){
  const connections=value.connections.map(row=>{
    const invalid=row.packageHash!==identity.packageHash||row.installEpoch!==identity.installEpoch;
    return {id:row.id,label:row.label,mode:row.mode,origin:row.origin,epoch:row.epoch,
      status:invalid?'INVALIDATED':row.disconnected?'DISCONNECTED':'UNCONNECTED',
      reasonCode:invalid?'E_TOOL_CHANGED':'E_SERVICE_BRIDGE_UNAVAILABLE'};
  });
  return {revision:value.revision,connections,
    associations:value.associations.filter(row=>row.localOrigin===origin).map(row=>{
      const connection=connections.find(item=>item.id===row.connectionId);
      const account=accounts.find(item=>item.alias===row.localAlias&&item.origin===origin);
      return {...row,status:connection.status==='INVALIDATED'?'INVALIDATED':
        connection.status==='DISCONNECTED'||connection.epoch!==row.connectionEpoch?'DISCONNECTED':
          !account||account.version!==row.accountVersion?'STALE':'PENDING_CONNECTION',
        remoteRevocation:'NOT_REQUIRED'}; // No remote grant was ever created.
    }),
    capabilities:{connect:false,openManagement:false,policyAcceptance:false}};
}
export function createCookieServiceConnections({storage}={}){
  async function service(){
    try{const value=await storage?.();
      if(value?.readOnly===true||typeof value?.transaction!=='function')throw Error();
      return value;
    }catch{throw fail('E_ACCOUNT_STORAGE_UNAVAILABLE');}
  }
  async function read(db){
    try{return validate(await db.transaction(['frameworkKV'],'readonly',async tx=>{
      const raw=await tx.get('frameworkKV',COOKIE_SERVICE_CONNECTIONS_KEY);
      return raw===undefined?empty():raw;
    }));
    }catch(error){if(error?.code==='E_SERVICE_STORE')throw error;throw fail('E_ACCOUNT_STORAGE_UNAVAILABLE');}
  }
  return Object.freeze({
    async dispatch({operation,payload,identity,accounts=[],assertCurrent=async()=>{}}){
      if(COOKIE_SERVICE_NATIVE_OPERATIONS.includes(operation))throw fail('E_SERVICE_BRIDGE_UNAVAILABLE');
      const fields=COOKIE_SERVICE_FIELDS[operation];
      if(!fields||!exact(payload,['origin',...fields])||!object(identity)||
        !text(identity.packageHash,80)||!text(identity.installEpoch,160))throw fail('E_SERVICE_INPUT');
      const origin=site(payload.origin),context={identity,accounts,origin},db=await service();
      if(operation==='serviceStatus'){
        const value=await read(db);await assertCurrent();return present(value,context);
      }
      if(!integer(payload.revision))throw fail('E_SERVICE_INPUT');
      // Fully validate untrusted input before starting the mutation transaction.
      if(operation==='serviceSave'){
        if(!text(payload.label,64))throw fail('E_SERVICE_INPUT');
        serviceOrigin(payload.mode,payload.serviceOrigin);
      }
      if(operation==='serviceRename'&&!text(payload.label,64))throw fail('E_SERVICE_INPUT');
      if(operation==='serviceAssociate'&&(!id(payload.alias)||!integer(payload.accountVersion)||
        !id(payload.remoteAccountId)||!text(payload.organization)||!id(payload.providerKey)))
        throw fail('E_SERVICE_INPUT');
      let attempted=false,next;
      try{
        next=await db.transaction(['frameworkKV'],'readwrite',async tx=>{
          const raw=await tx.get('frameworkKV',COOKIE_SERVICE_CONNECTIONS_KEY);
          const value=validate(raw===undefined?empty():raw);
          if(value.revision!==payload.revision)throw fail('E_SERVICE_CONFLICT');
          if(operation==='serviceSave'){
            if(value.connections.length>=16)throw fail('E_SERVICE_LIMIT');
            // A duplicate does not reconnect or silently refresh an old epoch.
            if(value.connections.some(row=>row.mode===payload.mode&&row.origin===payload.serviceOrigin))
              throw fail('E_SERVICE_EXISTS');
            value.connections.push({id:'conn_'+crypto.randomUUID().replace(/-/g,''),
              label:payload.label,mode:payload.mode,origin:payload.serviceOrigin,epoch:1,
              disconnected:false,packageHash:identity.packageHash,installEpoch:identity.installEpoch});
          }else if(operation==='serviceRemoveAssociation'){
            const row=value.associations.find(item=>item.id===payload.associationId&&item.localOrigin===origin);
            if(!row)throw fail('E_SERVICE_NOT_FOUND');
            value.associations.splice(value.associations.indexOf(row),1);
          }else{
            const row=value.connections.find(item=>item.id===payload.connectionId);
            if(!row)throw fail('E_SERVICE_NOT_FOUND');
            if(operation==='serviceRename'){row.label=payload.label;}
            else if(operation==='serviceDisconnect'){row.disconnected=true;row.epoch++;}
            else{
              if(row.disconnected||row.packageHash!==identity.packageHash||row.installEpoch!==identity.installEpoch)
                throw fail('E_SERVICE_DISCONNECTED');
              const account=accounts.find(item=>item.alias===payload.alias&&item.origin===origin);
              if(!account)throw fail('E_ACCOUNT_NOT_FOUND');
              if(account.version!==payload.accountVersion)throw fail('E_VAULT_CONFLICT');
              if(value.associations.length>=128)throw fail('E_SERVICE_LIMIT');
              if(value.associations.some(item=>item.connectionId===row.id&&item.localAlias===account.alias))
                throw fail('E_SERVICE_EXISTS');
              value.associations.push({id:'assoc_'+crypto.randomUUID().replace(/-/g,''),
                connectionId:row.id,connectionEpoch:row.epoch,localAlias:account.alias,localOrigin:origin,
                accountVersion:account.version,remoteAccountId:payload.remoteAccountId,
                organization:payload.organization,providerKey:payload.providerKey,verification:'UNVERIFIED'});
            }
          }
          value.revision++;validate(value);await assertCurrent();attempted=true;
          await tx.put('frameworkKV',value,COOKIE_SERVICE_CONNECTIONS_KEY);return value;
        });
      }catch(error){if(attempted)throw fail('E_OUTCOME_UNKNOWN');
        if(error?.code)throw error;throw fail('E_ACCOUNT_STORAGE_UNAVAILABLE');}
      try{if(!same(await read(db),next))throw Error();await assertCurrent();}
      catch{throw fail('E_OUTCOME_UNKNOWN');}
      return present(next,context);
    },
    async clear(){const db=await service();
      await db.transaction(['frameworkKV'],'readwrite',tx=>tx.delete('frameworkKV',COOKIE_SERVICE_CONNECTIONS_KEY));
      if((await read(db)).revision!==0)throw fail('E_OUTCOME_UNKNOWN');
    }
  });
}
