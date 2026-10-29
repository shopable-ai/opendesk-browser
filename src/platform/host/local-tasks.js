// Trusted, generic transport. No application extraction rules or executable code.
export const LOCAL_TASK_CAPABILITY='localTasks';
const PREFIX='opendesk.local-tasks.trusted.v1:';
const fail=(code,message)=>Object.assign(Error(message),{code});
const id=/^[A-Za-z0-9_-]{1,100}$/;
const safeId=value=>typeof value==='string'&&id.test(value)&&!['__proto__','prototype','constructor'].includes(value);
const own=(map,key)=>map&&Object.hasOwn(map,key)?map[key]:undefined;
const taskLock=(toolId,work)=>globalThis.navigator?.locks?.request?
  globalThis.navigator.locks.request('opendesk.sidebar-tools:local-tasks:'+toolId,work):work();
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const stable=value=>JSON.stringify(value,(_,item)=>plain(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const schema=(v,keys)=>{if(!plain(v)||Object.keys(v).some(k=>!keys.includes(k)))throw fail('E_LOCAL_SCHEMA','本地任务请求字段无效');};
export function validateLocalTaskRequest(input){
  schema(input,['method','path','body','targetOrigin']);
  const {method,path,body,targetOrigin}=input;
  if(bytes(input)>24000||!['GET','POST'].includes(method)||typeof path!=='string')throw fail('E_LOCAL_SCHEMA','本地任务请求超限或无效');
  const start=method==='POST'&&path==='/v1/runs';
  const read=method==='GET'&&/^\/v1\/runs\/[A-Za-z0-9_-]{1,100}(?:\/records\?offset=\d{1,5}&limit=(?:[1-9]|[1-4]\d|50))?$/.test(path);
  const lookup=method==='GET'&&/^\/v1\/runs\/by-request\/[A-Za-z0-9_-]{1,100}$/.test(path);
  const stop=method==='POST'&&/^\/v1\/runs\/[A-Za-z0-9_-]{1,100}\/stop$/.test(path);
  if(!start&&!read&&!lookup&&!stop)throw fail('E_LOCAL_ENDPOINT','本地任务端点不允许');
  if(start){
    let url;try{url=new URL(targetOrigin);}catch{}
    if(!url||!['http:','https:'].includes(url.protocol)||url.origin!==targetOrigin||url.username||url.password||!plain(body)||!safeId(body.requestId))throw fail('E_LOCAL_SCHEMA','任务目标范围或请求身份无效');
  }else if(targetOrigin!==undefined||method==='GET'&&body!==undefined||stop&&body!==undefined&&(!plain(body)||Object.keys(body).length))throw fail('E_LOCAL_SCHEMA','本地任务读取或停止参数无效');
  const ref=start?body.requestId:path.split('/')[lookup?4:3];
  if(!safeId(ref))throw fail('E_LOCAL_SCHEMA','任务身份无效');
  return {start,lookup,stop,ref};
}
function credential(value){
  schema(value,['format','secret','endpoint']);
  let url;try{url=new URL(value.endpoint);}catch{}
  if(value.format!=='opendesk.local-task-credential.v1'||!url||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.pathname!=='/'||url.search||url.hash||url.username||url.password||
    typeof value.secret!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(value.secret))throw fail('E_LOCAL_PAIRING','配对文件无效；只允许固定 127.0.0.1 服务');
  return {endpoint:url.origin,secret:value.secret};
}
// Called only during the original trusted confirmation click. File bytes and
// credentials never enter the tool iframe or its storage namespace.
export function pickLocalTaskCredential(doc=globalThis.document){
  return new Promise((resolve,reject)=>{
    const input=doc.createElement('input');input.type='file';input.accept='.json';input.hidden=true;
    const finish=(error,value)=>{clearTimeout(timer);input.remove();error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(fail('E_CANCELLED','配对文件选择已取消')),60000);
    input.oncancel=()=>finish(fail('E_CANCELLED','配对文件选择已取消'));
    input.onchange=async()=>{try{const file=input.files?.[0];if(!file||file.size>4096)throw fail('E_LOCAL_PAIRING','配对文件为空或超限');finish(null,JSON.parse(await file.text()));}catch(error){finish(error);}};
    doc.body.append(input);input.click();
  });
}
async function boundedFetch(fetcher,url,options,maxBytes=180000){
  const response=await fetcher(url,{...options,redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});
  const chunks=[];let size=0;
  if(response.body){const reader=response.body.getReader();try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();throw fail('E_LOCAL_LIMIT','本地服务响应超限');}chunks.push(value);}}finally{reader.releaseLock();}}
  const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
  if(!response.ok){
    let rejected;try{rejected=JSON.parse(new TextDecoder().decode(data))?.error?.code;}catch{}
    const beforeCreate=['WORKER_BUSY','PREVIEW_REQUIRED','PREVIEW_MISMATCH','NOT_SUPPORTED','INVALID_CONFIG','INVALID_SELECTOR','INVALID_URL','INVALID_PREVIEW_PAGES','INVALID_PREVIEW_BINDING'];
    const noCreate=options.method==='POST'&&url.endsWith('/v1/runs')&&[409,422].includes(response.status)&&beforeCreate.includes(rejected);
    throw fail(noCreate?'E_LOCAL_NOT_CREATED':response.status===404?'E_LOCAL_NOT_FOUND':response.status===401?'E_LOCAL_SESSION':'E_LOCAL_SERVICE',
      noCreate?'服务明确拒绝创建（'+rejected+'）；未启动新任务':'本地服务拒绝请求（'+response.status+'）；请查询原任务');
  }
  return data;
}
const json=async(fetcher,connection,path,token,method='GET',body)=>{
  const data=await boundedFetch(fetcher,connection.endpoint+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}catch{throw fail('E_LOCAL_RESPONSE','本地服务返回无效 JSON');}
};
export function createLocalTaskBridge({api,toolId,owner,assertAuthorized,confirm,pickCredential=pickLocalTaskCredential,fetcher=globalThis.fetch,lock=work=>taskLock(toolId,work)}){
  const key=PREFIX+toolId,origin='chrome-extension://'+api.runtime.id;
  const sessions=new Map();let inFlight=0,minute=0,count=0;
  const load=async()=>{const row=(await api.storage.local.get(key))[key];
    if(row&&row.owner!==owner)throw fail('E_LOCAL_OWNER','前一安装的本地任务仍待撤权清理');
    return row||null;};
  async function persist(row){await api.storage.local.set({[key]:row});const read=await load();if(stable(read)!==stable(row))throw fail('E_LOCAL_UNKNOWN','任务身份保存结果未知；禁止启动');}
  async function prepare(scope){
    await assertAuthorized();let row=await load();
    if(!row||!row.scopes.includes(scope)){
      const paired=await confirm({scope,paired:Boolean(row),choose:()=>row?Promise.resolve(null):pickCredential()});
      await assertAuthorized();
      const pair=row||credential(paired);
      row={...pair,owner,scopes:[...new Set([...(row?.scopes||[]),scope])],requests:row?.requests||{},runs:row?.runs||{}};
      if(row.scopes.length>20)throw fail('E_LOCAL_LIMIT','已批准范围达到上限');
      await persist(row);
    }
    let session=sessions.get(scope);
    if(!session||session.expiresAt<Date.now()+30000){
      await assertAuthorized();
      const reply=await json(fetcher,row,'/v1/session',row.secret,'POST',{owner,origin,scope});
      if(typeof reply.token!=='string'||!reply.token||!Number.isFinite(reply.expiresAt))throw fail('E_LOCAL_RESPONSE','服务会话身份缺失');
      session={token:reply.token,expiresAt:reply.expiresAt<1e12?reply.expiresAt*1000:reply.expiresAt};sessions.set(scope,session);
    }
    await assertAuthorized();return {row,token:session.token};
  }
  async function execute(input){
    const checked=validateLocalTaskRequest(input);
    await assertAuthorized();let saved=await load();
    if(checked.start&&own(saved?.requests,checked.ref))throw fail('E_LOCAL_REPLAY','禁止重放任务启动；请查询原请求');
    if(checked.start&&saved?.unresolved)throw fail('E_LOCAL_UNKNOWN','原启动结果未知；必须先按原 requestId 对账，禁止换 ID 启动');
    if(checked.lookup&&(!own(saved?.requests,checked.ref)||own(saved?.notCreated,checked.ref)))
      throw fail('E_LOCAL_NOT_CREATED','可信账本确认此请求未创建任务');
    const scope=checked.start?input.targetOrigin:checked.lookup?own(saved?.requests,checked.ref):own(saved?.runs,checked.ref);
    if(!scope)throw fail('E_LOCAL_OWNER','此任务不属于当前安装身份');
    let prepared;
    try{prepared=await prepare(scope);}catch(error){
      if(checked.start&&error.code!=='E_CANCELLED')throw fail('E_LOCAL_NOT_CREATED','本机连接或配对尚未完成；未发送任务创建请求');
      throw error;
    }
    const row=prepared.row;
    if(checked.start){
      if(Object.hasOwn(row.requests,checked.ref))throw fail('E_LOCAL_REPLAY','禁止重放任务启动；请查询原请求');
      if(Object.keys(row.requests).length>=128)throw fail('E_LOCAL_LIMIT','本地任务身份记录已满');
      row.requests={...row.requests,[checked.ref]:scope};row.unresolved=checked.ref;
      await persist(row); // before any side effect
    }
    try{await assertAuthorized();}catch(error){
      if(checked.start){delete row.unresolved;row.notCreated={...row.notCreated,[checked.ref]:true};await persist(row);}
      throw error;
    }
    let reply;
    try{reply=await json(fetcher,row,input.path,prepared.token,input.method,input.body);}
    catch(error){if(error.code==='E_LOCAL_SESSION')sessions.delete(scope);
      if(checked.start&&error.code==='E_LOCAL_NOT_CREATED'){
        delete row.unresolved;row.notCreated={...row.notCreated,[checked.ref]:true};await persist(row);throw error;
      }
      if(checked.start)throw fail('E_LOCAL_UNKNOWN','启动回执未知；请按原 requestId 查询，禁止重复启动');throw error;}
    await assertAuthorized();
    if((checked.start||checked.lookup)&&(reply?.requestId!==checked.ref||!safeId(reply?.runId)))
      throw fail('E_LOCAL_UNKNOWN','原请求回执身份缺失或不符；只能按原 requestId 查询');
    if(checked.start||checked.lookup){
      row.runs={...row.runs,[reply.runId]:scope};
      if(row.unresolved===checked.ref)delete row.unresolved;
      await persist(row);
    }
    return reply;
  }
  return Object.freeze({
    async request(input){
      const now=Math.floor(Date.now()/60000);if(now!==minute){minute=now;count=0;}
      if(++count>120||inFlight>=2)throw fail('E_LOCAL_RATE','本地任务请求过于频繁');
      inFlight++;try{return await lock(()=>execute(input));}finally{inFlight--;}
    },
    async export(input){return lock(async()=>{
      schema(input,['runId','format']);const {runId,format}=input;
      if(!safeId(runId)||!['jsonl','csv'].includes(format))throw fail('E_LOCAL_SCHEMA','导出身份或格式无效');
      await assertAuthorized();const saved=await load(),scope=own(saved?.runs,runId);if(!scope)throw fail('E_LOCAL_OWNER','任务不属于当前安装');
      const {row,token}=await prepare(scope);
      // Bounded stream stays in the trusted Host. Only a download receipt crosses IPC.
      let data;
      try{data=await boundedFetch(fetcher,row.endpoint+'/v1/runs/'+runId+'/export?format='+format,{headers:{Authorization:'Bearer '+token}},32*1024*1024);}
      catch(error){if(error.code==='E_LOCAL_SESSION')sessions.delete(scope);throw error;}
      await assertAuthorized();const url=URL.createObjectURL(new Blob([data],{type:format==='csv'?'text/csv':'application/x-ndjson'}));
      try{const downloadId=await api.downloads.download({url,filename:'local-run-'+runId+'.'+format,saveAs:true});
        if(!Number.isInteger(downloadId))throw fail('E_LOCAL_UNKNOWN','下载回执未知，请查看下载列表');return {started:true,downloadId};
      }finally{setTimeout(()=>URL.revokeObjectURL(url),120000);}
    });}
  });
}
export async function revokeLocalTasks(api,toolId,{fetcher=globalThis.fetch,lock=work=>taskLock(toolId,work)}={}){return lock(async()=>{
  const key=PREFIX+toolId,row=(await api.storage.local.get(key))[key];if(!row)return;
  credential({format:'opendesk.local-task-credential.v1',endpoint:row.endpoint,secret:row.secret});
  const result=await json(fetcher,row,'/v1/revoke',row.secret,'POST',{owner:row.owner});
  if(result.revoked!==true||result.workerExited!==true)throw fail('E_LOCAL_UNKNOWN','本地任务撤权尚未确认退出');
  await api.storage.local.remove(key);
  if((await api.storage.local.get(key))[key]!==undefined)throw fail('E_LOCAL_UNKNOWN','本地任务配对清理结果未知');
});}
