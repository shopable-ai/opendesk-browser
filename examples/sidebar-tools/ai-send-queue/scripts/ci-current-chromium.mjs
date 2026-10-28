// Honest App CI: use real Chrome for current preview geometry, not install or old-revision parity.
import {spawn} from 'node:child_process';
const path=process.argv[2]||'artifacts/app-ci/ai-send-queue/chrome';
const child=spawn(process.execPath,['examples/sidebar-tools/ai-send-queue/scripts/crown-r53-chromium.mjs',
  path,'--current-only'],{stdio:'inherit',env:process.env});
const done=await new Promise((resolve,reject)=>{
  child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));
});
if(done.code!==0)throw Error('Current-only Chromium failed: '+String(done.code??done.signal));
console.log('CURRENT_ONLY_CHROMIUM_PASS; installed Side Panel and real ChatGPT sending NOT_TESTED');
