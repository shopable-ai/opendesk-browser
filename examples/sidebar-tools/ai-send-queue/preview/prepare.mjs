// Read-only consumer of the official build. Never runs Vite or the Tool packager.
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,relative} from 'node:path';
const base=fileURLToPath(new URL('../',import.meta.url));
const repo=resolve(base,'../../..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function prepare({runtime=resolve(repo,'dist/development'),out=resolve(base,'preview/.generated/source.json')}={}){
  const receiptBytes=await readFile(resolve(base,'dist/build-ready.json'));
  const receipt=JSON.parse(receiptBytes);
  if(receipt.format!=='opendesk.ui-build-ready.v1')throw Error('E_PREVIEW_BUILD_RECEIPT');
  const inputs={};
  async function pin(key,path,expected){
    const bytes=await readFile(path),sha256=hash(bytes);
    if(expected&&(sha256!==expected.sha256||bytes.length!==expected.bytes))
      throw Error('E_PREVIEW_SOURCE_DRIFT: '+key+'; ask build owner to run the existing AI queue build');
    const url=relative(resolve(base,'preview'),path).split('\\').join('/');
    inputs[key]={url,bytes:bytes.length,sha256};
  }
  const sources=['src/sidebar/main.jsx','src/sidebar/App.jsx','src/sidebar/style.css','src/shared/queue-contract.js'];
  for(const name of sources){
    if(!receipt.sources?.[name])throw Error('E_PREVIEW_SOURCE_MISSING: '+name);
    await pin(name,resolve(base,name),receipt.sources[name]);
  }
  for(const name of ['dist/tool.js','dist/tool.css']){
    if(!receipt.files?.[name])throw Error('E_PREVIEW_BUILD_MISSING: '+name);
    await pin(name,resolve(base,name),receipt.files[name]);
  }
  for(const name of ['src/page/engine.js','src/page/remote.js','assets/queue.css','assets/crown-premium.webp','tool.config.json','src/sidebar/root.html','vite.config.mjs','preview/model.js'])
    await pin(name,resolve(base,name));
  for(const name of ['libs/page-frameworks/react-19.2.0.js','sidebar-shared-ui.js','ui/design-tokens.css'])
    await pin('runtime/'+name,resolve(runtime,name));
  // Protect against a concurrent official build completing during this read.
  if(hash(await readFile(resolve(base,'dist/build-ready.json')))!==hash(receiptBytes))
    throw Error('E_PREVIEW_BUILD_CHANGED_DURING_READ');
  const manifest={format:'opendesk.send-queue.preview.v1',simulation:true,buildId:receipt.buildId,
    receiptSha256:hash(receiptBytes),inputs};
  await mkdir(resolve(out,'..'),{recursive:true});
  const temporary=out+'.'+randomUUID()+'.new';
  await writeFile(temporary,JSON.stringify(manifest,null,2)+'\n');await rename(temporary,out);
  return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const i=process.argv.indexOf('--runtime');
  const result=await prepare(i<0?{}:{runtime:resolve(process.argv[i+1])});
  console.log('PREVIEW_PINNED_EXISTING_BUILD '+result.buildId+'; SIMULATION_ONLY');
}
