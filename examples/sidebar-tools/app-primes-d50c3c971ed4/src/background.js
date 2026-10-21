// Reviewed lifecycle upgrade: installation generation must invalidate the old Worker.
async function main(){return (async function execute(algorithm,other,compute,codeNonce){
 const control=(await browser.storage.local.get({keys:['control']})).items.control||{};
 await browser.storage.local.set({items:{started:{algorithm,nonce:control.nonce||'default'}}});
 if(control.waitMs>0)await new Promise(resolve=>setTimeout(resolve,Math.min(60000,control.waitMs)));
 const payload=compute(),security={opaqueOrigin:self.origin,chromePrivilege:!!globalThis.chrome?.runtime,otherApp:other,codeNonce};
 const cspViolations=[],onCsp=e=>cspViolations.push({directive:e.effectiveDirective,blocked:e.blockedURI});self.addEventListener('securitypolicyviolation',onCsp);
 try{await browser.storage.local.get({keys:['result'],owner:other});security.foreignOwner='ACCEPTED';}catch(e){security.foreignOwner=e.code||e.name;}
 security.tabs=(await browser.capabilities.getStatus({operation:'browser.tabs.create'})).callableNow;
 try{await fetch('https://example.invalid/opendesk-r14-fetch');security.fetch='ACCEPTED';}catch(e){security.fetch=e.name;}
 try{importScripts('https://example.invalid/opendesk-r14-script.js');security.importScripts='ACCEPTED';}catch(e){security.importScripts=e.name;}
 try{await import('https://example.invalid/opendesk-r14-module.js');security.dynamicImport='ACCEPTED';}catch(e){security.dynamicImport=e.name;}
 security.bindingForgeries={};
 for(const [field,value] of Object.entries({appId:other,namespace:other,runId:'forged-run',generation:'forged-generation',packageHash:'0'.repeat(64),codeHash:'0'.repeat(64),origin:'chrome-extension://forged'})){
  try{await browser.storage.local.get({keys:['result'],[field]:value});security.bindingForgeries[field]='ACCEPTED';}catch(e){security.bindingForgeries[field]=e.code||e.name;}
 }
 try{await browser.storage.local.set({items:{forbidden:'cross-owner'},owner:other});security.foreignWrite='ACCEPTED';}catch(e){security.foreignWrite=e.code||e.name;}
 const foreignKey='opendesk.sidebar-tools.data.v1:'+other;
 try{security.foreignStorageKeyVisible=Object.hasOwn((await browser.storage.local.get({keys:[foreignKey]})).items,foreignKey);}catch(e){security.foreignStorageKeyRejected=e.code||e.name;}
 await browser.storage.local.set({items:{largeReadA:'a'.repeat(7000)}});
 await browser.storage.local.set({items:{largeReadB:'b'.repeat(7000)}});
 try{await browser.storage.local.get({keys:['largeReadA','largeReadB']});security.readLimitHandled='ACCEPTED';}catch(e){security.readLimitHandled=e.code||e.name;}
 await browser.storage.local.set({items:{largeReadA:null,largeReadB:null}});
 security.webSocket=await new Promise(resolve=>{try{const s=new WebSocket('wss://example.invalid/opendesk-r14');s.onerror=()=>resolve('error');s.onopen=()=>{s.close();resolve('ACCEPTED');};setTimeout(()=>{s.close();resolve('blocked-timeout');},1500);}catch(e){resolve(e.name);}});
 await new Promise(resolve=>setTimeout(resolve,50));self.removeEventListener('securitypolicyviolation',onCsp);security.cspViolations=cspViolations;
 const result={algorithm,payload,security,nonce:control.nonce||'default'};await browser.storage.local.set({items:{result}});return result;
})("prime-sieve","app-words-648ac9d668db",function primeCompute(){const flags=new Uint8Array(10001);flags.fill(1);flags[0]=flags[1]=0;for(let p=2;p*p<=10000;p++)if(flags[p])for(let q=p*p;q<=10000;q+=p)flags[q]=0;let count=0,sum=0,last=0;for(let n=2;n<=10000;n++)if(flags[n]){count++;sum+=n;last=n;}return {limit:10000,count,sum,last};},"614eaf5a83e7d8f22aebc8b2");}
