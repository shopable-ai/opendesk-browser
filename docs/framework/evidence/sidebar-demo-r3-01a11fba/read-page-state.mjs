// Passive DOM/frame observation only.
import {readFile,writeFile} from 'node:fs/promises';import {connect,evaluate} from '../../../../tests/framework/sidebar-native-session.mjs';
const [sessionPath,targetId,out]=process.argv.slice(2),s=JSON.parse(await readFile(sessionPath)),c=await connect(s.endpoint);
try{const target=(await c.send('Target.getTargets')).targetInfos.find(t=>t.targetId===targetId),{sessionId}=await c.send('Target.attachToTarget',{targetId,flatten:true});
 const observed=await evaluate(c,"(() => ({url:location.href,title:document.title,proofCount:document.querySelectorAll('#opendesk-multifile-page-proof').length,proof:[...document.querySelectorAll('#opendesk-multifile-page-proof')].map(n=>n.textContent),hosts:[...document.querySelectorAll('[data-od-id]')].map(n=>n.dataset.odId),searchCount:document.querySelector('#search-count')?.textContent,sourceSelection:document.querySelector('#program-source-files')?.value}))()",sessionId);
 await writeFile(out,JSON.stringify({at:new Date().toISOString(),target,observed,frameTree:await c.send('Page.getFrameTree',{},sessionId)},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(observed));
}finally{c.close();}
