// Bounded build-time resource adapter. Assets are frozen inside one program.js;
// no runtime URL fetch, extra host permission or privileged extension page.
import {posix,extname} from 'node:path';

export const ASSET_LIMITS=Object.freeze({css:24*1024,json:16*1024,image:32*1024});
export const ASSET_TOTAL_LIMIT=60*1024;
const MIME=Object.freeze({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'});
function fail(code,message,path) {
  const error=Object.assign(new Error(message),{code,phase:'assets',location:path});
  throw error;
}
function decode(bytes,path) {
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  catch{fail('E_PROJECT_ASSET_ENCODING','Asset must contain valid UTF-8: '+path,path);}
}
export function checkAssetBytes(asset,bytes) {
  const {path,kind}=asset;
  if(!ASSET_LIMITS[kind] || !bytes || bytes.length===0 || bytes.length>ASSET_LIMITS[kind])
    fail('E_PROJECT_ASSET_LIMIT','Asset exceeds its '+kind+' byte limit: '+path,path);
  if(kind==='css')return decode(bytes,path);
  if(kind==='json'){
    const text=decode(bytes,path);
    try{JSON.parse(text);}catch{fail('E_PROJECT_ASSET_JSON','Invalid JSON asset: '+path,path);}
    return text;
  }
  const ext=extname(path).toLowerCase();
  const png=ext==='.png' && Buffer.from(bytes.subarray(0,8)).equals(Buffer.from('89504e470d0a1a0a','hex'));
  const jpeg=['.jpg','.jpeg'].includes(ext) && bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  const webp=ext==='.webp' && bytes.subarray(0,4).toString()==='RIFF' &&
    bytes.subarray(8,12).toString()==='WEBP' && bytes.length>=12;
  if(!png&&!jpeg&&!webp)fail('E_PROJECT_ASSET_TYPE','Image signature does not match extension: '+path,path);
  return null;
}
function rewriteCss(css,sourcePath,images) {
  // Fail closed on runtime stylesheet imports and unsupported URL grammars.
  // Validate strings before removing comments; cleaning cannot repair bad input.
  let withoutComments='';
  for(let i=0;i<css.length;){
    if(css.startsWith('/*',i)){
      const end=css.indexOf('*/',i+2);
      if(end<0)fail('E_PROJECT_ASSET_URL','Unterminated CSS comment: '+sourcePath,sourcePath);
      withoutComments+=' ';i=end+2;continue;
    }
    const char=css[i];
    if(char==='"'||char==="'"){
      let end=i+1;
      while(end<css.length&&css[end]!==char){
        if(/[\\\r\n\f]/.test(css[end]))
          fail('E_PROJECT_ASSET_URL','Unsupported CSS string escape or newline: '+sourcePath,sourcePath);
        end++;
      }
      if(end===css.length)fail('E_PROJECT_ASSET_URL','Unterminated CSS string: '+sourcePath,sourcePath);
      withoutComments+=css.slice(i,end+1);i=end+1;continue;
    }
    if(char==='\\')fail('E_PROJECT_ASSET_URL','CSS escapes are not supported: '+sourcePath,sourcePath);
    withoutComments+=char;i++;
  }
  const strings=/"[^"\r\n\f]*"|'[^'\r\n\f]*'/g;
  const tokens=withoutComments.replace(strings,quoted=>' '.repeat(quoted.length));
  if(/\\/.test(withoutComments)||/["']|@import\b|\b(?:image(?:-set)?|src)\s*\(/i.test(tokens))
    fail('E_PROJECT_ASSET_URL','CSS escapes, malformed strings, string image sources and remote/data/import references are not supported: '+sourcePath,sourcePath);
  const urlPattern=/url\s*\(\s*(?:(["'])([^"']+)\1|([^'")\s]+))\s*\)/gi;
  const references=new Set([...tokens.matchAll(/\burl\s*\(/gi)].map(match=>match.index));
  const found=[...withoutComments.matchAll(urlPattern)].filter(match=>references.has(match.index));
  if(references.size!==found.length)
    fail('E_PROJECT_ASSET_URL','Unsupported CSS url() syntax: '+sourcePath,sourcePath);
  function resolved(spec) {
    if(!/^[A-Za-z0-9@._/-]+$/.test(spec)||spec.startsWith('/')||spec.includes('\\')||spec.includes('?')||spec.includes('#'))
      fail('E_PROJECT_ASSET_URL','CSS url() must name a declared relative image: '+spec,sourcePath);
    const normalized=posix.normalize(posix.join(posix.dirname(sourcePath),spec));
    if(normalized==='..'||normalized.startsWith('../')||!images.has(normalized))
      fail('E_PROJECT_ASSET_URL','CSS image is not declared in opendesk.assets: '+spec,sourcePath);
    return images.get(normalized);
  }
  return withoutComments.replace(urlPattern,(match,_quote,quoted,plain,offset)=>
    references.has(offset)?'url("'+resolved(quoted||plain)+'")':match);
}
export function buildAssetRecords(assets,bytesByPath) {
  let total=0;
  const images=new Map();
  for(const asset of assets){
    const bytes=bytesByPath.get(asset.path);
    checkAssetBytes(asset,bytes);
    total+=bytes.length;
    if(asset.kind==='image')images.set(asset.path,
      'data:'+MIME[extname(asset.path).toLowerCase()]+';base64,'+Buffer.from(bytes).toString('base64'));
  }
  if(total>ASSET_TOTAL_LIMIT)
    fail('E_PROJECT_ASSET_LIMIT','Declared assets exceed 60 KiB total','package.json#opendesk.assets');
  const records=Object.create(null);
  for(const asset of assets) {
    const bytes=bytesByPath.get(asset.path);
    const record=asset.kind==='image' ? {kind:'image',url:images.get(asset.path)} :
      asset.kind==='css' ? {kind:'css',text:rewriteCss(decode(bytes,asset.path),asset.path,images)} :
        {kind:'json',text:decode(bytes,asset.path)};
    records[asset.path]=record;
  }
  return records;
}
