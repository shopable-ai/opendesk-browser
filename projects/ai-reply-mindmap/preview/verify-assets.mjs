// Verify four ORIGINAL Git-tracked scripts right next to index.html.
// No downloads, .runtime cache, copying, CDN or product runtime admission.
import {readFile} from 'node:fs/promises';
import {verifyFixedXmindAssets,PREVIEW_ASSETS_DIR} from './serve.mjs';
try{
  const resources=await verifyFixedXmindAssets();
  const manifest=JSON.parse(await readFile(new URL('../tests/xmind-provenance.json',import.meta.url),'utf8'));
  if(resources.size!==4)throw new Error('E_XMIND_PREVIEW_ASSETS_INCOMPLETE');
  for(const {name,bytes,sha256,gitBlob} of manifest.assets)
    console.log('PREVIEW_ORIGINAL_JS_PASS '+name+' '+bytes+' B SHA256='+sha256+' GitBlob='+gitBlob);
  console.log('PREVIEW_ASSETS_READY 4 original JS / 4042573 B at '+PREVIEW_ASSETS_DIR);
}catch(error){
  console.error('PREVIEW_ASSETS_INVALID '+(error?.code||error?.message||String(error)));
  process.exitCode=1;
}
