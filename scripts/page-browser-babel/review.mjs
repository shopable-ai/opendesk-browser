// Offline maintainer-only Babel candidate, not a published compiler or new Page executor.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import {transformVueSFC} from '../../src/libs/page-frameworks/vue-sfc-transform.js';
const root=resolve('scripts/page-browser-babel'),vendor=join(root,'node_modules/@babel/standalone');
const pkg=JSON.parse(await readFile(join(vendor,'package.json'),'utf8'));
const lock=JSON.parse(await readFile(join(root,'package-lock.json'),'utf8'));
const pin=lock.packages?.['node_modules/@babel/standalone'];
if(pkg.name!=='@babel/standalone'||pkg.version!=='7.29.9'||pkg.license!=='MIT'||
  pin?.version!=='7.29.9'||!/^https:\/\//.test(pin.resolved||'')||
  !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(pin.integrity||''))
  throw Error('E_BROWSER_BABEL_PROVENANCE');
const bytes=await readFile(join(vendor,'babel.min.js'));
if(bytes.length<1024||bytes.length>5*1024*1024)throw Error('E_BROWSER_BABEL_SIZE');
const license=await readFile(join(vendor,'LICENSE'));
if(!license.toString('utf8').includes('Permission is hereby granted'))
  throw Error('E_BROWSER_BABEL_LICENSE');
const require=createRequire(join(root,'package.json'));
const start=performance.now(),Babel=require('@babel/standalone'),requireMs=performance.now()-start;
if(Babel.version!=='7.29.9')throw Error('E_BROWSER_BABEL_IDENTITY');
const react=await readFile('examples/programs/page-ui-react/src/App.jsx','utf8');
const jsxStart=performance.now();
const jsx=Babel.transform(react,{filename:'src/App.jsx',sourceMaps:true,configFile:false,
  babelrc:false,plugins:[['transform-react-jsx',{
    runtime:'classic',pragma:'globalThis.OpenDeskPageReact.createElement',
    pragmaFrag:'globalThis.OpenDeskPageReact.Fragment'}],'transform-modules-commonjs']});
const jsxMs=performance.now()-jsxStart;
if(!jsx.code.includes('require("react")')||!/exports\.default/.test(jsx.code)||
  /return\s*<button/.test(jsx.code))throw Error('E_BROWSER_BABEL_JSX');
const sfc=await readFile('examples/programs/page-ui-vue/src/App.vue','utf8');
const vueSfc=await transformVueSFC({sourceUtf8:sfc,file:'src/App.vue',projectId:'sample.page-ui-vue'});
const vueStart=performance.now();
const vue=Babel.transform(vueSfc.code,{filename:'src/App.vue',sourceMaps:true,configFile:false,
  babelrc:false,plugins:['transform-modules-commonjs']});
const vueMs=performance.now()-vueStart;
if(!vue.code.includes('require("vue")')||!vue.code.includes('exports.default')||
  !vueSfc.css.includes('data-v-'))throw Error('E_BROWSER_BABEL_VUE');
const output=resolve('artifacts/r243-browser-babel-review');
await mkdir(output,{recursive:true});
await writeFile(join(output,'babel.min.js'),bytes);
await writeFile(join(output,'LICENSE.txt'),license);
const counts={bareEval:(bytes.toString('utf8').match(/\beval\s*\(/g)||[]).length,
  newFunction:(bytes.toString('utf8').match(/\bnew\s+Function\s*\(/g)||[]).length};
console.log('R243_BABEL_META '+JSON.stringify({phase:'QUALIFICATION_ONLY_NOT_PUBLISHED',
 name:pkg.name,version:pkg.version,source:pin.resolved,integrity:pin.integrity,license:pkg.license,
 bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),
 licenseSha256:createHash('sha256').update(license).digest('hex'),
 sourceGraph:'React App.jsx, Vue App.vue',reactSourceBytes:react.length,vueSourceBytes:sfc.length,
 reactOutputBytes:jsx.code.length,vueOutputBytes:vue.code.length,
 sourceMaps:{jsx:!!jsx.map,vue:!!vue.map},timingsMs:{require:requireMs,jsx:jsxMs,vue:vueMs},
 nodeRSS:process.memoryUsage().rss,cspScanCounts:counts}));
if(process.argv.includes('--emit-lock-base64')){
 const lockBytes=await readFile(join(root,'package-lock.json'));
 const b64=lockBytes.toString('base64');
 console.log('R243_BABEL_LOCK_START');
 for(let k=0;k<b64.length;k+=4096)console.log('R243_BABEL_LOCK_PART '+b64.slice(k,k+4096));
 console.log('R243_BABEL_LOCK_END');
}

if(process.argv.includes('--emit-source-base64')){
  const data=bytes.toString('base64');
  console.log('R243_BABEL_SOURCE_START');
  for(let n=0;n<data.length;n+=4096)console.log('R243_BABEL_SOURCE_PART '+data.slice(n,n+4096));
  console.log('R243_BABEL_SOURCE_END');
  console.log('R243_BABEL_LICENSE_START');
  const legal=license.toString('base64');
  for(let n=0;n<legal.length;n+=4096)console.log('R243_BABEL_LICENSE_PART '+legal.slice(n,n+4096));
  console.log('R243_BABEL_LICENSE_END');
}
