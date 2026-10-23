// Pure candidate selection; the existing Catalog/TaskWorkbench/RunHost keep authority.
import {validateTaskParams} from '../../platform/tasks/contract.js';
import {simpleCommerceReplayGoal} from './segment-replay.js';

const hashPattern=/^[a-f0-9]{64}$/;
const variable=/\{([A-Za-z][A-Za-z0-9_]{0,39})\}/gu;
const verb=/(搜索|查找|检索|打开|进入|核对|检查|验证|确认|读取|提取|统计|填写|设置|修改|运行|删除|保存|启用|停用|下载|上传|发送|提交|search|open|verify|read|extract|update|run|save)/i;
const sensitive=/(付款|支付|结账|下单|购买|删除|清空|提交|发送|转账|退款|登录|登出|注销|上传|修改|写入|填写|设置|启用|停用|安装|upload|submit|pay|checkout|purchase|delete|remove|transfer|send|order|update|write|install)/i;
const normalize=value=>typeof value==='string'?value.trim()
  .replace(/[。.!！]+$/gu,'').replace(/[,，]\s*/gu,'，').replace(/\s+/gu,' '):'';
const escapeRegExp=value=>value.replace(/[/\\^$*+?.()|[\]{}]/g,'\\$&');

function extractDeclaredParameters(template,request,schema){
  const example=template.replaceAll('{query}','camera').replaceAll('{productName}','Camera X');
  if(simpleCommerceReplayGoal(example)){
    const intent=simpleCommerceReplayGoal(request);
    if(!intent||!Object.hasOwn(schema.properties,'query')||
      !Object.hasOwn(schema.properties,'productName'))return null;
    return {params:intent,kind:'commerce',sensitive:false};
  }
  if(!verb.test(template))return null;
  const names=[];let cursor=0,pattern='^';
  for(const match of template.matchAll(variable)){
    if(!Object.hasOwn(schema.properties,match[1]))return null;
    pattern+=escapeRegExp(template.slice(cursor,match.index))+'(.{1,120}?)';
    names.push(match[1]);cursor=match.index+match[0].length;
  }
  pattern+=escapeRegExp(template.slice(cursor))+'$';
  const hit=normalize(request).match(new RegExp(pattern,'u'));
  if(!hit)return null;
  const params={};
  for(let i=0;i<names.length;i++){
    const name=names[i],rule=schema.properties[name],raw=hit[i+1].trim();
    let value=raw;
    if(rule.type==='boolean'){
      if(!['true','false','是','否'].includes(raw))return null;
      value=raw==='true'||raw==='是';
    }else if(rule.type==='integer'||rule.type==='number'){
      if(!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw))return null;
      value=Number(raw);
    }
    if(Object.hasOwn(params,name)&&params[name]!==value)return null;
    params[name]=value;
  }
  return {params,kind:'declared',sensitive:sensitive.test(template)};
}

// The caller MUST supply an authoritative completed listTaskCatalog read.
// A failed/incomplete read must never be interpreted as NO_MATCH.
export function selectInstalledTaskRoute({request,target,catalog,installed}={}){
  if(!Array.isArray(catalog)||!Array.isArray(installed))return {state:'LOADING'};
  if(typeof request!=='string'||!request.trim()||target?.status!=='available'||
    target.frameId!==0||typeof target.origin!=='string')return {state:'NO_MATCH'};
  const matches=[],blocked=[],missing=[];
  for(const row of installed){
    if(!row||typeof row.taskId!=='string')continue;
    for(const candidate of catalog.filter(item=>
      item?.taskId===row.taskId&&item.version===row.version)){
      const manifest=candidate?.manifest,schema=manifest?.paramsSchema;
      if(!schema?.properties||!Array.isArray(schema.required))continue;
      const phrase=normalize(manifest.description).replace(/^自然语言任务[:：]\s*/u,'');
      if(!phrase||phrase.length>800)continue;
      const declared=extractDeclaredParameters(phrase,request,schema);
      if(!declared)continue;
      let params;
      try{params=validateTaskParams(schema,declared.params);}
      catch(error){
        missing.push({taskId:row.taskId,fields:schema.required.filter(key=>
          !Object.hasOwn(declared.params,key)),code:error?.code||'E_PARAMS'});
        continue;
      }
      if(manifest.siteOrigins?.length!==1||manifest.siteOrigins[0]!==target.origin)continue;
      if(row.enabled!==true||candidate.stage!=='available'||
        candidate.manifestHash!==row.manifestHash||
        typeof row.installationId!=='string'||!row.installationId||
        !Number.isSafeInteger(row.generation)||row.generation<1||
        manifest.taskId!==row.taskId||manifest.version!==row.version||
        !hashPattern.test(manifest.program?.sourceHash||'')||
        !Number.isSafeInteger(manifest.program?.revision)){
        blocked.push({taskId:row.taskId,code:'E_TASK_IDENTITY'});continue;
      }
      matches.push({taskId:row.taskId,title:manifest.title,params,kind:declared.kind,
        sensitive:declared.sensitive,
        expected:{version:row.version,manifestHash:row.manifestHash,
          generation:row.generation,installationId:row.installationId},
        sourceHash:manifest.program.sourceHash,revision:manifest.program.revision});
    }
  }
  if(blocked.length)return {state:'BLOCKED',code:blocked[0].code,candidates:blocked};
  if(matches.length>1)return {state:'AMBIGUOUS',candidates:matches};
  if(matches.length===1)return {state:'MATCH',candidate:matches[0]};
  if(missing.length)return {state:'MISSING_PARAMS',candidates:missing};
  return {state:'NO_MATCH'};
}
