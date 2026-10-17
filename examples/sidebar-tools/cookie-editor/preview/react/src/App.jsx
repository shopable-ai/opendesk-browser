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
// Full Cookie identity, canonical PartitionKey property order.
const identity=c=>JSON.stringify([c.name,c.domain.toLowerCase(),c.path,String(c.storeId),c.partitionKey?.topLevelSite??null,c.partitionKey?.hasCrossSiteAncestor??null]);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const svgPaths={
  plus:<path d="M12 5v14M5 12h14"/>,download:<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>,upload:<path d="M12 21V9m-4 4 4-4 4 4M4 3v4h16V3"/>,
  refresh:<><path d="M20 11a8 8 0 0 0-14.5-4.7L3 9m0-5v5h5M4 13a8 8 0 0 0 14.5 4.7L21 15m0 5v-5h-5"/></>,
  search:<><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,filter:<path d="M4 6h16M7 12h10m-7 6h4"/>,
  chevron:<path d="m7 10 5 5 5-5"/>,close:<path d="M6 6l12 12M18 6 6 18"/>,eye:<><path d="M2 12s3.4-6.5 10-6.5S22 12 22 12s-3.4 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></>,
  eyeoff:<><path d="m3 3 18 18"/><path d="M9.8 5.7A10 10 0 0 1 12 5.5c6.6 0 10 6.5 10 6.5a13 13 0 0 1-3.4 4"/><path d="M6.5 6.5C3.5 8.4 2 12 2 12s3.4 6.5 10 6.5a10 10 0 0 0 4-.8"/></>,
  trash:<><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></>,globe:<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18"/></>,
  check:<path d="m5 12 5 5L20 7"/>,alert:<><path d="M12 3 2 21h20L12 3z"/><path d="M12 9v5M12 18h.01"/></>,copy:<><rect x="7" y="7" width="13" height="13" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2"/></>,
  shield:<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></>,
  more:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>
};
function Icon({name}){return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{svgPaths[name]}</svg>}
function IconButton({name,label,onClick,disabled=false,pressed,small=false}){return <button type="button" className={'icon-btn'+(small?' small':'')} onClick={onClick} aria-label={label} title={label} disabled={disabled} aria-pressed={pressed===undefined?undefined:pressed}><Icon name={name}/></button>}
function Message({tone='neutral',children}){return <p className={'message '+tone} role={tone==='error'?'alert':'status'} aria-live="polite">{children}</p>}
function Field({label,children}){return <label className="field"><span>{label}</span>{children}</label>}
// Preview-only parser: skip ordinary invalid records, block unsafe scope and partition ambiguity.
function parseInput(text){
 const s=text.trim();if(!s)return {error:'请先选择文件或粘贴 Cookie 内容。'};
 let format='',input=[],invalid=0,duplicate=0;
 try{
  if(s.startsWith('[')||s.startsWith('{')){
   format='JSON';const data=JSON.parse(s);const list=Array.isArray(data)?data:data?.cookies;
   if(!Array.isArray(list))throw Error('JSON 应为数组或包含 cookies 数组');
   input=list.map((record,i)=>({record,line:i+1}));
  }else if(s.includes('\t')||/^# Netscape/i.test(s)){
   format='Netscape';
   input=s.split(/\r?\n/).filter(line=>line.trim()&&(!line.startsWith('#')||line.startsWith('#HttpOnly_'))).map((line,i)=>{
    const cols=line.split('\t');if(cols.length!==7)return {record:null,line:i+1};
    const session=cols[4]==='0',expiration=session?'':new Date(Number(cols[4])*1000).toISOString();
    return {line:i+1,record:{name:cols[5],value:cols[6],domain:cols[0].replace(/^#HttpOnly_/,''),path:cols[2],secure:cols[3].toUpperCase()==='TRUE',httpOnly:cols[0].startsWith('#HttpOnly_'),session,expiration}};
   });
  }else{
   format='Cookie Header';
   input=s.replace(/^Cookie:\s*/i,'').split(';').map((chunk,i)=>{
    const at=chunk.indexOf('=');return {line:i+1,record:at<1?null:{name:chunk.slice(0,at).trim(),value:chunk.slice(at+1).trim()}};
   });
  }
  if(input.length>100)return {error:'每批最多 100 条 Cookie，请分批导入。'};
  const rows=[],seen=new Set();
  for(const {record:c,line} of input){
   if(!c||typeof c!=='object'||Array.isArray(c)||typeof c.name!=='string'||!c.name.trim()||typeof c.value!=='string'||/[;\r\n\t]/.test(c.name)){invalid++;continue;}
   const domain=String(c.domain||demoSite).toLowerCase(),path=String(c.path||'/');
   if(![demoSite,'.example.com'].includes(domain))throw Error('第 '+line+' 条域名不属于当前网站：'+domain);
   if(!path.startsWith('/')||/[\r\n]/.test(path)){invalid++;continue;}
   if(c.partitioned&&!c.partitionKey)throw Error('第 '+line+' 条分区 Cookie 缺少 PartitionKey');
   let partitionKey=null;
   if(c.partitionKey){
    const key=c.partitionKey;
    if(typeof key.topLevelSite!=='string'||typeof key.hasCrossSiteAncestor!=='boolean')throw Error('第 '+line+' 条分区身份不完整');
    let origin;try{const url=new URL(key.topLevelSite);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error();origin=url.origin;}
    catch{throw Error('第 '+line+' 条分区顶级站点无效');}
    partitionKey={topLevelSite:origin,hasCrossSiteAncestor:key.hasCrossSiteAncestor};
   }
   const row={...newDraft(),...c,name:c.name.trim(),domain,path,storeId:String(c.storeId??'0'),partitionKey,value:c.value,id:'import-'+line,valueTouched:false};
   if(row.name.startsWith('__Host-')&&(!row.secure||row.path!=='/'||row.domain.startsWith('.')))throw Error('第 '+line+' 条违反 __Host- Cookie 身份约束');
   const key=identity(row);if(seen.has(key)){duplicate++;continue;}seen.add(key);rows.push(row);
  }
  if(!rows.length)return {error:invalid||duplicate?'没有可安全导入的有效 Cookie。':'没有可导入的 Cookie。'};
  return {rows,format,invalid,duplicate};
 }catch(e){return {error:'无法解析：'+e.message};}
}
function exportContent(rows,fmt,includeValue){
 if(fmt==='header')return rows.map(c=>c.name+'='+c.value).join('; ');
 if(fmt==='netscape')return '# Netscape HTTP Cookie File\n'+rows.map(c=>[c.httpOnly?'#HttpOnly_'+c.domain:c.domain,c.domain.startsWith('.')?'TRUE':'FALSE',c.path,c.secure?'TRUE':'FALSE',c.session?'0':String(Math.floor(new Date(c.expiration).getTime()/1000)),c.name,c.value].join('\t')).join('\n');
 return JSON.stringify(rows.map(c=>{const o={name:c.name,domain:c.domain,path:c.path,secure:c.secure,httpOnly:c.httpOnly,sameSite:c.sameSite,session:c.session,expiration:c.expiration||null,storeId:c.storeId,partitionKey:c.partitionKey};if(includeValue)o.value=c.value;return o;}),null,2);
}
export default function App(){
 const [rows,setRows]=React.useState(initialRows);const [scene,setScene]=React.useState('ready');const [dark,setDark]=React.useState(false);
 const [grantBusy,setGrantBusy]=React.useState(false);const [grantError,setGrantError]=React.useState('');
 const [query,setQuery]=React.useState('');const [filter,setFilter]=React.useState('all');const [sort,setSort]=React.useState('name');const [expandedFilters,setExpandedFilters]=React.useState(false);
 const [selected,setSelected]=React.useState(null);const [draft,setDraft]=React.useState(null);const [baseline,setBaseline]=React.useState(null);const [pending,setPending]=React.useState(null);const [reveal,setReveal]=React.useState(false);
 const [io,setIo]=React.useState(null);const [importText,setImportText]=React.useState('');const [fileName,setFileName]=React.useState('');const [overwrite,setOverwrite]=React.useState(false);const [format,setFormat]=React.useState('json');const [includeValues,setIncludeValues]=React.useState(true);
 const [confirm,setConfirm]=React.useState(null);const [saving,setSaving]=React.useState(false);const [needsVerify,setNeedsVerify]=React.useState(false);const [skipPartition,setSkipPartition]=React.useState(false);const [flash,setFlash]=React.useState(null);const [error,setError]=React.useState('');const [failNext,setFailNext]=React.useState('');
 const [version,setVersion]=React.useState(0); const fileRef=React.useRef(null);const fileReadRef=React.useRef(0);const epochRef=React.useRef(0); const focusKey=React.useRef(null);
 const needsSiteGrant=scene==='first';const loading=scene==='loading';
 const granted=!needsSiteGrant&&!loading;
 const canWrite=scene!=='readonly'&&granted; const canValues=granted&&scene!=='valuesDenied'; const busy=loading||saving||grantBusy;
 const current=selected==='new'?null:rows.find(x=>x.id===selected);
 const dirty=isDirty(draft,baseline);
 const notify=(text,tone='success')=>{setFlash({text,tone});setError('');};
 const resetEditor=()=>{setSelected(null);setDraft(null);setBaseline(null);setReveal(false);setPending(null);setError('');};
 const focusAfter=id=>{focusKey.current=id;};
 React.useEffect(()=>{if(focusKey.current){const k=focusKey.current;focusKey.current=null;requestAnimationFrame(()=>document.querySelector(k)?.focus());}},[selected,version]);
 React.useEffect(()=>{if(!flash?.ephemeral)return;const timer=setTimeout(()=>setFlash(v=>v===flash?null:v),2400);return()=>clearTimeout(timer);},[flash]);
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
 const useScene=v=>{epochRef.current++;setSaving(false);setGrantBusy(false);setGrantError('');setNeedsVerify(false);setScene(v);setFlash(null);setError('');setConfirm(null);setIo(null);resetEditor();setQuery('');if(v==='empty')setRows([]);else setRows(initialRows());};
 const requestGrant=async()=>{
   if(!needsSiteGrant||grantBusy)return;
   const epoch=epochRef.current;setGrantBusy(true);setGrantError('');setFlash(null);
   await sleep(420);
   if(epoch!==epochRef.current)return;
   setGrantBusy(false);
   if(failNext==='grantDenied'||failNext==='grantError'){
     setGrantError(failNext==='grantDenied'?'授权已取消或被拒绝。未读取本站 Cookie，可重新尝试。':'授权请求未完成，请检查权限后重试。');
     setFailNext('');
     return;
   }
   // PREVIEW ONLY: the real tool must await trusted Host grant + permission re-read.
   setScene('ready');setGrantError('');
   setFlash({text:'已允许访问本站 Cookie',tone:'success',ephemeral:true});
   focusAfter('[aria-label="搜索 Cookie"]');setVersion(v=>v+1);
 };
 const matching=c=>[c.name,c.domain,c.path].some(t=>t.toLowerCase().includes(query.toLowerCase()))&&(filter==='all'||(filter==='session'?c.session:filter==='partitioned'?!!c.partitionKey:!!c[filter]));
 const visible=rows.filter(matching).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='domain'?a.domain.localeCompare(b.domain):sort==='path'?a.path.localeCompare(b.path):(a.expiration||'').localeCompare(b.expiration||''));
 const pinned=current&&!visible.some(x=>x.id===current.id)?[current]:[];const shown=[...pinned,...visible];
 const importPlan=React.useMemo(()=>{
  if(!importText.trim())return null;
  const plan=parseInput(importText);if(plan.error)return plan;
  const added=plan.rows.filter(c=>!rows.some(r=>identity(c)===identity(r))).length;
  const replacing=plan.rows.length-added;
  return {...plan,added,replacing};
 },[importText,rows]);
 const importCount=importPlan&&!importPlan.error?importPlan.added+(overwrite?importPlan.replacing:0):0;
 const importSkipped=importPlan&&!importPlan.error?importPlan.invalid+importPlan.duplicate+(overwrite?0:importPlan.replacing):0;
 const startImport=()=>{setIo(io==='import'?null:'import');setConfirm(null);setError('');setFlash(null);};
 const startExport=()=>{if(io!=='export'){setFormat('json');setIncludeValues(true);setSkipPartition(false);}setIo(io==='export'?null:'export');setConfirm(null);setError('');setFlash(null);};
 const runImport=async()=>{
  if(!importPlan||importPlan.error||!importCount||saving||needsVerify)return;
  if(!canWrite){setError('当前仅可查看；写入需要网站授权。');return;}
  const epoch=epochRef.current,plan=importPlan,mayOverwrite=overwrite,count=importCount,skipped=importSkipped;
  setSaving(true);setError('');await sleep(320);
  if(epoch!==epochRef.current)return;setSaving(false);
  if(failNext==='unknown'||scene==='unknown'){setFailNext('');setNeedsVerify(true);setError('写入结果未知。请先刷新核对，勿重复提交；原始输入已保留。');return;}
  if(failNext==='import'){setFailNext('');setError('导入未完成：成功 0 · 失败 '+count+' · 跳过 '+skipped+'。输入已保留。');return;}
  setRows(old=>{
   const next=[...old];
   for(const c of plan.rows){
    const i=next.findIndex(x=>identity(x)===identity(c));
    if(i>=0&&!mayOverwrite)continue;
    const updated={...c,id:i<0?'imported-'+Math.random().toString(36).slice(2):next[i].id};
    if(i<0)next.unshift(updated);else next[i]=updated;
   }
   return next;
  });
  setIo(null);setImportText('');setFileName('');setOverwrite(false);
  notify('已导入 '+count+' 条 · 跳过 '+skipped+' 条（预览模拟）');
 };
 const runExport=async kind=>{
  if(saving||!granted)return;
  if((includeValues||format!=='json')&&!canValues){setError('尚无 Cookie 值读取权限。请授权，或在更多选项中选择仅导出属性。');return;}
  if(format!=='json'&&!skipPartition&&rows.some(c=>c.partitionKey)){setError('当前格式无法保留分区身份。请改用 JSON，或明确选择跳过分区 Cookie。');return;}
  if(failNext===kind||scene==='copyError'&&kind==='copy'||scene==='downloadError'&&kind==='download'){setFailNext('');setError(kind==='copy'?'复制失败：未写入剪贴板，可重试或下载。':'下载请求失败，请检查浏览器权限。');return;}
  const content=exportContent(format==='json'||!skipPartition?rows:rows.filter(c=>!c.partitionKey),format,includeValues||format!=='json');
  setSaving(true);setError('');
  try{
   if(kind==='copy'){
    if(!navigator.clipboard?.writeText)throw Error('NO_CLIPBOARD');
    await navigator.clipboard.writeText(content);
    notify('已写入剪贴板（虚构 Cookie）');
   }else{
    const blob=new Blob([content],{type:format==='json'?'application/json;charset=utf-8':'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='cookies-'+format+(format==='json'?'.json':'.txt');
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    notify('已发出下载请求（预览，无法验证文件落盘）');
   }
  }catch{setError(kind==='copy'?'未能写入剪贴板；可改用下载。':'无法提交下载请求，请检查浏览器设置。');}
  finally{setSaving(false);}
 };
 const handleConfirm=()=>{if(confirm?.type==='delete')runDelete();};
 const resetAll=()=>{epochRef.current++;setSaving(false);setGrantBusy(false);setGrantError('');setNeedsVerify(false);setRows(initialRows());setScene('ready');resetEditor();setIo(null);setFlash(null);setError('');setFilter('all');setQuery('');setImportText('');setFileName('');setOverwrite(false);fileReadRef.current++;setFailNext('');};
 const appKeydown=e=>{if(e.key!=='Escape')return;if(confirm){setConfirm(null);return;}if(pending){setPending(null);return;}if(selected!==null){requestClose();return;}if(io)setIo(null);};
 return <div className={'r49-page '+(dark?'theme-dark':'')}>
   <section className="demo-lab" aria-label="预览场景切换器"><div className="lab-title"><span>Cookie Editor R4.11</span><span className="lab-label">独立交互候选 · 虚构数据</span></div><div className="lab-controllers">
      <label>场景 <select data-testid="scenario" value={scene} onChange={e=>useScene(e.target.value)}><option value="ready">已授权</option><option value="first">未授权</option><option value="readonly">仅查看</option><option value="empty">空列表</option><option value="loading">正在读取</option><option value="valuesDenied">值未授权</option><option value="saveError">保存失败</option><option value="copyError">复制失败</option><option value="downloadError">下载失败</option><option value="unknown">写入结果未知</option></select></label>
      <label>下次操作 <select data-testid="failure" value={failNext} onChange={e=>setFailNext(e.target.value)}><option value="">正常</option><option value="save">保存失败</option><option value="import">导入失败</option><option value="copy">复制失败</option><option value="download">下载失败</option><option value="unknown">结果未知</option><option value="grantDenied">授权被拒绝</option><option value="grantError">授权请求失败</option></select></label>
      <button className="lab-button" type="button" onClick={()=>setDark(a=>!a)}>{dark?'浅色':'深色'}</button><button className="lab-button" type="button" onClick={resetAll}>重置</button>
   </div></section>
   <main className="cookie-app" onKeyDown={appKeydown} aria-label="Cookie Editor">
      <header className="site-bar">
        <span className="site-symbol"><Icon name="globe"/></span>
        <div className="site-name"><span>当前网站</span><strong title={demoSite}>{demoSite}</strong></div>
        {loading&&<span className="site-status muted">读取中</span>}
        {scene==='readonly'&&<span className="site-status limited">仅查看</span>}
        <IconButton name="refresh" label="刷新 Cookie" onClick={()=>{if(needsVerify){setNeedsVerify(false);setError('');notify('已核对模拟数据。请确认草稿后再保存。','neutral');return;}if(dirty){setError('有未保存的修改，请先保存或取消。');return;}setFlash(null);setError('');setVersion(v=>v+1);notify('已刷新 Cookie 列表')}} disabled={busy||!granted}/>
      </header>
      {!granted?<section className="permission-state" aria-label={loading?'正在读取 Cookie':'网站访问授权'}>
        <span className="permission-illustration"><Icon name={loading?'refresh':'shield'}/></span>
        <strong>{loading?'正在读取本站 Cookie…':'允许访问本站 Cookie'}</strong>
        <p>{loading?'正在检查网站与访问权限。':<>首次使用需要允许访问 <b>{demoSite}</b> 的 Cookie。</>}</p>
        {needsSiteGrant&&<button data-testid="request-access" className="text-btn primary permission-primary" type="button" disabled={grantBusy} onClick={requestGrant}>{grantBusy?'正在请求授权…':'允许访问'}</button>}
        {grantError&&needsSiteGrant&&<Message tone="error">{grantError}</Message>}
      </section>:<>
       <div className="list-toolbar"><strong>Cookie <span>{rows.length}</span></strong><div className="toolbar-actions"><IconButton name="download" label="导入 Cookie" onClick={startImport} disabled={busy||!canWrite}/><IconButton name="upload" label="导出 Cookie" onClick={startExport} disabled={busy}/><span className="action-separator"/><span data-action="new"><IconButton name="plus" label="新建 Cookie" onClick={()=>requestSwitch('new')} disabled={busy||!canWrite}/></span></div></div>
       <div className="searchbar"><div className="searchbox"><Icon name="search"/><input value={query} type="search" onChange={e=>setQuery(e.target.value)} placeholder="搜索名称、域名或路径" aria-label="搜索 Cookie"/></div><IconButton name="filter" label="筛选与排序" pressed={expandedFilters} onClick={()=>setExpandedFilters(v=>!v)}/></div>
       {expandedFilters&&<section className="filter-panel" aria-label="筛选与排序"><div className="filter-chips">{[['all','全部'],['secure','Secure'],['httpOnly','HttpOnly'],['session','会话'],['partitioned','分区']].map(([key,label])=><button key={key} type="button" className={'chip '+(filter===key?'selected':'')} onClick={()=>setFilter(key)} aria-pressed={filter===key}>{label}</button>)}</div><label className="sort-field">排序<select value={sort} onChange={e=>setSort(e.target.value)}><option value="name">名称</option><option value="domain">域名</option><option value="path">路径</option><option value="expiration">过期时间</option></select></label></section>}
       {flash&&<Message tone={flash.tone}>{flash.text}</Message>}
       {error&&selected===null&&!io&&<Message tone="error">{error}</Message>}
       {io==='import'&&<section className="io-panel import-panel" aria-label="导入 Cookie">
         <div className="panel-heading"><strong>导入 Cookie</strong><IconButton name="close" label="关闭导入" onClick={()=>setIo(null)} disabled={saving}/></div>
         <input type="file" accept=".json,.txt,text/plain,application/json" hidden ref={fileRef} onChange={async e=>{
          const f=e.target.files?.[0];if(!f)return;
          const token=++fileReadRef.current;e.target.value='';
          if(f.size>150000){setError('文件超过 150 KB；原输入已保留。');return;}
          try{const value=await f.text();if(token!==fileReadRef.current)return;setImportText(value);setFileName(f.name);setOverwrite(false);setError('');}
          catch{if(token===fileReadRef.current)setError('文件读取失败，可重新选择或粘贴。');}
         }}/>
         <div className="import-source">
          <button type="button" className="file-select" disabled={saving} onClick={()=>fileRef.current?.click()}><Icon name="upload"/>{fileName?'更换文件':'选择文件'}</button>
          {fileName&&<span className="selected-file" title={fileName}>{fileName}</span>}
          {!!importText&&<button type="button" className="clear-source" disabled={saving} onClick={()=>{fileReadRef.current++;setFileName('');setImportText('');setOverwrite(false);setError('');}}>清空</button>}
         </div>
         <Field label="或粘贴 Cookie 内容"><textarea aria-label="Cookie 内容" rows="5" disabled={saving} value={importText} onChange={e=>{fileReadRef.current++;setFileName('');setImportText(e.target.value);setOverwrite(false);setError('');}} placeholder={'[{"name":"theme","value":"dark"}]\n或 Cookie: theme=dark; locale=zh-CN'}/></Field>
         {importPlan?.error&&<Message tone="error">{importPlan.error}</Message>}
         {importPlan&&!importPlan.error&&<div className="import-summary" role="status">
           <strong>{importPlan.format} · {importPlan.rows.length+importPlan.invalid+importPlan.duplicate} 条</strong>
           <span>新增 {importPlan.added} · {overwrite?'覆盖':'重复'} {importPlan.replacing+importPlan.duplicate} · 无效 {importPlan.invalid}</span>
           {importPlan.replacing>0&&<label className="overwrite-option"><input type="checkbox" checked={overwrite} disabled={saving} onChange={e=>setOverwrite(e.target.checked)}/> 覆盖现有同身份 Cookie（默认跳过）</label>}
           {(importSkipped>0||overwrite)&&<small>将导入 {importCount} 条 · 跳过 {importSkipped} 条；按 Name / Domain / Path / Store / Partition 匹配</small>}
         </div>}
         <div className="panel-actions"><button className="text-btn" type="button" disabled={saving} onClick={()=>{setIo(null);setError('')}}>取消</button><button className="text-btn primary" type="button" disabled={!importCount||saving||needsVerify||!canWrite} onClick={runImport}>{saving?'导入中…':'导入 '+importCount+' 条'}</button></div>
       </section>}
       {io==='export'&&<section className="io-panel" aria-label="导出 Cookie"><div className="panel-heading"><strong>导出 Cookie</strong><IconButton name="close" label="关闭导出" onClick={()=>{setIo(null);setConfirm(null);setError('')}} disabled={saving}/></div>
         <div className="export-format"><Field label="格式"><select aria-label="导出格式" value={format} disabled={saving} onChange={e=>{setFormat(e.target.value);setConfirm(null);setSkipPartition(false);setError('')}}><option value="json">JSON · 推荐</option><option value="header">Cookie Header</option><option value="netscape">Netscape</option></select></Field></div>
         <p className="export-brief" role="status"><Icon name="check"/>{format==='json'&&!includeValues?'仅导出属性，不能用于恢复 Cookie 内容':`包含 Cookie 值 · ${format==='json'?'保留可导出属性':format==='header'?'仅名称与值':'兼容旧格式'}`}</p>
         {format!=='json'&&<p className="quiet-note">{format==='header'?'Cookie Header 不保留域名、路径等属性；不适合完整备份。':'Netscape 不保留 SameSite、Store、PartitionKey。'} 如需完整备份请选择 JSON。</p>}
         {format!=='json'&&rows.some(c=>c.partitionKey)&&<label className="partition-option"><input type="checkbox" checked={skipPartition} onChange={e=>{setSkipPartition(e.target.checked);setConfirm(null);setError('')}}/> 跳过 {rows.filter(c=>c.partitionKey).length} 条不支持的分区 Cookie</label>}
         {format==='json'&&<details className="export-advanced"><summary>更多选项</summary><label className="export-metadata"><input type="checkbox" checked={!includeValues} onChange={e=>{setIncludeValues(!e.target.checked);setConfirm(null);setError('')}}/>仅导出 Cookie 属性（不含值）</label><p className="quiet-note">仅用于查看和检查配置，不能恢复 Cookie 内容。</p></details>}
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
       {confirm?.type==='delete'&&<section className="confirmation" role="alertdialog" aria-modal="true" aria-label="确认操作"><p>{confirm.message}</p><div className="panel-actions"><button className="text-btn" onClick={()=>setConfirm(null)}>取消</button><button className="text-btn primary" id="r491-export-confirm-yes" onClick={handleConfirm} disabled={saving}>{saving?'处理中…':'确认'}</button></div></section>}
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
    <details className="advanced"><summary>属性与高级设置</summary><div className="advanced-body"><div className="pair"><Field label="Domain"><input value={draft.domain} onChange={e=>update('domain',e.target.value)} readOnly={selected!=='new'}/></Field><Field label="Path"><input value={draft.path} onChange={e=>update('path',e.target.value)} readOnly={selected!=='new'}/></Field></div><Field label="SameSite"><select value={draft.sameSite} onChange={e=>update('sameSite',e.target.value)} disabled={!canWrite||saving}><option value="lax">Lax</option><option value="strict">Strict</option><option value="none">None</option></select></Field><div className="toggles-row"><span className="toggles-label">选项</span><div className="toggles"><label><input type="checkbox" checked={draft.secure} onChange={e=>update('secure',e.target.checked)} disabled={!canWrite||saving}/> Secure</label><label><input type="checkbox" checked={draft.httpOnly} onChange={e=>update('httpOnly',e.target.checked)} disabled={!canWrite||saving}/> HttpOnly</label><label><input type="checkbox" checked={draft.session} onChange={e=>update('session',e.target.checked)} disabled={!canWrite||saving}/> Session</label></div></div>{!draft.session&&<Field label="过期时间"><input type="datetime-local" value={draft.expiration} onChange={e=>update('expiration',e.target.value)}/></Field>}<div className="identity-note">Store：{draft.storeId} · Partition：{draft.partitionKey?JSON.stringify(draft.partitionKey):'无'}（身份只读）</div></div></details>
    {error&&<Message tone="error">{error}</Message>}
    {pending!==null&&<div className="discard-row" role="status"><span>放弃当前未保存修改？</span><button type="button" className="text-btn" onClick={()=>setPending(null)}>继续编辑</button><button type="button" className="text-btn" onClick={discard}>放弃</button></div>}
    <div className="editor-actions">{selected!=='new'&&<button className="delete-btn" type="button" onClick={remove} disabled={saving||!canWrite}><Icon name="trash"/>删除</button>}<span className="spacer"/><button className="text-btn" type="button" onClick={requestClose} disabled={saving}>取消</button><button className="text-btn primary" type="button" onClick={save} disabled={!canWrite||saving||needsVerify}>{saving?'保存中…':'保存'}</button></div>
  </section>}
}
