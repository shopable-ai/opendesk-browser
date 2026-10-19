// Cookie Editor owner: this is mechanically extracted from the v2.0.23 release
// model. No SDK or React imports, so offline logic and native operations share
// the exact same validation, identity and format behavior.


function parseTarget(input){
  if(typeof input!=='string'||input.length>2048||input.trim()!==input)throw new Error('请输入不超过 2048 字符的 HTTP(S) 网页地址');
  let url;try{url=new URL(input);}catch{throw new Error('请输入有效的 HTTP(S) 网页地址');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||
      !/^[a-z0-9.-]{1,253}$/i.test(url.hostname)||url.hostname.startsWith('.')||url.hostname.endsWith('.'))
    throw new Error('仅支持不含账号密码的普通 HTTP(S) 网站');
  // A path matters for native Cookie matching; never carry query/fragment tokens.
  return {hostname:url.hostname,origin:url.origin,url:url.origin+url.pathname};
}

function redactMetadata(rows){
  if(!Array.isArray(rows))throw new Error('SDK 返回的 Cookie 列表无效');
  return rows.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||
       typeof row.name!=='string'||typeof row.domain!=='string'||
       typeof row.path!=='string')throw new Error('SDK 返回的 Cookie 元数据无效');
    // Even if a faulty host returns value, discard it. A separate values grant
    // and a confirmed public result contract are prerequisites for disclosure.
    const {name,domain,path}=row;
    return {name,domain,path,hostOnly:row.hostOnly===true,secure:row.secure===true,
      httpOnly:row.httpOnly===true,sameSite:typeof row.sameSite==='string'?row.sameSite:'unspecified',
      session:row.session===true,expirationDate:Number.isFinite(row.expirationDate)?row.expirationDate:undefined,
      storeId:typeof row.storeId==='string'?row.storeId:undefined,
      partitionKey:row.partitionKey&&typeof row.partitionKey.topLevelSite==='string'?
        {topLevelSite:row.partitionKey.topLevelSite,
          ...(typeof row.partitionKey.hasCrossSiteAncestor==='boolean'?
            {hasCrossSiteAncestor:row.partitionKey.hasCrossSiteAncestor}:{})}:undefined,
      valueRedacted:true};
  });
}

const MAX_IMPORT_BYTES=8*1024*1024;
const safeHost=value=>typeof value==='string'&&/^[a-z0-9.-]{1,253}$/i.test(value)&&!value.startsWith('.')&&!value.endsWith('.');


const key=row=>JSON.stringify([row.name,row.domain,row.path,row.hostOnly===true,
  row.storeId??null,row.partitionKey?.topLevelSite??null,
  Boolean(row.partitionKey?.hasCrossSiteAncestor)]);
// A name change keeps the original scope. Chrome has no atomic rename.
const sameCookieScope=(a,b)=>a.domain===b.domain&&a.path===b.path&&
  a.hostOnly===b.hostOnly&&(a.storeId??null)===(b.storeId??null)&&
  (a.partitionKey?.topLevelSite??null)===(b.partitionKey?.topLevelSite??null)&&
  Boolean(a.partitionKey?.hasCrossSiteAncestor)===Boolean(b.partitionKey?.hasCrossSiteAncestor);
const sameCookieMetadata=(a,b)=>sameCookieScope(a,b)&&
  a.secure===b.secure&&a.httpOnly===b.httpOnly&&a.session===b.session&&
  a.sameSite===b.sameSite&&
  (a.expirationDate??null)===(b.expirationDate??null);
const nativeSlotKey=row=>JSON.stringify([row.name,
  row.domain.replace(/^\./,'').toLowerCase(),row.path,row.storeId??null,
  row.partitionKey?.topLevelSite??null,Boolean(row.partitionKey?.hasCrossSiteAncestor)]);
const sameNativeSlot=(a,b)=>nativeSlotKey(a)===nativeSlotKey(b);

function normalizeCookie(raw,hostname,allowExpired=false){
  if(!hostname||!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Cookie 记录无效');
  if(raw.valueRedacted===true)throw new Error('Cookie 值未提供，不能当作空值导入或写入');
  const name=raw.name,value=raw.value;
  const domain=String(raw.domain||hostname).trim().toLowerCase();
  const host=domain.replace(/^\./,'');
  const path=raw.path??'/';
  const hostOnly=typeof raw.hostOnly==='boolean'?raw.hostOnly:!domain.startsWith('.');
  if(['hostOnly','secure','httpOnly','session'].some(field=>raw[field]!==undefined&&typeof raw[field]!=='boolean'))
    throw new Error('hostOnly、secure、httpOnly、session 字段必须是布尔值');
  if(raw.storeId!=null&&(typeof raw.storeId!=='string'||!raw.storeId||raw.storeId.length>80))
    throw new Error('storeId 必须是有效的存储区字符串');
  if(typeof name!=='string'||!name||name.length>256||/[\s;=\x00-\x1f\x7f]/.test(name))
    throw new Error('Cookie 名称不可为空，不能包含空白、分号、等号或控制字符');
  if(typeof value!=='string'||value.length>4096||/[\r\n\x00]/.test(value))
    throw new Error('Cookie 值长度或字符不合法');
  if(!safeHost(host)||!(hostname===host||hostname.endsWith('.'+host))||
      (hostOnly&&host!==hostname))throw new Error('Cookie 域名必须属于当前网站，Host-only 不能跨主机');
  if(typeof path!=='string'||!path.startsWith('/')||path.length>512||/[\r\n\x00]/.test(path))
    throw new Error('Cookie 路径 path 必须以 / 开头，长度不超过 512（SDK 路径限制）');
  const secure=raw.secure===true,httpOnly=raw.httpOnly===true;
  const sameSite=raw.sameSite||'unspecified';
  if(!['unspecified','lax','strict','no_restriction'].includes(sameSite)||
      (sameSite==='no_restriction'&&!secure))throw new Error('SameSite=None 必须同时使用 Secure');
  if((name.startsWith('__Secure-')&&!secure)||
      (name.startsWith('__Host-')&&(!secure||!hostOnly||path!=='/')))
    throw new Error('Cookie 前缀 __Secure- / __Host- 与安全属性不一致');
  const session=typeof raw.session==='boolean'?raw.session:!(Number(raw.expirationDate)>0);
  const expiration=Number(raw.expirationDate);
  if(!session&&(!Number.isFinite(expiration)||(!allowExpired&&expiration<=Date.now()/1000)||expiration<0||expiration>253402300799))
    throw new Error('持久 Cookie 需要有效的未来过期时间');
  let partitionKey;
  if(raw.partitionKey!==undefined){
    if(!raw.partitionKey||typeof raw.partitionKey!=='object'||Array.isArray(raw.partitionKey)||
        typeof raw.partitionKey.topLevelSite!=='string'||raw.partitionKey.topLevelSite.length>260)
      throw new Error('Cookie 分区键无效');
    partitionKey={topLevelSite:raw.partitionKey.topLevelSite};
    if(typeof raw.partitionKey.hasCrossSiteAncestor==='boolean')
      partitionKey.hasCrossSiteAncestor=raw.partitionKey.hasCrossSiteAncestor;
  }
  const cookie={name,value,domain,hostOnly,path,secure,httpOnly,sameSite,session,
    ...(!session?{expirationDate:expiration}:{}),
    ...(typeof raw.storeId==='string'&&raw.storeId.length<=80?{storeId:raw.storeId}:{}),
    ...(partitionKey?{partitionKey}:{})};
  return cookie;
}

function nativeInput(row,target){
  if(!target||row.domain.replace(/^\./,'').toLowerCase()!==target.hostname)
    throw new Error('当前 SDK 限定精确主机 Domain，请切换到该 Cookie 的所属主机');
  // A Cookie Path containing raw URL delimiters or unsupported characters
  // cannot be represented by the exact Chrome URL needed for readback/remove.
  const lookup=new URL(target.origin);lookup.pathname=row.path;
  if(lookup.pathname!==row.path)
    throw new Error('Cookie Path 无法无损映射为 Chrome URL，请使用标准 URL 编码的路径');
  return {url:lookup.href,name:row.name,value:row.value,path:row.path,
    ...(row.hostOnly?{}:{domain:row.domain}),secure:row.secure,httpOnly:row.httpOnly,
    sameSite:row.sameSite,...(row.session?{}:{expirationDate:row.expirationDate}),
    ...(row.storeId?{storeId:row.storeId}:{}),
    ...(row.partitionKey?{partitionKey:row.partitionKey}:{})};
}

function exportText(format,rows){
  if(!Array.isArray(rows)||!rows.length)throw new Error('当前没有可导出的 Cookie');
  if(format==='json')return JSON.stringify(rows,null,2)+'\n';
  if(format==='header'){
    if(rows.some(row=>row.partitionKey))throw new Error('Cookie Header 不支持分区 Cookie，请使用 JSON 保留完整字段');
    if(rows.some(row=>/[;\r\n\x00]/.test(row.name)||/[;\r\n\x00]/.test(row.value)))
      throw new Error('Cookie Header 无法无损表达该名称或值，请选择 JSON');
    return rows.map(row=>row.name+'='+row.value).join('; ')+'\n';
  }
  if(format==='netscape'){
    if(rows.some(row=>row.partitionKey))throw new Error('Netscape 不支持分区 Cookie，请使用 JSON 保留完整字段');
    if(rows.some(row=>[row.name,row.value,row.domain,row.path].some(value=>/[\t\r\n\x00]/.test(value))))
      throw new Error('Netscape 无法表示包含制表符或换行的字段，请使用 JSON');
    return '# Netscape HTTP Cookie File\n'+rows.map(row=>[
      (row.httpOnly?'#HttpOnly_':'')+row.domain,
      row.hostOnly?'FALSE':'TRUE',row.path,row.secure?'TRUE':'FALSE',
      row.session?'0':String(Math.floor(row.expirationDate)),
      row.name,row.value
    ].join('\t')).join('\n')+'\n';
  }
  throw new Error('请选择受支持的导出格式');
}

function inspectImport(text,format,hostname){
  if(typeof text!=='string'||!text.trim())throw new Error('请输入 Cookie 文本');
  if(new Blob([text]).size>MAX_IMPORT_BYTES)
    throw new Error('Cookie 文本超过 8 MiB 内存保护预算；输入已保留');
  let rows;
  const trimmed=text.replace(/^\uFEFF/,'').trim();
  if(format==='auto'){
    if(trimmed.startsWith('[')||trimmed.startsWith('{'))format='json';
    else if(trimmed.startsWith('# Netscape HTTP Cookie File')||text.split(/\r?\n/).some(line=>line.split('\t').length===7))format='netscape';
    else format='header';
  }
  if(format==='json'){
    let value;try{value=JSON.parse(trimmed);}catch{throw new Error('JSON 语法无效：请检查括号、逗号和引号（不会显示 Cookie 值）');}
    if(Array.isArray(value))rows=value;
    else if(value?.cookies&&Array.isArray(value.cookies))rows=value.cookies;
    else if(value&&typeof value==='object'&&typeof value.name==='string'&&'value' in value)rows=[value];
    else if(value&&typeof value==='object'&&!Array.isArray(value)&&
      Object.values(value).every(v=>typeof v==='string')){
      rows=Object.entries(value).map(([name,value])=>({name,value}));
    }else throw new Error('JSON 需是 Cookie 数组、带 cookies 数组的对象或名称到字符串的字典');
  }else if(format==='header'){
    const input=trimmed.replace(/^Cookie:[ \t]*/gim,'');
    rows=input.split(/[;\r\n]+/).map(v=>v.trim()).filter(Boolean).map(entry=>{
      const i=entry.indexOf('=');
      if(i<=0)return {importError:'Cookie Header 项必须为 name=value'};
      return {name:entry.slice(0,i).trim(),value:entry.slice(i+1),domain:hostname,path:'/'};
    });
  }else if(format==='netscape'){
    rows=text.replace(/^\uFEFF/,'').split(/\r?\n/).map((line,index)=>({line,index:index+1}))
      .filter(({line})=>line.trim()&&(!line.trimStart().startsWith('#')||line.startsWith('#HttpOnly_'))).map(({line,index})=>{
      const c=line.split('\t');
      const invalid=reason=>({importError:'第 '+index+' 行：'+reason});
      if(c.length!==7)return invalid('Netscape 数据行必须为 7 个制表符分隔列');
      if(!['TRUE','FALSE'].includes(c[1])||!['TRUE','FALSE'].includes(c[3]))
        return invalid('Netscape 的子域和 Secure 列只能为 TRUE 或 FALSE');
      const domain=c[0].replace(/^#HttpOnly_/,'');
      const expires=Number(c[4]);
      if(!c[4].trim()||!Number.isFinite(expires))return invalid('Netscape 过期时间必须为 Unix 秒数');
      return {name:c[5],value:c[6],domain,path:c[2],hostOnly:c[1]==='FALSE',
        secure:c[3]==='TRUE',httpOnly:c[0].startsWith('#HttpOnly_'),
        session:expires===0,...(expires?{expirationDate:expires}:{})};
    });
  }else throw new Error('请选择支持的 Cookie 格式');
  if(!rows.length)throw new Error('没有可预览的 Cookie');
  const records=rows.map((raw,index)=>{
    try{
      if(format!=='json'&&raw?.importError)throw new Error(raw.importError);
      const cookie=normalizeCookie(raw,hostname,true);
      return {index:index+1,cookie,status:!cookie.session&&cookie.expirationDate<=Date.now()/1000?'expired':'ready',
        reason:!cookie.session&&cookie.expirationDate<=Date.now()/1000?'expirationDate 已过期，跳过；不会改成会话 Cookie':''};
    }catch(error){return {index:index+1,status:'invalid',reason:String(error.message)};}
  });
  return {format,records};
}
function rejectImportDuplicates(records){
  const seen=new Map();
  for(const entry of records){
    if(entry.status!=='ready')continue;
    const identity=nativeSlotKey(entry.cookie),previous=seen.get(identity);
    if(previous){
      previous.status=entry.status='invalid';
      previous.reason=entry.reason='重复 Cookie 身份，请合并后重新预览（不自动选择覆盖顺序）';
    }else seen.set(identity,entry);
  }
}

async function readAllCookies(sdk,args,isCurrent=()=>true){
  if(!isCurrent())return null;
  if(typeof sdk.cookies.getAllPage!=='function'){
    const rows=await sdk.cookies.getAll(args);
    return isCurrent()?rows:null;
  }
  const rows=[],seen=new Set();let cursor;
  do{
    const page=await sdk.cookies.getAllPage({...args,...(cursor?{cursor}:{})});
    if(!isCurrent())return null;
    if(!Array.isArray(page?.cookies)||page.nextCursor!==undefined&&
        (typeof page.nextCursor!=='string'||!page.nextCursor||seen.has(page.nextCursor)))
      throw Object.assign(new Error('Host 返回了无效 Cookie 分页，请刷新'),{code:'E_SCHEMA'});
    rows.push(...page.cookies);cursor=page.nextCursor;
    if(cursor)seen.add(cursor);
  }while(cursor);
  return rows;
}
async function scopedLiveCookies(sdk,target,{includeValues=false,isCurrent=()=>true}={}){
  if(typeof sdk?.cookies?.getAll!=='function'||typeof sdk.cookies.getPartitionKey!=='function')
    throw new Error('正式 Browser SDK 缺少真实 Cookie 分区查询接口');
  const normal=await readAllCookies(sdk,{url:target.url,...(includeValues?{includeValues:true}:{})},isCurrent);
  if(!isCurrent())return null;
  if(!Array.isArray(normal))throw new Error('Host 的普通 Cookie 返回不是数组');
  const partition=await sdk.cookies.getPartitionKey({url:target.url});
  if(!isCurrent())return null;
  if(!partition?.partitionKey?.topLevelSite)throw new Error('无法确定已授权 Partition');
  const partitioned=await readAllCookies(sdk,{url:target.url,
    partitionKey:partition.partitionKey,...(includeValues?{includeValues:true}:{})},isCurrent);
  if(!isCurrent())return null;
  if(!Array.isArray(partitioned))throw new Error('Host 的分区 Cookie 返回不是数组');
  const combined=new Map();
  for(const row of [...normal,...partitioned]){
    if(!row||typeof row.name!=='string'||typeof row.domain!=='string'||typeof row.path!=='string')
      throw new Error('Host 返回了无效 Cookie 身份');
    const identity=key(row);
    if(combined.has(identity))throw new Error('Host 返回同一 Cookie 身份的重复记录，请刷新');
    combined.set(identity,row);
  }
  return [...combined.values()];
}

export {parseTarget,redactMetadata,key,sameCookieScope,sameCookieMetadata,sameNativeSlot,
 normalizeCookie,nativeInput,exportText,inspectImport,rejectImportDuplicates,
 readAllCookies,scopedLiveCookies};
