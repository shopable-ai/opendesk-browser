// Development-only reproducible extraction of one fixed, pure mux.js entry.
// The Browser never fetches or executes an npm package at runtime.
import {readFile,writeFile,mkdtemp,mkdir,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const archive=process.argv[2];if(!archive)throw Error('Pass the fixed mux.js-7.1.1.tgz archive');
const integrity='sha512-RlxBK5RkBdJjoYXxJ83eVC1t4uf+KVDHl5mOcWXuwWHpY4ezuPIkEoApNqWJLyrGxiVZVNWDZGsdtfgNaf+PiQ==';
const data=await readFile(archive);
if('sha512-'+createHash('sha512').update(data).digest('base64')!==integrity)throw Error('mux.js archive integrity mismatch');
const temp=await mkdtemp(join(tmpdir(),'opendesk-mux-'));
try{
 execFileSync('tar',['-xzf',resolve(archive),'-C',temp]);
 const pkg=await realpath(join(temp,'package')),dir=new URL('../trusted/vendor/',import.meta.url);
 const result=await build({stdin:{contents:"export {Transmuxer} from './lib/mp4/transmuxer.js';",resolveDir:pkg,sourcefile:'entry.js'},
  bundle:true,write:false,metafile:true,format:'esm',platform:'browser',target:'chrome120',minify:true,legalComments:'none'});
 const inputs=Object.keys(result.metafile.inputs).filter(p=>!p.endsWith('/entry.js')&&p!=='entry.js'&&p!=='<stdin>');
 if(inputs.some(p=>!relative(pkg,resolve(p)).startsWith('lib/')))throw Error('Unexpected external dependency: '+JSON.stringify(inputs));
 const code='// mux.js 7.1.1 — Copyright Brightcove — Apache-2.0; see mux.LICENSE.txt and mux.provenance.json\n'+result.outputFiles[0].text;
 if(/\b(?:fetch|XMLHttpRequest|importScripts|eval)\s*\(|new Function\b/.test(code))throw Error('Unexpected runtime code/network');
 const receipt={name:'mux.js',version:'7.1.1',source:'https://registry.npmjs.org/mux.js/-/mux.js-7.1.1.tgz',integrity,license:'Apache-2.0',entry:'lib/mp4/transmuxer.js',
  compiler:'existing repository esbuild '+(await import('esbuild')).version,sha256:createHash('sha256').update(code).digest('hex'),
  inputs:await Promise.all(inputs.map(async p=>({path:relative(pkg,resolve(p)),sha256:createHash('sha256').update(await readFile(p)).digest('hex')})))};
 await mkdir(dir,{recursive:true});
 for(const [name,bytes] of [['mux-transmuxer.js',code],['mux.provenance.json',JSON.stringify(receipt,null,2)+'\n'],['mux.LICENSE.txt',await readFile(join(pkg,'LICENSE'))]]){
  const path=new URL(name,dir);
  if(process.argv.includes('--check')){if(!Buffer.from(await readFile(path)).equals(Buffer.from(bytes)))throw Error('Vendor drift: '+name);}
  else await writeFile(path,bytes);
 }
 console.log(JSON.stringify({bytes:Buffer.byteLength(code),sha256:receipt.sha256,inputs:inputs.length,checked:process.argv.includes('--check')}));
}finally{await rm(temp,{recursive:true,force:true});}
