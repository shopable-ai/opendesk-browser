// Minimal scoped asset store: existing Side Panel authorization, per-tool lock and Chrome local.
// Stored separately from the legacy 8-KiB text library; no external upload or second Host.
import {writeVerifiedLocalValue} from '../../../src/ui/sidebar-tools/storage-state.js';
import {PROMPT_DATA_STORE} from './policy.js';
import {PROMPT_ASSET_STORE,PROMPT_ASSET_OPERATIONS,PROMPT_ASSET_ID,
  PROMPT_ASSET_MAX_BYTES,PROMPT_ASSET_MAX_COUNT,PROMPT_ASSET_MAX_TOTAL,
  PROMPT_ASSET_MIME,imageAssetDataUrl} from './asset-contract.js';

const fail=(message,code='E_PROMPT_ASSET')=>{throw Object.assign(new Error(message),{code});};
function decodeBase64(source,mime){
  if(typeof source!=='string'||source.length>90000)fail('图片内容过大或无效','E_IMAGE_LIMIT');
  const prefix='data:'+mime+';base64,';
  if(!source.startsWith(prefix))fail('图片类型无效');
  const base64=source.slice(prefix.length);
  if(base64.length<8||base64.length>88000||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))fail('无效图片编码');
  const text=globalThis.atob(base64);
  if(text.length<12||text.length>PROMPT_ASSET_MAX_BYTES)fail('图片需处理到 64 KiB 以下','E_IMAGE_LIMIT');
  const header=Array.from(text.slice(0,16),x=>x.charCodeAt(0));
  const png=mime==='image/png'&&[137,80,78,71,13,10,26,10].every((b,i)=>header[i]===b);
  const jpeg=mime==='image/jpeg'&&header[0]===255&&header[1]===216&&header[2]===255;
  const webp=mime==='image/webp'&&text.slice(0,4)==='RIFF'&&text.slice(8,12)==='WEBP';
  if(!png&&!jpeg&&!webp)fail('图片头与格式不符，已拒绝保存');
  return {base64,bytes:text.length,mime};
}
function inventory(value){
  if(value===undefined)return {schema:1,assets:{}};
  if(!value||value.schema!==1||!value.assets||typeof value.assets!=='object'||
    Array.isArray(value.assets))fail('图片资源库异常，已停止修改','E_STORAGE_CORRUPT');
  const entries=Object.entries(value.assets);
  if(entries.length>PROMPT_ASSET_MAX_COUNT||
    entries.some(([id,a])=>!imageAssetDataUrl(a,id)||!Number.isFinite(a.createdAt)))
    fail('图片资源库异常，已停止修改','E_STORAGE_CORRUPT');
  if(entries.reduce((n,[,a])=>n+a.bytes,0)>PROMPT_ASSET_MAX_TOTAL)
    fail('图片资源容量异常，已停止修改','E_STORAGE_CORRUPT');
  return value;
}
export async function executePromptAsset({api,operation,payload,authorize}){
  if(!PROMPT_ASSET_OPERATIONS.includes(operation)||typeof authorize!=='function'||
    typeof api?.storage?.local?.get!=='function')fail('不可用的图片资源操作','E_TOOL_CONTEXT');
  if(!payload||typeof payload!=='object'||Array.isArray(payload))fail('资源参数无效');
  await authorize();
  const stored=(await api.storage.local.get(PROMPT_ASSET_STORE))[PROMPT_ASSET_STORE];
  const current=inventory(stored);
  const assets=current.assets;
  if(operation==='prompt.asset.put'){
    if(Object.keys(payload).length!==2||typeof payload.mime!=='string'||
      !PROMPT_ASSET_MIME.includes(payload.mime))fail('仅支持 PNG / JPEG / WebP');
    const entry=decodeBase64(payload.dataUrl,payload.mime);
    // Retry-safe resource write: a lost acknowledgement must not allocate a
    // second ID for exactly the same already-verified raster bytes.
    const existing=Object.entries(assets).find(([,asset])=>
      asset.mime===entry.mime&&asset.base64===entry.base64);
    if(existing){
      await authorize();
      return {id:existing[0],mime:entry.mime,bytes:entry.bytes,reused:true};
    }
    const entries=Object.values(assets);
    if(entries.length>=PROMPT_ASSET_MAX_COUNT||
      entries.reduce((n,a)=>n+a.bytes,0)+entry.bytes>PROMPT_ASSET_MAX_TOTAL)
      fail('图片资源库已满，请删除不再使用的图片','E_IMAGE_QUOTA');
    const id='psa_'+Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),v=>
      v.toString(16).padStart(2,'0')).join('');
    const next={schema:1,assets:{...assets,[id]:{...entry,createdAt:Date.now()}}};
    await authorize();await writeVerifiedLocalValue(api,PROMPT_ASSET_STORE,next,stored,'快捷按钮图片资源');
    await authorize();return {id,mime:entry.mime,bytes:entry.bytes};
  }
  if(Object.keys(payload).length!==1||!PROMPT_ASSET_ID.test(payload.id))fail('资源标识无效');
  if(operation==='prompt.asset.get'){
    const entry=assets[payload.id];
    if(!entry)fail('找不到本地图片资源','E_IMAGE_MISSING');
    await authorize();return {dataUrl:imageAssetDataUrl(entry,payload.id),mime:entry.mime,bytes:entry.bytes};
  }
  if(!assets[payload.id])return {removed:false};
  const libraryStore=(await api.storage.local.get(PROMPT_DATA_STORE))[PROMPT_DATA_STORE];
  if(libraryStore!==undefined&&(!libraryStore||typeof libraryStore!=='object'||
    Array.isArray(libraryStore)))fail('提示词数据异常，已保留图片','E_STORAGE_CORRUPT');
  const library=libraryStore?.library;
  if(library!==undefined&&(!library||library.schema!==1||!Array.isArray(library.items)))
    fail('提示词库异常，已保留图片','E_STORAGE_CORRUPT');
  if(library?.items.some(row=>row?.imageAssetId===payload.id))
    fail('图片仍被保存的提示词使用，不能删除','E_IMAGE_REFERENCED');
  const nextAssets={...assets};delete nextAssets[payload.id];
  await authorize();await writeVerifiedLocalValue(api,PROMPT_ASSET_STORE,{schema:1,assets:nextAssets},stored,'快捷按钮图片资源清理');
  await authorize();return {removed:true};
}
