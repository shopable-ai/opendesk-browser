// Synthetic accounts. Imported ONLY by the preview build's compile-time gate.
// No Cookie/Token, persistence, network requests, real identities or live API calls.
const short = {key:'codex:primary:18000',durationSeconds:18000,slot:'primary',kind:'SHORT_WINDOW',limitId:'codex'};
const long = {key:'codex:secondary:604800',durationSeconds:604800,slot:'secondary',kind:'LONG_WINDOW',limitId:'codex'};
const stamp = offset => new Date(Date.now() + offset).toISOString();
const names = [
  ['spare_pro','备用 Pro','spare.pro@example.com','pro','Pro', '管理标签 · 备用', 'OK', [98,94,92,97,89,93,95], [91,85,88,90,86,82,92]],
  ['falling','研发主账号','research@example.com','pro','Pro','管理标签 · 研发', 'OK', [96,87,75,64,49,28,13], null],
  ['partial','测试项目 Plus','sample4@example.com','plus','Plus','管理标签 · 测试', 'OK', [93,null,88,null,85,null,55], null],
  ['single','项目 A Pro','limited@example.com','pro','Pro','管理标签 · 项目 A', 'OK', [null,null,97,null,null,null,null], null],
  ['none','新员工 Plus','new@example.com','plus','Plus','管理标签 · 新员工', 'AUTH_REQUIRED', null, null],
  ['unavailable','运营 Pro','stale@example.com','pro','Pro','管理标签 · 运营', 'UNAVAILABLE', [95,90,91,88,86,84,94], null],
  ['unknown','待分配账号','',null,'','管理标签 · 待认证', 'AUTH_REQUIRED', null, null],
  ['business','企业工作区','workspace@example.com','business','Business','管理标签 · 企业', 'OK', [21,32,42,45,35,25,19], [33,28,45,29,21,39,32]],
  ['enterprise','企业席位 A','ent@example.com','enterprise','Enterprise','管理标签 · 管理员', 'OK', [81,79,87,78,82,60,55], null],
  ['weekly_only','财务 Pro','weekly@example.com','pro','Pro','管理标签 · 财务', 'OK', null, [98,99,96,null,95,97,94]]
];
function observation(accountAlias, definition, remaining) {
  return {accountAlias,windowKey:definition.key,limitId:'codex',durationSeconds:definition.durationSeconds,
    remainingPercent:remaining,usedPercent:100-remaining,resetsAt:stamp(definition.durationSeconds*1000),
    observedAt:stamp(-120000),slot:definition.slot,kind:definition.kind};
}
function cycles(alias, definition, values) {
  if (!values) return [];
  const ms = definition.durationSeconds*1000;
  const base = Date.now() - (values.length+1)*ms;
  return values.map((remaining,i) => {
    const reset = base + (i+1)*ms, lead = definition.kind==='SHORT_WINDOW' ? 420 : 2400;
    return {accountAlias:alias,windowKey:definition.key,
      priorResetsAt:new Date(reset).toISOString(),detectedAt:new Date(reset+120000).toISOString(),
      type:'CROSSED_PREDICTED_RESET',
      lastPreResetSampleAt:remaining===null?null:new Date(reset-lead*1000).toISOString(),
      leadSeconds:remaining===null?null:lead,
      lastObservedRemainingPercent:remaining,
      nearResetUnusedEstimatePercent:remaining,
      estimateQuality:remaining===null?'INSUFFICIENT_EVIDENCE':'NEAR_RESET_OBSERVATION'};
  });
}
const data = new Map();
const accounts = names.map(([alias,displayName,email,code,tier,label,status,small,weekly],index)=>{
  const windows = [small!==null?{...observation(alias,short,Math.max(3,78-index*5)),windowKey:short.key}:null,
    weekly!==null?{...observation(alias,long,Math.max(5,77-index*3)),windowKey:long.key}:null].filter(Boolean);
  const identity=email?{email,displayName:null,userId:'demo-'+alias,accountId:'demo-account-'+alias,
    emailSource:'USAGE_RESPONSE',displayNameSource:'UNKNOWN',observedAt:stamp(-3600000)}:null;
  const account={alias,displayName,identity,
    providerPlan:{family:code?.toUpperCase()??'UNKNOWN',code,source:code?'QUOTA_RESPONSE':'UNKNOWN'},
    subscription:{tierLabel:tier||null,membershipExpiresAt:!tier||index%4===0?null:stamp((25+index)*86400000),
      nextBillingAt:null,source:tier?'ADMIN_ENTERED':'UNKNOWN'},
    lastAttempt:{status,checkedAt:stamp(-120000),mode:'CODEX_OAUTH',reason:status==='OK'?'OK':'DEMO_FAILURE'},
    windows, lastSuccessAt:windows.length?stamp(-120000):null};
  const rollovers=[...cycles(alias,short,small),...cycles(alias,long,weekly)];
  if(alias==='partial') rollovers.push({accountAlias:alias,windowKey:short.key,priorResetsAt:stamp(-250000),
    detectedAt:stamp(-240000),type:'FORECAST_MOVED_UNCONFIRMED',
    nearResetUnusedEstimatePercent:100,estimateQuality:'NEAR_RESET_OBSERVATION'});
  data.set(alias,{observations:windows,rollovers});
  return account;
});
export function createDemoApi() {
  return {
    accounts:async()=>structuredClone(accounts),
    history:async(alias,{limit=20,windowKey=null}={})=>{
      const item=data.get(alias);
      if(!item) throw Error('演示账号不存在');
      const filter=xs=>xs.filter(x=>!windowKey||x.windowKey===windowKey).slice(-limit);
      return structuredClone({observations:filter(item.observations),rollovers:filter(item.rollovers)});
    },
    refresh:async()=>{throw Error('演示模式不执行真实额度请求');}
  };
}
export const DEMO_DATA_LABEL = '虚构数据 · 交互预览 · 不连接真实账号';
