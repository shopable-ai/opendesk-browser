// Loopback transport diagnostic only. Not an installed tool/Task/production Grant.
import {createNetworkService} from '/src/platform/chrome/network.js';
import {extractStaticHtml,legacyStaticFields} from '/examples/sidebar-tools/scrapyjs/adapters/static-http-trial.mjs';

const submitted=[];
const authorizations=[];
const nativeFetch=globalThis.fetch.bind(globalThis);
const allowed=new Set(['/page/1','/page/2','/page/3','/agent','/slow']);
const network=createNetworkService({maxResponseBytes:8192,
  authorize:async ({url,method,phase})=>{
    const target=new URL(url);
    if(target.origin!==location.origin||!allowed.has(target.pathname)||target.search||method!=='GET')
      throw Object.assign(Error('Fixture target only'),{code:'E_FIXTURE_SCOPE'});
    authorizations.push({url,method,phase});
  },
  fetchImpl:(url,options)=>{
    // Observe the exact options passed by the unmodified service to real Fetch.
    submitted.push({url,method:options.method,headers:{...options.headers},
      credentials:options.credentials,redirect:options.redirect});
    return nativeFetch(url,options);
  }
});
const get=(path,headers,signal)=>network.request({method:'GET',url:location.origin+path,
  config:{headers,responseType:'text',timeout:5000}},{signal});

export async function collect(){
  const configured={Accept:'text/html','X-Client-Tag':'scrapyjs-local-header-proof'};
  const records=[],pages=[];
  for(let page=1;page<=3;page++){
    const response=await get('/page/'+page,configured);
    pages.push({page,status:response.status,bytes:new TextEncoder().encode(response.data).length});
    records.push(...extractStaticHtml(response.data,{
      fields:legacyStaticFields({title:'h2::text',id:'article::data-id'})
    }));
  }
  return {configured,submitted:structuredClone(submitted),authorizations:structuredClone(authorizations),pages,records};
}

export async function probeManagedAndForbidden(){
  const configured={'User-Agent':'ScrapyJS-Header-Probe/1.0'};
  const before=submitted.length;
  let serverEcho=null,rejection=null;
  try{const response=await get('/agent',configured);serverEcho=JSON.parse(response.data);}
  catch(error){rejection=error.code;}
  const rejected=[];
  for(const name of ['Cookie','Authorization','Host','Origin','Referer','Sec-CH-UA']){
    try{await get('/agent',{[name]:'fixture-only'});rejected.push({name,error:null});}
    catch(error){rejected.push({name,error:error.code});}
  }
  return {configured,submitted:structuredClone(submitted.slice(before)),
    serverEcho,rejection,rejected};
}

export function startSlow(){
  const controller=new AbortController();
  const result=get('/slow',{'X-Client-Tag':'scrapyjs-local-stop-proof'},controller.signal)
    .then(()=>({error:null}),error=>({error:error.code}));
  globalThis.httpHeaderStop=()=>{controller.abort();return result;};
}
