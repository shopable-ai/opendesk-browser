// Controller Classic reuses the standard userscript @require source declaration.
// No custom OpenDesk syntax, network, storage or code execution in this parser.
const err=(code,message)=>Object.assign(new Error(message||code),{code});
const SHA=/^[a-f0-9]{64}$/;
const FIXED=/(?:^|[\/@._-])v?\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?(?=\/|[._-]|$)|(?:^|\/)[a-f0-9]{40}(?=\/|$)/i;
export function parseControllerClassicDependencies(sourceUtf8){
  if(typeof sourceUtf8!=='string'||new TextEncoder().encode(sourceUtf8).byteLength>128*1024)
    throw err('E_CONTROLLER_CLASSIC_SOURCE','Controller source must be UTF-8 text of at most 128 KiB');
  const requires=[],seen=new Set();
  for(const [lineIndex,line] of sourceUtf8.split(/\r?\n/).entries()){
    if(/^\s*\/\/\s*@opendesk-classic\b/.test(line))
      throw err('E_CONTROLLER_CLASSIC_DIRECTIVE','Use the standard // @require URL declaration instead of @opendesk-classic');
    if(!/^\s*\/\/\s*@require(?:\s|$)/.test(line))continue;
    const match=/^\s*\/\/\s*@require\s+(https:\/\/\S+?)(?:\s+sha256:([a-f0-9]{64}))?\s*$/.exec(line);
    if(!match)throw err('E_CONTROLLER_CLASSIC_DIRECTIVE','Invalid @require URL declaration at line '+(lineIndex+1));
    if(requires.length>=4)throw err('E_CONTROLLER_CLASSIC_LIMIT','At most four Classic libraries per Controller');
    let url;try{url=new URL(match[1]);}catch{throw err('E_DEPENDENCY_URL','Invalid Classic URL');}
    const hostname=url.hostname.toLowerCase();
    if(url.protocol!=='https:'||url.username||url.password||url.hash||url.port||
       url.href.length>2048||!hostname.includes('.')||
       /^\[|^\d+(?:\.\d+){0,3}$/.test(hostname)||
       /^(?:localhost|localhost\.)$|\.(?:localhost|local|internal)\.?$|(?:^|\.)home\.arpa\.?$/.test(hostname))
      throw err('E_DEPENDENCY_URL','Classic libraries must use public HTTPS hosts without credentials or custom ports');
    const pin=match[2]||null;
    if(pin&&!SHA.test(pin))throw err('E_DEPENDENCY_INTEGRITY','Invalid SHA-256 pin');
    if(!FIXED.test(url.pathname)&&!pin)
      throw err('E_DEPENDENCY_VERSION','Classic library URL requires an exact semantic version, commit SHA or SHA-256 pin');
    if(seen.has(url.href))throw err('E_CONTROLLER_CLASSIC_DIRECTIVE','Duplicate Classic library URL');
    seen.add(url.href);
    requires.push(Object.freeze({order:requires.length,url:url.href,sha256:pin}));
  }
  return Object.freeze(requires);
}
