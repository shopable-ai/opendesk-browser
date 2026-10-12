'use strict';
// Opt-in dedicated extension Worker only. Never runs in SW or a target page.
// The only operation transforms SOURCE DATA with verified local compilers.
let babelReady=false,linkerPromise=null,vuePromise=null;
const count=input=>new TextEncoder().encode(input).length;
function fail(code,message){return Object.assign(new Error(message),{code});}
self.onmessage=async event=>{
  const message=event.data;
  if(!message||message.type!=='prepare'||!Number.isSafeInteger(message.requestId)||
     message.requestId<1||message.requestId>Number.MAX_SAFE_INTEGER)return;
  const id=message.requestId;
  try{
    if(message.framework!=='react'&&message.framework!=='vue')
      throw fail('E_PAGE_COMPONENT_IDENTITY','Unsupported Page framework');
    if(typeof message.componentSource!=='string'||count(message.componentSource)>128*1024||
       typeof message.uiHelperSource!=='string'||count(message.uiHelperSource)>49152)
      throw fail('E_PAGE_COMPONENT_LIMIT','Compiler source input too large');
    if(!babelReady){
      importScripts('../libs/page-frameworks/babel-7.29.9.min.js');
      if(!self.Babel||self.Babel.version!=='7.29.9')
        throw fail('E_PAGE_COMPONENT_COMPILER','Pinned Babel unavailable');
      babelReady=true;
    }
    linkerPromise??=import('../libs/page-frameworks/page-component-linker-r243.mjs');
    if(message.framework==='vue')
      vuePromise??=import('../libs/page-frameworks/vue-sfc-transform-r243.mjs');
    const [linker,vue]=await Promise.all([linkerPromise,
      message.framework==='vue'?vuePromise:Promise.resolve(null)]);
    const ready=await linker.prepareBrowserPageComponent({
      framework:message.framework,projectId:message.projectId,pageRules:message.pageRules,
      componentSource:message.componentSource,uiHelperSource:message.uiHelperSource,
      babel:self.Babel,transformSFC:vue?.transformVueSFC
    });
    self.postMessage({requestId:id,ok:true,result:ready});
  }catch(error){
    self.postMessage({requestId:id,ok:false,error:{
      code:typeof error?.code==='string'?error.code:'E_PAGE_COMPONENT_COMPILE',
      message:String(error?.message||error).slice(0,400),
      ...(error?.location?{location:error.location}:{})
    }});
  }
};
