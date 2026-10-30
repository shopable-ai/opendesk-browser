// Private static extension resource. No tool bytes, remote scripts, navigation,
// iframe or retry. Loss of the owning control port aborts the one request.
import {NETWORK_TRANSPORT_PROTOCOL} from './network-transport.js';
export function startNetworkRequest(api=chrome) {
  const token=location.hash.slice(1);
  if(!/^[a-f0-9-]{36}$/.test(token))return;
  const port=api.runtime.connect({name:NETWORK_TRANSPORT_PROTOCOL+':'+token});
  const controller=new AbortController();let used=false;
  const timer=setTimeout(()=>controller.abort(),15000);
  port.onDisconnect.addListener(()=>{controller.abort();clearTimeout(timer);});
  port.onMessage.addListener(message=>{
    if(used||message?.kind!=='request')return;used=true;
    void (async()=>{
      const url=new URL(message.url);
      if(url.origin!=='http://127.0.0.1:43121'||url.username||url.password||url.hash||Date.now()>=message.deadlineAt)throw Object.assign(Error(),{code:'E_NETWORK'});
      const deadline=setTimeout(()=>controller.abort(),Math.min(15000,message.deadlineAt-Date.now()));
      try {
        const response=await fetch(url.href,{method:'GET',headers:message.headers,credentials:'omit',redirect:'manual',cache:'no-store',signal:controller.signal});
        if(['opaque','opaqueredirect'].includes(response.type)||response.status>=300&&response.status<400)throw Object.assign(Error(),{code:'E_NETWORK'});
        const reader=response.body?.getReader(),chunks=[];let length=0;
        try {if(reader)for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;
          if(length>8192){await reader.cancel();throw Object.assign(Error(),{code:'E_LIMIT'});}chunks.push(value);}}
        finally{reader?.releaseLock();}
        const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
        const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),headers={};
        for(const [name,value]of response.headers)if(!/^(set-cookie2?|www-authenticate|proxy-authenticate)$/i.test(name))headers[name]=value;
        port.postMessage({kind:'result',status:response.status,statusText:response.statusText,text,headers});
      }finally{clearTimeout(deadline);}
    })().catch(error=>{try{port.postMessage({kind:'error',code:controller.signal.aborted?'E_TIMEOUT':error.code||'E_NETWORK'});}catch{}});
  });
}
