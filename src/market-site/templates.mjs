// Server-rendered presentation only. No installer, registry, or privileged SDK.
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const e=escapeHTML;
export const appPath=(app,fixed=true)=>'/apps/'+app.id+(fixed?'/versions/'+app.version:'')+'/';
export const collectionPath=col=>'/collections/'+col.id+'/revisions/'+col.revision+'/';
export const installPath=subject=>subject.kind==='app'?'/install/'+subject.marketId+'/versions/'+subject.version+'/':
  '/install/collections/'+subject.collectionId+'/revisions/'+subject.revision+'/';
const appSubject=app=>({kind:'app',marketId:app.id,version:app.version});
const collectionSubject=col=>({kind:'collection',collectionId:col.id,revision:col.revision});
const handoffAction=(subject,label)=>'<button type="button" class="button primary" id="open-review" data-subject="'+e(JSON.stringify(subject))+'">'+e(label)+'</button><p id="handoff-state" class="minor" role="status">在扩展中审阅并确认；安装后由你打开。</p><a class="minor" href="'+installPath(subject)+'">安装交接说明</a><details id="handoff-details" hidden><summary>连接技术信息</summary><p id="handoff-code" class="digest"></p><a href="/how-to-install/">安装与连接帮助</a></details>';
const category=app=>app.category==='阅读'?'阅读':['笔记','Markdown','AI'].includes(app.category)?'笔记与写作':'效率';
const logo='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 10h18M5 10v11h14V10M3 10l2-7h14l2 7M9 21v-7h6v7M8 3l-1 7M16 3l1 7"/></svg>';
export function layout({title,description,body,path,channel,origin=channel.origin,section='apps'}){
  const canonical=origin?origin+path:null;
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+e(title)+' · OpenDesk 应用市场</title><meta name="description" content="'+e(description)+'">'+
    '<meta name="color-scheme" content="light dark"><meta name="referrer" content="no-referrer">'+
    '<meta property="og:title" content="'+e(title)+'"><meta property="og:description" content="'+e(description)+'">'+
    (canonical?'<link rel="canonical" href="'+e(canonical)+'"><meta property="og:url" content="'+e(canonical)+'">':'')+
    '<link rel="stylesheet" href="/design-tokens.css"><link rel="stylesheet" href="/market.css">'+
    '<script type="module" src="/client.js"></script></head><body><a class="skip-link" href="#content">跳到内容</a>'+
    '<header class="site-header shell"><a class="brand" href="/">'+logo+'<span>OpenDesk <small>应用市场</small></span></a>'+
    '<nav aria-label="市场导航">'+[['apps','/','应用'],['collections','/collections/','套装'],['help','/how-to-install/','安装帮助']].map(([key,url,label])=>
      '<a href="'+url+'"'+(section===key?' aria-current="page"':'')+'>'+label+'</a>').join('')+'</nav></header>'+
    '<main id="content" class="shell" tabindex="-1">'+body+'</main>'+
    '<footer class="shell"><div class="connection"><span id="connection-state" role="status">正在检查 OpenDesk 连接…</span><button type="button" id="connect-button" class="text-button">重新连接</button></div>'+
    '<p>网站负责发现与分享；在 OpenDesk 扩展中审阅、安装和管理应用。网站只接收交接状态。</p>'+
    (channel.mode==='development'?'<p class="minor">本地开发通道 · '+e(channel.origin)+'。正式获取渠道尚未配置。</p>':'')+
    '</footer></body></html>';
}
const tag=label=>'<span class="tag">'+e(label)+'</span>';
function card(app){
  return '<article class="card app-card" data-category="'+e(category(app))+'" data-search="'+e([app.title,app.summary,...app.features].join(' ').toLowerCase())+'">'+
    '<div class="card-meta">'+tag(app.category)+'<span>v'+e(app.version)+'</span></div><h2><a href="'+appPath(app,false)+'">'+e(app.title)+'</a></h2>'+
    '<p>'+e(app.summary)+'</p><p class="minor">运行于 '+e(app.surfaces.join(' · '))+'</p><a class="detail-link" href="'+appPath(app,false)+'">查看应用 <span aria-hidden="true">→</span></a></article>';
}
export function home(apps){
  return '<section class="hero"><p class="eyebrow">OPENDESK APPS</p><h1>给浏览器，添一点好用的能力。</h1>'+
    '<p class="lead">阅读、记笔记、整理想法。选择需要的应用，在 OpenDesk 中审阅后安装。</p><div class="tags">'+tag('官方应用')+tag('本机管理')+tag('按需使用')+'</div></section>'+
    '<section aria-label="查找应用"><div class="filter-bar"><label class="search-field">查找应用<input id="app-search" type="search" placeholder="搜索名称或功能" autocomplete="off"></label>'+
    '<div class="filters" role="group" aria-label="应用分类">'+['全部','阅读','笔记与写作','效率'].map((label,i)=>'<button type="button" data-filter="'+label+'" aria-pressed="'+!i+'">'+label+'</button>').join('')+
    '</div></div><p id="search-results" class="minor" role="status">'+apps.length+' 个应用</p><div class="cards">'+apps.map(card).join('')+'</div><p id="no-results" hidden>没有匹配的应用，试试其他名称或选择「全部」。</p></section>';
}
export function appDetail(app,{current,versions=[],media=null,fixed=true}={}){
  const subject=appSubject(app),archived=!current||current.version!==app.version;
  return '<a class="back-link" href="/">← 所有应用</a><section class="detail-heading"><div><p class="eyebrow">'+e(app.category)+' · 官方应用</p><h1>'+e(app.title)+'</h1><p class="lead">'+e(archived?app.description:app.summary)+'</p>'+
    '<div class="tags">'+app.surfaces.map(tag).join('')+tag('v'+app.version)+'</div></div><div class="primary-action">'+handoffAction(subject,'在 OpenDesk 中审阅安装')+'</div></section>'+
    (archived?'<aside class="notice">历史固定版本。此页面保留已记录的发布信息；当前扩展是否包含该版本，需在可信审阅页核对。'+(current?' <a href="'+appPath(current,false)+'">查看当前推荐版本 v'+e(current.version)+'</a>':'')+'</aside>':'')+
    '<div class="detail-columns"><section class="stack">'+
    (media?'<figure class="card screenshot"><a class="screenshot-image" href="'+e(media.src)+'" aria-label="查看'+e(app.title)+'完整原图"><img src="'+e(media.src)+'" width="'+media.width+'" height="'+media.height+'" alt="'+e(media.alt)+'" decoding="async"></a><figcaption>'+e(media.caption)+' <a href="'+e(media.src)+'">查看原图</a></figcaption></figure>':'')+
    '<section class="card"><h2>用它可以做什么</h2>'+(archived?'<p>'+e(app.description)+'</p>':'<ul>'+app.features.map(f=>'<li>'+e(f)+'</li>').join('')+'</ul>')+
    '<h3>在哪里使用</h3><p>'+e(app.sites)+'</p></section><section class="card"><h2>安装与授权</h2><ol><li>在扩展可信页核对版本、来源和所需能力。</li><li>确认安装，然后主动打开应用。</li><li>需要网页内容的应用，在使用入口单独授权相应网站。</li></ol><p class="minor">已授权的正常使用沿用原许可。可离线使用的工具不依赖市场网站。</p></section></section>'+
    '<aside class="stack"><section class="card"><h2>应用信息</h2><dl><dt>发布者</dt><dd>OpenDesk</dd><dt>运行位置</dt><dd>'+e(app.surfaces.join('、'))+'</dd><dt>版本</dt><dd>v'+e(app.version)+'</dd><dt>本次分发</dt><dd>官方工具随扩展发行</dd></dl>'+
    '</section><section class="card"><h2>版本记录</h2><ul class="version-list">'+versions.map(row=>'<li><a href="'+appPath(row)+'">v'+e(row.version)+'</a>'+(row.version===current?.version?' <span class="minor">当前推荐</span>':'')+'</li>').join('')+'</ul>'+
    (!fixed?'<p class="minor">此链接展示当前推荐版本；固定版本链接保持其发布身份。</p>':'')+'</section><details class="card"><summary>发行技术信息</summary><dl><dt>应用 ID</dt><dd>'+e(app.id)+'</dd><dt>制品 SHA-256</dt><dd class="digest">'+e(app.sha256)+'</dd><dt>制品大小</dt><dd>'+app.bytes+' B</dd><dt>能力声明</dt><dd>'+e(app.capabilities.join('、')||'无')+'</dd></dl><p class="minor">摘要用于比对发行字节。信任来自经安装的扩展与受控发布流程；摘要不等于远程签名或全面安全审核。</p></details></aside></div>';
}
export function collectionList(collections){
  const ids=[...new Set(collections.map(row=>row.id))];
  return '<section class="hero"><p class="eyebrow">COLLECTIONS</p><h1>一起使用，更顺手。</h1><p class="lead">每个套装固定成员和版本，安装前逐项核对。</p></section><div class="cards">'+ids.map(id=>{
    const rows=collections.filter(row=>row.id===id).sort((a,b)=>b.revision-a.revision),current=rows[0];
    return '<article class="card"><h2><a href="'+collectionPath(current)+'">'+e(current.title)+'</a></h2><p>'+e(current.description)+'</p><p>当前 revision '+current.revision+'</p><div class="actions">'+rows.map(row=>'<a href="'+collectionPath(row)+'">revision '+row.revision+'</a>').join('')+'</div></article>';
  }).join('')+'</div>';
}
export function collectionDetail(col,{releases,current}){
  return '<a class="back-link" href="/collections/">← 所有套装</a><section class="detail-heading"><div><p class="eyebrow">固定套装 · REVISION '+col.revision+'</p><h1>'+e(col.title)+'</h1><p class="lead">'+e(col.description)+'</p></div>'+
    '<div class="primary-action">'+handoffAction(collectionSubject(col),'在 OpenDesk 中审阅套装')+'</div></section><div class="stack">'+col.members.map(member=>{
      const release=releases.find(row=>row.id===member.id&&row.version===member.version),live=current.find(row=>row.id===member.id&&row.version===member.version);
      return '<article class="card member"><h2>'+(release?'<a href="'+appPath(release)+'">'+e(release.packageTitle)+'</a>':e(member.id))+'</h2><p>固定版本 v'+e(member.version)+'</p><p class="minor">'+(live?'本次扩展源码提供该发行。实际安装状态只在扩展中核对。':'当前扩展源码未提供此固定版本；不会用其他版本代替。')+'</p></article>';
    }).join('')+'</div><p class="notice">已安装成员可以跳过；缺包与来源冲突分别显示。成功项保留，结果未知时先恢复核对，不自动重装。</p>';
}
export function installPage(subject,title){
  return '<a class="back-link" href="'+(subject.kind==='app'?appPath({id:subject.marketId,version:subject.version}):collectionPath({id:subject.collectionId,revision:subject.revision}))+'">← 返回详情</a>'+
    '<section class="install-layout"><p class="eyebrow">安装交接</p><h1>'+e(title)+'</h1><p class="lead">'+(subject.kind==='app'?'固定版本 v'+e(subject.version):'固定 revision '+subject.revision)+'</p>'+
    '<ol class="steps"><li>网站发起请求</li><li>扩展审阅并确认</li><li>安装后打开使用</li></ol><section class="card"><h2>在可信扩展页面完成安装</h2><p>你可以在下一页核对来源、版本和能力。网站不会批准权限，也不会自动运行应用。</p>'+
    '<button type="button" class="button primary" id="open-review" data-subject="'+e(JSON.stringify(subject))+'">打开 OpenDesk 安装审阅</button>'+
    '<p id="handoff-state" role="status">准备好后点击上方按钮。</p><a href="/how-to-install/">安装与连接帮助</a><details id="handoff-details" hidden><summary>技术信息</summary><p id="handoff-code" class="digest"></p></details></section></section>';
}
export function helpPage(channel){
  return '<section class="hero"><p class="eyebrow">GET STARTED</p><h1>从 OpenDesk，开始使用应用。</h1><p class="lead">先安装主扩展，再选择你需要的应用。</p></section><div class="help-grid"><section class="card"><h2>1. 获取 OpenDesk 主扩展</h2>'+
    (channel.acquireUrl?'<p><a class="button primary" href="'+e(channel.acquireUrl)+'" rel="noreferrer">前往官方 Chrome Web Store</a></p>':'<p>正式扩展获取地址尚未配置。请使用项目维护者提供并核验过的扩展包。</p>')+
    (channel.mode==='development'?'<p>本地开发：构建并在 <code>chrome://extensions</code> 加载 <code>dist/development</code>，核对实际扩展 ID，再刷新此页。</p>':'')+
    '</section><section class="card"><h2>2. 审阅一个应用</h2><p>打开应用的固定版本，选择「在 OpenDesk 中审阅安装」。在扩展可信页确认一次，随后主动打开。</p><p>已安装、更新、来源冲突和缺包状态都以扩展读取的真实记录为准。</p></section>'+
    '<section class="card"><h2>无法连接 OpenDesk？</h2><ul><li>请在桌面版 Chrome 的顶层网页中打开市场。</li><li>'+ (channel.mode==='development'?'核对扩展已启用、开发来源与实际扩展 ID。':'核对扩展已启用，并使用维护者公布的官方市场地址。')+'</li><li>更新或重新加载扩展后，刷新页面并重新连接。</li></ul><p>连接超时只表示无法确认连接，不代表扩展一定未安装。交接结果未知时先查看已打开的审阅页；再次点击会沿用同一请求。</p></section>'+
    '<section class="card"><h2>权限、离线与更新</h2><p>安装不会自动运行。需要网页内容时，在工具入口授予对应网站的访问权；正常使用复用已有授权。</p><p>离线工具及其数据保存在本机。更新保留原有数据；代码回退不意味着应用数据一定能回退，使用前请按工具自身能力备份。</p></section></div>';
}
