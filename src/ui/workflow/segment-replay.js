// Ordered, immutable metadata for replaying independently verified Workflow
// fragments. It owns no browser authority, execution engine or permissions.
import {validateWorkflow} from '../../framework/workflow/contract.js';
import {checkParamsSchema} from '../../platform/tasks/contract.js';
import {digestUtf8} from '../../platform/protocol.js';

export const WORKFLOW_BUNDLE_FORMAT = 'opendesk.workflow-segment-bundle.v1';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const hashPattern=/^[a-f0-9]{64}$/;
const allowedKinds=new Set(['input-readback','search-results','search-empty',
  'search-inline','link-page','product-page','read-only']);

function entryUrl(value,origin) {
  if(typeof value!=='string'||value.length>500)fail('E_WORKFLOW_BUNDLE','无效的分段入口网页');
  let url;
  try{url=new URL(value);}catch{fail('E_WORKFLOW_BUNDLE','分段入口地址无效');}
  if(!['http:','https:'].includes(url.protocol)||url.origin!==origin||
    url.username||url.password||url.hash)
    fail('E_WORKFLOW_BUNDLE','分段入口必须位于冻结的精确 Origin');
  // Never persist arbitrary URL query parameters that may contain secrets.
  if([...url.searchParams].some(([name,value])=>
    !['q','query','search','keyword','s'].includes(name)||
    !/^[\p{L}\p{N} _.-]{1,120}$/u.test(value)))
    fail('E_WORKFLOW_BUNDLE','入口 URL 含未审核参数，不能保存自动复跑');
  return url.href;
}

export function replayParameterSchema(segments) {
  const properties={},required=new Set();
  for(const segment of segments) {
    const schema=validateWorkflow(segment.workflow).paramsSchema;
    for(const [name,rule] of Object.entries(schema.properties)) {
      if(Object.hasOwn(properties,name)&&
        JSON.stringify(properties[name])!==JSON.stringify(rule))
        fail('E_WORKFLOW_PARAMS','跨段同名参数定义不一致');
      properties[name]=structuredClone(rule);
    }
    schema.required.forEach(name=>required.add(name));
  }
  const schema={type:'object',properties,required:[...required].sort(),
    additionalProperties:false};
  checkParamsSchema(schema);
  return schema;
}
function validateSegment(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).some(key=>!['workflow','entryUrl','revision',
      'sourceHash','verificationMode','evidence','proof'].includes(key)))
    fail('E_WORKFLOW_BUNDLE','分段记录字段不合法');
  const workflow=validateWorkflow(value.workflow);
  if(!Number.isSafeInteger(value.revision)||value.revision<1||
    !hashPattern.test(value.sourceHash||'')||
    !['fill-readback','none'].includes(value.verificationMode))
    fail('E_WORKFLOW_BUNDLE','分段源码版本或核验模式不合法');
  const evidence=value.evidence;
  if(!evidence||typeof evidence!=='object'||Array.isArray(evidence)||
    Object.keys(evidence).some(key=>!['kind','name'].includes(key))||
    !allowedKinds.has(evidence.kind))
    fail('E_WORKFLOW_BUNDLE','分段未记录独立核验类型');
  if(evidence.name!==undefined&&
    (typeof evidence.name!=='string'||evidence.name.length>120))
    fail('E_WORKFLOW_BUNDLE','分段核验对象不合法');
  if(evidence.kind==='product-page'&&!evidence.name)
    fail('E_WORKFLOW_BUNDLE','商品详情缺少已核验名称');
  const proof=value.proof;
  if(!proof||typeof proof!=='object'||Array.isArray(proof)||
    Object.keys(proof).length!==5||
    Object.keys(proof).some(key=>
      !['runId','resultId','sourceHash','origin','documentId'].includes(key))||
    typeof proof.runId!=='string'||!proof.runId||proof.runId.length>128||
    typeof proof.resultId!=='string'||!proof.resultId||proof.resultId.length>128||
    proof.sourceHash!==value.sourceHash||proof.origin!==workflow.siteOrigin||
    typeof proof.documentId!=='string'||!proof.documentId||
    proof.documentId.length>128)
    fail('E_WORKFLOW_BUNDLE','分段缺少与源码一致的独立 RunHost 执行证明');
  return {workflow,entryUrl:entryUrl(value.entryUrl,workflow.siteOrigin),
    revision:value.revision,sourceHash:value.sourceHash,
    verificationMode:value.verificationMode,
    evidence:structuredClone(evidence),proof:structuredClone(proof)};
}
function manifestFields(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).some(key=>!['format','bundleId','revision','goal','title',
      'workflow','segments','paramsSchema','sourceHash','savedAt'].includes(key)))
    fail('E_WORKFLOW_BUNDLE','工作流包字段不合法');
  if(value.format!==WORKFLOW_BUNDLE_FORMAT||
    typeof value.bundleId!=='string'||!/^wf-[a-z0-9-]{8,54}$/.test(value.bundleId)||
    value.revision!==1||typeof value.goal!=='string'||
    !value.goal.trim()||value.goal.length>4000||
    typeof value.title!=='string'||!value.title.trim()||value.title.length>100||
    !Array.isArray(value.segments)||value.segments.length<2||value.segments.length>8)
    fail('E_WORKFLOW_BUNDLE','工作流包数量或原始目标不合法');
  const segments=value.segments.map(validateSegment);
  if(segments.reduce((n,part)=>n+part.workflow.steps.length,0)>24)
    fail('E_WORKFLOW_BUNDLE','工作流包超过 24 个操作');
  const ids=new Set(segments.map(part=>part.workflow.workflowId));
  if(ids.size!==segments.length||segments.some((part,index)=>
    part.workflow.workflowId!==value.bundleId+'-s'+(index+1)))
    fail('E_WORKFLOW_BUNDLE','分段必须使用独立的 Controller 身份');
  const schema=replayParameterSchema(segments);
  if(JSON.stringify(schema)!==JSON.stringify(value.paramsSchema))
    fail('E_WORKFLOW_BUNDLE','共享参数定义与分段不一致');
  if(!value.workflow||typeof value.workflow!=='object'||
    Array.isArray(value.workflow)||
    Object.keys(value.workflow).length!==3||
    Object.keys(value.workflow).some(key=>
      !['workflowId','title','siteOrigin'].includes(key))||
    value.workflow.workflowId!==value.bundleId||
    value.workflow.title!==value.title||
    value.workflow.siteOrigin!==segments[0].workflow.siteOrigin)
    fail('E_WORKFLOW_BUNDLE','摘要身份不一致');
  return {format:WORKFLOW_BUNDLE_FORMAT,bundleId:value.bundleId,
    revision:1,goal:value.goal,title:value.title,
    workflow:{workflowId:value.bundleId,title:value.title,
      siteOrigin:segments[0].workflow.siteOrigin},
    segments,paramsSchema:schema};
}
export async function sealWorkflowBundle(value) {
  const body=manifestFields(value);
  return {...body,sourceHash:await digestUtf8(JSON.stringify(body)),
    savedAt:Date.now()};
}
export async function verifyWorkflowBundle(value) {
  if(!hashPattern.test(value?.sourceHash||'')||
    !Number.isSafeInteger(value.savedAt)||value.savedAt<=0)
    fail('E_WORKFLOW_HASH','工作流包哈希或保存时间无效');
  const body=manifestFields(value);
  if(await digestUtf8(JSON.stringify(body))!==value.sourceHash)
    fail('E_WORKFLOW_HASH','完整工作流分段、顺序或参数已变化');
  return structuredClone(value);
}
// Legacy v1 bundles froze URLs, link guards and the original natural-language
// goal. Unlike a standalone parameterized script, an entire v1 multi-Document
// sequence cannot safely reinterpret those frozen business targets at runtime.
// Refuse changed/unknown baseline parameters BEFORE dispatching even segment 1;
// a future explicitly versioned dynamic-binding contract must authorize them.
export function assertLegacyReplayParameterScope(bundle,params) {
  if(bundle?.format!==WORKFLOW_BUNDLE_FORMAT||
    !Array.isArray(bundle.segments)||bundle.segments.length<2)
    fail('E_WORKFLOW_BUNDLE','完整工作流的保存格式不合法');
  if(!params||typeof params!=='object'||Array.isArray(params))
    fail('E_WORKFLOW_PARAMS','运行参数不合法');
  const schema=bundle.paramsSchema;
  if(!schema||!schema.properties)fail('E_WORKFLOW_PARAMS','缺少共享参数定义');
  const changed=Object.entries(schema.properties).some(([name,rule])=>
    !Object.hasOwn(rule,'default')||!Object.hasOwn(params,name)||
    params[name]!==rule.default);
  if(changed)
    fail('E_WORKFLOW_PARAM_BINDING',
      '此历史版本冻结了原始网页和业务目标；修改共享参数需要经独立核验的动态绑定新版本。为避免部分执行，当前未操作网页');
}

export function verifyReplayBusinessEffect(expected,reply) {
  if(!reply?.ok)return false;
  if(expected.kind==='read-only')return reply.readOnlyVerified===true;
  if(expected.kind==='input-readback')
    return reply.evidenceLevel==='BUSINESS_EFFECT_VERIFIED'&&reply.readbackVerified===true;
  if(reply.evidenceLevel!=='BUSINESS_EFFECT_VERIFIED'||reply.effect?.kind!==expected.kind)
    return false;
  if(expected.kind==='link-page')
    return typeof reply.effect.title==='string'&&
      reply.effect.title.toLocaleLowerCase()===String(expected.name||'').toLocaleLowerCase();
  if(expected.kind==='product-page')
    return typeof reply.effect?.name==='string'&&
      reply.effect.name.toLocaleLowerCase()===String(expected.name||'').toLocaleLowerCase()&&
      /^(?:¥|￥|\$|€)\s?\d{1,9}(?:\.\d{1,2})?$/.test(reply.effect.price||'');
  return true;
}
