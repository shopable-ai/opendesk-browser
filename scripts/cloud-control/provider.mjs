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
const exact=(v,keys,optional=[])=>{if(!v||typeof v!=='object'||Array.isArray(v)||keys.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>!keys.includes(k)&&!optional.includes(k)))fail('E_SCHEMA');};
const nonempty=v=>typeof v==='string'&&v.trim().length>0;
const secureEqual=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const bindingKeys=['providerId','executorId','pairingId','pairingGeneration','attemptEpoch','claimId','jobId','assignmentId'];
const runRefKeys=['runId','resultId','requestId','sourceHash','manifestHash','grantId'];
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
  // Legacy assignments remain bound to this identity even after a later re-pair.
  for(const e of Object.values(state.executors))if(!Object.hasOwn(e,'pairingId')||!Object.hasOwn(e,'pairingGeneration')){
    e.pairingId??=randomUUID();e.pairingGeneration??=1;
    e.legacyPairingId=e.pairingId;e.legacyPairingGeneration=e.pairingGeneration;
  }
  await save();
  const serial=fn=>{const next=tail.then(async()=>{const before=structuredClone(state);try{return await fn();}catch(error){state=before;throw error;}});tail=next.catch(()=>{});return next;};
  function once(scope,key,body,fn){if(!nonempty(key)||key.length>150)fail('E_SCHEMA');const k=scope+':'+key,d=hash(body),old=state.requests[k];if(old){if(old.digest!==d)fail('E_REQUEST_CONFLICT');return structuredClone(old.answer);}const answer=fn();state.requests[k]={digest:d,answer:structuredClone(answer)};return answer;}
  const sockets=new Map(),tickets=new Map();
  const pairing=id=>{const e=state.executors[id];if(!nonempty(e?.pairingId)||!Number.isSafeInteger(e.pairingGeneration)||e.pairingGeneration<1)fail('E_PAIRING');return {providerId:state.providerId,executorId:id,pairingId:e.pairingId,pairingGeneration:e.pairingGeneration};};
  const active=p=>{const e=state.executors[p.executorId];return e&&!e.revocation&&nonempty(e.pairingId)&&Number.isSafeInteger(e.pairingGeneration)&&e.pairingGeneration>0&&p.providerId===state.providerId&&p.pairingId===e.pairingId&&p.pairingGeneration===e.pairingGeneration;};
  const retire=id=>{for(const [t,p]of tickets)if(p.executorId===id)tickets.delete(t);for(const [ws,p]of sockets)if(p.executorId===id){sockets.delete(ws);ws.close(1008,'Pairing retired');}};
  const notify=()=>{for(const [ws,p]of sockets)if(active(p)&&ws.readyState===1)ws.send(JSON.stringify({type:'notify'}));};
  function identity(j){
    const a=j.assignment,e=state.executors[a.executorId],legacy=!Object.hasOwn(a,'pairingId')&&!Object.hasOwn(a,'pairingGeneration');
    if(!nonempty(a.assignmentId)||!nonempty(a.claimId)||!nonempty(j.jobId)||(!legacy&&bindingKeys.some(k=>!Object.hasOwn(a,k)))||(Object.hasOwn(a,'jobId')&&a.jobId!==j.jobId))fail('E_BINDING');
    return {providerId:legacy&&!Object.hasOwn(a,'providerId')?state.providerId:a.providerId,executorId:a.executorId,pairingId:legacy?e?.legacyPairingId:a.pairingId,pairingGeneration:legacy?e?.legacyPairingGeneration:a.pairingGeneration,attemptEpoch:Object.hasOwn(a,'attemptEpoch')?a.attemptEpoch:1,claimId:a.claimId,jobId:j.jobId,assignmentId:a.assignmentId};
  }
  function owned(b,id){
    if(!nonempty(b.assignmentId))fail('E_SCHEMA');
    const j=Object.values(state.jobs).find(j=>j.assignment?.assignmentId===b.assignmentId&&j.assignment.executorId===id);
    if(!j)fail('E_ASSIGNMENT');const bound=identity(j);
    if(!active(bound))fail('E_PAIRING');
    if(bound.attemptEpoch!==1||(Object.hasOwn(j,'attemptEpoch')?j.attemptEpoch:1)!==bound.attemptEpoch)fail('E_ATTEMPT');
    if(!Number.isFinite(j.assignment.leaseUntil))fail('E_LEASE');
    if(b.binding){exact(b.binding,bindingKeys);for(const k of bindingKeys)if(b.binding[k]!==bound[k])fail(k==='attemptEpoch'?'E_ATTEMPT':'E_BINDING');}
    else if(Object.hasOwn(b,'binding'))fail('E_SCHEMA');
    for(const k of bindingKeys)if(Object.hasOwn(b,k)&&b[k]!==bound[k])fail(k==='attemptEpoch'?'E_ATTEMPT':'E_BINDING');
    return j;
  }
  function currentPermit(j){
    if(!j.permit||!nonempty(j.permit.permitId))fail('E_LEASE');const bound=identity(j);
    if((Object.hasOwn(j.assignment,'pairingId')||Object.hasOwn(j.permit,'pairingId')||Object.hasOwn(j.permit,'pairingGeneration'))&&bindingKeys.some(k=>!Object.hasOwn(j.permit,k)))fail('E_BINDING');
    for(const k of bindingKeys)if(Object.hasOwn(j.permit,k)&&j.permit[k]!==bound[k])fail(k==='attemptEpoch'?'E_ATTEMPT':'E_BINDING');
    if(!Number.isFinite(j.permit.leaseUntil))fail('E_LEASE');
    validRunRef(j.permit.runRef,j);if(canonical(j.permit.runRef)!==canonical(j.runRef))fail('E_RUN_REF');
    return {...j.permit,...bound};
  }
  function validRunRef(ref,j){
    exact(ref,runRefKeys);if(runRefKeys.some(k=>!nonempty(ref[k])))fail('E_RUN_REF');
    if(ref.requestId!=='cloud:'+j.assignment.assignmentId)fail('E_RUN_REF');
    if(ref.sourceHash!==j.task.sourceHash||ref.manifestHash!==j.task.manifestHash)fail('E_TASK');
  }
  const liveLease=j=>{if(j.cancelled||!Number.isFinite(j.assignment.leaseUntil)||j.assignment.leaseUntil<=clock())fail('E_LEASE');};
  const server=http.createServer(async(req,res)=>{
    try{
      if(req.method!=='POST')fail('E_METHOD');
      if(req.headers.origin&&!req.headers.origin.startsWith('chrome-extension://'))fail('E_ORIGIN');
      let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>65536)fail('E_LIMIT');}const b=JSON.parse(text||'{}');
      const path=new URL(req.url,'http://127.0.0.1').pathname;
      const admin=path.startsWith('/admin/');
      const answer=await serial(async()=>{
        let out,executorId,afterCommit=()=>{};
        // Validate after entering the queue: an earlier transaction may revoke or rotate.
        if(admin){if(!secureEqual(req.headers.authorization,'Bearer '+credentials.adminToken))fail('E_AUTH');}
        else if(path!=='/v1/pair'){
          executorId=Object.keys(state.executors).find(id=>secureEqual(req.headers.authorization,'Bearer '+state.executors[id].credential));
          if(!executorId)fail('E_AUTH');const revoked=state.executors[executorId].revocation;
          if(revoked&&(path!=='/v1/revoke'||b?.revocationId!==revoked.revocationId))fail('E_AUTH');
        }
        switch(path){
          case '/v1/pair':{
            exact(b,['executorId','pairingCode']);if(!secureEqual(b.pairingCode,credentials.pairingCode)||!/^[-a-f0-9]{36}$/.test(b.executorId))fail('E_AUTH');
            const old=state.executors[b.executorId];if(old&&(!Number.isSafeInteger(old.pairingGeneration)||old.pairingGeneration<1||old.pairingGeneration>=Number.MAX_SAFE_INTEGER))fail('E_PAIRING');
            state.executors[b.executorId]={...old,credential:token(),pairedAt:clock(),pairingId:randomUUID(),pairingGeneration:(old?.pairingGeneration??0)+1};delete state.executors[b.executorId].revocation;
            out={...pairing(b.executorId),credential:state.executors[b.executorId].credential};afterCommit=()=>retire(b.executorId);break;}
          case '/v1/auth':{
            exact(b,[]);const t=token(),p=pairing(executorId),expiresAt=clock()+30000;out={ticket:t,expiresAt,...p};afterCommit=()=>tickets.set(t,{...p,until:expiresAt});break;}
          case '/v1/revoke':{
            exact(b,['revocationId'],['pairingId','pairingGeneration']);if(!nonempty(b.revocationId)||b.revocationId.length>150)fail('E_SCHEMA');
            const e=state.executors[executorId],p=pairing(executorId);for(const k of ['pairingId','pairingGeneration'])if(Object.hasOwn(b,k)&&b[k]!==p[k])fail('E_PAIRING');
            out=e.revocation??{providerId:p.providerId,pairingId:p.pairingId,pairingGeneration:p.pairingGeneration,revocationId:b.revocationId,revoked:true};
            e.revocation=out;afterCommit=()=>retire(executorId);break;}
          case '/v1/capabilities':exact(b,['tasks']);if(!Array.isArray(b.tasks)||b.tasks.length>32)fail('E_SCHEMA');state.executors[executorId].capabilities=b.tasks;out={accepted:true};break;
          case '/v1/claim':{
            exact(b,['claimId','tasks']);if(!Array.isArray(b.tasks)||b.tasks.length>32)fail('E_SCHEMA');for(const t of b.tasks){exact(t,['taskId','manifestHash','sourceHash']);if(Object.values(t).some(v=>!nonempty(v)))fail('E_SCHEMA');}
            const e=state.executors[executorId],legacy=e.pairingId===e.legacyPairingId&&e.pairingGeneration===e.legacyPairingGeneration;
            const scope=legacy&&state.requests[executorId+':claim:'+b.claimId]?executorId+':claim':executorId+':'+e.pairingId+':'+e.pairingGeneration+':claim';
            out=once(scope,b.claimId,b,()=>{
              if(![...sockets.values()].some(p=>p.executorId===executorId&&active(p)))fail('E_CONNECTION');
              const j=Object.values(state.jobs).find(j=>j.state==='queued'&&!j.assignment&&!Object.hasOwn(j,'attemptEpoch')&&!j.cancelled&&b.tasks.some(t=>t.taskId===j.task.taskId&&t.manifestHash===j.task.manifestHash&&t.sourceHash===j.task.sourceHash));
              if(!j)return {assignment:null};j.state='assigned';j.attemptEpoch=1;j.assignment={...pairing(executorId),assignmentId:randomUUID(),attemptEpoch:1,jobId:j.jobId,claimId:b.claimId,leaseUntil:clock()+90000};return {assignment:{...j.assignment,task:j.task,params:j.params,target:j.target}};});
            if(out.assignment){const j=owned(out.assignment,executorId);out.assignment={...out.assignment,...identity(j)};}break;}
          case '/v1/admission':{
            exact(b,['assignmentId','runRef'],[...bindingKeys,'binding']);const j=owned(b,executorId);validRunRef(b.runRef,j);liveLease(j);if(j.permit)currentPermit(j);
            out=once('admission',b.assignmentId,b,()=>{j.runRef=b.runRef;j.state='admitted';j.permit={...identity(j),permitId:randomUUID(),runRef:b.runRef,leaseUntil:j.assignment.leaseUntil};return j.permit;});out={...out,...identity(j)};break;}
          case '/v1/renew':{
            exact(b,['assignmentId','permitId'],[...bindingKeys,'binding']);const j=owned(b,executorId);liveLease(j);const permit=currentPermit(j);
            if(!nonempty(b.permitId)||permit.permitId!==b.permitId||!Number.isFinite(permit.leaseUntil)||permit.leaseUntil<=clock())fail('E_LEASE');
            j.assignment.leaseUntil=clock()+90000;j.permit={...permit,leaseUntil:j.assignment.leaseUntil};out={leaseUntil:j.assignment.leaseUntil};break;}
          case '/v1/cancellation':{
            exact(b,['assignmentId'],[...bindingKeys,'binding']);const j=owned(b,executorId);out={cancelled:Boolean(j.cancelled),leaseUntil:j.assignment.leaseUntil};break;}
          case '/v1/receipt':{
            exact(b,['assignmentId','receiptKey','runRef','result'],[...bindingKeys,'binding']);const j=owned(b,executorId);validRunRef(b.runRef,j);
            if(!j.permit||canonical(j.runRef)!==canonical(b.runRef)||b.receiptKey!==b.runRef.resultId)fail('E_RUN_REF');currentPermit(j);
            out=once('receipt',b.receiptKey,b,()=>{j.receipt={receiptId:randomUUID(),receivedAt:clock(),digest:hash(b),result:b.result};j.state='received';return {receiptId:j.receipt.receiptId,digest:j.receipt.digest};});break;}
          case '/v1/reconcile':exact(b,[]);out={...pairing(executorId),assignments:Object.values(state.jobs).filter(j=>j.assignment?.executorId===executorId&&active(identity(j))).map(j=>{owned({assignmentId:j.assignment.assignmentId},executorId);return {...identity(j),runRef:j.runRef??null,permit:j.permit?currentPermit(j):null,cancelled:!!j.cancelled,leaseUntil:j.assignment.leaseUntil,receipt:j.receipt?{receiptId:j.receipt.receiptId,digest:j.receipt.digest}:null};})};break;
          case '/admin/seed':{
            exact(b,['requestKey','params','target']);const pkg=await verifyTaskPackage(fixedPackage);if(b.target?.mode!=='owned'||new URL(b.target.url).origin!=='http://127.0.0.1:43111'||new URL(b.target.url).pathname!=='/demo-form.html')fail('E_TARGET');
            const params=validateTaskParams(pkg.manifest.paramsSchema,b.params??{});out=once('seed',b.requestKey,b,()=>{const jobId=randomUUID();state.jobs[jobId]={jobId,state:'queued',createdAt:clock(),task:{taskId:pkg.manifest.taskId,version:pkg.manifest.version,manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash},params,target:b.target};return {jobId};});break;}
          case '/admin/cancel':exact(b,['jobId']);if(!state.jobs[b.jobId])fail('E_JOB');state.jobs[b.jobId].cancelled=true;out={cancelled:true};break;
          case '/admin/fault':exact(b,['path','count']);if(!['/v1/admission','/v1/claim','/v1/receipt','/v1/revoke'].includes(b.path)||!Number.isSafeInteger(b.count)||b.count<0||b.count>10)fail('E_SCHEMA');state.faults[b.path]=b.count;out={set:true};break;
          case '/admin/state':exact(b,[]);out={providerId:state.providerId,jobs:state.jobs,executors:Object.fromEntries(Object.entries(state.executors).map(([id,e])=>[id,{...pairing(id),pairedAt:e.pairedAt,revoked:!!e.revocation,connected:[...sockets.values()].some(p=>p.executorId===id&&active(p)),capabilities:e.capabilities}]))};break;
          default:fail('E_ROUTE');
        }
        const drop=!!state.faults[path];if(drop)state.faults[path]--;await save();afterCommit();return {out,drop};
      });
      if(path==='/admin/seed'||path==='/admin/cancel')notify();if(answer.drop){req.socket.destroy();return;}res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(answer.out));
    }catch(e){res.writeHead(e.code==='E_AUTH'?401:e.code==='E_REQUEST_CONFLICT'?409:400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:e.code||'E_SCHEMA',message:e.message}}));}
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:8192});
  server.on('upgrade',(req,socket,head)=>{if(req.url!=='/v1/events'||req.headers.origin&&!req.headers.origin.startsWith('chrome-extension://')){socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));});
  wss.on('connection',ws=>{
    const timeout=setTimeout(()=>ws.close(),5000);let authenticated=false;
    ws.on('message',data=>{void serial(async()=>{
      const m=JSON.parse(String(data));if(ws.readyState!==1)fail('E_CONNECTION');
      if(!authenticated){exact(m,['type','ticket']);const t=tickets.get(m.ticket);tickets.delete(m.ticket);if(m.type!=='authenticate'||!t||!Number.isFinite(t.until)||t.until<=clock()||!active(t))fail('E_AUTH');authenticated=true;clearTimeout(timeout);sockets.set(ws,t);ws.send(JSON.stringify({type:'authenticated',...pairing(t.executorId)}));}
      else {if(!active(sockets.get(ws)??{}))fail('E_AUTH');exact(m,['type']);if(m.type==='ping')ws.send(JSON.stringify({type:'pong'}));else fail('E_SCHEMA');}
    }).catch(()=>ws.close(1008,'Invalid authentication or message'));});
    ws.on('close',()=>{clearTimeout(timeout);sockets.delete(ws);});
  });
  try{await new Promise((ok,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',ok);});}catch(e){await handle.close();await unlink(lock);throw e;}
  return {port:server.address().port,directory,credentialFile,providerId:state.providerId,close:async()=>{for(const ws of wss.clients)ws.terminate();await new Promise(r=>server.close(r));await tail;await handle.close();await unlink(lock);}};
}
