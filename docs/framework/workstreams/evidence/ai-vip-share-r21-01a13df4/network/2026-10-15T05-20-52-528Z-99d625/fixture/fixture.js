import {compileAiPac,desiredAiProxy} from './policy.js';
const endpoints={"socks5":{"scheme":"socks5","host":"relay.ai-network.example","port":61009},"https":{"scheme":"https","host":"relay.ai-network.example","port":61008}};
window.fixtureEvents=[];
const get=()=>new Promise(resolve=>chrome.proxy.settings.get({incognito:false},resolve));
window.fixtureBaseline=await get();
for(const id of ['socks5','https','stop'])document.getElementById(id).addEventListener('click',async event=>{
  const row={id,eventType:event.type,trusted:event.isTrusted,userActivation:navigator.userActivation.isActive,at:new Date().toISOString(),sender:chrome.runtime.id};
  if(!event.isTrusted||!row.userActivation){row.status='REJECTED';window.fixtureEvents.push(row);return;}
  try{
    row.api=id==='stop'?'chrome.proxy.settings.clear':'chrome.proxy.settings.set';
    row.request=id==='stop'?{scope:'regular'}:{value:desiredAiProxy(endpoints[id]),scope:'regular'};
    if(id!=='stop'&&row.request.value.pacScript.data!==compileAiPac(endpoints[id]))throw Error('PAC mismatch');
    await new Promise((resolve,reject)=>chrome.proxy.settings[id==='stop'?'clear':'set'](row.request,()=>{const e=chrome.runtime.lastError;e?reject(Error(e.message)):resolve();}));
    row.readback=await get();row.status='OK';
  }catch(e){row.status='ERROR';row.error=e.message;}
  window.fixtureEvents.push(row);document.getElementById('status').textContent=JSON.stringify(row,null,2);
});