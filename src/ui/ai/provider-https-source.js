// Presentation-only HTTPS protocol hint shared by the trusted AI settings UIs.
// The endpoint path is a hint, not an authorization or a network probe.
export function inferHttpsSource(endpoint) {
  try {
    const url=new URL(String(endpoint||'').trim());
    if(url.protocol!=='https:'||!url.hostname||url.username||url.password)return null;
    const path=url.pathname.replace(/\/+$/,'');
    if(/(?:^|\/)responses$/.test(path))return 'cloud_responses';
    if(/(?:^|\/)chat\/completions$/.test(path))return 'custom_https';
  }catch{/* Malformed and nonstandard endpoints require explicit selection. */}
  return null;
}
export function isHttpsSource(source){
  return source==='custom_https'||source==='cloud_responses';
}

// Match the existing adapters before accepting a settings draft. A path hint
// does not mean an arbitrary Responses-compatible gateway is implemented.
export function httpsSourceConfigurationError(source,endpoint){
  let url;
  try{url=new URL(endpoint);}catch{}
  if(!url||url.protocol!=='https:'||!url.hostname||url.username||url.password||url.hash)
    return 'AI 接口必须是有效的 HTTPS 地址，不能包含账号密码或片段';
  if(source==='cloud_responses'&&(url.pathname!=='/v1/responses'||url.search))
    return '当前 Responses 仅支持 /v1/responses，且不能带查询参数；请修改接口地址或在高级配置中选择实际支持的协议';
  if(source==='custom_https'&&url.pathname==='/v1/responses')
    return '/v1/responses 不能使用 Chat Completions；请选择 Responses 并移除查询参数，或修改接口地址';
  return '';
}
