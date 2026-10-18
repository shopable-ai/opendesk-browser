// Pure product readback rules; no host privilege or DNR access.
export function valid(v){
  return Boolean(v&&typeof v.enabled==='boolean'&&Array.isArray(v.exceptions)&&
    v.exceptions.every(h=>typeof h==='string')&&
    typeof v.permissions?.dnr==='boolean'&&typeof v.rules?.verified==='boolean');
}
export function verified(v){
  return valid(v)&&v.permissions.dnr===true&&v.rules.verified===true;
}
export function siteHost(v){
  return v?.currentSite?.status==='ready'&&
    typeof v.currentHost==='string'&&v.currentHost?v.currentHost:null;
}
export function readyToOperate(v){
  return verified(v)&&v.toolEnabled===true&&!v.restartRequired;
}
export function confirmed(result,checked,operation,payload={}){
  if(!readyToOperate(result)||!readyToOperate(checked)||
    result.enabled!==checked.enabled||
    JSON.stringify(result.exceptions)!==JSON.stringify(checked.exceptions))return false;
  if(operation==='adblock.enable')return checked.enabled===true;
  if(operation==='adblock.disable')return checked.enabled===false;
  if(operation==='adblock.site.set')return checked.enabled===true&&
    siteHost(checked)===payload.host&&
    checked.exceptions.includes(payload.host)===!payload.filtering;
  if(operation==='adblock.site.restore')
    return !checked.exceptions.includes(payload.host);
  return false;
}
