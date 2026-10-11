// Real wall-clock 10-minute edit workload, no browser execution or business dispatch.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LocalDevResolver} from '../../native-agent/local-dev/resolver.mjs';
const output=process.argv[2],duration=Number(process.argv[3]||600000);
if(!output||fs.existsSync(output))throw Error('Supply a fresh output file');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'opendesk-r23-soak-'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let resolver;
try{
  fs.cpSync(path.resolve('examples/programs/local-controller'),root,{recursive:true});
  fs.writeFileSync(path.join(root,'src/main.js'),'import {v} from "./value.js"; export default async function(){return v;}');
  const file=path.join(root,'src/value.js');fs.writeFileSync(file,'export const v=0;');
  resolver=new LocalDevResolver({allowedPaths:[root]});const id=resolver.attach({path:root}).bindingId;resolver.preparation.start(id);
  while(resolver.preparation.status(id).state!=='ready')await pause(20);
  const samples=[],cpu=process.cpuUsage(),start=performance.now();let writes=0,lastSample=0;
  while(performance.now()-start<duration){
    writes++;fs.writeFileSync(file,'export const v='+writes+';');await pause(50);
    if(performance.now()-lastSample>5000){lastSample=performance.now();const sample={elapsedMs:performance.now()-start,writes,...resolver.preparation.resources(),state:resolver.preparation.status(id),memory:process.memoryUsage(),cpu:process.cpuUsage(cpu)};samples.push(sample);fs.appendFileSync(output+'.jsonl',JSON.stringify(sample)+'\n');}
  }
  await pause(2200);const result=await resolver.resolve(id),state=resolver.preparation.status(id);resolver.close();
  const resources=resolver.preparation.resources();
  fs.writeFileSync(output,JSON.stringify({level:'NODE_SUSTAINED_REAL_WALL_CLOCK',hardware:{cpu:os.cpus()[0].model,ram:os.totalmem(),node:process.version},durationMs:performance.now()-start,writes,cpu:process.cpuUsage(cpu),sourceRevision:result.inputHash,sourceHash:result.sourceHash,finalFile:result.files.find(x=>x.path==='src/value.js'),state,resources,businessDispatches:0,samples},null,2)+'\n');
  if(resources.watchers||resources.timers||resources.inflight||samples.some(x=>x.active>2||x.queued>8))throw Error('Resources were not bounded/released');
  console.log(JSON.stringify({writes,durationMs:performance.now()-start,state,resources}));
}finally{resolver?.close();fs.rmSync(root,{recursive:true,force:true});}
