import http from 'node:http';
import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,open,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {WebSocketServer} from 'ws';
import {validateTaskParams,verifyTaskPackage} from '../../src/platform/tasks/contract.js';
import {canonical} from '../../src/platform/protocol.js';
const fixedPackage=JSON.parse(await readFile(new URL('../../examples/tasks/form-fill.v1.opendesk-task.json',import.meta.url),'utf8'));
const token=()=>randomBytes(32).toString('hex');
const hash=v=>createHash('sha256').update(canonical(v)).digest('hex');
const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code});};
const exact=(v,keys)=>{if(!v||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))fail('E_SCHEMA');};
const secureEqual=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export async function openProvider({directory='.local/cloud-control',port=43112,clock=()=>Date.now()}={}) {
  directory=resolve(directory);await mkdir(directory,{recursive:true,mode:0o700});
  const lock=resolve(directory,'provider.lock');
  let handle;try{handle=await open(lock,'wx',0o600);await handle.writeFile(String(process.pid));}
  catch(error){if(error.code!=='EEXIST')throw error;const pid=Number(await readFile(lock,'utf8'));try{process.kill(pid,0);fail('E_PROVIDER_BUSY');}catch(e){if(e.code!=='ESRCH')throw e;}await unlink(lock);handle=await open(lock,'wx',0o600);await handle.writeFile(String(process.pid));}
  const file=resolve(directory,'state.json'),credentialFile=resolve(directory,'admin.json');
  let state,credentials;
  try{state=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={version:1,providerId:randomUUID(),executors:{},pairs:{},jobs:{},requests:{},faults:{}};}
  try{credentials=JSON.parse(await readFile(credentialFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;credentials={adminToken:token(),pairingCode:token()};await writeFile(credentialFile,JSON.stringify(credentials),{mode:0o600});}
  let tail=Promise.resolve();
  async function save(){const h=await open(file+'.tmp','w',0o600);try{await h.writeFile(JSON.stringify(state,null,2));await h.sync();}finally{await h.close();}await rename(file+'.tmp',file);}
  await save();
  const serial=fn=>{const next=tail.then(async()=>{const before=structuredClone(state);try{return await fn();}catch(error){state=before;throw error;}});tail=next.catch(()=>{});return next;};
  function once(scope,key,body,fn){if(typeof key!=='string'||key.length>150)fail('E_SCHEMA');const k=scope+':'+key,d=hash(body),old=state.requests[k];if(old){if(old.digest!==d)fail('E_REQUEST_CONFLICT');return structuredClone(old.answer);}const answer=fn();state.requests[k]={digest:d,answer:structuredClone(answer)};return answer;}
  const sockets=new Map(),tickets=new Map();
  const notify=executorId=>{for(const [ws,id]of sockets)if(!executorId||id===executorId)ws.send(JSON.stringify({type:'notify'}));};
  const owned=(b,id)=>{const j=Object.values(state.jobs).find(j=>j.assignment?.assignmentId===b.assignmentId&&j.assignment.executorId===id);if(!j)fail('E_ASSIGNMENT');return j;};
  const server=http.createServer(async(req,res)=>{
    try{
      if(req.method!=='POST')fail('E_METHOD');
      if(req.headers.origin&&!req.headers.origin.startsWith('chrome-extension://'))fail('E_ORIGIN');
      let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>65536)fail('E_LIMIT');}const b=JSON.parse(text||'{}');
      const path=new URL(req.url,'http://127.0.0.1').pathname;
      const admin=path.startsWith('/admin/');
      let executorId;
      if(admin){if(!secureEqual(req.headers.authorization,'Bearer '+credentials.adminToken))fail('E_AUTH');}
      else if(path!=='/v1/pair'){executorId=Object.keys(state.executors).find(id=>secureEqual(req.headers.authorization,'Bearer '+state.executors[id].credential));if(!executorId)fail('E_AUTH');}
      const answer=await serial(async()=>{
        let out;
        switch(path){
          case '/v1/pair':{
            exact(b,['executorId','pairingCode']);if(!secureEqual(b.pairingCode,credentials.pairingCode)||!/^[-a-f0-9]{36}$/.test(b.executorId))fail('E_AUTH');
            state.executors[b.executorId]??={credential:token(),pairedAt:clock()};out={providerId:state.providerId,credential:state.executors[b.executorId].credential};break;}
          case '/v1/auth':{
            exact(b,[]);const t=token();tickets.set(t,{executorId,until:clock()+30000});out={ticket:t,expiresAt:clock()+30000,providerId:state.providerId};break;}
          case '/v1/capabilities':exact(b,['tasks']);if(!Array.isArray(b.tasks)||b.tasks.length>32)fail('E_SCHEMA');state.executors[executorId].capabilities=b.tasks;out={accepted:true};break;
          case '/v1/claim':{
            exact(b,['claimId','tasks']);out=once(executorId+':claim',b.claimId,b,()=>{
              if(![...sockets.values()].includes(executorId))fail('E_CONNECTION');
              const j=Object.values(state.jobs).find(j=>j.state==='queued'&&!j.cancelled&&b.tasks.some(t=>t.taskId===j.task.taskId&&t.manifestHash===j.task.manifestHash&&t.sourceHash===j.task.sourceHash));
              if(!j)return {assignment:null};j.state='assigned';j.assignment={assignmentId:randomUUID(),executorId,claimId:b.claimId,leaseUntil:clock()+90000};return {assignment:{...j.assignment,jobId:j.jobId,task:j.task,params:j.params,target:j.target}};});break;}
          case '/v1/admission':{
            exact(b,['assignmentId','runRef']);const j=owned(b,executorId);exact(b.runRef,['runId','resultId','requestId','sourceHash','manifestHash','grantId']);
            if(j.cancelled||j.assignment.leaseUntil<=clock())fail('E_LEASE');if(b.runRef.sourceHash!==j.task.sourceHash||b.runRef.manifestHash!==j.task.manifestHash)fail('E_TASK');
            out=once('admission',b.assignmentId,b,()=>{j.runRef=b.runRef;j.state='admitted';j.permit={permitId:randomUUID(),assignmentId:b.assignmentId,runRef:b.runRef,leaseUntil:j.assignment.leaseUntil,providerId:state.providerId};return j.permit;});break;}
          case '/v1/renew':{
            exact(b,['assignmentId','permitId']);const j=owned(b,executorId);if(j.cancelled||j.assignment.leaseUntil<=clock()||j.permit?.permitId!==b.permitId)fail('E_LEASE');j.assignment.leaseUntil=clock()+90000;out={leaseUntil:j.assignment.leaseUntil};break;}
          case '/v1/cancellation':{
            exact(b,['assignmentId']);const j=owned(b,executorId);out={cancelled:Boolean(j.cancelled),leaseUntil:j.assignment.leaseUntil};break;}
          case '/v1/receipt':{
            exact(b,['assignmentId','receiptKey','runRef','result']);const j=owned(b,executorId);if(canonical(j.runRef)!==canonical(b.runRef))fail('E_RUN_REF');
            out=once('receipt',b.receiptKey,b,()=>{j.receipt={receiptId:randomUUID(),receivedAt:clock(),digest:hash(b),result:b.result};j.state='received';return {receiptId:j.receipt.receiptId,digest:j.receipt.digest};});break;}
          case '/v1/reconcile':exact(b,[]);out={providerId:state.providerId,assignments:Object.values(state.jobs).filter(j=>j.assignment?.executorId===executorId).map(j=>({assignmentId:j.assignment.assignmentId,runRef:j.runRef??null,permit:j.permit??null,cancelled:!!j.cancelled,leaseUntil:j.assignment.leaseUntil,receipt:j.receipt?{receiptId:j.receipt.receiptId,digest:j.receipt.digest}:null}))};break;
          case '/admin/seed':{
            exact(b,['requestKey','params','target']);const pkg=await verifyTaskPackage(fixedPackage);if(b.target?.mode!=='owned'||new URL(b.target.url).origin!=='http://127.0.0.1:43111'||new URL(b.target.url).pathname!=='/demo-form.html')fail('E_TARGET');
            const params=validateTaskParams(pkg.manifest.paramsSchema,b.params??{});out=once('seed',b.requestKey,b,()=>{const jobId=randomUUID();state.jobs[jobId]={jobId,state:'queued',createdAt:clock(),task:{taskId:pkg.manifest.taskId,version:pkg.manifest.version,manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash},params,target:b.target};return {jobId};});break;}
          case '/admin/cancel':exact(b,['jobId']);if(!state.jobs[b.jobId])fail('E_JOB');state.jobs[b.jobId].cancelled=true;out={cancelled:true};break;
          case '/admin/fault':exact(b,['path','count']);if(!['/v1/admission','/v1/claim','/v1/receipt'].includes(b.path)||!Number.isSafeInteger(b.count)||b.count<0||b.count>10)fail('E_SCHEMA');state.faults[b.path]=b.count;out={set:true};break;
          case '/admin/state':exact(b,[]);out={providerId:state.providerId,jobs:state.jobs,executors:Object.fromEntries(Object.entries(state.executors).map(([id,e])=>[id,{pairedAt:e.pairedAt,connected:[...sockets.values()].includes(id),capabilities:e.capabilities}]))};break;
          default:fail('E_ROUTE');
        }
        const drop=!!state.faults[path];if(drop)state.faults[path]--;await save();return {out,drop};
      });
      if(path==='/admin/seed'||path==='/admin/cancel')notify();if(answer.drop){req.socket.destroy();return;}res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(answer.out));
    }catch(e){res.writeHead(e.code==='E_AUTH'?401:e.code==='E_REQUEST_CONFLICT'?409:400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:e.code||'E_SCHEMA',message:e.message}}));}
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:8192});
  server.on('upgrade',(req,socket,head)=>{if(req.url!=='/v1/events'||req.headers.origin&&!req.headers.origin.startsWith('chrome-extension://')){socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));});
  wss.on('connection',ws=>{
    const timeout=setTimeout(()=>ws.close(),5000);let authenticated=false;
    ws.on('message',data=>{try{const m=JSON.parse(String(data));if(!authenticated){exact(m,['type','ticket']);const t=tickets.get(m.ticket);tickets.delete(m.ticket);if(m.type!=='authenticate'||!t||t.until<=clock())fail('E_AUTH');authenticated=true;clearTimeout(timeout);sockets.set(ws,t.executorId);ws.send(JSON.stringify({type:'authenticated',providerId:state.providerId}));}else if(m.type==='ping')ws.send(JSON.stringify({type:'pong'}));else fail('E_SCHEMA');}catch{ws.close();}});
    ws.on('close',()=>{clearTimeout(timeout);sockets.delete(ws);});
  });
  try{await new Promise((ok,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',ok);});}catch(e){await handle.close();await unlink(lock);throw e;}
  return {port:server.address().port,directory,credentialFile,providerId:state.providerId,close:async()=>{for(const ws of wss.clients)ws.terminate();await new Promise(r=>server.close(r));await tail;await handle.close();await unlink(lock);}};
}
