import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,copyFile,rm,mkdtemp} from 'node:fs/promises';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import webpack from 'webpack';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const binary=process.env.CHROME_FOR_TESTING_BIN;
if(!binary)throw new Error('CHROME_FOR_TESTING_BIN is required');
const expectedBody='<div>中😀</div>'.repeat(9000);
const server=createServer((req,res)=>{
  res.setHeader('content-type','text/html; charset=utf-8');
  if(req.url!=='/large'){res.statusCode=404;res.end();return;}
  res.end('<!doctype html><title>Native HTML content</title><body>'+expectedBody+'</body>');
});
const output=await mkdtemp(path.join(os.tmpdir(),'opendesk-content-'));
const extension=path.join(output,'extension'),profile=path.join(output,'profile');
let processChrome,client,exitPromise;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function connect(url){
  const socket=new WebSocket(url),pending=new Map();let serial=0;
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',({data})=>{
    const reply=JSON.parse(data),wait=pending.get(reply.id);if(!wait)return;
    pending.delete(reply.id);clearTimeout(wait.timer);
    if(reply.error)wait.reject(new Error(JSON.stringify(reply.error)));else wait.resolve(reply.result);
  });
  return {
    send(method,params={},sessionId){return new Promise((resolve,reject)=>{
      const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout '+method));},15000);
      pending.set(id,{resolve,reject,timer});
      socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
    });},
    close(){for(const wait of pending.values()){clearTimeout(wait.timer);wait.reject(new Error('CDP closed'));}pending.clear();socket.close();}
  };
}
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  await mkdir(path.join(extension,'ui'),{recursive:true});
  await mkdir(path.join(extension,'scripting/sandbox'),{recursive:true});
  const publicKey=generateKeyPairSync('rsa',{modulusLength:2048}).publicKey.export({format:'der',type:'spki'});
  const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
  manifest.key=publicKey.toString('base64');manifest.name='OpenDesk page HTML real Chrome smoke';
  manifest.host_permissions=['http://127.0.0.1/*'];
  const extensionId=createHash('sha256').update(publicKey).digest('hex').slice(0,32)
    .split('').map(c=>String.fromCharCode(97+parseInt(c,16))).join('');
  await writeFile(path.join(extension,'manifest.json'),JSON.stringify(manifest));
  await writeFile(path.join(extension,'ui/fixture-config.js'),
    'globalThis.__pageContentFixtureBase='+JSON.stringify(base)+';globalThis.__pageContentExpectedChars='+expectedBody.length+';');
  await writeFile(path.join(extension,'ui/tool.html'),
    '<!doctype html><meta charset="utf-8"><script src="fixture-config.js"></script><script src="tool-shell.js"></script>');
  for(const file of ['ui/target-bootstrap.html','scripting/sandbox/sandbox.html'])
    await copyFile(path.join(root,'src',file),path.join(extension,file));
  const require=createRequire(import.meta.url),config=require('../../webpack.config.cjs')('development');
  config.context=root;config.entry['ui/tool-shell']='./tests/framework/page-content-native-page.js';
  config.output={...config.output,path:extension,clean:false};config.devtool=false;config.performance=false;
  await new Promise((resolve,reject)=>webpack(config,(error,stats)=>
    error||stats.hasErrors()?reject(error||new Error(stats.toString({all:false,errors:true}))):resolve()));
  processChrome=spawn(binary,['--headless=new','--use-mock-keychain','--no-first-run',
    '--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0',
    '--user-data-dir='+profile,'--load-extension='+extension,'--disable-extensions-except='+extension,
    'about:blank'],{stdio:['ignore','pipe','pipe']});
  exitPromise=new Promise(resolve=>processChrome.once('exit',(code,signal)=>resolve({code,signal})));
  let stderr='';processChrome.stderr.on('data',bytes=>{stderr+=bytes.toString();});
  let endpoint;
  for(let i=0;i<300;i++){endpoint=stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];if(endpoint)break;await sleep(50);}
  if(!endpoint)throw new Error('Chrome CDP unavailable: '+stderr.slice(-2000));
  client=await connect(endpoint);
  const {targetId}=await client.send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
  await client.send('Runtime.enable',{},sessionId);
  await client.send('Page.enable',{},sessionId);
  await client.send('Page.navigate',{url:'chrome-extension://'+extensionId+'/ui/tool.html'},sessionId);
  let report;
  for(let i=0;i<600;i++){
    const evaluated=await client.send('Runtime.evaluate',{expression:'globalThis.__pageContentNativeReport',returnByValue:true},sessionId);
    report=evaluated.result?.value;
    if(report?.state==='finished')break;
    await sleep(100);
  }
  console.log(JSON.stringify({test:'Chrome MV3 content read',report}));
  if(report?.state!=='finished'||!report.passed)throw new Error('Real Chrome HTML content smoke failed');
}finally{
  try{await client?.send('Browser.close');}catch{}
  client?.close();
  if(processChrome){processChrome.kill('SIGTERM');await Promise.race([exitPromise,sleep(3000)]);
    if(processChrome.exitCode===null)processChrome.kill('SIGKILL');}
  await new Promise(resolve=>server.close(resolve));
  await rm(output,{recursive:true,force:true});
}
