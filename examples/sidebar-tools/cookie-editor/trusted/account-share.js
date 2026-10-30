// Fixed first-party SW only. Uses the existing Relay; no Cookie/key RPC.
// Manager secrets and durable unknown-effect fences never leave Foundation.
const KEY='opendesk.cookie-editor.share.v1';
const ID=/^[A-Za-z0-9_-]{22,80}$/;
const fail=code=>Object.assign(new Error(code),{code});
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const same=(a,b)=>a===b||Boolean(a&&b&&typeof a==='object'&&typeof b==='object'&&
  Array.isArray(a)===Array.isArray(b)&&Object.keys(a).length===Object.keys(b).length&&
  Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k])));
export const COOKIE_SHARE_STORAGE_KEY=KEY;
export function cookieShareAddress(value,{invitation=false}={}){
  if(typeof value!=='string'||value.length>2048||value!==value.trim())throw fail('E_SHARE_URL');
  let url;try{url=new URL(value);}catch{throw fail('E_SHARE_URL');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)
    throw fail('E_SHARE_HTTPS_REQUIRED');
  const match=/^\/i\/([A-Za-z0-9_-]{22,80})$/.exec(url.pathname);
  if(invitation?!match:![url.origin,url.origin+'/'].includes(value))throw fail('E_SHARE_URL');
  return {origin:url.origin,...(invitation?{id:match[1],url:url.origin+'/i/'+match[1]}:{})};
}
function metadata(row){
  if(!object(row)||!ID.test(row.id)||!['configuration','session'].includes(row.mode)||
    typeof row.displayName!=='string'||!row.displayName.trim()||row.displayName.length>64||
    typeof row.description!=='string'||row.description.length>120||
    /[\x00-\x1f\x7f]/.test(row.displayName+row.description)||
    !Number.isSafeInteger(row.expiresAt)||row.expiresAt<=0||
    !Number.isSafeInteger(row.remainingClaims)||row.remainingClaims<0||row.remainingClaims>10||
    typeof row.revoked!=='boolean')throw fail('E_SHARE_RESPONSE');
  if(typeof row.origin!=='string'||row.origin.length>320)throw fail('E_SHARE_RESPONSE');
  let site;try{site=new URL(row.origin);}catch{throw fail('E_SHARE_RESPONSE');}
  if(!['https:','http:'].includes(site.protocol)||site.origin!==row.origin||
    site.username||site.password)throw fail('E_SHARE_RESPONSE');
  return {id:row.id,origin:site.origin,displayName:row.displayName.trim(),
    description:row.description,mode:row.mode,expiresAt:row.expiresAt,
    remainingClaims:row.remainingClaims,revoked:row.revoked};
}
const view=row=>({ref:row.ref,url:row.url,phase:row.phase,...(row.invite?{invite:metadata(row.invite)}:{})});
export function createCookieAccountShare({api,storage,vault,authorize,fetcher=(...a)=>fetch(...a)}){
  async function store(){
    const service=await storage?.();
    if(!service?.transaction||service.readOnly)throw fail('E_ACCOUNT_STORAGE_UNAVAILABLE');
    return service;
  }
  async function read(){
    const service=await store();
    const row=await service.transaction(['frameworkKV'],'readonly',tx=>tx.get('frameworkKV',KEY));
    if(row===undefined)return {format:1,items:[],claims:[]};
    if(row.format!==1||!Array.isArray(row.items)||!Array.isArray(row.claims)||
      row.items.length>32||row.claims.length>48)throw fail('E_SHARE_STORAGE');
    return row;
  }
  async function change(work){
    await authorize();
    const service=await store();let attempted=false;
    try{
      const result=await service.transaction(['frameworkKV'],'readwrite',async tx=>{
        const row=await tx.get('frameworkKV',KEY)??{format:1,items:[],claims:[]};
        if(row.format!==1||!Array.isArray(row.items)||!Array.isArray(row.claims))throw fail('E_SHARE_STORAGE');
        const result=work(row);attempted=true;await tx.put('frameworkKV',row,KEY);return result;
      });
      // Independent durable receipt read; never retry an uncertain commit.
      const row=await read();
      if(!row.items.some(x=>same(x,result))&&!row.claims.some(x=>same(x,result)))
        throw fail('E_OUTCOME_UNKNOWN');
      await authorize();return result;
    }catch(error){if(attempted)throw fail('E_OUTCOME_UNKNOWN');throw error;}
  }
  async function request(origin,path,{body,secret}={}){
    await authorize();
    if(await api.permissions.contains({origins:[origin+'/*']})!==true)
      throw fail('E_SHARE_PERMISSION_REQUIRED');
    let response;
    try{
      response=await fetcher(origin+path,{method:body===undefined?'GET':'POST',
        credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',
        signal:AbortSignal.timeout(12000),headers:{'content-type':'application/json',
          ...(secret?{'x-opendesk-invite-manager':secret}:{})},
        ...(body===undefined?{}:{body:JSON.stringify(body)})});
    }catch{throw fail(body===undefined?'E_SHARE_NETWORK':'E_OUTCOME_UNKNOWN');}
    if(response.redirected||response.url&&response.url!==origin+path)throw fail('E_SHARE_RESPONSE');
    const reader=response.body?.getReader();let text='';
    try{
      if(!reader)throw fail('E_SHARE_RESPONSE');
      const decode=new TextDecoder('utf-8',{fatal:true});let bytes=0;
      for(;;){const part=await reader.read();if(part.done)break;
        bytes+=part.value.length;if(bytes>16384){await reader.cancel();throw fail('E_SHARE_RESPONSE');}
        text+=decode.decode(part.value,{stream:true});}
      text+=decode.decode();
    }catch{throw fail(body===undefined?'E_SHARE_RESPONSE':'E_OUTCOME_UNKNOWN');}
    let value;try{value=JSON.parse(text);}catch{
      throw fail(body===undefined?'E_SHARE_RESPONSE':'E_OUTCOME_UNKNOWN');}
    if(!response.ok){
      const code=value?.error?.code;
      if(['E_INVITE_EXPIRED','E_INVITE_REVOKED','E_INVITE_CONSUMED','E_INVITE_NOT_FOUND',
        'E_MANAGE_FORBIDDEN','E_LIMIT'].includes(code))throw fail(code);
      throw fail(body===undefined?'E_SHARE_RESPONSE':'E_OUTCOME_UNKNOWN');
    }
    await authorize();
    if(await api.permissions.contains({origins:[origin+'/*']})!==true)
      throw fail(body===undefined?'E_SHARE_PERMISSION_REQUIRED':'E_OUTCOME_UNKNOWN');
    return value;
  }
  async function dispatch(action,payload,owner){
    await authorize();
    if(action==='shareList'){
      const state=await read();await authorize();
      return {invitations:state.items.filter(x=>x.owner===owner&&x.alias===payload.alias&&
        x.siteOrigin===payload.origin&&x.invite).map(view)};
    }
    if(action==='shareCreate'){
      const {origin:relay}=cookieShareAddress(payload.relayOrigin);
      if(payload.mode!=='configuration')throw fail('E_SHARE_DEVICE_KEY_STORAGE_REQUIRED');
      if(!Number.isSafeInteger(payload.expiresInSeconds)||payload.expiresInSeconds<300||
        payload.expiresInSeconds>604800||!Number.isSafeInteger(payload.maxClaims)||
        payload.maxClaims<1||payload.maxClaims>10)throw fail('E_SHARE_LIMIT');
      const data=await vault.read();
      if(data.revision!==payload.revision)throw fail('E_VAULT_CONFLICT');
      const account=data.accounts.find(a=>a.alias===payload.alias&&a.origin===payload.origin);
      if(!account||account.version!==payload.accountVersion)throw fail('E_VAULT_CONFLICT');
      if(await api.permissions.contains({origins:[relay+'/*']})!==true)throw fail('E_SHARE_PERMISSION_REQUIRED');
      const ref=crypto.randomUUID();
      await change(state=>{
        if(state.items.length>=32)throw fail('E_SHARE_LIMIT');
        const row={ref,owner,relay,alias:account.alias,siteOrigin:account.origin,
          url:'',phase:'creating'};state.items.push(row);return row;
      });
      const result=await request(relay,'/v1/invites',{body:{origin:account.origin,
        displayName:account.displayName,description:account.description??'',mode:'configuration',
        expiresInSeconds:payload.expiresInSeconds,maxClaims:payload.maxClaims}});
      let invite;try{invite=metadata(result.invite);}catch{throw fail('E_OUTCOME_UNKNOWN');}
      if(invite.origin!==account.origin||invite.mode!=='configuration'||
        !ID.test(result.managerSecret)||result.url!==relay+'/i/'+invite.id)
        throw fail('E_OUTCOME_UNKNOWN');
      return view(await change(state=>{
        const row=state.items.find(x=>x.ref===ref&&x.owner===owner&&x.phase==='creating');
        if(!row)throw fail('E_OUTCOME_UNKNOWN');
        Object.assign(row,{url:result.url,id:invite.id,managerSecret:result.managerSecret,invite,phase:'active'});
        return row;
      }));
    }
    if(action==='shareStatus'||action==='shareRevoke'){
      const row=(await read()).items.find(x=>x.ref===payload.ref&&x.owner===owner);
      if(!row?.id||!ID.test(row.id)||!ID.test(row.managerSecret))throw fail('E_SHARE_NOT_FOUND');
      if(row.siteOrigin!==payload.origin)throw fail('E_SITE_MISMATCH');
      if(action==='shareRevoke'){
        if(row.phase==='revoked')return view(row);
        if(row.phase!=='active')throw fail('E_OUTCOME_UNKNOWN');
        await change(state=>Object.assign(state.items.find(x=>x.ref===row.ref),{phase:'revoking'}));
        const result=await request(row.relay,'/v1/invites/'+row.id+'/revoke',{
          body:{},secret:row.managerSecret});
        if(result.status!=='revoked')throw fail('E_OUTCOME_UNKNOWN');
        return view(await change(state=>Object.assign(state.items.find(x=>x.ref===row.ref),{
          phase:'revoked',invite:{...row.invite,revoked:true}})));
      }
      let invite,phase='active';
      try{invite=metadata(await request(row.relay,'/v1/invites/'+row.id));
        if(invite.id!==row.id||invite.origin!==row.invite.origin)throw fail('E_SHARE_RESPONSE');
        if(invite.remainingClaims===0)phase='consumed';
      }catch(error){
        const phases={E_INVITE_EXPIRED:'expired',E_INVITE_REVOKED:'revoked'};
        if(!phases[error.code])throw error;phase=phases[error.code];invite=row.invite;
      }
      return view(await change(state=>Object.assign(state.items.find(x=>x.ref===row.ref),{phase,invite})));
    }
    const address=cookieShareAddress(payload.inviteUrl,{invitation:true});
    if(action==='shareInspect'){
      const prior=(await read()).claims.find(x=>x.url===address.url&&x.owner===owner);
      if(prior){
        // Remote availability cannot settle an earlier local claim. Reopen
        // from the durable receipt, preserving unknown-effect fences.
        if(!['received','applied'].includes(prior.phase))throw fail('E_OUTCOME_UNKNOWN');
        const invite=metadata(prior.invite),applied=prior.phase==='applied';
        if(applied){
          const current=await vault.read();
          if(!current.accounts.some(a=>a.alias===prior.alias&&a.origin===invite.origin))
            throw fail('E_ACCOUNT_NOT_FOUND');
        }
        await authorize();
        return {url:address.url,invite,localSavePending:!applied,
          configurationImported:applied,cookieWriteVerified:false,websiteLoginConfirmed:false,
          sessionAvailable:false,sessionBlocker:'E_SHARE_DEVICE_KEY_STORAGE_REQUIRED'};
      }
      const invite=metadata(await request(address.origin,'/v1/invites/'+address.id));
      if(invite.id!==address.id)throw fail('E_SHARE_RESPONSE');
      return {url:address.url,invite,sessionAvailable:false,
        sessionBlocker:'E_SHARE_DEVICE_KEY_STORAGE_REQUIRED'};
    }
    if(action!=='shareClaim')throw fail('E_ACCOUNT_REQUEST');
    let prior=(await read()).claims.find(x=>x.url===address.url&&x.owner===owner);
    if(prior?.phase==='applied'){
      if(prior.invite.origin!==payload.origin)throw fail('E_SITE_MISMATCH');
      const current=await vault.read();
      if(!current.accounts.some(a=>a.alias===prior.alias&&a.origin===payload.origin))
        throw fail('E_ACCOUNT_NOT_FOUND');
      await authorize();
      return {status:'configuration_imported',alias:prior.alias,...await vault.status(),
        cookieWriteVerified:false,websiteLoginConfirmed:false};
    }
    if(prior&&prior.phase!=='received')throw fail('E_OUTCOME_UNKNOWN');
    const before=await vault.read();
    if(before.revision!==payload.revision)throw fail('E_VAULT_CONFLICT');
    if(before.accounts.length>=48&&!before.accounts.some(a=>a.alias===prior?.alias))
      throw fail('E_SHARE_LIMIT');
    if(!prior){
      const invite=metadata(await request(address.origin,'/v1/invites/'+address.id));
      if(invite.id!==address.id||invite.origin!==payload.origin)throw fail('E_SITE_MISMATCH');
      if(invite.mode!=='configuration')throw fail('E_SHARE_DEVICE_KEY_STORAGE_REQUIRED');
      if(invite.expiresAt<=Date.now()||invite.remainingClaims<1)throw fail('E_INVITE_CONSUMED');
      prior=await change(state=>{
        if(state.claims.length>=48)throw fail('E_SHARE_LIMIT');
        const row={ref:crypto.randomUUID(),owner,url:address.url,phase:'claiming',
          alias:'acct_'+crypto.randomUUID().replaceAll('-','').slice(0,20)};
        state.claims.push(row);return row;
      });
      const result=await request(address.origin,'/v1/invites/'+address.id+'/claim',{body:{}});
      let received;try{received=metadata(result.account);}catch{throw fail('E_OUTCOME_UNKNOWN');}
      if(result.status!=='configuration_claimed'||received.id!==invite.id||
        received.origin!==invite.origin||received.mode!=='configuration'||
        received.displayName!==invite.displayName||received.description!==invite.description)
        throw fail('E_OUTCOME_UNKNOWN');
      prior=await change(state=>Object.assign(state.claims.find(x=>x.ref===prior.ref),{
        phase:'received',invite:received}));
    }
    if(prior.invite.origin!==payload.origin)throw fail('E_SITE_MISMATCH');
    await authorize();
    await vault.update(payload.revision,async data=>{
      await authorize();
      if(data.accounts.some(x=>x.alias===prior.alias))return;
      if(data.accounts.length>=48)throw fail('E_SHARE_LIMIT');
      const used=new Set(data.accounts.filter(a=>a.origin===payload.origin).map(a=>a.displayName));
      let name=prior.invite.displayName;
      for(let n=2;used.has(name);n++)name=prior.invite.displayName.slice(0,52)+'（领取 '+n+'）';
      data.accounts.push({alias:prior.alias,origin:payload.origin,displayName:name,
        description:prior.invite.description,cookies:[],version:1,allowAuto:false});
    });
    await change(state=>Object.assign(state.claims.find(x=>x.ref===prior.ref),{phase:'applied'}));
    return {status:'configuration_imported',alias:prior.alias,...await vault.status(),
      cookieWriteVerified:false,websiteLoginConfirmed:false};
  }
  return {dispatch,async clear(){
    const service=await store();
    await service.transaction(['frameworkKV'],'readwrite',tx=>tx.delete('frameworkKV',KEY));
    if(await service.transaction(['frameworkKV'],'readonly',tx=>tx.get('frameworkKV',KEY))!==undefined)
      throw fail('E_OUTCOME_UNKNOWN');
  }};
}
