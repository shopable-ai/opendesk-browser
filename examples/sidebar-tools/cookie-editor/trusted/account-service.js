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
import {createCookieAccountShare} from './account-share.js';
import {createDeviceKeyStorage} from '../../../../src/platform/storage/device-keys.js';
import {createCookieServiceConnections} from './service-connections.js';
import {createCookieServiceSession} from './service-session.js';
import {COOKIE_ACCOUNT_PROTOCOL,COOKIE_ACCOUNT_OPERATIONS,COOKIE_ACCOUNT_EFFECTS,COOKIE_ACCOUNT_SEEN_KEY,
  COOKIE_SERVICE_FIELDS,COOKIE_SERVICE_NATIVE_OPERATIONS,normalizeAccountDescription} from './account-contract.js';

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
  Boolean(row.partitionKey?.hasCrossSiteAncestor),Boolean(row.hostOnly)
]);
function parentDomain(host,row){
  const domain=String(row?.domain||'').replace(/^\./,'').toLowerCase();
  if(row?.hostOnly!==false||domain===host||!host.endsWith('.'+domain)||
     !domain||domain.startsWith('.')||domain.includes('..'))return null;
  // Chrome's canonical hostname is the authority; a narrower private DNS regex
  // would reject valid native hosts such as internal names with underscores.
  try{return new URL('https://'+domain).hostname===domain?domain:null;}
  catch{return null;}
}
function within(host,row,parents){
  const domain=String(row?.domain||'').replace(/^\./,'').toLowerCase();
  return domain===host||Boolean(parentDomain(host,row)&&parents?.has(domain));
}
function safeRow(row,host,storeId,partition,parents){
  if(!object(row)||!within(host,row,parents)||typeof row.name!=='string'||
    !row.name||row.name.length>256||/[;=\s\x00-\x1f\x7f]/.test(row.name)||
    typeof row.value!=='string'||new TextEncoder().encode(row.value).length>4096||
    typeof row.path!=='string'||!row.path.startsWith('/')||row.path.length>1024||
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
function validateRows(rows,host,storeId,partition,parents){
  if(!Array.isArray(rows)||rows.length>MAX_COOKIES)throw fail('E_ACCOUNT_LIMIT');
  const found=new Set();
  const checked=rows.map(row=>{
    const result=safeRow(row,host,storeId,partition,parents);
    const id=cookieId(result);
    if(found.has(id))throw fail('E_ACCOUNT_COOKIE_SCOPE');
    found.add(id);
    return result;
  });
  return checked.sort((a,b)=>cookieId(a).localeCompare(cookieId(b)));
}
// Receiving Store is a local live-Tab identity, never a sender-selected value.
// Partition and domain authority are not broadened by an encrypted snapshot.
export function mapReceivedAccountCookies(snapshot,context){
  if(!object(snapshot)||snapshot.format!==1||snapshot.origin!==context.origin||
    !Array.isArray(snapshot.cookies)||snapshot.cookies.length<1||snapshot.cookies.length>MAX_COOKIES)
    throw fail('E_ACCOUNT_COOKIE_SCOPE');
  const mapped=snapshot.cookies.map(row=>{
    if(!object(row)||typeof row.storeId!=='string'||!row.storeId||row.storeId.length>128||
      row.partitionKey&&!samePartition(row.partitionKey,context.partition))
      throw fail('E_ACCOUNT_COOKIE_SCOPE');
    return {...row,storeId:context.storeId,
      ...(row.partitionKey?{partitionKey:{...context.partition}}:{})};
  });
  const rows=validateRows(mapped,context.host,context.storeId,context.partition,context.parents);
  if(context.origin.startsWith('http:')&&rows.some(row=>row.secure))
    throw fail('E_ACCOUNT_COOKIE_SCOPE');
  return rows;
}
// Pure, deterministic operation plan. Every input row has already passed
// authorized domain, Store and Partition checks; this never touches native Cookies.
// A no-op must not advance vault versions, and a changed Cookie identity set
// must not silently overwrite a saved account. Both arrays are trusted-only.
export function inspectAccountSnapshotUpdate(saved,current){
  if(!Array.isArray(saved)||!Array.isArray(current)||
     saved.length>MAX_COOKIES||current.length>MAX_COOKIES)
    throw fail('E_ACCOUNT_COOKIE_SCOPE');
  const snapshotId=row=>JSON.stringify([cookieId(row),Boolean(row.hostOnly)]);
  const savedIds=saved.map(snapshotId).sort();
  const currentIds=current.map(snapshotId).sort();
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
  const {alias,origin,displayName,description,version,allowAuto,cookieCount}=account;
  return {alias,origin,displayName,description,version,allowAuto,
    cookieCount,siteLabel:new URL(origin).hostname,
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
export function createCookieAccountService({api=globalThis.chrome,storage,serviceTransport=()=>null,
  deviceKeyStorageFactory=createDeviceKeyStorage}={}){
  const vault=createCookieAccountVault({api,storage});
  const connections=createCookieServiceConnections({storage});
  const serviceSession=createCookieServiceSession({api,storage,transport:serviceTransport});
  const cookieDriver=createCookieService({api,authorize: async({url},context)=>{
    if(!context?.approved||new URL(url).origin!==context.operationOrigin)
      throw fail('E_ACCOUNT_COOKIE_SCOPE');
    await assertScope(context.scope);
    return true;
  }});
  let serial=Promise.resolve();
  const exclusive=fn=>{
    const run=serial.then(fn,fn);
    serial=run.catch(()=>{});
    return run;
  };
  async function deviceKeys(owner,authorize){
    if(typeof owner!=='string'||!owner||owner.length>512)throw fail('E_SHARE_STORAGE');
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(owner));
    const identity=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
    await authorize();
    return deviceKeyStorageFactory({owner:ID+':'+identity,authorize});
  }
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
      return {tool,siteRecord:null,packageHash:hash,installEpoch:epoch};
    return {tool,siteRecord,packageHash:hash,installEpoch:epoch};
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
  async function scope(document,origin,grant,automatic=false,record){
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
      partition,document,grant,automatic,record,parents:new Set()};
  }
  async function assertScope(context){
    const latest=await installed();
    const before=context.record?.siteRecord,after=latest.siteRecord;
    if(!before||!after||['version','packageHash','installEpoch'].some(key=>
      before[key]!==after[key]))throw fail('E_TOOL_CHANGED');
    const origins=[context.origin,...[...context.parents].map(domain=>{
      const at=new URL(context.origin);at.hostname=domain;return at.origin;
    })];
    for(const origin of origins){
      const original=grantFor(before,origin,true),current=grantFor(after,origin,true);
      // An operation cannot continue under a different authorization source,
      // even when access was revoked and immediately granted again.
      if((original===before.cookieAllSites)!==(current===after.cookieAllSites)||
        original.grantEpoch!==current.grantEpoch||original.storeId!==current.storeId||
        current.storeId!==context.storeId||
        Boolean(original.partitionKey)!==Boolean(current.partitionKey)||
        original.partitionKey&&!samePartition(original.partitionKey,current.partitionKey)||
        current.partitionKey&&!samePartition(current.partitionKey,context.partition))
        throw fail('E_SITE_GRANT_REQUIRED');
      await permission(origin,current,true);
    }
    await validateDocument(context.document,context.origin,context.automatic);
  }
  async function cookiesFor(context){
    const {origin,host,storeId,partition,document}=context;
    // Omitted partitionKey means UNPARTITIONED in Chrome, not all partitions.
    // Read the live native partition explicitly as well, with separate guards.
    const read=async query=>{
      const rows=[];
      for(const key of [null,partition]){
        await assertScope(context);
        const result=await api.cookies.getAll({...query,storeId,
          ...(key?{partitionKey:key}:{})});
        if(!Array.isArray(result)||result.length>10000)throw fail('E_COOKIE_READ');
        await assertScope(context);
        rows.push(...result);
      }
      return rows;
    };
    const native=await read({domain:host});
    const also=await read({url:document.url});
    // URL receipts establish required shared scopes. Separately inspect already
    // authorized DNS ancestors across ALL Paths: root-page URL matching alone
    // misses login Cookies scoped to /account. These are candidate filters,
    // not guesses about registrable domains or sources of new authorization.
    for(const row of also){
      if(row.partitionKey&&!samePartition(row.partitionKey,partition))continue;
      const parent=parentDomain(host,row);
      if(parent){
        safeRow(row,host,storeId,partition,new Set([parent]));
        context.parents.add(parent);
      }else if(!within(host,row))throw fail('E_ACCOUNT_COOKIE_SCOPE');
    }
    await assertScope(context);
    // Chrome supplies the schemeful site for this top-level document. Bound
    // discovery by that native site, never by a hand-maintained suffix table
    // or a "last two labels" heuristic (which would scan public suffixes).
    const siteHost=new URL(partition.topLevelSite).hostname;
    if(!host.includes(':')&&!/^[\d.]+$/.test(host)&&
       (host===siteHost||host.endsWith('.'+siteHost))){
      const labels=host.split('.');
      for(let index=1;index<labels.length;index++){
        const domain=labels.slice(index).join('.');
        if(domain!==siteHost&&!domain.endsWith('.'+siteHost))break;
        if(context.parents.has(domain))continue;
        const at=new URL(origin);at.hostname=domain;
        let grant;
        try{
          grant=grantFor(context.record.siteRecord,at.origin,true);
          if(grant.storeId!==storeId||grant.partitionKey&&
             !samePartition(grant.partitionKey,partition))continue;
          await permission(at.origin,grant,true);
        }catch(error){
          if(error?.code==='E_SITE_GRANT_REQUIRED')continue;
          throw error;
        }
        context.parents.add(domain);
        await assertScope(context);
      }
    }
    const shared=[];
    for(const domain of context.parents){
      const rows=await read({domain});
      // Native domain filters include descendant hosts. Keep only the exact
      // shared domain, across paths; siblings never enter the account snapshot.
      shared.push(...rows.filter(row=>parentDomain(host,row)===domain));
    }
    const all=[...native,...also,...shared].filter(row=>within(host,row,context.parents)&&
      (!row.partitionKey||samePartition(row.partitionKey,partition)));
    const unique=new Map();
    for(const row of all)unique.set(cookieId(row),row);
    const rows=validateRows([...unique.values()],host,storeId,partition,context.parents);
    if(origin.startsWith('http:')&&rows.some(row=>row.secure))
      throw fail('E_ACCOUNT_COOKIE_SCOPE');
    await assertScope(context);
    return rows;
  }
  async function effect(context,desired){
    // A snapshot captured by this fixed service remains a legitimate restore
    // source after logout clears the last live Cookie. It conveys no permission:
    // validate every saved row and recheck the original, current grants first.
    for(const row of desired){
      const domain=parentDomain(context.host,row);
      if(domain)context.parents.add(domain);
    }
    validateRows(desired,context.host,context.storeId,context.partition,context.parents);
    await assertScope(context);
    const current=await cookiesFor(context);
    const expected=validateRows(desired,context.host,context.storeId,context.partition,context.parents);
    if(context.origin.startsWith('http:')&&expected.some(row=>row.secure))
      throw fail('E_ACCOUNT_COOKIE_SCOPE');
    const steps=planAccountCookieEffects(current,expected);
    if(steps.length>MAX_COOKIES*2)throw fail('E_ACCOUNT_LIMIT');
    let dispatched=false;
    try{
      for(const {kind,row} of steps){
        // Cookie Path is a literal attribute, not a URL pathname. In particular
        // URL dot-segment/escaping normalization must not alter target identity.
        const at=new URL(context.origin);
        at.hostname=row.domain.replace(/^\./,'').toLowerCase();
        const url=at.href;
        const driverContext={approved:true,scope:context,operationOrigin:at.origin};
        await assertScope(context);
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
    const scoped=await scope(document,account.origin,grant,automatic,record);
    if(!account.cookies.length)throw fail('E_ACCOUNT_EMPTY');
    const result=await effect(scoped,account.cookies);
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
    if(operation.startsWith('share')){
      let outgoingScope;
      const authorize=async()=>{
        await hostSender(sender,hostDocumentId);
        const latest=await installed(message);
        if(['shareClaim','sharePair','shareDeliver'].includes(operation)||
          operation==='shareCreate'&&payload.mode==='session')
          await validateDocument(payload.document,origin);
        if(['sharePair','sharePairs','shareDeliver'].includes(operation)||
          operation==='shareCreate'&&payload.mode==='session'||
          operation==='shareClaim'&&payload.senderFingerprint!==undefined){
          const before=grantFor(record.siteRecord,origin,true);
          const grant=grantFor(latest.siteRecord,origin,true);
          if((before===record.siteRecord.cookieAllSites)!==(grant===latest.siteRecord.cookieAllSites)||
            before.grantEpoch!==grant.grantEpoch||before.storeId!==grant.storeId||
            Boolean(before.partitionKey)!==Boolean(grant.partitionKey)||
            before.partitionKey&&!samePartition(before.partitionKey,grant.partitionKey))
            throw fail('E_SITE_GRANT_REQUIRED');
          await permission(origin,grant,true);
        }
        if(outgoingScope)await assertScope(outgoingScope);
      };
      const share=createCookieAccountShare({api,storage,vault,authorize,
        sessionKeys:owner=>deviceKeys(owner,authorize),
        clearSessionKeys:async owner=>(await deviceKeys(owner,authorize)).clear(),
        validateSnapshot:async snapshot=>{
          await authorize();
          if(snapshot.origin!==origin)throw fail('E_SITE_MISMATCH');
          const context=outgoingScope||await scope(payload.document,origin,
            grantFor(record.siteRecord,origin,true),false,record);
          // A saved snapshot may outlive live Cookies, never its permissions.
          // Include every saved parent domain so a missing grant rejects the
          // complete snapshot instead of silently filtering it before transfer.
          for(const row of snapshot.cookies){
            const parent=parentDomain(context.host,row);
            if(parent)context.parents.add(parent);
          }
          const rows=validateRows(snapshot.cookies,context.host,context.storeId,context.partition,context.parents);
          if(origin.startsWith('http:')&&rows.some(row=>row.secure))throw fail('E_ACCOUNT_COOKIE_SCOPE');
          await assertScope(context);
          outgoingScope=context;
          await authorize();
        },
        mapSnapshot:async snapshot=>{
          await authorize();
          const context=await scope(payload.document,origin,grantFor(record.siteRecord,origin,true),false,record);
          // The original read path discovers only already-authorized ancestors.
          // It does not apply the received snapshot or change the current login.
          await cookiesFor(context);
          const rows=mapReceivedAccountCookies(snapshot,context);
          await assertScope(context);await authorize();
          return rows;
        }
      });
      const result=await share.dispatch(operation,payload,
        JSON.stringify([message.packageHash,message.installEpoch]));
      if(operation==='shareClaim')return {...result,...await statusFor(origin)};
      return result;
    }
    if(operation.startsWith('service')){
      const fields=COOKIE_SERVICE_FIELDS[operation];
      const documentAction=['serviceAssociate','serviceCommitAssociation','serviceOpenManagement'].includes(operation);
      if(!fields||fields.some(key=>!Object.hasOwn(payload,key))||Object.keys(payload).some(key=>
        !['origin',...fields,...(documentAction?['document']:[])].includes(key)))throw fail('E_SERVICE_INPUT');
      const needsDocument=operation==='serviceAssociate'||operation==='serviceCommitAssociation'||
        operation==='serviceOpenManagement'&&payload.associationId!=='';
      if(needsDocument)await validateDocument(payload.document,origin);
      const {document:serviceDocument,...metadata}=payload;
      // Recheck installation/sender after document awaits; no caller-provided
      // account metadata, credentials, URL handoff or capabilities are trusted.
      await installed(message);await hostSender(sender,hostDocumentId);
      if(needsDocument)await validateDocument(serviceDocument,origin);
      const identity={extensionId:api.runtime.id,toolId:ID,
        packageHash:record.packageHash,installEpoch:record.installEpoch};
      let localScope=null,localRef=null,selectedAccount=null;
      const assertCurrent=async({allowInactiveDocument=false}={})=>{
          await installed(message);await hostSender(sender,hostDocumentId);
          // A foreground management tab intentionally deactivates the source
          // tab. Only the fixed consumer can acknowledge that completed open;
          // URL/Document/install/account checks still run after the handoff.
          if(needsDocument)await validateDocument(serviceDocument,origin,
            operation==='serviceOpenManagement'&&allowInactiveDocument===true);
          if(localScope)await assertScope(localScope);
          if(selectedAccount){
            const latest=(await statusFor(origin)).accounts.find(item=>item.alias===selectedAccount.alias);
            if(!latest||latest.version!==selectedAccount.version)throw fail('E_VAULT_CONFLICT');
          }
      };
      const localState=await connections.dispatch({operation:'serviceStatus',payload:{origin},identity,assertCurrent});
      // Service-only configuration and Native operations do not consume Cookie
      // accounts. Load them only to create or verify this site's associations;
      // an unrelated unavailable vault must not block connection management.
      const accounts=operation==='serviceAssociate'||localState.associations.length>0
        ?(await statusFor(origin)).accounts:[];
      await assertCurrent();
      const context={identity,accounts,origin,assertCurrent};
      if(operation==='serviceCommitAssociation'||operation==='serviceOpenManagement'&&metadata.associationId!==''){
        const association=localState.associations.find(item=>item.id===metadata.associationId);
        selectedAccount=accounts.find(item=>item.alias===association?.localAlias&&item.origin===origin);
        if(!selectedAccount)throw fail('E_ACCOUNT_NOT_FOUND');
        if(selectedAccount.version!==association.accountVersion)throw fail('E_VAULT_CONFLICT');
      }
      if(operation==='serviceCommitAssociation'){
        // Only native Store/Partition metadata is used for the reference; no
        // Cookie value or snapshot is read, captured or sent by service binding.
        localScope=await scope(serviceDocument,origin,grantFor(record.siteRecord,origin,true),false,record);
        localRef={origin,alias:selectedAccount.alias,version:selectedAccount.version,
          storeId:localScope.storeId,partitionKey:localScope.partition};
        await assertCurrent();
      }
      if(COOKIE_SERVICE_NATIVE_OPERATIONS.includes(operation))
        return serviceSession.dispatch({operation,payload:metadata,localState,localRef,...context});
      if(operation==='serviceStatus')return serviceSession.present(localState,context);
      await serviceSession.guardLocalChange({operation,payload:metadata,localState,identity});
      const changed=await connections.dispatch({operation,payload:metadata,...context});
      return serviceSession.present(changed,context);
    }
    const {revision}=payload;
    if(!Number.isSafeInteger(revision)||revision<0)
      throw fail('E_VAULT_REVISION');
    if(operation==='switch'){
      // The whole dispatch already holds the exclusive lifecycle lock.
      {
        const data=await vault.read();
        if(data.revision!==revision)throw fail('E_VAULT_CONFLICT');
        const account=data.accounts.find(x=>x.alias===payload.alias&&x.origin===origin);
        if(!account)throw fail('E_ACCOUNT_NOT_FOUND');
        const id=String(payload.document?.tabId);let priorFence=null;
        try{
          await api.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
          const prior=(await api.storage.session.get(SEEN_KEY))[SEEN_KEY]?.[id];
          if(prior?.phase==='in_flight'&&new URL(prior.url).origin===origin)priorFence=prior;
        }catch{/* Manual switching does not depend on automatic session storage. */}
        const result=await runSwitch(account,record,payload.document,
          {refresh:data.settings.autoRefresh});
        if(priorFence)try{
          const next=(await api.storage.session.get(SEEN_KEY))[SEEN_KEY]||{};
          if(sameAccountAutoSwitchFence(next[id],priorFence)){
            await hostSender(sender,hostDocumentId);await installed(message);
            // A verified explicit recovery settles the global tab block, but
            // retains the old intent identity: that old URL still cannot replay.
            // Do not label the uncertain automatic write as successfully applied.
            next[id]={...priorFence,phase:'recovered'};
            await api.storage.session.set({[SEEN_KEY]:next});
          }
        }catch{/* Never retry recovery bookkeeping or the verified Cookie effects. */}
        return result;
      }
    }
    let capture=null,captureScope=null;
    if(['create','update','attach'].includes(operation)){
      // A user may save an account name before this website sets any Cookie,
      // or before granting Cookie access. Metadata-only creation has no
      // privileged Cookie read/write effect, but still needs a live document.
      if(operation==='create')await validateDocument(payload.document,origin);
      let grant=null;
      try{grant=grantFor(record.siteRecord,origin,true);}
      catch(error){
        if(operation!=='create'||error?.code!=='E_SITE_GRANT_REQUIRED')throw error;
      }
      if(grant){
        try{captureScope=await scope(payload.document,origin,grant,false,record);}
        catch(error){
          if(operation!=='create'||error?.code!=='E_SITE_GRANT_REQUIRED')throw error;
        }
        if(captureScope)capture=await cookiesFor(captureScope);
      }
      // Only the explicit first association/update needs a nonempty snapshot.
      if(operation!=='create'&&(!capture||!capture.length))
        throw fail('E_ACCOUNT_EMPTY');
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
    if(captureScope)await assertScope(captureScope);
    // Retain a metadata-only save response even if subsequent proof reads fail
    // or a different service instance advances the vault after this commit.
    const savedStatus=['create','attach'].includes(operation)?await statusFor(origin):null;
    let savedAccount=null;
    const changed=await vault.update(revision,async data=>{
      if(captureScope)await assertScope(captureScope);
      else if(operation==='create'){
        // Recheck page and installation before metadata-only commit.
        await validateDocument(payload.document,origin);
        await installed(message);
      }
      const selected=data.accounts.find(item=>item.alias===payload.alias&&item.origin===origin);
      if(['rename','update','attach','delete','allowAlias'].includes(operation)){
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
        const description=normalizeAccountDescription(payload.description);
        savedAccount={alias,origin,displayName,description,version:1,
          cookies:capture??[],allowAuto:false};
        data.accounts.push(savedAccount);
      }else if(operation==='rename'){
        const name=String(payload.displayName||'').trim();
        if(!name||name.length>64)throw fail('E_ACCOUNT_NAME');
        if(data.accounts.some(item=>item.origin===origin&&
          item.alias!==selected.alias&&item.displayName===name))
          throw fail('E_ACCOUNT_NAME_TAKEN');
        const changedName=selected.displayName!==name;
        const description=normalizeAccountDescription(payload.description,
          selected.description??'');
        selected.displayName=name;selected.description=description;
        // Description-only edits must not invalidate snapshot / auto-switch fences.
        if(changedName)selected.version++;
      }else if(operation==='update'){
        selected.cookies=capture;selected.version++;
      }else if(operation==='attach'){
        // First association is a separate, explicit gesture. Never replace
        // a previously saved snapshot through this path.
        if(selected.cookies.length)throw fail('E_ACCOUNT_ALREADY_LINKED');
        selected.cookies=capture;selected.version++;selected.allowAuto=false;
        savedAccount=selected;
      }else if(operation==='delete'){
        data.accounts.splice(data.accounts.indexOf(selected),1);
      }else if(operation==='allowAlias'){
        if(typeof payload.enabled!=='boolean')throw fail('E_ACCOUNT_REQUEST');
        if(payload.enabled&&!selected.cookies.length)throw fail('E_ACCOUNT_EMPTY');
        selected.allowAuto=payload.enabled;selected.version++;
      }else if(operation==='setAutoEnabled'||operation==='setAutoRefresh'){
        if(typeof payload.enabled!=='boolean')throw fail('E_ACCOUNT_REQUEST');
        data.settings[operation==='setAutoEnabled'?'autoEnabled':'autoRefresh']=payload.enabled;
      }else throw fail('E_ACCOUNT_REQUEST');
      if(savedAccount){
        savedStatus.accounts=data.accounts.filter(item=>item.origin===origin)
          .map(item=>meta({...item,cookieCount:item.cookies.length}));
        savedStatus.settings={...data.settings};
      }
    });
    const value=savedStatus?{...savedStatus,revision:changed}:await statusFor(origin);
    if(savedAccount){
      // A saved snapshot is not evidence of the current website identity.
      // Verify once, under the original scope, without any native write or retry.
      // A failed proof must never turn a successful save into a failed operation.
      try{
        if(!capture?.length)return value;
        const current=await cookiesFor(captureScope);
        const snapshotMatches=rows=>same(
          validateRows(rows,captureScope.host,captureScope.storeId,
            captureScope.partition,captureScope.parents),capture);
        if(!snapshotMatches(current))return value;
        await hostSender(sender,hostDocumentId);
        await assertScope(captureScope);
        const latest=await vault.read();
        const account=latest.accounts.find(item=>item.alias===savedAccount.alias&&
          item.origin===origin&&item.version===savedAccount.version);
        if(latest.revision===changed&&account&&snapshotMatches(account.cookies)){
          await hostSender(sender,hostDocumentId);
          await assertScope(captureScope);
          const {tabId,documentId,url}=captureScope.document;
          const publicUrl=new URL(url);
          return {...value,currentSnapshot:{alias:account.alias,version:account.version,
            revision:changed,document:{tabId,documentId,url:publicUrl.origin+publicUrl.pathname}}};
        }
      }catch{/* The account was saved; only current-identity proof is unavailable. */}
      return value;
    }
    if(value.revision!==changed)throw fail('E_OUTCOME_UNKNOWN');
    return value;
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
      const allow=data.accounts.filter(x=>x.origin===origin&&x.allowAuto&&x.cookies.length>0).map(x=>x.alias);
      const tested=inspectAccountSwitchUrl(url.href,{expectedOrigin:origin,
        enabled:true,approvedFragment:true,allowedAliases:allow});
      if(tested.status!=='eligible')return;
      const account=data.accounts.find(x=>x.origin===origin&&x.alias===tested.alias);
      if(!account)return;
      const frame=await api.webNavigation.getFrame({tabId:event.tabId,frameId:0});
      const document={tabId:event.tabId,documentId:frame?.documentId,url:event.url};
      await validateDocument(document,origin,true);
      {
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
      }
    }catch{/* Never retry, navigate, log account names or expose Cookie bytes. */}
  }
  // Fixed SW lifecycle hook only; never admitted by the account RPC contract.
  // Queue from entry, including authorization and capture: cleanup must drain
  // older requests before deleting data, and later installs can then start fresh.
  return Object.freeze({
    dispatch:(message,sender)=>exclusive(()=>dispatch(message,sender)),
    navigation:event=>exclusive(()=>navigation(event)),
    cleanup:()=>exclusive(async()=>{
      await createCookieAccountShare({api,storage,vault,
        // The original SW-only uninstall hook owns this cleanup, after normal
        // handles have been revoked. This callback never enters the RPC surface.
        clearSessionKeys:async owner=>(await deviceKeys(owner,async()=>{})).clear()
      }).clear();
      await serviceSession.clear();await connections.clear();
      return vault.clear();
    })
  });
}
export function installCookieAccountService({api=globalThis.chrome,storage,serviceTransport}={}){
  const service=createCookieAccountService({api,storage,serviceTransport});
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
