// Exact pre-release source-bound admission for one product, not an official publication.
// A manually imported same-ID package MUST NOT inherit queue control authority.
export const SEND_QUEUE_PIN=Object.freeze({
  toolId:'ai-send-queue',toolVersion:'0.1.15',
  toolPackageSha256:'ef5a8d512783b99dd96e6eba0eda24aadbe9f3f3842cf716e1782f2657de9fea',
  pageProgramId:'opendesk.ai-send-queue',pageVersion:'0.1.13',pageRevision:13,
  pagePackageHash:'c63d0b0321826eabf5340f06a96d435a6983fc982371e2bede440941c9a30720',
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
