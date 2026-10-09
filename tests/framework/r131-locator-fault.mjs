// Acceptance-only adapter: withhold a real callback, never forge a native ack.
// Run only against this workflow's owned browser; keep the inspector connected.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {connect,evaluate} from './sidebar-native-session.mjs';
const directory=path.resolve(process.env.R131_EVIDENCE_DIR||'docs/framework/evidence/r131-acceptance-01a121da/native-production');
const session=JSON.parse(await readFile(path.join(directory,'session.json')));
const client=await connect(session.endpoint);
const mode=process.argv[2];
if(!['drop-commit','hold-prepare','off','snapshot','release'].includes(mode))throw Error('Unknown fault mode');
const sw=(await client.send('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.endsWith('/sw.js'));
const id=(await client.send('Target.attachToTarget',{targetId:sw.targetId,flatten:true})).sessionId;
async function capture(label){
  const state=await evaluate(client,'({mode:globalThis.__r131Fault?.mode,events:globalThis.__r131Fault?.events})',id);
  await writeFile(path.join(directory,'fault-'+label+'.json'),JSON.stringify(state,null,2)+'\n');
}
try{
  const state=await evaluate(client,`(()=>{
    const existing=globalThis.__r131Fault;
    if(existing){
      if(${JSON.stringify(mode)}==='release'){existing.release?.();return {released:true};}
      if(${JSON.stringify(mode)}==='snapshot')return {mode:existing.mode,events:existing.events};
      chrome.tabs.sendMessage=existing.original;
      if(${JSON.stringify(mode)}==='off')return {restored:true,mode:existing.mode,events:existing.events};
    }
    const mode=${JSON.stringify(mode)},original=chrome.tabs.sendMessage,events=[];
    globalThis.__r131Fault={mode,original,events};
    chrome.tabs.sendMessage=function(...args){
      const envelope=args[1]?.envelope,method=envelope?.operation?.method,callback=args.at(-1);
      if(typeof callback!=='function'||!['locatorPrepare','locatorCommit'].includes(method))return original.apply(chrome.tabs,args);
      args[args.length-1]=function(response){
        const nativeError=chrome.runtime.lastError?.message;
        const event={at:Date.now(),method,envelope,response,nativeError};events.push(event);
        if(mode==='drop-commit'&&method==='locatorCommit'){event.withheld=true;return;}
        const ready=response?.value?.v?.find(row=>row[0]==='ready')?.[1]?.v;
        if(mode==='hold-prepare'&&method==='locatorPrepare'&&ready){event.withheld=true;globalThis.__r131Fault.release=()=>{event.releasedAt=Date.now();callback(response)};return;}
        callback(response);
      };
      return original.apply(chrome.tabs,args);
    };
    return {installed:true,mode};
  })()`,id);
  await writeFile(path.join(directory,'fault-'+mode+'-armed.json'),JSON.stringify(state,null,2)+'\n');
  console.log(JSON.stringify({mode,installed:state.installed,restored:state.restored,events:state.events?.length}));
  if(['drop-commit','hold-prepare'].includes(mode)){
    let closing=false;
    async function stop(){if(closing)return;closing=true;try{await capture(mode);}finally{client.close();process.exit();}}
    process.on('SIGTERM',stop);process.on('SIGINT',stop);
    await new Promise(()=>{});
  }
}finally{client.close();}
