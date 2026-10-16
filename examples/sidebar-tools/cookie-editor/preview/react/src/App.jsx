import React from 'react';

// PREVIEW-ONLY: virtual fixture rows; no Chrome APIs, SDK, persistence, or network.
const demoSite='shop.example.com';
const rawRows=[
  {id:'a',name:'session_id',value:'sess_demo_only_C18',domain:demoSite,path:'/',secure:true,httpOnly:true,sameSite:'lax',session:true,expiration:'',storeId:'0',partitionKey:null},
  {id:'b',name:'theme',value:'light',domain:demoSite,path:'/',secure:false,httpOnly:false,sameSite:'lax',session:false,expiration:'2027-12-10T10:30',storeId:'0',partitionKey:null},
  {id:'c',name:'locale',value:'zh-CN',domain:demoSite,path:'/',secure:false,httpOnly:false,sameSite:'lax',session:false,expiration:'2027-11-03T10:30',storeId:'0',partitionKey:null},
  {id:'d',name:'cart_count',value:'3',domain:demoSite,path:'/shop',secure:true,httpOnly:false,sameSite:'strict',session:true,expiration:'',storeId:'0',partitionKey:null},
  {id:'e',name:'analytics_consent',value:'accepted',domain:'.example.com',path:'/',secure:true,httpOnly:false,sameSite:'none',session:false,expiration:'2027-02-08T07:00',storeId:'0',partitionKey:null},
  {id:'f',name:'__Host-auth',value:'secret_preview_never_real',domain:demoSite,path:'/',secure:true,httpOnly:true,sameSite:'strict',session:true,expiration:'',storeId:'0',partitionKey:null},
  {id:'g',name:'实验_超长Cookie名称_用于测试在窄屏下的安全折行与原位编辑',value:'演示数据',domain:demoSite,path:'/用户/long-path/nested',secure:true,httpOnly:false,sameSite:'lax',session:true,expiration:'',storeId:'0',partitionKey:null},
  {id:'h',name:'embedded_pref',value:'enabled',domain:demoSite,path:'/',secure:true,httpOnly:false,sameSite:'none',session:false,expiration:'2027-05-03T07:00',storeId:'0',partitionKey:{topLevelSite:'https://partner.example.net',hasCrossSiteAncestor:false}},
];
const initialRows=()=>rawRows.map(x=>({...x,partitionKey:x.partitionKey?{...x.partitionKey}:null}));
const newDraft=()=>({name:'',domain:demoSite,path:'/',secure:true,httpOnly:false,sameSite:'lax',session:true,expiration:'',storeId:'0',partitionKey:null,valueInput:'',valueTouched:false});
const toDraft=c=>c?{name:c.name,domain:c.domain,path:c.path,secure:c.secure,httpOnly:c.httpOnly,sameSite:c.sameSite,session:c.session,expiration:c.expiration,storeId:c.storeId,partitionKey:c.partitionKey,valueInput:'',valueTouched:false}:newDraft();
const comparable=d=>({name:d.name,domain:d.domain,path:d.path,secure:d.secure,httpOnly:d.httpOnly,sameSite:d.sameSite,session:d.session,expiration:d.expiration,storeId:d.storeId,partitionKey:JSON.stringify(d.partitionKey||null),valueInput:d.valueTouched?d.valueInput:null,valueTouched:d.valueTouched});
const isDirty=(a,b)=>!!a&&!!b&&JSON.stringify(comparable(a))!==JSON.stringify(comparable(b));
const identity=c=>JSON.stringify([c.name,c.domain,c.path,c.storeId, c.partitionKey||null]);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const svgPaths={
  plus:<path d="M12 5v14M5 12h14"/>,download:<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>,upload:<path d="M12 21V9m-4 4 4-4 4 4M4 3v4h16V3"/>,
  refresh:<><path d="M20 11a8 8 0 0 0-14.5-4.7L3 9m0-5v5h5M4 13a8 8 0 0 0 14.5 4.7L21 15m0 5v-5h-5"/></>,
  search:<><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,filter:<path d="M4 6h16M7 12h10m-7 6h4"/>,
  chevron:<path d="m7 10 5 5 5-5"/>,close:<path d="M6 6l12 12M18 6 6 18"/>,eye:<><path d="M2 12s3.4-6.5 10-6.5S22 12 22 12s-3.4 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></>,
  eyeoff:<><path d="m3 3 18 18"/><path d="M9.8 5.7A10 10 0 0 1 12 5.5c6.6 0 10 6.5 10 6.5a13 13 0 0 1-3.4 4"/><path d="M6.5 6.5C3.5 8.4 2 12 2 12s3.4 6.5 10 6.5a10 10 0 0 0 4-.8"/></>,
  trash:<><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></>,globe:<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18"/></>,
  check:<path d="m5 12 5 5L20 7"/>,alert:<><path d="M12 3 2 21h20L12 3z"/><path d="M12 9v5M12 18h.01"/></>,copy:<><rect x="7" y="7" width="13" height="13" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2"/></>
};
function Icon({name}){return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{svgPaths[name]}</svg>}
function IconButton({name,label,onClick,disabled=false,pressed,small=false}){return <button type="button" className={'icon-btn'+(small?' small':'')} onClick={onClick} aria-label={label} title={label} disabled={disabled} aria-pressed={pressed===undefined?undefined:pressed}><Icon name={name}/></button>}
function Message({tone='neutral',children}){return <p className={'message '+tone} role="status" aria-live="polite">{children}</p>}
function Field({label,children}){return <label className="field"><span>{label}</span>{children}</label>}
function parseInput(text){
 const s=text.trim();if(!s)return {error:'请先选择文件或粘贴 Cookie 内容。'};
 let rows=[];let detected='';
 try{
 if(s.startsWith('[')||s.startsWith('{')){
   detected='JSON';const data=JSON.parse(s);const items=Array.isArray(data)?data:data.cookies;
   if(!Array.isArray(items))throw Error('JSON 应为数组或包含 cookies 数组');
   rows=items.map((c,i)=>{if(!c||typeof c!=='object'||typeof c.name!=='string'||typeof c.value!=='string')throw Error('第 '+(i+1)+' 条缺少 name/value');
     if(c.partitioned&&!c.partitionKey)throw Error('第 '+(i+1)+' 条分区 Cookie 缺少精确 PartitionKey');
     if(c.partitionKey&&typeof c.partitionKey.topLevelSite!=='string')throw Error('第 '+(i+1)+' 条 PartitionKey 缺少 topLevelSite');
     return {...newDraft(),...c,domain:c.domain||demoSite,path:c.path||'/',id:'import-'+i,storeId:String(c.storeId||'0'),partitionKey:c.partitionKey||null,valueTouched:false};});
 }else if(s.includes('\t')||s.startsWith('# Netscape')){
   detected='Netscape';const lines=s.split(/\r?\n/).filter(x=>x.trim()&&!x.startsWith('#')||x.startsWith('#HttpOnly_'));
   rows=lines.map((line,i)=>{const cols=line.split('\t');if(cols.length!==7)throw Error('第 '+(i+1)+' 行不是标准 Netscape 格式');
    return {...newDraft(),id:'import-'+i,domain:cols[0].replace(/^#HttpOnly_/,''),path:cols[2],secure:cols[3].toUpperCase()==='TRUE',httpOnly:cols[0].startsWith('#HttpOnly_'),name:cols[5],value:cols[6]};});
 }else{
   detected='Cookie Header';rows=s.replace(/^Cookie:\s*/i,'').split(';').map((chunk,i)=>{const at=chunk.indexOf('=');if(at<1)throw Error('第 '+(i+1)+' 项缺少 name=value');return {...newDraft(),id:'import-'+i,name:chunk.slice(0,at).trim(),value:chunk.slice(at+1).trim()};});
 }
 }catch(e){return {error:'无法解析：'+e.message};}
 if(!rows.length)return {error:'没有可导入的 Cookie。'};
 if(rows.length>10)return {error:'每批最多预览 10 条；请拆分后导入。'};
 for(const r of rows){if(!r.name||!r.domain||!r.path)return {error:'Cookie 名称、域名和路径不能为空。'};
   if(![demoSite,'.example.com'].includes(r.domain))return {error:'不允许导入到当前网站以外的域名：'+r.domain};}
 const uniq=new Set();for(const r of rows){const key=identity(r);if(uniq.has(key))return {error:'导入内容包含重复 Cookie 身份，请先处理冲突。'};uniq.add(key);}
 return {rows,format:detected};
}
function exportContent(rows,fmt,includeValue){
 if(fmt==='header')return rows.map(c=>c.name+'='+c.value).join('; ');
 if(fmt==='netscape')return '# Netscape HTTP Cookie File\n'+rows.map(c=>[c.httpOnly?'#HttpOnly_'+c.domain:c.domain,c.domain.startsWith('.')?'TRUE':'FALSE',c.path,c.secure?'TRUE':'FALSE',c.session?'0':String(Math.floor(new Date(c.expiration).getTime()/1000)),c.name,c.value].join('\t')).join('\n');
 return JSON.stringify(rows.map(c=>{const o={name:c.name,domain:c.domain,path:c.path,secure:c.secure,httpOnly:c.httpOnly,sameSite:c.sameSite,session:c.session,expiration:c.expiration||null,storeId:c.storeId,partitionKey:c.partitionKey};if(includeValue)o.value=c.value;return o;}),null,2);
}
export default function App(){
 const [rows,setRows]=React.useState(initialRows);const [scene,setScene]=React.useState('ready');const [dark,setDark]=React.useState(false);
 const [query,setQuery]=React.useState('');const [filter,setFilter]=React.useState('all');const [sort,setSort]=React.useState('name');const [expandedFilters,setExpandedFilters]=React.useState(false);
 const [selected,setSelected]=React.useState(null);const [draft,setDraft]=React.useState(null);const [baseline,setBaseline]=React.useState(null);const [pending,setPending]=React.useState(null);const [reveal,setReveal]=React.useState(false);
 const [io,setIo]=React.useState(null);const [importText,setImportText]=React.useState('');const [importPlan,setImportPlan]=React.useState(null);const [format,setFormat]=React.useState('json');const [includeValues,setIncludeValues]=React.useState(false);
 const [confirm,setConfirm]=React.useState(null);const [saving,setSaving]=React.useState(false);const [needsVerify,setNeedsVerify]=React.useState(false);const [skipPartition,setSkipPartition]=React.useState(false);const [flash,setFlash]=React.useState(null);const [error,setError]=React.useState('');const [failNext,setFailNext]=React.useState('');
 const [version,setVersion]=React.useState(0); const fileRef=React.useRef(null);const epochRef=React.useRef(0); const focusKey=React.useRef(null);
 const granted=scene==='ready'||scene==='readonly'||scene==='valuesDenied'||scene==='saveError'||scene==='copyError'||scene==='downloadError'||scene==='unknown';
 const canWrite=scene!=='readonly'&&granted; const canValues=granted&&scene!=='valuesDenied'; const busy=scene==='loading'||saving;
 const current=selected==='new'?null:rows.find(x=>x.id===selected);
 const dirty=isDirty(draft,baseline);
 const notify=(text,tone='success')=>{setFlash({text,tone});setError('');};
 const resetEditor=()=>{setSelected(null);setDraft(null);setBaseline(null);setReveal(false);setPending(null);setError('');};
 const focusAfter=id=>{focusKey.current=id;};
 React.useEffect(()=>{if(focusKey.current){const k=focusKey.current;focusKey.current=null;requestAnimationFrame(()=>document.querySelector(k)?.focus());}},[selected,version]);
 const openEditor=(id)=>{const c=id==='new'?null:rows.find(x=>x.id===id);const d=toDraft(c);setSelected(id);setDraft(d);setBaseline({...d});setPending(null);setError('');setReveal(false);setIo(null);setFlash(null);focusAfter('#cookie-name');setVersion(v=>v+1);};
 const requestSwitch=(id)=>{if(saving||!granted)return;if(selected===id){requestClose();return;}if(selected!==null&&dirty){setPending(id);setError('');return;}openEditor(id);};
 const requestClose=()=>{if(saving)return;if(dirty){setPending('close');return;}const old=selected;resetEditor();if(old&&old!=='new')focusAfter('[data-row="'+old+'"]');else focusAfter('[data-action="new"]');setVersion(v=>v+1);};
 const discard=()=>{const p=pending;setPending(null);if(p==='close'){const old=selected;resetEditor();focusAfter(old==='new'?'[data-action="new"]':'[data-row="'+old+'"]');setVersion(v=>v+1);}else if(p!==null)openEditor(p);};
 const update=(name,value)=>{setDraft(d=>({...d,[name]:value}));setError('');setFlash(null);};
 const save=async()=>{if(!canWrite||saving||needsVerify)return;if(!dirty){requestClose();return;}
  if(!draft.name.trim()||!draft.path.startsWith('/')){setError('请填写 Cookie 名称，路径必须以 / 开头。');return;}
  if(selected!=='new'&&(draft.domain!==current.domain||draft.path!==current.path||draft.storeId!==current.storeId||JSON.stringify(draft.partitionKey)!==JSON.stringify(current.partitionKey))){setError('现有 Cookie 的 Domain、Path、Store 和 Partition 身份不可修改。');return;}
  const updated={...(current||{}),...draft,name:draft.name.trim(),value:draft.valueTouched?draft.valueInput:(current?.value||''),id:current?.id||'new-'+Date.now()};
  const clash=rows.some(r=>r.id!==selected&&identity(r)===identity(updated));if(clash){setError('同一 Domain / Path / Store / Partition 已存在此名称，请更换名称。');return;}
  const epoch=epochRef.current;setSaving(true);setError('');await sleep(300);if(epoch!==epochRef.current)return;setSaving(false);
  if(failNext==='save'||scene==='saveError'){setFailNext('');setError('保存失败。输入已保留，可重试。');return;}
  if(failNext==='unknown'||scene==='unknown'){setFailNext('');setNeedsVerify(true);setError('写入结果未知。请先点击顶部刷新核对，不要直接重试。');return;}
  setRows(prev=>selected==='new'?[updated,...prev]:prev.map(r=>r.id===selected?updated:r));resetEditor();notify('已保存 Cookie');focusAfter('[data-row="'+updated.id+'"]');setVersion(v=>v+1);
 };
 const remove=async()=>{if(!current)return;setConfirm({type:'delete',message:'精确删除「'+current.name+'」？'});};
 const runDelete=async()=>{if(!current)return;const epoch=epochRef.current;setSaving(true);await sleep(200);if(epoch!==epochRef.current)return;setRows(a=>a.filter(x=>x.id!==current.id));setSaving(false);setConfirm(null);resetEditor();notify('已删除 Cookie');};
 const useScene=v=>{epochRef.current++;setSaving(false);setNeedsVerify(false);setScene(v);setFlash(null);setError('');setConfirm(null);setIo(null);resetEditor();setQuery('');if(v==='empty')setRows([]);else setRows(initialRows());};
 const matching=c=>[c.name,c.domain,c.path].some(t=>t.toLowerCase().includes(query.toLowerCase()))&&(filter==='all'||(filter==='session'?c.session:filter==='partitioned'?!!c.partitionKey:!!c[filter]));
 const visible=rows.filter(matching).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='domain'?a.domain.localeCompare(b.domain):sort==='path'?a.path.localeCompare(b.path):(a.expiration||'').localeCompare(b.expiration||''));
 const pinned=current&&!visible.some(x=>x.id===current.id)?[current]:[];const shown=[...pinned,...visible];
 const startImport=()=>{setIo(io==='import'?null:'import');setImportPlan(null);setError('');setFlash(null);};
 const startExport=()=>{setIo(io==='export'?null:'export');setError('');setFlash(null);};
 const planImport=()=>{const result=parseInput(importText);if(result.error){setImportPlan(null);setError(result.error);return;}
  const added=result.rows.filter(c=>!rows.some(r=>identity(c)===identity(r)));const replacing=result.rows.filter(c=>rows.some(r=>identity(c)===identity(r)));
  setError('');setImportPlan({...result,added:added.length,replacing:replacing.length});};
 const applyImport=async()=>{if(!importPlan)return;if(!canWrite){setError('当前仅可查看；写入需要网站授权。');return;}setConfirm({type:'import',message:'确认导入 '+importPlan.rows.length+' 条 Cookie？新增 '+importPlan.added+' · 覆盖 '+importPlan.replacing});};
 const runImport=async()=>{const epoch=epochRef.current;setSaving(true);await sleep(320);if(epoch!==epochRef.current)return;setSaving(false);if(failNext==='import'){setFailNext('');setConfirm(null);setError('导入失败。预览与粘贴内容已保留，可重新确认。');return;}
 setRows(old=>{const next=[...old];for(const c of importPlan.rows){const i=next.findIndex(x=>identity(x)===identity(c));const fresh={...c,id:i<0?'imported-'+Math.random().toString(36).slice(2):next[i].id};if(i<0)next.unshift(fresh);else next[i]=fresh;}return next;});
 setConfirm(null);setIo(null);setImportText('');setImportPlan(null);notify('已导入 '+importPlan.rows.length+' 条 Cookie');};
 const runExport=async(kind,accepted=false)=>{if(!granted){setError('尚未获得 Cookie 查看权限。');return;}
  if((includeValues||format!=='json')&&!canValues){setError('敏感值权限未授权。请在工具设置中单独授权。');return;}
  if(format!=='json'&&!skipPartition&&rows.some(c=>c.partitionKey)){setError('包含分区 Cookie，不能以该格式无损导出；请改用 JSON。');return;}
  if((includeValues||format!=='json')&&!accepted){setConfirm({type:'export',kind,message:kind==='copy'?'即将复制包含 Cookie 值的数据，其他应用可能读取剪贴板。':'即将下载包含 Cookie 值的文件，请妥善保管。'});return;}
  const epoch=epochRef.current;setSaving(true);setError('');setConfirm(null);await sleep(120);if(epoch!==epochRef.current)return;
  if(failNext===kind||scene==='copyError'&&kind==='copy'||scene==='downloadError'&&kind==='download'){setSaving(false);setFailNext('');setError(kind==='copy'?'复制失败。可重新操作或改用下载。':'下载失败。请检查浏览器下载权限后重试。');return;}
  const text=exportContent(format==='json'||!skipPartition?rows:rows.filter(c=>!c.partitionKey),format,includeValues||format!=='json');
  try{if(kind==='copy'){
      if(!navigator.clipboard?.writeText)throw Error('NO_CLIPBOARD');await navigator.clipboard.writeText(text);
    }else{
      const blob=new Blob([text],{type:format==='json'?'application/json;charset=utf-8':'text/plain;charset=utf-8'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='cookies-'+format+(format==='json'?'.json':'.txt');document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    notify(kind==='copy'?'已复制到剪贴板':'已开始下载');
  }catch(e){setError(kind==='copy'?'浏览器未允许写入剪贴板；可以改用下载。':'无法下载，请检查浏览器设置。');}finally{setSaving(false);}
 };
 const handleConfirm=()=>{if(confirm?.type==='delete')runDelete();else if(confirm?.type==='import')runImport();else if(confirm?.type==='export')runExport(confirm.kind,true);};
 const resetAll=()=>{epochRef.current++;setSaving(false);setNeedsVerify(false);setRows(initialRows());setScene('ready');resetEditor();setIo(null);setFlash(null);setError('');setFilter('all');setQuery('');setImportText('');setFailNext('');};
 const appKeydown=e=>{if(e.key==='Escape'&&!confirm){if(pending){setPending(null);return;}if(selected!==null){requestClose();return;}if(io)setIo(null);}};
 return <div className={'r49-page '+(dark?'theme-dark':'')}>
   <section className="demo-lab" aria-label="预览场景切换器"><div className="lab-title"><span>Cookie Editor R4.9</span><span className="lab-label">独立交互候选 · 虚构数据</span></div><div className="lab-controllers">
      <label>场景 <select data-testid="scenario" value={scene} onChange={e=>useScene(e.target.value)}><option value="ready">已授权</option><option value="first">未授权</option><option value="readonly">仅查看</option><option value="empty">空列表</option><option value="loading">正在读取</option><option value="valuesDenied">值未授权</option><option value="saveError">保存失败</option><option value="copyError">复制失败</option><option value="downloadError">下载失败</option><option value="unknown">写入结果未知</option></select></label>
      <label>下次操作 <select data-testid="failure" value={failNext} onChange={e=>setFailNext(e.target.value)}><option value="">正常</option><option value="save">保存失败</option><option value="import">导入失败</option><option value="copy">复制失败</option><option value="download">下载失败</option><option value="unknown">结果未知</option></select></label>
      <button className="lab-button" type="button" onClick={()=>setDark(a=>!a)}>{dark?'浅色':'深色'}</button><button className="lab-button" type="button" onClick={resetAll}>重置</button>
   </div></section>
   <main className="cookie-app" onKeyDown={appKeydown} aria-label="Cookie Editor">
      <header className="site-bar"><span className="site-symbol"><Icon name="globe"/></span><div className="site-name"><span>当前网站</span><strong title={demoSite}>{demoSite}</strong></div><span className={'site-status '+(!granted?'muted':scene==='readonly'?'limited':'')}>{busy?'读取中':!granted?'未授权':scene==='readonly'?'仅查看':'已授权'}</span><IconButton name="refresh" label="刷新 Cookie" onClick={()=>{if(needsVerify){setNeedsVerify(false);setError('');notify('已核对模拟数据。请确认草稿后再保存。','neutral');return;}if(dirty){setError('有未保存的修改，请先保存或取消。');return;}setFlash(null);setError('');setVersion(v=>v+1);notify('已刷新 Cookie 列表')}} disabled={busy}/></header>
      {!granted?<div className="permission-state" role="status"><Icon name={scene==='loading'?'refresh':'alert'}/><strong>{scene==='loading'?'正在读取本站 Cookie…':'尚未授权查看本站 Cookie'}</strong><p>{scene==='loading'?'请检查网站和访问权限。':'请前往已安装工具的设置，授权本站的 Cookie 读取权限。'}</p><button className="text-btn" onClick={()=>notify('正式版本请在可信工具设置中授权；预览可在上方切换场景。','neutral')}>查看授权方式</button></div>:<>
       <div className="list-toolbar"><strong>Cookie <span>{rows.length}</span></strong><div className="toolbar-actions"><IconButton name="upload" label="导入 Cookie" onClick={startImport} disabled={busy||!canWrite}/><IconButton name="download" label="导出 Cookie" onClick={startExport} disabled={busy}/><span className="action-separator"/><span data-action="new"><IconButton name="plus" label="新建 Cookie" onClick={()=>requestSwitch('new')} disabled={busy||!canWrite}/></span></div></div>
       <div className="searchbar"><div className="searchbox"><Icon name="search"/><input value={query} type="search" onChange={e=>setQuery(e.target.value)} placeholder="搜索名称、域名或路径" aria-label="搜索 Cookie"/></div><IconButton name="filter" label="筛选与排序" pressed={expandedFilters} onClick={()=>setExpandedFilters(v=>!v)}/></div>
       {expandedFilters&&<section className="filter-panel" aria-label="筛选与排序"><div className="filter-chips">{[['all','全部'],['secure','Secure'],['httpOnly','HttpOnly'],['session','会话'],['partitioned','分区']].map(([key,label])=><button key={key} type="button" className={'chip '+(filter===key?'selected':'')} onClick={()=>setFilter(key)} aria-pressed={filter===key}>{label}</button>)}</div><label className="sort-field">排序<select value={sort} onChange={e=>setSort(e.target.value)}><option value="name">名称</option><option value="domain">域名</option><option value="path">路径</option><option value="expiration">过期时间</option></select></label></section>}
       {flash&&<Message tone={flash.tone}>{flash.text}</Message>}
       {error&&selected===null&&!io&&<Message tone="error">{error}</Message>}
       {io==='import'&&<section className="io-panel" aria-label="导入 Cookie"><div className="panel-heading"><strong>导入 Cookie</strong><IconButton name="close" label="关闭导入" onClick={()=>setIo(null)} disabled={saving}/></div><input type="file" accept=".json,.txt,text/plain,application/json" hidden ref={node=>{fileRef.current=node}} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>150000){setError('文件超过 150 KB，请缩小后重试。');return;}setImportText(await f.text());setImportPlan(null);setError('');e.target.value='';}}/>
          <button type="button" className="file-select" onClick={()=>fileRef.current?.click()}><Icon name="upload"/>选择文件</button>
          <Field label="或粘贴 Cookie 内容"><textarea rows="4" value={importText} onChange={e=>{setImportText(e.target.value);setImportPlan(null);setError('')}} placeholder={'[{"name":"theme","value":"dark"}]\n或 Cookie: theme=dark; locale=zh-CN'}/></Field>
          {importPlan&&<div className="import-summary" role="status"><strong>{importPlan.format} · {importPlan.rows.length} 条</strong><span>新增 {importPlan.added} · 覆盖 {importPlan.replacing} · 错误 0</span><small>仅作用于 {demoSite}；按完整 Cookie 身份检查冲突。</small></div>}
          <div className="panel-actions"><button className="text-btn" onClick={()=>{setIo(null);setError('')}}>取消</button>{importPlan?<button className="text-btn primary" disabled={saving} onClick={applyImport}>确认导入</button>:<button className="text-btn primary" onClick={planImport}>预览影响</button>}</div>
       </section>}
       {io==='export'&&<section className="io-panel" aria-label="导出 Cookie"><div className="panel-heading"><strong>导出 Cookie</strong><IconButton name="close" label="关闭导出" onClick={()=>setIo(null)} disabled={saving}/></div><div className="export-options"><Field label="格式"><select value={format} onChange={e=>{setFormat(e.target.value);setError('')}}><option value="json">JSON</option><option value="header">Cookie Header</option><option value="netscape">Netscape</option></select></Field><Field label="内容"><select value={format!=='json'?'backup':includeValues?'backup':'metadata'} disabled={format!=='json'} onChange={e=>setIncludeValues(e.target.value==='backup')}><option value="metadata">元数据（不含值）</option><option value="backup">包含 Cookie 值</option></select></Field></div>
         {format!=='json'&&rows.some(c=>c.partitionKey)&&<label className="partition-option"><input type="checkbox" checked={skipPartition} onChange={e=>setSkipPartition(e.target.checked)}/> 排除 {rows.filter(c=>c.partitionKey).length} 条分区 Cookie 后导出</label>}
         {format!=='json'&&<p className="quiet-note">{format==='header'?'Cookie Header 仅包含名称和值，无法恢复其他属性。':'Netscape 不支持 SameSite、Store 和 PartitionKey。'} 分区 Cookie 请使用 JSON。</p>}
         {(format!=='json'||includeValues)&&<p className="quiet-note">敏感值需要单独授权；每次复制或下载前确认。</p>}
         <div className="export-actions"><button className="text-btn" disabled={saving} onClick={()=>runExport('copy')}><Icon name="copy"/>复制</button><button className="text-btn primary" disabled={saving} onClick={()=>runExport('download')}><Icon name="download"/>下载</button></div>
       </section>}
       {io&&error&&<Message tone="error">{error}</Message>}
       <section className="cookie-list" aria-label="Cookie 列表">
         {selected==='new'&&<div className="new-row" data-testid="new-row"><div className="new-label">新建 Cookie</div>{renderEditor()}</div>}
         {pinned.length>0&&<p className="pinned-note">当前编辑项不符合筛选条件，暂时保留显示。</p>}
         {shown.map(c=><article className={'cookie-row '+(selected===c.id?'expanded':'')} key={c.id}>
           <button className="row-trigger" type="button" data-row={c.id} onClick={()=>requestSwitch(c.id)} aria-expanded={selected===c.id} aria-controls={'editor-'+c.id}>
             <span className="row-text"><strong>{c.name}</strong><small>{c.domain} <span>·</span> {c.path}</small></span><span className="row-flags">{c.httpOnly&&<abbr title="HttpOnly">H</abbr>}{c.secure&&<abbr title="Secure">S</abbr>}{c.partitionKey&&<abbr title="Partitioned">P</abbr>}</span><Icon name="chevron"/>
           </button>{selected===c.id&&<div id={'editor-'+c.id}>{renderEditor()}</div>}
         </article>)}
         {shown.length===0&&selected!=='new'&&<div className="empty-list"><strong>{rows.length===0?'本站暂无 Cookie':'没有匹配的 Cookie'}</strong><span>{rows.length===0?'可以新建或导入。':'尝试更换关键词或筛选条件。'}</span></div>}
       </section>
       {scene==='readonly'&&<p className="quiet-note">当前仅可查看，编辑与导入需要独立写入授权。</p>}
       <details className="secondary-tools"><summary>更多 · 清理与变化观察</summary><p>正式版本继续使用既有 Browser SDK 和可信宿主确认；本轮原型不模拟危险批量删除。</p></details>
       {confirm&&<section className="confirmation" role="alertdialog" aria-modal="true" aria-label="确认操作"><p>{confirm.message}</p><div className="panel-actions"><button className="text-btn" onClick={()=>setConfirm(null)}>取消</button><button className="text-btn primary" onClick={handleConfirm} disabled={saving}>{saving?'处理中…':'确认'}</button></div></section>}
       </>}
   </main>
 </div>;
 function renderEditor(){return <section className="inline-editor" aria-label={selected==='new'?'新建 Cookie':'编辑 Cookie'} data-testid="editor">
    <div className="editor-top"><span>{selected==='new'?'新建':'编辑'} Cookie</span><span className="editor-top-right">{dirty&&<em>未保存</em>}<IconButton name="close" label="关闭编辑" small onClick={requestClose} disabled={saving}/></span></div>
    <Field label="名称"><input id="cookie-name" type="text" value={draft.name} onChange={e=>update('name',e.target.value)} maxLength="256" autoComplete="off" disabled={!canWrite||saving}/></Field>
    <Field label="值"><div className="value-input"><input aria-label="Cookie 值（留空则保留原值）" type="text" autoComplete="off" value={draft.valueInput} placeholder={selected==='new'?'输入值（可为空）':draft.valueTouched?'':'保持原值（默认隐藏）'} onChange={e=>setDraft(d=>({...d,valueInput:e.target.value,valueTouched:selected==='new'?e.target.value!=='' :true}))} disabled={!canWrite||saving}/>
      {selected!=='new'&&<IconButton small name={reveal?'eyeoff':'eye'} label={reveal?'隐藏 Cookie 值':'读取并显示 Cookie 值'} onClick={()=>{if(!canValues){setError('尚未授权敏感值读取，请在工具设置中单独授权。');return;}setError('');setReveal(a=>!a)}}/>}</div></Field>
    {reveal&&current&&<div className="revealed-value" role="status">当前值：<code>{current.value}</code></div>}
    {draft.valueTouched&&selected!=='new'&&<button className="inline-link" type="button" onClick={()=>setDraft(d=>({...d,valueInput:'',valueTouched:false}))}>撤销值修改 · 保留原值</button>}
    <details className="advanced"><summary>属性与高级设置</summary><div className="advanced-body"><div className="pair"><Field label="Domain"><input value={draft.domain} onChange={e=>update('domain',e.target.value)} readOnly={selected!=='new'}/></Field><Field label="Path"><input value={draft.path} onChange={e=>update('path',e.target.value)} readOnly={selected!=='new'}/></Field></div><Field label="SameSite"><select value={draft.sameSite} onChange={e=>update('sameSite',e.target.value)} disabled={!canWrite||saving}><option value="lax">Lax</option><option value="strict">Strict</option><option value="none">None</option></select></Field><div className="toggles"><label><input type="checkbox" checked={draft.secure} onChange={e=>update('secure',e.target.checked)} disabled={!canWrite||saving}/> Secure</label><label><input type="checkbox" checked={draft.httpOnly} onChange={e=>update('httpOnly',e.target.checked)} disabled={!canWrite||saving}/> HttpOnly</label><label><input type="checkbox" checked={draft.session} onChange={e=>update('session',e.target.checked)} disabled={!canWrite||saving}/> Session</label></div>{!draft.session&&<Field label="过期时间"><input type="datetime-local" value={draft.expiration} onChange={e=>update('expiration',e.target.value)}/></Field>}<div className="identity-note">Store：{draft.storeId} · Partition：{draft.partitionKey?JSON.stringify(draft.partitionKey):'无'}（身份只读）</div></div></details>
    {error&&<Message tone="error">{error}</Message>}
    {pending!==null&&<div className="discard-row" role="status"><span>放弃当前未保存修改？</span><button type="button" className="text-btn" onClick={()=>setPending(null)}>继续编辑</button><button type="button" className="text-btn" onClick={discard}>放弃</button></div>}
    <div className="editor-actions">{selected!=='new'&&<button className="delete-btn" type="button" onClick={remove} disabled={saving||!canWrite}><Icon name="trash"/>删除</button>}<span className="spacer"/><button className="text-btn" type="button" onClick={requestClose} disabled={saving}>取消</button><button className="text-btn primary" type="button" onClick={save} disabled={!canWrite||saving||needsVerify}>{saving?'保存中…':'保存'}</button></div>
  </section>}
}
