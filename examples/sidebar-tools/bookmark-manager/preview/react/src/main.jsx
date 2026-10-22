import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../../../src/react/App.jsx';
import {TrustedConversationWorkspace,TrustedConversationHeaderSlot} from '../../../../../../src/ui/react/components/conversation.tsx';
import '../../../../../../src/ui/react/components/conversation-dock.css';
import '../../../src/react/style.css';
// Offline-only chrome CSS is injected separately by build-preview.mjs;
// keep the production App/Dock stylesheet byte-identical to formal builds.

// OFFLINE PREVIEW ONLY. Fixed phrases return bounded intents; the actual
// React App and bookmark adapter execute against the existing isolated SDK mock.
// This neither contacts a real Provider nor proves Chrome/Native bookmarks.
let session={open:true,draft:'',rows:[],refs:{folderId:null,bookmarkId:null,matches:[]}};
function mockIntent(request){
 const input=String(request||'').trim();
 const folder=input.match(/(?:叫|名为|名称为)\s*([^，。；;]+?)\s*的?文件夹/)||
  input.match(/(?:创建|新建)\s*([^，。；;]+?)\s*文件夹/);
 const url=input.match(/https?:\/\/[^\s，。；;)\]】]+/i)?.[0]?.replace(/[,.]+$/,'');
 const rename=input.match(/(?:改名为|改成|重命名为)\s*([^，。；;]+)/);
 if(rename&&/(?:刚才|收藏|书签)/.test(input))
  return {actions:[{type:'bookmark.update',target:'$lastBookmark',title:rename[1].trim()}]};
 if(folder&&/(?:创建|新建)/.test(input)){
  const actions=[{type:'folder.create',title:folder[1].trim()}];
  if(url&&/(?:收藏|添加|保存)/.test(input))
   actions.push({type:'bookmark.create',title:new URL(url).hostname,url,parent:'$lastFolder'});
  return {actions};
 }
 if(url&&/(?:收藏|添加|保存)/.test(input)&&/(?:刚才|AI 工具)/.test(input))
  return {actions:[{type:'bookmark.create',title:new URL(url).hostname,url,parent:'$lastFolder'}]};
 if(/(?:当前网页|当前页).*(?:收藏|保存|添加)|(?:收藏|保存|添加).*(?:当前网页|当前页)/.test(input))
  return {actions:[{type:'bookmark.create',title:'$pageTitle',url:'$currentPage',parent:'$lastFolder'}]};
 const find=input.match(/(?:找出|查找|搜索)\s*(.+?)(?:相关)?书签/);
 if(find)return {actions:[{type:'bookmark.search',query:find[1].replace(/相关$/,'').trim()}]};
 return {question:'这里只演示几个固定句式；真实 AI 需要在已安装的 OpenDesk 浏览器中连接。'};
}
const conversation=Object.freeze({
 source:()=>({provider:'offline_fixture'}),
 readSession:()=>structuredClone(session),
 saveSession:next=>{session=structuredClone(next)},
 async request({request,signal}={}){
  if(!signal||typeof globalThis.__opendeskBookmarkMockDiagnostic!=='function')
   throw Object.assign(Error('离线请求必须绑定模拟书签环境与本轮信号'),{code:'E_PREVIEW_MOCK'});
  if(signal?.aborted)throw Object.assign(Error('已停止'),{code:'E_CANCELLED'});
  // Make Stop and concurrent user interactions observable in this preview only.
  // Abort before proposal delivery: the business adapter must not issue writes.
  await new Promise((resolve,reject)=>{
   const cancel=()=>Object.assign(Error('已停止'),{code:'E_CANCELLED'});
   const onAbort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);reject(cancel())};
   const timer=setTimeout(()=>{signal?.removeEventListener('abort',onAbort);resolve()},800);
   signal?.addEventListener('abort',onAbort,{once:true});
   if(signal?.aborted)onAbort();
  });
  if(String(request).trim()==='模拟 Provider 失败')
   throw Object.assign(Error('离线模拟：模型服务暂时不可用，请检查后重试。'),{code:'E_OFFLINE_PROVIDER_FAILED'});
  // This grant can reach only the in-memory SDK above. It is not a Host grant
  // and is never packaged or accepted as real Chrome/Provider authorization.
  let active=true;
  const authorization=Object.freeze({signal,
   assertWrite(){
    if(!active||signal.aborted)
     throw Object.assign(Error('离线请求已停止或结束'),{code:'E_CANCELLED'});
   },
   release(){active=false}
  });
  return {proposal:mockIntent(request),authorization,
   metadata:{provider:'offline_fixture',nativeVerified:false}};
 },
 cancel:async()=>{}
});
const container=document.getElementById('tool-root');
if(!container)throw Error('E_BOOKMARK_REACT_ROOT_MISSING');
const root=createRoot(container);
// The surrounding ToolHost chrome is an isolated offline fixture. The real
// App, shared Workspace, frame slot and Composer are imported from production.
function OfflineTrustedToolHost(){
 const [headerTarget,setHeaderTarget]=React.useState(null);
 return <div className="od-preview-trusted-host">
  <header className="sidebar-tool-view-head od-toolbar od-page-head" aria-label="框架工具标题栏（离线预览）">
   <strong className="od-page-title">书签管理</strong>
   <TrustedConversationHeaderSlot ref={setHeaderTarget}/>
   <button type="button" className="sidebar-tool-icon-action od-icon-button"
    aria-label="卸载当前工具（离线预览禁用）" title="预览中不可卸载" disabled>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 4h4m-8 3 1 13h10l1-13M10 11v5m4-5v5"/></svg>
   </button>
  </header>
  <div className="od-preview-trusted-frame">
   <TrustedConversationWorkspace controller={conversation} headerTarget={headerTarget}
    title="AI 对话" placeholder="描述要完成的操作"
    renderBusiness={dock=><App runtime={{conversation}} mode="preview" dock={dock}/>}/>
  </div>
 </div>;
}
root.render(<OfflineTrustedToolHost/>);
Object.defineProperty(globalThis,'__BookmarkReactPreview',{value:Object.freeze({
 version:'R3.0.5',renderer:'react-dom/client',offlineMock:true,nativeVerified:false,
 unmount:()=>root.unmount()
})});
