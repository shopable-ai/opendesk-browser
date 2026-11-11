// The existing MV3 Service Worker is the sole writer of cross-tab update notices.
// This sidecar reuses the official catalog, installed Tool registry, verified
// storage helper and original Installer. It never installs or grants permissions.
import {loadOfficialCatalog,matchesOfficialRelease} from '../../sidebar-tools/official-catalog.js';
import {compareToolVersions,getInstalledSidebarTools,MARKET_PROVENANCE_STORE,
  MARKET_OPERATIONS_STORE} from '../../ui/sidebar-tools/installation.js';
import {sidebarToolPackageHash,SIDEBAR_TOOL_STORE} from '../../ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,requireToolEnableRecords,sidebarToolEnabled}
  from '../../ui/sidebar-tools/lifecycle.js';
import {READING_TOC_SITE_STORE,tocSiteAllowed} from '../../../projects/reading-toc/trusted/policy.js';
// Do NOT import Prompt Shortcuts model/policy into the fixed SW bundle.
// Its dynamic model is intentionally excluded by the existing provenance gate.
const PROMPT_SITE_STORE='opendesk.sidebar-tools.prompt-sites.v1';
const PROMPT_ID='prompt-shortcuts';
import {writeVerifiedLocalValue} from '../../ui/sidebar-tools/storage-state.js';
import {showTrustedUpdateToast} from './update-notice-page.js';
import {UPDATE_NOTICE_PROTOCOL,UPDATE_NOTICE_STORE,UPDATE_NOTICE_LOCK,
  readUpdateNoticeState,appendTrustedRelease,trustedUpdateReleaseKey,
  browserUpdateReleaseKey,claimUpdateToast,acknowledgeUpdateToast,
  actOnUpdateToast,setNoticePreference,updateNoticeSnapshot,
  formatUpdateBadgeCount} from './update-notice-state.js';

const safeOrigins=new Set(['https://chatgpt.com','https://chat.deepseek.com',
  'https://gemini.google.com']);
const fail=(code,message=code)=>Object.assign(new Error(message),{code});
const knownStatus=new Set(['available','review_required']);
const isPlain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const errorText=error=>String(error?.code||error?.message||'E_UPDATE_UNKNOWN').slice(0,140);

export function installUpdateNoticeService({api=globalThis.chrome,now=()=>Date.now(),
  lockManager=globalThis.navigator?.locks,development=false,loadCatalog=loadOfficialCatalog,
  loadInstalled=getInstalledSidebarTools}={}){
  if(!api?.runtime?.onMessage||!api?.storage?.local||!api?.runtime?.getURL)
    throw fail('E_UPDATE_HOST');
  let writeUnknown=false,verifiedInventory=false,lastInventoryAt=0,lastError=null;
  let reconciling=null,kicking=null;
  let authorityRevision=0;
  let badgeSequence=0,badgeWork=Promise.resolve();
  const liveClaims=new Map();
  // Chrome Action is owned by this trusted Worker, never a Side Panel or Tool.
  // All writes serialize; a late asynchronous result cannot replace a newer badge.
  function syncBadge(){
    if(typeof api.action?.setBadgeText!=='function')return badgeWork;
    const sequence=++badgeSequence;
    badgeWork=badgeWork.catch(()=>{}).then(async()=>{
      if(sequence!==badgeSequence)return;
      let count=0;
      try{
        if(verifiedInventory&&!writeUnknown&&now()-lastInventoryAt<300000)
          count=updateNoticeSnapshot(await read()).badgeCount;
      }catch{/* Corrupt or unavailable storage fails closed to no number. */}
      if(sequence!==badgeSequence)return;
      const label=count?'打开侧边栏 · '+count+' 项扩展待更新':'打开侧边栏';
      try{
        await api.action.setBadgeText({text:formatUpdateBadgeCount(count)});
        await api.action.setBadgeBackgroundColor?.({color:'#2563eb'});
        await api.action.setTitle?.({title:label});
      }catch(error){console.warn('[update-notice badge]',errorText(error));}
    });
    return badgeWork;
  }
  const manifest=()=>api.runtime.getManifest();
  const read=async()=>readUpdateNoticeState(
    (await api.storage.local.get(UPDATE_NOTICE_STORE))[UPDATE_NOTICE_STORE]);
  // No iframe, content script or UI page writes the notice store directly.
  // A lost/ambiguous write ACK fences this worker until a fresh read-only check.
  async function mutate(produce){
    if(writeUnknown)throw fail('E_UPDATE_WRITE_UNKNOWN','通知写入结果未知，只允许只读核对');
    if(!lockManager?.request)throw fail('E_UPDATE_LOCK','缺少扩展共享 Web Lock，拒绝跨页写入');
    return lockManager.request(UPDATE_NOTICE_LOCK,{mode:'exclusive'},async()=>{
      const before=await read();
      const next=await produce(before);
      if(!next)return null;
      if(next===before)return before;
      try{await writeVerifiedLocalValue(api,UPDATE_NOTICE_STORE,next,before,'更新通知状态');}
      catch(error){
        if(error?.code==='E_OUTCOME_UNKNOWN')writeUnknown=true;
        if(writeUnknown)void syncBadge();
        throw error;
      }
      void syncBadge();
      return next;
    });
  }
  function trustedUi(sender){
    if(sender?.id!==api.runtime.id||sender.incognito===true||sender.tab?.incognito)return false;
    if(sender.frameId!==undefined&&sender.frameId!==0)return false;
    try{
      const url=new URL(sender.url||sender.documentUrl||'');
      const expected=new URL(api.runtime.getURL('/'));
      return url.protocol===expected.protocol&&url.host===expected.host&&
        ['/sidepanel.html','/app.html'].includes(url.pathname)&&
        !url.username&&!url.password;
    }catch{return false;}
  }
  function trustedPage(sender){
    if(sender?.id!==api.runtime.id||!sender.tab||
       sender.tab.incognito||sender.frameId!==0||
       typeof sender.documentId!=='string'||!sender.documentId)return false;
    try{
      const source=new URL(sender.url);
      return source.protocol==='https:'&&safeOrigins.has(source.origin)&&
        source.origin===new URL(sender.tab.url).origin;
    }catch{return false;}
  }
  async function siteAllowed(origin,installed=null,enabled=null){
    if(!safeOrigins.has(origin))return false;
    if(await api.permissions.contains({origins:[origin+'/*']})!==true)return false;
    const [rows,values,sites]=await Promise.all([
      installed?Promise.resolve(installed):loadInstalled(api),
      enabled?Promise.resolve(enabled):api.storage.local.get(SIDEBAR_TOOL_ENABLE_STORE),
      api.storage.local.get([READING_TOC_SITE_STORE,PROMPT_SITE_STORE])
    ]);
    const records=enabled||requireToolEnableRecords(values[SIDEBAR_TOOL_ENABLE_STORE]);
    // An already granted, enabled installed tool is the site authority;
    // a broad Chrome <all_urls> permission by itself is insufficient.
    const reader=rows.find(row=>row.id==='reading-toc'&&row.capabilities?.includes('page.toc'));
    if(reader&&sidebarToolEnabled(records,reader.id)&&
       tocSiteAllowed(sites[READING_TOC_SITE_STORE],reader.id,origin))return true;
    // Only the framework-known fixed ChatGPT grant is recognized here.
    // Dynamic site choices belong to the original tool/Page authority and
    // may not be inferred from a user package, model or arbitrary DOM.
    const prompt=rows.find(row=>row.id===PROMPT_ID&&row.capabilities?.includes('page.prompts'));
    return Boolean(prompt&&sidebarToolEnabled(records,PROMPT_ID)&&origin==='https://chatgpt.com');
  }
  function isPublishedSource(tool,record,hash){
    return record?.marketId==='opendesk/'+tool.id&&record.version===tool.version&&record.sha256===hash;
  }
  async function inventory(){
    const [catalog,installed,data]=await Promise.all([
      loadCatalog({api}),loadInstalled(api),
      api.storage.local.get([MARKET_PROVENANCE_STORE,MARKET_OPERATIONS_STORE,
        SIDEBAR_TOOL_ENABLE_STORE,SIDEBAR_TOOL_STORE])
    ]);
    const sources=data[MARKET_PROVENANCE_STORE]||{};
    const operations=data[MARKET_OPERATIONS_STORE]||{};
    const enabled=requireToolEnableRecords(data[SIDEBAR_TOOL_ENABLE_STORE]);
    if(!isPlain(sources)||!isPlain(operations))throw fail('E_UPDATE_READBACK');
    const pending=Object.values(operations).filter(row=>isPlain(row)&&
      row.state!=='succeeded'&&row.state!=='failed'&&row.state!=='cancelled');
    const candidates=[];
    for(const release of catalog.apps){
      const old=installed.find(row=>row.id===release.toolId);
      if(!old)continue; // This is an update center, not an auto-installer.
      const comparison=compareToolVersions(release.version,old.version);
      if(comparison<0)continue;
      const hash=await sidebarToolPackageHash(old);
      const published=isPublishedSource(old,sources[old.id],hash);
      const inFlight=pending.some(op=>op.toolId===old.id);
      const newCapabilities=release.capabilities.filter(cap=>!old.capabilities.includes(cap));
      let status;
      if(comparison>0){
        status=!published||!sidebarToolEnabled(enabled,old.id)||inFlight?
          'unknown':newCapabilities.length?'review_required':'available';
      }else{
        // The trusted market receipt AND current package bytes must match.
        // A same-string version or side-panel toast cannot prove installation.
        const journal=Object.values(operations).some(op=>op?.state==='succeeded'&&
          op.toolId===old.id&&op.marketId===release.id&&
          op.version===release.version&&op.sha256===release.sha256);
        status=published&&journal&&await matchesOfficialRelease(release,old)?
          'applied':'unknown';
      }
      candidates.push({kind:'sidebar-tool',key:trustedUpdateReleaseKey({
        id:release.toolId,version:release.version,sha256:release.sha256}),
        id:release.toolId,version:release.version,sha256:release.sha256,
        title:release.packageTitle,description:release.description,
        source:release.id,fromVersion:old.version,
        status,newCapabilities,requiresReview:comparison>0});
    }
    return {candidates,registry:data[SIDEBAR_TOOL_STORE],
      provenance:data[MARKET_PROVENANCE_STORE],enable:data[SIDEBAR_TOOL_ENABLE_STORE]};
  }
  async function reconcile(){
    if(reconciling)return reconciling;
    reconciling=(async()=>{
      try{
        await hideIneligibleClaims();
        const observed=await inventory();
        const expiredToastClaims=new Map();
        await mutate(async state=>{
          // Prevent a stale read from reviving an update after a concurrent
          // install, disable, source change or revocation in the original owner.
          const current=await api.storage.local.get([SIDEBAR_TOOL_STORE,
            MARKET_PROVENANCE_STORE,SIDEBAR_TOOL_ENABLE_STORE]);
          if(JSON.stringify(current[SIDEBAR_TOOL_STORE])!==JSON.stringify(observed.registry)||
             JSON.stringify(current[MARKET_PROVENANCE_STORE])!==JSON.stringify(observed.provenance)||
             JSON.stringify(current[SIDEBAR_TOOL_ENABLE_STORE])!==JSON.stringify(observed.enable))
            return null;
          const time=now(),active=new Set(observed.candidates.map(row=>row.key));
          let next=state,dirty=false;
          for(const candidate of observed.candidates){
            const old=next.records[candidate.key];
            if(old?.claim?.ackedAt>0&&['applied','unknown'].includes(candidate.status))
              expiredToastClaims.set(old.claim.token,old.claim.tabId);
            if(old&&old.status===candidate.status&&old.title===candidate.title&&
               old.description===candidate.description&&
               JSON.stringify(old.newCapabilities)===JSON.stringify(candidate.newCapabilities))continue;
            next=appendTrustedRelease(next,candidate,time);dirty=true;
          }
          for(const row of Object.values(next.records)){
            if(row.kind!=='sidebar-tool'||active.has(row.key)||row.status==='unknown'||
               row.status==='applied')continue;
            if(row.claim?.ackedAt>0)expiredToastClaims.set(row.claim.token,row.claim.tabId);
            next=appendTrustedRelease(next,{kind:'sidebar-tool',key:row.key,id:row.id,
              version:row.version,sha256:row.sha256,title:row.title,
              description:row.description,fromVersion:row.fromVersion,status:'unknown',
              newCapabilities:row.newCapabilities,requiresReview:row.requiresReview},time);dirty=true;
          }
          return dirty?next:null;
        });
        lastInventoryAt=now();verifiedInventory=true;lastError=null;
        await syncBadge();
        for(const [token,tabId] of expiredToastClaims){
          liveClaims.delete(token);
          void Promise.resolve(api.tabs.sendMessage(tabId,{protocol:UPDATE_NOTICE_PROTOCOL,
            kind:'hide',token})).catch(()=>{});
        }
        return true;
      }catch(error){
        // Never use a cached catalog as proof of a newly offered update.
        verifiedInventory=false;lastError=errorText(error);
        await syncBadge();
        return false;
      }finally{reconciling=null;}
    })();
    return reconciling;
  }
  async function ensureInventory(){
    return verifiedInventory&&now()-lastInventoryAt<300000?true:reconcile();
  }
  async function eligibleTab(tab){
    if(!tab||!Number.isSafeInteger(tab.id)||tab.incognito||!tab.active||!tab.url)return null;
    let origin;
    try{origin=new URL(tab.url).origin;}catch{return null;}
    if(!safeOrigins.has(origin)||!await siteAllowed(origin))return null;
    const frame=await api.webNavigation.getFrame({tabId:tab.id,frameId:0}).catch(()=>null);
    if(!frame||typeof frame.documentId!=='string'||!frame.documentId||
       frame.documentLifecycle!=='active'||frame.url!==tab.url||
       frame.errorOccurred||!tab.active)return null;
    return {tabId:tab.id,documentId:frame.documentId,origin};
  }
  async function hideIneligibleClaims(){
    // Persisted leases also identify a visible toast after the Worker restarts.
    // Hiding never resets impressions or retries an ambiguous write.
    const claims=new Map(Object.values((await read()).records)
      .filter(row=>row.claim).map(row=>[row.claim.token,row.claim]));
    for(const [token,claim] of claims){
      let allowed=false;
      try{
        const tab=await api.tabs.get(claim.tabId);
        allowed=!tab.incognito&&await siteAllowed(new URL(tab.url).origin);
      }catch{/* Missing tab, permission or grant is not authority to keep UI. */}
      if(allowed)continue;
      liveClaims.delete(token);
      try{await api.tabs.sendMessage(claim.tabId,{protocol:UPDATE_NOTICE_PROTOCOL,
        kind:'hide',token},{documentId:claim.documentId});}catch{/* Page already gone. */}
    }
  }
  function invalidateSiteClaims(){
    authorityRevision++;
    // Remove synchronous gesture hints before any asynchronous permission read.
    liveClaims.clear();
    void hideIneligibleClaims().catch(()=>{});
  }
  async function releaseClaim(token){
    try{await mutate(state=>{
      let dirty=false;
      for(const row of Object.values(state.records))if(row.claim?.token===token&&
        row.claim.ackedAt===0){row.claim=null;dirty=true;}
      if(dirty)state.revision++;
      return dirty?state:null;
    });}catch{/* An unknown result must never trigger another immediate claim. */}
  }
  async function checkToast(){
    if(kicking)return kicking;
    kicking=(async()=>{
      if(!await ensureInventory()||writeUnknown)return;
      const tabs=await api.tabs.query({active:true}).catch(()=>[]);
      for(const tab of tabs){
        const revision=authorityRevision;
        const target=await eligibleTab(tab).catch(()=>null);
        if(!target)continue;
        const token='claim-'+crypto.randomUUID();
        let result;
        try{
          result=await mutate(state=>{
            const claimed=claimUpdateToast(state,{now:now(),...target,token});
            return claimed?.state||null;
          });
        }catch{return;}
        const rows=Object.values(result?.records||{}).filter(row=>row.claim?.token===token);
        if(!rows.length)continue;
        const count=rows.length;
        const message=count===1?rows[0].title+' 有新版本':
          count+' 项扩展有更新';
        try{
          const current=await eligibleTab(await api.tabs.get(target.tabId));
          if(revision!==authorityRevision||current?.documentId!==target.documentId||
             current.origin!==target.origin){await releaseClaim(token);return;}
          const injected=await api.scripting.executeScript({target:{tabId:target.tabId,
            documentIds:[target.documentId]},
            world:'ISOLATED',func:showTrustedUpdateToast,args:[{
              token,origin:target.origin,message
            }]});
          if(injected?.[0]?.result!==true)await releaseClaim(token);
        }catch{await releaseClaim(token);}
        return; // One toast per Profile, even when the first tab is blocked.
      }
    })().finally(()=>{kicking=null;});
    return kicking;
  }
  async function replyList(){
    const verified=await ensureInventory();
    const value=updateNoticeSnapshot(await read());
    const trusted=verified===true&&!writeUnknown;
    return {...value,verified:trusted,
      // A stale persisted candidate is not an actionable, verified update.
      actionableCount:trusted?value.actionableCount:0,
      unreadCount:trusted?value.unreadCount:0,
      badgeCount:trusted?value.badgeCount:0,
      newCount:trusted?value.newCount:0,
      problem:writeUnknown?'E_UPDATE_WRITE_UNKNOWN':verified?null:lastError};
  }
  async function recordBrowser(status,versionValue,fromVersion=null){
    const id=api.runtime.id,entry={kind:'browser',
      key:browserUpdateReleaseKey(id,versionValue),id,version:versionValue,
      title:manifest().name||'OpenDesk Browser',status,
      source:'Chrome',fromVersion,requiresReview:false};
    await mutate(state=>appendTrustedRelease(state,entry,now()));
  }
  function openFallbackUpdateTab(){
    // Trusted document only. This cannot approve or install anything.
    try{void Promise.resolve(api.tabs.create({url:api.runtime.getURL('sidepanel.html')}))
      .catch(()=>{});}catch{/* No retry when the browser cannot open the page. */}
  }
  async function handle(message,sender,{openedOnGesture=null}={}){
    if(!isPlain(message)||message.protocol!==UPDATE_NOTICE_PROTOCOL)return null;
    const ui=trustedUi(sender),page=trustedPage(sender);
    if(!ui&&!page)throw fail('E_UPDATE_SENDER');
    if(ui){
      if(message.kind==='list')return replyList();
      if(message.kind==='set-mode'){
        if(typeof message.mode!=='string'||(message.toolId!==null&&message.toolId!==undefined&&
          typeof message.toolId!=='string'))throw fail('E_UPDATE_PREFERENCE');
        const saved=await mutate(state=>setNoticePreference(state,
          {mode:message.mode,toolId:message.toolId||null},now()));
        if(message.mode!=='toast+inbox'){
          // Persisted leases survive a Worker restart, unlike an in-memory map.
          const claims=new Map(Object.values(saved.records).filter(row=>row.claim?.ackedAt>0)
            .map(row=>[row.claim.token,row.claim.tabId]));
          for(const [token,tabId] of claims){
            liveClaims.delete(token);
            void Promise.resolve(api.tabs.sendMessage(tabId,{protocol:UPDATE_NOTICE_PROTOCOL,
              kind:'hide',token})).catch(()=>{});
          }
        }
        return replyList();
      }
      if(message.kind==='action'){
        if(typeof message.key!=='string')throw fail('E_UPDATE_ACTION');
        let toHide=null;
        const saved=await mutate(state=>{
          const row=state.records[message.key];
          if(row?.claim?.ackedAt>0)toHide={token:row.claim.token,tabId:row.claim.tabId};
          return actOnUpdateToast(state,
            {now:now(),action:message.action,token:null,key:message.key});
        });
        if(!saved)throw fail('E_UPDATE_NOT_FOUND');
        if(toHide){
          liveClaims.delete(toHide.token);
          void Promise.resolve(api.tabs.sendMessage(toHide.tabId,{
            protocol:UPDATE_NOTICE_PROTOCOL,kind:'hide',token:toHide.token})).catch(()=>{});
        }
        return updateNoticeSnapshot(saved);
      }
      if(message.kind==='clear-open'){
        await mutate(state=>{if(!state.openRequestedAt)return null;
          state.openRequestedAt=0;state.revision++;return state;});
        return {ok:true};
      }
      throw fail('E_UPDATE_OPERATION');
    }
    if(message.kind==='page-visible'||message.kind==='page-action'){
      const revision=authorityRevision;
      const requireCurrentAuthority=()=>{
        if(revision!==authorityRevision)throw fail('E_UPDATE_SITE_REVOKED');
      };
      if(typeof message.token!=='string')throw fail('E_UPDATE_CLAIM');
      // Check Chrome permission, enabled tools, and current document again
      // before accepting any message from an isolated content-script world.
      const target=await eligibleTab(sender.tab);
      if(!target||target.documentId!==sender.documentId)throw fail('E_UPDATE_SITE_REVOKED');
      requireCurrentAuthority();
      if(message.kind==='page-visible'){
        const result=await mutate(state=>{
          requireCurrentAuthority();
          const ack=acknowledgeUpdateToast(state,{now:now(),token:message.token,
            tabId:sender.tab.id,documentId:sender.documentId});
          return ack?.duplicate?null:ack?.state||null;
        });
        requireCurrentAuthority();
        if(!result)throw fail('E_UPDATE_CLAIM_STALE');
        liveClaims.set(message.token,{token:message.token,tabId:sender.tab.id,
          documentId:sender.documentId});
        return {ok:true};
      }
      const saved=await mutate(state=>{
        requireCurrentAuthority();
        return actOnUpdateToast(state,{now:now(),action:message.action,
          token:message.token,tabId:sender.tab.id,documentId:sender.documentId});
      });
      requireCurrentAuthority();
      if(!saved)throw fail('E_UPDATE_CLAIM_STALE');
      liveClaims.delete(message.token);
      if(message.action==='view'){
        // A real click opens the panel synchronously in onMessage, before any await.
        // A SW restart may lose that hint; a verified persisted action can still
        // open the existing fixed HTML in a normal tab. No install is performed.
        if(openedOnGesture)
          void openedOnGesture.then(opened=>{
            if(!opened&&revision===authorityRevision)openFallbackUpdateTab();
          });
        else openFallbackUpdateTab();
      }
      return {ok:true};
    }
    throw fail('E_UPDATE_OPERATION');
  }
  const onMessage=(message,sender,reply)=>{
    if(message?.protocol!==UPDATE_NOTICE_PROTOCOL)return false;
    // Chrome's sidePanel.open requires the ORIGINAL user-gesture event stack.
    // Opening after the awaited storage transaction loses that privilege.
    // Synchronous sender + live visible-claim checks are presentation only;
    // the async Host handler still verifies permissions and persists VIEWED.
    let openedOnGesture=null;
    if(message.kind==='page-action'&&message.action==='view'&&
       typeof message.token==='string'&&trustedPage(sender)){
      const claim=liveClaims.get(message.token);
      if(claim?.tabId===sender.tab.id&&claim.documentId===sender.documentId){
        try{
          const pending=api.sidePanel?.open?.({tabId:sender.tab.id});
          if(pending)openedOnGesture=Promise.resolve(pending).then(()=>true,()=>false);
        }catch{openedOnGesture=Promise.resolve(false);}
      }
    }
    Promise.resolve().then(()=>handle(message,sender,{openedOnGesture})).then(data=>
      reply({ok:true,data}),error=>reply({ok:false,error:{
        code:error?.code||'E_UPDATE_UNKNOWN',message:errorText(error)}}));
    return true;
  };
  api.runtime.onMessage.addListener(onMessage);
  api.runtime.onInstalled?.addListener(details=>{
    if(!development&&details?.reason==='update'){
      const current=manifest().version;
      if(details.previousVersion!==current)
        void recordBrowser('applied',current,details.previousVersion||null)
          .catch(error=>console.warn('[update-notice browser]',errorText(error)));
    }
    void reconcile().then(ok=>{if(ok)void checkToast();});
  });
  api.runtime.onUpdateAvailable?.addListener(details=>{
    if(!development&&typeof details?.version==='string')void recordBrowser('pending_browser_apply',details.version)
      .catch(error=>console.warn('[update-notice browser]',errorText(error)));
  });
  api.storage.onChanged?.addListener((changes,area)=>{
    if(area!=='local'||![SIDEBAR_TOOL_STORE,MARKET_PROVENANCE_STORE,
      MARKET_OPERATIONS_STORE,SIDEBAR_TOOL_ENABLE_STORE,READING_TOC_SITE_STORE,PROMPT_SITE_STORE]
      .some(key=>Object.hasOwn(changes,key)))return;
    if([SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,READING_TOC_SITE_STORE,PROMPT_SITE_STORE]
      .some(key=>Object.hasOwn(changes,key)))invalidateSiteClaims();
    verifiedInventory=false;
    void reconcile().then(ok=>{if(ok)void checkToast();});
  });
  api.permissions?.onRemoved?.addListener(invalidateSiteClaims);
  api.tabs.onActivated?.addListener(()=>{void checkToast();});
  api.tabs.onUpdated?.addListener((_tabId,change)=>{
    if(change.status==='complete'||change.url)void checkToast();
  });
  api.runtime.onStartup?.addListener(()=>{void reconcile().then(ok=>{if(ok)void checkToast();});});
  void syncBadge(); // Clear any previous badge until the inventory is verified.
  void reconcile().then(ok=>{if(ok)void checkToast();});
  return Object.freeze({read,replyList,reconcile,checkToast,syncBadge});
}
