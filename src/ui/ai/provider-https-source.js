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
