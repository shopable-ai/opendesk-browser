// PREVIEW ONLY: deterministic in-memory SDK substitute for visual A/B review.
// It is never referenced by the installed tool package. No real user storage is read.
(() => {
  'use strict';
  const store={notes:null,note:null};
  const requests=[];
  const root=document.getElementById('tool-root');
  let nextWriteFailure=null,writeGate=null;
  const harness=Object.freeze({
    calls:()=>structuredClone(requests),
    data:()=>structuredClone(store),
    holdWrite(){
      if(writeGate)throw Error('预览写入已暂停');
      let release;
      writeGate={promise:new Promise(ok=>{release=ok;}),release};
    },
    releaseWrite(){
      if(!writeGate)throw Error('预览写入并未暂停');
      const gate=writeGate;writeGate=null;gate.release();
    },
    failWrite(message,afterCommit=false){
      nextWriteFailure={message:String(message),afterCommit:Boolean(afterCommit)};
    },
    externalNotes(value){store.notes=structuredClone(value);}
  });
  Object.defineProperty(globalThis,'__quickNotesPreviewHarness',
    {value:harness,configurable:false,writable:false});
  const hash=async value=>{
    if(!globalThis.crypto?.subtle)throw Error('请通过 localhost HTTP 打开预览');
    const raw=new TextEncoder().encode(JSON.stringify(value));
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)))
      .map(x=>x.toString(16).padStart(2,'0')).join('');
  };
  async function request(op,arg={}){
    requests.push({op,arg:structuredClone(arg)});
    if(op==='storage.get'){
      if(!['notes','note'].includes(arg.key))throw Error('预览不支持此存储键');
      const value=structuredClone(store[arg.key]);
      return arg.withEtag?{value,etag:await hash(value)}:{value};
    }
    if(op==='storage.set'){
      if(!['notes','note'].includes(arg.key))throw Error('预览不支持此存储键');
      if(arg.key==='notes'&&writeGate)await writeGate.promise;
      const failure=arg.key==='notes'?nextWriteFailure:null;
      if(arg.key==='notes')nextWriteFailure=null;
      if(failure&&!failure.afterCommit)throw Error(failure.message);
      if(arg.ifMatch!==undefined&&arg.ifMatch!==await hash(store[arg.key]))
        throw Error('工具数据已在其他窗口修改，请重新打开确认');
      store[arg.key]=structuredClone(arg.value);
      if(failure?.afterCommit)throw Error(failure.message);
      return {saved:true,etag:await hash(store[arg.key])};
    }
    if(op==='currentPage.info')return {status:'available',title:'预览网页（模拟）',
      url:'https://example.org/preview'};
    if(op==='tasks.open')return {opened:false,previewOnly:true};
    throw Error('预览不支持操作：'+op);
  }
  Object.defineProperty(globalThis,'OpenDeskTool',{
    value:Object.freeze({root,request,setState:()=>{}}),configurable:false,writable:false
  });
})();
