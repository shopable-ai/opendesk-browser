export const DEMO_FILES={
  'README.md':'# 把想法变成可以预览的文件\n\n在 ChatGPT 旁边编辑项目，**文件仍由你掌控**。\n\n## 这个 Demo 可以做什么\n\n- 阅读和编辑 Markdown、HTML 与代码文件\n- 保存前检查文件版本，保留未保存的草稿\n- 在侧边栏查看预览，或将静态预览放到目标网页\n\n## 一次完整的修改\n\n1. 打开左侧文件\n2. 在源码区修改一行内容\n3. 点击保存，再查看渲染结果\n\n> 当前独立演示使用内存文件。扩展中的同一界面通过 OpenDesk Native Host 读写已授权目录。\n\n| 文件类型 | 如何预览 |\n| --- | --- |\n| Markdown | 基础 Markdown 渲染 |\n| HTML | 隔离的静态页面 |\n| Next.js | 连接本机开发服务 |\n\n```js\n// 文件操作与模型工具接入是两个独立的层次。\nconst idea = "让修改及时可见";\n```\n',
  'index.html':'<!doctype html>\n<html lang="zh-CN">\n<head><meta charset="utf-8"><style>\nbody{margin:0;background:#eff5f4;color:#15332e;font-family:system-ui,sans-serif}main{padding:28px;max-width:640px;margin:auto}.eyebrow{font-size:11px;letter-spacing:3px;color:#50776e}h1{font-size:42px;line-height:1.2;letter-spacing:-2px;margin:25px 0}p{line-height:1.9;color:#4d6a63}.pill{display:inline-block;padding:9px 16px;background:#214e43;color:white;border-radius:24px;font-size:13px}.line{border-top:1px solid #c7dbd3;margin:28px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}.tile{padding:20px;border:1px solid #cee0d8;border-radius:12px;background:#f8fbf9}.tile strong{display:block;margin-bottom:8px}.tile span{font-size:12px;color:#57746b}\n</style></head>\n<body><main>\n<div class="eyebrow">OPENDESK · LOCAL STUDIO</div>\n<h1>从一句想法，<br>到眼前的作品。</h1>\n<p>对话、修改、预览。<br>让每一次小改变，都在自己的工作区发生。</p>\n<span class="pill">正在预览本地 HTML</span>\n<div class="line"></div>\n<div class="grid"><div class="tile"><strong>01 · 写下来</strong><span>Markdown 文档与项目代码</span></div><div class="tile"><strong>02 · 看见它</strong><span>独立、清晰的实时静态预览</span></div></div>\n</main></body></html>\n',
  'notes.txt':'演示笔记\n\n把新的想法写在这里，然后点击保存。\n\n此独立演示不会访问电脑文件，也不会向 ChatGPT 自动发送内容。\n',
  'app/page.tsx':'export default function Home() {\n  return (\n    <main style={{ padding: 40, fontFamily: "system-ui" }}>\n      <h1>Hello, OpenDesk</h1>\n      <p>修改文件后，由本机 Next.js 开发服务负责渲染和热更新。</p>\n    </main>\n  );\n}\n'
};
export async function textSHA256(content){
  const buffer=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content));
  return [...new Uint8Array(buffer)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function createMemoryWorkspace(){
  const files=new Map(Object.entries(DEMO_FILES));
  const fail=(code,message)=>{throw {code,message,outcome:'NOT_DISPATCHED'};};
  return {demo:true,state:async()=>({connected:true,supported:true,maxContentBytes:32768}),async request(method,params={}){
    if(method==='workspaces.list')return {workspaces:[{workspaceId:'demo-workspace',name:'我的创作工作区',access:'read-write'}]};
    if(params.workspaceId!=='demo-workspace')return fail('E_FILES_ACCESS','工作区不存在');
    const path=params.path||'';
    if(path.startsWith('/')||path.split('/').some(p=>p==='..'||p.startsWith('.'))||path.includes('\\'))return fail('E_FILES_PATH','请使用工作区内的相对路径');
    if(method==='files.list'){
      const prefix=path?path+'/':'',entries=new Map();
      for(const [name,content] of files){if(!name.startsWith(prefix))continue;const part=name.slice(prefix.length).split('/')[0];
        entries.set(part,{name:part,path:prefix+part,kind:name.slice(prefix.length).includes('/')?'directory':'file',bytes:new TextEncoder().encode(content).length});}
      return {workspaceId:params.workspaceId,path,entries:[...entries.values()],truncated:false};
    }
    if(method==='files.read'){
      if(!files.has(path))return fail('E_FILES_NOT_FOUND','文件不存在');
      const content=files.get(path);return {workspaceId:params.workspaceId,path,content,sha256:await textSHA256(content),bytes:new TextEncoder().encode(content).length};
    }
    if(!['files.write','files.create'].includes(method))return fail('E_SCHEMA','不支持的操作');
    if(!path||typeof params.content!=='string'||new TextEncoder().encode(params.content).length>32768)return fail('E_FILES_LIMIT','文本最多 32 KiB');
    if(method==='files.create'&&files.has(path))return fail('E_FILES_EXISTS','该文件已存在');
    if(method==='files.write'&&(!files.has(path)||params.expectedSha256!==await textSHA256(files.get(path))))return fail('E_FILES_CONFLICT','文件已被其他编辑器修改，草稿已保留');
    files.set(path,params.content);return {workspaceId:params.workspaceId,path,sha256:await textSHA256(params.content),bytes:new TextEncoder().encode(params.content).length,saved:true,...(method==='files.create'?{created:true}:{})};
  }};
}
