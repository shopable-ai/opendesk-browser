// Fixed trusted Cookie Editor service, running only in the existing MV3 SW.
// No Cookie values or legacy decryption key ever pass to an installed tool, React,
// ordinary Browser SDK storage, URL, website, or telemetry.
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash,validateSidebarToolPackage}
  from '../../../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,sidebarToolEnabled}
  from '../../../../src/ui/sidebar-tools/lifecycle.js';
import {MARKET_PROVENANCE_STORE} from '../../../../src/sidebar-tools/official-reading-toc.js';
import {BROWSER_MENU_GRANTS_STORE} from '../../../../src/framework/sdk/browser-contract.js';
import {OFFICIAL_CATALOG_PATH,validateOfficialReleaseCatalog,matchesOfficialRelease}
  from '../../../../src/sidebar-tools/official-catalog.js';
import {isSidebarToolHostSender} from '../../../../src/sidebar-tools/sender.js';
import {createCookieService} from '../../../../src/platform/chrome/cookies.js';
import {inspectAccountSwitchUrl} from '../app/domain/account-switch-url.js';
import {createCookieAccountVault} from './account-vault.js';
import {COOKIE_ACCOUNT_PROTOCOL,COOKIE_ACCOUNT_OPERATIONS,COOKIE_ACCOUNT_EFFECTS,COOKIE_ACCOUNT_SEEN_KEY} from './account-contract.js';

export {COOKIE_ACCOUNT_PROTOCOL} from './account-contract.js';
const ID='cookie-editor',MAX_COOKIES=100,MAX_ACCOUNTS=48,SEEN_KEY=COOKIE_ACCOUNT_SEEN_KEY;
const MUTATIONS=new Set(COOKIE_ACCOUNT_EFFECTS);
const fail=code=>Object.assign(new Error(code),{code});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const samePartition=(a,b)=>Boolean(a&&b&&a.topLevelSite===b.topLevelSite&&
  Boolean(a.hasCrossSiteAncestor)===Boolean(b.hasCrossSiteAncestor));
const originOf=value=>{
  let url;try{url=new URL(value);}catch{throw fail('E_SITE_MISMATCH');}
  if(!['http:','https:'].includes(url.protocol)||url.origin!==value||
     url.username||url.password)throw fail('E_SITE_MISMATCH');
  return value;
};
const cookieId=row=>JSON.stringify([
  row.name,row.domain?.replace(/^\./,'').toLowerCase(),row.path,
  row.storeId,row.partitionKey?.topLevelSite||null,
  Boolean(row.partitionKey?.hasCrossSiteAncestor)
]);
function within(host,row){
  const domain=String(row?.domain||'').replace(/^\./,'').toLowerCase();
  return domain===host; // Shared parent-domain sessions need an additional consent contract.
}
function safeRow(row,host,storeId,partition){
  if(!object(row)||!within(host,row)||typeof row.name!=='string'||
    !row.name||row.name.length>256||/[;=\s\x00-\x1f\x7f]/.test(row.name)||
    typeof row.value!=='string'||new TextEncoder().encode(row.value).length>4096||
    typeof row.path!=='string'||!row.path.startsWith('/')||row.path.length>512||
    /[\x00-\x1f\x7f;]/.test(row.path)||
    typeof row.hostOnly!=='boolean'||typeof row.secure!=='boolean'||
    typeof row.httpOnly!=='boolean'||typeof row.session!=='boolean'||
    row.storeId!==storeId||!['lax','strict','no_restriction','unspecified'].includes(row.sameSite)||
    row.partitionKey&&!samePartition(row.partitionKey,partition)||
    !row.session&&(!Number.isFinite(row.expirationDate)||row.expirationDate<=Date.now()/1000)||
    row.name.startsWith('__Secure-')&&!row.secure||
    row.name.startsWith('__Host-')&&(!row.secure||!row.hostOnly||row.path!=='/')||
    (row.name.startsWith('__Http-')||row.name.startsWith('__Host-Http-'))&&
      (!row.secure||!row.httpOnly)||
    row.sameSite==='no_restriction'&&!row.secure)
    throw fail('E_ACCOUNT_COOKIE_SCOPE');
  const checkedUrl=new URL('https://'+host);
  checkedUrl.pathname=row.path;
  if(checkedUrl.pathname!==row.path)throw fail('E_ACCOUNT_COOKIE_SCOPE');
  return {
    name:row.name,value:row.value,domain:row.domain,path:row.path,
    hostOnly:row.hostOnly,secure:row.secure,httpOnly:row.httpOnly,
    sameSite:row.sameSite,session:row.session,
    ...(!row.session?{expirationDate:row.expirationDate}:{}),
    storeId:row.storeId,
    ...(row.partitionKey?{partitionKey:row.partitionKey}:{})
  };
}
// Test the exact trusted validator, without exposing Cookie values via RPC.
export {safeRow as validateAccountCookieRow};
function validateRows(rows,host,storeId,partition){
  if(!Array.isArray(rows)||rows.length>MAX_COOKIES)throw fail('E_ACCOUNT_LIMIT');
  const found=new Set();
  const checked=rows.map(row=>{
    const result=safeRow(row,host,storeId,partition);
    const id=cookieId(result);
    if(found.has(id))throw fail('E_ACCOUNT_COOKIE_SCOPE');
    found.add(id);
    return result;
  });
  return checked.sort((a,b)=>cookieId(a).localeCompare(cookieId(b)));
}
// Pure, deterministic operation plan. Every input row has already passed
// exact host, Store and Partition checks; this never touches native Cookies.
// A no-op must not advance vault versions, and a changed Cookie identity set
// must not silently overwrite a saved account. Both arrays are trusted-only.
export function inspectAccountSnapshotUpdate(saved,current){
  if(!Array.isArray(saved)||!Array.isArray(current)||
     saved.length>MAX_COOKIES||current.length>MAX_COOKIES)
    throw fail('E_ACCOUNT_COOKIE_SCOPE');
  const savedIds=saved.map(cookieId).sort();
  const currentIds=current.map(cookieId).sort();
  if(new Set(savedIds).size!==savedIds.length||
     new Set(currentIds).size!==currentIds.length||
     !same(savedIds,currentIds))throw fail('E_ACCOUNT_SNAPSHOT_SCOPE_CHANGED');
  // Slot equality alone does not establish website login identity. The
  // presentation also requires a recent verified account-switch receipt.
  return same(saved,current)?'unchanged':'changed';
}
export function planAccountCookieEffects(current,expected){
  if(!Array.isArray(current)||!Array.isArray(expected)||
     current.length>MAX_COOKIES||expected.length>MAX_COOKIES)
    throw fail('E_ACCOUNT_LIMIT');
  const old=new Map(current.map(row=>[cookieId(row),row]));
  const next=new Map(expected.map(row=>[cookieId(row),row]));
  return [
    ...current.filter(row=>!next.has(cookieId(row))).map(row=>({kind:'remove',row})),
    ...expected.filter(row=>!same(old.get(cookieId(row)),row))
      .map(row=>({kind:'set',row}))
  ];
}
function meta(account){
  const {alias,origin,displayName,version,allowAuto}=account;
  return {alias,origin,displayName,version,allowAuto,siteLabel:new URL(origin).hostname,
    siteUrl:origin+'/'};
}
// A repeat of an auto-switch URL is never a new intent merely because time passed.
// User-initiated manual switching bypasses this tab-scoped automatic fence.
export function sameAccountAutoSwitchAttempt(prior,{url,alias,version}){
  return Boolean(prior&&prior.url===url&&prior.alias===alias&&prior.version===version);
}
// An unresolved automatic write also blocks DIFFERENT automatic account intents
// in the same tab. A deliberate manual switch remains available for recovery.
export function autoSwitchFenceBlocks(prior,target){
  return prior?.phase==='in_flight'||sameAccountAutoSwitchAttempt(prior,target);
}
export function sameAccountAutoSwitchFence(actual,expected){
  const fields=['url','alias','version','phase'];
  return object(actual)&&object(expected)&&
    Object.keys(actual).length===fields.length&&Object.keys(expected).length===fields.length&&
    fields.every(field=>Object.hasOwn(actual,field)&&Object.hasOwn(expected,field)&&
      actual[field]===expected[field]);
}
export function createCookieAccountService({api=globalThis.chrome,storage}={}){
  const vault=createCookieAccountVault({api,storage});
  const cookieDriver=createCookieService({api,authorize: async({url},context)=>{
    if(!context?.approved||new URL(url).origin!==context.origin)
      throw fail('E_ACCOUNT_COOKIE_SCOPE');
    await permission(context.origin,context.grant,context.write);
    await validateDocument(context.document,context.origin,context.automatic);
    return true;
  }});
  let serial=Promise.resolve();
  const exclusive=fn=>{
    const run=serial.then(fn,fn);
    serial=run.catch(()=>{});
    return run;
  };
  async function hostSender(sender,expected=sender?.documentId){
    if(!isSidebarToolHostSender(api,sender,ID)||sender.tab?.incognito||
       sender.frameId!==undefined&&sender.frameId!==0||
       sender.documentLifecycle&&sender.documentLifecycle!=='active'||
       !api.runtime?.getContexts||sender.tab&&!sender.documentId)
      throw fail('E_ACCOUNT_SENDER');
    const type=sender.tab?'TAB':'SIDE_PANEL';
    const contexts=await api.runtime.getContexts({contextTypes:[type],
      documentUrls:[sender.url],...(sender.tab?{tabIds:[sender.tab.id]}:{})});
    const valid=contexts.filter(row=>row.contextType===type&&
      row.documentUrl===sender.url&&typeof row.documentId==='string'&&
      row.documentId&&(!expected||row.documentId===expected)&&
      row.frameId===0&&!row.incognito&&(!sender.tab||row.tabId===sender.tab.id));
    if(valid.length!==1)throw fail('E_ACCOUNT_SENDER');
    return valid[0].documentId;
  }
  async function installed(message=null){
    const state=await api.storage.local.get([SIDEBAR_TOOL_STORE,
      SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,
      MARKET_PROVENANCE_STORE,BROWSER_MENU_GRANTS_STORE]);
    const entries=state[SIDEBAR_TOOL_STORE];
    if(!Array.isArray(entries))throw fail('E_TOOL_CHANGED');
    const matches=entries.filter(item=>item?.id===ID);
    if(matches.length!==1)throw fail('E_TOOL_CHANGED');
    let tool;try{tool=validateSidebarToolPackage(matches[0]);}
    catch{throw fail('E_TOOL_CHANGED');}
    if(!sidebarToolEnabled(state[SIDEBAR_TOOL_ENABLE_STORE],ID)||
       !['browser.cookies.read','browser.cookies.values','browser.cookies.write']
         .every(cap=>tool.capabilities.includes(cap)))
      throw fail('E_TOOL_CHANGED');
    const hash=await sidebarToolPackageHash(tool);
    const epoch=state[TOOL_REVOCATION_EPOCHS_STORE]?.[ID]??null;
    if(message&&(message.packageHash!==hash||message.installEpoch!==epoch))
      throw fail('E_TOOL_CHANGED');
    // Pin to the bundled reviewed catalog. Network-based Stay Focus updates
    // must not block or mutate Cookie Editor's authorization decisions.
    const releaseResponse=await fetch(api.runtime.getURL(OFFICIAL_CATALOG_PATH),{
      cache:'no-store',credentials:'omit',redirect:'error'
    });
    if(!releaseResponse.ok)throw fail('E_TOOL_CHANGED');
    const catalog=validateOfficialReleaseCatalog(await releaseResponse.json());
    const release=catalog.apps.find(entry=>entry.toolId===ID);
    const grant=state[MARKET_PROVENANCE_STORE]?.[ID];
    if(!release||release.version!==tool.version||grant?.marketId!==release.id||
      grant.version!==release.version||grant.sha256!==release.sha256||
      !await matchesOfficialRelease(release,tool))
      throw fail('E_TOOL_CHANGED');
    const siteRecord=state[BROWSER_MENU_GRANTS_STORE]?.[ID];
    if(siteRecord?.version!==tool.version||siteRecord?.packageHash!==hash||
       siteRecord?.installEpoch!==epoch)
      return {tool,siteRecord:null};
    return {tool,siteRecord};
  }
  function grantFor(record,origin,write=false){
    originOf(origin);
    const full=record?.cookieAllSites;
    const scoped=record?.cookieSites?.[origin];
    const good=g=>g?.read===true&&g?.values===true&&
      (!write||g?.write===true)&&typeof g.grantEpoch==='string'&&
      typeof g.storeId==='string'&&g.storeId.length>0&&
      (g.partitionKey===undefined||typeof g.partitionKey?.topLevelSite==='string');
    const grant=good(full)&&full.valueConsent===true?full:scoped;
    if(!good(grant))throw fail('E_SITE_GRANT_REQUIRED');
    return grant;
  }
  async function permission(origin,grant,write){
    const result=await api.permissions?.contains?.({
      permissions:['cookies'],origins:[origin+'/*']});
    if(result!==true||!grant||(!write&&grant.values!==true)||
       write&&grant.write!==true)throw fail('E_SITE_GRANT_REQUIRED');
  }
  async function validateDocument(document,origin,automatic=false){
    if(!object(document)||!Number.isSafeInteger(document.tabId)||document.tabId<0||
       typeof document.documentId!=='string'||!document.documentId||
       typeof document.url!=='string'||new URL(document.url).origin!==origin)
      throw fail('E_DOCUMENT_CHANGED');
    const [tab,frame]=await Promise.all([
      api.tabs?.get?.(document.tabId),api.webNavigation?.getFrame?.({
        tabId:document.tabId,frameId:0})]);
    if(!tab||tab.id!==document.tabId||tab.incognito||tab.pendingUrl||
       tab.url!==document.url||(!automatic&&!tab.active)||
       !frame||frame.documentId!==document.documentId||
       frame.url!==document.url||frame.documentLifecycle&&
       frame.documentLifecycle!=='active')
      throw fail('E_DOCUMENT_CHANGED');
    return tab;
  }
  async function scope(document,origin,grant,automatic=false){
    await permission(origin,grant,true);
    const tab=await validateDocument(document,origin,automatic);
    const stores=await api.cookies?.getAllCookieStores?.();
    const matches=Array.isArray(stores)?stores.filter(store=>
      store.id===grant.storeId&&store.tabIds?.includes(tab.id)):[];
    if(matches.length!==1)throw fail('E_COOKIE_STORE');
    const partitionReply=await api.cookies?.getPartitionKey?.({tabId:tab.id,frameId:0});
    const partition=partitionReply?.partitionKey;
    // A reviewed all-site Cookie grant may omit its initial partition.
    // Never assume a default store/partition: always bind the live tab's
    // exact native partition, and compare any site-scoped grant when present.
    if(!partition||grant.partitionKey&&
       !samePartition(partition,grant.partitionKey))
      throw fail('E_COOKIE_PARTITION');
    return {origin,host:new URL(origin).hostname,storeId:grant.storeId,
      partition,document,grant,automatic};
  }
  async function cookiesFor(context){
    const {origin,host,storeId,partition,document,grant}=context;
    await permission(origin,grant,true);
    await validateDocument(document,origin,context.automatic);
    const native=await api.cookies.getAll({domain:host,storeId});
    if(!Array.isArray(native)||native.length>10000)throw fail('E_COOKIE_READ');
    const also=await api.cookies.getAll({url:document.url,storeId});
    if(!Array.isArray(also)||also.length>10000)throw fail('E_COOKIE_READ');
    // Parent-domain cookies could control related origins. Never silently omit
    // them and falsely claim a complete login snapshot.
    if(also.some(row=>!within(host,row)&&
       (!row.partitionKey||samePartition(row.partitionKey,partition))))
      throw fail('E_ACCOUNT_PARENT_DOMAIN_UNSUPPORTED');
    const all=[...native,...also].filter(row=>within(host,row)&&
      (!row.partitionKey||samePartition(row.partitionKey,partition)));
    const unique=new Map();
    for(const row of all)unique.set(cookieId(row),row);
    const rows=validateRows([...unique.values()],host,storeId,partition);
    if(origin.startsWith('http:')&&rows.some(row=>row.secure))
      throw fail('E_ACCOUNT_COOKIE_SCOPE');
    await permission(origin,grant,true);
    await validateDocument(document,origin,context.automatic);
    return rows;
  }
  async function effect(context,desired){
    const current=await cookiesFor(context);
    const expected=validateRows(desired,context.host,context.storeId,context.partition);
    if(context.origin.startsWith('http:')&&expected.some(row=>row.secure))
      throw fail('E_ACCOUNT_COOKIE_SCOPE');
    const steps=planAccountCookieEffects(current,expected);
    if(steps.length>MAX_COOKIES*2)throw fail('E_ACCOUNT_LIMIT');
    const driverContext={approved:true,origin:context.origin,grant:context.grant,
      document:context.document,automatic:context.automatic,write:true};
    let dispatched=false;
    try{
      for(const {kind,row} of steps){
        const at=new URL(context.origin);at.pathname=row.path;
        const url=at.href;
        await validateDocument(context.document,context.origin,context.automatic);
        dispatched=true;
        if(kind==='remove'){
          const result=await cookieDriver.remove({url,name:row.name,
            storeId:row.storeId,...(row.partitionKey?{partitionKey:row.partitionKey}:{})},
          {...driverContext,expectedCookieIdentity:row});
          if(result?.verified!==true)throw fail('E_OUTCOME_UNKNOWN');
        }else{
          const result=await cookieDriver.set({url,name:row.name,value:row.value,
            path:row.path,secure:row.secure,httpOnly:row.httpOnly,
            sameSite:row.sameSite,
            ...(!row.hostOnly?{domain:row.domain}:{}),
            ...(row.session?{session:true}:{expirationDate:row.expirationDate}),
            storeId:row.storeId,
            ...(row.partitionKey?{partitionKey:row.partitionKey}:{})},
          driverContext);
          if(result?.saved!==true||result?.verified!==true)
            throw fail('E_OUTCOME_UNKNOWN');
        }
      }
      const after=await cookiesFor(context);
      if(!same(after,expected))throw fail('E_OUTCOME_UNKNOWN');
      return {switched:true,verified:true,changed:steps.length};
    }catch(error){
      if(dispatched)throw fail('E_OUTCOME_UNKNOWN');
      throw error;
    }
  }
  async function runSwitch(account,record,document,{automatic=false,refresh=true}={}){
    const grant=grantFor(record.siteRecord,account.origin,true);
    const scoped=await scope(document,account.origin,grant,automatic);
    const checked=validateRows(account.cookies,scoped.host,scoped.storeId,scoped.partition);
    if(!checked.length)throw fail('E_ACCOUNT_EMPTY');
    const result=await effect(scoped,checked);
    if(refresh){
      await validateDocument(document,account.origin,automatic);
      try{await api.tabs.reload(document.tabId,{bypassCache:false});}
      catch{throw fail('E_REFRESH_OUTCOME_UNKNOWN');}
    }
    return {...result,reloadRequested:refresh};
  }
  async function statusFor(origin){
    const value=await vault.status();
    const site=originOf(origin);
    return {...value,accounts:value.accounts.filter(x=>x.origin===site).map(meta),
      autoRuntimeReady:Boolean(api?.webNavigation?.onCompleted?.addListener&&
        api?.webNavigation?.onReferenceFragmentUpdated?.addListener&&
        api?.webNavigation?.getFrame&&api?.storage?.session?.get&&
        api?.cookies?.getPartitionKey)};
  }
  async function dispatch(message,sender){
    if(!object(message)||message.protocol!==COOKIE_ACCOUNT_PROTOCOL||
       message.toolId!==ID||typeof message.operation!=='string'||
       !COOKIE_ACCOUNT_OPERATIONS.includes(message.operation)||
       !object(message.payload))
      throw fail('E_ACCOUNT_REQUEST');
    const hostDocumentId=await hostSender(sender);
    const record=await installed(message);
    await hostSender(sender,hostDocumentId);
    const {operation,payload}=message;
    if(MUTATIONS.has(operation)&&message.trustedClick!==true)
      throw fail('E_USER_GESTURE_REQUIRED');
    const origin=originOf(payload.origin);
    if(operation==='status')return statusFor(origin);
    const {revision}=payload;
    if(!Number.isSafeInteger(revision)||revision<0)
      throw fail('E_VAULT_REVISION');
    if(operation==='switch'){
      // The account list is re-read inside the exclusive effect lock.
      return exclusive(async()=>{
        const data=await vault.read();
        if(data.revision!==revision)throw fail('E_VAULT_CONFLICT');
        const account=data.accounts.find(x=>x.alias===payload.alias&&x.origin===origin);
        if(!account)throw fail('E_ACCOUNT_NOT_FOUND');
        return runSwitch(account,record,payload.document,
          {refresh:data.settings.autoRefresh});
      });
    }
    return exclusive(async()=>{
    let capture=null;
    if(['create','update'].includes(operation)){
      const grant=grantFor(record.siteRecord,origin,true);
      const scoped=await scope(payload.document,origin,grant);
      capture=await cookiesFor(scoped);
      if(!capture.length)throw fail('E_ACCOUNT_EMPTY');
    }
    if(operation==='update'){
      // Review the persisted version before any mutation. A renewed value or
      // expiry is allowed only when every exact Store/Partition/Domain/Path
      // Cookie identity still matches the captured scope.
      const latest=await vault.read();
      if(latest.revision!==revision)throw fail('E_VAULT_CONFLICT');
      const source=latest.accounts.find(item=>
        item.alias===payload.alias&&item.origin===origin);
      if(!source)throw fail('E_ACCOUNT_NOT_FOUND');
      if(source.version!==payload.accountVersion)throw fail('E_VAULT_CONFLICT');
      if(inspectAccountSnapshotUpdate(source.cookies,capture)==='unchanged')
        return {...await statusFor(origin),unchanged:true};
    }
    const changed=await vault.update(revision,data=>{
      const selected=data.accounts.find(item=>item.alias===payload.alias&&item.origin===origin);
      if(['rename','update','delete','allowAlias'].includes(operation)){
        if(!selected)throw fail('E_ACCOUNT_NOT_FOUND');
        if(selected.version!==payload.accountVersion)throw fail('E_VAULT_CONFLICT');
      }
      if(operation==='create'){
        const displayName=String(payload.displayName||'').trim();
        if(displayName.length<1||displayName.length>64||data.accounts.length>=MAX_ACCOUNTS)
          throw fail('E_ACCOUNT_NAME');
        if(data.accounts.some(item=>item.origin===origin&&
          item.displayName===displayName))throw fail('E_ACCOUNT_NAME_TAKEN');
        const alias='acct_'+crypto.randomUUID().replace(/-/g,'').slice(0,20);
        data.accounts.push({alias,origin,displayName,version:1,
          cookies:capture,allowAuto:false});
      }else if(operation==='rename'){
        const name=String(payload.displayName||'').trim();
        if(!name||name.length>64)throw fail('E_ACCOUNT_NAME');
        if(data.accounts.some(item=>item.origin===origin&&
          item.alias!==selected.alias&&item.displayName===name))
          throw fail('E_ACCOUNT_NAME_TAKEN');
        selected.displayName=name;selected.version++;
      }else if(operation==='update'){
        selected.cookies=capture;selected.version++;
      }else if(operation==='delete'){
        data.accounts.splice(data.accounts.indexOf(selected),1);
      }else if(operation==='allowAlias'){
        if(typeof payload.enabled!=='boolean')throw fail('E_ACCOUNT_REQUEST');
        selected.allowAuto=payload.enabled;selected.version++;
      }else if(operation==='setAutoEnabled'||operation==='setAutoRefresh'){
        if(typeof payload.enabled!=='boolean')throw fail('E_ACCOUNT_REQUEST');
        data.settings[operation==='setAutoEnabled'?'autoEnabled':'autoRefresh']=payload.enabled;
      }else throw fail('E_ACCOUNT_REQUEST');
    });
    const value=await statusFor(origin);
    if(value.revision!==changed)throw fail('E_OUTCOME_UNKNOWN');
    return value;
    });
  }
  async function navigation(event){
    try{
      if(event?.frameId!==0||!Number.isSafeInteger(event.tabId)||
         typeof event.url!=='string')return;
      const url=new URL(event.url),origin=originOf(url.origin);
      // The supported generated contract is the site's canonical root.
      // Never transform an existing SPA path/query router into an implicit
      // account command until a separately reviewed site adapter exists.
      if(url.pathname!=='/'||url.search||!url.hash.startsWith('#od-account='))return;
      const record=await installed();
      const data=await vault.read();
      if(!data.settings.autoEnabled)return;
      const allow=data.accounts.filter(x=>x.origin===origin&&x.allowAuto).map(x=>x.alias);
      const tested=inspectAccountSwitchUrl(url.href,{expectedOrigin:origin,
        enabled:true,approvedFragment:true,allowedAliases:allow});
      if(tested.status!=='eligible')return;
      const account=data.accounts.find(x=>x.origin===origin&&x.alias===tested.alias);
      if(!account)return;
      const frame=await api.webNavigation.getFrame({tabId:event.tabId,frameId:0});
      const document={tabId:event.tabId,documentId:frame?.documentId,url:event.url};
      await validateDocument(document,origin,true);
      await exclusive(async()=>{
        // Persist a trusted per-tab fence BEFORE native Cookie effects.
        // No TTL: after expiry, an old URL could replay an uncertain write.
        // A deliberate manual switch or changed account version can re-arm.
        // The Foundation account store does not initialize session access.
        // Keep the existing automatic-effect fence restricted to trusted contexts.
        await api.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
        const state=(await api.storage.session.get(SEEN_KEY))[SEEN_KEY]||{};
        const id=String(event.tabId),prior=state[id];
        if(autoSwitchFenceBlocks(prior,{
          url:url.href,alias:account.alias,version:account.version
        }))return;
        const current=await vault.read();
        if(current.revision!==data.revision)throw fail('E_VAULT_CONFLICT');
        const latest=await installed();
        const priorFence={url:url.href,alias:account.alias,version:account.version,
          phase:'in_flight'};
        state[id]=priorFence;
        await api.storage.session.set({[SEEN_KEY]:state});
        const verified=(await api.storage.session.get(SEEN_KEY))[SEEN_KEY]?.[id];
        if(!sameAccountAutoSwitchFence(verified,priorFence))throw fail('E_OUTCOME_UNKNOWN');
        try{
          await runSwitch(account,latest,document,{
            automatic:true,refresh:current.settings.autoRefresh
          });
          const next=(await api.storage.session.get(SEEN_KEY))[SEEN_KEY]||{};
          // Never overwrite a newer manual/automation fence for this tab.
          if(sameAccountAutoSwitchFence(next[id],priorFence)){
            next[id]={...priorFence,phase:'applied'};
            await api.storage.session.set({[SEEN_KEY]:next});
          }
        }catch{
          // Keep the original in-flight fence: no background auto-retry.
          throw fail('E_OUTCOME_UNKNOWN');
        }
      });
    }catch{/* Never retry, navigate, log account names or expose Cookie bytes. */}
  }
  // Fixed SW lifecycle hook only; never admitted by the account RPC contract.
  return Object.freeze({dispatch,navigation,cleanup:()=>vault.clear()});
}
export function installCookieAccountService({api=globalThis.chrome,storage}={}){
  const service=createCookieAccountService({api,storage});
  api.runtime?.onMessage?.addListener((message,sender,respond)=>{
    if(message?.protocol!==COOKIE_ACCOUNT_PROTOCOL)return false;
    void service.dispatch(message,sender).then(data=>respond({ok:true,data}),
      error=>respond({ok:false,error:{code:error?.code||'E_ACCOUNT_HOST',
        message:String(error?.code||'E_ACCOUNT_HOST')}}));
    return true;
  });
  for(const event of [api.webNavigation?.onCompleted,
    api.webNavigation?.onReferenceFragmentUpdated,
    api.webNavigation?.onHistoryStateUpdated])
    event?.addListener?.(value=>{void service.navigation(value);});
  return service;
}
