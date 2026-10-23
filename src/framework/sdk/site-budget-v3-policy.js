// PUBLIC SDK contract (site-budget.v3): finite, code-free policy vocabulary.
// This module has no Chrome API, runtime, owner authority or product imports.
// Validation does not grant a domain: the Host must independently verify the
// live owner's epoch, package/source and user-reviewed site permissions.
export const MANAGED_SITE_V3_KIND='site-budget.v3';
export const MANAGED_SITE_V3_OBSERVATION_GAP_MS=45000;
export const MANAGED_SITE_V3_REASON_ORDER=Object.freeze([
  'temporary','weekly-window','constant-deny','counter-limit'
]);
export const MANAGED_SITE_V3_LIMITS=Object.freeze({sites:60,groups:20,whitelist:50,usage:80});
const fail=(message)=>{throw Object.assign(new Error(message),{code:'E_SITE_BUDGET_V3_POLICY'});};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const exact=(value,fields)=>plain(value)&&Object.keys(value).sort().join(',')===fields.slice().sort().join(',');
const integer=(value,from,to)=>Number.isSafeInteger(value)&&value>=from&&value<=to;
const poolId=id=>typeof id==='string'&&id.length<=257&&
  (/^g:[a-z][a-z0-9-]{0,23}$/.test(id)||/^s:[a-z0-9.-]{1,253}$/.test(id));
export function isManagedSiteV3Host(host){
  if(typeof host!=='string'||host.length>253||host!==host.toLowerCase()||
     !host.includes('.')||!(/^[a-z0-9.-]+$/).test(host)||
     /^\d+(?:\.\d+){3}$/.test(host))return false;
  return host.split('.').every(label=>label.length<=63&&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}
function normalizeCondition(condition){
  if(!plain(condition)||!MANAGED_SITE_V3_REASON_ORDER.includes(condition.type))
    fail('未知的策略条件');
  switch(condition.type){
    case 'temporary':
      if(!exact(condition,['type','until'])||!integer(condition.until,1,8640000000000000))
        fail('临时条件必须有不可变截止时间');
      return {type:'temporary',until:condition.until};
    case 'weekly-window':{
      if(!exact(condition,['type','days','startMinute','endMinute'])||
         !Array.isArray(condition.days)||condition.days.length>7||
         new Set(condition.days).size!==condition.days.length||
         condition.days.some(day=>!integer(day,0,6))||
         !integer(condition.startMinute,0,1439)||
         !integer(condition.endMinute,0,1440)||
         condition.startMinute===condition.endMinute)fail('每周时段不合法');
      return {type:'weekly-window',days:[...condition.days],
        startMinute:condition.startMinute,endMinute:condition.endMinute};
    }
    case 'constant-deny':
      if(!exact(condition,['type']))fail('永久条件不能携带代码或额外参数');
      return {type:'constant-deny'};
    case 'counter-limit':
      if(!exact(condition,['type','limitMs'])||!integer(condition.limitMs,60000,86400000)||
         condition.limitMs%60000!==0)fail('额度条件必须是 1–1440 分钟');
      return {type:'counter-limit',limitMs:condition.limitMs};
  }
}
// Never accept native DNR rules, redirect paths, scripts or user-selected IDs.
// The owner ledger separately stores usage/checkpoint and applies a fixed slot.
export function normalizeManagedSiteV3Policy(raw){
  if(!exact(raw,['kind','enabled','sites','whitelist'])||
     raw.kind!==MANAGED_SITE_V3_KIND||typeof raw.enabled!=='boolean'||
     !Array.isArray(raw.sites)||raw.sites.length>MANAGED_SITE_V3_LIMITS.sites||
     !Array.isArray(raw.whitelist)||raw.whitelist.length>MANAGED_SITE_V3_LIMITS.whitelist)
    fail('v3 策略结构或数量超出边界');
  const hosts=new Set(),pools=new Set(),groups=new Set();
  const sites=raw.sites.map(site=>{
    if(!exact(site,['host','subdomains','enabled','pool','conditions'])||
       !isManagedSiteV3Host(site.host)||hosts.has(site.host)||
       typeof site.subdomains!=='boolean'||typeof site.enabled!=='boolean'||
       !poolId(site.pool)||!Array.isArray(site.conditions)||
       site.conditions.length<1||site.conditions.length>4)
      fail('网站或计量池声明不合法');
    const conditions=site.conditions.map(normalizeCondition);
    const types=conditions.map(row=>row.type);
    if(new Set(types).size!==types.length||
       !conditions.some(row=>row.type==='counter-limit'||row.type==='constant-deny'))
      fail('网站必须有且只有一个有限的阻断模型');
    if(conditions.some(row=>row.type==='counter-limit')&&
       conditions.some(row=>row.type==='constant-deny'))
      fail('永久阻断和计量阻断不能同时声明');
    hosts.add(site.host);pools.add(site.pool);
    if(site.pool.startsWith('g:'))groups.add(site.pool);
    return {host:site.host,subdomains:site.subdomains,enabled:site.enabled,
      pool:site.pool,conditions};
  });
  if(pools.size>MANAGED_SITE_V3_LIMITS.usage||groups.size>MANAGED_SITE_V3_LIMITS.groups)
    fail('共享池或计量条目超过上限');
  const whitelist=new Set();
  for(const host of raw.whitelist){
    if(!isManagedSiteV3Host(host)||whitelist.has(host))fail('白名单域名无效或重复');
    whitelist.add(host);
  }
  // Browser DNR excludes child domains recursively. A nested exact-only child
  // cannot be represented as a faithful exception under a parent wildcard.
  if(sites.some(child=>sites.some(parent=>parent!==child&&parent.subdomains&&
     matchesManagedSiteV3Host(child.host,parent.host,true)&&!child.subdomains)))
    fail('父子网站范围无法无损映射到 Chrome DNR');
  return {kind:MANAGED_SITE_V3_KIND,enabled:raw.enabled,sites,whitelist:[...whitelist]};
}
export function normalizeManagedSiteV3Usage(value){
  if(!plain(value)||Object.keys(value).length>MANAGED_SITE_V3_LIMITS.usage)
    fail('使用量账本结构超出边界');
  const result=Object.create(null);
  for(const [key,ms] of Object.entries(value)){
    if(!poolId(key)||!integer(ms,0,86400000))fail('使用量条目无效');
    result[key]=ms;
  }
  return Object.fromEntries(Object.entries(result));
}
// Every app model is opaque to Browser: only its bounded, immutable bytes and
// SHA are sealed alongside the finite native policy. No model JavaScript runs here.
// Public, versioned finite-policy contract. The application and Browser
// hash identical JSON regardless of property insertion order or Storage roundtrips.
// Only JSON values are accepted; accessors, sparse arrays and executable values
// cannot influence an authorization receipt.
function canonicalManagedSiteV3ModelJSON(model){
  const visit=(value,depth)=>{
    if(depth>12)fail('业务模型嵌套层次超限');
    if(value===null)return 'null';
    if(typeof value==='boolean')return value?'true':'false';
    if(typeof value==='number'){
      if(!Number.isFinite(value))fail('业务模型包含无效数字');
      return JSON.stringify(value);
    }
    if(typeof value==='string'){
      if(value.length>8192)fail('业务模型文本字段过长');
      return JSON.stringify(value);
    }
    if(Array.isArray(value)){
      if(value.length>500||Object.keys(value).length!==value.length)
        fail('业务模型数组包含空洞或超出 500 项');
      const parts=[];
      for(let index=0;index<value.length;index++){
        if(!Object.hasOwn(value,index))fail('业务模型数组不能有空洞');
        parts.push(visit(value[index],depth+1));
      }
      return '['+parts.join(',')+']';
    }
    if(!plain(value)||Object.keys(value).length>160)
      fail('业务模型不能携带执行代码或异常对象');
    const parts=[];
    for(const key of Object.keys(value).sort()){
      if(!/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(key)||
         ['__proto__','prototype','constructor'].includes(key))
        fail('业务模型字段名不合法');
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      if(!descriptor||!Object.hasOwn(descriptor,'value'))
        fail('业务模型字段不能包含访问器');
      parts.push(JSON.stringify(key)+':'+visit(descriptor.value,depth+1));
    }
    return '{'+parts.join(',')+'}';
  };
  const serialized=visit(model,0);
  if(new TextEncoder().encode(serialized).byteLength>32768)
    fail('业务模型超过 32 KiB 的独立封存限制');
  return serialized;
}
export function canonicalManagedSiteV3ModelBytes(model){
  return new TextEncoder().encode(canonicalManagedSiteV3ModelJSON(model));
}
export function normalizeManagedSiteV3Commit(raw){
  if(!exact(raw,['expectedRev','desiredPolicy','modelRef','sealedModel'])||
     !integer(raw.expectedRev,0,Number.MAX_SAFE_INTEGER)||
     typeof raw.modelRef!=='string'||!/^[a-f0-9]{64}$/.test(raw.modelRef)||
     !plain(raw.sealedModel))fail('v3 提交必须绑定修订号、策略和业务模型');
  const text=canonicalManagedSiteV3ModelJSON(raw.sealedModel);
  const desiredPolicy=normalizeManagedSiteV3Policy(raw.desiredPolicy);
  if(new TextEncoder().encode(JSON.stringify(desiredPolicy)).byteLength>32768)
    fail('v3 策略超过 32 KiB');
  return {expectedRev:raw.expectedRev,desiredPolicy,
    modelRef:raw.modelRef,sealedModel:JSON.parse(text)};
}
export async function assertManagedSiteV3ModelRef(commit){
  const bytes=canonicalManagedSiteV3ModelBytes(commit.sealedModel);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const sha=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  if(sha!==commit.modelRef)fail('业务模型 SHA-256 不一致，禁止执行');
  return true;
}

export function matchesManagedSiteV3Host(host,site,subdomains=false){
  return typeof host==='string'&&typeof site==='string'&&
    (host===site||subdomains&&host.endsWith('.'+site));
}
export function managedSiteV3WindowActive(window,at){
  const date=new Date(at);
  if(!Number.isFinite(date.getTime()))return false;
  const day=date.getDay(),minute=date.getHours()*60+date.getMinutes();
  return window.startMinute<window.endMinute?
    window.days.includes(day)&&minute>=window.startMinute&&minute<window.endMinute:
    window.days.includes(day)&&minute>=window.startMinute||
    window.days.includes((day+6)%7)&&minute<window.endMinute;
}
// Selection happens before checking enabled. A paused child wins over a blocked
// parent, never silently inherits its restriction or counter.
export function selectedManagedSiteV3(policy,host){
  if(!policy.enabled||!isManagedSiteV3Host(host)||
     policy.whitelist.some(white=>matchesManagedSiteV3Host(host,white,true)))return null;
  const match=policy.sites.filter(site=>matchesManagedSiteV3Host(host,site.host,site.subdomains))
    .sort((a,b)=>b.host.length-a.host.length)[0];
  return match?.enabled?match:null;
}
export function evaluateManagedSiteV3(policy,usage,host,at){
  const site=selectedManagedSiteV3(policy,host);
  if(!site||!Number.isSafeInteger(at)||at<0)return null;
  for(const type of MANAGED_SITE_V3_REASON_ORDER){
    const condition=site.conditions.find(item=>item.type===type);
    if(!condition)continue;
    if(type==='temporary'&&at<condition.until||
       type==='weekly-window'&&managedSiteV3WindowActive(condition,at)||
       type==='constant-deny'||
       type==='counter-limit'&&(usage[site.pool]||0)>=condition.limitMs)
      return {host:site.host,pool:site.pool,reason:type};
  }
  return null;
}
