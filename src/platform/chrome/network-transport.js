// Fixed transport resource, not an executable tool or a new authority. Every
// request has a fresh private extension tab; DNR never applies to the owner UI,
// the website, another tool, or the service worker's shared Fetch context.
import {fail} from '../../framework/sdk/registry.js';

export const NETWORK_TRANSPORT_PROTOCOL = 'opendesk.network.transport.v1';
export const NETWORK_TRANSPORT_PATH = 'network-request.html';
const FIRST = 1901000000, LAST = FIRST + 10000;
const instances = new WeakMap();
const canonical = value => JSON.stringify(value,(_key,row)=>row&&typeof row==='object'&&!Array.isArray(row)?Object.fromEntries(Object.keys(row).sort().map(k=>[k,row[k]])):row);
const same = (a,b) => canonical(a) === canonical(b);
const fixedOrigin = 'http://127.0.0.1:43121';
export function createIsolatedHttpTransport({api, enabled = import.meta.env?.MODE === 'development'} = {}) {
  if (!enabled) return {request:async()=>{throw fail('E_SERVICE_UNSUPPORTED','Isolated HTTP is development-only');},recover:async()=>{}};
  if (instances.has(api)) return instances.get(api);
  const pending = new Map(); let next = FIRST, poisoned = false, recovered;
  const page = api.runtime.getURL(NETWORK_TRANSPORT_PATH);
  async function recover() {
    if (pending.size) throw fail('E_EFFECT_UNKNOWN','Active HTTP transport cannot be recovered');
    const rules = await api.declarativeNetRequest.getSessionRules();
    const ids = rules.filter(r=>r.id>=FIRST&&r.id<LAST).map(r=>r.id);
    if(ids.length)await api.declarativeNetRequest.updateSessionRules({removeRuleIds:ids});
    const tabs = await api.tabs.query({});
    for(const tab of tabs)if(tab.url?.startsWith(page+'#'))await api.tabs.remove(tab.id);
    if((await api.declarativeNetRequest.getSessionRules()).some(r=>r.id>=FIRST&&r.id<LAST))throw fail('E_EFFECT_UNKNOWN');
    poisoned = false;
  }
  function reject(row,error) {if(!row.settled){row.settled=true;row.reject(error);}}
  api.runtime.onConnect.addListener(port=>{
    const prefix = NETWORK_TRANSPORT_PROTOCOL+':';
    if(!port.name.startsWith(prefix))return;
    const token=port.name.slice(prefix.length),row=pending.get(token),sender=port.sender;
    if(!row||sender?.id!==api.runtime.id||sender.frameId!==0||!sender.documentId||sender.documentLifecycle!=='active'||sender.url!==page+'#'+token){port.disconnect();return;}
    if(row.connecting){reject(row,fail('E_OWNER'));port.disconnect();return;}
    row.connecting=true;
    row.setup = (async()=>{
      const tab=await row.tabPromise;
      if(sender.tab?.id!==tab.id||row.port||row.settled)throw fail('E_OWNER');
      row.port=port;row.documentId=sender.documentId;
      port.onDisconnect.addListener(()=>reject(row,fail('E_EFFECT_UNKNOWN','HTTP transport document disconnected')));
      port.onMessage.addListener(message=>{
        if(row.settled||!row.dispatched)return;
        if(message?.kind==='error') {reject(row,fail(['E_LIMIT','E_TIMEOUT','E_NETWORK'].includes(message.code)?message.code:'E_NETWORK'));return;}
        if(message?.kind!=='result'||!Number.isInteger(message.status)||message.status<100||message.status>599||
          typeof message.text!=='string'||new TextEncoder().encode(message.text).length>8192||
          !message.headers||typeof message.headers!=='object') {reject(row,fail('E_NETWORK','Invalid transport response'));return;}
        try {
          const response=new Response([204,205].includes(message.status)?null:message.text,{status:message.status,statusText:message.statusText,headers:message.headers});
          row.settled=true;row.resolve(response);
        }catch{reject(row,fail('E_NETWORK','Invalid transport response'));}
      });
      if(row.userAgent){
        // Anchored, case-sensitive RE2; URL characters are literal, including *.
        const regex='^'+row.url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$';
        const rule={id:row.ruleId,priority:1,action:{type:'modifyHeaders',requestHeaders:[{header:'user-agent',operation:'set',value:row.userAgent}]},
          condition:{regexFilter:regex,isUrlFilterCaseSensitive:true,tabIds:[tab.id],initiatorDomains:[api.runtime.id],resourceTypes:['xmlhttprequest']}};
        await api.declarativeNetRequest.updateSessionRules({addRules:[rule],removeRuleIds:[row.ruleId]});
        const saved=(await api.declarativeNetRequest.getSessionRules()).find(r=>r.id===row.ruleId);
        if(!saved||!same(saved.condition,rule.condition)||!same(saved.action,rule.action))throw fail('E_EFFECT_UNKNOWN','UA rule readback differs');
      }
      if(row.settled||row.signal.aborted)throw fail('E_CANCELLED');
      await row.beforeDispatch();
      if(row.settled||row.signal.aborted)throw fail('E_CANCELLED');
      row.dispatched=true;
      port.postMessage({kind:'request',url:row.url,headers:row.headers,deadlineAt:row.deadlineAt});
    })().catch(error=>{reject(row,error);try{port.disconnect();}catch{}});
  });
  async function request(url,options,context,beforeDispatch) {
    const target=new URL(url);
    if(target.origin!==fixedOrigin||target.username||target.password||target.hash||options.method!=='GET')
      throw fail('E_PERMISSION','Isolated HTTP only permits GET on the fixed local development fixture');
    if(!context.runId||!context.requestId||typeof beforeDispatch!=='function')throw fail('E_OWNER');
    if(!recovered)recovered=recover();
    await recovered;
    if(poisoned)throw fail('E_EFFECT_UNKNOWN','Previous HTTP resource retirement is unknown');
    if(pending.size>=4)throw fail('E_LIMIT');
    if(options.signal.aborted)throw options.signal.reason;
    const token=crypto.randomUUID(),ruleId=next++;if(next===LAST)next=FIRST;
    const row={url:target.href,headers:{...options.headers,'x-opendesk-run-id':context.runId,'x-opendesk-request-id':context.requestId},
      userAgent:options.userAgent,ruleId,beforeDispatch,signal:options.signal,
      deadlineAt:Math.min(Date.now()+15000,context.deadlineAt??Infinity),settled:false};
    const result=new Promise((resolve,reject)=>Object.assign(row,{resolve,reject}));
    // Observe rejection even if Chrome tab creation is still pending.
    result.catch(()=>{});pending.set(token,row);
    const abort=()=>reject(row,options.signal.reason??fail('E_CANCELLED'));
    options.signal.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>reject(row,fail('E_TIMEOUT')),Math.max(1,row.deadlineAt-Date.now()));
    let tab;
    try {
      row.tabPromise=api.tabs.create({url:page+'#'+token,active:false});
      tab=await row.tabPromise;
      if(!Number.isSafeInteger(tab?.id)||tab.id<0)throw fail('E_CONTEXT');
      return await result;
    } finally {
      row.settled=true;clearTimeout(timer);options.signal.removeEventListener('abort',abort);
      let cleanupError;
      try {if(tab) {await api.tabs.remove(tab.id);if((await api.tabs.query({})).some(t=>t.id===tab.id))throw fail('E_EFFECT_UNKNOWN');}}
      catch(error){cleanupError=error;}
      // A Chrome write already in flight may finish after Stop. Wait for it
      // before the final removal, and never authorize a retired operation.
      const removeRule=async()=>{
        await api.declarativeNetRequest.updateSessionRules({removeRuleIds:[ruleId]});
        if((await api.declarativeNetRequest.getSessionRules()).some(r=>r.id===ruleId))throw fail('E_EFFECT_UNKNOWN');
      };
      let setupTimer;
      const setupDone=await Promise.race([Promise.resolve(row.setup).then(()=>true),
        new Promise(resolve=>{setupTimer=setTimeout(()=>resolve(false),1000);})]);
      clearTimeout(setupTimer);
      if(!setupDone){
        cleanupError=fail('E_EFFECT_UNKNOWN');
        // A hung Chrome write or Authority read must not hold Stop forever.
        // A late write gets its own final removal; this driver stays fenced.
        void row.setup.then(removeRule).catch(()=>{});
      }
      try {await removeRule();}catch(error){cleanupError=error;}
      try{row.port?.disconnect();}catch{}pending.delete(token);
      if(cleanupError){poisoned=true;throw fail('E_EFFECT_UNKNOWN','HTTP tab or UA rule retirement could not be confirmed');}
    }
  }
  const transport={request,recover};instances.set(api,transport);return transport;
}
