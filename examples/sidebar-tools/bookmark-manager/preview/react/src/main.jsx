import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../../../src/react/App.jsx';
import '../../../src/react/style.css';

// OFFLINE PREVIEW ONLY. Fixed phrases return bounded intents; the actual
// React App and bookmark adapter execute against the existing isolated SDK mock.
// This neither contacts a real Provider nor proves Chrome/Native bookmarks.
let session={open:false,draft:'',rows:[],refs:{folderId:null,bookmarkId:null,matches:[]}};
function mockIntent(request){
 const input=String(request||'').trim();
 const folder=input.match(/(?:叫|名为|名称为)\s*([^，。；;]+?)\s*的?文件夹/);
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
 const find=input.match(/(?:找出|查找|搜索)\s*(.+?)(?:相关)?书签/);
 if(find)return {actions:[{type:'bookmark.search',query:find[1].replace(/相关$/,'').trim()}]};
 return {question:'这里只演示几个固定句式；真实 AI 需要在已安装的 OpenDesk 浏览器中连接。'};
}
const conversation=Object.freeze({
 source:()=>({provider:'offline_fixture',label:'离线演示（非真实 AI）'}),
 readSession:()=>structuredClone(session),
 saveSession:next=>{session=structuredClone(next)},
 async request({request,signal}={}){
  if(signal?.aborted)throw Object.assign(Error('已停止'),{code:'E_CANCELLED'});
  return {proposal:mockIntent(request),metadata:{provider:'offline_fixture',nativeVerified:false}};
 },
 cancel:async()=>{}
});
const container=document.getElementById('tool-root');
if(!container)throw Error('E_BOOKMARK_REACT_ROOT_MISSING');
const root=createRoot(container);
root.render(<App runtime={{conversation}} mode="preview"/>);
Object.defineProperty(globalThis,'__BookmarkReactPreview',{value:Object.freeze({
 version:'R3.0.5',renderer:'react-dom/client',offlineMock:true,nativeVerified:false,
 unmount:()=>root.unmount()
})});
