// Preview only: simulated data and browser operations; never imported by the installed tool.
(function(){
'use strict';
const protocol='opendesk.clipper.preview.v1',toolId='web-markdown-clipper';
const instance=document.documentElement.dataset.previewInstance;
const parentOrigin=document.documentElement.dataset.previewParentOrigin;
const post=(kind,values={})=>parent.postMessage({protocol,toolId,instance,kind,...values},'*');
const sample=[
 '# 网页剪藏示例：一篇技术文章','',
 '这是演示数据，包含 **重点内容**、[参考链接](https://example.com/docs) 和简单的段落。','',
 '## 使用要点','','- 保留标题、段落和来源','- 支持列表、引用与代码','',
 '## 代码片段','','\x60\x60\x60js','const value = 42;','console.log(value);','\x60\x60\x60','',
 '| 功能 | 状态 |','| --- | --- |','| 文章剪藏 | 演示 |','| Markdown 预览 | 演示 |','',
 '> 此内容来自预览环境，不代表真实网页。'
].join('\n')+'\n';
const selection='在网页中选中的 **示例文字**，包含 [链接](https://example.com/selection)。\n';
let source='https://example.com/articles/markdown-clipper';
const pageTitle=()=>source.includes('next-page')?'第二个网页（内容不同）':'网页剪藏示例';
const send=(name,bytes=0)=>post('status',{message:name,bytes});
const enc=new TextEncoder(),size=v=>enc.encode(JSON.stringify(v)).byteLength;
let local={clips:null},caseName='normal',writes=0,latencyMs=0;
const key='opendesk.clipper.r110.simulated-session';
try{const saved=sessionStorage.getItem(key);if(saved)local=JSON.parse(saved);}catch{/* Isolated demo fallback only. */}
const persist=()=>{try{sessionStorage.setItem(key,JSON.stringify(local));}catch{/* Preview-only. */}};

if(!local.clips){
 const now='2026-10-21T08:00:00.000Z';
 const older='2026-10-20T10:00:00.000Z';
 local.clips={version:1,items:[
  {id:'sample-01',kind:'clip',title:'为什么优秀的工具需要简单的交互',source:'https://example.com/articles/product-design',createdAt:now,updatedAt:now,body:'# 为什么优秀的工具需要简单的交互\n\n复杂的功能应该被隐藏在清晰的入口之后，而不是让每一个常用动作都增加额外步骤。\n\n## 关键原则\n\n- 保存后立即能看见记录\n- 删除与编辑不占用整行\n- 不同剪藏模式保留独立内容'},
  {id:'sample-02',kind:'clip',title:'Markdown 中的引用与代码示例',source:'https://example.org/markdown/guide',createdAt:older,updatedAt:older,body:'# Markdown 中的引用与代码示例\n\n> 重要的句子应该容易回看。\n\n保存完整内容后可以再次阅读、编辑或下载。'},
  {id:'sample-03',kind:'note',title:'本周阅读整理',source:'',createdAt:older,updatedAt:older,body:'本周阅读整理\n\n查看三篇长文，整理设计笔记，保留原始来源。'},
  {id:'sample-04',kind:'clip',title:'网页剪藏的产品设计参考',source:'https://example.net/design/patterns',createdAt:older,updatedAt:older,body:'[网页剪藏的产品设计参考](https://example.net/design/patterns)\n\n简洁列表、同屏查看与可恢复的保存反馈。'},
  {id:'sample-05',kind:'clip',title:'长篇 Markdown · 28 节阅读测试',source:'https://example.com/docs/long-guide',createdAt:now,updatedAt:'2026-10-21T09:00:00.000Z',body:'# 长篇 Markdown · 阅读测试\n\n用于查看底部操作是否始终可见。\n\n'+Array.from({length:28},(_,i)=>'## 第 '+(i+1)+' 节\n\n这是第 '+(i+1)+' 节的完整正文，包含 **重点**、列表和可以继续向下滚动的段落。\n\n- 保存后可完整阅读\n- 编辑区自动增长但不推走按钮\n\n> 章节内容不会被截断。').join('\n\n')},
  {id:'sample-06',kind:'note',title:'阅读待办',source:'',createdAt:older,updatedAt:older,body:'阅读待办\n\n验证最近四条与资料库总数的区别。'}
 ]};
 persist();
}

const limit=4*1024*1024,bodyLimit=160000;
let counter=0;
const atom=()=> 'clip-demo-'+Date.now().toString(36)+'-'+(++counter).toString(36)+'-sample';
const safeLibrary=()=>local.clips||{version:1,items:[]};
const titleOf=body=>String(body).trim().split(/\r?\n/)[0].replace(/^#{1,6}\s*/,'').slice(0,42)||'新便签';
const summary=item=>({id:item.id,title:item.title,source:item.source,kind:item.kind,
 createdAt:item.createdAt,updatedAt:item.updatedAt,excerpt:item.body.slice(0,180),bodyBytes:enc.encode(item.body).length});
const etag=value=>{
 const json=JSON.stringify(value),buffer=enc.encode(json);
 let hash=2166136261;
 for(const byte of buffer)hash=Math.imul(hash^byte,16777619)>>>0;
 return hash.toString(16).padStart(8,'0').repeat(8);
};
const reason=(code,message)=>Object.assign(new Error(message),{code});

// UI_PREVIEW_ONLY: a simulated target webpage follows the real sidebar tool.
const demo=document.createElement('section');
demo.id='clip-region-demo';
demo.style.cssText='margin:16px 8px;padding:12px;border:1px dashed #94a3b8;border-radius:10px;font:12px/1.6 system-ui;background:Canvas;color:CanvasText';
const heading=document.createElement('strong');
heading.textContent='UI_PREVIEW_ONLY · 模拟 AI 对话网页';
demo.append(heading);
const guide=document.createElement('p');
guide.textContent='在上方选择「区域」→「点选网页区域」，再点下方回答；↑/↓ 调整，Enter/空格选择，Esc 取消。';
demo.append(guide);
const cases=document.createElement('div');cases.style.cssText='display:flex;flex-wrap:wrap;gap:5px';
let regionCase='normal',pendingRegion=null;
for(const [id,label] of [['normal','正常'],['streaming','流式'],['denied','权限拒绝'],['oversize','内容超限'],['failure','读取失败']]){
 const button=document.createElement('button');button.type='button';button.textContent=label;
 button.style.cssText='border:1px solid #94a3b8;border-radius:6px;padding:3px 7px;color:CanvasText;background:Canvas';
 button.setAttribute('aria-pressed',String(id===regionCase));
 button.addEventListener('click',()=>{regionCase=id;for(const b of cases.children)b.setAttribute('aria-pressed',String(b===button));send('模拟区域场景：'+label);});
 cases.append(button);
}
demo.append(cases);
const userPrompt=document.createElement('p');userPrompt.textContent='用户：请输出详细方案与代码示例。';demo.append(userPrompt);
function mockReply(id,chapters){
 const article=document.createElement('article');article.dataset.demoReply=id;article.tabIndex=0;
 article.style.cssText='margin:10px 0;padding:10px;border:1px solid #94a3b8;border-radius:8px';
 const h=document.createElement('h2');h.textContent='AI 回答 '+id;article.append(h);
 for(let i=1;i<=chapters;i++){
  const section=document.createElement('section');section.dataset.demoSection=''+i;
  const title=document.createElement('h3');title.textContent='第 '+i+' 章 · 分析与验证';
  const p=document.createElement('p');p.textContent='已加载在 DOM 内的第 '+i+' 章，包含技术方案、注意事项和验证步骤。无需纵向拖动长文本选区。';
  section.append(title,p);article.append(section);
 }
 demo.append(article);return article;
}
mockReply('A',36);mockReply('B',4);
document.body.append(demo);
function demoMarkdown(reply,section){
 if(section)return '## 第 '+section+' 章 · 分析与验证\n\n已选择下一级内容容器。\n';
 const count=reply==='A'?36:4;
 const fence=String.fromCharCode(96).repeat(3);
 return ['# AI 回答 '+reply,'','> UI_PREVIEW_ONLY：仅用于交互演示。','',
  ...Array.from({length:count},(_,i)=>[
   '## 第 '+(i+1)+' 章 · 分析与验证','',
   '已加载内容包含 **重要结论**、[参考链接](https://example.com/docs) 以及验证步骤。','',
   ...(i===1?[fence+'js','const result = await verify();',fence,'']:[]),
   ...(i===2?['| 项目 | 状态 |','| --- | --- |','| 区域点选 | 支持 |','']:[])
  ].join('\n'))].join('\n')+'\n';
}
function previewPick(id){
 if(pendingRegion)pendingRegion.cancel('已开始新的点选');
 return new Promise((resolve,reject)=>{
  let active=null,level=0,done=false;
  const clear=()=>{
   document.removeEventListener('mousemove',hover,true);
   document.removeEventListener('pointermove',hover,true);
   document.removeEventListener('click',click,true);
   document.removeEventListener('keydown',key,true);
   if(active?.node)active.node.style.outline='';
   if(pendingRegion?.id===id)pendingRegion=null;
  };
  const finish=(error,result)=>{if(done)return;done=true;clear();error?reject(error):resolve(result);};
  const hover=e=>{
   const article=e.target.closest?.('[data-demo-reply]');
   if(!article)return;
   if(active?.node)active.node.style.outline='';
   const sub=e.target.closest('[data-demo-section]');
   const node=level===1&&sub?sub:article;
   node.style.outline='3px solid #2563eb';
   active={article,sub,node};
  };
  const deliver=()=>{
   if(!active?.article)return;
   if(regionCase==='oversize')return finish(reason('E_BODY_LIMIT','演示：内容超过 160,000 字节，未截断保存'));
   if(regionCase==='failure')return finish(reason('E_CLIP_READ','演示：网页区域读取失败'));
   const markdown=demoMarkdown(active.article.dataset.demoReply,active.node===active.sub?active.sub.dataset.demoSection:null);
   send('模拟点选成功（非真实 Chrome）',enc.encode(markdown).length);
   finish(null,{markdown,title:pageTitle(),site:new URL(source).hostname,source,capturedAt:new Date().toISOString(),
    mode:'clip.region',loadedOnly:true,streaming:regionCase==='streaming'});
  };
  const click=e=>{
   if(!e.target.closest?.('[data-demo-reply]'))return;
   e.preventDefault();e.stopImmediatePropagation();hover(e);deliver();
  };
  const key=e=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(reason('E_CANCELLED','演示：Esc 取消区域点选'));return;}
   if(e.key==='Enter'||e.key===' '){
    e.preventDefault();e.stopPropagation();
    if(document.activeElement?.closest?.('[data-demo-reply]'))hover({target:document.activeElement});
    deliver();return;
   }
   if(['ArrowUp','ArrowDown'].includes(e.key)){
    level=e.key==='ArrowDown'?1:0;
    if(active){if(active.node)active.node.style.outline='';
     active.node=level&&active.sub?active.sub:active.article;
     active.node.style.outline='3px solid #2563eb';}
    e.preventDefault();e.stopPropagation();
   }
  };
  pendingRegion={id,cancel:message=>finish(reason('E_CANCELLED',message))};
  document.addEventListener('mousemove',hover,true);
  document.addEventListener('pointermove',hover,true);
  document.addEventListener('click',click,true);
  document.addEventListener('keydown',key,true);
  send('正在模拟区域点选，UI_PREVIEW_ONLY');
 });
}

globalThis.OpenDeskTool={
 root:document.querySelector('.clip'),
 setState({dirty,busy}={}){post('edit-state',{dirty:dirty===true,busy:busy===true});},
 setNavigation({page}={}){post('navigation-state',{page});},
 async request(operation,args={}){
  if(latencyMs&&operation.startsWith('clipNotes.'))await new Promise(resolve=>setTimeout(resolve,latencyMs));
  if(operation==='clip.region.cancel'){
    const cancelled=pendingRegion?.id===args.pickId;
    if(cancelled)pendingRegion.cancel('演示：已取消区域点选');
    return {cancelled};
   }
   if(operation==='clip.region'){
    if(regionCase==='denied')throw reason('E_PERMISSION_DENIED','演示：当前网站拒绝区域读取');
    return await previewPick(args.pickId);
   }
   if(['clip.article','clip.selection','clip.link'].includes(operation)){
   const another=source.includes('next-page');
    const markdown=operation==='clip.article'?(another?'# 新网页文章\n\n本页是新的网页快照。\n':sample):
     operation==='clip.selection'?(another?'来自新网页的选区内容。\n':selection):
     '['+pageTitle()+']('+source+')\n';
    send('提取模拟网页内容',enc.encode(markdown).length);
   return {markdown,title:pageTitle(),site:new URL(source).hostname,source,capturedAt:'2026-10-20T00:00:00.000Z',mode:operation};
  }
  if(operation==='currentPage.info')return {status:'available',title:pageTitle(),url:source};
  if(operation.startsWith('clipNotes.')){
   const method=operation.slice('clipNotes.'.length),lib=safeLibrary(),at=new Date().toISOString();
   const compare=()=>{if(args.ifMatch!==etag(lib))throw reason('E_STORAGE_CONFLICT','演示：另一窗口已修改');};
   if(method==='list'){
    const words=String(args.query||'').toLowerCase().split(/\s+/).filter(Boolean);
    const kind=args.kind||'all';
    if(!['all','clip','note'].includes(kind))throw reason('E_SCHEMA','演示：筛选类型无效');
    const matched=lib.items.filter(item=>(kind==='all'||item.kind===kind)&&words.every(w=>[item.title,item.source,item.body].some(t=>t.toLowerCase().includes(w))))
     .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.createdAt.localeCompare(a.createdAt));
    const offset=args.offset||0,page=matched.slice(offset,offset+50);
    return {items:page.map(summary),total:lib.items.length,matched:matched.length,
      nextOffset:offset+page.length<matched.length?offset+page.length:null,
      usedBytes:size(lib),limits:{bodyBytes:bodyLimit,totalBytes:limit,maxNotes:1000},etag:etag(lib)};
   }
   if(method==='get'){
    const item=lib.items.find(x=>x.id===args.id);
    if(!item)throw reason('E_NOT_FOUND','演示：摘录不存在');
    return {item,etag:etag(lib)};
   }
   if(method==='backup'){send('模拟导出备份（未生成文件）',size(lib));return {started:true,count:lib.items.length};}
   const items=lib.items.slice();
   let result;
   if(method==='save'){
    if(typeof args.body!=='string'||!args.body.trim())throw reason('E_EMPTY','正文不能为空');
    if(enc.encode(args.body).length>bodyLimit)throw reason('E_BODY_LIMIT','正文超过 160,000 字节');
    const kind=args.kind==='note'?'note':'clip',source=kind==='note'?'':args.source;
    const duplicate=items.find(x=>x.kind==='clip'&&kind==='clip'&&x.source===source&&x.body===args.body);
    if(duplicate)return {id:duplicate.id,duplicate:true};
    if(items.length>=1000)throw reason('E_QUOTA','演示：1000 条已满');
    const id=atom();
    items.push({id,kind,body:args.body,source,title:args.title||titleOf(args.body),createdAt:at,updatedAt:at});
    result={id,duplicate:false};
   }else if(method==='edit'){
    compare();
    const i=items.findIndex(x=>x.id===args.id);
    if(i<0)throw reason('E_NOT_FOUND','演示：记录不存在');
    if(enc.encode(args.body).length>bodyLimit)throw reason('E_BODY_LIMIT','正文超过 160,000 字节');
    if(!args.body.trim())throw reason('E_EMPTY','正文不能为空');
    if(items[i].body===args.body)return {id:args.id,unchanged:true};
    items[i]={...items[i],body:args.body,title:items[i].kind==='note'?titleOf(args.body):items[i].title,updatedAt:at};
    result={id:args.id,unchanged:false};
   }else if(method==='remove'){
    compare();
    const i=items.findIndex(x=>x.id===args.id);
    if(i<0)throw reason('E_NOT_FOUND','演示：记录不存在');
    items.splice(i,1);result={id:args.id,removed:true};
   }else throw reason('E_UNSUPPORTED','不支持的演示操作');
   const next={version:1,items};
   if(size(next)>limit||caseName==='quota')throw reason('E_QUOTA','演示：摘录库已达到 4 MiB');
   if(caseName==='failure')throw reason('E_HOST_STORAGE_WRITE','演示：Host 写入失败');
   local.clips=JSON.parse(JSON.stringify(next));persist();writes++;
   send('模拟摘录写入（临时演示数据，非 Chrome 工具存储）',size(next));
   if(caseName==='unknown'){caseName='normal';throw reason('E_OUTCOME_UNKNOWN','演示：回执丢失');}
   return result;
  }
  throw reason('E_UNSUPPORTED','预览不支持 '+operation);
 }
};
globalThis.OpenDeskSDK={browser:{
 launch:{async consume(){
  if(!new URLSearchParams(location.search).has('launch'))throw reason('E_LAUNCH_EXPIRED','演示未触发右键');
  send('模拟右键选区交付（非真实 Chrome）',enc.encode(selection).length);
  return {toolId:'web-markdown-clipper',actionId:'save-selection',selection,
   source:{url:source},expiresAt:Date.now()+60000};
 }},
 clipboard:{async writeText(text){
  send('模拟复制（未写入系统剪贴板）',enc.encode(text).length);
  return {copied:true};
 }},
 downloads:{async text({text}){
  send('模拟下载（未创建磁盘文件）',enc.encode(text).length);
  return {started:true};
 }}
}};
window.addEventListener('message',({source:sender,origin,data})=>{
 if(sender!==parent||origin!==parentOrigin||!instance||data?.protocol!==protocol||
    data.toolId!==toolId||data.instance!==instance)return;
 if(data.kind==='navigation-action'){
  if(['back','primary'].includes(data.action))
   document.querySelector('.clip').dispatchEvent(
    new CustomEvent('opendesk-tool-navigation',{detail:{action:data.action}}));
  return;
 }
 if(data.kind!=='control')return;
 if([0,240,400].includes(data.latencyMs))latencyMs=data.latencyMs;
 if(data.theme==='dark'||data.theme==='light')document.documentElement.dataset.demoTheme=data.theme;
 if(data.zoom===1||data.zoom===2){
  document.body.style.zoom=String(data.zoom);
  document.documentElement.style.setProperty('--preview-zoom',String(data.zoom));
  document.documentElement.dataset.demoZoom=String(data.zoom);
 }
 if(['normal','quota','failure','unknown'].includes(data.storageCase)){
  caseName=data.storageCase;
  send('模拟存储场景：'+caseName+'（非浏览器真实写入）');
 }
 if(data.reset===true){
   source=source.includes('next-page')?'https://example.com/articles/markdown-clipper':'https://example.org/next-page';
   document.querySelector('.clip').dispatchEvent(new Event('opendesk-page-changed'));
   send('模拟切换网页（四种模式旧缓存全部失效）');
  }
});
})();
