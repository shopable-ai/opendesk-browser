// Node preparation timings only. Browser/Native timings require separate real evidence.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {LocalDevResolver} from '../../native-agent/local-dev/resolver.mjs';

const output=process.argv[2];
if(!output||fs.existsSync(output))throw Error('Supply a fresh output JSON path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'opendesk-r23-perf-'));
const rows=[],cpu=process.cpuUsage(),start=performance.now();
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
try{
  const examples=['local-controller','local-page-ui','page-npm-lodash'];
  for(const name of examples)fs.cpSync(path.resolve('examples/programs',name),path.join(temp,name),{recursive:true,filter:file=>!file.split(path.sep).includes('node_modules')});
  // Fixed, reviewed fixture dependencies; no lifecycle scripts, no new repo dependency.
  execFileSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:path.join(temp,'page-npm-lodash'),stdio:'pipe'});
  const single=path.join(temp,'single.js');fs.writeFileSync(single,'return {value:23};');
  for(const [name,count] of [['two-controller',2],['multi-controller',12]]){
    const root=path.join(temp,name);fs.cpSync(path.join(temp,'local-controller'),root,{recursive:true});
    let code='';for(let i=1;i<count;i++){fs.writeFileSync(path.join(root,'src','v'+i+'.js'),'export const v='+i+';');code+='import {v as v'+i+'} from "./v'+i+'.js";\n';}
    fs.writeFileSync(path.join(root,'src/main.js'),code+'export default async function(){return '+Array.from({length:count-1},(_,i)=>'v'+(i+1)).join('+')+';}');
  }
  for(const name of ['single','two-controller','multi-controller',...examples]){
    const target=name==='single'?single:path.join(temp,name);
    const attach=resolver=>resolver.attach({path:target,...(name==='single'?{runtimeKind:'controller',siteOrigin:'http://127.0.0.1:43111'}:{})}).bindingId;
    for(let i=0;i<4;i++){
      const resolver=new LocalDevResolver({allowedPaths:[target]}),binding=attach(resolver);
      const result=await resolver.resolve(binding);rows.push({name,kind:'cold',...result.timings,cacheHit:result.cacheHit,sourceHash:result.sourceHash,memory:process.memoryUsage()});resolver.close?.();
    }
    const resolver=new LocalDevResolver({allowedPaths:[target]}),binding=attach(resolver);await resolver.resolve(binding);
    for(let i=0;i<12;i++){
      const result=await resolver.resolve(binding);rows.push({name,kind:'prepared-hit',...result.timings,cacheHit:result.cacheHit,sourceHash:result.sourceHash,memory:process.memoryUsage()});
    }
    const edit=name==='single'?single:path.join(target,'src/main.js');
    for(let i=0;i<4;i++){
      fs.appendFileSync(edit,'\n// measured edit '+i+'\n');
      const result=await resolver.resolve(binding);rows.push({name,kind:'changed',...result.timings,cacheHit:result.cacheHit,sourceHash:result.sourceHash,memory:process.memoryUsage()});
    }
    resolver.close?.();
  }
  const groups=[...new Set(rows.map(row=>row.name+':'+row.kind))].map(key=>{
    const group=rows.filter(row=>row.name+':'+row.kind===key);
    return {key,samples:group.length,p50:percentile(group.map(x=>x.totalMs),.5),p95:percentile(group.map(x=>x.totalMs),.95),buildCount:group.reduce((n,x)=>n+x.buildCount,0),cacheHitRate:group.filter(x=>x.cacheHit).length/group.length,moduleCount:group.at(-1).moduleCount,maxRss:Math.max(...group.map(x=>x.memory.rss))};
  });
  fs.writeFileSync(output,JSON.stringify({level:'NODE_PREPARATION_ONLY',date:new Date().toISOString(),hardware:{platform:process.platform,arch:process.arch,cpu:os.cpus()[0].model,cpus:os.cpus().length,ram:os.totalmem(),node:process.version},configuration:'existing production memory builder; exact fixture npm ci --ignore-scripts',wallMs:performance.now()-start,cpu:process.cpuUsage(cpu),groups,rows},null,2)+'\n');
  console.log(JSON.stringify(groups));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
