// Native address-bar input with actual URL and committed loader verification.
import {readFile,writeFile} from 'node:fs/promises';import {promisify} from 'node:util';import {execFile} from 'node:child_process';
import {connect} from '../../../../tests/framework/sidebar-native-session.mjs';
const [sessionPath,url,out]=process.argv.slice(2),s=JSON.parse(await readFile(sessionPath)),run=promisify(execFile),b='/private/tmp/opendesk-sidebar-r3-01a11fba/native-control',events=[],c=await connect(s.endpoint);
if(!['http://127.0.0.1:43111/demo-form.html','http://127.0.0.1:43111/'].includes(url))throw Error('Only authorized fixture and negative path');
let observation;
try{const pages=(await c.send('Target.getTargets')).targetInfos.filter(t=>t.type==='page'&&t.url.startsWith('http://127.0.0.1:43111/'));if(pages.length!==1)throw Error('Unique controlled test page required');const targetId=pages[0].targetId,{sessionId}=await c.send('Target.attachToTarget',{targetId,flatten:true});
 const before=(await c.send('Page.getFrameTree',{},sessionId)).frameTree.frame;await c.send('Target.activateTarget',{targetId});
 for(const args of [['activate'],['key','37','cmd'],['key','0','cmd'],['text-keys',url]]){const r=await run(b,[String(s.pid),...args]);events.push({args,output:r.stdout});}
 const typed=JSON.parse((await run(b,[String(s.pid),'snapshot'])).stdout),address=typed.nodes.find(n=>n.role==='AXTextField'&&n.description==='地址和搜索栏');
 if(address?.value!==url)throw Error('Native address-bar value differs: '+address?.value);
 const r=await run(b,[String(s.pid),'key','36']);events.push({args:['key','36'],output:r.stdout});
 let after;
 for(let i=0;i<60;i++){after=(await c.send('Page.getFrameTree',{},sessionId)).frameTree.frame;if(after.url===url&&after.loaderId!==before.loaderId)break;await new Promise(r=>setTimeout(r,50));}
 observation={targetId,before,typedAddress:address,after,committed:after.url===url&&after.loaderId!==before.loaderId};
 if(!observation.committed)throw Error('Native navigation did not commit the requested document');
}catch(e){observation={...observation,error:String(e)};throw e;}finally{await writeFile(out,JSON.stringify({at:new Date().toISOString(),pid:s.pid,url,events,observation,nativeAddressBar:true},null,2)+'\n',{flag:'wx'});c.close();}
console.log(JSON.stringify({pid:s.pid,url,committed:observation.committed}));
