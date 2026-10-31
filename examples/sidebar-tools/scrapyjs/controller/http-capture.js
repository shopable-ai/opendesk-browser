// Local development branch of the existing fixed Controller Task. Public
// production trials still require their separate immutable plan/approval gate.
import {extractStaticJson} from '../adapters/static-http-trial.mjs';
const ORIGIN='http://127.0.0.1:43121';
const DEFAULT_USER_AGENT='OpenDesk-NativeHTTP/1.0';
const MAX_TIMEOUT_MS=15000;
const bytes=value=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value)).byteLength;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
function target(value,base){
  let url;try{url=new URL(value,base);}catch{fail('E_HTTP_LOCAL_TARGET');}
  if(url.origin!==ORIGIN||url.username||url.password||url.href.includes('#'))fail('E_HTTP_LOCAL_TARGET');
  return url.href;
}
export function validateHttpCapture(input){
  if(!plain(input)||input.executionMode!=='http-local'||Object.keys(input).some(k=>
    !['executionMode','url','itemConfig','http','maxPages','timeoutMs'].includes(k)))fail('E_HTTP_LOCAL_CONFIG');
  if(typeof input.url!=='string'||!/^http:\/\/127\.0\.0\.1:43121(?:[/?#]|$)/.test(input.url))fail('E_HTTP_LOCAL_TARGET');
  target(input.url);
  const maxPages=input.maxPages===undefined?1:input.maxPages,timeoutMs=input.timeoutMs===undefined?MAX_TIMEOUT_MS:input.timeoutMs;
  if(!Number.isInteger(maxPages)||maxPages<1||maxPages>3||
    !Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)fail('E_HTTP_LOCAL_LIMIT');
  const http=input.http===undefined?{}:input.http;
  if(!plain(http)||Object.keys(http).some(k=>!['headers','userAgent'].includes(k))||
    http.userAgent!==undefined&&(typeof http.userAgent!=='string'||!(/^[\x20-\x7e]{0,512}$/).test(http.userAgent)))fail('E_HTTP_LOCAL_HEADER');
  const names=new Set();
  if(http.headers!==undefined){
    if(!plain(http.headers))fail('E_HTTP_LOCAL_HEADER');
    for(const [name,value]of Object.entries(http.headers)){
      const n=name.toLowerCase();
      if(!/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name)||typeof value!=='string'||!/^[\x20-\x7e]*$/.test(value)||
        /^(?:user-agent|host|origin|referer|cookie|authorization|connection|keep-alive|te|trailer|upgrade|expect|accept-encoding|content-length|transfer-encoding|proxy-.*|sec-.*|x-opendesk-.*)$/i.test(n)||
        ['__proto__','constructor','prototype'].includes(n)||names.has(n))fail('E_HTTP_LOCAL_HEADER');
      names.add(n);
    }
  }
  if(bytes(input)>8192||bytes(input.itemConfig??{})>4096||bytes({executionMode:input.executionMode,http,maxPages:input.maxPages})>4096)fail('E_HTTP_LOCAL_LIMIT');
  // The original JSON extractor validates keys and point paths before dispatch.
  extractStaticJson('{"data":[]}',input.itemConfig,{rootPath:'data'});
  const config=JSON.parse(JSON.stringify(input));
  if(config.timeoutMs!==undefined)config.timeoutMs=Math.min(config.timeoutMs,MAX_TIMEOUT_MS);
  return config;
}
export async function runHttpCapture(input,client,{now=Date.now}={}){
  const config=validateHttpCapture(input),http=config.http??{},data=[],requests=[],visited=new Set();
  const userAgent=http.userAgent||DEFAULT_USER_AGENT,deadline=now()+Math.min(config.timeoutMs??MAX_TIMEOUT_MS,MAX_TIMEOUT_MS);
  const remaining=()=>{const ms=deadline-now();if(ms<=0)fail('E_HTTP_LOCAL_TIMEOUT');return ms;};
  let url=target(config.url),total=0;
  for(let page=0;page<(config.maxPages??1);page++){
    if(visited.has(url))fail('E_HTTP_LOCAL_PAGINATION');visited.add(url);
    const options={transport:'native-http',headers:{...http.headers},userAgent,responseType:'text',timeout:remaining()};
    const response=await client.get(url,options);
    remaining();
    if(typeof response.data!=='string'||bytes(response.data)>8192)fail('E_HTTP_LOCAL_LIMIT');
    total+=bytes(response.data);
    const body=JSON.parse(response.data),rows=extractStaticJson(response.data,config.itemConfig,{rootPath:'data'});
    data.push(...rows);requests.push({...response.request,url,userAgent});
    if(bytes({data,requests})>8192)fail('E_HTTP_LOCAL_LIMIT');
    if(body.next==null)break;
    if(typeof body.next!=='string')fail('E_HTTP_LOCAL_PAGINATION');
    url=target(body.next,url);
  }
  remaining();
  return {data,stats:{requests:requests.length,pages:requests.length,bytes:total},
    engine:{status:'completed',transport:'native-http'},audit:{requests}};
}
