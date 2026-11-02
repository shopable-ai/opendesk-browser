// Exact pre-release source-bound admission for one product, not an official publication.
// A manually imported same-ID package MUST NOT inherit queue control authority.
export const SEND_QUEUE_PIN=Object.freeze({
  toolId:'ai-send-queue',toolVersion:'0.1.16',
  toolPackageSha256:'b1ddcc7245c414e1e8dc94b7c3d671c20ddbf9b77d4155cbeb819b643a014236',
  pageProgramId:'opendesk.ai-send-queue',pageVersion:'0.1.14',pageRevision:14,
  pagePackageHash:'fcb982f876d8c4b1085be8c0eecf73580a4bfdfba9a0a93fb4ce63deb2838a31',
  pageSourceHash:'54cb629d7f6fcf5c8ff0811cc36ff53706e9aebfdea01dbdd8760353e511a218'
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
