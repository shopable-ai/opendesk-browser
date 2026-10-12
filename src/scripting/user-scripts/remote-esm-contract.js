// Shared SOURCE DATA policy for the existing local resolver and browser
// component preparer. No network, parser payload execution or Chrome authority.
export const REMOTE_LIMITS=Object.freeze({modules:32,moduleBytes:128*1024,totalBytes:256*1024});
// Opt-in Page library graph; v1 and Controller budgets stay unchanged.
// Measured ECharts 5.6.0 bar/grid/SVG: 234 modules, 1,744,184 B,
// largest module 84,388 B. Only count/aggregate need a larger profile.
export const REMOTE_PAGE_LIBRARY_LIMITS=Object.freeze({modules:256,moduleBytes:128*1024,totalBytes:2*1024*1024});
const fail=(code,message)=>{throw Object.assign(new Error(message),{code,phase:'remote'});};
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(value));
const keys=(value,want)=>plain(value)&&Object.keys(value).sort().join(',')===[...want].sort().join(',');
export function remoteURL(value){
  if(typeof value!=='string'||value.length>2048)fail('E_REMOTE_URL','Remote import URL is missing or too long');
  let url;try{url=new URL(value);}catch{fail('E_REMOTE_URL','Invalid remote import URL');}
  const host=url.hostname.toLowerCase();
  const secret=/^(?:token|access_token|refresh_token|id_token|auth|authorization|api_?key|secret|client_secret|password|passwd|jwt|session_?token|signature|sig|key|(?:x_amz|x_goog)_signature)$/i;
  if([...url.searchParams.keys()].some(name=>secret.test(name.replaceAll('-','_'))))
    fail('E_REMOTE_URL_SECRET','Remote ESM URL has a credential-like query parameter; use a public immutable dependency URL');
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||
    !host.includes('.')||host.endsWith('.')||host.includes(':')||/^\d+(?:\.\d+){3}$/.test(host)||
    host==='localhost'||['.localhost','.local','.internal','.test','.invalid'].some(s=>host.endsWith(s))||
    url.pathname==='/'||/[\u0000-\u001f\\]/.test(value))
    fail('E_REMOTE_URL','Remote ESM must use a public HTTPS host without credentials, custom port or fragment');
  return url.href;
}
export function validateRemoteImports(imports={}){
  if(!plain(imports)||Object.keys(imports).length>8)fail('E_REMOTE_IMPORT','Invalid fixed remote resolution map');
  for(const [name,target] of Object.entries(imports)){
    if(!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:\/[A-Za-z0-9._/-]*)?$/.test(name)||
      name.split('/').some(p=>p==='.'||p==='..')||['react','react-dom','vue'].some(p=>name===p||name.startsWith(p+'/'))||
      remoteURL(target)!==target||name.endsWith('/')!==target.endsWith('/'))
      fail('E_REMOTE_IMPORT','Remote package mappings must be explicit public HTTPS files or prefixes; framework remapping is forbidden');
  }
  return imports;
}
export function resolveRemoteImport(spec,base,imports={}){
  if(typeof spec!=='string')fail('E_REMOTE_IMPORT','Only literal static ESM imports are supported');
  if(spec.startsWith('https:'))return remoteURL(spec);
  if(spec.startsWith('./')||spec.startsWith('../')||spec.startsWith('/'))return remoteURL(new URL(spec,base).href);
  if(Object.hasOwn(imports,spec))return remoteURL(imports[spec]);
  const prefix=Object.keys(imports).filter(k=>k.endsWith('/')&&spec.startsWith(k)).sort((a,b)=>b.length-a.length)[0];
  if(prefix){
    const suffix=spec.slice(prefix.length);
    if(!suffix||suffix.split('/').some(p=>!p||p==='.'||p==='..')||/[?#\\]/.test(suffix))
      fail('E_REMOTE_IMPORT','Remote mapped subpath escaped its fixed prefix');
    return remoteURL(imports[prefix]+suffix);
  }
  fail('E_REMOTE_IMPORT','Remote ESM contains an unsupported bare, HTTP or other import: '+spec);
}
export function analyzeRemoteAST(ast,url,imports={}){
  const body=ast?.program?.body??ast?.body;
  if(!Array.isArray(body))fail('E_REMOTE_SYNTAX','Remote source is not an ESM syntax tree');
  const refs=[],seen=new Set();let esm=false;
  for(const row of body){
    if(['ImportDeclaration','ExportNamedDeclaration','ExportDefaultDeclaration','ExportAllDeclaration'].includes(row.type))esm=true;
    if(!['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(row.type)||!row.source)continue;
    const next=resolveRemoteImport(row.source.value,url,imports);
    refs.push({start:row.source.start,end:row.source.end,url:next});seen.add(next);
  }
  const dynamic=callee=>{
    if(callee?.type==='Identifier')return ['require','eval','Function','AsyncFunction'].includes(callee.name);
    if(callee?.type!=='MemberExpression'||callee.object?.type!=='Identifier'||!['globalThis','window','self'].includes(callee.object.name))return false;
    return ['require','eval','Function','AsyncFunction'].includes(callee.computed?callee.property?.value:callee.property?.name);
  };
  const pending=[ast];let count=0;
  while(pending.length){
    const node=pending.pop();if(!node||typeof node!=='object')continue;
    if(++count>150000)fail('E_REMOTE_LIMIT','Remote module syntax exceeds its bounded AST budget');
    if(node.type==='ImportExpression'||node.type==='MetaProperty'||
      ['CallExpression','NewExpression'].includes(node.type)&&(dynamic(node.callee)||node.callee?.type==='Import'))
      fail('E_REMOTE_DYNAMIC','Remote modules cannot contain import(), require() or dynamic code evaluation: '+url);
    for(const [key,value] of Object.entries(node)){
      if(['loc','extra','leadingComments','trailingComments','innerComments','comments','tokens'].includes(key))continue;
      if(Array.isArray(value))pending.push(...value);else if(value&&typeof value==='object')pending.push(value);
    }
  }
  if(!esm)fail('E_REMOTE_SYNTAX','Remote module must contain actual ESM import/export declarations; UMD is not ESM');
  return {refs,children:[...seen].sort()};
}
export function remoteLockLimits(lock){
  return lock?.format==='opendesk.remote-lock.v2'?REMOTE_PAGE_LIBRARY_LIMITS:REMOTE_LIMITS;
}
export function validateRemoteLock(raw){
  const v2=raw?.format==='opendesk.remote-lock.v2';
  if(!keys(raw,v2?['format','profile','imports','modules']:['format','modules'])||
    (!v2&&raw.format!=='opendesk.remote-lock.v1')||v2&&raw.profile!=='page-library-v1'||!plain(raw.modules))
    fail('E_REMOTE_LOCK','Invalid remote import lock format');
  if(v2)validateRemoteImports(raw.imports);
  const limits=remoteLockLimits(raw);let total=0;
  for(const [url,row] of Object.entries(raw.modules)){
    if(remoteURL(url)!==url||!keys(row,['sha256','bytes'])||!/^[a-f0-9]{64}$/.test(row.sha256)||
      !Number.isInteger(row.bytes)||row.bytes<1||row.bytes>limits.moduleBytes)
      fail('E_REMOTE_LOCK','Remote import lock contains an invalid entry: '+url);
    total+=row.bytes;
  }
  if(Object.keys(raw.modules).length>limits.modules||total>limits.totalBytes)
    fail('E_REMOTE_LIMIT','Pinned remote graph exceeds its versioned capacity');
  return raw;
}
