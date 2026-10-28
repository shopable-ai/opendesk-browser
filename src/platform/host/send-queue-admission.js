// Exact pre-release source-bound admission for one product, not an official publication.
// A manually imported same-ID package MUST NOT inherit queue control authority.
export const SEND_QUEUE_PIN=Object.freeze({
  toolId:'ai-send-queue',toolVersion:'0.1.13',
  toolPackageSha256:'df0f8484594dc7f0d5ac7c0d4c79330426aa079981af00a012282c5f31065ddb',
  pageProgramId:'opendesk.ai-send-queue',pageRevision:13,
  pageSourceHash:'2e33a179ff03ba02810827ce6bc56482a3ae90d4da9b93805870334b6962e8de'
});
export function admitsPinnedQueueTool(tool,sha256){
  return tool?.id===SEND_QUEUE_PIN.toolId&&
    tool.version===SEND_QUEUE_PIN.toolVersion&&
    tool.uiRuntime==='opendesk.react-ui.v1'&&
    Array.isArray(tool.capabilities)&&tool.capabilities.length===1&&
    tool.capabilities[0]==='currentPage.read'&&
    sha256===SEND_QUEUE_PIN.toolPackageSha256;
}
export function admitsPinnedQueuePage(row){
  const rules=row?.pageRules;
  return row?.programId===SEND_QUEUE_PIN.pageProgramId&&
    row.revision===SEND_QUEUE_PIN.pageRevision&&
    row.sourceHash===SEND_QUEUE_PIN.pageSourceHash&&
    Array.isArray(rules?.matches)&&rules.matches.length===1&&
    rules.matches[0]==='https://chatgpt.com/*'&&
    Array.isArray(rules.excludeMatches)&&rules.excludeMatches.length===0&&
    rules.world==='USER_SCRIPT'&&rules.runAt==='document_idle'&&
    rules.allFrames===false;
}
