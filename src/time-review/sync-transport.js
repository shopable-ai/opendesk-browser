// Optional HTTPS daily-upsert adapter. No endpoint is currently production-
// certified, and no code path auto-instantiates this from a tool iframe.
import {REVIEW_SYNC_PROTOCOL,dailyReviewUpsertPayload} from './sync-outbox.js';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
export function verifiedReviewSyncOrigin(origin,allowOrigins){
  if(typeof origin!=='string'||!Array.isArray(allowOrigins)||!allowOrigins.includes(origin))
    fail('E_SYNC_ORIGIN','同步服务器未获得可信宿主明确批准');
  let url;
  try{url=new URL(origin);}catch{fail('E_SYNC_ORIGIN','服务器地址无效');}
  if(url.protocol!=='https:'||url.origin!==origin||url.pathname!=='/'||url.search||url.hash||url.username||url.password||!url.hostname)
    fail('E_SYNC_ORIGIN','只能使用经过批准的 HTTPS Origin');
  return origin;
}
/**
 * Caller must prove: trusted host click and connection, account binding,
 * exact Chrome optional host grant, and a SERVER that implements monotone PUT.
 * A 2xx without an exact ACK is UNKNOWN, never a successful upload.
 */
export async function putReviewSyncRecord({record,origin,allowOrigins=[],token,fetchImpl=globalThis.fetch,hostPermissionGranted=false,timeoutMs=15000}={}){
  const server=verifiedReviewSyncOrigin(origin,allowOrigins);
  if(hostPermissionGranted!==true)fail('E_SYNC_PERMISSION','同步服务没有独立的网络权限');
  if(typeof token!=='string'||!token||token.length>8192||/[\r\n]/.test(token))
    fail('E_SYNC_AUTH','缺少可信宿主提供的有效凭据');
  if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000)fail('E_SYNC_DATA','网络超时设置无效');
  const body=dailyReviewUpsertPayload(record);
  const path='/v1/time-review/daily/'+body.id;
  let response;
  try{
    response=await fetchImpl(server+path,{
      method:'PUT',redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',
      signal:AbortSignal.timeout(timeoutMs),
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,
        'Idempotency-Key':body.scope+':'+body.id+':'+body.revision},
      body:JSON.stringify(body)
    });
  }catch{fail('E_SYNC_RETRY','请求结果未知，必须保留原修订并执行幂等 PUT 重试');}
  if(!response||typeof response.status!=='number')fail('E_SYNC_RETRY','服务器未返回有效响应');
  if(response.status===401||response.status===403)fail('E_SYNC_AUTH','同步凭据或访问授权已失效');
  if(response.status===429||response.status>=500)fail('E_SYNC_RETRY','同步服务器暂不可用');
  if(response.status<200||response.status>=300)fail('E_SYNC_PROTOCOL','同步协议不兼容，停止发送');
  let ack;
  try{ack=await response.json();}catch{fail('E_SYNC_RETRY','服务器确认回执不完整，保留原记录');}
  if(!ack||ack.protocol!==REVIEW_SYNC_PROTOCOL||ack.scope!==body.scope||ack.id!==body.id||
    ack.revision!==body.revision||ack.accepted!==true)
    fail('E_SYNC_RETRY','回执不匹配，可能已经写入，必须按幂等协议核对');
  return ack;
}
