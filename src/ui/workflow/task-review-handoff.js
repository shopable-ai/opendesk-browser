// Presentation-only one-shot handoff between Workflow Side Panel and the existing
// full-page Task Catalog. NEVER verifies/installs a Task or authorizes a run.
// The catalog MUST re-read the authoritative Candidate and preserve every user click.
const FORMAT='opendesk.workflow-task-review-handoff.v1';
const LIFETIME_MS=120000;
const HASH=/^[a-f0-9]{64}$/;
const TASK_ID=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/;
const VERSION=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RUN_ID=/^[a-zA-Z0-9_.:-]{4,160}$/;
const FIELDS=['format','windowId','issuedAt','taskId','version','manifestHash','sourceHash','siteOrigin','runId'];
export const taskReviewHandoffKey=windowId=>
  Number.isSafeInteger(windowId)&&windowId>=0
    ? 'opendesk.workflow.task-review-handoff.v1:'+windowId:null;
export function createTaskReviewHandoff({windowId,taskId,version,manifestHash,sourceHash,siteOrigin,runId=null,issuedAt=Date.now()}){
  const row={format:FORMAT,windowId,issuedAt,taskId,version,manifestHash,sourceHash,siteOrigin,runId};
  if(!validateTaskReviewHandoff(row,windowId,issuedAt))throw Error('Invalid Workflow Task review handoff identity');
  return Object.freeze(row);
}
function exactOrigin(value){
  if(typeof value!=='string')return false;
  try{const u=new URL(value);return (u.protocol==='https:'||u.protocol==='http:')&&u.origin===value&&!u.username&&!u.password}
  catch{return false}
}
export function validateTaskReviewHandoff(row,windowId,now=Date.now()){
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==FIELDS.length||
    !Object.keys(row).every(key=>FIELDS.includes(key))||row.format!==FORMAT||
    !Number.isSafeInteger(windowId)||windowId<0||row.windowId!==windowId||
    !Number.isSafeInteger(now)||!Number.isSafeInteger(row.issuedAt)||
    row.issuedAt>now||now-row.issuedAt>LIFETIME_MS||
    !TASK_ID.test(row.taskId)||!VERSION.test(row.version)||!HASH.test(row.sourceHash)||
    !HASH.test(row.manifestHash)||!exactOrigin(row.siteOrigin)||
    !(row.runId===null||typeof row.runId==='string'&&RUN_ID.test(row.runId)))return false;
  return true;
}
export function matchTaskReviewHandoff(row,windowId,catalog,now=Date.now()){
  if(!validateTaskReviewHandoff(row,windowId,now)||!Array.isArray(catalog))return null;
  const matches=catalog.filter(item=>item?.taskId===row.taskId&&item.version===row.version&&
    item.manifestHash===row.manifestHash&&item.manifest?.program?.sourceHash===row.sourceHash&&
    Array.isArray(item.manifest.siteOrigins)&&item.manifest.siteOrigins.length===1&&
    item.manifest.siteOrigins[0]===row.siteOrigin);
  if(matches.length!==1)return null;
  // Identity-only preselection. Import/Verify/Available/Install continue through
  // the original Authority and trusted user-consent UI.
  return Object.freeze({candidateKey:row.taskId+'@'+row.version,runId:row.runId});
}
