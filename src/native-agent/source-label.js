// Presentation only. Names and cached labels never authorize file or source access.
const SAFE_NAME=/[\u0000-\u001f\u007f]/u;
export function sourceName(value,fallback='未命名目录'){
  const name=typeof value==='string'?value.trim():'';
  return name&&name.length<=160&&!SAFE_NAME.test(name)?name:fallback;
}
export function sourceLabel(row,{offline=false,kind='',duplicate=false}={}){
  const base=sourceName(row?.name);
  const identity=String(row?.sourceId||row?.workspaceId||row?.bindingId||'');
  const distinguish=duplicate&&identity?' · '+identity.slice(-6):'';
  return base+distinguish+(kind?' · '+kind:'')+(offline?' · 离线（待连接核验）':'');
}
