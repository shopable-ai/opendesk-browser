// Local-project installation orchestration. No extra registry, runner, or authority.
// Candidate / Verify / Available / Installed remain the existing Page and Task contracts.
import {sha256Utf8} from '../scripting/user-scripts/page-program-package.js';
import {parseUserScriptDependencies} from '../scripting/user-scripts/dependency-metadata.js';
import {preparePageCandidateDraft} from './page-candidate-source.js';
import {createTaskPackage} from '../platform/tasks/contract.js';

const SHA=/^[a-f0-9]{64}$/;
const fail=(code,message)=>Object.assign(new Error(message),{code});
const emptyParams=()=>({type:'object',properties:{},required:[],additionalProperties:false});
const identity=row=>row?.programId||row?.taskId;
// Freeze the execution-relevant metadata as well as compiled bytes. A provider
// must not change site scope, parameter schema, runtime or project identity
// while reusing an old inputHash and a successful Run receipt.
export const sourceContract=source=>JSON.stringify([
  source?.projectId??null,source?.runtimeKind??null,source?.entryFormat??null,
  source?.siteOrigins??null,source?.pageRules??null,source?.paramsSchema??null,
  source?.managedUI??null,source?.artifactId??null
]);
const targetContract=target=>JSON.stringify([
  target?.windowId??null,target?.tabId??null,target?.frameId??0,
  target?.documentId??null,target?.url??null
]);
const taskVersion=versions=>{
  const parsed=versions.map(value=>/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value)).filter(Boolean)
    .map(match=>match.slice(1).map(Number)).sort((a,b)=>b[0]-a[0]||b[1]-a[1]||b[2]-a[2]);
  const last=parsed[0];return last?`${last[0]}.${last[1]}.${last[2]+1}`:'1.0.0';
};
function assertSource(source,binding,target){
  if(!source||!binding||source.bindingId!==binding.bindingId||
    !SHA.test(source.sourceHash)||!SHA.test(source.inputHash)||
    !['controller','page-userscript'].includes(source.runtimeKind)||
    typeof source.sourceUtf8!=='string'||!source.sourceUtf8.trim()||
    !target||!['http:','https:'].includes(new URL(target.url).protocol))
    throw fail('E_DEV_IDENTITY','缺少确定的本地项目版本、绑定或允许的网站');
  if(source.siteOrigins?.length&&!source.siteOrigins.includes(new URL(target.url).origin))
    throw fail('E_DEV_ORIGIN','此本地版本不允许在当前网页运行');
}
const taskRows=result=>({catalog:result?.catalog||[],installed:result?.installed||[]});
function pageCandidate(source,target,id,revision){
  if(!source.pageRules&&parseUserScriptDependencies(source.sourceUtf8).hasHeader)
    throw fail('E_PAGE_MATCH','兼容 UserScript 项目需要明确的网页匹配规则；请在网页脚本版本管理中审阅');
  return preparePageCandidateDraft({sourceUtf8:source.sourceUtf8,entryFormat:source.entryFormat,
    importSourceUrl:source.importSourceUrl??null,lockId:source.lockId??null,
    programId:id,revision,previewUrl:target.url,
    ...(source.pageRules?{pageRules:source.pageRules}:{})});
}
export async function prepareLocalProjectInstallation({client,source,binding,project,target,runId}){
  assertSource(source,binding,target);
  if(source.sourceHash!==await sha256Utf8(source.sourceUtf8)||
    source.sourceBytes!==new TextEncoder().encode(source.sourceUtf8).length)
    throw fail('E_DEV_HASH','源码字节与本地提供者哈希不一致');
  if(source.runtimeKind==='controller'&&(!runId||
    !/\basync\s+function\s+main\s*\(/.test(source.sourceUtf8)))
    throw fail('E_PROGRAM_KIND','Controller 保存任务需要已完成的持久运行及支持的 async function main() 入口');
  const id='local-'+(await sha256Utf8(JSON.stringify([
    binding.bindingId,project?.sourceId||'',source.projectId||'',source.runtimeKind]))).slice(0,24);
  const page=source.runtimeKind==='page-userscript';
  const catalog=page?await client.request('listPagePrograms',{}):await client.request('listTaskCatalog',{});
  const rows=page?(catalog?.catalog||[]):taskRows(catalog).catalog;
  const siblings=rows.filter(row=>identity(row)===id);
  const previous=page?siblings.find(row=>row.installed)?.installed:
    taskRows(catalog).installed.find(row=>row.taskId===id);
  const version=page?String(1+Math.max(0,...siblings.map(row=>row.revision||0))):
    taskVersion(siblings.map(row=>row.version));
  const rules=page?pageCandidate(source,target,id,Number(version)).request.pageRules:null;
  if(page&&!rules)throw fail('E_PAGE_MATCH','未取得可信的 Page 自动运行网站范围');
  const sites=page?[...rules.matches]:[new URL(target.url).origin];
  const installedCandidate=page?siblings.find(row=>row.manifestHash===previous?.manifestHash):
    siblings.find(row=>row.version===previous?.version);
  const sourceMatches=page?previous?.sourceHash===source.sourceHash:
    installedCandidate?.manifest?.program?.sourceHash===source.sourceHash;
  const scopeMatches=page?JSON.stringify(previous?.pageRules)===JSON.stringify(rules):
    JSON.stringify(installedCandidate?.manifest?.siteOrigins)===JSON.stringify(sites)&&
    JSON.stringify(installedCandidate?.manifest?.paramsSchema)===
      JSON.stringify(source.paramsSchema||emptyParams());
  const alreadyInstalled=!!previous&&sourceMatches&&scopeMatches;
  return Object.freeze({id,version,kind:source.runtimeKind,
    sourceHash:source.sourceHash,inputHash:source.inputHash,sourceBytes:source.sourceBytes,
    bindingId:binding.bindingId,providerEpoch:binding.providerEpoch,projectSourceId:project?.sourceId||'',
    sourceContract:sourceContract(source),targetContract:targetContract(target),
    siteOrigins:Object.freeze(sites),pageRules:rules,runId:runId||null,
    defaultTitle:(project?.name||source.projectId||'我的本地工具').slice(0,100),
    installedVersion:previous?.revision??previous?.version??null,
    installedHash:previous?.manifestHash??null,
    alreadyInstalled,needsReexecution:page});
}
export function assertLocalInstallVersion(review,source,binding){
  if(!review||!source||!binding||review.bindingId!==binding.bindingId||
    review.providerEpoch!==binding.providerEpoch||review.sourceHash!==source.sourceHash||
    review.inputHash!==source.inputHash||review.sourceBytes!==source.sourceBytes||
    review.kind!==source.runtimeKind||review.sourceContract!==sourceContract(source))
    throw fail('E_DEV_CONFLICT','本地项目、输入版本或源码已变化，请重新运行验证；原安装未修改');
}
export async function getInstalledLocalProject({client,review}){
  if(review.kind==='page-userscript'){
    const rows=(await client.request('listPagePrograms',{})).catalog||[];
    return rows.find(row=>row.programId===review.id&&row.installed)?.installed||null;
  }
  const result=taskRows(await client.request('listTaskCatalog',{}));
  return result.installed.find(row=>row.taskId===review.id)||null;
}
export async function commitLocalProjectInstallation({client,review,source,target,title,version}){
  if(!review||!source||!target||!SHA.test(review.sourceHash)||
    review.sourceHash!==source.sourceHash||review.inputHash!==source.inputHash||
    review.sourceBytes!==source.sourceBytes||review.bindingId!==source.bindingId||
    review.kind!==source.runtimeKind||review.sourceContract!==sourceContract(source)||
    review.targetContract!==targetContract(target)||
    review.sourceBytes!==new TextEncoder().encode(source.sourceUtf8||'').length||
    review.sourceHash!==await sha256Utf8(source.sourceUtf8||''))
    throw fail('E_DEV_CONFLICT','安装源、目标网页或执行合同与已验证确定版本不一致');
  const current=await getInstalledLocalProject({client,review});
  if((current?.manifestHash??null)!==review.installedHash)
    throw fail('E_REVISION','已安装版本在审阅期间发生变化，请重新核对');
  if(review.kind==='page-userscript'){
    const revision=Number(version);
    if(!Number.isSafeInteger(revision)||revision<1)throw fail('E_REVISION','Page revision 必须是正整数');
    const prepared=pageCandidate(source,target,review.id,revision);
    if(JSON.stringify(prepared.request.pageRules)!==JSON.stringify(review.pageRules))
      throw fail('E_DEV_CONFLICT','Page 网站范围已变，请重新审阅');
    let row=await client.request('importPageCandidate',prepared.request);
    if(row.stage==='Candidate'){
      // Formal Page Verify executes the frozen code once more. The review UI must
      // explicitly warn and require an actual trusted confirmation beforehand.
      await client.request('verifyPageCandidate',{programId:review.id,revision,
        target:{tabId:target.tabId,frameId:0,documentId:target.documentId,
          expectedUrl:target.url,expectedWindowId:target.windowId}});
      row=(await client.request('listPagePrograms',{})).catalog.find(item=>
        item.programId===review.id&&item.revision===revision);
    }
    if(!row||!['Verified','Available'].includes(row.stage))
      throw fail('E_PAGE_VERIFICATION','Page 固定版本未通过正式验证');
    if(row.stage==='Verified')await client.request('makePageAvailable',{
      programId:review.id,revision,manifestHash:row.manifestHash});
    const installed=await client.request('installPageProgram',{
      programId:review.id,revision,manifestHash:row.manifestHash,
      expectedInstalledManifestHash:current?.manifestHash??null,
      expectedGeneration:current?.authorization?.generation??null});
    if(installed.manifestHash!==row.manifestHash||
      (installed.enabled===false?installed.nativeState!=='disabled':installed.nativeState!=='registered'))
      throw fail('E_EFFECT_UNKNOWN','Page 安装注册结果未确认，请只读核对已安装状态');
    return {kind:review.kind,id:review.id,version:String(revision),manifestHash:row.manifestHash};
  }
  if(review.kind!=='controller')throw fail('E_PROGRAM_KIND','不支持将此项目直接转为工具或任务');
  const origin=new URL(target.url).origin;
  if(!review.siteOrigins.includes(origin))throw fail('E_DEV_ORIGIN','本次网页超出已批准的任务范围');
  const manifest={format:'opendesk.task.v1',taskId:review.id,version,
    title,description:'本地项目验证后安装的自动化任务',author:'local-developer',
    source:'local-project',siteOrigins:[origin],permissions:['page.automation'],
    entryFormat:'async-main',program:{revision:1,sourceHash:review.sourceHash},
    paramsSchema:source.paramsSchema||emptyParams()};
  const pkg=await createTaskPackage(manifest,source.sourceUtf8);
  let candidate=await client.request('importTaskPackage',{package:pkg});
  if(candidate.stage==='candidate')candidate=await client.request('verifyTaskCandidate',{
    taskId:review.id,version,runId:review.runId});
  if(!['verified','available'].includes(candidate.stage))throw fail('E_VERIFICATION','缺少同源码的持久 Controller 结果和原生页面操作回执');
  if(candidate.stage==='verified')await client.request('makeTaskAvailable',{
    taskId:review.id,version,manifestHash:candidate.manifestHash});
  const installed=await client.request('installTask',{taskId:review.id,version,manifestHash:candidate.manifestHash,
    expectedInstalledVersion:current?.version??null,
    expectedGeneration:current?.generation??null,expectedInstallationId:current?.installationId??null});
  if(installed.manifestHash!==candidate.manifestHash||installed.version!==version)
    throw fail('E_EFFECT_UNKNOWN','Task 安装结果未确认，请只读核对已安装状态');
  return {kind:review.kind,id:review.id,version,manifestHash:candidate.manifestHash};
}

// Read-only resolution for lost installation acknowledgements. Neither a matching
// source hash alone nor the old baseline is proof that the attempted version
// was installed. Authoritative Page/Task registries remain the only state.
export async function readLocalInstallOutcome({client,review,version}){
  if(!review||!['page-userscript','controller'].includes(review.kind)||
    typeof review.id!=='string'||typeof version!=='string')
    throw fail('E_SCHEMA','安装恢复缺少固定项目或版本身份');
  if(review.kind==='page-userscript'){
    const state=await client.request('listPagePrograms',{});
    const installed=(state.installed||[]).find(row=>row.programId===review.id)||
      (state.catalog||[]).find(row=>row.programId===review.id&&row.installed)?.installed;
    if(!installed)return {state:'not-installed'};
    if(installed.manifestHash===review.installedHash)return {state:'baseline-unchanged'};
    const candidate=(state.catalog||[]).find(row=>row.programId===review.id&&
      row.revision===Number(version)&&row.manifestHash===installed.manifestHash);
    const registered=installed.enabled===false
      ?installed.nativeState==='disabled'&&installed.authorization?.status==='disabled'
      :installed.nativeState==='registered'&&installed.authorization?.status==='active';
    if(!candidate||candidate.stage!=='Available'||installed.revision!==Number(version)||
      !registered||installed.sourceHash!==review.sourceHash||
      candidate.sourceHash!==review.sourceHash||
      JSON.stringify(installed.pageRules)!==JSON.stringify(review.pageRules))
      return {state:'unconfirmed'};
    return {state:'confirmed',id:review.id,kind:review.kind,version,
      manifestHash:installed.manifestHash};
  }
  const state=await client.request('listTaskCatalog',{});
  const installed=(state.installed||[]).find(row=>row.taskId===review.id);
  if(!installed)return {state:'not-installed'};
  if(installed.manifestHash===review.installedHash)return {state:'baseline-unchanged'};
  const candidate=(state.catalog||[]).find(row=>row.taskId===review.id&&
    row.version===version&&row.manifestHash===installed.manifestHash);
  if(!candidate||candidate.stage!=='available'||installed.version!==version||
    candidate.manifest?.program?.sourceHash!==review.sourceHash||
    JSON.stringify(candidate.manifest?.siteOrigins)!==JSON.stringify(review.siteOrigins))
    return {state:'unconfirmed'};
  return {state:'confirmed',id:review.id,kind:review.kind,version,
    manifestHash:installed.manifestHash};
}
