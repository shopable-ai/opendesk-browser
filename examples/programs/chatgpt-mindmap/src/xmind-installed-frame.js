import {annotateMindmapError,appendMindmapCleanup} from './diagnostics.js';
export const XMIND_FRAME_RESOURCE_ID='xmind-runtime';
const error=code=>Object.assign(new Error(code),{code});

// The platform owns bytes, authority, child identity and retirement. Business
// code receives a private port and moves the live frame without navigating it.
export function createInstalledXmindFrameFactory(owner){
  if(typeof owner?.createFrame!=='function')throw annotateMindmapError(error('E_XMIND_RUNTIME_UNAVAILABLE'),'frame.create');
  return async({canvas,signal,identity})=>{
    if(signal?.aborted)throw annotateMindmapError(error('E_XMIND_FRAME_DESTROYED'),'frame.create');
    if(typeof canvas?.moveBefore!=='function')throw annotateMindmapError(error('E_XMIND_FRAME_MOVE_UNAVAILABLE'),'frame.mount');
    let child;
    try{child=await owner.createFrame({resourceId:XMIND_FRAME_RESOURCE_ID,data:{identity}});}
    catch(failure){throw annotateMindmapError(failure,'frame.create');}
    try{
      if(signal?.aborted)throw error('E_XMIND_FRAME_DESTROYED');
      canvas.moveBefore(child.frame,null);
      child.frame.title='XMind 思维导图';
      child.frame.style.cssText='display:block;width:100%;height:100%;border:0;background:transparent';
      return {port:child.port,destroy:child.destroy};
    }catch(value){
      const failure=annotateMindmapError(value,'frame.mount');
      try{await child.destroy();}catch(cleanup){throw appendMindmapCleanup(failure,cleanup);}
      throw failure;
    }
  };
}
