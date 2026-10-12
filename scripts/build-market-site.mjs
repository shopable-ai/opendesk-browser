// Deterministic inputs and a complete output tree; never reuse stale dist pages.
import {mkdir,writeFile,readFile,rename,rm,readdir,lstat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {OFFICIAL_COLLECTIONS,officialMarketApps} from '../src/marketplace/catalog.js';
import {createOfficialToolResources,officialToolInputs} from './build-official-tools.mjs';
import {resolveMarketChannel,marketOrigin} from './market-channel.mjs';
import {loadMarketSnapshots,mergeMarketReleases} from './market-release-snapshots.mjs';
import {layout,home,appDetail,appPath,collectionPath,collectionList,collectionDetail,
  installPage,installPath,helpPage,escapeHTML} from '../src/market-site/templates.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function filesAt(root,prefix=''){
  const names=[];
  for(const row of await readdir(resolve(root,prefix),{withFileTypes:true})){
    const path=prefix?prefix+'/'+row.name:row.name;
    if(row.isSymbolicLink())throw Error('Symlink forbidden in market input/output: '+path);
    if(row.isDirectory())names.push(...await filesAt(root,path));
    else if(row.isFile())names.push(path);else throw Error('Unexpected market resource: '+path);
  }
  return names.sort();
}
async function inputIdentity(){
  const paths=[...await officialToolInputs()];
  for(const dir of ['src/market-site','official-tools/releases'])paths.push(...(await filesAt(dir)).map(p=>dir+'/'+p));
  paths.push('src/ui/design-tokens.css','src/marketplace/catalog.js','src/marketplace/channel-config.json',
    'scripts/build-market-site.mjs','scripts/market-channel.mjs','scripts/market-release-snapshots.mjs','scripts/build-official-tools.mjs','package-lock.json');
  return Promise.all([...new Set(paths)].sort().map(async path=>{const bytes=await readFile(path);return {path,bytes:bytes.length,sha256:hash(bytes)};}));
}
export const MARKET_HEADERS={
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
};
export async function buildMarketSite({env=process.env}={}){
  const mode=env.OPENDESK_MARKET_BUILD_MODE||'development';
  const channel=resolveMarketChannel({mode,env});
  // Legacy deployment metadata never opens installation trust by itself.
  const metadataOrigin=env.OPENDESK_MARKET_SITE_ORIGIN?marketOrigin(env.OPENDESK_MARKET_SITE_ORIGIN,'production'):null;
  if(channel.enabled&&metadataOrigin&&metadataOrigin!==channel.origin)throw Error('Deployment metadata differs from the controlled installation origin');
  const origin=metadataOrigin||channel.origin;
  const dest=resolve(env.OPENDESK_MARKET_SITE_OUTPUT||'dist/app-market-public'),repo=resolve('.');
  if(dest===repo||['src','scripts','official-tools','.git','dist/production','dist/development'].some(p=>dest===resolve(p)||dest.startsWith(resolve(p)+'/')))
    throw Error('Market output may not replace source or extension packages');
  const before=await inputIdentity(),official=await createOfficialToolResources();
  const archived=mergeMarketReleases(await loadMarketSnapshots(),official.catalog,OFFICIAL_COLLECTIONS);
  const current=officialMarketApps(official.catalog),releases=archived.releases.map(row=>{
    const app=officialMarketApps({apps:[row]})[0];
    return current.some(r=>r.id===row.id&&r.version===row.version)?app:{...app,summary:row.description};
  });
  const stage=dest+'.building-'+randomUUID(),outputFiles=[];
  await mkdir(stage,{recursive:true});
  const write=async(path,bytes)=>{
    if(!/^[a-zA-Z0-9_./-]+$/.test(path)||path.startsWith('/')||path.includes('..')||path.includes('//'))throw Error('Invalid generated market path: '+path);
    const target=resolve(stage,path);if(!target.startsWith(stage+'/'))throw Error('Output traversal');
    await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);outputFiles.push({path,bytes:Buffer.byteLength(bytes),sha256:hash(bytes)});
  };
  const routes=[],page=async(path,title,description,body,section='apps')=>{
    if(path!=='/'&&!/^\/[a-z0-9/.-]+\/$/.test(path))throw Error('Invalid market route');
    if(routes.includes(path))throw Error('Duplicate market route '+path);
    routes.push(path);await write(path.slice(1)+'index.html',layout({title,description,body,path,channel,origin,section}));
  };
  try{
    for(const [input,path] of [['src/market-site/market.css','market.css'],['src/market-site/client.js','client.js'],['src/ui/design-tokens.css','design-tokens.css']])await write(path,await readFile(input));
    await write('channel.json',JSON.stringify(channel,null,2)+'\n');
    await write('catalog.json',JSON.stringify({format:'opendesk.market.public.v1',releases:archived.releases,
      recommended:official.catalog.apps.map(({id,version})=>({id,version})),collections:archived.collections},null,2)+'\n');
    const mediaFiles=before.filter(row=>row.path.startsWith('src/market-site/media/'));
    for(const file of mediaFiles){if(!/^[a-z0-9.-]+\.png$/.test(file.path.split('/').at(-1)))throw Error('Only reviewed PNG screenshots are supported');await write(file.path.replace('src/market-site/',''),await readFile(file.path));}
    await page('/','官方应用','发现 OpenDesk 官方应用，查看用途、运行位置与固定版本，在可信扩展页面审阅安装。',home(current));
    for(const app of releases){
      const live=current.find(row=>row.id===app.id),versions=releases.filter(row=>row.id===app.id).sort((a,b)=>b.version.localeCompare(a.version,undefined,{numeric:true}));
      const media='/media/'+app.toolId+'-'+app.version+'.png';
      const options={current:live,versions,media:mediaFiles.some(row=>row.path==='src/market-site'+media)?media:null};
      await page(appPath(app),app.title+' v'+app.version,app.description,appDetail(app,options));
      if(app.version===live?.version)await page(appPath(app,false),app.title,app.summary,appDetail(app,{...options,fixed:false}));
      const subject={kind:'app',marketId:app.id,version:app.version};
      await page(installPath(subject),'安装 '+app.title+' v'+app.version,'在 OpenDesk 中审阅此固定应用版本。',installPage(subject,app.title));
    }
    // A historically pinned collection can outlive available release evidence.
    // Preserve its share route as an explicit missing-evidence page, never invent
    // a package digest/description or substitute the current version.
    const unresolved=new Map();
    for(const col of archived.collections)for(const member of col.members)
      if(!releases.some(row=>row.id===member.id&&row.version===member.version))unresolved.set(member.id+'@'+member.version,member);
    for(const member of unresolved.values()){
      const title=current.find(row=>row.id===member.id)?.title||member.id;
      const subject={kind:'app',marketId:member.id,version:member.version};
      await page(appPath(member),title+' v'+member.version+' · 发行记录待核对','此固定版本来自历史套装引用，缺少完整发行快照。',
        '<section class="hero"><p class="eyebrow">历史套装引用 · 固定版本</p><h1>'+escapeHTML(title)+' v'+escapeHTML(member.version)+'</h1><p class="lead">此版本记录在官方固定套装中，但当前归档缺少可核验的完整发行快照。</p><p>不会用当前版本代替，也不会编造摘要或发行说明。扩展可信页会核对其实际包含的固定版本。</p><div class="actions"><a class="button primary" href="'+installPath(subject)+'">在扩展中核对此版本</a><a href="/collections/">查看套装记录</a></div></section>');
      await page(installPath(subject),'核对 '+title+' v'+member.version,'核对历史套装引用中的固定版本；不保证当前扩展包含该包。',installPage(subject,title));
    }
    await page('/collections/','官方套装','固定应用组合与不可变 revision。',collectionList(archived.collections),'collections');
    for(const col of archived.collections){
      await page(collectionPath(col),col.title+' · revision '+col.revision,col.description,collectionDetail(col,{releases:archived.releases,current:official.catalog.apps}),'collections');
      const subject={kind:'collection',collectionId:col.id,revision:col.revision};
      await page(installPath(subject),'安装 '+col.title+' · revision '+col.revision,'逐项审阅固定版本套装。',installPage(subject,col.title),'collections');
    }
    await page('/how-to-install/','安装与连接帮助','获取 OpenDesk 主扩展、连接市场、审阅应用与处理安装异常。',helpPage(channel),'help');
    await write('404.html',layout({title:'页面不存在',description:'请检查应用与固定版本地址。',body:'<section class="hero"><h1>找不到这个页面</h1><p class="lead">请检查链接。已有固定版本不会自动改为其他版本。</p><p><a href="/">返回应用市场</a></p></section>',path:'/404.html',channel,origin}));
    await write('_headers','/*\n'+Object.entries({...MARKET_HEADERS,...(mode==='production'?{'Strict-Transport-Security':'max-age=31536000'}:{})}).map(([key,value])=>'  '+key+': '+value).join('\n')+'\n');
    await write('robots.txt','User-agent: *\n'+(mode==='development'?'Disallow: /\n':'Allow: /\n')+(origin?'Sitemap: '+origin+'/sitemap.xml\n':''));
    await write('sitemap.xml','<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+(origin?routes.filter(p=>!p.startsWith('/install/')).map(p=>'<url><loc>'+escapeHTML(origin+p)+'</loc></url>').join(''):'')+'</urlset>\n');
    const after=await inputIdentity();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Market inputs changed during build');
    const manifest={schema:'opendesk.market.build.v1',mode,channel,origin,apps:current.length,archivedReleases:releases.length,unresolvedReleaseReferences:[...unresolved.values()],
      externalInstall:channel.enabled?'CONFIGURED':'NOT_CONFIGURED',routes,sourceInputs:before,
      sourceFingerprint:hash(JSON.stringify(before)),catalogSha256:hash(JSON.stringify(official.catalog)),
      files:outputFiles.sort((a,b)=>a.path.localeCompare(b.path))};
    manifest.buildId=hash(JSON.stringify(manifest));
    await writeFile(resolve(stage,'site-build.json'),JSON.stringify(manifest,null,2)+'\n');
    let old=null;
    try{
      const stat=await lstat(dest);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Invalid existing market output');
      const names=await readdir(dest);
      if(names.length){
        const marker=JSON.parse(await readFile(resolve(dest,'catalog.json'),'utf8'));
        if(marker.format!=='opendesk.market.public.v1')throw Error('Refusing to replace an unrecognized directory');
      }
      old=dest+'.previous-'+randomUUID();await rename(dest,old);
    }catch(error){if(error.code!=='ENOENT')throw error;}
    try{await rename(stage,dest);}catch(error){if(old)await rename(old,dest);throw error;}
    if(old)await rm(old,{recursive:true,force:true});
    return {output:dest,buildId:manifest.buildId,apps:current.length,releases:releases.length,origin,mode,
      extensionId:channel.extensionId,externalInstall:manifest.externalInstall};
  }catch(error){await rm(stage,{recursive:true,force:true});throw error;}
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)console.log(JSON.stringify(await buildMarketSite()));
