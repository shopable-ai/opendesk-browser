// Single trusted MV3 analytics authority. The sandbox is never a telemetry sender.
import {ANALYTICS_PROTOCOL,ANALYTICS_ALARM,ANALYTICS_PAGE_SCOPE_CHECK,ANALYTICS_DISCLOSURE_VERSION,ANALYTICS_PROMPT_TOOL_ID as PROMPT_ID} from './contract.js';
import {ANALYTICS_INGEST_URL} from './config.js';
import {createAnalyticsCollector} from './collector.js';
import {SIDEBAR_TOOL_STORE,MAX_INSTALLED_TOOLS} from '../ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,sidebarToolEnabled} from '../ui/sidebar-tools/lifecycle.js';

const idPattern=/^[a-z][a-z0-9-]{1,39}$/;
const uuidPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const exact=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.keys(obj).every(key=>keys.includes(key));
export function installAnalyticsHost({api=globalThis.chrome,endpoint=ANALYTICS_INGEST_URL,
  fetcher=globalThis.fetch,now=()=>Date.now(),newId=()=>crypto.randomUUID(),allowLoopback=false,
  loadAuthority=null}={}){
  const collector=createAnalyticsCollector({api,endpoint,fetcher,now,newId,allowLoopback});
  const recordAuthorities=()=>typeof loadAuthority==='function'?
    collector.reportAuthority(loadAuthority):Promise.resolve({recorded:false});
  const optionsURL=api.runtime.getURL('native-agent/settings.html');
  const sidepanelURL=api.runtime.getURL('sidepanel.html');
  const extensionId=api.runtime.id;
  const fromOptions=sender=>sender?.id===extensionId&&sender.url===optionsURL&&!sender.tab;
  // Canonical ToolShell documents always carry a hostInstanceId query parameter.
  // The previous exact-URL check silently rejected real Side Panel tool opens.
  const panelContextId=sender=>{
    if(sender?.id!==extensionId||sender?.incognito===true||
      sender?.tab?.incognito===true||(sender?.frameId!==undefined&&sender.frameId!==0)||
      typeof sender.url!=='string')return null;
    try{
      const actual=new URL(sender.url),expected=new URL(sidepanelURL);
      if(actual.protocol!==expected.protocol||actual.host!==expected.host||
        actual.pathname!==expected.pathname||
        actual.hash||actual.searchParams.has('previewId')||
        actual.searchParams.has('scheduledRunner')||
        [...actual.searchParams.keys()].some(key=>!['hostInstanceId','toolId'].includes(key))||
        (sender.tab?.url&&sender.tab.url!==sender.url))return null;
      const ids=actual.searchParams.getAll('hostInstanceId');
      return ids.length===1&&uuidPattern.test(ids[0])?ids[0]:null;
    }catch{return null;}
  };
  const fromPanel=sender=>Boolean(panelContextId(sender));
  const toolInstalled=async id=>{
    const stored=await api.storage.local.get([SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE]);
    return Array.isArray(stored[SIDEBAR_TOOL_STORE])&&
      stored[SIDEBAR_TOOL_STORE].some(tool=>tool?.id===id)&&
      sidebarToolEnabled(stored[SIDEBAR_TOOL_ENABLE_STORE],id);
  };
  async function recordInventory(){
    // Existing trusted installation registry, never package self-reports.
    const stored=await api.storage.local.get(SIDEBAR_TOOL_STORE);
    const rows=stored[SIDEBAR_TOOL_STORE];
    if(rows!==undefined&&!Array.isArray(rows))return {recorded:false};
    const ids=(rows||[]).map(row=>row?.id);
    if(ids.length>MAX_INSTALLED_TOOLS||ids.some(id=>!idPattern.test(id||''))||
      new Set(ids).size!==ids.length)return {recorded:false};
    return collector.record({event:'app.inventory',toolId:'opendesk',source:'host',
      channel:'extension',installedTools:ids.sort()});
  }
  const promptPageIdentity=sender=>{
    if(sender?.id!==extensionId||sender.incognito===true||
       (sender.documentLifecycle!==undefined&&sender.documentLifecycle!=='active')||
       !Number.isInteger(sender.tab?.id)||sender.tab.id<0||sender.tab.incognito!==false||
       sender.frameId!==0||typeof sender.documentId!=='string'||!sender.documentId||
       typeof sender.url!=='string'||sender.tab.url!==sender.url||
       sender.tab.pendingUrl!==undefined)return null;
    try{
      const url=new URL(sender.url);
      if(!['http:','https:'].includes(url.protocol)||!url.hostname||
         url.username||url.password||url.href!==sender.url)return null;
      return {tabId:sender.tab.id,documentId:sender.documentId,url:sender.url};
    }catch{return null;}
  };
  const fromPromptPage=async sender=>{
    const identity=promptPageIdentity(sender);
    if(!identity||typeof api.tabs?.sendMessage!=='function'||
       typeof api.tabs?.get!=='function'||typeof api.webNavigation?.getFrame!=='function')return false;
    const {tabId,documentId,url}=identity;
    const currentDocument=async()=>{
      const [frame,tab]=await Promise.all([
        api.webNavigation.getFrame({tabId,frameId:0}),api.tabs.get(tabId)
      ]);
      return frame?.documentId===documentId&&frame.url===url&&
        frame.documentLifecycle==='active'&&frame.errorOccurred===false&&
        tab?.id===tabId&&tab.url===url&&tab.incognito===false&&
        tab.pendingUrl===undefined;
    };
    let timer;
    try{
      return await Promise.race([
        (async()=>{
          if(!await currentDocument())return false;
          const allowed=await api.tabs.sendMessage(tabId,{
            protocol:ANALYTICS_PROTOCOL,kind:ANALYTICS_PAGE_SCOPE_CHECK,expectedUrl:url
          },{frameId:0,documentId});
          if(allowed!==true)return false;
          // A cached/error document or pending navigation cannot authorize usage.
          return currentDocument();
        })(),
        new Promise(resolve=>{timer=setTimeout(()=>resolve(false),1000);})
      ]);
    }catch{return false;}
    finally{clearTimeout(timer);}
  };
  const counts=new Map();
  const limit=key=>{
    const minute=Math.floor(now()/60000),row=counts.get(key);
    if(row?.minute!==minute){counts.set(key,{minute,count:1});return true;}
    if(row.count>=50)return false;
    row.count++;return true;
  };
  async function handle(message,sender){
    if(!exact(message,['protocol','kind','enabled','disclosureVersion','event','toolId','channel','reason'])||
       message.protocol!==ANALYTICS_PROTOCOL)return {ok:false,code:'E_SCHEMA'};
    if(message.kind==='consent.status'){
      if(!fromOptions(sender)||!exact(message,['protocol','kind']))return {ok:false,code:'E_SENDER'};
      return {ok:true,data:await collector.status()};
    }
    if(message.kind==='consent.set'){
      if(!fromOptions(sender)||typeof message.enabled!=='boolean'||
         !exact(message,['protocol','kind','enabled','disclosureVersion'])||
         (message.enabled?message.disclosureVersion!==ANALYTICS_DISCLOSURE_VERSION:
           message.disclosureVersion!==undefined))return {ok:false,code:'E_SENDER'};
      const data=await collector.setConsent(message.enabled,{
        disclosureVersion:message.disclosureVersion
      });
      // Opt-in immediately captures the pre-existing inventory, including zero tools.
      // Census failure cannot undo a consent write or break the Options page.
      if(message.enabled){
        await recordInventory().catch(()=>{});
        // The original IndexedDB authority is read only after opt-in.
        // A failed Page/Task read is recorded as UNKNOWN, never as zero installed.
        await recordAuthorities().catch(()=>{});
      }
      return {ok:true,data};
    }
    if(!idPattern.test(message.toolId||'')||typeof message.event!=='string'||
       !exact(message,['protocol','kind','event','toolId','channel','reason']))
      return {ok:false,code:'E_SCHEMA'};
    if(message.kind==='event.host_report'){
      const contextId=panelContextId(sender);
      if(!contextId||message.channel!=='sidepanel')return {ok:false,code:'E_SENDER'};
      if(message.event==='app.opened'&&message.toolId==='opendesk')
        return {ok:true,data:await collector.record({event:'app.opened',toolId:'opendesk',
          source:'host',channel:'sidepanel',contextId})};
      if(!['tool.opened','prompt.saved'].includes(message.event)||
         (message.event==='prompt.saved'&&message.toolId!==PROMPT_ID)||
         !await toolInstalled(message.toolId))return {ok:false,code:'E_SENDER'};
      const data=await collector.record({event:message.event,toolId:message.toolId,
        source:'host',channel:'sidepanel'});
      return {ok:true,data};
    }
    if(message.kind==='event.tool_report'){
      if(!fromPanel(sender)||message.toolId!==PROMPT_ID||message.event!=='prompt.copied'||
         message.channel!=='sidepanel'||!await toolInstalled(PROMPT_ID)||
         !limit('tool_report'))return {ok:false,code:'E_SENDER'};
      return {ok:true,data:await collector.record({event:message.event,toolId:PROMPT_ID,
        source:'tool_reported',channel:'sidepanel'})};
    }
    if(message.kind==='event.page_report'){
      if(message.toolId!==PROMPT_ID||
        !['prompt.inserted','prompt.fallback_copied','prompt.failed'].includes(message.event)||
        message.channel!==(message.event==='prompt.fallback_copied'?'fallback':'page_button')||
        (message.event==='prompt.failed'?!['editor_changed','editor_unavailable','site_denied','clipboard_failed','write_unconfirmed','other'].includes(message.reason):message.reason!==undefined)||
        !limit('page_report')||!promptPageIdentity(sender))
        return {ok:false,code:'E_SENDER'};
      const data=await collector.record({event:message.event,toolId:PROMPT_ID,
        source:'page_adapter',channel:message.channel,reason:message.reason},
         {authorize:()=>fromPromptPage(sender)});
      // Verified manual failures are active attempts too, not business successes.
      // A script bootstrap/load cannot originate one of these action receipts.
      if(data.recorded&&['prompt.inserted','prompt.fallback_copied','prompt.failed'].includes(message.event))
        await collector.record({event:'tool.engaged',toolId:PROMPT_ID,
          source:'host',channel:'page_button'},{authorize:()=>fromPromptPage(sender)});
      return {ok:true,data};
    }
    return {ok:false,code:'E_SCHEMA'};
  }
  api.runtime.onMessage.addListener((message,sender,respond)=>{
    if(message?.protocol!==ANALYTICS_PROTOCOL)return false;
    Promise.resolve().then(()=>handle(message,sender)).then(respond,
      ()=>respond({ok:false,code:'E_ANALYTICS_UNAVAILABLE'}));
    return true;
  });
  api.alarms?.onAlarm?.addListener(alarm=>{
    if(alarm.name===ANALYTICS_ALARM){
      void collector.flush().catch(()=>{});
      void recordInventory().catch(()=>{}); // no DAU; daily unchanged-state heartbeat
      void recordAuthorities().catch(()=>{});
    }
  });
  api.runtime.onStartup?.addListener(()=>void collector.ensureWake().catch(()=>{}));
  api.runtime.onInstalled?.addListener(()=>void collector.ensureWake().catch(()=>{}));
  // Storage is the existing trusted installation/enable commit authority.
  // Observe actual changes, not install button clicks or arbitrary tool claims.
  api.storage.onChanged?.addListener((changes,area)=>{
    if(area!=='local'||!changes)return;
    const registry=changes[SIDEBAR_TOOL_STORE],enabled=changes[SIDEBAR_TOOL_ENABLE_STORE];
    if(registry){
      const ids=rows=>new Set(Array.isArray(rows)?rows.filter(row=>idPattern.test(row?.id||'')).map(row=>row.id):[]);
      const before=ids(registry.oldValue),after=ids(registry.newValue);
      for(const id of after)if(!before.has(id))
        void collector.record({event:'tool.installed',toolId:id,source:'host',channel:'extension'}).catch(()=>{});
      for(const id of before)if(!after.has(id))
        void collector.record({event:'tool.uninstalled',toolId:id,source:'host',channel:'extension'}).catch(()=>{});
      void recordInventory().catch(()=>{});
    }
    if(enabled){
      const old=enabled.oldValue||{},next=enabled.newValue||{};
      const ids=new Set([...Object.keys(old),...Object.keys(next)]);
      for(const id of ids){
        if(!idPattern.test(id)||old[id]===next[id]||((old[id]!==false)===(next[id]!==false)))continue;
        void collector.record({event:next[id]===false?'tool.disabled':'tool.enabled',
          toolId:id,source:'host',channel:'extension'}).catch(()=>{});
      }
    }
  });
  // Reconcile on every real Host startup after crashes or missed changes.
  // Collector suppresses duplicate inventories; service-worker wake is NOT usage.
  void collector.ensureWake().then(async()=>{
    await recordInventory();
    await recordAuthorities();
  }).catch(()=>{});
  return collector;
}
