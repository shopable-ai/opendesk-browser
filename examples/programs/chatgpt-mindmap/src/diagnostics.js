// Error metadata only: never copy request arguments, renderer state or response data.
const limits={stage:80,code:96,name:80,message:800,stack:2400};
const fallbackCode='E_XMIND_RENDER';
function read(value,key){try{return value?.[key];}catch{return undefined;}}
function text(value,limit){
  if(typeof value!=='string')return '';
  return value.slice(0,16384)
    .replace(/\b(?:[a-z][a-z\d+.-]*:\/\/|blob:|data:|www\.)[^\s<>"'`)\]]+/gi,
      value=>'[url]'+(value.match(/:\d+(?::\d+)?$/)?.[0]||''))
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[email]')
    .replace(/\bBearer\s+\S+/gi,'Bearer [redacted]')
    .replace(/\b(token|api[_-]?key|authorization|password|secret|account|user[_-]?id)\s*[:=]\s*[^\s,;]+/gi,'$1=[redacted]')
    .replace(/"[^"]*(?:"|$)|'[^']*(?:'|$)|`[^`]*(?:`|$)|“[^”]*(?:”|$)|‘[^’]*(?:’|$)/g,'[quoted]')
    .replace(/\b(?:sk-|eyJ)[\w.-]+|\b[A-Za-z0-9_+-]{32,}\b/g,'[token]')
    .slice(0,limit);
}

export function annotateMindmapError(value,stage){
  let error=value;
  if(!(error instanceof Error)){
    const message=read(value,'message');
    error=new Error(typeof message==='string'?message:
      typeof value==='string'?value:`Non-Error throw (${value===null?'null':typeof value})`);
    for(const key of ['name','code','stack','mindmapStage']){
      const field=read(value,key);if(typeof field==='string')error[key]=field;
    }
  }
  if(!read(error,'mindmapStage')){
    try{error.mindmapStage=stage;}catch{
      const copy=new Error(error.message,{cause:error});
      for(const key of ['name','code','stack'])copy[key]=read(error,key);
      copy.mindmapStage=stage;error=copy;
    }
  }
  return error;
}

export function appendMindmapCleanup(value,cleanup){
  const error=annotateMindmapError(value,'frame.destroy');
  const failure=annotateMindmapError(cleanup,'frame.destroy');
  if(failure!==error){
    try{error.cleanupErrors=[...(Array.isArray(error.cleanupErrors)?error.cleanupErrors:[]),failure].slice(-3);}
    catch{return Object.assign(new Error(error.message,{cause:error}),{
      name:error.name,code:error.code,stack:error.stack,mindmapStage:error.mindmapStage,cleanupErrors:[failure]});}
  }
  return error;
}

export function describeMindmapError(value){
  const seen=new Set();let remaining=8;
  function describe(input,depth){
    if(depth>2||remaining--<=0||seen.has(input))return undefined;
    seen.add(input);
    const error=input instanceof Error?input:annotateMindmapError(input,'unknown');
    const result={stage:text(read(error,'mindmapStage'),limits.stage)||'unknown',
      code:text(read(error,'code'),limits.code)||fallbackCode,
      name:text(read(error,'name'),limits.name)||'Error',
      message:text(read(error,'message'),limits.message),stack:text(read(error,'stack'),limits.stack)};
    const cause=read(error,'cause');
    if(cause!==undefined){const nested=describe(cause,depth+1);if(nested)result.cause=nested;}
    for(const key of ['errors','cleanupErrors']){
      const list=read(error,key);
      if(Array.isArray(list))result[key]=list.slice(0,3).map(item=>describe(item,depth+1)).filter(Boolean);
    }
    return result;
  }
  return describe(value,0);
}

// Called only after the exact port, identity and pending command are matched.
// Reject malformed/oversized peer metadata rather than reflecting arbitrary fields.
export function deserializeMindmapError(value){
  let remaining=8;
  function decode(input,depth){
    if(!input||typeof input!=='object'||Array.isArray(input)||depth>2||remaining--<=0)return null;
    for(const [key,limit] of Object.entries(limits)){
      if(input[key]!==undefined&&(typeof input[key]!=='string'||input[key].length>limit))return null;
    }
    if(typeof input.code!=='string'||!input.code)return null;
    const error=new Error(text(input.message??input.code,limits.message));
    error.code=text(input.code,limits.code);error.name=text(input.name??'Error',limits.name);
    error.mindmapStage=text(input.stage??'unknown',limits.stage);
    if(input.stack!==undefined)error.stack=text(input.stack,limits.stack);
    if(input.cause!==undefined){error.cause=decode(input.cause,depth+1);if(!error.cause)return null;}
    for(const key of ['errors','cleanupErrors']){
      if(input[key]===undefined)continue;
      if(!Array.isArray(input[key])||input[key].length>3)return null;
      error[key]=[];
      for(const item of input[key]){const nested=decode(item,depth+1);if(!nested)return null;error[key].push(nested);}
    }
    return error;
  }
  return decode(value,0);
}
