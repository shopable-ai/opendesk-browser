// Quick Notes's actual installed Chrome fixture. Only this App owns the demo
// server dependency; generic App CI does not contain App names or HTTP fixtures.
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const out=process.argv[2]||'artifacts/app-ci/quick-notes-react/chrome-installed';
const server=spawn('python3',['-m','http.server','43111','--bind','127.0.0.1',
  '--directory','examples/tasks'],{stdio:'ignore'});
async function ready(){
  for(let attempt=0;attempt<70;attempt++){
    if(server.exitCode!==null)throw Error('Quick Notes fixture server exited');
    try{const response=await fetch('http://127.0.0.1:43111/demo-form.html');
      if(response.ok)return;
    }catch{}
    await delay(100);
  }
  throw Error('Quick Notes real HTTP fixture did not start');
}
try{
  await ready();
  const child=spawn(process.execPath,['scripts/tests/quick-notes-react-r21-installed-chrome.mjs',out],
    {stdio:'inherit',env:process.env});
  const result=await new Promise((resolve,reject)=>{
    child.once('error',reject);
    child.once('exit',(code,signal)=>resolve({code,signal}));
  });
  if(result.code!==0)throw Error('Real Chrome installed Quick Notes lifecycle failed: '+String(result.code??result.signal));
}finally{
  if(server.exitCode===null)server.kill('SIGTERM');
}
