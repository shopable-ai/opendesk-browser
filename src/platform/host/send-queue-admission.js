// Exact pre-release source-bound admission for one product, not an official publication.
// A manually imported same-ID package MUST NOT inherit queue control authority.
export const SEND_QUEUE_PIN=Object.freeze({
  toolId:'ai-send-queue',toolVersion:'0.1.16',
  toolPackageSha256:'b1ddcc7245c414e1e8dc94b7c3d671c20ddbf9b77d4155cbeb819b643a014236',
  pageProgramId:'opendesk.ai-send-queue',pageVersion:'0.1.15',pageRevision:15,
  pagePackageHash:'e04a32ebe018375c39a0cc375da036cc9ca8db60243e719cbea82842cf24627c',
  pageSourceHash:'61fdf8665b8ff557d345fed5325be211793abf6610698a85ef6a536daed5e5cb'
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
