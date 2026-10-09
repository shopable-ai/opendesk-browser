import {createServer} from 'wxt';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {rm} from 'node:fs/promises';
import {preparePublic} from './prepare-public.mjs';
import {acquireDevelopmentLock} from './development-lock.mjs';
import {drainDevelopment} from './wxt-development.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
let server,release,stopping,closing=false,bootstrapping,restarting=Promise.resolve();
async function stop() {
  if(stopping)return stopping;
  closing=true;
  stopping=(async()=>{
    try {
      await Promise.allSettled([bootstrapping,restarting]);
      if(server){await drainDevelopment(server);await server.stop();}
      if(release)await rm(resolve('dist/development/development-update.json'),{force:true});
    }finally{await release?.();}
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
  await preparePublic();
  if(closing)return;
  server=await createServer({mode:'development'});
  if(closing)return;
  const restart=server.restart.bind(server);
  server.restart=()=>{
    if(closing)return Promise.resolve();
    restarting=restarting.catch(error=>console.error('[OpenDesk dev] Restart failed',error))
      .then(()=>closing?undefined:restart());
    return restarting;
  };
  await server.start();
  if(closing)return;
  console.log('[OpenDesk dev] RUNNING — save source files to update; Ctrl+C stops the service.');
  console.log('[OpenDesk dev] First use: load dist/development in chrome://extensions. If already loaded from a standalone build, click Reload once to activate this development client.');
})();
try{await bootstrapping;}
catch(error){console.error('[OpenDesk dev] '+error.stack);try{await stop();}catch(cleanup){console.error('[OpenDesk dev] Cleanup failed',cleanup);}process.exitCode=1;}
