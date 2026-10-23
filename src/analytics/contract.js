// Platform analytics v1: bounded, content-free events shared by MV3 and the HTTPS gateway.
export const ANALYTICS_PROTOCOL='opendesk.analytics.v1';
// Fixed internal probe: scope is decided only by the audited page adapter.
export const ANALYTICS_PAGE_SCOPE_CHECK='page.scopecheck';
export const ANALYTICS_PROMPT_TOOL_ID='prompt-shortcuts';
export const ANALYTICS_ALARM='opendesk.analytics.flush.v1';
export const ANALYTICS_STATE_KEY='opendesk.analytics.state.v1';
export const ANALYTICS_VERSION=1;
// Changing collection categories, recipients or purpose requires a new reviewed receipt.
export const ANALYTICS_DISCLOSURE_VERSION='analytics-disclosure-2026-10-23-v4';
export const ANALYTICS_MAX_BATCH=10;
export const ANALYTICS_MAX_BYTES=16384;
export const ANALYTICS_MAX_AGE_MS=7*24*60*60*1000;
export const ANALYTICS_EVENTS=Object.freeze([
  'app.opened','app.inventory','app.inventory_types','tool.engaged','tool.auto_daily',
  'tool.manual_attempt','tool.manual_result',
  'tool.installed','tool.uninstalled','tool.enabled','tool.disabled','tool.opened',
  'prompt.saved','prompt.inserted','prompt.copied','prompt.fallback_copied','prompt.failed'
]);
const toolId=/^[a-z][a-z0-9-]{1,39}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const sources=new Set(['host','page_adapter','tool_reported']);
const channels=new Set(['extension','sidepanel','page_button','fallback']);
const reasons=new Set(['editor_changed','editor_unavailable','site_denied','clipboard_failed','write_unconfirmed','other']);
const exact=(value,names)=>Object.keys(value).every(key=>names.includes(key));
const nonnegative=value=>Number.isSafeInteger(value)&&value>=0;
const inventoryCounters=row=>object(row)&&exact(row,['installed','enabled','disabled','blocked','unknown'])&&
  ['installed','enabled','disabled','blocked','unknown'].every(key=>nonnegative(row[key]))&&
  row.installed===row.enabled+row.disabled+row.blocked+row.unknown;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function validateAnalyticsEvent(value,{now=Date.now()}={}){
  if(!object(value)||!exact(value,['eventId','installId','event','toolId','timestamp','source','channel','reason','installedTools','coverage','inventoryTypes','readState','projectionGap','toolType','utcDate','metricType','total','version','runStatus','inventoryItems','inventoryOverflow'])||
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
    // A cumulative loss snapshot is only accepted on Host-owned inventory.
    if(value.coverage!==undefined){
      const gap=value.coverage;
      if(!object(gap)||!exact(gap,['overflow','expired','version'])||
        !['overflow','expired','version'].every(key=>Number.isSafeInteger(gap[key])&&gap[key]>=0)||
        gap.version!==Math.min(Number.MAX_SAFE_INTEGER,gap.overflow+gap.expired))
        throw Object.assign(new Error('Invalid analytics coverage'),{code:'E_ANALYTICS_SCHEMA'});
    }
  }else if(value.installedTools!==undefined||value.coverage!==undefined)
    throw Object.assign(new Error('Unexpected inventory'),{code:'E_ANALYTICS_SCHEMA'});
  if(value.event==='app.inventory_types'){
    const rows=value.inventoryTypes,items=value.inventoryItems;
    const validItems=Array.isArray(items)&&items.length<=96&&items.every((row,i)=>
      object(row)&&exact(row,['type','toolId','status'])&&
      ['page','task'].includes(row.type)&&
      /^anon-[a-f0-9]{24}$/.test(row.toolId||'')&&
      ['enabled','disabled','blocked','unknown'].includes(row.status)&&
      (i===0||[items[i-1].type,items[i-1].toolId].join(':')<
        [row.type,row.toolId].join(':')));
    if(!['fresh','failed'].includes(value.readState)||
      (value.readState==='failed'?rows!==undefined||items!==undefined||value.inventoryOverflow!==undefined:
        !object(rows)||!exact(rows,['page','task','scheduler'])||
        !inventoryCounters(rows.page)||!inventoryCounters(rows.task)||
        !object(rows.scheduler)||!exact(rows.scheduler,['definitions'])||
        !nonnegative(rows.scheduler.definitions)||
        !validItems||!nonnegative(value.inventoryOverflow)||
        items.length+value.inventoryOverflow!==rows.page.installed+rows.task.installed)||
      (value.projectionGap!==undefined&&typeof value.projectionGap!=='boolean'))
      throw Object.assign(new Error('Invalid authority inventory'),{code:'E_ANALYTICS_SCHEMA'});
  }else if(value.event==='tool.auto_daily'){
    const day=typeof value.utcDate==='string'&&/^\d{4}-\d\d-\d\d$/.test(value.utcDate)?
      Date.parse(value.utcDate+'T00:00:00Z'):NaN;
    if(!/^anon-[a-f0-9]{24}$/.test(value.toolId)||
      !['page','task','app_service'].includes(value.toolType)||
      !['attempted','completed','failed','outcome_unknown'].includes(value.metricType)||
      !Number.isSafeInteger(value.version)||value.version<1||
      !Number.isSafeInteger(value.total)||value.total<1||
      !Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==value.utcDate||
      day>now+86400000||day<now-ANALYTICS_MAX_AGE_MS||
      (value.projectionGap!==undefined&&typeof value.projectionGap!=='boolean'))
      throw Object.assign(new Error('Invalid automatic daily snapshot'),{code:'E_ANALYTICS_SCHEMA'});
  }else if(value.inventoryTypes!==undefined||value.readState!==undefined||value.projectionGap!==undefined||
    value.inventoryItems!==undefined||value.inventoryOverflow!==undefined)
    throw Object.assign(new Error('Unexpected authority projection'),{code:'E_ANALYTICS_SCHEMA'});
  const manual=['tool.manual_attempt','tool.manual_result'].includes(value.event);
  if(manual&&(!/^anon-[a-f0-9]{24}$/.test(value.toolId)||value.toolType!=='task'||
     (value.event==='tool.manual_attempt'?value.runStatus!==undefined:
       !['completed','failed','outcome_unknown'].includes(value.runStatus))))
    throw Object.assign(new Error('Invalid manual authority receipt'),{code:'E_ANALYTICS_SCHEMA'});
  if(!manual&&value.runStatus!==undefined)
    throw Object.assign(new Error('Unexpected manual result'),{code:'E_ANALYTICS_SCHEMA'});
  if(value.event!=='tool.auto_daily'&&['utcDate','metricType','total','version'].some(key=>value[key]!==undefined))
    throw Object.assign(new Error('Unexpected automatic metric'),{code:'E_ANALYTICS_SCHEMA'});
  if(!manual&&value.event!=='tool.auto_daily'&&value.toolType!==undefined)
    throw Object.assign(new Error('Unexpected tool type'),{code:'E_ANALYTICS_SCHEMA'});
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
