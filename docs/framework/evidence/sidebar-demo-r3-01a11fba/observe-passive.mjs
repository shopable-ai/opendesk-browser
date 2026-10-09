// Passive real sender observation; never responds to or dispatches a product message.
import {readFile,writeFile} from 'node:fs/promises';
import {connect,evaluate} from '../../../../tests/framework/sidebar-native-session.mjs';
const [sessionPath,action,out]=process.argv.slice(2),session=JSON.parse(await readFile(sessionPath)),client=await connect(session.endpoint);
try {
 const targets=(await client.send('Target.getTargets')).targetInfos;
 const sw=targets.find(t=>t.type==='service_worker'&&t.url===`chrome-extension://${session.extensionId}/sw.js`);
 if(!sw)throw Error('Actual SW missing');
 const {sessionId}=await client.send('Target.attachToTarget',{targetId:sw.targetId,flatten:true});
 if(action==='arm')await evaluate(client,`(() => {if(globalThis.__r3Passive)return;globalThis.__r3SenderEvents=[];globalThis.__r3Passive=(message,sender)=>{if(['startControllerRun','previewPageScript'].includes(message?.type))globalThis.__r3SenderEvents.push({at:Date.now(),message,sender});return false;};chrome.runtime.onMessage.addListener(globalThis.__r3Passive);})()`,sessionId);
 const events=await evaluate(client,'globalThis.__r3SenderEvents||[]',sessionId);
 if(action==='stop')await evaluate(client,'chrome.runtime.onMessage.removeListener(globalThis.__r3Passive)',sessionId);
 await writeFile(out,JSON.stringify({at:new Date().toISOString(),sessionPath,packageHash:session.package.packageHash,action,observationOnly:true,events},null,2)+'\n',{flag:'wx'});
}finally{client.close();}
