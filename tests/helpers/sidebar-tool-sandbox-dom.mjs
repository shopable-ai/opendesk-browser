import {createContext,runInContext} from 'node:vm';
import {parseHTML} from 'linkedom';

// Node integration transport only: executes the real bridge and installed JS
// against an emulated DOM. It does not prove Chrome CSP, gestures or persistence.
export function createSidebarToolSandboxDOM(t,{hostWindow,bridgeCode}){
  const {document:doc,window:dom}=parseHTML('<html><head></head><body><div id="tool-status"></div><div id="tool-root"></div></body></html>');
  doc.activeElement=doc.body;
  const handlers=new Map(),urls=new Map(),timers=new Set(),sent=[],errors=[];
  let sequence=0,context;
  const emit=(type,event)=>{for(const fn of handlers.get(type)||[])fn(event);};
  const parent={postMessage(message){
    const event=new hostWindow.Event('message');
    Object.assign(event,{origin:'null',source:transport,data:JSON.parse(JSON.stringify(message))});
    queueMicrotask(()=>hostWindow.dispatchEvent(event));
  }};
  const transport={postMessage(message){
    sent.push(structuredClone(message));
    // postMessage creates objects in the receiving realm. The real locale
    // validator correctly rejects objects with a foreign prototype.
    context.hostMessageJSON=JSON.stringify(message);
    const data=runInContext('JSON.parse(hostMessageJSON)',context);
    delete context.hostMessageJSON;
    const event=new dom.Event('message');
    Object.assign(event,{source:parent,data});emit('message',event);
  }};
  class LocalURL extends URL{
    static createObjectURL(blob){const url='blob:locale-integration-'+(++sequence);urls.set(url,blob);return url;}
    static revokeObjectURL(url){urls.delete(url);}
  }
  const sandbox={document:doc,parent,Blob,URL:LocalURL,TextEncoder,crypto:globalThis.crypto,
    Event:dom.Event,CustomEvent:dom.CustomEvent,requestAnimationFrame:()=>0,
    addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,new Set());handlers.get(type).add(fn);},
    removeEventListener(type,fn){handlers.get(type)?.delete(fn);},
    setTimeout(fn,delay){const timer=setTimeout(()=>{timers.delete(timer);fn();},delay);timer.unref();timers.add(timer);return timer;},
    clearTimeout(timer){clearTimeout(timer);timers.delete(timer);}};
  sandbox.window=sandbox;
  context=createContext(sandbox);
  // All bridge payloads in this fixture are JSON data; clone in the VM realm.
  runInContext('globalThis.structuredClone=value=>JSON.parse(JSON.stringify(value));',context);
  const append=doc.body.append.bind(doc.body);
  doc.body.append=node=>{
    append(node);
    if(node.tagName!=='SCRIPT')return;
    Promise.resolve().then(async()=>{
      const blob=urls.get(node.src);
      if(!blob)throw Error('Unexpected external script in sandbox integration');
      // linkedom exposes a read-only select.value; supply native DOM semantics.
      for(const select of doc.querySelectorAll('select'))Object.defineProperty(select,'value',{
        configurable:true,get(){return [...this.options].find(option=>option.selected)?.value||'';},
        set(value){for(const option of this.options)option.selected=option.value===value;}});
      runInContext(await blob.text(),context);
      node.dispatchEvent(new dom.Event('load'));
    }).catch(error=>{errors.push(error);node.dispatchEvent(new dom.Event('error'));});
  };
  runInContext(bridgeCode+'\nSandboxBridge.initSidebarToolSandbox();',context);
  t.after(()=>{emit('pagehide',{});for(const timer of timers)clearTimeout(timer);handlers.clear();urls.clear();});
  return {doc,transport,sent,errors};
}
