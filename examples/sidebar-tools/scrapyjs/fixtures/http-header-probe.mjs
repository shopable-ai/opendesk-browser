// Loopback transport diagnostic only. Not an installed tool/Task/production Grant.
import {createNetworkService} from '/src/platform/chrome/network.js';
import {extractStaticHtml,legacyStaticFields} from '/examples/sidebar-tools/scrapyjs/adapters/static-http-trial.mjs';

const submitted=[];
const authorizations=[];
const nativeFetch=globalThis.fetch.bind(globalThis);
const allowed=new Set(['/page/1','/page/2','/page/3','/agent','/slow']);
const transitionPath=/^\/transition\/(page|hold|slow)\/[123]$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const network=createNetworkService({maxResponseBytes:8192,
  authorize:async ({url,method,phase})=>{
    const target=new URL(url);
    const correlated=transitionPath.test(target.pathname)&&uuid.test(target.searchParams.get('runId'))&&
      /^[1-3]$/.test(target.searchParams.get('request'))&&
      [...target.searchParams.keys()].sort().join(',')==='request,runId';
    if(target.origin!==location.origin||method!=='GET'||
      !(allowed.has(target.pathname)&&!target.search||correlated))
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

/** Clickable local diagnostic, deliberately separate from the installed App.
 * Uses the original NetworkService/Fetch, with no fake Host/Grant/RunReceipt.
 */
export function mountTransitionProbe(){
  document.body.innerHTML=`<h1>ScrapyJS loopback Header diagnostic</h1>
    <p>TEST ONLY · not the installed App or production HTTP authority</p>
    <label>Header JSON <textarea id="probe-headers" rows="5" cols="65">{}</textarea></label>
    <label>First response <select id="probe-mode"><option>page</option><option>hold</option><option>slow</option></select></label>
    <label>Timeout ms <input id="probe-timeout" value="5000"></label>
    <button id="probe-run">Run diagnostic</button><button id="probe-stop" disabled>Stop diagnostic</button>
    <pre id="probe-result"></pre>`;
  const q=selector=>document.querySelector(selector);
  const state={active:null,history:[]};
  globalThis.httpHeaderTransitions=state;
  // Live audit includes any late callbacks, unlike an outcome-time snapshot.
  state.readLogs=()=>structuredClone({submitted,authorizations});
  q('#probe-run').addEventListener('click',async event=>{
    if(state.active)return;
    const controller=new AbortController();
    const run={runId:crypto.randomUUID(),scope:'LOCAL_DIAGNOSTIC_NOT_INSTALLED_RUN',
      click:{isTrusted:event.isTrusted},status:'running',records:[],pages:[]};
    const before=submitted.length,authBefore=authorizations.length;
    state.active={run,controller};q('#probe-run').disabled=true;q('#probe-stop').disabled=false;
    q('#probe-result').textContent='Running '+run.runId;
    try{
      // Bind all request inputs synchronously to this click; later editor changes
      // belong to a future diagnostic, never to an already running page sequence.
      run.configured=JSON.parse(q('#probe-headers').value);
      run.snapshot=structuredClone(run.configured);
      run.mode=q('#probe-mode').value;
      run.timeout=Number(q('#probe-timeout').value);
      for(let page=1;page<=3;page++){
        if(controller.signal.aborted)throw Object.assign(Error('Stopped'),{code:'E_CANCELLED'});
        const path='/transition/'+(page===1?run.mode:'page')+'/'+page;
        const url=location.origin+path+'?runId='+run.runId+'&request='+page;
        const response=await network.request({method:'GET',url,
          config:{headers:run.snapshot,responseType:'text',timeout:run.timeout}},
          {signal:controller.signal});
        run.pages.push({request:page,url,status:response.status});
        run.records.push(...extractStaticHtml(response.data,{
          fields:legacyStaticFields({title:'h2::text',id:'article::data-id'})}));
      }
      run.status='completed';
    }catch(error){run.status=error.code==='E_CANCELLED'?'stopped':'error';run.error=error.code||error.message;}
    finally{
      run.submitted=structuredClone(submitted.slice(before));
      run.authorizations=structuredClone(authorizations.slice(authBefore));
      state.history.push(run);state.active=null;
      q('#probe-run').disabled=false;q('#probe-stop').disabled=true;
      q('#probe-result').textContent=JSON.stringify(run,null,2);
    }
  });
  q('#probe-stop').addEventListener('click',event=>{
    if(state.active){state.active.run.stopClick={isTrusted:event.isTrusted};state.active.controller.abort();}
  });
}
