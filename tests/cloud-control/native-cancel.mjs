// Readonly Chrome observation; cancellation uses the separately authenticated provider API.
import {readFile,writeFile} from 'node:fs/promises';
import {connect,evaluate} from '../framework/sidebar-native-session.mjs';
const endpoint=process.env.OPENDESK_CLOUD_ENDPOINT;
if(!endpoint)throw Error('Explicit owned CFT endpoint required');
const {adminToken}=JSON.parse(await readFile('.local/cloud-control/admin.json','utf8'));
async function admin(path,body){const response=await fetch('http://127.0.0.1:43112/admin/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+adminToken},body:JSON.stringify(body)});if(!response.ok)throw Error('Admin '+response.status);return response.json();}
const client=await connect(endpoint),observations=[];
try{
 const target=(await client.send('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.endsWith('/sw.js'));
 if(!target)throw Error('Existing owned extension SW required');
 const {sessionId}=await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
 const seed=await admin('seed',{requestKey:'cloud-r1-native-running-cancel-'+Date.now(),params:{name:'Cancellation'},target:{mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'}});
 let cancellation=null;
 const start=Date.now();
 while(Date.now()-start<45000){
  const runs=await evaluate(client,`new Promise((yes,no)=>{const q=indexedDB.open('opendesk-browser');q.onupgradeneeded=()=>{q.transaction.abort();no(Error('Existing database required'))};q.onerror=()=>no(q.error);q.onsuccess=()=>{const db=q.result,tx=db.transaction('runs','readonly'),r=tx.objectStore('runs').getAll();let rows;r.onsuccess=()=>rows=r.result;tx.oncomplete=()=>{db.close();yes(rows.filter(r=>r.cloudRequestId).map(r=>({runId:r.runId,state:r.state,requestId:r.cloudRequestId,retirementState:r.retirementState,target:!!r.target})))}}})`,sessionId);
  const server=await admin('state',{}),job=server.jobs[seed.jobId],run=runs.find(r=>r.runId===job.runRef?.runId);
  if(run){observations.push({at:Date.now(),run});if(!cancellation&&run.state==='running'){cancellation={at:Date.now(),run,reply:await admin('cancel',{jobId:seed.jobId})};}
   if(cancellation&&run.retirementState==='released')break;
  }
  await new Promise(r=>setTimeout(r,30));
 }
 const result={seed,cancellation,observations,server:await admin('state',{})};
 // Avoid retaining executor credentials in evidence.
 for(const executor of Object.values(result.server.executors))delete executor.credential;
 const path='docs/framework/workstreams/evidence/cloud-control-r1/native-running-cancel-'+Date.now()+'.json';
 await writeFile(path,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({path,jobId:seed.jobId,cancelledWhileRunning:!!cancellation,final:observations.at(-1)}));
 if(!cancellation)process.exitCode=1;
}finally{client.close();}
