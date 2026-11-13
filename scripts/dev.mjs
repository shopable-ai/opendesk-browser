import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {rm} from 'node:fs/promises';
import {acquireDevelopmentLock} from './development-lock.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
let server,release,stopping,closing=false,bootstrapping,restarts,drainDevelopment;
async function stop() {
  if(stopping)return stopping;
  closing=true;
  restarts?.stop();
  stopping=(async()=>{
    try {
      await Promise.allSettled([bootstrapping,restarts?.drain()]);
      if(server){try{await drainDevelopment(server);}finally{await server.stop();}}
    }finally{
      try{if(release)await rm(resolve('dist/development/development-update.json'),{force:true});}
      finally{await release?.();}
    }
  })();
  await stopping;
  if(release)console.log('[OpenDesk dev] Stopped; output kept at '+resolve('dist/development'));
}
// npm can forward the terminal signal as well as the process-group delivery.
// Keep the handler installed so a duplicate signal joins the same shutdown.
const terminate=()=>stop().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
process.on('SIGINT',terminate);process.on('SIGTERM',terminate);
bootstrapping=(async()=>{
  release=await acquireDevelopmentLock();
  if(closing)return;
  const {resolveDevelopmentBrowserEdition}=await import('./browser-editions-r245.mjs');
  // Select before loading the static-resource catalog: it fixes both the UI
  // compiler flag and the pinned resources copied into the daily extension.
  process.env.OPENDESK_BROWSER_EDITION=resolveDevelopmentBrowserEdition();
  const {createServer}=await import('wxt');
  const {verifyReadingTocTrustedLocales}=await import('./generate-reading-toc-locales.mjs');
  const {preparePublic}=await import('./prepare-public.mjs');
  const {buildAdblockReact}=await import('./build-adblock-react.mjs');
  const {buildStayFocusReact}=await import('./build-stay-focus-react.mjs');
  const {buildCookieEditorReactIfOfficial}=await import('./build-cookie-editor-react.mjs');
  const development=await import('./wxt-development.mjs');
  drainDevelopment=development.drainDevelopment;
  const {configureDevelopmentRestarts}=development;
  if(closing)return;
  console.log('[OpenDesk dev] Source: '+resolve('src'));
  console.log('[OpenDesk dev] Output: '+resolve('dist/development'));
  console.log('[OpenDesk dev] Preparing complete extension; browser auto-start disabled.');
  process.env.OPENDESK_BUILD_MODE='development';
  await verifyReadingTocTrustedLocales();
  await buildAdblockReact({log:false});
  await buildStayFocusReact({log:false});
  await buildCookieEditorReactIfOfficial({log:false});
  await preparePublic();
  if(closing)return;
  // Keep Chrome's existing unpacked path/ID even when compiler assets ship.
  server=await createServer({mode:'development',outDirTemplate:'{{mode}}'});
  if(closing)return;
  restarts=configureDevelopmentRestarts(server,{root,isClosing:()=>closing});
  await server.start();
  if(closing)return;
  console.log('[OpenDesk dev] RUNNING — save source files to update; Ctrl+C stops the service.');
  console.log('[OpenDesk dev] First use: load dist/development in chrome://extensions. If already loaded from a standalone build, click Reload once to activate this development client.');
})();
try{await bootstrapping;}
catch(error){
  if(error.code==='E_OUTPUT_GUARD_BUSY'&&error.owner?.kind==='development'){
    console.log(`[OpenDesk dev] Already running — PID ${error.owner.pid} owns ${resolve('dist/development')}.`);
    console.log('[OpenDesk dev] Reuse the existing watcher. No additional service was started; its environment/options are unchanged.');
    console.log('[OpenDesk dev] Check the original terminal or Side Panel Debug for build readiness and browser connection status.');
  }else{
    console.error('[OpenDesk dev] '+(error.code==='E_OUTPUT_GUARD_BUSY'?error.message:error.stack));
    try{await stop();}catch(cleanup){console.error('[OpenDesk dev] Cleanup failed',cleanup);}
    process.exitCode=1;
  }
}
