// OD-WEBFLOW-FIXED-TASK-DECOUPLING-R10
// Audited first-party GitHub Issue -> ChatGPT A/B/A grant adapter.
// This module is statically registered in the original SW; never imported
// by installed scripts, sandbox workers or page content.
import {WEB_TASK_PROTOCOL} from '../../../src/page-events/web-task-contract.js';
import {REVIEWED_BUILTIN_TASK_RELEASES} from '../../../src/platform/tasks/builtin-releases.js';
import {createIssueWorkflowAuthority,issueWorkflowScope,ISSUE_WORKFLOW_RECIPE}
  from './issue-workflow-authorization.js';

const ACTIONS=new Set(['workflow-auth-read','workflow-auth-approve','workflow-auth-revoke']);
const fail=(code,message)=>Object.assign(new Error(message),{code});
const accepts=message=>message?.protocol===WEB_TASK_PROTOCOL&&ACTIONS.has(message.kind);

export function createIssueWorkflowAuthorizationHost({api,loadFoundation,requireSettingsSender}={}){
  if(!api?.runtime?.id||typeof api?.permissions?.contains!=='function'||
    typeof loadFoundation!=='function'||typeof requireSettingsSender!=='function')
    throw fail('E_ISSUE_WORKFLOW_OWNER','缺少第一方可信授权宿主');
  async function handle(message,sender){
    if(!accepts(message))throw fail('E_ISSUE_WORKFLOW_SCOPE','未知业务授权操作');
    // Reuse the original SW's exact sidepanel document/context verifier.
    const actual=await requireSettingsSender(sender);
    const broker=await loadFoundation();
    const authority=createIssueWorkflowAuthority({storage:broker.storage,
      namespace:'tool:'+api.runtime.id});
    if(message.kind==='workflow-auth-read')return authority.read();
    if(message.kind==='workflow-auth-revoke')return authority.revoke();

    // A workflow approval cannot turn into a generic Task or repository grant.
    const reviewed=issueWorkflowScope(message.installation),pin=reviewed.installation;
    const current=await broker.authority.resolveInstalledTask({taskId:reviewed.taskId},actual);
    const immutable=REVIEWED_BUILTIN_TASK_RELEASES.find(row=>
      row.taskId===reviewed.taskId&&row.version===reviewed.taskVersion);
    const samePin=item=>item?.taskId===reviewed.taskId&&
      ['version','manifestHash','contentHash','scriptId','revision',
        'installationId','generation'].every(key=>item[key]===pin[key]);
    if(!immutable||!samePin(current)||
      current.manifestHash!==immutable.manifestHash||
      current.contentHash!==immutable.sourceHash||
      current.manifest?.targetDisposition!=='retain-on-success'||
      current.manifest?.siteOrigins?.length!==1||
      current.manifest.siteOrigins[0]!==ISSUE_WORKFLOW_RECIPE.sourceOrigin)
      throw fail('E_ISSUE_WORKFLOW_INSTALLATION','仅允许审阅版 ChatGPT 0.2.0 的当前安装身份');
    if(!await api.permissions.contains({origins:[
      ISSUE_WORKFLOW_RECIPE.sourceOrigin+'/*',ISSUE_WORKFLOW_RECIPE.githubApiOrigin+'/*']}))
      throw fail('E_ISSUE_WORKFLOW_PERMISSION','缺少 GitHub 或 ChatGPT 网站权限，不会保存授权');
    await requireSettingsSender(sender);
    if(!samePin(await broker.authority.resolveInstalledTask({taskId:reviewed.taskId},actual)))
      throw fail('E_ISSUE_WORKFLOW_INSTALLATION','审核期间安装身份改变');
    return authority.approve(reviewed);
  }
  return Object.freeze({accepts,handle});
}
