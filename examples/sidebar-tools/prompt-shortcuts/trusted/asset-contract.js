// Fixed, official Prompt Shortcuts asset identity. Never derived from sandbox input.
export const PROMPT_ASSET_STORE='opendesk.sidebar-tools.prompt-assets.v1';
export const PROMPT_ASSET_OPERATIONS=Object.freeze(['prompt.asset.put','prompt.asset.get','prompt.asset.remove']);
export const PROMPT_ASSET_ID=/^psa_[a-f0-9]{32}$/;
export const PROMPT_ASSET_MAX_BYTES=65536;
export const PROMPT_ASSET_MAX_COUNT=48;
export const PROMPT_ASSET_MAX_TOTAL=3*1024*1024;
export const PROMPT_ASSET_MIME=Object.freeze(['image/png','image/jpeg','image/webp']);

export function imageAssetDataUrl(record,id){
  if(!PROMPT_ASSET_ID.test(id)||!record||!PROMPT_ASSET_MIME.includes(record.mime)||
    typeof record.base64!=='string'||record.base64.length<8||record.base64.length>88000||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(record.base64)||
    record.bytes<1||record.bytes>PROMPT_ASSET_MAX_BYTES)return '';
  return 'data:'+record.mime+';base64,'+record.base64;
}
