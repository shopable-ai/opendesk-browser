// Fictional transport only. Policy and parsing belong to the real app/ Controller and Domain.
import {key,sameNativeSlot} from '../../../app/domain/cookie-model.js';
export const demoSite='shop.example.com';
export const demoSites=Object.freeze([demoSite,'docs.example.org','store.example.net']);
const partitionKey={topLevelSite:'https://partner.example.net',hasCrossSiteAncestor:false};
export function fictionalCookies(){
 const b={domain:demoSite,path:'/',hostOnly:true,storeId:'0',session:true,secure:true,httpOnly:false,sameSite:'lax',valueRedacted:false};
 return [
  {...b,name:'session_id',value:'sess_demo_only_C18',httpOnly:true},
  {...b,name:'theme',value:'light',secure:false,session:false,expirationDate:1839061800},
  {...b,name:'locale',value:'zh-CN',secure:false,session:false,expirationDate:1835865000},
  {...b,name:'cart_count',value:'3',path:'/shop',sameSite:'strict'},
  {...b,name:'analytics_consent',value:'accepted',domain:'.example.com',hostOnly:false,sameSite:'no_restriction'},
  {...b,name:'__Host-auth',value:'secret_preview_never_real',httpOnly:true,sameSite:'strict'},
  {...b,name:'实验_超长Cookie名称_用于测试在窄屏下的安全折行与原位编辑',value:'演示数据',path:'/用户/long-path/nested'},
  {...b,name:'embedded_pref',value:'enabled',sameSite:'no_restriction',partitionKey}
 ];
}
// A/B fixture retains historical fictional data. R2.5.4 HTML is the current UI baseline.
// HTML has metadata only: values remain fictional. It specifies neither storeId
// nor a precise PartitionKey; retain explicit simulated identities from the
// safety fixture rather than silently flattening the partitioned Cookie.
export function approvedParityCookies(now=Date.now()){
 const afterDays=days=>Math.floor(now/1000)+days*86400;
 const rows=fictionalCookies();
 const byName=name=>rows.find(row=>row.name===name);
 return [
  byName('session_id'),byName('__Host-auth'),
  {...byName('theme'),expirationDate:afterDays(30)},
  {...byName('locale'),expirationDate:afterDays(7)},
  byName('cart_count'),
  {...byName('analytics_consent'),session:false,expirationDate:afterDays(90)},
  byName('embedded_pref'),
  {...rows[6],name:'long_optional_cookie_for_layout_checks',path:'/',secure:false}
 ];
}
const clone=value=>structuredClone(value);
const error=code=>Object.assign(Error(code),{code});
export function createMockSdk({scenario='ready',onFailureConsumed=()=>{}}={}){
 const parity=scenario==='approvedParity';
 let rows=scenario==='empty'?[]:parity?approvedParityCookies():fictionalCookies(),failure='',clearPlan=null,releaseLoading;
 let currentSite=demoSite,globalGrant=scenario!=='first';
 const siteRows=new Map([[demoSite,rows]]);
 // Preview-only account fixture. No real account, Cookie, Host or storage.
 const accountDemo=parity||['accountsDemo','accountSwitchFail','accountSwitchUnknown'].includes(scenario);
 const fictionalAccounts=parity?[
   {alias:'work',origin:'https://'+demoSite,displayName:'工作账号',version:1,allowAuto:false},
   {alias:'personal',origin:'https://'+demoSite,displayName:'个人账号',version:1,allowAuto:false},
   {alias:'backup',origin:'https://'+demoSite,displayName:'备用账号',version:1,allowAuto:false}
 ]:[
   {alias:'work',origin:'https://'+demoSite,displayName:'工作账号',version:1,allowAuto:true},
   {alias:'personal',origin:'https://'+demoSite,displayName:'个人账号',version:1,allowAuto:false},
   {alias:'qa',origin:'https://'+demoSite,displayName:'测试账号',version:1,allowAuto:true}
 ];
 let demoAccounts=accountDemo
   ?{configured:true,unlocked:true,revision:3,currentAlias:'work',
     accounts:fictionalAccounts,settings:{autoRefresh:true,autoEnabled:false}}
   :{configured:true,unlocked:true,revision:0,currentAlias:null,
     accounts:[],settings:{autoRefresh:true,autoEnabled:false}};
 const demoSnapshots=new Map();
 if(accountDemo)for(const item of fictionalAccounts){
   // HTML supplies counts 8/8/7, not saved Cookie contents. The backup subset
   // here is synthetic, not evidence of a real account snapshot or Host write.
   const snapshot=parity?rows.slice(0,item.alias==='backup'?7:8):fictionalCookies();
   demoSnapshots.set(item.alias,clone(snapshot));
 }
 const accountMeta=()=>({...clone(demoAccounts),
   accounts:demoAccounts.unlocked?demoAccounts.accounts
     .filter(item=>item.origin==='https://'+currentSite)
     .map(item=>({...item,cookieCount:demoSnapshots.get(item.alias)?.length||0,
       siteLabel:currentSite,siteUrl:'https://'+currentSite+'/'})):[],
   autoRuntimeReady:demoAccounts.unlocked,preview:true
 });
 const seedRows=hostname=>{
  if(scenario==='empty')return [];
  const original=fictionalCookies()[0];
  return [
   {...original,name:'session_id',value:'fictional_'+hostname,domain:hostname,httpOnly:false},
   {...original,name:'theme',value:'light',domain:hostname,httpOnly:false,session:false,secure:false,expirationDate:1839061800}
  ];
 };
 let importRef=0,writeRef=0;
 const loading=scenario==='loading'?new Promise(resolve=>{releaseLoading=resolve;}):null;
 const calls=[],deliveries=[],observations=new Set();
 const fail=operation=>{
  if(!globalGrant)throw error('E_SITE_GRANT_REQUIRED');
  if(scenario==='readonly'&&['save','import','clear','remove'].includes(operation))throw error('E_PERMISSION_REQUIRED');
  if(scenario==='valuesDenied'&&operation==='values')throw error('E_COOKIE_VALUES');
  const persistent={saveError:'save',copyError:'copy',downloadError:'download'}[scenario];
  const unknown=(failure==='unknown'||scenario==='unknown')&&['save','import','clear','remove'].includes(operation);
  if(failure===operation||failure==='import'&&operation==='save'||persistent===operation||unknown){
   failure='';onFailureConsumed();
   throw error(unknown?'E_OUTCOME_UNKNOWN':({save:'E_COOKIE_SET',import:'E_COOKIE_IMPORT',copy:'E_CLIPBOARD',download:'E_DOWNLOAD',clear:'E_COOKIE_CLEAR',remove:'E_COOKIE_REMOVE'}[operation]));
  }
 };
 const samePartition=(a,b)=>JSON.stringify(a||null)===JSON.stringify(b||null);
 const matches=(row,args)=>{
  const host=new URL(args.url).hostname,domain=row.domain.replace(/^\./,'');
  return (host===domain||!row.hostOnly&&host.endsWith('.'+domain))&&
   (args.name===undefined||row.name===args.name)&&(args.storeId===undefined||row.storeId===args.storeId)&&samePartition(row.partitionKey,args.partitionKey);
 };
 const record=(op,args)=>{calls.push({op,args:clone(args)});};
 const write=(args,operation='save')=>{
  record('set',args);fail(operation);
  const host=new URL(args.url).hostname;
  const row={...args,domain:args.domain||host,hostOnly:!args.domain,session:args.expirationDate===undefined,storeId:args.storeId||'0',valueRedacted:false};
  delete row.url;delete row.ifAbsent;
  // Chrome replaces a native slot even when its hostOnly flag changes.
  if(args.ifAbsent&&rows.some(old=>sameNativeSlot(old,row)))throw error('E_COOKIE_CONFLICT');
  rows=rows.filter(old=>!sameNativeSlot(old,row));rows.push(row);return {saved:true,verified:true};
 };
 const cookies={
  getAll:async args=>{
   record('getAll',args);if(!globalGrant)throw error('E_SITE_GRANT_REQUIRED');
   if(loading)await loading;if(args.includeValues)fail('values');
   return rows.filter(row=>matches(row,args)).map(row=>{
    if(args.includeValues)return clone(row);
    const {value,...metadata}=row;return {...clone(metadata),valueRedacted:true};
   });
  },
  getPartitionKey:async()=>({partitionKey:clone(partitionKey)}),
  getCurrentStore:async()=>({storeId:'0'}),
  get:async args=>{
   record('get',args);fail('values');
   const found=rows.find(row=>row.name===args.name&&row.domain===args.domain&&row.path===args.path&&matches(row,args));
   return {cookie:found?{...clone(found),valueRedacted:false}:null};
  },
  set:async args=>write(args),
  setMany:async args=>{
   record('setMany',args);fail('import');
   return {results:args.cookies.map((item,index)=>({index,...write({...item,url:item.url||args.url},'import')}))};
  },
  remove:async args=>{
   record('remove',args);fail('remove');
   rows=rows.filter(row=>!(row.name===args.name&&row.domain===args.domain&&row.path===args.path&&matches(row,args)));
   return {removed:true,verified:true};
  },
  clearSite:async args=>{
   record('clearSite',args);const host=new URL(args.url).hostname;
   const eligible=rows.filter(row=>row.domain===host&&row.hostOnly&&row.storeId==='0'&&!row.partitionKey).slice(0,50);
   if(args.preview){clearPlan={ref:'12345678-1234-1234-1234-123456789abc',url:args.url,ids:eligible.map(key)};return {matched:eligible.length,previewRef:clearPlan.ref};}
   fail('clear');
   if(!clearPlan||args.previewRef!==clearPlan.ref||args.url!==clearPlan.url||args.expectedCount!==eligible.length||JSON.stringify(eligible.map(key))!==JSON.stringify(clearPlan.ids))throw error('E_COOKIE_CONFLICT');
   rows=rows.filter(row=>!clearPlan.ids.includes(key(row)));clearPlan=null;
   return {preview:false,scope:'EXACT_HOST_HOST_ONLY',matched:eligible.length,removed:eligible.length,remaining:0};
  },
  observe:{start:async()=>{observations.add('preview-observation');return {sessionRef:'preview-observation'};},read:async()=>({events:[],nextCursor:'0'}),stop:async({sessionRef})=>{observations.delete(sessionRef);return {stopped:true};}}
 };
 return {
  browser:{cookies,capabilities:{getStatus:async()=>({callableNow:globalGrant&&scenario!=='chromeDenied',
     reasonCode:scenario==='chromeDenied'?'E_CHROME_PERMISSION_REQUIRED':'E_SITE_GRANT_REQUIRED'})},
   clipboard:{writeText:async text=>{record('copy',{});fail('copy');deliveries.push({method:'copy',text});return {copied:true};}},
   downloads:{text:async args=>{
    record('download',{});fail('download');deliveries.push({method:'download',...args});
    if(typeof document!=='undefined'){
     const url=URL.createObjectURL(new Blob([args.text],{type:'text/plain'}));
     const link=document.createElement('a');link.href=url;link.download=args.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    return {started:true};
   }}},
  request:async(operation,payload)=>{
   if(operation.startsWith('cookieAccount.')){
    if(scenario==='hostClosed')throw error('E_HOST_CLOSED');
    const action=operation.slice('cookieAccount.'.length);
    if(action==='status')return accountMeta();
    if(!['create','rename','update','delete','switch','setAutoEnabled','setAutoRefresh','allowAlias'].includes(action))
      throw error('E_ACCOUNT_REQUEST');
    if(payload.revision!==demoAccounts.revision)throw error('E_VAULT_CONFLICT');
    if(['create','update'].includes(action)&&['save','unknown'].includes(failure)){
      const attempted=failure;failure='';onFailureConsumed();
      throw error(attempted==='unknown'?'E_OUTCOME_UNKNOWN':'E_ACCOUNT_STORAGE_UNAVAILABLE');
    }
    const origin='https://'+currentSite;
    const selected=demoAccounts.accounts.find(item=>item.alias===payload.alias&&item.origin===origin);
    if(action==='switch'){
      if(!selected)throw error('E_ACCOUNT_NOT_FOUND');
      if(scenario==='accountSwitchUnknown')throw error('E_OUTCOME_UNKNOWN');
      if(scenario==='accountSwitchFail')throw error('E_SITE_GRANT_REQUIRED');
      rows=clone(demoSnapshots.get(selected.alias)||[]);
      demoAccounts.currentAlias=selected.alias;
      record('previewAccountSwitch',{alias:selected.alias,fixture:true});
      return {switched:true,verified:true,reloadRequested:demoAccounts.settings.autoRefresh,
        preview:true};
    }
    if(action==='create'){
      if(!payload.displayName||!rows.length)throw error('E_ACCOUNT_EMPTY');
      if(demoAccounts.accounts.some(item=>item.origin===origin&&
        item.displayName===payload.displayName))throw error('E_ACCOUNT_NAME_TAKEN');
      const alias='acct_preview_'+String(demoAccounts.revision+1).padStart(3,'0');
      demoAccounts.configured=true;
      demoAccounts.accounts.push({alias,origin,
        displayName:String(payload.displayName).slice(0,64),version:1,allowAuto:false});
      demoSnapshots.set(alias,clone(rows));
    }else if(['rename','update','delete','allowAlias'].includes(action)){
      if(!selected)throw error('E_ACCOUNT_NOT_FOUND');
      if(selected.version!==payload.accountVersion)throw error('E_VAULT_CONFLICT');
      if(action==='rename'){
        if(demoAccounts.accounts.some(item=>item.origin===origin&&
          item.alias!==selected.alias&&item.displayName===payload.displayName))
          throw error('E_ACCOUNT_NAME_TAKEN');
        selected.displayName=String(payload.displayName).slice(0,64);
      }
      if(action==='update'){
        const cookieId=row=>JSON.stringify([row.name,row.domain?.replace(/^\./,'').toLowerCase(),
          row.path,row.storeId,row.partitionKey?.topLevelSite||null,
          Boolean(row.partitionKey?.hasCrossSiteAncestor),Boolean(row.hostOnly)]);
        const keys=list=>list.map(cookieId).sort();
        const previous=demoSnapshots.get(selected.alias)||[];
        if(JSON.stringify(keys(previous))!==JSON.stringify(keys(rows)))
          throw error('E_ACCOUNT_SNAPSHOT_SCOPE_CHANGED');
        if(JSON.stringify(previous)===JSON.stringify(rows))
          return {...accountMeta(),unchanged:true};
        demoSnapshots.set(selected.alias,clone(rows));
      }
      if(action==='delete'){
        if(demoAccounts.currentAlias===selected.alias)demoAccounts.currentAlias=null;
        demoAccounts.accounts.splice(demoAccounts.accounts.indexOf(selected),1);
        demoSnapshots.delete(selected.alias);
      }
      if(action==='allowAlias')selected.allowAuto=payload.enabled===true;
      selected.version++;
    }else if(action==='setAutoEnabled'||action==='setAutoRefresh'){
      demoAccounts.settings[action==='setAutoEnabled'?'autoEnabled':'autoRefresh']=
        payload.enabled===true;
    }else throw error('E_ACCOUNT_REQUEST');
    demoAccounts.revision++;
    record('previewAccountMutation',{action,fixture:true});
    return accountMeta();
   }
   if(operation==='currentPage.info'){
    if(scenario==='noPage'||scenario==='restricted'||scenario==='switching')
      return {status:'unavailable',reasonCode:scenario==='noPage'?'E_NO_ACTIVE_TAB':
        scenario==='restricted'?'E_UNSUPPORTED_SCHEME':'E_DOCUMENT_UNRESOLVED'};
    if(scenario==='hostClosed')throw error('E_HOST_CLOSED');
    return {status:'available',url:'https://'+currentSite+'/'};
   }
   if(operation==='cookieEditor.export.begin'){
    if(!globalGrant)throw error('E_SITE_GRANT_REQUIRED');
    if(payload?.url!=='https://'+currentSite+'/'||!['copy','download'].includes(payload.method))throw error('E_COOKIE_SCOPE');
    return {authorized:true,ref:1};
   }
   if(operation==='cookieEditor.export.finish')return {closed:true};
   if(operation==='cookieEditor.clear.begin'){
     if(!globalGrant)throw error('E_SITE_GRANT_REQUIRED');
     if(payload?.url!=='https://'+currentSite+'/'||
       payload.previewRef!==clearPlan?.ref||payload.expectedCount!==clearPlan.ids.length)
       throw error('E_COOKIE_CONFLICT');
     const ref=++writeRef;
     record(operation,{url:payload.url,expectedCount:payload.expectedCount});
     return {authorized:true,ref};
   }
   if(operation==='cookieEditor.clear.finish'){
     const closed=payload?.ref===writeRef&&writeRef>0;
     record(operation,{closed});return {closed};
   }
   // Preview-only synthetic admission; no bypass of formal Host grants.
   if(operation==='cookieEditor.import.begin'||operation==='cookieEditor.write.begin'){
    if(!globalGrant)throw error('E_SITE_GRANT_REQUIRED');
    if(payload?.url!=='https://'+currentSite+'/')throw error('E_COOKIE_SCOPE');
    const ref=operation==='cookieEditor.import.begin'?++importRef:++writeRef;
    record(operation,{url:payload.url});
    return {authorized:true,ref};
   }
   if(operation==='cookieEditor.import.finish'||operation==='cookieEditor.write.finish'){
    const current=operation==='cookieEditor.import.finish'?importRef:writeRef;
    const closed=payload?.ref===current&&current>0;
    record(operation,{closed});return {closed};
   }
   throw error('E_PERMISSION');
  },
  hasGlobalCookieGrant:()=>globalGrant,
  grantAllSites:()=>{globalGrant=true;record('globalGrant',{scope:'http-https-all'});return {authorized:true};},
  revokeAllSites:()=>{globalGrant=false;record('globalRevoke',{scope:'http-https-all'});return {revoked:true};},
  switchSite:hostname=>{
   if(!demoSites.includes(hostname))throw error('E_COOKIE_SCOPE');
   siteRows.set(currentSite,rows);currentSite=hostname;
   rows=siteRows.get(hostname)||seedRows(hostname);
   siteRows.set(hostname,rows);clearPlan=null;
   record('pageChanged',{hostname});
  },
  setFailure:value=>{failure=value;},dispose:()=>{releaseLoading?.();observations.clear();},
  inspect:()=>({rows:clone(rows),currentSite,globalGrant,calls:clone(calls),deliveries:clone(deliveries),observations:[...observations]})
 };
}
