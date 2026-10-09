// Native Chrome Cmd-R; prove a different committed document at the same URL.
import {readFile,writeFile} from 'node:fs/promises';import {promisify} from 'node:util';import {execFile} from 'node:child_process';import {connect} from '../../../../tests/framework/sidebar-native-session.mjs';
const [sessionPath,targetId,out]=process.argv.slice(2),s=JSON.parse(await readFile(sessionPath)),c=await connect(s.endpoint),run=promisify(execFile),b='/private/tmp/opendesk-sidebar-r3-01a11fba/native-control';
try{const {sessionId}=await c.send('Target.attachToTarget',{targetId,flatten:true}),before=(await c.send('Page.getFrameTree',{},sessionId)).frameTree.frame;
 if(!before.url.startsWith('http://127.0.0.1:43111/demo-form.html'))throw Error('Authorized standard page required');await c.send('Target.activateTarget',{targetId});await run(b,[String(s.pid),'activate']);await run(b,[String(s.pid),'key','15','cmd']);let after;
 for(let i=0;i<60;i++){after=(await c.send('Page.getFrameTree',{},sessionId)).frameTree.frame;if(after.loaderId!==before.loaderId&&after.url===before.url)break;await new Promise(r=>setTimeout(r,50));}
 const committed=after.loaderId!==before.loaderId&&after.url===before.url;await writeFile(out,JSON.stringify({at:new Date().toISOString(),pid:s.pid,targetId,before,after,committed,method:'Native Chrome Cmd-R'},null,2)+'\n',{flag:'wx'});if(!committed)throw Error('Real same-URL reload did not commit');console.log(JSON.stringify({committed,url:after.url}));
}finally{c.close();}
