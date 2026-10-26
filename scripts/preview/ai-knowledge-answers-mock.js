/* AI Knowledge Answers: exact real UI/model, ephemeral in-memory SDK simulation only. */
(()=>{
 'use strict';
 const root=document.getElementById('tool-root'),scenario=globalThis.__opendeskPreviewScenario;
 if(!root||!['success','empty','error','loading','permission-denied','untrusted'].includes(scenario))throw Error('E_QA_PREVIEW_INIT');
 const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
 const row=(id,question,answer,aliases=[])=>({id,question,answer,aliases,scope:'',enabled:true});
 let library={version:1,items:scenario==='empty'?[]:[
  row('qa_preview_return_1','退款需要几天？','收到退货并完成检查后，通常在 5 个工作日内处理退款。',['退款多久到']),
  row('qa_preview_shipping_2','发货需要多长时间？','现货订单一般在支付后 2 个工作日内发出。',['多久发货'])
 ]};
 if(scenario==='untrusted')library.items.push(
  row('qa_preview_untrusted_3','网页 HTML 会执行吗？','不会执行 <img src=x onerror=alert(1)> 或 <script>。'));
 let revision=0;
 const etag=()=>String(revision).padStart(64,'0');
 const fail=message=>{throw Object.assign(new Error('[离线模拟] '+message),{code:'E_PREVIEW_ONLY'});};
 async function request(operation,args={}){
  if(!['storage.get','storage.set','file.download','clipboard.writeText'].includes(operation))
   return fail('未模拟的 SDK 操作：'+String(operation));
  if(scenario==='loading')return new Promise(()=>{});
  if(scenario==='permission-denied')return fail('模拟访问权限不足');
  if(scenario==='error'&&operation.startsWith('storage.'))return fail('模拟存储不可用');
  if(operation==='file.download'){
   if(typeof args.text!=='string'||!args.filename)return fail('无效的文件内容');
   return {downloadId:'preview-only',simulated:true};
  }
  if(operation==='clipboard.writeText'){
   if(typeof args.text!=='string')return fail('无效的 CSV 内容');
   return {copied:true,simulated:true};
  }
  if(args.key!=='library')return fail('未知存储键');
  if(operation==='storage.get')return {value:clone(library),etag:etag()};
  if(args.ifMatch!==etag())return fail('写入冲突，请重新读取');
  if(!args.value||args.value.version!==1||!Array.isArray(args.value.items))
   return fail('知识库格式错误');
  library=clone(args.value);revision++;
  return {saved:true,etag:etag(),simulated:true};
 }
 Object.defineProperty(globalThis,'OpenDeskTool',{value:Object.freeze({
  root,request,setState:()=>{},setNavigation:()=>false
 }),writable:false,configurable:false});
})();