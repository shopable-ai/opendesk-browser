import {MessageChannel, Worker} from 'node:worker_threads';
import {relayContextRequest} from '../../src/framework/context.js';
import {createResultAssembler} from '../../src/framework/control/result-transfer.js';

// Use the real Worker entrypoint and RunHost protocol. This adapter substitutes
// Node for Chrome's opaque iframe/Worker and is never included in the extension.
export function createOfflineController({context, networkAttempts}) {
  const {identity, revision, target, signal}=context;
  const {runId,ownerEpoch}=identity, pin={runId,ownerEpoch};
  const {port1,port2}=new MessageChannel();
  const worker=new Worker(`
    const {parentPort,workerData}=require('node:worker_threads'),listeners=new Map();
    const rejectNetwork=()=>{parentPort.postMessage({kind:'network-attempt'});throw Error('Offline component fixture');};
    Object.assign(globalThis,{location:{href:'blob:null/offline-component'},name:'offline-component',origin:'null',
      fetch:rejectNetwork,WebSocket:rejectNetwork,XMLHttpRequest:rejectNetwork,EventSource:rejectNetwork,
      addEventListener(type,fn){listeners.set(type,fn);},
      removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type);},
      postMessage(data){parentPort.postMessage(data);}});
    parentPort.on('message',event=>listeners.get('message')?.({data:event.data,ports:[event.port]}));
    import(workerData.support).then(({primeNodeWorkerBuiltinLibraries})=>{
      primeNodeWorkerBuiltinLibraries();return import(workerData.runtime);
    }).then(({installControlWorker})=>installControlWorker(globalThis));
  `,{eval:true,workerData:{support:new URL('./controller-worker-support.mjs',import.meta.url).href,
    runtime:new URL('../../src/scripting/sandbox/worker-runtime.js',import.meta.url).href}});
  const assembler=createResultAssembler();
  let terminal, clean, started=false, settled=false, request;
  const result=new Promise(resolve=>{terminal=resolve;});
  const retired=new Promise(resolve=>{clean=resolve;});
  const stop=()=>finish({status:'stopped'});
  // The real task makes dozens of sequential page calls over this Node relay.
  const timer=setTimeout(()=>finish({status:'error',error:{code:'E_FIXTURE_TIMEOUT',message:'Node Worker did not settle'}}),13000);
  function finish(value){
    if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',stop);
    port1.close();void worker.terminate().then(()=>clean({acknowledged:true}),()=>clean({acknowledged:false}));
    terminal(value);
  }
  worker.on('error',error=>finish({status:'error',error:{code:'E_FIXTURE_WORKER',message:error.message}}));
  worker.on('message',data=>{
    if(data.kind==='network-attempt'){networkAttempts.push(data.kind);return;}
    if(data.kind==='worker-ready'&&!settled)worker.postMessage({data:{kind:'bind',identity,revision,target},port:port2},[port2]);
  });
  port1.on('message',async data=>{
    if(settled||data.runId!==runId||data.ownerEpoch!==ownerEpoch)return;
    try{
      if(data.kind==='bound'){started=true;if(request)port1.postMessage(request);return;}
      if(data.kind==='operation'){
        const reply=await relayContextRequest(context,data.envelope);
        if(!settled)port1.postMessage({kind:'reply',...pin,id:data.id,reply});
        return;
      }
      if(data.kind==='error'){finish({status:'error',error:data.error});return;}
      const completed=assembler.accept(data);
      if(completed)finish({status:'succeeded',value:completed.wire});
    }catch(error){finish({status:'error',error:{code:error.code||'E_FIXTURE_WORKER',message:error.message}});}
  });
  signal.addEventListener('abort',stop,{once:true});
  if(signal.aborted)stop();
  return {execute(body,params){
    if(request)throw Error('Already executed');
    request={kind:'execute',...pin,body,params};if(started&&!settled)port1.postMessage(request);return result;
  },result,retired,resourceReleased:retired,stop,close:stop};
}
