'use strict';
// Opt-in dedicated extension Worker only. Transforms approved SOURCE DATA;
// no user module is ever imported or evaluated in this privileged Worker.
let babelReady=false,linkerPromise=null,vuePromise=null,controllerPromise=null;
const count=input=>new TextEncoder().encode(input).length;
function fail(code,message){return Object.assign(new Error(message),{code});}
self.onmessage=async event=>{
  const message=event.data;
  if(!message||message.type!=='prepare'||!Number.isSafeInteger(message.requestId)||
     message.requestId<1||message.requestId>Number.MAX_SAFE_INTEGER)return;
  const id=message.requestId;
  try{
    const controller=message.framework==='controller';
    if(!controller&&message.framework!=='react'&&message.framework!=='vue')
      throw fail('E_PAGE_COMPONENT_IDENTITY','Unsupported Page/Controller framework');
    const inspect=message.action==='inspect';
    if(message.action!==undefined&&!['inspect','prepare'].includes(message.action))
      throw fail('E_PAGE_COMPONENT_IDENTITY','Unknown compiler action');
    if(typeof message.componentSource!=='string'||count(message.componentSource)>128*1024||
       !inspect&&!controller&&(typeof message.uiHelperSource!=='string'||count(message.uiHelperSource)>49152)||
       message.remoteModules!==undefined&&(!Array.isArray(message.remoteModules)||message.remoteModules.length>32))
      throw fail('E_PAGE_COMPONENT_LIMIT','Compiler source input too large');
    if(!babelReady){
      importScripts('../libs/page-frameworks/babel-7.29.9.min.js');
      if(!self.Babel||self.Babel.version!=='7.29.9')
        throw fail('E_PAGE_COMPONENT_COMPILER','Pinned Babel unavailable');
      babelReady=true;
    }
    let ready;
    if(controller){
      // The only new module is a pinned, packaged SOURCE linker. It never
      // supplies chrome APIs and never evaluates imported third-party code.
      controllerPromise??=import('../libs/page-frameworks/controller-esm-linker-r4.mjs');
      const linker=await controllerPromise;
      const prepare=inspect?linker.inspectBrowserControllerESM:linker.prepareBrowserControllerESM;
      ready=await prepare({componentSource:message.componentSource,projectId:message.projectId,
        babel:self.Babel,remoteLock:message.remoteLock,remoteModules:message.remoteModules||[]});
    }else{
      linkerPromise??=import('../libs/page-frameworks/page-component-linker-r243.mjs');
      if(message.framework==='vue')
        vuePromise??=import('../libs/page-frameworks/vue-sfc-transform-r243.mjs');
      const [linker,vue]=await Promise.all([linkerPromise,
        message.framework==='vue'?vuePromise:Promise.resolve(null)]);
      const prepare=inspect?linker.inspectBrowserPageComponent:linker.prepareBrowserPageComponent;
      ready=await prepare({
        framework:message.framework,projectId:message.projectId,pageRules:message.pageRules,
        componentSource:message.componentSource,uiHelperSource:message.uiHelperSource,
        babel:self.Babel,transformSFC:vue?.transformVueSFC,
        remoteLock:message.remoteLock,remoteModules:message.remoteModules||[]
      });
    }
    self.postMessage({requestId:id,ok:true,result:ready});
  }catch(error){
    self.postMessage({requestId:id,ok:false,error:{
      code:typeof error?.code==='string'?error.code:'E_PAGE_COMPONENT_COMPILE',
      message:String(error?.message||error).slice(0,400),
      ...(error?.location?{location:error.location}:{})
    }});
  }
};
