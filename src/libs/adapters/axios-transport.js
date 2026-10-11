// Pure, unprivileged bridge from a REAL Axios instance to the existing admitted
// axiosx client. This adapter is not a network permission grant or a fallback
// privileged fetch. It must be installed by the trusted runner, not user code.
const fail=(code,message=code)=>Object.assign(new Error(message),{code});
const permitted=new Set(['get','post','put','delete']);
const forbidden=new Set(['authorization','proxy-authorization','cookie','set-cookie','host','origin','referer']);

function headersForBroker(input){
  const value=input?.toJSON?.()??input??{};
  if(!value||typeof value!=='object'||Array.isArray(value))throw fail('E_CONFIG_UNSUPPORTED');
  const headers={};
  for(const [name,raw] of Object.entries(value)){
    if(raw===undefined||raw===null||raw===false)continue;
    if(typeof raw!=='string'||!(/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name))||
      /[\r\n]/.test(raw)||forbidden.has(name.toLowerCase())||/^sec-/i.test(name))
      throw fail('E_CONFIG_UNSUPPORTED','Unsupported network header: '+name);
    headers[name.toLowerCase()]=raw;
  }
  return headers;
}

function validateFinalUrl(url){
  if(typeof url!=='string')throw fail('E_CONFIG_UNSUPPORTED','A resolved absolute URL is required');
  let parsed;
  try{parsed=new URL(url);}catch{throw fail('E_CONFIG_UNSUPPORTED','Invalid HTTP URL');}
  if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.hash)
    throw fail('E_CONFIG_UNSUPPORTED','Unsupported target URL');
  return parsed.href;
}

// getUri is the REAL Axios instance's getUri after its interceptors have run.
// It applies baseURL + paramsSerializer once. The final URL is authorized by
// the EXISTING Broker, never by this adapter or an Axios default option.
export function createAuthorizedAxiosTransport({http,getUri,makeHttpError}={}){
  if(!http||!['get','post','put','delete'].every(method=>typeof http[method]==='function')||
      typeof getUri!=='function')throw fail('E_AXIOS_TRANSPORT_NOT_READY');
  return async function authorizedAxiosAdapter(config){
    if(!config||typeof config!=='object')throw fail('E_CONFIG_UNSUPPORTED');
    const method=String(config.method??'get').toLowerCase();
    if(!permitted.has(method))throw fail('E_SERVICE_UNSUPPORTED');
    if(config.signal!==undefined||config.cancelToken!==undefined)
      throw fail('E_AXIOS_CANCEL_UNSUPPORTED','Per-request network cancellation is not wired');
    if(config.withCredentials===true||config.auth!==undefined||config.proxy!==undefined||
      config.onUploadProgress!==undefined||config.onDownloadProgress!==undefined||
      config.httpAgent!==undefined||config.httpsAgent!==undefined||config.transport!==undefined)
      throw fail('E_CONFIG_UNSUPPORTED');
    if(config.responseType!==undefined&&config.responseType!==''&&
      !['json','text'].includes(config.responseType))throw fail('E_CONFIG_UNSUPPORTED');
    const timeout=config.timeout;
    if(timeout!==undefined&&(!Number.isSafeInteger(timeout)||timeout<0))
      throw fail('E_CONFIG_UNSUPPORTED');
    const url=validateFinalUrl(getUri(config));
    const options={headers:headersForBroker(config.headers),responseType:'text',withCredentials:false};
    // Axios timeout=0 means "no client timeout". It never disables the host
    // budget; omit it so the broker applies its existing bounded timeout.
    if(timeout>0)options.timeout=timeout;
    const data=config.data;
    if(data!==undefined&&(method==='get'||method==='delete'||typeof data!=='string'))
      throw fail('E_CONFIG_UNSUPPORTED','Only transformed text/JSON request bodies are supported');
    let projection;
    try{
      projection=method==='post'||method==='put'?
        await http[method](url,data,options):await http[method](url,options);
    }catch(error){
      if(error?.code!=='E_HTTP'||!error.response)throw error;
      // E_HTTP.response was produced after the host's authorization/receipt
      // checks. Permissions, revocation and unknown native effects never land here.
      projection=error.response;
    }
    if(!projection||!Number.isInteger(projection.status)||projection.status<100||
      projection.status>599||typeof projection.data!=='string')
      throw fail('E_AXIOS_RESPONSE_UNSUPPORTED');
    const response={data:projection.data,status:projection.status,
      statusText:projection.statusText??'',headers:projection.headers??{},config};
    const accepted=typeof config.validateStatus==='function'?
      config.validateStatus(response.status):response.status>=200&&response.status<300;
    if(!accepted){
      if(makeHttpError)throw makeHttpError(response,config);
      throw Object.assign(new Error('HTTP '+response.status),{code:'E_HTTP',response,config});
    }
    return response;
  };
}
