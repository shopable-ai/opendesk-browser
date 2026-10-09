// Record trusted inputs; does not import, run, save, authorize or synthesize events.
import {readFile,writeFile} from 'node:fs/promises';
import {connect,evaluate} from '../../../../tests/framework/sidebar-native-session.mjs';
const [sessionPath,outputPath]=process.argv.slice(2);
const session=JSON.parse(await readFile(sessionPath,'utf8'));
const client=await connect(session.endpoint);
try {
  const targets=(await client.send('Target.getTargets')).targetInfos;
  const armed=[];
  for(const target of targets.filter(t=>['page','other'].includes(t.type)&&t.url.startsWith('chrome-extension://'+session.extensionId+'/ui/tool.html'))){
    const {sessionId}=await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
    await evaluate(client,`(() => {
      if(globalThis.__programInputs)return;
      globalThis.__programInputs=[];
      for(const type of ['click','input','change','keydown'])document.addEventListener(type,event=>{
        globalThis.__programInputs.push({at:Date.now(),type,id:event.target.id,isTrusted:event.isTrusted,key:event.key,
          sourceUtf8:document.querySelector('#script-source')?.value,
          executionSourceUtf8:document.querySelector('#program-generated-source')?.textContent||document.querySelector('#script-source')?.value,
          params:document.querySelector('#script-params')?.value,
          files:[...(event.target.files||[])].map(file=>({name:file.name,size:file.size,type:file.type}))});
      },true);
    })()`,sessionId);
    armed.push({targetId:target.targetId,url:target.url});
  }
  await writeFile(outputPath,JSON.stringify({at:new Date().toISOString(),armed,observationOnly:true},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({armed:armed.length}));
}finally{client.close();}
