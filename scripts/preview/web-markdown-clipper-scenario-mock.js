/* Add scenario semantics to the EXISTING Clipper preview SDK adapter.
 * The HTML and product JS are still the unmodified compiled installation sources. */
(()=>{
 'use strict';
 const scenario=globalThis.__opendeskPreviewScenario;
 if(!['success','empty','error','loading','permission-denied','untrusted'].includes(scenario))
  throw Error('E_CLIP_PREVIEW_SCENARIO');
 const sdk=globalThis.OpenDeskTool;
 if(!sdk?.request)throw Error('E_CLIP_PREVIEW_SDK');
 const original=sdk.request.bind(sdk);
 sdk.request=async(operation,args={})=>{
  if(scenario==='loading'&&
      (operation==='currentPage.info'||operation.startsWith('clipNotes.')))
   return new Promise(()=>{});
  if(scenario==='permission-denied'&&
      (operation==='currentPage.info'||operation.startsWith('clipNotes.')||operation.startsWith('clip.')))
   throw Object.assign(new Error('[离线模拟] 当前网页权限不足'),{code:'E_PERMISSION_DENIED'});
  if(scenario==='error'&&
      (operation==='currentPage.info'||operation.startsWith('clipNotes.')))
   throw Object.assign(new Error('[离线模拟] 剪藏服务暂不可用'),{code:'E_HOST_STORAGE'});
  return original(operation,args);
 };
})();
