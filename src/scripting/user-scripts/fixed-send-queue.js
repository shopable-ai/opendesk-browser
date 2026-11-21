export const FIXED_QUEUE_PROTOCOL='opendesk.fixed-send-queue.v1';
export const FIXED_QUEUE_TOOL_ID='ai-send-queue';
export const FIXED_QUEUE_PROGRAM_ID='app.ai-send-queue';

// Reviewed Page companion bytes. This selects the compiled adapter, not the
// sidebar package, catalog release, or an installation grant. Any other Page
// source continues to use its original USER_SCRIPT path.
const reviewedSources=new Set([
  'e40ad69c1399bf6ea331b3769a3bacc12a816140da01689456cf5a04793bff64',
  '67c29e3e47f666bc68a57a56b5c35f59cd8ca5a0c6c14f4b4b20f9f76363a6df',
  '280ef188e7f94d13f9502e7ee5d7c3cf45d39c7abae57dbc38b3bbc44c84f982',
  '2fd4ed6f63d1c09a73050733725f46e5a8419f024e48d8139cf2010fb2813126',
  '7f08a09d7022a6bd03b9b3a162b998f7f39aaa7c802208a32c99803811609591'
]);
export function usesFixedSendQueue(toolId,row){
  const rules=row?.pageRules;
  return toolId===FIXED_QUEUE_TOOL_ID&&row?.programId===FIXED_QUEUE_PROGRAM_ID&&
    reviewedSources.has(row.sourceHash)&&rules?.matches?.length===1&&rules.matches[0]==='https://chatgpt.com/*'&&
    rules.excludeMatches?.length===0&&rules.allFrames===false&&rules.world==='USER_SCRIPT'&&rules.runAt==='document_idle';
}
