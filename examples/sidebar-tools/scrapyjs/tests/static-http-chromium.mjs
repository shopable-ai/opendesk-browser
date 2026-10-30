// Actual Chromium DOMParser/JSON probes. Loopback fixture, no production Host.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {launchOwned,until,pause,sha} from './native-session.mjs';
const root=resolve(new URL('../../../../',import.meta.url).pathname);
const out=resolve(process.argv[2]||'artifacts/scrapyjs/r242-local-acceptance/static-http-chromium');
await mkdir(out,{recursive:true});
const seed=JSON.parse(await readFile(join(root,'artifacts/scrapyjs/r242-local-acceptance/native-task-valid-input/report.json')));
const owned=seed.events.find(e=>e.label==='owned-browser').value;
const paths={
 '/adapters/static-http-trial.mjs':'examples/sidebar-tools/scrapyjs/adapters/static-http-trial.mjs',
 '/contracts/execution-v1.mjs':'examples/sidebar-tools/scrapyjs/contracts/execution-v1.mjs'
};
const assets=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([url,path])=>[url,await readFile(join(root,path))])));
const resourceHits=[],report={status:'RUNNING',scope:'REAL_CHROMIUM_PARSERS_LOCAL_FIXTURE_ONLY',productionHttp:'BLOCKED',sources:Object.fromEntries(Object.entries(assets).map(([name,bytes])=>[name,sha(bytes)]))};
const server=createServer((req,res)=>{
 if(req.url.startsWith('/unexpected')){resourceHits.push(req.url);res.writeHead(200,{'content-type':'text/plain'});return res.end('fixture');}
 if(req.url==='/'){res.setHeader('content-type','text/html');return res.end('<!doctype html><title>Static HTTP parser fixture only</title>');}
 if(assets[req.url]){res.setHeader('content-type','text/javascript');return res.end(assets[req.url]);}
 res.writeHead(404);res.end();
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));let browser;
try{
 browser=await launchOwned({root,out,binary:owned.binary,extension:owned.loadedExtension||owned.snapshot});report.browser=browser.metadata;report.chrome=await browser.call('Browser.getVersion');
 const page=await browser.attach((await browser.call('Target.createTarget',{url:'http://127.0.0.1:'+server.address().port+'/'})).targetId);
 await until(()=>page.read('document.readyState==="complete"'),'fixture ready');
 report.parsed=await page.read(`(async()=>{const api=await import('/adapters/static-http-trial.mjs');
  globalThis.__r242Executed=false;
  const html='<section class="items"><article><h2>甲 &amp; 乙</h2><a href="/one">一</a></article><article><h2>二</h2><a href="/two">二</a></article></section><h2>outside</h2><script>globalThis.__r242Executed=true</'+'script><img src="'+location.origin+'/unexpected-image"><iframe src="'+location.origin+'/unexpected-frame"></iframe>';
  const rows=api.extractStaticHtml(html,{fields:api.legacyStaticFields({title:'h2::text',link:'a::href'}),listContainer:'.items',listItem:'article'});
  const json=api.extractStaticJson('{"items":[{"title":"甲","n":2},{"title":"乙"}]}',{name:'title',number:'n'},{rootPath:'items'});
  return {rows,json,executed:globalThis.__r242Executed,availableForV1Production:api.assessCurrentBrowserNetwork().availableForV1Production};})()`);
 assert.deepEqual(report.parsed.rows,[{title:'甲 & 乙',link:'/one'},{title:'二',link:'/two'}]);assert.deepEqual(report.parsed.json,[{name:'甲',number:2},{name:'乙'}]);
 assert.equal(report.parsed.executed,false);assert.equal(report.parsed.availableForV1Production,false);
 await pause(500);report.unexpectedResourceHits=resourceHits;assert.deepEqual(resourceHits,[],'Inert parsing must not make side requests');
 report.status='PASS_CHROMIUM_PARSERS_FIXTURE_ONLY';
}catch(error){report.status='FAIL';report.error={message:error.message,stack:error.stack};process.exitCode=1;}
finally{if(browser)try{await browser.close();report.ownedBrowserReleased=true;}catch(error){report.cleanupError=error.message;process.exitCode=1;}await new Promise(ok=>server.close(ok));report.serverClosed=true;await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error?.message,out}));}
