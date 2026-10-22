import {readFile,writeFile} from 'node:fs/promises';
import {connect,evaluate} from '../../tests/framework/sidebar-native-session.mjs';
const dir='artifacts/bookmark-agent-r211-lifecycle',l=JSON.parse(await readFile(dir+'/launch.json','utf8')),versions=[];
const c=await connect((await readFile(l.log,'utf8')).match(/DevTools listening on (ws:\/\/\S+)/)[1],{onEvent:m=>{if(m.method==='ServiceWorker.workerVersionUpdated')versions.push(...m.params.versions)}}),out={kind:'setup: restart stale optional permission API context, no model request',at:Date.now()};
try{
 const ts=(await c.send('Target.getTargets')).targetInfos,p=ts.find(t=>t.targetId==='812F0553A92C69E8B1E789D813739478'),w=ts.find(t=>t.url.endsWith('/sw.js'));
 const s=(await c.send('Target.attachToTarget',{targetId:p.targetId,flatten:true})).sessionId,ws=(await c.send('Target.attachToTarget',{targetId:w.targetId,flatten:true})).sessionId;
 out.before=await evaluate(c,'(async()=>({connectNative:typeof chrome.runtime.connectNative,granted:await chrome.permissions.contains({permissions:["nativeMessaging"]})}))()',ws);
 await c.send('ServiceWorker.enable',{},s);await new Promise(r=>setTimeout(r,200));const v=versions.findLast(x=>x.scriptURL===w.url&&x.runningStatus==='running');if(!v)throw Error('No owned worker');
 await c.send('ServiceWorker.stopWorker',{versionId:v.versionId},s,{timeoutMs:15000});
 await c.send('Page.reload',{},s);await new Promise(r=>setTimeout(r,2000));
 const now=(await c.send('Target.getTargets')).targetInfos.find(t=>t.url===w.url),ns=(await c.send('Target.attachToTarget',{targetId:now.targetId,flatten:true})).sessionId;
 out.after=await evaluate(c,'(async()=>({connectNative:typeof chrome.runtime.connectNative,granted:await chrome.permissions.contains({permissions:["nativeMessaging"]})}))()',ns);out.versions=versions;out.ui=await evaluate(c,'document.body.innerText.slice(-500)',s);
}catch(e){out.error=String(e)}finally{await writeFile(dir+'/native-worker-restart.json',JSON.stringify(out,null,2)+'\n');c.close();console.log(JSON.stringify(out,null,2))}
