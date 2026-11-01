// Declarative syntax only. Installed identity and exact user consent belong to Host.
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const publicHost=value=>typeof value==='string'&&value.length<=253&&
  value===value.toLowerCase()&&!value.endsWith('.')&&value.includes('.')&&
  !/(?:^|\.)(?:localhost|local|internal|private|lan|home|arpa)$/.test(value)&&
  !/^[0-9.]+$/.test(value)&&!value.includes(':')&&
  value.split('.').every(label=>label.length>0&&label.length<=63&&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
const invalid=()=>{throw Object.assign(new Error('A declarative direct, single public or loopback endpoint, or finite website route is required'),{code:'E_PROXY_CONFIG'});};

export function normalizeManagedProxyConfig(config){
  if(exact(config,['mode'])&&config.mode==='direct')return {mode:'direct'};
  const explicit=config?.mode==='fixed_servers'||config?.mode==='rules';
  const global=explicit&&config.mode==='fixed_servers';
  if(!exact(config,global?['mode','endpoint']:explicit?['mode','endpoint','domains']:['endpoint','domains']))return invalid();
  const endpoint=config.endpoint;
  if(!exact(endpoint,['scheme','host','port'])||!Number.isInteger(endpoint.port)||endpoint.port<1||endpoint.port>65535)return invalid();
  const local=explicit&&endpoint.host==='127.0.0.1'&&['http','socks5'].includes(endpoint.scheme);
  if(!local&&(!['https','socks5'].includes(endpoint.scheme)||!publicHost(endpoint.host)))return invalid();
  if(!global&&(!Array.isArray(config.domains)||config.domains.length<1||config.domains.length>16||
    new Set(config.domains).size!==config.domains.length||config.domains.some(domain=>!publicHost(domain))))return invalid();
  return {...(explicit?{mode:config.mode}:{}),endpoint:{scheme:endpoint.scheme,host:endpoint.host,port:endpoint.port},
    ...(global?{}:{domains:[...config.domains].sort()})};
}

export function managedProxyReview(config){
  if(config.mode==='direct')return '启用 Chrome 浏览器级直连；所有标签页将绕过系统代理直接连接网络';
  const endpoint=config.endpoint;
  const target=endpoint.scheme+'://'+endpoint.host+':'+endpoint.port;
  return config.mode==='fixed_servers'?
    '启用 Chrome 浏览器级代理；端点 '+target+'；将影响所有网站和标签页':
    '启用 Chrome 浏览器级分流代理；端点 '+target+'；目标域名 '+config.domains.join('、')+'（含子域）；将影响匹配网站的所有标签页，其他网站直连';
}
