// Fixed Chrome CDP driver for a single authorized, foreground HTTP(S) document.
// The installed tool supplies configuration enums and opaque refs only. No CDP
// method, native tab ID, executable script, URL, or debugger target crosses RPC.
const REF=/^[A-Za-z0-9_-]{16,160}$/;
const fail=(code,message=code)=>Object.assign(new Error(message),{code});
const keys=['ua','uaCH','language','acceptLanguage','timezone','geolocation','viewport','publicIp'];
const source=key=>['acceptLanguage','publicIp'].includes(key)?'network':'page-runtime';
const display=value=>value===null||value===undefined?null:
  typeof value==='string'?value:JSON.stringify(value);
const same=(a,b)=>['tabId','windowId','documentId','url'].every(key=>a?.[key]===b?.[key]);
const ownerKey=o=>JSON.stringify([o?.toolId,o?.toolVersion,o?.packageHash,o?.epoch,o?.hostInstanceId,o?.toolInstance]);
const allowed=Object.freeze({
  ua:['native','windows','mac','linux'],
  lang:['system','zh-CN','en-US','de-DE','ja-JP'],
  tz:['system','Asia/Shanghai','America/New_York','Europe/Berlin','Asia/Tokyo'],
  geo:['off','nyc','berlin','tokyo'],
  viewport:['native','desktop','mobile']
});
function validateConfig(config){
  if(!config||typeof config!=='object'||Array.isArray(config)||
    Object.keys(config).sort().join(',')!==Object.keys(allowed).sort().join(',')||
    Object.keys(allowed).some(k=>!allowed[k].includes(config[k])))
    throw fail('E_SCHEMA','Unsupported fingerprint configuration');
  return Object.freeze({...config});
}
function readHintsInPage(){
  try{
    const data=navigator.userAgentData;
    if(!data||typeof data.platform!=='string')return null;
    const brands=Array.isArray(data.brands)?data.brands.slice(0,5).map(row=>({
      brand:String(row.brand).slice(0,50),version:String(row.version).slice(0,20)})):[];
    return {platform:data.platform.slice(0,64),brands};
  }catch{return null;}
}
function userAgentPlan(base,config){
  const ua=base?.fields?.userAgent?.value;
  if(typeof ua!=='string'||!ua)throw fail('E_BASELINE_UNAVAILABLE','Cannot read original User-Agent');
  const match=ua.match(/\b(?:Chrome|Chromium)\/(\d+\.\d+\.\d+\.\d+)/);
  if(!match)throw fail('E_UNSUPPORTED','Only a readable Chromium UA can be overridden safely');
  const version=match[1],major=version.split('.')[0];
  const platform={
    windows:['Windows NT 10.0; Win64; x64','Windows','Win32','10.0.0'],
    mac:['Macintosh; Intel Mac OS X 10_15_7','macOS','MacIntel','13.0.0'],
    linux:['X11; Linux x86_64','Linux','Linux x86_64','0.0.0']
  }[config.ua];
  const oldPlatform=base.hints?.platform||'';
  const resolved=platform??[null,oldPlatform,'', ''];
  const targetUa=platform
    ?'Mozilla/5.0 ('+platform[0]+') AppleWebKit/537.36 (KHTML, like Gecko) Chrome/'+version+' Safari/537.36'
    :ua;
  const brands=base.hints?.brands?.length?base.hints.brands:
    [{brand:'Chromium',version:major}];
  const metadata={brands,fullVersionList:brands.map(row=>({
    brand:row.brand,version:row.version===major?version:row.version})),
    platform:resolved[1],platformVersion:resolved[3],architecture:'x86',
    model:'',mobile:false,bitness:'64',wow64:false};
  // If UA is native, preserve the actual browser brand/platform metadata.
  if(config.ua==='native'&&!base.hints)return {ua:targetUa,metadata:null,platform:oldPlatform};
  return {ua:targetUa,metadata,platform:resolved[1],navigatorPlatform:resolved[2]};
}
function expectedFields(config,base,uaPlan){
  return {
    ua:config.ua==='native'?base.fields.userAgent.value:uaPlan.ua,
    uaCH:config.ua==='native'?base.hints?.platform??null:uaPlan.platform,
    language:config.lang==='system'?base.fields.languages.value?.[0]??null:config.lang,
    acceptLanguage:config.lang==='system'?null:config.lang,
    timezone:config.tz==='system'?base.fields.timeZone.value:config.tz,
    geolocation:null,
    viewport:config.viewport==='native'?base.fields.viewport.value:
      config.viewport==='desktop'?{width:1366,height:768}:{width:390,height:844},
    publicIp:null
  };
}
function currentValues(reading){
  return {ua:reading.fields.userAgent.value,uaCH:reading.hints?.platform??null,
    language:reading.fields.languages.value?.[0]??null,acceptLanguage:null,
    timezone:reading.fields.timeZone.value,geolocation:null,
    viewport:reading.fields.viewport.value,publicIp:null};
}
const compare=(left,right)=>left!==null&&right!==null&&left!==undefined&&right!==undefined&&
  JSON.stringify(left)===JSON.stringify(right);
export function createFingerprintDriver({api,resolveTarget,readPage,authorize,
  clock=Date,newRef=()=>crypto.randomUUID(),ttlMs=480000,
  schedule=setTimeout,unschedule=clearTimeout}={}){
  if(typeof resolveTarget!=='function'||typeof readPage!=='function'||typeof authorize!=='function'||
     !api?.debugger?.attach||!api?.debugger?.sendCommand||!api?.debugger?.detach||
     !api?.scripting?.executeScript)throw fail('E_CHROME_UNSUPPORTED','Chrome debugger and trusted page reader required');
  const sessions=new Map(),tabs=new Map();
  const expired=s=>clock.now()>s.expiresAt;
  const client=s=>({tabId:s.target.tabId});
  const retire=(s,reason)=>{
    if(!s)return;
    if(s.expireHandle!==undefined)unschedule(s.expireHandle);
    s.invalidated=reason;s.stage='invalidated';tabs.delete(s.target.tabId);
    // Retire only our own previously attached debugger. Never target DevTools.
    if(s.attached)void api.debugger.detach(client(s)).catch(()=>{});
    s.attached=false;
  };
  const onDetach=(debuggee,reason)=>{
    if(!Number.isSafeInteger(debuggee?.tabId))return;
    const s=tabs.get(debuggee.tabId);
    if(s){
      s.attached=false;tabs.delete(debuggee.tabId);
      if(s.expireHandle!==undefined)unschedule(s.expireHandle);
      if(s.stage!=='restoring'&&s.stage!=='restore_readback')
        {s.invalidated=reason||'debugger-detached';s.stage='invalidated';}
    }
  };
  api.debugger.onDetach?.addListener(onDetach);
  async function target(refs,owner,op){
    if(!REF.test(refs?.tabRef||'')||!REF.test(refs?.documentRef||''))
      throw fail('E_SCHEMA','Opaque document references required');
    const t=await resolveTarget(refs,owner);
    if(!t||!Number.isSafeInteger(t.tabId)||!Number.isSafeInteger(t.windowId)||
       !t.documentId||!/^https?:\/\//.test(t.url||''))
      throw fail('E_DOCUMENT_STALE');
    await authorize({operation:op,owner,origin:new URL(t.url).origin});
    const after=await resolveTarget(refs,owner);
    if(!same(t,after))throw fail('E_DOCUMENT_CHANGED');
    return t;
  }
  async function snapshot(refs,owner,t){
    const read=await readPage(refs,owner);
    if(read.documentRef!==refs.documentRef||read.tabRef!==refs.tabRef)
      throw fail('E_DOCUMENT_CHANGED');
    let hints=null;
    try{
      const result=await api.scripting.executeScript({
        target:{tabId:t.tabId,documentIds:[t.documentId]},
        world:'MAIN',func:readHintsInPage
      });
      if(result?.length===1&&result[0].frameId===0&&
         result[0].documentId===t.documentId&&
         result[0].result&&typeof result[0].result.platform==='string')
        hints=result[0].result;
    }catch{/* UA-CH remains independently unverifiable. */}
    const after=await resolveTarget(refs,owner);
    if(!same(t,after))throw fail('E_DOCUMENT_CHANGED');
    return {fields:Object.fromEntries(Object.entries(read.fields).map(([k,v])=>
      [k,{status:v.status,value:v.status==='available'?v.value:null}])),hints,
      capturedAt:new Date(clock.now()).toISOString()};
  }
  function session(ref,owner){
    if(!REF.test(ref||''))throw fail('E_SCHEMA','Invalid session reference');
    const s=sessions.get(ref);
    if(!s||s.owner!==ownerKey(owner))throw fail('E_OWNER','Unowned fingerprint session');
    if(expired(s)){retire(s,'expired');throw fail('E_TARGET_INVALIDATED','Session expired');}
    if(s.invalidated)throw fail('E_TARGET_INVALIDATED','Session invalidated');
    return s;
  }
  async function apply({tabRef,documentRef,config},owner){
    const c=validateConfig(config),refs={tabRef,documentRef};
    const t=await target(refs,owner,'browser.fingerprint.apply');
    if(tabs.has(t.tabId))throw fail('E_SESSION_ACTIVE','Stop the existing tab session first');
    for(const [id,old] of sessions)if(expired(old)){retire(old,'expired');sessions.delete(id);}
    if(sessions.size>16)throw fail('E_LIMIT','Too many fingerprint sessions');
    const base=await snapshot(refs,owner,t);
    const uaPlan=userAgentPlan(base,c),expected=expectedFields(c,base,uaPlan);
    const ref=newRef();
    if(!REF.test(ref)||sessions.has(ref))throw fail('E_CONTEXT','Invalid session ID');
    const s={ref,refs,target:t,owner:ownerKey(owner),base,expected,config:c,applied:[],
      attempts:[],attached:false,stage:'applying',invalidated:null,
      expiresAt:clock.now()+ttlMs};
    sessions.set(ref,s);
    try{
      await api.debugger.attach(client(s),'1.3');
      s.attached=true;tabs.set(t.tabId,s);
      // Chrome 118+ keeps the MV3 worker alive during an active debugger.
      // Expiry is a STOP safety fence, not an implicit successful restore.
      s.expireHandle=schedule(()=>{
        if(sessions.get(ref)===s&&s.attached)retire(s,'lease-expired');
      },ttlMs);
      s.expireHandle?.unref?.(); // Node tests must not be kept open by a native safety lease.
    }catch(error){
      sessions.delete(ref);
      throw fail('E_CHROME_PERMISSION_REQUIRED','Chrome debugger attach rejected: '+String(error?.message||'unavailable').slice(0,100));
    }
    const send=async(command,params,fieldKeys)=>{
      // Fail closed before every CDP effect, including after a permission
      // revoke, document navigation or tool update during an earlier await.
      try{
        if(!same(t,await target(refs,owner,'browser.fingerprint.apply')))
          throw fail('E_DOCUMENT_CHANGED');
        if(!s.attached||s.invalidated)throw fail('E_TARGET_INVALIDATED');
        await api.debugger.sendCommand(client(s),command,params);
        s.applied.push(...fieldKeys);
        for(const key of fieldKeys)s.attempts.push({key,status:'applied'});
      }catch(error){
        for(const key of fieldKeys)s.attempts.push({key,status:'unknown',
          reasonCode:String(error?.code||'E_NATIVE_OUTCOME_UNKNOWN').slice(0,64)});
        // Never replay an uncertain side effect. Subsequent commands are
        // withheld after a context/permission/attachment failure.
        if(['E_DOCUMENT_CHANGED','E_DOCUMENT_STALE','E_TARGET_INVALIDATED',
          'E_GRANT_REVOKED','E_CHROME_PERMISSION_REQUIRED','E_TOOL_CHANGED',
          'E_SITE_GRANT_REQUIRED'].includes(error?.code)){s.stage='unknown';return false;}
      }
      return true;
    };
    try{
      let proceed=true;
      if(c.ua!=='native'||c.lang!=='system'){
        const params={userAgent:uaPlan.ua};
        if(c.lang!=='system')params.acceptLanguage=c.lang;
        if(c.ua!=='native'){
          params.platform=uaPlan.navigatorPlatform||'';
          if(uaPlan.metadata)params.userAgentMetadata=uaPlan.metadata;
        }
        proceed=await send('Emulation.setUserAgentOverride',params,
          [...(c.ua!=='native'?['ua','uaCH']:[]),...(c.lang!=='system'?['language','acceptLanguage']:[])]);
      }
      if(proceed&&c.lang!=='system')
        proceed=await send('Emulation.setLocaleOverride',{locale:c.lang},['language']);
      if(proceed&&c.tz!=='system')
        proceed=await send('Emulation.setTimezoneOverride',{timezoneId:c.tz},['timezone']);
      if(proceed&&c.viewport!=='native'){
        const value=expected.viewport;
        await send('Emulation.setDeviceMetricsOverride',{width:value.width,height:value.height,
          deviceScaleFactor:c.viewport==='mobile'?2:1,mobile:c.viewport==='mobile'},['viewport']);
      }
      if(c.geo!=='off')s.attempts.push({key:'geolocation',status:'unsupported',
        reasonCode:'E_GEOLOCATION_PERMISSION_NOT_REVIEWED'});
      s.attempts=[...new Map(s.attempts.map(row=>[row.key,row])).values()];
      s.stage=s.invalidated?'invalidated':'applied_unverified';
      // This is only an execution receipt; not a page observation.
      return {accepted:true,source:'trusted-browser-host',sessionRef:ref,
        documentRef,controlledKeys:[...new Set(s.attempts.filter(x=>x.status!=='unsupported').map(x=>x.key))],
        fieldResults:s.attempts};
    }catch(error){
      s.stage='unknown';
      throw fail('E_OUTCOME_UNKNOWN','Native fingerprint effect cannot be confirmed: '+String(error?.code||error).slice(0,80));
    }
  }
  async function readback({sessionRef,documentRef,mode},owner){
    if(!['applied','restore'].includes(mode))throw fail('E_SCHEMA');
    const s=session(sessionRef,owner);
    if(documentRef!==s.refs.documentRef)throw fail('E_DOCUMENT_CHANGED');
    if(mode==='restore'&&s.stage!=='restoring'&&s.stage!=='restore_readback')
      throw fail('E_CONTEXT','Restore has not been requested');
    if(mode==='applied'&&s.stage!=='applied_unverified')
      throw fail('E_CONTEXT','Applied tab session is not readable');
    const t=await target(s.refs,owner,'browser.fingerprint.readback');
    if(!same(t,s.target))throw fail('E_DOCUMENT_CHANGED');
    const observed=await snapshot(s.refs,owner,t);
    const actual=currentValues(observed),original=currentValues(s.base);
    const controlled=[...new Set(s.attempts.filter(row=>row.status!=='unsupported').map(row=>row.key))];
    const rows=keys.map(key=>{
      const baseline=display(original[key]),expected=display(mode==='restore'?original[key]:s.expected[key]);
      const value=display(actual[key]),isControlled=controlled.includes(key);
      const verified=isControlled&&baseline!==null&&expected!==null&&value!==null&&
        !['acceptLanguage','geolocation','publicIp'].includes(key);
      return {key,source:source(key),baseline,expected,observed:value,
        controlled:isControlled,verified,status:!verified?'unverifiable':
          compare(actual[key],mode==='restore'?original[key]:s.expected[key])?'match':'mismatch',
        reason:verified?(key==='uaCH'?'LOW_ENTROPY_PLATFORM_ONLY':null):
          (key==='acceptLanguage'?'NO_TRUSTED_NETWORK_CAPTURE':
            key==='geolocation'?'GEOLOCATION_NOT_VERIFIED':
            key==='publicIp'?'PUBLIC_IP_OUT_OF_SCOPE':
            !isControlled?'NOT_CONTROLLED':'NO_INDEPENDENT_FIELD_VALUE')};
    });
    if(mode==='restore')s.stage='restore_readback';
    return {source:'trusted-browser-host',sessionRef,documentRef,controlledKeys:controlled,
      rows,capturedAt:observed.capturedAt};
  }
  async function restore({sessionRef,documentRef},owner){
    const s=session(sessionRef,owner);
    if(documentRef!==s.refs.documentRef)throw fail('E_DOCUMENT_CHANGED');
    if(s.stage!=='applied_unverified')throw fail('E_CONTEXT','Session cannot be restored twice');
    const t=await target(s.refs,owner,'browser.fingerprint.restore');
    if(!same(t,s.target))throw fail('E_DOCUMENT_CHANGED');
    s.stage='restoring';
    try{
      if(s.attached)await api.debugger.detach(client(s));
      s.attached=false;tabs.delete(t.tabId);
      if(s.expireHandle!==undefined)unschedule(s.expireHandle);
    }catch{throw fail('E_OUTCOME_UNKNOWN','Debugger detach not confirmed; restore unknown');}
    return {accepted:true,source:'trusted-browser-host',sessionRef,documentRef};
  }
  function invalidateTab(tabId){
    const s=tabs.get(tabId);
    if(s)retire(s,'tab-or-document-changed');
    for(const item of sessions.values())
      if(item.target.tabId===tabId&&item.stage!=='restored')
        item.invalidated='tab-or-document-changed';
  }
  function revokeAll(){
    for(const s of sessions.values())retire(s,'tool-or-permission-revoked');
    sessions.clear();tabs.clear();
  }
  return Object.freeze({apply,readback,restore,invalidateTab,revokeAll,
    diagnostics:()=>({sessions:sessions.size,attached:tabs.size})});
}
