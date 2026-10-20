// Platform analytics v1: bounded, content-free events shared by MV3 and the HTTPS gateway.
export const ANALYTICS_PROTOCOL='opendesk.analytics.v1';
// Fixed internal probe: scope is decided only by the audited page adapter.
export const ANALYTICS_PAGE_SCOPE_CHECK='page.scopecheck';
export const ANALYTICS_PROMPT_TOOL_ID='prompt-shortcuts';
export const ANALYTICS_ALARM='opendesk.analytics.flush.v1';
export const ANALYTICS_STATE_KEY='opendesk.analytics.state.v1';
export const ANALYTICS_VERSION=1;
export const ANALYTICS_MAX_BATCH=10;
export const ANALYTICS_MAX_BYTES=16384;
export const ANALYTICS_MAX_AGE_MS=7*24*60*60*1000;
export const ANALYTICS_EVENTS=Object.freeze([
  'app.opened','app.inventory','tool.engaged',
  'tool.installed','tool.uninstalled','tool.enabled','tool.disabled','tool.opened',
  'prompt.saved','prompt.inserted','prompt.copied','prompt.fallback_copied','prompt.failed'
]);
const toolId=/^[a-z][a-z0-9-]{1,39}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const sources=new Set(['host','page_adapter','tool_reported']);
const channels=new Set(['extension','sidepanel','page_button','fallback']);
const reasons=new Set(['editor_changed','editor_unavailable','site_denied','clipboard_failed','write_unconfirmed','other']);
const exact=(value,names)=>Object.keys(value).every(key=>names.includes(key));
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function validateAnalyticsEvent(value,{now=Date.now()}={}){
  if(!object(value)||!exact(value,['eventId','installId','event','toolId','timestamp','source','channel','reason','installedTools'])||
    !uuid.test(value.eventId||'')||!uuid.test(value.installId||'')||
    !ANALYTICS_EVENTS.includes(value.event)||!toolId.test(value.toolId||'')||
    !sources.has(value.source)||!channels.has(value.channel)||
    typeof value.timestamp!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.timestamp))
    throw Object.assign(new Error('Invalid analytics event'),{code:'E_ANALYTICS_SCHEMA'});
  const time=Date.parse(value.timestamp);
  if(!Number.isFinite(time)||time>now+5*60*1000||time<now-ANALYTICS_MAX_AGE_MS)
    throw Object.assign(new Error('Expired or future analytics event'),{code:'E_ANALYTICS_TIME'});
  if(value.reason!==undefined&&!reasons.has(value.reason))
    throw Object.assign(new Error('Invalid analytics reason'),{code:'E_ANALYTICS_SCHEMA'});
  // Only a trusted installation census may carry a short list of tool IDs.
  // Never accept free-form event properties, URLs or business content.
  if(value.event==='app.inventory'){
    const ids=value.installedTools;
    if(!Array.isArray(ids)||ids.length>12||
      ids.some(id=>typeof id!=='string'||!toolId.test(id)||id==='opendesk')||
      ids.some((id,i)=>i>0&&id<=ids[i-1]))
      throw Object.assign(new Error('Invalid installed tool inventory'),{code:'E_ANALYTICS_SCHEMA'});
  }else if(value.installedTools!==undefined)
    throw Object.assign(new Error('Unexpected inventory'),{code:'E_ANALYTICS_SCHEMA'});
  if((value.event.startsWith('app.')!==(value.toolId==='opendesk'))||
    (value.event==='tool.engaged'&&value.toolId!=='prompt-shortcuts'))
    throw Object.assign(new Error('Invalid platform or tool identity'),{code:'E_ANALYTICS_SCHEMA'});
  const prompt=value.event.startsWith('prompt.');
  if(prompt!== (value.toolId==='prompt-shortcuts'&&value.event.startsWith('prompt.')))
    throw Object.assign(new Error('Invalid analytics tool ownership'),{code:'E_ANALYTICS_SCHEMA'});
  if((!prompt&&value.source!=='host')||
     (['prompt.saved'].includes(value.event)&&value.source!=='host')||
     (['prompt.inserted','prompt.fallback_copied','prompt.failed'].includes(value.event)&&value.source!=='page_adapter')||
     (value.event==='prompt.copied'&&value.source!=='tool_reported')||
     (value.event==='prompt.failed'&&!value.reason)||
     (value.event!=='prompt.failed'&&value.reason!==undefined)||
     (prompt&&value.channel==='extension')||(!prompt&&value.channel!=='extension'&&
       !['tool.opened','app.opened','tool.engaged'].includes(value.event))||
     (value.event==='app.opened'&&value.channel!=='sidepanel')||
     (value.event==='tool.engaged'&&value.channel!=='page_button')||
     (value.event==='tool.opened'&&value.channel!=='sidepanel'))
    throw Object.assign(new Error('Invalid analytics event source'),{code:'E_ANALYTICS_SCHEMA'});
  return {...value};
}
export function validateAnalyticsBatch(value,{now=Date.now()}={}){
  if(!object(value)||!exact(value,['version','events'])||value.version!==ANALYTICS_VERSION||
     !Array.isArray(value.events)||value.events.length<1||value.events.length>ANALYTICS_MAX_BATCH)
    throw Object.assign(new Error('Invalid analytics batch'),{code:'E_ANALYTICS_SCHEMA'});
  const events=value.events.map(row=>validateAnalyticsEvent(row,{now}));
  const ids=new Set(events.map(row=>row.eventId));
  if(ids.size!==events.length||new Set(events.map(row=>row.installId)).size!==1)
    throw Object.assign(new Error('Duplicate event or mixed installation'),{code:'E_ANALYTICS_SCHEMA'});
  if(new TextEncoder().encode(JSON.stringify(value)).byteLength>ANALYTICS_MAX_BYTES)
    throw Object.assign(new Error('Oversized analytics batch'),{code:'E_ANALYTICS_LIMIT'});
  return events;
}
