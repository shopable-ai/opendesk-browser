// Browser opens the authorized standard test entry as a real visible tab.
import {readFile,writeFile} from 'node:fs/promises';import {connect} from '../../../../tests/framework/sidebar-native-session.mjs';
const [sessionPath,out]=process.argv.slice(2),s=JSON.parse(await readFile(sessionPath)),c=await connect(s.endpoint);
try{const t=await c.send('Target.createTarget',{url:'http://127.0.0.1:43111/demo-form.html'});await c.send('Target.activateTarget',{targetId:t.targetId});await writeFile(out,JSON.stringify({at:new Date().toISOString(),target:t,url:'http://127.0.0.1:43111/demo-form.html',browserOperation:'Target.createTarget + activateTarget; no DOM assignment'},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(t));}finally{c.close();}
