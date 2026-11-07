// Tool-owned input adapter. It prepares declarative data, never reads a page or
// calls a Provider. Saved/manual configurations remain owned by the workspace.
import {trialRequirement} from './capture-trials.js';

function captureUrl(url){
  let target;
  try{target=new URL(url);}catch{throw Error('请填写完整的 HTTP 或 HTTPS 采集网址。');}
  if(!['http:','https:'].includes(target.protocol)||target.username||target.password)
    throw Error('采集网址必须是无内嵌凭证的 HTTP 或 HTTPS 地址。');
  if(String(url).length>2048)throw Error('采集网址过长，请缩短至 2048 字符以内。');
  return target.href;
}
function captureBudget(maxPages){
  const budget=Number(maxPages);
  if(!Number.isSafeInteger(budget)||budget<1||budget>50)throw Error('完整采集页数预算须为 1–50 的整数。');
  return budget;
}
function requestIssues({requirement='',correction='',intent='correct',previewPages}){
  const issues={};
  if(!['create','correct'].includes(intent))issues.intent='请选择生成新规则或纠正现有规则。';
  if(typeof requirement!=='string'||requirement.length>4000)issues.requirement='采集需求最多 4000 字符；输入已保留。';
  else if(intent==='create'&&!requirement.trim())issues.requirement='请用中文描述要采集的内容，再生成新规则。';
  if(typeof correction!=='string'||correction.length>2000)issues.correction='纠正意见最多 2000 字符；输入已保留。';
  if(![1,2,3].includes(previewPages))issues.previewPages='试采页数必须是 1、2 或 3。';
  return issues;
}
export function captureInputIssues(input){
  const issues={};
  try{captureUrl(input.url);}catch(error){issues.url=error.message;}
  try{captureBudget(input.maxPages);}catch(error){issues.maxPages=error.message;}
  return {...issues,...requestIssues(input)};
}
export function captureTarget(url,maxPages){
  return {url:captureUrl(url),maxPages:captureBudget(maxPages)};
}

export function captureRequirement({requirement='',correction='',intent='correct',config,target,previewPages}){
  const issue=Object.values(requestIssues({requirement,correction,intent,previewPages}))[0];
  if(issue)throw Error(issue);
  return [intent==='create'?'按以下需求生成新的本机静态采集规则。':'只纠正现有规则；保留字段含义、单多值、去重和分页方式。',
    requirement.trim()||trialRequirement(config),correction.trim()?'本次纠正意见：'+correction.trim():'',
    `目标：${target.url}。完整采集最多 ${target.maxPages} 页，本次仅试采 ${previewPages} 页；不能用试采页数覆盖完整预算。`,
    '仅使用获准公开结构，不登录、不执行代码；不自动保存或启动完整采集。'].filter(Boolean).join('\n');
}

export function captureRuleSummary(config){
  const fields=[];
  function walk(value,prefix='',top=true){
    for(const [key,rule] of Object.entries(value||{})){
      if(top&&['_listContainer','_listItem'].includes(key))continue;
      const name=prefix+key;
      if(typeof rule==='string'||typeof rule?.selector==='string')fields.push(name+(rule?.cardinality==='many'?'（多值）':rule?.cardinality==='one'?'（单值）':''));
      else if(rule&&typeof rule==='object')walk(rule,name+'.',false);
    }
  }
  walk(config.itemConfig);
  return {fields,pagination:config.nextPageSelector?'同源下一页链接':'仅当前页',dedupeKey:config.dedupeKey||'未设置',maxPages:config.maxPages??50};
}
