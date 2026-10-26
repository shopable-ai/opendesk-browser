/* Markdown Workbench: offline SDK boundary, no actual Chrome, file, or clipboard changes. */
(()=>{
 'use strict';
 const root=document.getElementById('tool-root'),scenario=globalThis.__opendeskPreviewScenario;
 const supported=new Set(['success','empty','error','loading','permission-denied','untrusted']);
 if(!root||!supported.has(scenario))throw Error('E_MDW_PREVIEW_INIT');
 const fail=message=>{throw Object.assign(new Error('[离线模拟] '+message),{code:'E_PREVIEW_ONLY'});};
 const check=()=>{
  if(scenario==='loading')return new Promise(()=>{});
  if(scenario==='error'||scenario==='permission-denied')fail('模拟浏览器操作不可用');
  return Promise.resolve();
 };
 Object.defineProperty(globalThis,'OpenDeskTool',{value:Object.freeze({
  root,setState:()=>{},setNavigation:()=>false,request:()=>fail('未模拟此操作')
 }),writable:false,configurable:false});
 Object.defineProperty(globalThis,'OpenDeskSDK',{value:Object.freeze({browser:Object.freeze({
  clipboard:Object.freeze({async writeText(text){
   if(typeof text!=='string')fail('复制正文无效');
   await check();return {copied:true,simulated:true};
  }}),
  downloads:Object.freeze({async text({text,filename}={}){
   if(typeof text!=='string'||!filename)fail('下载参数无效');
   await check();return {started:true,simulated:true,downloadId:'preview-only'};
  }})
 })}),writable:false,configurable:false});
 if(scenario==='untrusted'){
  const source=root.querySelector('#mdw-source');
  source.value='# 安全预览\n\n<img src=x onerror=alert(1)>\n\n![外部图片](https://example.invalid/img.png)';
  source.dispatchEvent(new Event('input',{bubbles:true}));
 }
})();