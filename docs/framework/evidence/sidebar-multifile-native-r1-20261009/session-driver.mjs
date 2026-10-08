import {launchChrome} from '../../../../tests/framework/k5-sdk-native-launcher.mjs';
import {connect} from '../../../../tests/framework/sidebar-native-session.mjs';
import {packageFingerprint} from '../../../../scripts/verify-package.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import path from 'node:path';
const directory=path.resolve('docs/framework/evidence/sidebar-multifile-native-r1-20261009/current-main/native');
const extension=path.resolve('dist/development');
const binary='/private/tmp/opendesk-sidebar-multifile-r1/instance3/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const launched=await launchChrome({root:process.cwd(),binary,extension,headed:true,directory,label:'program-r3',sameProfileRestart:true});
let session;
async function bind(){const c=await connect(launched.endpoint);try{const targets=(await c.send('Target.getTargets')).targetInfos;const sw=targets.find(t=>t.type==='service_worker'&&t.url.endsWith('/sw.js'));session={...launched.metadata,driverPid:process.pid,extension,extensionId:sw?.url.split('/')[2],version:await c.send('Browser.getVersion'),package:await packageFingerprint(extension)};await writeFile(path.join(directory,'session.json'),JSON.stringify(session,null,2)+'\n');console.log(JSON.stringify({session:path.join(directory,'session.json'),pid:session.pid,extensionId:session.extensionId}));}finally{c.close();}}
await bind();
const c=await connect(launched.endpoint);const target=await c.send('Target.createTarget',{url:'http://127.0.0.1:43111/demo-form.html'});await c.send('Target.activateTarget',{targetId:target.targetId});c.close();
let stopping=false;async function stop(){if(stopping)return;stopping=true;await launched.copyLog();await writeFile(path.join(directory,'cleanup.json'),JSON.stringify(await launched.stop(),null,2)+'\n');process.exit(0);}process.on('SIGTERM',stop);process.on('SIGINT',stop);
createInterface({input:process.stdin}).on('line',async line=>{try{if(line==='restart'){const c=await connect(launched.endpoint);const next=launched.restart();await new Promise(r=>setTimeout(r,250));const closing=c.send('Browser.close').catch(()=>{});await next;await closing;c.close();await bind();}if(line==='stop')await stop();}catch(e){console.error(e);}});
