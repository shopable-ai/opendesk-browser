// OD-AI-WORKFLOW-BRIDGE: reviewed standing authorization for one fixed public
// GitHub -> immutable ChatGPT 0.2.0 send -> original A workflow.
// Uses the ORIGINAL transactional frameworkKV, never chrome.storage auto grants.
// This policy never authorizes a Run by itself: original Authority/Controller
// and source A/B identity checks remain mandatory at each effect boundary.
export const ISSUE_WORKFLOW_SCOPE_KEY='webflow:github-issue-standing-scope:v1:';
export const ISSUE_WORKFLOW_CAPABILITIES=Object.freeze([
  'github.issue.read','chatgpt.conversation.create.send',
  'controller.result.read','chatgpt.source-a.send'
]);
// R10 immutable business recipe identity, NOT a framework-wide grant.
// Keep the persisted v1 scope byte-compatible with existing approvals.
export const ISSUE_WORKFLOW_RECIPE=Object.freeze({
  id:'github-public-issue-to-chatgpt-original-a',version:'1.0.0',
  sourceOrigin:'https://chatgpt.com',githubRepo:'shopable-ai/opendesk-browser',
  githubApiOrigin:'https://api.github.com',
  taskId:'chatgpt.conversation.create',taskVersion:'0.2.0',
  taskScriptId:'task:chatgpt.conversation.create:0.2.0',taskRevision:1,
  taskTargetUrl:'https://chatgpt.com/',
  parameterPolicy:'same-public-repo-variable-issue-and-objective-v1',
  capabilities:ISSUE_WORKFLOW_CAPABILITIES
});
const ID=/^[A-Za-z0-9._:-]{8,128}$/u;
const SHA=/^[a-f0-9]{64}$/u;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const plain=x=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const PIN_KEYS=['version','manifestHash','contentHash','scriptId','revision','installationId','generation'];
const clone=x=>structuredClone(x);
export function issueWorkflowScope(installation){
  const recipe=ISSUE_WORKFLOW_RECIPE;
  if(!plain(installation)||Object.keys(installation).sort().join(',')!==PIN_KEYS.slice().sort().join(',')||
    installation.version!==recipe.taskVersion||
    installation.scriptId!==recipe.taskScriptId||
    installation.revision!==recipe.taskRevision||
    !SHA.test(installation.manifestHash)||!SHA.test(installation.contentHash)||
    !ID.test(installation.installationId)||
    !Number.isSafeInteger(installation.generation)||installation.generation<1)
    fail('E_ISSUE_WORKFLOW_INSTALLATION');
  return {
    sourceOrigin:recipe.sourceOrigin,
    githubRepo:recipe.githubRepo,
    githubApiOrigin:recipe.githubApiOrigin,
    taskId:recipe.taskId,
    taskVersion:recipe.taskVersion,
    taskTargetUrl:recipe.taskTargetUrl,
    send:true,readFullBResult:true,deliverOriginalA:true,
    installation:clone(installation),
    capabilities:[...recipe.capabilities],
    // Review permits changing public Issue number and analysis objective,
    // never the GitHub repository, Task pin, send permission or destination.
    parameterPolicy:recipe.parameterPolicy
  };
}
const canonical=x=>JSON.stringify(x,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?
  Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const verifiedScope=scope=>{
  if(!plain(scope))fail('E_ISSUE_WORKFLOW_SCOPE');
  const expected=issueWorkflowScope(scope.installation);
  if(canonical(scope)!==canonical(expected))fail('E_ISSUE_WORKFLOW_SCOPE');
  return expected;
};
function validateRow(row){
  if(!plain(row)||row.version!==1||!Number.isSafeInteger(row.epoch)||row.epoch<1||
    !['active','revoked'].includes(row.state)||!ID.test(row.grantId)||
    !Number.isSafeInteger(row.approvedAt)||row.approvedAt<=0||
    row.scope===undefined)fail('E_ISSUE_WORKFLOW_STORAGE');
  verifiedScope(row.scope);
  return row;
}
export function createIssueWorkflowAuthority({storage,namespace,clock=Date.now,
  newGrantId=()=>crypto.randomUUID()}={}){
  if(!storage?.transaction||typeof namespace!=='string'||!ID.test(namespace)||
    typeof clock!=='function'||typeof newGrantId!=='function')fail('E_ISSUE_WORKFLOW_OWNER');
  const key=ISSUE_WORKFLOW_SCOPE_KEY+namespace;
  const transaction=(mode,fn)=>storage.transaction(['frameworkKV'],mode,tx=>fn(tx,key));
  async function read(){
    const row=await transaction('readonly',(tx,k)=>tx.get('frameworkKV',k));
    return row?clone(validateRow(row)):null;
  }
  async function approve(scope){
    const frozen=verifiedScope(scope),grantId=newGrantId(),now=clock();
    if(!ID.test(grantId)||!Number.isSafeInteger(now)||now<=0)
      fail('E_ISSUE_WORKFLOW_OWNER');
    return transaction('readwrite',async(tx,k)=>{
      const old=await tx.get('frameworkKV',k);
      if(old)validateRow(old);
      const row={version:1,epoch:(old?.epoch??0)+1,grantId,state:'active',
        approvedAt:now,scope:frozen};
      await tx.put('frameworkKV',k,row);
      return clone(row);
    });
  }
  async function revoke(){
    return transaction('readwrite',async(tx,k)=>{
      const row=await tx.get('frameworkKV',k);
      if(!row)return null;
      validateRow(row);
      const next={...row,state:'revoked',epoch:row.epoch+1};
      await tx.put('frameworkKV',k,next);
      return clone(next);
    });
  }
  async function assert({authorizationRef,epoch,installation}={}){
    const row=await read();
    if(!row||row.state!=='active'||row.grantId!==authorizationRef||
      row.epoch!==epoch||canonical(row.scope)!==canonical(issueWorkflowScope(installation)))
      fail('E_ISSUE_WORKFLOW_REVOKED');
    return row;
  }
  return Object.freeze({read,approve,revoke,assert});
}
