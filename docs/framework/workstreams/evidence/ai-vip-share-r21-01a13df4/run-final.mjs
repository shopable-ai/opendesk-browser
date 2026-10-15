import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const evidence=path.resolve('docs/framework/workstreams/evidence/ai-vip-share-r21-01a13df4');
const cwd=path.resolve('.runtime/ai-vip-share-r21-01a13df4/candidate-r2');
const variables={OPENDESK_OUTPUT_GUARD_PORT:'43237',OPENDESK_BUILD_EVIDENCE_DIR:path.join(evidence,'build-final'),
  CHROME_FOR_TESTING_BIN:path.resolve('tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
  OPENDESK_NATIVE_AGENT_HEADLESS:'1'};
const report={startedAt:new Date().toISOString(),root,cwd,variables,commands:[]};
for(const [label,args] of [['check',['run','check']],['production',['run','build']],['development',['run','build:dev']],['verify',['run','verify']],['test',['test']],['pack',['run','pack']]]){
  const log=path.join(evidence,'final-'+label+'.log'),stream=createWriteStream(log);
  const command={label,args,startedAt:new Date().toISOString(),log};report.commands.push(command);
  const child=spawn('npm',args,{cwd,env:{...process.env,...variables},stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});
  command.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});
  await new Promise(resolve=>stream.end(resolve));command.finishedAt=new Date().toISOString();
  await writeFile(path.join(evidence,'final-validation.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(command));
  if(command.exitCode!==0&&label!=='test')break;
}
report.finishedAt=new Date().toISOString();
await writeFile(path.join(evidence,'final-validation.json'),JSON.stringify(report,null,2)+'\n');
