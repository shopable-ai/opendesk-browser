(function uiFunction(){'use strict';const t=OpenDeskTool,$=id=>t.root.querySelector('#'+id);$('schedule-at').value=new Date(Date.now()+120000).toISOString();let busy=false;
 function bind(id,operation,args){$(id).addEventListener('click',async()=>{if(busy)return;busy=true;$('status').dataset.error='false';$('status').textContent='正在调用 '+operation;try{const input=args(),result=await t.request(operation,input);$('output').textContent=JSON.stringify({operation,args:input,result},null,2);$('status').textContent='调用完成';}catch(e){$('status').dataset.error='true';$('status').textContent=(e.code||'E_APP')+': '+e.message;$('output').textContent=JSON.stringify({operation,code:e.code,message:e.message},null,2);}finally{busy=false;}});}
 bind('storage-set','browser.storage.local.set',()=>({items:{preflightUi:{source:'ui',value:'storage-ok'}}}));
 bind('storage-get','browser.storage.local.get',()=>({keys:['preflightUi','control','started','result']}));
 bind('storage-quota','browser.storage.local.getQuota',()=>({}));
 bind('control-set','browser.storage.local.set',()=>({items:{control:{waitMs:Number($('wait-ms').value)||0,nonce:$('nonce').value||'default'}}}));
 bind('schedule-once','browser.scheduler.create',()=>({service:'background',schedule:{kind:'once',expression:new Date($('schedule-at').value).toISOString()}}));
 bind('schedule-list','browser.scheduler.listOwn',()=>({}));
})();
