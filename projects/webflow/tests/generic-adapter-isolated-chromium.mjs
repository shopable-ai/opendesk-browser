// Isolated CFT fixture: verifies MAIN -> ISOLATED candidate observation only.
// It does not load OpenDesk, authorize a Task, or prove product execution.
import {build} from 'vite';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';

const tempDir=await mkdtemp(join(tmpdir(),'opendesk-site-runtime-'));
let server;
try{
  const bundle=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,
    lib:{entry:'src/page-events/generic-task-adapter.js',name:'OpenDeskGeneric',formats:['iife']},target:'es2022'}});
  const outputs=Array.isArray(bundle)?bundle:[bundle];
  const code=outputs.flatMap(item=>item.output).find(item=>item.type==='chunk').code;
  await writeFile(join(tempDir,'manifest.json'),JSON.stringify({manifest_version:3,
    name:'OpenDesk isolated adapter test',version:'1.0.0',content_scripts:[{
      matches:['http://127.0.0.1/*'],js:['adapter.js'],run_at:'document_start',world:'ISOLATED'}]}));
  await writeFile(join(tempDir,'adapter.js'),code+`\n;(()=>{let count=0;
    OpenDeskGeneric.createGenericTaskAdapter({win:window,onCandidate:c=>{
      document.documentElement.setAttribute('data-proof',JSON.stringify({count:++count,id:c.candidateId,task:c.taskId}));
    }}).start({profile:{protocols:['webflow.task.intent.v1']}});
  })();`);
  server=createServer((_req,res)=>{
    res.setHeader('content-type','text/html');
    res.end(`<!doctype html><title>adapter fixture</title><script>
      setTimeout(()=>window.dispatchEvent(new CustomEvent('opendesk:task-intent',{detail:JSON.stringify({
        protocol:'webflow.task.intent.v1',candidateId:'candidate-native-123',taskId:'search',
        targetUrl:'https://example.com/',args:{query:'test'}})})),200);
    </script>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=process.env.OPENDESK_CFT_BINARY||join(homedir(),
    'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  const child=spawn(browser,['--headless=new','--no-first-run','--no-default-browser-check',
    `--user-data-dir=${join(tempDir,'profile')}`,`--disable-extensions-except=${tempDir}`,
    `--load-extension=${tempDir}`,'--virtual-time-budget=3000','--dump-dom',
    `http://127.0.0.1:${server.address().port}/`],{stdio:['ignore','pipe','pipe']});
  let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
  const timer=setTimeout(()=>child.kill('SIGTERM'),25000);
  const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  clearTimeout(timer);
  if(exitCode!==0||!/data-proof=.*candidate-native-123/.test(out)||!/count&quot;:1/.test(out))
    throw new Error(`ISOLATED candidate not observed: exit=${exitCode} ${err.slice(-1200)}`);
  console.log('PASS: one MAIN-world event observed as a validated candidate in an ISOLATED content script');
}finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  await rm(tempDir,{recursive:true,force:true});
}
