// Visible controlled CFT. Inputs remain in the real UI; CDP only opens targets,
// records browser/package identity, and closes the owned browser for restart.
import {launchChrome} from '../../../../tests/framework/k5-sdk-native-launcher.mjs';
import {connect} from '../../../../tests/framework/sidebar-native-session.mjs';
import {packageFingerprint} from '../../../../scripts/verify-package.mjs';
import {writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import path from 'node:path';

const directory = path.resolve(process.env.PROGRAM_EVIDENCE_DIR);
const extension = path.resolve(process.env.PROGRAM_EXTENSION);
const binary = process.env.PROGRAM_CHROME_BINARY;
if (!binary || !path.isAbsolute(binary)) throw Error('Absolute controlled CFT binary required');
const launched = await launchChrome({root:process.cwd(),binary,extension,headed:true,directory,label:'program-r3',sameProfileRestart:true});
let stopping = false;
let generation = 0;
async function save(name, value) {
  await writeFile(path.join(directory,name), JSON.stringify(value,null,2)+'\n',{flag:'wx'});
}
async function bind() {
  const client = await connect(launched.endpoint);
  try {
    let worker;
    for (let attempt=0; attempt<40 && !worker; attempt++) {
      worker = (await client.send('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker' && t.url.endsWith('/sw.js'));
      if (!worker) await new Promise(resolve=>setTimeout(resolve,100));
    }
    if (!worker) throw Error('Actual loaded extension service worker not observed');
    const session = {...launched.metadata,at:new Date().toISOString(),driverPid:process.pid,extension,
      extensionId:worker.url.split('/')[2],version:await client.send('Browser.getVersion'),package:await packageFingerprint(extension)};
    await save(`session-generation-${++generation}.json`,session);
    // Current pointer is the only mutable session file; generations are immutable.
    await writeFile(path.join(directory,'session.json'),JSON.stringify(session,null,2)+'\n');
    console.log(JSON.stringify({generation,pid:session.pid,extensionId:session.extensionId,session:path.join(directory,'session.json')}));
  } finally {client.close();}
}
async function stop(exitCode=0) {
  if (stopping) return;
  stopping=true;
  await launched.copyLog();
  const result=await launched.stop();
  await save('cleanup.json',result);
  process.exit(exitCode || (result.cleanupStatus==='PASS' ? 0 : 1));
}
process.on('SIGTERM',()=>stop());
process.on('SIGINT',()=>stop());
try {
  await bind();
  const client=await connect(launched.endpoint);
  try {
    const target=await client.send('Target.createTarget',{url:'http://127.0.0.1:43111/demo-form.html'});
    await client.send('Target.activateTarget',{targetId:target.targetId});
    await save('initial-target.json',target);
  } finally {client.close();}
} catch (error) {
  await save('startup-error.json',{name:error.name,message:error.message});
  await stop(1);
}
// Serialize commands. Close must finish before the launcher waits and restarts;
// no guessed 250ms delay or concurrent restart/stop sequence.
let queue=Promise.resolve();
createInterface({input:process.stdin}).on('line',line=> {
  queue=queue.then(async()=> {
    if (line==='stop') return stop();
    if (line!=='restart') throw Error('Unknown driver command');
    const client=await connect(launched.endpoint);
    try {await client.send('Browser.close');} finally {client.close();}
    await launched.restart();
    await bind();
  }).catch(async error=> {
    await save(`command-error-${Date.now()}.json`,{name:error.name,message:error.message});
    await stop(1);
  });
});
