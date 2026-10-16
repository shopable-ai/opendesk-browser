// Private MessagePort capability protocol. No window message or origin trust.
export const XMIND_FRAME_PROTOCOL='opendesk.xmind-frame.test.v1';
export const XMIND_FRAME_COMMANDS=Object.freeze(
  ['init','fit','reflow','setTheme','zoomBy','toggleAll','destroy']);
export const frameError=(code,message=code)=>Object.assign(new Error(message),{code});

export function bindFrameIdentity(identity){
  if(!identity||typeof identity.sessionId!=='string'||!identity.sessionId||
    typeof identity.instanceId!=='string'||!identity.instanceId||
    !Number.isSafeInteger(identity.revision)||identity.revision<0){
    throw frameError('E_XMIND_FRAME_IDENTITY');
  }
  return Object.freeze({sessionId:identity.sessionId,instanceId:identity.instanceId,
    revision:identity.revision});
}

export function matchesFrameIdentity(data,identity){
  return data?.protocol===XMIND_FRAME_PROTOCOL&&data.sessionId===identity.sessionId&&
    data.instanceId===identity.instanceId&&data.revision===identity.revision;
}

export function requireFramePort(port){
  if(!port||!['postMessage','addEventListener','removeEventListener','start','close']
    .every(key=>typeof port[key]==='function'))throw frameError('E_XMIND_FRAME_PORT');
  return port;
}

export function frameEnvelope(identity,fields){
  return {protocol:XMIND_FRAME_PROTOCOL,...identity,...fields};
}
