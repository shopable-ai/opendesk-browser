import webpack from 'webpack';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
const dir=path.dirname(fileURLToPath(import.meta.url));
const pinned=path.join(dir,'../vendor/scrapyjs');
const manifest=JSON.parse(await fs.readFile(path.join(pinned,'provenance.json')));
for(const row of manifest.inputs){const data=await fs.readFile(path.join(pinned,row.file));if(createHash('sha256').update(data).digest('hex')!==row.sha256)throw Error('Pinned input changed: '+row.file);}
const compiler=webpack({mode:'production',target:['webworker','es2022'],entry:path.join(dir,'browser-entry.mjs'),experiments:{outputModule:true},output:{path:dir,filename:'browser.js',library:{type:'module'},globalObject:'globalThis'},module:{rules:[{test:/\.js$/,include:path.join(pinned,'src'),use:path.join(dir,'browser-loader.cjs')}]},optimization:{minimize:true,splitChunks:false,runtimeChunk:false},plugins:[new webpack.DefinePlugin({__SCRAPYJS_FINGERPRINT__:'null'})],performance:{hints:false}});
const stats=await new Promise((resolve,reject)=>compiler.run((error,stats)=>error?reject(error):resolve(stats)));
await new Promise(resolve=>compiler.close(resolve));
if(stats.hasErrors())throw Error(stats.toString({all:false,errors:true}));
const info=stats.toJson({all:false,assets:true,modules:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inputs={};
for(const name of ['browser-entry.mjs','browser-loader.cjs','build-browser.mjs','../vendor/scrapyjs/provenance.json'])
  inputs[name]=sha(await fs.readFile(path.join(dir,name)));
const code=await fs.readFile(path.join(dir,'browser.js'));
await fs.writeFile(path.join(dir,'browser.build.json'),JSON.stringify({
  format:'scrapyjs-browser-consumption.v1',webpack:webpack.version,
  profile:'controlled-page-single',inputs,sourceSha256:sha(code),sourceBytes:code.length,
  upstreamBrowserSha256:manifest.browserSha256,thirdPartyRuntimeModules:[],
  deferred:['node-files','http-download','html-cheerio','rule-following','processing','validation'],
  modules:[...stats.compilation.modules].filter(m=>m.resource).map(m=>path.relative(path.join(dir,'..'),m.resource)).sort()
},null,2)+'\n');
console.log(JSON.stringify({assets:info.assets.map(x=>({name:x.name,size:x.size})),modules:info.modules.length}));
