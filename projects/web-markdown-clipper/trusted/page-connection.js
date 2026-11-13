import {CLIP_PROTOCOL,CLIP_READY_OPERATION} from './policy.js';

const unavailable=()=>new Error('网页剪藏连接未就绪，请刷新目标网页后重试');
const missingReceiver=error=>/^Could not establish connection\. Receiving end does not exist\.?$/i.test(String(error?.message||''));

// Trusted Host only. A read-only probe can prepare the existing fixed relay;
// the actual picker request is sent once by its original session owner.
export async function ensureClipPageConnection({api,target,toolId,installEpoch,authorize}){
  const probe=()=>api.tabs.sendMessage(target.tabId,{
    protocol:CLIP_PROTOCOL,operation:CLIP_READY_OPERATION,toolId,
    expectedUrl:target.url,installEpoch
  },{frameId:0,documentId:target.documentId});
  const check=reply=>{
    if(reply?.ok===true&&reply.data?.ready===true)return true;
    if(reply?.ok===false)throw new Error(String(reply.error||'网页剪藏连接未就绪').slice(0,200));
    return false;
  };
  await authorize();
  let reply;
  try{reply=await probe();}catch(error){if(!missingReceiver(error))throw error;}
  if(check(reply)){await authorize();return;}
  await authorize();
  if(!api.scripting?.executeScript)throw unavailable();
  const rows=await api.scripting.executeScript({
    target:{tabId:target.tabId,documentIds:[target.documentId]},
    world:'ISOLATED',files:['agents/page-relay.js']
  });
  if(!Array.isArray(rows)||rows.length!==1||rows[0].frameId!==0||rows[0].documentId!==target.documentId)
    throw unavailable();
  await authorize();
  try{reply=await probe();}catch(error){if(missingReceiver(error))throw unavailable();throw error;}
  if(!check(reply))throw unavailable();
  await authorize();
}
