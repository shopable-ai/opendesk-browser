// One reviewed source controls the website, manifest and private host config.
import {readFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
export const MARKET_CHANNEL_PATH='marketplace/channel.json';
export const MARKET_PROTOCOL='opendesk.market.intent.v1';
const keys=(v,list)=>v&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).sort().join(',')===[...list].sort().join(',');
const extensionId=value=>typeof value==='string'&&/^[a-p]{32}$/.test(value);
export function marketOrigin(value,mode){
  if(typeof value!=='string'||value.length>200)throw Error('Invalid market origin');
  let url;try{url=new URL(value);}catch{throw Error('Invalid market origin');}
  if(url.origin!==value||url.username||url.password||url.pathname!=='/'||url.search||url.hash)
    throw Error('Market requires an exact bare origin');
  if(mode==='development'){
    if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port)
      throw Error('Development market must use an explicit 127.0.0.1 HTTP port');
  }else if(url.protocol!=='https:'||url.port||!url.hostname.includes('.')||
      /(^|\.)(localhost|local|test|invalid|example)$/.test(url.hostname)||
      /(^|\.)(example\.com|example\.org|example\.net)$/.test(url.hostname)||
      /^[\d.]+$/.test(url.hostname)||url.hostname.includes(':'))
    throw Error('Production market requires a reviewed public HTTPS origin on port 443');
  return url.origin;
}
export function unpackedExtensionId(path){
  let input=resolve(path);try{input=realpathSync(input);}catch{/* The first build creates this directory. */}
  return createHash('sha256').update(input).digest('hex').slice(0,32)
    .replace(/[0-9a-f]/g,c=>String.fromCharCode(97+parseInt(c,16)));
}
export function resolveMarketChannel({mode='production',env=process.env,
  source=JSON.parse(readFileSync(new URL('../src/marketplace/channel-config.json',import.meta.url),'utf8')),
  unpackedPath=resolve('dist/development')}={}){
  if(!['production','development'].includes(mode)||
    !keys(source,['schema','protocol','production','development'])||
    source.schema!=='opendesk.market.channel-source.v1'||source.protocol!==MARKET_PROTOCOL||
    !keys(source.production,['origin','extensionId','acquireUrl','verifiedAt'])||
    !keys(source.development,['origin','extensionId']))throw Error('Invalid reviewed market channel configuration');
  const selected=source[mode];
  if(mode==='production'){
    const present=Object.values(selected).filter(value=>value!==null).length;
    if(present!==0&&present!==4)throw Error('Production origin, ID, verified acquisition URL and verification date are required together');
    if(present){
      marketOrigin(selected.origin,mode);
      if(!extensionId(selected.extensionId))throw Error('Invalid production extension ID');
      const url=new URL(selected.acquireUrl);
      if(url.origin!=='https://chromewebstore.google.com'||url.search||url.hash||url.username||url.password||
        !new RegExp('^/detail/[a-z0-9-]+/'+selected.extensionId+'$').test(url.pathname)||
        !/^20\d{2}-\d{2}-\d{2}$/.test(selected.verifiedAt)||!Number.isFinite(Date.parse(selected.verifiedAt)))
        throw Error('Expected an independently verified official Chrome Web Store listing for the configured ID');
    }
    return {schema:'opendesk.market.channel.v1',mode,protocol:MARKET_PROTOCOL,enabled:Boolean(present),
      origin:selected.origin,extensionId:selected.extensionId,acquireUrl:selected.acquireUrl,verifiedAt:selected.verifiedAt};
  }
  const origin=marketOrigin(env.OPENDESK_MARKET_DEV_ORIGIN||selected.origin,mode);
  const id=env.OPENDESK_MARKET_DEV_EXTENSION_ID||selected.extensionId||unpackedExtensionId(unpackedPath);
  if(!extensionId(id))throw Error('Invalid actual development extension ID');
  return {schema:'opendesk.market.channel.v1',mode,protocol:MARKET_PROTOCOL,enabled:true,
    origin,extensionId:id,acquireUrl:null,verifiedAt:null};
}
export function marketExternalConnectable(channel){
  if(!channel.enabled)return undefined;
  // Omitting a port in Chrome match patterns matches every port. The host also
  // verifies exact Origin independently, including the port.
  return {matches:[channel.origin+(channel.mode==='production'?':443':'')+'/*']};
}
