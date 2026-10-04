import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const require = createRequire(import.meta.url);
const {chromium} = require('/Users/shopme/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const repo = '/Users/shopme/Documents/workspace/opendesk-browser';
const fixture = resolve(repo, 'tests/prototypes/user-scripts-v2/fixture');
const output = resolve(dirname(fileURLToPath(import.meta.url)), `fresh-page-fence-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(output, {recursive:true});
const digest = async p => createHash('sha256').update(await readFile(p)).digest('hex');
const report = {scope:'Independent targeted review, unchanged frozen fixture; no full matrix', candidateSha256:'2edcc1b0ca37f22a21105255cf90a02f1fa1b4a6e72081fa23d816708ee3a036', output, runs:[]};
const server = createServer((req,res) => {res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Independent fence probe</title><body>Owned probe</body>');});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const url = `http://127.0.0.1:${server.address().port}/owned`;
try {
  for (const version of ['154.0.8037.92','138.0.7204.183']) {
    const binary=resolve(repo,`tests/.cache/m5-browsers/${version}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`);
    let context;const run={version, executable:binary, binarySha256:await digest(binary), profile:resolve(output,`profile-${version}`), cases:[]};report.runs.push(run);
    try {
      context=await chromium.launchPersistentContext(run.profile,{executablePath:binary,headless:false,args:[`--disable-extensions-except=${fixture}`,`--load-extension=${fixture}`]});
      const sw=context.serviceWorkers().find(w=>w.url().endsWith('/sw.js')) ?? await context.waitForEvent('serviceworker',{predicate:w=>w.url().endsWith('/sw.js'),timeout:15000});
      run.extensionId=new URL(sw.url()).host;run.actualVersion=context.browser().version();
      const host=await context.newPage();await host.goto(`chrome-extension://${run.extensionId}/host.html`);await host.waitForFunction(()=>Boolean(window.fixture));
      run.identity=await host.evaluate(()=>({id:chrome.runtime.id,manifest:chrome.runtime.getManifest()}));
      if(run.identity.manifest.name!=='OpenDesk F1 userScripts v2 fixture')throw new Error('Wrong fixture identity');
      const settings=await context.newPage();await settings.goto(`chrome://extensions/?id=${run.extensionId}`);
      const toggle=settings.locator('extensions-detail-view #allow-user-scripts cr-toggle');await toggle.waitFor({state:'visible'});
      const read=async()=>await toggle.getAttribute('aria-checked') ?? await toggle.getAttribute('aria-pressed');
      const set=async value=>{if(await read()!==String(value))await toggle.click();await settings.waitForTimeout(75);if(await read()!==String(value))throw new Error('UI toggle not reached');return {value:await read(),availability:await host.evaluate(()=>window.fixture.availability())};};
      await set(true);await host.reload();await host.waitForFunction(()=>Boolean(window.fixture));
      const targetPage=await context.newPage();await targetPage.goto(url);
      const target=await host.evaluate(async url=>{const tab=(await chrome.tabs.query({})).find(t=>t.url===url);const frame=await chrome.webNavigation.getFrame({tabId:tab.id,frameId:0});return {tabId:tab.id,frameId:0,documentId:frame.documentId,url:frame.url};},url);
      for(const world of ['USER_SCRIPT','MAIN']) {
        const id=`independent-no-recheck-${world}`;
        await host.evaluate(({id,target,world})=>window.fixture.start(id,{target,world,source:`() => {document.body.dataset.reviewEffect=${JSON.stringify(id)};return true;}`,acceptanceBarrier:id}),{id,target,world});
        await host.waitForFunction(id=>Boolean(window.fixture.poll(id)?.nativeCompletedAt),id);
        const before=await host.evaluate(id=>window.fixture.poll(id),id);
        const off=await set(false);
        await settings.screenshot({path:resolve(output,`${version}-${world}-off.png`)});
        const on=await set(true);
        await host.evaluate(id=>window.fixture.releaseAcceptance(id),id);
        await host.waitForFunction(id=>window.fixture.poll(id)?.state==='settled',id);
        const settled=await host.evaluate(id=>window.fixture.poll(id),id);
        const events=await host.evaluate(()=>window.fixture.permissionEvents());
        const effect=await targetPage.evaluate(()=>document.body.dataset.reviewEffect);
        run.cases.push({id,world,target,before,off,on,settled,events,effect,recheckCalled:false,requiredOldResultRejection:settled.result.accepted.kind==='rejected'});
        console.log(JSON.stringify({version,world,offAvailable:off.availability.available,accepted:settled.result.accepted,recheckCalled:false}));
      }
      run.resources=await host.evaluate(()=>window.fixture.resources());
    } catch(error) {run.error={name:error.name,message:error.message,stack:error.stack};}
    finally {if(context)await context.close();run.browserContextClosed=true;}
  }
} finally {await new Promise(resolve=>server.close(resolve));report.serverClosed=!server.listening;report.sourceHashes={};for(const name of ['adapter.js','host.js','manifest.json'])report.sourceHashes[name]=await digest(resolve(fixture,name));await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,runs:report.runs.map(r=>({version:r.version,error:r.error,cases:r.cases.length})),serverClosed:report.serverClosed}));}
