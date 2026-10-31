// Deterministic inputs and regenerated pages; retain verified fixed release bytes.
import {mkdir,writeFile,readFile,rename,rm,readdir,lstat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {OFFICIAL_COLLECTIONS,officialMarketApps} from '../src/marketplace/catalog.js';
import {createOfficialToolResources,officialToolInputs} from './build-official-tools.mjs';
import {createSidebarToolPackage,encodeSidebarToolPackage} from './build-sidebar-tool.mjs';
import {officialPackagePath,validateOfficialReleaseCatalog,OFFICIAL_RELEASE_SCHEMA,OFFICIAL_SOURCE_REPOSITORY} from '../src/sidebar-tools/official-catalog.js';
import {validateSidebarToolPackage} from '../src/ui/sidebar-tools/package.js';
import {compareToolVersions} from '../src/ui/sidebar-tools/installation.js';
import {resolveMarketChannel,marketOrigin} from './market-channel.mjs';
import {loadMarketSnapshots,mergeMarketReleases} from './market-release-snapshots.mjs';
import {marketScreenshots} from '../src/market-site/media.mjs';
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
    'scripts/build-market-site.mjs','scripts/build-sidebar-tool.mjs','scripts/market-channel.mjs','scripts/market-release-snapshots.mjs','scripts/build-official-tools.mjs','package-lock.json');
  return Promise.all([...new Set(paths)].sort().map(async path=>{const bytes=await readFile(path);return {path,bytes:bytes.length,sha256:hash(bytes)};}));
}
export const MARKET_HEADERS={
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
};
const releaseKey=row=>row.id+'@'+row.version;
const releaseBase=row=>'/releases/'+row.id+'/'+row.version+'/';
// Previous public releases use the same snapshot/descriptor contracts as current
// inputs. A format marker alone is not evidence of immutable executable bytes.
async function previousMarketRelease(dest){
  let stat;
  try{stat=await lstat(dest);}catch(error){if(error.code==='ENOENT')return {exists:false,snapshots:[],packages:new Map()};throw error;}
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Invalid existing market output');
  const paths=await filesAt(dest);
  if(!paths.length)return {exists:true,snapshots:[],packages:new Map()};
  const manifest=JSON.parse(await readFile(resolve(dest,'site-build.json'),'utf8'));
  const {buildId,...identity}=manifest;
  if(manifest.schema!=='opendesk.market.build.v1'||buildId!==hash(JSON.stringify(identity))||!Array.isArray(manifest.files))
    throw Error('Invalid previous market build identity');
  const verified=new Map();
  for(const row of manifest.files){
    if(typeof row.path!=='string'||!paths.includes(row.path)||verified.has(row.path))
      throw Error('Invalid previous market file identity');
    const bytes=await readFile(resolve(dest,row.path));
    if(bytes.length!==row.bytes||hash(bytes)!==row.sha256)throw Error('Previous market file integrity mismatch: '+row.path);
    verified.set(row.path,bytes);
  }
  if(paths.length!==verified.size+1)throw Error('Untracked previous market output');
  const catalog=JSON.parse(verified.get('catalog.json'));
  if(catalog.format!=='opendesk.market.public.v1'||!Array.isArray(catalog.releases)||
    !Array.isArray(catalog.downloads)||!Array.isArray(catalog.unavailableReleases)||!Array.isArray(catalog.collections))throw Error('Invalid previous market catalog');
  const snapshots=catalog.releases.map((row,index)=>({schema:'opendesk.market.release-snapshot.v1',
    source:{kind:'recorded-release-evidence',identity:'sha256:'+buildId},
    catalog:validateOfficialReleaseCatalog({schema:OFFICIAL_RELEASE_SCHEMA,sourceRepository:OFFICIAL_SOURCE_REPOSITORY,apps:[row]}),
    collections:index===0?catalog.collections:[]}));
  const releases=new Map(catalog.releases.map(row=>[releaseKey(row),row])),packages=new Map();
  if(releases.size!==catalog.releases.length)throw Error('Duplicate previous market release');
  for(const descriptor of catalog.downloads){
    const key=descriptor.marketId+'@'+descriptor.version,row=releases.get(key);
    if(!row||packages.has(key))throw Error('Invalid previous market download identity');
    const expected={schema:'opendesk.market.release.v1',marketId:row.id,version:row.version,
      bytes:row.bytes,sha256:row.sha256,packagePath:releaseBase(row)+'package.opendesk-tool.json'};
    const same=value=>JSON.stringify(value)===JSON.stringify(expected);
    if(!same(descriptor)||!same(JSON.parse(verified.get(releaseBase(row).slice(1)+'descriptor.json'))))
      throw Error('Previous market descriptor identity mismatch: '+key);
    const bytes=verified.get(expected.packagePath.slice(1));
    if(!bytes||bytes.length!==row.bytes||hash(bytes)!==row.sha256)throw Error('Previous market package integrity mismatch: '+key);
    const tool=validateSidebarToolPackage(JSON.parse(bytes));
    if(tool.id!==row.toolId||tool.version!==row.version||tool.title!==row.packageTitle||
      tool.description!==row.description||JSON.stringify(tool.capabilities)!==JSON.stringify(row.capabilities))
      throw Error('Previous market package identity mismatch: '+key);
    packages.set(key,bytes);
  }
  // Downloadable releases cannot silently become metadata-only history.
  for(const row of catalog.releases){
    const unavailable=catalog.unavailableReleases.some(item=>item.id===row.id&&item.version===row.version);
    if(unavailable===packages.has(releaseKey(row)))throw Error('Invalid previous market release availability');
  }
  return {exists:true,identity:buildId,snapshots,packages};
}
async function projectPackages(projects){
  if(!Array.isArray(projects)||projects.length>64||projects.some(p=>typeof p!=='string'||!p.trim()))
    throw Error('Market projects must be an array of at most 64 project directories');
  const result=[];
  for(const project of [...new Set(projects.map(p=>resolve(p)))].sort()){
    const tool=await createSidebarToolPackage(project),bytes=encodeSidebarToolPackage(tool);
    result.push({project,bytes,row:{id:'opendesk/'+tool.id,toolId:tool.id,kind:'sidebar-tool',installationPolicy:'optional',
      version:tool.version,packageTitle:tool.title,description:tool.description,capabilities:tool.capabilities,
      packagePath:officialPackagePath(tool.id),bytes:bytes.length,sha256:hash(bytes)}});
  }
  return result;
}
export async function buildMarketSite({env=process.env,projects=[]}={}){
  const mode=env.OPENDESK_MARKET_BUILD_MODE||'development';
  const channel=resolveMarketChannel({mode,env});
  // Legacy deployment metadata never opens installation trust by itself.
  const metadataOrigin=env.OPENDESK_MARKET_SITE_ORIGIN?marketOrigin(env.OPENDESK_MARKET_SITE_ORIGIN,'production'):null;
  if(channel.enabled&&metadataOrigin&&metadataOrigin!==channel.origin)throw Error('Deployment metadata differs from the controlled installation origin');
  const origin=metadataOrigin||channel.origin;
  const dest=resolve(env.OPENDESK_MARKET_SITE_OUTPUT||'dist/app-market-public'),repo=resolve('.');
  if(dest===repo||['src','scripts','official-tools','.git','dist/production','dist/development'].some(p=>dest===resolve(p)||dest.startsWith(resolve(p)+'/')))
    throw Error('Market output may not replace source or extension packages');
  const before=await inputIdentity(),official=await createOfficialToolResources(),external=await projectPackages(projects);
  if(external.some(({project})=>dest===project||dest.startsWith(project+'/')||project.startsWith(dest+'/')))
    throw Error('Market output may not replace or contain a project input');
  // Reuse the fixed-release conflict and metadata validator for every supplied
  // version, including multiple versions of the same independent project.
  const previous=await previousMarketRelease(dest),snapshots=await loadMarketSnapshots();
  for(const {project,row} of external)snapshots.push({schema:'opendesk.market.release-snapshot.v1',
    source:{kind:'official-builder',identity:'sha256:'+hash(project)},
    catalog:{...official.catalog,apps:[row]},collections:[]});
  snapshots.push(...previous.snapshots);
  const archived=mergeMarketReleases(snapshots,official.catalog,OFFICIAL_COLLECTIONS);
  const packages=new Map(previous.packages);
  for(const row of official.catalog.apps)packages.set(releaseKey(row),official.resources.get(row.packagePath));
  for(const {row,bytes} of external)packages.set(releaseKey(row),bytes);
  const latest=new Map(official.catalog.apps.map(row=>[row.id,row]));
  for(const row of archived.releases.filter(row=>packages.has(releaseKey(row)))){
    const prior=latest.get(row.id);
    if(!prior||compareToolVersions(row.version,prior.version)>0)latest.set(row.id,row);
  }
  const media=await marketScreenshots({index:JSON.parse(await readFile('src/market-site/media-index.json','utf8')),
    releases:archived.releases,readScreenshot:filename=>readFile('src/market-site/media/'+filename)});
  const expectedMedia=media.map(row=>'src/market-site/media/'+row.filename).sort();
  if(JSON.stringify(before.filter(row=>row.path.startsWith('src/market-site/media/')).map(row=>row.path).sort())!==JSON.stringify(expectedMedia))
    throw Error('Every screenshot must have exactly one reviewed provenance entry');
  const current=officialMarketApps({apps:[...latest.values()]}).map(row=>({...row,downloadable:true})),releases=archived.releases.map(row=>{
    const app={...officialMarketApps({apps:[row]})[0],downloadable:packages.has(releaseKey(row))};
    return current.some(r=>r.id===row.id&&r.version===row.version)?app:{...app,summary:row.description};
  });
  const stage=dest+'.building-'+randomUUID(),outputFiles=[];
  const clientRevision=hash(await readFile('src/market-site/client.js'));
  await mkdir(stage,{recursive:true});
  const write=async(path,bytes)=>{
    if(!/^[a-zA-Z0-9_./-]+$/.test(path)||path.startsWith('/')||path.includes('..')||path.includes('//'))throw Error('Invalid generated market path: '+path);
    const target=resolve(stage,path);if(!target.startsWith(stage+'/'))throw Error('Output traversal');
    await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);outputFiles.push({path,bytes:Buffer.byteLength(bytes),sha256:hash(bytes)});
  };
  const routes=[],page=async(path,title,description,body,section='apps',installSubject=null)=>{
    if(path!=='/'&&!/^\/[a-z0-9/.-]+\/$/.test(path))throw Error('Invalid market route');
    if(routes.includes(path))throw Error('Duplicate market route '+path);
    routes.push(path);await write(path.slice(1)+'index.html',layout({title,description,body,path,channel,origin,section,installSubject,clientRevision}));
  };
  try{
    for(const [input,path] of [['src/market-site/market.css','market.css'],['src/market-site/client.js','client.js'],['src/ui/design-tokens.css','design-tokens.css']])await write(path,await readFile(input));
    await write('channel.json',JSON.stringify(channel,null,2)+'\n');
    const downloads=[];
    for(const row of archived.releases){
      const bytes=packages.get(releaseKey(row));
      if(!bytes)continue; // Metadata-only snapshots never acquire invented bytes.
      if(bytes.length!==row.bytes||hash(bytes)!==row.sha256)throw Error('Market package identity mismatch: '+releaseKey(row));
      const base=releaseBase(row),descriptor={schema:'opendesk.market.release.v1',marketId:row.id,
        version:row.version,bytes:row.bytes,sha256:row.sha256,packagePath:base+'package.opendesk-tool.json'};
      await write(base.slice(1)+'descriptor.json',JSON.stringify(descriptor,null,2)+'\n');
      await write(descriptor.packagePath.slice(1),bytes);
      downloads.push(descriptor);
    }
    await write('catalog.json',JSON.stringify({format:'opendesk.market.public.v1',releases:archived.releases,
      downloads,unavailableReleases:releases.filter(row=>!row.downloadable).map(({id,version})=>({id,version})),
      recommended:[...latest.values()].map(({id,version})=>({id,version})),collections:archived.collections},null,2)+'\n');
    for(const file of media)await write('media/'+file.filename,file.bytes);
    await page('/','应用','发现 OpenDesk 应用，查看用途、运行位置与固定版本，在 OpenDesk 通用可信页确认安装。',home(current));
    for(const app of releases){
      const live=current.find(row=>row.id===app.id),versions=releases.filter(row=>row.id===app.id).sort((a,b)=>b.version.localeCompare(a.version,undefined,{numeric:true}));
      const options={current:live,versions,media:media.find(row=>row.toolId===app.toolId&&row.version===app.version)||null};
      const subject={kind:'app',marketId:app.id,version:app.version};
      await page(appPath(app),app.title+' v'+app.version,app.description,appDetail(app,options),'apps',subject);
      if(app.version===live?.version)await page(appPath(app,false),app.title,app.summary,appDetail(app,{...options,fixed:false}),'apps',subject);
      await page(installPath(subject),'安装 '+app.title+' v'+app.version,'在 OpenDesk 通用可信页审阅此固定应用版本。',installPage(subject,app.title),'apps',subject);
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
        '<section class="hero"><p class="eyebrow">历史套装引用 · 固定版本</p><h1>'+escapeHTML(title)+' v'+escapeHTML(member.version)+'</h1><p class="lead">此版本记录在官方固定套装中，但当前归档缺少可核验的完整发行快照。</p><p>不会用当前版本代替，也不会编造摘要或发行说明。OpenDesk 会核对该固定版本的实际可用性。</p><div class="actions"><a class="button primary" href="'+installPath(subject)+'">查看此版本安装说明</a><a href="/collections/">查看套装记录</a></div></section>');
      await page(installPath(subject),'核对 '+title+' v'+member.version,'核对历史套装引用中的固定版本；不保证当前扩展包含该包。',installPage(subject,title));
    }
    await page('/collections/','官方套装','固定应用组合与不可变 revision。',collectionList(archived.collections),'collections');
    for(const col of archived.collections){
      await page(collectionPath(col),col.title+' · revision '+col.revision,col.description,collectionDetail(col,{releases:archived.releases,current:official.catalog.apps}),'collections');
      const subject={kind:'collection',collectionId:col.id,revision:col.revision};
      await page(installPath(subject),'安装 '+col.title+' · revision '+col.revision,'逐项审阅固定版本套装。',installPage(subject,col.title),'collections');
    }
    await page('/how-to-install/','安装帮助','在浏览器中审阅安装应用，无需 OpenDesk 桌面应用。',helpPage(channel),'help');
    await write('404.html',layout({title:'页面不存在',description:'请检查应用与固定版本地址。',body:'<section class="hero"><h1>找不到这个页面</h1><p class="lead">请检查链接。已有固定版本不会自动改为其他版本。</p><p><a href="/">返回应用市场</a></p></section>',path:'/404.html',channel,origin,clientRevision}));
    await write('_headers','/*\n'+Object.entries({...MARKET_HEADERS,...(mode==='production'?{'Strict-Transport-Security':'max-age=31536000'}:{})}).map(([key,value])=>'  '+key+': '+value).join('\n')+'\n');
    await write('robots.txt','User-agent: *\n'+(mode==='development'?'Disallow: /\n':'Allow: /\n')+(origin?'Sitemap: '+origin+'/sitemap.xml\n':''));
    await write('sitemap.xml','<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+(origin?routes.filter(p=>!p.startsWith('/install/')).map(p=>'<url><loc>'+escapeHTML(origin+p)+'</loc></url>').join(''):'')+'</urlset>\n');
    const after=await inputIdentity();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Market inputs changed during build');
    const projectInputs=rows=>rows.map(({project,row})=>({path:project,bytes:row.bytes,sha256:row.sha256}));
    if(JSON.stringify(projectInputs(external))!==JSON.stringify(projectInputs(await projectPackages(projects))))
      throw Error('Market project packages changed during build');
    const manifest={schema:'opendesk.market.build.v1',mode,channel,origin,apps:current.length,archivedReleases:releases.length,unresolvedReleaseReferences:[...unresolved.values()],
      externalInstall:channel.enabled?'CONFIGURED':'NOT_CONFIGURED',routes,sourceInputs:before,projectPackages:projectInputs(external),
      screenshots:media.map(({bytes,...row})=>row),
      sourceFingerprint:hash(JSON.stringify({sourceInputs:before,projectPackages:projectInputs(external)})),catalogSha256:hash(JSON.stringify(official.catalog)),
      files:outputFiles.sort((a,b)=>a.path.localeCompare(b.path))};
    manifest.buildId=hash(JSON.stringify(manifest));
    await writeFile(resolve(stage,'site-build.json'),JSON.stringify(manifest,null,2)+'\n');
    const checked=await previousMarketRelease(dest);
    if(checked.exists!==previous.exists||checked.identity!==previous.identity)
      throw Error('Previous market output changed during build');
    let old=null;
    if(previous.exists){old=dest+'.previous-'+randomUUID();await rename(dest,old);}
    try{await rename(stage,dest);}catch(error){if(old)await rename(old,dest);throw error;}
    if(old)await rm(old,{recursive:true,force:true});
    return {output:dest,buildId:manifest.buildId,apps:current.length,releases:releases.length,origin,mode,
      extensionId:channel.extensionId,externalInstall:manifest.externalInstall};
  }catch(error){await rm(stage,{recursive:true,force:true});throw error;}
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)console.log(JSON.stringify(await buildMarketSite({
  projects:JSON.parse(process.env.OPENDESK_MARKET_PROJECTS||'[]')
})));
