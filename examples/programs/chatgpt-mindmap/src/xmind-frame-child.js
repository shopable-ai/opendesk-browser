import {createXmindRenderer} from './xmind-adapter.js';
import {bindFrameIdentity,matchesFrameIdentity,requireFramePort,frameEnvelope,frameError,
  XMIND_FRAME_COMMANDS} from './xmind-frame-protocol.js';

// Called by an explicit fixed test bootstrap *inside* the child, never by a
// window message listener. Only the original XMind renderer lives here.
export function serveXmindFrame({port,identity,window,canvas,
  rendererFactory=createXmindRenderer}){
  requireFramePort(port);
  const binding=bindFrameIdentity(identity);
  let renderer=null,disposed=false,closing=null,initialized=false,lastId=0;
  let operations=Promise.resolve();
  const broken=()=>{destroy().catch(()=>{});};
  function reply(data,ok,value,error){
    if(disposed&&data.command!=='destroy')return;
    port.postMessage(frameEnvelope(binding,{kind:'reply',id:data.id,command:data.command,
      ok,value,nodeCount:renderer?.nodeCount||0,...(error?{error:{code:error.code||'E_XMIND_RENDER'}}:{})}));
  }
  function validate(data){
    if(data.command==='setTheme'&&!['light','dark'].includes(data.args))
      throw frameError('E_XMIND_THEME');
    if(data.command==='zoomBy'&&(!Number.isFinite(data.args)||data.args<=0))
      throw frameError('E_XMIND_ZOOM');
    if(data.command==='init'&&(!data.args?.tree||
      !['light','dark'].includes(data.args.skinMode)))throw frameError('E_XMIND_FRAME_INIT');
    if(data.command==='fit'&&data.args!==undefined&&
      (!data.args||typeof data.args!=='object'||Object.keys(data.args).some(key=>
        key!=='resetManual')||('resetManual' in data.args&&typeof data.args.resetManual!=='boolean')))
      throw frameError('E_XMIND_FRAME_ARGS');
  }
  async function execute(data){
    validate(data);
    if(data.command==='init'){
      if(initialized)throw frameError('E_XMIND_FRAME_INIT');
      initialized=true;
      renderer=rendererFactory({window,canvas,tree:data.args.tree,skinMode:data.args.skinMode});
      await renderer.ready;
      if(disposed)return;
      return;
    }
    if(!initialized||!renderer)throw frameError('E_XMIND_FRAME_NOT_READY');
    await renderer.ready;
    if(disposed)return;
    return renderer[data.command](data.args);
  }
  function receive(event){
    if(disposed||event.currentTarget!==port)return;
    const data=event.data;
    if(!matchesFrameIdentity(data,binding)||data.kind!=='request'||
      !Number.isSafeInteger(data.id)||data.id<=lastId||
      !XMIND_FRAME_COMMANDS.includes(data.command))return;
    lastId=data.id;
    if(data.command==='destroy'){
      destroy(false).then(()=>{try{reply(data,true);}finally{port.close();}},
        error=>{try{reply(data,false,undefined,error);}finally{port.close();}});
      return;
    }
    const operation=operations.then(()=>disposed?undefined:execute(data));
    operations=operation.then(value=>reply(data,true,value),error=>reply(data,false,undefined,error));
    operations.catch(()=>{});
  }
  function destroy(closePort=true){
    if(closing)return closing;
    disposed=true;
    port.removeEventListener('message',receive);port.removeEventListener('messageerror',broken);
    // createXmindRenderer owns delayed initialization/SDK close. Do not wait
    // for the command queue before asking it to retire an in-flight mount.
    closing=(async()=>{
      try{await renderer?.destroy();await operations;}
      finally{if(closePort)port.close();}
    })();
    return closing;
  }
  port.addEventListener('message',receive);port.addEventListener('messageerror',broken);port.start();
  return Object.freeze({destroy});
}
