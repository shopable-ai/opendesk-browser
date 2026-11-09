// App-owned CDP driver: root ws dependency only, never attaches to a user's Chrome.
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

export async function launchDialogChrome(executablePath,errors){
 assert.ok(executablePath,'CHROME_BIN is required; no implicit browser fallback');
 const profile=await mkdtemp(join(tmpdir(),'ai-proxy-dialog-'));
 let child,socket,launchError,stderr='',nextId=0;
 const pending=new Map();
 const close=async()=>{
  for(const {reject,timer} of pending.values()){clearTimeout(timer);reject(Error('CDP closed'));}
  pending.clear();socket?.terminate();
  if(child&&child.exitCode===null&&child.signalCode===null){
   const exited=new Promise(done=>child.once('exit',done));
   child.kill('SIGTERM');
   let timer;
   await Promise.race([exited,new Promise(done=>{timer=setTimeout(()=>{child.kill('SIGKILL');done();},3000);})]);
   clearTimeout(timer);
   if(child.exitCode===null&&child.signalCode===null)await exited;
  }
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 };
 try{
  child=spawn(executablePath,['--headless=new','--no-first-run','--no-default-browser-check',
   '--disable-background-networking','--disable-dev-shm-usage','--no-proxy-server',
   '--use-mock-keychain','--password-store=basic',...(process.platform==='linux'?['--no-sandbox']:[]),
   '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],
   {stdio:['ignore','ignore','pipe']});
  child.on('error',error=>{launchError=error;});
  child.stderr.on('data',bytes=>{stderr=(stderr+bytes).slice(-8000);});
  async function alive(){
   if(launchError)throw launchError;
   if(child.exitCode!==null||child.signalCode!==null)throw Error('Chrome exited before completion: '+stderr);
  }
  let port;
  const deadline=Date.now()+15000;
  while(!port){
   await alive();
   try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{}
   if(Date.now()>deadline)throw Error('Chrome CDP startup timeout: '+stderr);
   if(!port)await delay(50);
  }
  const response=await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(5000)});
  const target=(await response.json()).find(item=>item.type==='page');
  assert.ok(target?.webSocketDebuggerUrl,'Chrome page CDP target missing');
  socket=new WebSocket(target.webSocketDebuggerUrl,{handshakeTimeout:5000});
  await new Promise((done,reject)=>{socket.once('open',done);socket.once('error',reject);});
  const rejectPending=error=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(error);}pending.clear();};
  socket.on('error',rejectPending);
  socket.on('close',()=>rejectPending(Error('CDP disconnected')));
  socket.on('message',bytes=>{
   const message=JSON.parse(bytes.toString());
   if(message.id&&pending.has(message.id)){
    const {resolve,reject,timer}=pending.get(message.id);pending.delete(message.id);clearTimeout(timer);
    message.error?reject(Error(message.error.message)):resolve(message.result);
   }
   if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails?.exception?.description||message.params.exceptionDetails?.text);
  });
  function send(method,params={}){
   return new Promise((resolve,reject)=>{
    const id=++nextId;
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},7000);
    pending.set(id,{resolve,reject,timer});
    socket.send(JSON.stringify({id,method,params}),error=>{if(error){clearTimeout(timer);pending.delete(id);reject(error);}});
   });
  }
  const evaluate=async(fn,arg)=>{
   const result=await send('Runtime.evaluate',{expression:`(${fn})(${JSON.stringify(arg)??'undefined'})`,returnByValue:true,awaitPromise:true});
   if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
   return result.result.value;
  };
  const waitForFunction=async(fn,arg)=>{
   const deadline=Date.now()+7000;
   do{await alive();if(await evaluate(fn,arg))return;await delay(30);}while(Date.now()<deadline);
   throw Error('UI condition timeout: '+fn);
  };
  // Locators re-query on every operation; no stale DOM handles across React renders.
  function locator(selector,text=null){
   const query=`[...document.querySelectorAll(${JSON.stringify(selector)})].filter(el=>${text===null?'true':`el.textContent.trim()===${JSON.stringify(text)} && ![...el.children].some(child=>child.textContent.trim()===${JSON.stringify(text)})`})`;
   const all=fn=>evaluate(`()=>(${fn})(${query})`);
   const one=fn=>all(`els=>{if(els.length!==1)throw Error('Expected one element, got '+els.length+' for '+${JSON.stringify(selector)});return (${fn})(els[0]);}`);
   const waitFor=async({state='visible'}={})=>waitForFunction(`()=>{const els=${query};return ${state==='hidden'?'els.every(el=>!el.getClientRects().length||getComputedStyle(el).visibility==="hidden")':'els.length===1&&els[0].getClientRects().length>0&&getComputedStyle(els[0]).visibility!=="hidden"'};}`);
   const click=async()=>{
    await waitFor();
    const point=await one(el=>{
     if(el.disabled)throw Error('Control disabled');
     el.scrollIntoView({block:'nearest',inline:'nearest'});
     const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
     if(!el.contains(document.elementFromPoint(x,y)))throw Error('Control obscured');
     return {x,y};
    });
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
   };
   return {evaluate:one,evaluateAll:all,count:()=>all(els=>els.length),waitFor,click,
    locator:child=>locator(selector+' '+child),
    inputValue:()=>one(el=>el.value),
    async fill(value){
     await click();
     await one(el=>{el.focus();el.select();});
     await send('Input.insertText',{text:value});
     assert.equal(await one(el=>el.value),value);
    },
    async press(key){
     assert.equal(key,'Escape');await one(el=>el.focus());
     await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:27});
     await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:27});
    },
    async selectOption(value){
     await waitFor();
     await one(`el=>{if(el.disabled)throw Error('Select disabled');if(![...el.options].some(o=>o.value===${JSON.stringify(value)}))throw Error('Missing option');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}`);
    }
   };
  }
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:400,height:900,deviceScaleFactor:1,mobile:false});
  const version=await send('Browser.getVersion');
  return {close,profile,version:version.product,locator,waitForFunction,
   async goto(url){const result=await send('Page.navigate',{url});assert.ok(!result.errorText,result.errorText);await waitForFunction(()=>document.readyState==='complete');},
   async screenshot({path}){const {data}=await send('Page.captureScreenshot',{format:'png'});await writeFile(path,Buffer.from(data,'base64'));}
  };
 }catch(error){await close();throw error;}
}
