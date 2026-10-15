import {createServer} from 'wxt';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {rm} from 'node:fs/promises';
import {acquireDevelopmentLock} from './development-lock.mjs';
import {verifyReadingTocTrustedLocales} from './generate-reading-toc-locales.mjs';
import {resolveDevelopmentBrowserEdition} from './browser-editions-r245.mjs';

// Select before loading the static-resource catalog: it fixes both the UI
// compiler flag and the pinned resources copied into the daily extension.
process.env.OPENDESK_BROWSER_EDITION=resolveDevelopmentBrowserEdition();
const {preparePublic}=await import('./prepare-public.mjs');
const {drainDevelopment,configureDevelopmentRestarts}=await import('./wxt-development.mjs');

const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
let server,release,stopping,closing=false,bootstrapping,restarts;
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
  console.log('[OpenDesk dev] Stopped; output kept at '+resolve('dist/development'));
}
// npm can forward the terminal signal as well as the process-group delivery.
// Keep the handler installed so a duplicate signal joins the same shutdown.
const terminate=()=>stop().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
process.on('SIGINT',terminate);process.on('SIGTERM',terminate);
bootstrapping=(async()=>{
  release=await acquireDevelopmentLock();
  if(closing)return;
  console.log('[OpenDesk dev] Source: '+resolve('src'));
  console.log('[OpenDesk dev] Output: '+resolve('dist/development'));
  console.log('[OpenDesk dev] Preparing complete extension; browser auto-start disabled.');
  process.env.OPENDESK_BUILD_MODE='development';
  await verifyReadingTocTrustedLocales();
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
catch(error){console.error('[OpenDesk dev] '+error.stack);try{await stop();}catch(cleanup){console.error('[OpenDesk dev] Cleanup failed',cleanup);}process.exitCode=1;}
