export const XMIND_FRAME_RESOURCE_ID='xmind-runtime';
const error=code=>Object.assign(new Error(code),{code});

// The platform owns bytes, authority, child identity and retirement. Business
// code receives a private port and moves the live frame without navigating it.
export function createInstalledXmindFrameFactory(owner){
  if(typeof owner?.createFrame!=='function')throw error('E_XMIND_RUNTIME_UNAVAILABLE');
  return async({canvas,signal,identity})=>{
    if(signal?.aborted)throw error('E_XMIND_FRAME_DESTROYED');
    if(typeof canvas?.moveBefore!=='function')throw error('E_XMIND_FRAME_MOVE_UNAVAILABLE');
    const child=await owner.createFrame({resourceId:XMIND_FRAME_RESOURCE_ID,data:{identity}});
    try{
      if(signal?.aborted)throw error('E_XMIND_FRAME_DESTROYED');
      canvas.moveBefore(child.frame,null);
      child.frame.title='XMind 思维导图';
      child.frame.style.cssText='display:block;width:100%;height:100%;border:0;background:transparent';
      return {port:child.port,destroy:child.destroy};
    }catch(failure){await child.destroy();throw failure;}
  };
}
