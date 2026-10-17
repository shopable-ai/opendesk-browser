#!/usr/bin/env node
// R1.7 baseline: compile the SAME author App.jsx + official source components
// with all React, ReactDOM and Aria libraries bundled; measure raw output.
// This is not an installable package and never replaces the Shared UI release.
import assert from 'node:assert/strict';
import {build} from 'vite';
import {stat,mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve('examples/sidebar-tools/shared-ui-demo');
const out=resolve('artifacts/sidebar-tools/shared-ui-demo/standalone-baseline');
const component=resolve('src/ui/react/components/ui');
const alias='\0r17-official-ui-alone';
const shim={
  name:'r17-only-standalone-ui-compare',
  enforce:'pre',
  resolveId(source){if(source==='@opendesk/ui')return alias;},
  load(id){
    if(id!==alias)return;
    return [
      'export {Card,CardContent} from '+JSON.stringify(resolve(component,'card.tsx'))+';',
      'export {Switch} from '+JSON.stringify(resolve(component,'switch.tsx'))+';'
    ].join('\n');
  }
};
await mkdir(out,{recursive:true});
await build({
  configFile:false,root,base:'./',plugins:[shim],mode:'production',
  define:{'process.env.NODE_ENV':JSON.stringify('production')},
  esbuild:{jsx:'automatic'},
  build:{
    target:'es2022',minify:'esbuild',sourcemap:false,copyPublicDir:false,
    emptyOutDir:true,outDir:out,cssCodeSplit:false,
    lib:{entry:resolve(root,'src/main.jsx'),name:'SharedUIDemoStandaloneBaseline',
      formats:['iife'],fileName:()=> 'tool.js',cssFileName:'tool'},
    rollupOptions:{external:[],output:{inlineDynamicImports:true}}
  }
});
const size=async path=>(await stat(path)).size;
const shared=await size(resolve(root,'dist/tool.js'));
const sharedCss=await size(resolve(root,'dist/tool.css'));
const baseline=await size(resolve(out,'tool.js'));
const baselineCss=await size(resolve(out,'tool.css'));
const entry=await size(resolve('dist/development/sidebar-shared-ui.js'));
const pinned=await size(resolve('dist/development/libs/page-frameworks/react-19.2.0.js'));
const license=await size(resolve('dist/development/licenses/shared-ui-third-party-notices.txt'));
assert.ok(baseline>shared*2,'Baseline must actually contain React, ReactDOM and official UI');
const browserAdded=entry+license;
const report={
  status:'BUILD_OUTPUT_MEASURED',basis:'Raw compiled asset bytes (not ZIP/Gzip)',
  baseline:{js:baseline,css:baselineCss,total:baseline+baselineCss},
  sharedTool:{js:shared,css:sharedCss,total:shared+sharedCss},
  browser:{preexistingPinnedReact19:193163,sharedUIResourceJS:entry,sharedUIThirdPartyNotices:license,sharedUIAddedTotal:browserAdded},
  sharedToolBytesSaved:baseline+baselineCss-shared-sharedCss,
  sharedToolReductionPercent:Number((100*(1-(shared+sharedCss)/(baseline+baselineCss))).toFixed(2)),
  important:'Browser sharedUIAdded includes React Aria behavior and Card/Switch style; pinned React19 is preexisting, not incremental'
};
assert.equal(pinned,193163);
await writeFile(resolve(out,'size-report.json'),JSON.stringify(report,null,2)+'\n');
console.log('R17_SIZE_BASELINE '+JSON.stringify(report));
