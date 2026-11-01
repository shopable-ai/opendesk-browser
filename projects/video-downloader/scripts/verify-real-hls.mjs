// Explicit development proof. Not a product URL API, installer or native service.
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {readHls,publicMediaUrl,downloadHlsVod} from '../trusted/stream.js';
if(!process.argv.includes('--rights-confirmed'))throw Error('Read README rights/hosting terms, then pass --rights-confirmed');
const out=resolve(process.argv.find(x=>x.startsWith('--out='))?.slice(6)||'artifacts/video-downloader/real-hls');
const masterUrl='https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
const authorize=async url=>{if(new URL(publicMediaUrl(url)).origin!=='https://test-streams.mux.dev')throw Error('E_MEDIA_PERMISSION');};
const controller=new AbortController();process.once('SIGINT',()=>controller.abort());
const options={authorize,signal:controller.signal};
await mkdir(out,{recursive:true});
const master=await readHls(masterUrl,options);
const selected=[...master.variants].sort((a,b)=>a.bandwidth-b.bandwidth)[0];
if(!selected||master.audio.some(x=>x.external&&x.group===selected.audioGroup))throw Error('E_HLS_EXTERNAL_AUDIO');
const url=publicMediaUrl(selected.uri,masterUrl),playlist=await readHls(url,options);
console.log(JSON.stringify({variant:{resolution:selected.resolution,bandwidth:selected.bandwidth},segments:playlist.segments,duration:playlist.duration,encryption:playlist.encryption}));
let reported=-1;
const result=await downloadHlsVod(url,playlist,{...options,onProgress:p=>{
  if(p.segmentsCompleted!==reported){reported=p.segmentsCompleted;console.log(JSON.stringify(p));}
}});
const filename=resolve(out,'big-buck-bunny-320x184.'+result.format);
await writeFile(filename+'.part',result.bytes,{flag:'w'});await rename(filename+'.part',filename);
const {bytes,...proof}=result;
await writeFile(resolve(out,'segments.json'),JSON.stringify({date:new Date().toISOString(),
  attribution:'Big Buck Bunny © 2008 Blender Foundation / peach.blender.org — CC BY 3.0; hosted by Mux test-streams',
  masterUrl,selected:{resolution:selected.resolution,bandwidth:selected.bandwidth},
  masterVariants:master.variants.map(({resolution,bandwidth,codecs})=>({resolution,bandwidth,codecs})),
  completeVod:playlist.vod,bytes:bytes.length,...proof},null,2)+'\n');
console.log(JSON.stringify({filename,bytes:bytes.length,segments:proof.segments,sha256:proof.sha256}));
