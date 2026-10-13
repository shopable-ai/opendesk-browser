'use strict';
// Opt-in local Babel. Only source data is parsed/transformed in this Worker.
let linker;
self.onmessage=async event=>{
  const row=event.data;
  if(row?.type!=='compile'||!Number.isSafeInteger(row.requestId)||row.requestId<1)return;
  try{
    if(!self.Babel)importScripts('../libs/page-frameworks/babel-7.29.9.min.js');
    linker??=import('./static-esm-linker.mjs');
    const {compileStaticESM}=await linker;
    const result=compileStaticESM({...row.input,babel:self.Babel});
    self.postMessage({requestId:row.requestId,ok:true,result});
  }catch(error){self.postMessage({requestId:row.requestId,ok:false,error:{
    code:error?.code||'E_STATIC_ESM_COMPILE',message:String(error?.message||error).slice(0,400)}});}
};
