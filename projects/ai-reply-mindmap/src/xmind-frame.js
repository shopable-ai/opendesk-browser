import {MAX_XMIND_BYTES} from './export.js';
import {annotateMindmapError,deserializeMindmapError,appendMindmapCleanup,describeMindmapError} from './diagnostics.js';
import {bindFrameIdentity,matchesFrameIdentity,requireFramePort,frameEnvelope,frameError}
  from './xmind-frame-protocol.js';

export function requireXmindFrameFactory(factory){
  if(typeof factory!=='function')throw frameError('E_XMIND_RUNTIME_UNAVAILABLE',
    'XMind 固定子框架加载器尚未获批准，导图未启用。');
  return factory;
}

// NON-RELEASE integration seam. The caller owns a fixed test frame/bootstrap
// and hands over a private port directly. Never discover a loader on the page.
export function createXmindFrameRenderer({window,canvas,tree,skinMode='dark',identity,
  frameFactory,timeoutMs=10000}){
  try{requireXmindFrameFactory(frameFactory);}catch(error){throw annotateMindmapError(error,'frame.create');}
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw annotateMindmapError(frameError('E_XMIND_FRAME_TIMEOUT'),'frame.create');
  const binding=bindFrameIdentity({...identity,sessionId:window.crypto.randomUUID()});
  const abort=new AbortController(),pending=new Map(),retired=new WeakSet();
  let resource=null,port=null,sequence=0,disposed=false,closing=null,nodeCount=0;
  const destroyed=()=>annotateMindmapError(frameError('E_XMIND_FRAME_DESTROYED'),'frame.destroy');
  function rejectPending(error){
    for(const item of pending.values()){clearTimeout(item.timer);item.reject(error);}
    pending.clear();
  }
  function receive(event){
    // MessagePorts have no window source/origin. Possession of this exact port
    // is the sender capability; a window event cannot satisfy currentTarget.
    if(event.currentTarget!==port)return;
    const data=event.data;
    if(!matchesFrameIdentity(data,binding)||data.kind!=='reply')return;
    const item=pending.get(data.id);
    if(!item||data.command!==item.command||typeof data.ok!=='boolean')return;
    let failure;
    if(data.ok){
      if(data.command==='toggleAll'&&typeof data.value!=='boolean')return;
      if(data.command==='exportPng'&&(!data.value||
        !Number.isSafeInteger(data.value.size)||data.value.size<512||
        data.value.size>30*1024*1024||data.value.type!=='image/png'||
        typeof data.value.arrayBuffer!=='function'))return;
      if(data.command==='exportXmind'&&(!data.value||
        !Number.isSafeInteger(data.value.size)||data.value.size<4||
        data.value.size>MAX_XMIND_BYTES||typeof data.value.arrayBuffer!=='function'))return;
      if(!Number.isSafeInteger(data.nodeCount)||data.nodeCount<0)return;
    }else{
      failure=deserializeMindmapError(data.error);
      if(!failure)return;
      if(failure.mindmapStage==='unknown')failure.mindmapStage=`frame.${item.command}`;
    }
    pending.delete(data.id);clearTimeout(item.timer);
    if(data.ok){nodeCount=data.nodeCount;item.resolve(data.value);}
    else item.reject(failure);
  }
  async function retire(value){
    if(!value||typeof value!=='object'||retired.has(value))return;
    retired.add(value);
    value.port?.removeEventListener?.('message',receive);
    value.port?.removeEventListener?.('messageerror',broken);
    if(value===resource)port=null;
    let failure;
    try{value.port?.close?.();}catch(error){failure=annotateMindmapError(error,'frame.destroy');}
    try{await value.destroy?.();}catch(error){
      if(failure)throw appendMindmapCleanup(failure,error);
      throw annotateMindmapError(error,'frame.destroy');
    }
    if(failure)throw failure;
  }
  function broken(){
    rejectPending(annotateMindmapError(frameError('E_XMIND_FRAME_CHANNEL'),'frame.connect'));
    destroy().catch(()=>{});
  }
  function request(command,args,teardown=false){
    if(disposed&&!teardown)return Promise.reject(destroyed());
    return new Promise((resolve,reject)=>{
      const id=++sequence;
      const timer=setTimeout(()=>{
        pending.delete(id);reject(annotateMindmapError(frameError('E_XMIND_FRAME_TIMEOUT'),`frame.${command}`));
      },timeoutMs);
      pending.set(id,{command,resolve,reject,timer});
      try{port.postMessage(frameEnvelope(binding,{kind:'request',id,command,args}));}
      catch(error){pending.delete(id);clearTimeout(timer);reject(annotateMindmapError(error,`frame.${command}`));}
    });
  }
  let cancelConnect;
  const cancelled=new Promise((_,reject)=>{cancelConnect=reject;});
  const loading=Promise.resolve().then(()=>{
    if(disposed)throw destroyed();
    return frameFactory({canvas,signal:abort.signal,identity:binding});
  }).catch(error=>{
    throw annotateMindmapError(error,'frame.create');
  });
  // If Stop/timeout wins a loader race, its late frame still belongs to us.
  loading.then(value=>{
    if(disposed&&value!==resource)retire(value).catch(error=>{
      // Stop may already have returned while an uncooperative loader was
      // pending. Its later cleanup failure must remain visible to the probe.
      const diagnostic=describeMindmapError(error);
      if(typeof window.reportError==='function')window.reportError(deserializeMindmapError(diagnostic));
      else console.error('E_XMIND_LATE_FRAME_CLEANUP',diagnostic);
    });
  },()=>{});
  const ready=(async()=>{
    let stage='frame.create';
    const timer=setTimeout(()=>cancelConnect(annotateMindmapError(frameError('E_XMIND_FRAME_TIMEOUT'),stage)),timeoutMs);
    try{
      resource=await Promise.race([loading,cancelled]);
      if(disposed)throw destroyed();
      stage='frame.connect';
      if(typeof resource?.destroy!=='function')throw frameError('E_XMIND_FRAME_PORT');
      port=requireFramePort(resource.port);
      port.addEventListener('message',receive);port.addEventListener('messageerror',broken);port.start();
      stage='frame.init';
      await request('init',{tree,skinMode});
    }catch(error){throw annotateMindmapError(error,stage);}
    finally{clearTimeout(timer);}
  })().catch(async error=>{
    if(!closing){
      disposed=true;abort.abort();rejectPending(error);
      try{await retire(resource);}catch(cleanup){throw appendMindmapCleanup(error,cleanup);}
    }
    throw error;
  });
  // Consumers await ready; avoid an unhandled rejection if Stop gets there first.
  ready.catch(()=>{});
  const command=(name,args)=>{
    if(disposed)return Promise.reject(destroyed());
    return ready.then(()=>request(name,args));
  };
  function destroy(){
    if(closing)return closing;
    disposed=true;abort.abort();cancelConnect(destroyed());rejectPending(destroyed());
    closing=(async()=>{
      let failure;
      try{if(port)await request('destroy',undefined,true);}
      catch(error){failure=annotateMindmapError(error,'frame.destroy');}
      rejectPending(destroyed());
      try{await retire(resource);}catch(cleanup){
        if(failure)throw appendMindmapCleanup(failure,cleanup);
        throw annotateMindmapError(cleanup,'frame.destroy');
      }
      if(failure)throw failure;
    })();
    return closing;
  }
  return Object.freeze({ready,destroy,
    fit:options=>command('fit',options),reflow:()=>command('reflow'),
    setTheme:mode=>command('setTheme',mode),zoomBy:factor=>command('zoomBy',factor),
    toggleAll:()=>command('toggleAll'),exportXmind:()=>command('exportXmind'),
    exportPng:()=>command('exportPng'),
    get nodeCount(){return nodeCount;}});
}
