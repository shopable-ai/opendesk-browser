import {createRelayChannel} from './http-relay-channel.js';
export function initHttpRelaySettings({doc=globalThis.document,channel=createRelayChannel()}={}){
  const status=doc.getElementById('relay-status'),invite=doc.getElementById('relay-invite');
  async function action(work){
    for(const button of doc.querySelectorAll('button'))button.disabled=true;
    try{const value=await work();status.dataset.state=value.paired?'paired':'unpaired';
      status.textContent=value.notice??(value.paired?`已配对 · Node ${value.nodeVersion??''} · PID ${value.pid??''}`:'尚未配对');}
    catch(error){status.dataset.state='error';status.textContent=(error.code??'E_NATIVE_UNAVAILABLE')+'：'+error.message;}
    finally{for(const button of doc.querySelectorAll('button'))button.disabled=false;}
  }
  doc.getElementById('relay-pair').addEventListener('click',()=>action(async()=>{const value=invite.value;invite.value='';await channel.pair(value);return channel.status();}));
  doc.getElementById('relay-refresh').addEventListener('click',()=>action(()=>channel.status()));
  doc.getElementById('relay-revoke').addEventListener('click',()=>action(()=>channel.revoke()));
  doc.getElementById('relay-back').addEventListener('click',()=>{globalThis.location.href='settings.html';});
  void action(()=>channel.status());
}
