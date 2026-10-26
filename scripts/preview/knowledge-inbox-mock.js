/* Knowledge Inbox: exact production HTML/CSS/JS with an isolated in-memory authority stub.
 * Not Chrome storage, page capture, Native files, or a genuine installed extension. */
(()=>{
 'use strict';
 const root=document.getElementById('tool-root'),scenario=globalThis.__opendeskPreviewScenario;
 if(!root||!['success','empty','error','loading','permission-denied','untrusted'].includes(scenario))
  throw Error('E_KI_PREVIEW_INIT');
 const clone=value=>JSON.parse(JSON.stringify(value));
 const now=()=>new Date().toISOString();
 const fixture=(id,title,markdown,kind='inbox',tags=[])=>({
  id,title,markdown,kind,tags,note:'',draft:null,mode:'manual',question:'',
  source:'',imageCount:0,revision:1,createdAt:now(),updatedAt:now()
 });
 let records=scenario==='empty'?[]:[
  fixture('preview-knowledge-1','Markdown 排版与预览',
   '# Markdown 排版与预览\n\n记录正文应优先于技术说明。\n\n- 安全渲染\n- 保留来源\n- 清晰搜索','inbox',['设计']),
  fixture('preview-knowledge-2','客户问题的知识整理',
   '一条知识可以用分类、标签和独立草稿持续整理。','idea',['运营'])
 ];
 if(scenario==='untrusted')records.push(fixture('preview-knowledge-untrusted',
  '<img src=x onerror=alert(1)>','<script>alert(1)</script> 应被当作文字。','draft'));
 let serial=0;
 const size=()=>new TextEncoder().encode(JSON.stringify(records)).byteLength;
 const fail=(code,message)=>{throw Object.assign(new Error('[离线模拟] '+message),{code});};
 const blocked=()=>{
  if(scenario==='loading')return new Promise(()=>{});
  if(scenario==='permission-denied')fail('E_PERMISSION_DENIED','此场景模拟网站权限被拒绝');
  if(scenario==='error')fail('E_HOST_STORAGE','此场景模拟可信存储失败');
  return null;
 };
 async function request(operation,args={}){
  if(!['knowledge.editorState','knowledge.list','knowledge.get','knowledge.create',
    'knowledge.update','knowledge.download','knowledge.workspace',
    'knowledge.openSource','knowledge.backup','knowledge.remove'].includes(operation))
   return fail('E_PREVIEW_UNSUPPORTED','操作未被授权：'+String(operation));
  if(operation==='knowledge.editorState')return {ok:true,simulated:true};
  const wait=blocked();if(wait)return wait;
  if(operation==='knowledge.list'){
   const query=String(args.query||'').trim().toLowerCase(),kind=args.kind||'all';
   const items=records.filter(r=>(kind==='all'||r.kind===kind)&&
    [r.title,r.markdown,r.question,r.note,...r.tags].join(' ').toLowerCase().includes(query));
   return {records:clone(items.map(({markdown,draft,...r})=>({
    ...r,excerpt:draft??markdown
   }))),total:records.length,bytes:size()};
  }
  if(operation==='knowledge.get'){
   const row=records.find(r=>r.id===args.id);
   if(!row)return fail('E_NOT_FOUND','记录已经不存在');
   return {record:clone(row),markdown:row.draft??row.markdown};
  }
  if(operation==='knowledge.create'){
   if(typeof args.title!=='string'||!args.title.trim()||typeof args.markdown!=='string'||!args.markdown.trim())
    return fail('E_VALIDATION','标题与正文不能为空');
   const row=fixture('preview-created-'+(++serial),args.title.trim(),args.markdown,args.kind||'inbox',args.tags||[]);
   row.note=args.note||'';records.unshift(row);return {record:clone(row),simulated:true};
  }
  if(operation==='knowledge.update'){
   const index=records.findIndex(r=>r.id===args.id);
   if(index<0)return fail('E_NOT_FOUND','记录已经不存在');
   if(records[index].revision!==args.ifRevision)return fail('E_REVISION_CONFLICT','记录已被其他窗口修改');
   const previous=records[index];
   records[index]={...previous,title:args.title,kind:args.kind,
    tags:clone(args.tags),note:args.note,draft:args.draft,revision:previous.revision+1,
    updatedAt:now()};
   return {record:clone(records[index]),simulated:true};
  }
  if(operation==='knowledge.remove'){
   const index=records.findIndex(r=>r.id===args.id);
   if(index<0)return fail('E_NOT_FOUND','记录已经不存在');
   if(records[index].revision!==args.ifRevision)return fail('E_REVISION_CONFLICT','记录已被其他窗口修改');
   records.splice(index,1);return {removed:true,simulated:true};
  }
  if(operation==='knowledge.backup')return {records:records.length,simulated:true};
  if(operation==='knowledge.workspace')return fail('E_PREVIEW_ONLY','离线预览不能连接 Native 本地工作区');
  if(operation==='knowledge.openSource')return fail('E_PREVIEW_ONLY','预览中没有真实的来源对话');
  if(operation==='knowledge.download')return {started:true,simulated:true};
  return fail('E_PREVIEW_UNSUPPORTED','未支持操作');
 }
 Object.defineProperty(globalThis,'OpenDeskTool',{configurable:false,writable:false,
  value:Object.freeze({root,request,setState:()=>{},setNavigation:()=>false})});
 Object.defineProperty(globalThis,'OpenDeskSDK',{configurable:false,writable:false,
  value:Object.freeze({browser:Object.freeze({
   clipboard:Object.freeze({async writeText(text){
    if(typeof text!=='string')return fail('E_INVALID_TEXT','正文不是文本');
    return {copied:true,simulated:true};
   }})
  })})});
})();
