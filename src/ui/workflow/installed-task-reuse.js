// Pure candidate selection; the existing Catalog/TaskWorkbench/RunHost keep authority.
import {validateTaskParams,checkTaskIntent} from '../../platform/tasks/contract.js';
import {simpleCommerceReplayGoal} from './segment-replay.js';

const hashPattern=/^[a-f0-9]{64}$/;
const variable=/\{([A-Za-z][A-Za-z0-9_]{0,39})\}/gu;
const verb=/(搜索|查找|检索|打开|进入|核对|检查|验证|确认|读取|提取|统计|填写|设置|修改|运行|删除|保存|启用|停用|下载|上传|发送|提交|search|open|verify|read|extract|update|run|save)/i;
// In the absence of machine-verifiable effects, arbitrary Task descriptions
// never prove read-only safety. Only the audited commerce shape runs hands-free.
// A legacy verified Task v1 may not carry a {keyword} template. Do not match
// its title: require its *declared operation*, a closed one-key Schema and an
// exact bounded user goal. The Task remains review-required because the v1
// Manifest alone cannot prove that a click has no sensitive side effects.
const declaredDemoSearch=/^(?:请)?在(?:当前)?演示搜索页搜索 ([\p{L}\p{N} _.-]{1,80})，(?:并)?(?:核对|验证|检查)(?:搜索)?结果$/u;
const missingDemoSearch=/^(?:请)?在(?:当前)?演示搜索页搜索，(?:并)?(?:核对|验证|检查)(?:搜索)?结果$/u;
const partialProduct=/^(?:请)?(?:搜索|查找|检索)\s*([\p{L}\p{N} _.-]{2,120})，(?:打开|点开|进入)\s*(?:商品详情页|商品详情|详情页)，(?:核对|检查|验证|确认)\s*(?:商品)?名称(?:和|与)(?:价格|售价|标价)$/u;
const normalize=value=>typeof value==='string'?value.trim()
  .replace(/[。.!！]+$/gu,'').replace(/[,，]\s*/gu,'，').replace(/\s+/gu,' '):'';
const escapeRegExp=value=>value.replace(/[/\\^$*+?.()|[\]{}]/g,'\\$&');
// Command delimiters and high-impact verb + target are forbidden inside a
// free-text parameter. Do not mistake innocent nouns such as "提交次数" or
// "删除键" for instructions; they remain literal search data.
const hiddenInstruction=/(?:[，,;；。!?！？]|然后|随后|接着|同时|并且|以及|但是|不过|如果|否则|必须|要求|限制|限定|不要|不得|禁止|(?:删除|提交|购买|下单|发送|上传|下载|修改|登录|付款|支付|转账|撤销)(?:所有|全部|订单|记录|文件|数据|账户|账号|用户|商品|表单|交易|消息)|(?:^|\s)(?:删除|提交|购买|下单|发送|上传|下载|修改|登录|付款|支付|转账|撤销)(?=\s|$)|\b(?:then|and|delete|submit|pay|buy|send|upload|download|update|must|without|never|don't)\b)/iu;
// A free-text parameter is data, not a second instruction channel.
// Conservative rejection is safer than silently dropping new user clauses.

function extractDeclaredParameters(template,request,schema,{allowMissing=false}={}){
  const example=template.replaceAll('{query}','camera').replaceAll('{productName}','Camera X');
  if(simpleCommerceReplayGoal(example)){
    if(!Object.hasOwn(schema.properties,'query')||
      !Object.hasOwn(schema.properties,'productName'))return null;
    const intent=simpleCommerceReplayGoal(request);
    if(intent)return {params:intent,kind:'commerce',sensitive:true};
    const partial=normalize(request).match(partialProduct);
    const query=partial?.[1]?.trim();
    return query&&!hiddenInstruction.test(query)?
      {params:{query},kind:'commerce',sensitive:true}:null;
  }
  // One generic constrained intent contract for the legacy "fill demo search
  // field, await results" operation; no Task ID, title or arbitrary action
  // similarity grants execution. Newer versioned packages may declare an
  // explicit {keyword} template and use the normal matcher below.
  if(template.includes('填写演示搜索框、等待结果')&&
    schema.additionalProperties===false&&
    Object.keys(schema.properties).length===1&&
    schema.required.length===1&&schema.required[0]==='keyword'&&
    schema.properties.keyword?.type==='string'&&
    schema.properties.keyword.title==='搜索关键词'){
    const found=normalize(request).match(declaredDemoSearch);
    if(found&&!hiddenInstruction.test(found[1]))
      return {params:{keyword:found[1].trim()},kind:'demo-search',sensitive:true};
    if(missingDemoSearch.test(normalize(request)))
      return {params:{},kind:'demo-search',sensitive:true};
    return null;
  }
  if(!verb.test(template))return null;
  const names=[];let cursor=0,pattern='^';
  for(const match of template.matchAll(variable)){
    if(!Object.hasOwn(schema.properties,match[1]))return null;
    pattern+=escapeRegExp(template.slice(cursor,match.index))+
      (allowMissing?'(.{0,120}?)':'(.{1,120}?)');
    names.push(match[1]);cursor=match.index+match[0].length;
  }
  pattern+=escapeRegExp(template.slice(cursor))+'$';
  const hit=normalize(request).match(new RegExp(pattern,'u'));
  if(!hit)return null;
  const params={};
  for(let i=0;i<names.length;i++){
    const name=names[i],rule=schema.properties[name],raw=hit[i+1].trim();
    if(!raw&&allowMissing)continue;
    if(rule.type==='string'&&hiddenInstruction.test(raw))return null;
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
  return {params,kind:'declared',sensitive:true};
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
      const intent=manifest.intent;
      if(intent!==undefined){
        try{checkTaskIntent(intent,schema);}catch{continue;}
      }
      // Verified, hash-covered intent templates take precedence over mutable
      // marketing descriptions. Old immutable v1 packages keep their legacy
      // constrained description route without rewriting their source hashes.
      const templates=intent?intent.templates:
        [normalize(manifest.description).replace(/^自然语言任务[:：]\s*/u,'')];
      let declared=null;
      for(const template of templates){
        if(!template||template.length>800)continue;
        declared=extractDeclaredParameters(normalize(template),request,schema,
          {allowMissing:Boolean(intent)});
        if(declared)break;
      }
      if(!declared)continue;
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
      // An explicit natural-language input is mandatory for every required
      // binding, even if an older Task schema supplies a form default. Using
      // that default here could silently search the wrong keyword/product.
      const absent=schema.required.filter(key=>!Object.hasOwn(declared.params,key));
      if(absent.length){
        missing.push({taskId:row.taskId,fields:absent,code:'E_PARAMS'});
        continue;
      }
      let params;
      try{params=validateTaskParams(schema,declared.params);}
      catch(error){
        missing.push({taskId:row.taskId,fields:schema.required.filter(key=>
          !Object.hasOwn(declared.params,key)),code:error?.code||'E_PARAMS'});
        continue;
      }
      matches.push({taskId:row.taskId,title:manifest.title,params,kind:declared.kind,
        sensitive:declared.sensitive,intent:intent?structuredClone(intent):null,
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
