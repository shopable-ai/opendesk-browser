import {SIDEBAR_TOOL_STORE} from '../ui/sidebar-tools/package.js';
import {writeVerifiedLocalValue} from '../ui/sidebar-tools/storage-state.js';
import {isReadingTocToolSender} from '../reading-toc/page.js';
import {KNOWLEDGE_TOOL_ID,KNOWLEDGE_PROTOCOL,KNOWLEDGE_DATA_KEY,CAPTURE_SITE_STORE,
  captureAllowed,installedKnowledgeTool,knowledgePackageHash,chatCaptureOrigin,KNOWLEDGE_WORKSPACE_PREFIX,knowledgeDigest} from './policy.js';
import {readKnowledgeStore,normalizeCapture,addKnowledgeRecord,updateKnowledgeRecord,listKnowledge,
  knowledgeMarkdown,knowledgeFilename} from './model.js';

const PAGE_OPERATIONS=new Set(['capture.save','capture.download','capture.image']);
const HOST_OPERATIONS=new Set(['knowledge.list','knowledge.get','knowledge.update','knowledge.remove','knowledge.backup','knowledge.download','knowledge.openSource','knowledge.workspace']);
function isTopHost(api,sender){
  return isReadingTocToolSender(api,sender,KNOWLEDGE_TOOL_ID)&&!sender.tab?.incognito&&
    (sender.tab?sender.frameId===0:sender.frameId===undefined||sender.frameId===0)&&
    (!sender.documentLifecycle||sender.documentLifecycle==='active');
}
async function assertHostDocument(api,sender){
  if(!isTopHost(api,sender))throw new Error('知识收件箱仅允许已验证的工具宿主访问');
  if(sender.tab){
    // Extension TAB documents can be absent from webNavigation. Match the live
    // extension context, including the tab and document, as for Side Panels.
    const contexts=await api.runtime.getContexts({contextTypes:['TAB'],documentUrls:[sender.url],tabIds:[sender.tab.id]});
    const matches=contexts.filter(context=>context.contextType==='TAB'&&context.documentUrl===sender.url&&
      context.tabId===sender.tab.id&&context.frameId===0&&!context.incognito&&context.documentId===sender.documentId);
    if(!sender.documentId||matches.length!==1)
      throw new Error('工具宿主文档已变化');
  }else{
    const contexts=await api.runtime.getContexts({contextTypes:['SIDE_PANEL'],documentUrls:[sender.url]});
    const matches=contexts.filter(context=>context.contextType==='SIDE_PANEL'&&context.documentUrl===sender.url&&
      context.frameId===0&&!context.incognito&&typeof context.documentId==='string'&&context.documentId);
    if(matches.length!==1||sender.documentId&&matches[0].documentId!==sender.documentId)
      throw new Error('工具侧栏文档无法核验');
  }
}
export function allowedCaptureImage(value){
  try{
    const url=new URL(value);
    if(url.username||url.password||url.href.length>12000||url.protocol!=='https:')return false;
    return ['chatgpt.com','chat.openai.com','files.oaiusercontent.com'].includes(url.hostname)||
      url.hostname.endsWith('.oaiusercontent.com');
  }catch{return false;}
}
// All read-modify-write operations use the SAME extension-origin lock as the
// existing installer/uninstaller. Content-script Web Locks cannot do this.
export function createKnowledgeService({api=globalThis.chrome,lockManager=globalThis.navigator?.locks}={}){
  let pending=0;
  async function dispatch(message,sender){
    const page=PAGE_OPERATIONS.has(message?.operation),host=HOST_OPERATIONS.has(message?.operation);
    if(message?.protocol!==KNOWLEDGE_PROTOCOL||message.toolId!==KNOWLEDGE_TOOL_ID||!page&&!host||
      typeof message.packageHash!=='string'||!/^[a-f0-9]{64}$/.test(message.packageHash)||
      new TextEncoder().encode(JSON.stringify(message)).length>185000)
      throw new Error('知识工具请求无效');
    if(page){
      if(sender?.id!==api.runtime.id||!Number.isInteger(sender.tab?.id)||sender.tab.incognito||sender.frameId!==0||
        typeof sender.documentId!=='string'||!sender.documentId||
        sender.documentLifecycle&&sender.documentLifecycle!=='active'||message.expectedUrl!==sender.url)
        throw new Error('保存请求必须来自当前顶层 ChatGPT 文档');
    }else await assertHostDocument(api,sender);
    if(!lockManager?.request||pending>=8)throw new Error('知识收件箱忙碌，请稍后重试');
    pending++;
    try{return await lockManager.request('opendesk.sidebar-tools:tool:'+KNOWLEDGE_TOOL_ID,async()=>{
      async function authorize(){
        const saved=await api.storage.local.get([SIDEBAR_TOOL_STORE,CAPTURE_SITE_STORE]);
        const tool=installedKnowledgeTool(saved[SIDEBAR_TOOL_STORE]);
        if(!tool||await knowledgePackageHash(tool)!==message.packageHash)throw new Error('工具已更新或卸载，请重新打开');
        if(page){
          if(!captureAllowed(saved[SIDEBAR_TOOL_STORE],saved[CAPTURE_SITE_STORE],sender.url))throw new Error('当前网站的知识保存权限已撤销');
          if(!await api.permissions.contains({origins:[chatCaptureOrigin(sender.url)+'/*']}))throw new Error('浏览器网站访问权限已撤销');
          const frame=await api.webNavigation.getFrame({tabId:sender.tab.id,frameId:0});
          const tab=await api.tabs.get(sender.tab.id);
          if(!frame||frame.documentId!==sender.documentId||frame.url!==message.expectedUrl||
            frame.errorOccurred||frame.documentLifecycle&&frame.documentLifecycle!=='active'||
            tab.incognito||tab.url!==message.expectedUrl||tab.pendingUrl||['loading','unloaded'].includes(tab.status))
            throw new Error('保存期间网页已切换，请在当前回答重试');
          const confirmed=await api.webNavigation.getFrame({tabId:sender.tab.id,frameId:0});
          if(confirmed?.documentId!==frame.documentId||confirmed.url!==frame.url||confirmed.errorOccurred)
            throw new Error('保存期间文档已刷新，请重试');
        }else await assertHostDocument(api,sender);
        return tool;
      }
      const tool=await authorize();
      const payload=message.payload||{};
      if(message.operation==='capture.image'){
        if(!tool.capabilities.includes('user.export')||!allowedCaptureImage(payload.url))throw new Error('此图片无法直接下载，请使用原网页的下载入口');
        await authorize();
        const downloadId=await api.downloads.download({url:payload.url,saveAs:true,conflictAction:'uniquify'});
        if(!Number.isInteger(downloadId))throw new Error('Chrome 未确认图片下载');
        return {downloadId};
      }
      if(page){
        const record=await normalizeCapture(payload,sender.url);
        if(message.operation==='capture.download'){
          if(!tool.capabilities.includes('user.export'))throw new Error('未授权下载');
          await authorize();
          const downloadId=await api.downloads.download({url:'data:text/markdown;charset=utf-8,'+encodeURIComponent(knowledgeMarkdown(record)),
            filename:knowledgeFilename(record.title),saveAs:true,conflictAction:'uniquify'});
          if(!Number.isInteger(downloadId))throw new Error('Chrome 未确认下载');
          return {downloadId};
        }
        const store=readKnowledgeStore((await api.storage.local.get(KNOWLEDGE_DATA_KEY))[KNOWLEDGE_DATA_KEY]);
        const result=addKnowledgeRecord(store,record);
        await authorize();
        if(!result.duplicate)await writeVerifiedLocalValue(api,KNOWLEDGE_DATA_KEY,result.store,store,'知识收件箱');
        return {saved:true,id:result.record.id,duplicate:result.duplicate};
      }
      const store=readKnowledgeStore((await api.storage.local.get(KNOWLEDGE_DATA_KEY))[KNOWLEDGE_DATA_KEY]);
      if(message.operation==='knowledge.list')return listKnowledge(store,payload);
      if(message.operation==='knowledge.backup'){
        if(!tool.capabilities.includes('user.export'))throw new Error('未授权导出');
        const downloadId=await api.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify({format:'opendesk.knowledge-backup.v1',...store},null,2)),
          filename:'opendesk-knowledge-backup.json',saveAs:true,conflictAction:'uniquify'});
        if(!Number.isInteger(downloadId))throw new Error('Chrome 未确认备份下载');
        return {downloadId,records:store.records.length};
      }
      const row=store.records.find(record=>record.id===payload.id);
      if(!row)throw new Error('记录已不存在，请刷新');
      if(message.operation==='knowledge.get')return {record:row,markdown:knowledgeMarkdown(row),filename:knowledgeFilename(row.title)};
      if(message.operation==='knowledge.openSource'){
        await authorize();
        const tab=await api.tabs.create({url:row.source});return {opened:true,tabId:tab.id};
      }
      if(message.operation==='knowledge.workspace'){
        if(!tool.capabilities.includes('user.export'))throw new Error('未授权导出');
        const markdown=knowledgeMarkdown(row);
        if(new TextEncoder().encode(markdown).length>32768)throw new Error('本地工作区单文件上限为 32 KiB，请先下载完整 Markdown，再在本地处理');
        await authorize();
        const handoff={version:1,recordId:row.id,title:row.title,markdown,filename:knowledgeFilename(row.title),
          sha256:await knowledgeDigest(markdown),packageHash:message.packageHash,expiresAt:Date.now()+10*60*1000};
        // Allocate our own target tab, bind data to its native tab ID, then
        // open the exact existing Workspace URL. No Native sender exception.
        const tab=await api.tabs.create({url:'about:blank'});
        if(!Number.isInteger(tab?.id))throw new Error('无法打开本地工作区');
        const key=KNOWLEDGE_WORKSPACE_PREFIX+tab.id;
        try{
          await api.storage.session.set({[key]:handoff});
          await api.tabs.update(tab.id,{url:api.runtime.getURL('native-agent/workspace.html')});
        }catch(error){await api.storage.session.remove(key).catch(()=>{});await api.tabs.remove(tab.id).catch(()=>{});throw error;}
        return {opened:true,tabId:tab.id,savedToDisk:false};
      }
      if(message.operation==='knowledge.download'){
        if(!tool.capabilities.includes('user.export'))throw new Error('未授权下载');
        const downloadId=await api.downloads.download({url:'data:text/markdown;charset=utf-8,'+encodeURIComponent(knowledgeMarkdown(row)),
          filename:knowledgeFilename(row.title),saveAs:true,conflictAction:'uniquify'});
        if(!Number.isInteger(downloadId))throw new Error('Chrome 未确认下载');
        return {downloadId};
      }
      if(payload.ifRevision!==row.revision)throw new Error('记录已在其他窗口修改，请刷新后核对；本次没有覆盖');
      const result=message.operation==='knowledge.update'?updateKnowledgeRecord(store,payload):
        {store:{version:1,records:store.records.filter(record=>record.id!==row.id)}};
      await authorize();
      await writeVerifiedLocalValue(api,KNOWLEDGE_DATA_KEY,result.store,store,'知识收件箱');
      return {saved:true,...(result.record?{record:result.record}:{removed:true})};
    });}finally{pending--;}
  }
  return Object.freeze({dispatch});
}
export function installKnowledgeService({api=globalThis.chrome,...options}={}){
  const service=createKnowledgeService({api,...options});
  const listener=(message,sender,reply)=>{
    if(message?.protocol!==KNOWLEDGE_PROTOCOL)return false;
    void service.dispatch(message,sender).then(data=>reply({ok:true,data}),error=>{
      const message=String(error?.message||error);
      const code=error?.code||(/已满|超过|最多.*条|草稿为空/.test(message)?'E_TOOL_DATA_LIMIT':
        /其他窗口修改|其他窗口/.test(message)?'E_STORAGE_CONFLICT':'E_KNOWLEDGE');
      reply({ok:false,error:{code,message:message.slice(0,240)}});
    });
    return true;
  };
  api.runtime.onMessage.addListener(listener);
  const removed=tabId=>{void api.storage.session.remove(KNOWLEDGE_WORKSPACE_PREFIX+tabId).catch(()=>{});};
  api.tabs.onRemoved?.addListener(removed);
  return {dispose(){api.runtime.onMessage.removeListener(listener);api.tabs.onRemoved?.removeListener(removed);}};
}
