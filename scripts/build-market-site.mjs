// Deployable static public catalogue. No extension bridge until official HTTPS
// origin and production extension ID are configured and allowlisted.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {OFFICIAL_APPS,OFFICIAL_COLLECTIONS,getOfficialApp,officialPackagePath} from '../src/marketplace/catalog.js';
import {validateSidebarToolPackage} from '../src/ui/sidebar-tools/package.js';

const dest=resolve(process.env.OPENDESK_MARKET_SITE_OUTPUT||'dist/app-market-public');
const inputOrigin=process.env.OPENDESK_MARKET_SITE_ORIGIN||'';
let origin='';
if(inputOrigin){
  const u=new URL(inputOrigin);
  if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search||u.pathname!=='/'||
    u.origin!==inputOrigin.replace(/\/$/,''))throw Error('Expected a bare HTTPS origin');
  origin=u.origin;
}
const esc=s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const appUrl=app=>'/apps/'+app.id+'/versions/'+app.version+'/';
const collectionUrl=col=>'/collections/'+col.id+'/revisions/'+col.revision+'/';
const css='*{box-sizing:border-box}body{margin:0;background:#f7f9fc;color:#243047;font:15px/1.6 system-ui,sans-serif}a{color:#345fc8}nav{display:flex;gap:20px;flex-wrap:wrap;align-items:center}main{padding:24px 0}.shell{max-width:950px;margin:auto;padding:25px 20px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.card{border:1px solid #dce5f0;background:#fff;border-radius:12px;padding:17px;margin:12px 0}h1{font-size:clamp(24px,4vw,38px)}h2{font-size:19px}.action{display:inline-block;background:#365eda;color:#fff;border-radius:9px;padding:9px 15px;text-decoration:none}footer{font-size:12px;color:#62738b;border-top:1px solid #dce5f0;padding-top:22px}@media(prefers-color-scheme:dark){body{background:#182130;color:#e9effd}.card{background:#263449;border-color:#435269}a{color:#b2c4ff}}';
function html(title,description,body,path=''){
 const canonical=origin&&path?origin+path:null;
 return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'+
 '<meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+' · OpenDesk</title>'+
 '<meta name="description" content="'+esc(description)+'">'+
 '<meta property="og:title" content="'+esc(title)+'"><meta property="og:description" content="'+esc(description)+'">'+
 (canonical?'<link rel="canonical" href="'+esc(canonical)+'"><meta property="og:url" content="'+esc(canonical)+'">':'')+
 '<link rel="stylesheet" href="/market.css"></head><body><div class="shell"><nav><strong>OpenDesk 应用市场</strong> '+
 '<a href="/">应用</a><a href="'+collectionUrl(OFFICIAL_COLLECTIONS[0])+'">官方套装</a><a href="/how-to-install/">安装说明</a></nav>'+
 '<main>'+body+'</main><footer>本网站仅展示和分享，不安装或运行插件代码、不读取用户网站或个人数据。实际安装须在 OpenDesk 扩展内确认。</footer></div></body></html>';
}
async function page(path,contents){
 if(!/^\/[a-z0-9/.-]*\/$/.test(path)||path.includes('..')||path.includes('//'))
   throw Error('Invalid route '+path);
 const out=resolve(dest,'.'+path,'index.html');
 if(!out.startsWith(dest+'/'))throw Error('Output traversal');
 await mkdir(dirname(out),{recursive:true});await writeFile(out,contents);
}
await mkdir(dest,{recursive:true});
await writeFile(resolve(dest,'market.css'),css+'\n');
const releases=[];
for(const app of OFFICIAL_APPS){
 const bytes=await readFile('src/'+officialPackagePath(app));
 const tool=validateSidebarToolPackage(JSON.parse(bytes.toString('utf8')));
 if(tool.id!==app.toolId||tool.version!==app.version||tool.title!==app.title)throw Error('Release mismatch: '+app.id);
 releases.push({id:app.id,toolId:tool.id,version:tool.version,
   sha256:createHash('sha256').update(bytes).digest('hex')});
}
await writeFile(resolve(dest,'catalog.json'),JSON.stringify({format:'opendesk.market.public.v1',releases,
 collections:OFFICIAL_COLLECTIONS},null,2)+'\n');
await page('/',html('官方应用','可浏览的 OpenDesk 官方应用目录',
 '<h1>让你的浏览器更好用</h1><p>固定版本、清晰权限、用户确认安装。</p><div class="cards">'+
 OFFICIAL_APPS.map(app=>'<article class="card"><small>'+esc(app.category)+'</small><h2><a href="'+appUrl(app)+'">'+
 esc(app.title)+'</a></h2><p>'+esc(app.summary)+'</p></article>').join('')+'</div>','/'));
for(const app of OFFICIAL_APPS){
 const install='/install/'+app.id+'/versions/'+app.version+'/';
 const body='<h1>'+esc(app.title)+'</h1><p>'+esc(app.summary)+'</p><div class="card"><p>发布者：'+esc(app.author)+
 ' · 固定版本：'+esc(app.version)+'</p><p>适用范围：'+esc(app.sites)+'</p><p>运行位置：'+
 esc(app.surfaces.join('、'))+'</p><ul>'+app.features.map(f=>'<li>'+esc(f)+'</li>').join('')+
 '</ul></div><p><a class="action" href="'+install+'">在 OpenDesk 中安装</a></p>'+
 '<p>网页不能直接获取权限或执行安装；必须在扩展内审核。</p>';
 await page(appUrl(app),html(app.title,app.summary,body,appUrl(app)));
 await page('/apps/'+app.id+'/',html(app.title,app.summary,body,appUrl(app)));
 await page(install,html('安装 '+app.title,'安全安装固定发行版本',
 '<h1>安装 '+esc(app.title)+' · '+esc(app.version)+'</h1>'+
 '<div class="card"><p>公网安装交接尚未配置，不能判断扩展是否已安装。</p>'+
 '<p>请在 Chrome 中打开 OpenDesk →「工具」→「应用市场」→ 选择相同的名称和版本 → 审阅并确认安装。</p>'+
 '<p>安装不会自动运行或授予网站访问权。</p></div><a href="'+appUrl(app)+'">返回详情</a>'));
}
for(const col of OFFICIAL_COLLECTIONS){
 const path=collectionUrl(col),install='/install/collections/'+col.id+'/revisions/'+col.revision+'/';
 await page(path,html(col.title,col.description,
 '<h1>'+esc(col.title)+'</h1><p>'+esc(col.description)+'</p><ul>'+
 col.members.map(member=>'<li><a href="'+appUrl(getOfficialApp(member.id))+'">'+
 esc(getOfficialApp(member.id).title)+'</a> v'+esc(member.version)+'</li>').join('')+
 '</ul><p><a class="action" href="'+install+'">查看套装安装</a></p>',path));
 await page(install,html('安装 '+col.title,'固定 revision 套装安装',
 '<h1>'+esc(col.title)+' · revision '+col.revision+'</h1>'+
 '<p>请在扩展内打开官方套装，逐项预检、审阅并安装。公网不传输工具代码或网站授权。</p>'+
 '<p><a href="'+path+'">返回套装详情</a></p>'));
}
await page('/how-to-install/',html('如何安装','OpenDesk 安全安装说明',
 '<h1>如何安装</h1><ol><li>在 Chrome 中加载受信任的 OpenDesk 扩展。</li>'+
 '<li>进入 Side Panel「工具」→「应用市场」。</li>'+
 '<li>打开指定版本详情，检查来源与所需能力，确认安装；之后主动打开使用。</li></ol>'+
 '<p>公网 HTTPS → 扩展安装意图尚未启用，不能静默安装。</p>','/how-to-install/'));
if(origin){
 const paths=['/','/how-to-install/',...OFFICIAL_APPS.map(appUrl),...OFFICIAL_COLLECTIONS.map(collectionUrl)];
 await writeFile(resolve(dest,'robots.txt'),'User-agent: *\nAllow: /\nSitemap: '+origin+'/sitemap.xml\n');
 await writeFile(resolve(dest,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+
  paths.map(path=>'<url><loc>'+esc(origin+path)+'</loc></url>').join('')+'</urlset>');
}
console.log(JSON.stringify({output:dest,apps:releases.length,origin:origin||null,externalInstall:'NOT_CONFIGURED'}));
