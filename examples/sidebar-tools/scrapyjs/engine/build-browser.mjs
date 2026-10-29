import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

const read=file=>fs.readFile(new URL(file,import.meta.url));
const hash=data=>createHash('sha256').update(data).digest('hex');
const pin=JSON.parse(await read('../vendor/scrapyjs/provenance.json'));
const original=await read('../vendor/scrapyjs/browser.original.js');
if(hash(original)!==pin.browserSha256)throw Error('Pinned browser SDK changed');
const upstreamBytes=await read('../vendor/scrapyjs/browser.original.build.json');
const upstream=JSON.parse(upstreamBytes);
if(hash(upstreamBytes)!==pin.upstreamBuildReceiptSha256 || upstream.sdkHash!==pin.browserSha256 ||
   upstream.sourceHash!==pin.sourceHash || upstream.packageName!=='scrapyjs' || upstream.protocolVersion!=='1.0')
  throw Error('Pinned upstream build identity changed');
const sourceFiles=Object.keys(upstream.inputs).filter(file=>file.startsWith('src/')).sort();
if(JSON.stringify(pin.inputs.map(row=>row.file).sort())!==JSON.stringify(sourceFiles))
  throw Error('Pinned source snapshot is incomplete');
for(const row of pin.inputs){
  if(!row.file.startsWith('src/') || row.file.split('/').some(part=>part==='..') ||
     upstream.inputs[row.file]!==row.sha256 || hash(await read('../vendor/scrapyjs/'+row.file))!==row.sha256)
    throw Error('Pinned source differs from the upstream build: '+row.file);
}
const startup='var __webpack_exports__ = __webpack_require__(44);';
const source=original.toString();
if(source.split(startup).length!==2 || !source.includes('/***/ 4849:') ||
   !source.includes('module.exports = { fault, selectorParts, fieldRule, normalizeConfig, extractRecords };'))
  throw Error('Unexpected pinned webpack export shape');
// Preserve every original module. Return its existing exports lexically from
// the classic IIFE; a Controller Worker needs no website window.
const wrapped='// Generated from the complete pinned browser SDK; do not edit.\nconst browserSDK = '+
  source.replace(startup,'return {sdk: __webpack_require__(44), extraction: __webpack_require__(4849)};')+
  '\nexport default browserSDK.sdk;\n'+
  'export const {Scrapy,Spider,ChromeSpider,Request,Item,ItemLoader,ChromeDownloaderMiddleware} = browserSDK.sdk;\n'+
  'export const normalizeConfig = browserSDK.extraction.normalizeConfig;\n';
await fs.writeFile(new URL('browser.js',import.meta.url),wrapped);
const inputs={};
for(const file of ['build-browser.mjs','../vendor/scrapyjs/browser.original.js','../vendor/scrapyjs/provenance.json','../vendor/scrapyjs/browser.original.build.json'])inputs[file]=hash(await read(file));
const receipt={format:'scrapyjs-browser-consumption.v1',profile:'complete-browser-sdk',inputs,
  upstreamBrowserSha256:pin.browserSha256,sourceSha256:hash(wrapped),sourceBytes:Buffer.byteLength(wrapped),
  compression:false,removedModules:[],exportModules:{sdk:44,extraction:4849},
  thirdPartyNotices:'vendor/scrapyjs/THIRD_PARTY_LICENSES.txt'};
await fs.writeFile(new URL('browser.build.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({sourceBytes:receipt.sourceBytes,sha256:receipt.sourceSha256,profile:receipt.profile}));
