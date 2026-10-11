// Observe an original native effect, then press Chrome's real extension switch.
import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {connect,evaluate} from '../framework/sidebar-native-session.mjs';
const pid=process.argv[2],endpoint=process.env.OPENDESK_CLOUD_ENDPOINT;
if(!/^\d+$/.test(pid||'')||!endpoint)throw Error('Explicit owned CFT PID and endpoint required');
const {adminToken}=JSON.parse(await readFile('.local/cloud-control/admin.json','utf8'));
async function admin(path,body){const r=await fetch('http://127.0.0.1:43112/admin/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+adminToken},body:JSON.stringify(body)});if(!r.ok)throw Error('Admin '+r.status);return r.json();}
const input=spawn('.runtime/cloud-control-r1/native-input',[pid,'arm','开启，扩展程序已启用','AXCheckBox'],{stdio:['pipe','pipe','pipe']});
let nativeOutput='';input.stdout.on('data',d=>nativeOutput+=d);input.stderr.on('data',d=>nativeOutput+=d);const exited=once(input,'exit');
const client=await connect(endpoint);
try{
 const started=Date.now();while(!nativeOutput.includes('OWNED_AX_ARMED')){if(input.exitCode!==null||Date.now()-started>10000)throw Error('Native switch arming failed: '+nativeOutput);await new Promise(r=>setTimeout(r,10));}
 const t=(await client.send('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.endsWith('/sw.js'));if(!t)throw Error('Existing SW required');
 const {sessionId}=await client.send('Target.attachToTarget',{targetId:t.targetId,flatten:true});
 const seed=await admin('seed',{requestKey:'cloud-r1-native-unknown-'+Date.now(),params:{name:'Interrupted'},target:{mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'}});
 let before=null;
 while(Date.now()-started<45000){
  const state=await admin('state',{}),id=state.jobs[seed.jobId].runRef?.runId;
  if(id){const snapshot=await evaluate(client,`new Promise((yes,no)=>{const q=indexedDB.open('opendesk-browser');q.onupgradeneeded=()=>{q.transaction.abort();no(Error('Existing database required'))};q.onerror=()=>no(q.error);q.onsuccess=()=>{const db=q.result,tx=db.transaction(['runs','commandJournal'],'readonly'),a=tx.objectStore('runs').get(${JSON.stringify(id)}),b=tx.objectStore('commandJournal').getAll();let run,journal;a.onsuccess=()=>run=a.result;b.onsuccess=()=>journal=b.result;tx.oncomplete=()=>{db.close();yes({run,journal:journal.filter(j=>j.runId===${JSON.stringify(id)}&&j.tag==='controller-operation'&&j.state==='durable')})}}})`,sessionId);
   if(snapshot.run?.state==='running'&&snapshot.journal.some(j=>j.nativeReceipts?.length&&j.valueWire?.value==='Typed')){before={at:Date.now(),...snapshot};input.stdin.end('press\n');break;}
   if(['completed','stopped','failed'].includes(snapshot.run?.state))throw Error('Completed before interruption');
  }
  await new Promise(r=>setTimeout(r,5));
 }
 if(!before)throw Error('No durable typed effect observed while running');
 const [code]=await exited;if(code!==0)throw Error('Native switch failed: '+nativeOutput);
 const result={seed,before,nativeOutput,interruptedAt:Date.now()};
 const path='docs/framework/workstreams/evidence/cloud-control-r1/native-effect-interrupt-'+Date.now()+'.json';await writeFile(path,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({path,jobId:seed.jobId,runId:before.run.runId,stateAtInterruption:before.run.state,nativeReceipts:before.journal.reduce((n,j)=>n+j.nativeReceipts.length,0)}));
}finally{client.close();if(input.exitCode===null)input.stdin.end();}
