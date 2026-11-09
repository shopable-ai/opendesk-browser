// Release-owned landing pages only. These rules grant no network, Cookie or proxy access.
// LAN is an explicit development source; production still needs reviewed HTTPS rules.
export const DEVELOPMENT_ACTIVATION_URLS=Object.freeze([
  Object.freeze({origin:'http://127.0.0.1:7898',path:'/activate',parameter:'activation_code'}),
  Object.freeze({origin:'http://192.168.30.3:7899',path:'/activate',parameter:'activation_code'})
]);

// The current-page URL is Host-reported data, not permission to redeem.
// Match the release-owned canonical link byte for byte. In particular, reject
// encoded aliases, duplicate parameters, fragments and a lookalike origin.
export function activationCodeFromVerifiedPage(info,rules){
  if(info?.status!=='available'||typeof info.url!=='string'||info.url.length>2048||
    !Array.isArray(rules))return null;
  for(const rule of rules){
    if(typeof rule?.origin!=='string'||typeof rule.path!=='string'||
      typeof rule.parameter!=='string')continue;
    const prefix=rule.origin+rule.path+'?'+rule.parameter+'=';
    if(!info.url.startsWith(prefix))continue;
    const code=info.url.slice(prefix.length);
    if(/^[A-Za-z0-9._-]{6,120}$/.test(code))return code;
  }
  return null;
}

// A conservative account-and-service-scoped pause survives reload, new tickets
// and the second surface. No voucher/code/token is persisted here; new manual
// preflights remain available. This is not a redeem authorization store.
export const AUTO_PREPARATION_PAUSE_KEY='aiVipAutoPreparationPauseR1';
// Keep one tool-storage value far below the Host's existing 8 KiB per-key budget.
const MAX_AUTO_PAUSE_BYTES=4096;
const pauseBytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const scopeKey=scope=>JSON.stringify([scope.serviceOrigin,scope.accountId]);
function validScope(scope){
  return scope&&typeof scope==='object'&&!Array.isArray(scope)&&
    Object.keys(scope).sort().join(',')==='accountId,serviceOrigin'&&
    typeof scope.accountId==='string'&&scope.accountId.length>=1&&scope.accountId.length<=120&&
    typeof scope.serviceOrigin==='string'&&scope.serviceOrigin.length>=1&&scope.serviceOrigin.length<=200&&
    !/[\u0000-\u001f\u007f]/u.test(scope.accountId)&&
    !/[\u0000-\u001f\u007f]/u.test(scope.serviceOrigin);
}
export function readAutoPreparationPauses(value){
  if(value===null||value===undefined)return {schemaVersion:1,scopes:[]};
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).sort().join(',')!=='schemaVersion,scopes'||
    value.schemaVersion!==1||!Array.isArray(value.scopes)||value.scopes.length>64||
    pauseBytes(value)>MAX_AUTO_PAUSE_BYTES||
    value.scopes.some(scope=>!validScope(scope))||
    new Set(value.scopes.map(scopeKey)).size!==value.scopes.length)
    throw Object.assign(new Error('取消记录无法核验，禁止自动预检。'),{code:'E_ACTIVATION_PAUSE_STORE'});
  return {schemaVersion:1,scopes:value.scopes.map(scope=>({
    accountId:scope.accountId,serviceOrigin:scope.serviceOrigin}))};
}
export function isAutoPreparationPaused(value,scope){
  if(!validScope(scope))throw Object.assign(new Error('取消范围无效'),{code:'E_ACTIVATION_PAUSE_SCOPE'});
  return readAutoPreparationPauses(value).scopes.some(row=>scopeKey(row)===scopeKey(scope));
}
export function addAutoPreparationPause(value,scope){
  const record=readAutoPreparationPauses(value);
  if(isAutoPreparationPaused(record,scope))return record;
  if(record.scopes.length>=64)
    throw Object.assign(new Error('取消记录已满，需人工处理，禁止自动预检。'),{code:'E_ACTIVATION_PAUSE_FULL'});
  const next={...record,scopes:[...record.scopes,{accountId:scope.accountId,serviceOrigin:scope.serviceOrigin}]};
  if(pauseBytes(next)>MAX_AUTO_PAUSE_BYTES)
    throw Object.assign(new Error('取消记录容量不足，禁止自动预检。'),{code:'E_ACTIVATION_PAUSE_FULL'});
  return next;
}
