#!/usr/bin/env node
// R1.7 baseline: compile the SAME author App.jsx + official source components
// with all React, ReactDOM and Aria libraries bundled; measure raw output.
// This is not an installable package and never replaces the Shared UI release.
import assert from 'node:assert/strict';
import {build} from 'vite';
import {stat,mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve('examples/sidebar-tools/shared-ui-demo');
const extension=resolve(process.env.OPENDESK_SHARED_UI_EXTENSION_DIR||'dist/development');
const toolFile=process.env.OPENDESK_SHARED_UI_TOOL_FILE;
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
      'import '+JSON.stringify(resolve('src/ui/design-tokens.css'))+';',
      'import '+JSON.stringify(resolve(component,'sidebar-shared.css'))+';',
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
const candidate=toolFile?JSON.parse(await readFile(resolve(toolFile),'utf8')):null;
if(toolFile){
  assert.ok(candidate&&typeof candidate==='object'&&!Array.isArray(candidate),'Measured candidate must be a tool package');
  assert.equal(candidate.id,'shared-ui-demo');
  assert.equal(candidate.uiRuntime,'opendesk.react-ui.v1');
  assert.deepEqual(candidate.capabilities,[]);
  assert.equal(candidate.js,await readFile(resolve(root,'dist/tool.js'),'utf8'),
    'Measured candidate must match the compiled author JSX');
}
const shared=candidate?Buffer.byteLength(candidate.js,'utf8'):await size(resolve(root,'dist/tool.js'));
const sharedCss=candidate?Buffer.byteLength(candidate.css,'utf8'):await size(resolve(root,'dist/tool.css'));
const baseline=await size(resolve(out,'tool.js'));
const baselineCss=await size(resolve(out,'tool.css'));
const entry=await size(resolve(extension,'sidebar-shared-ui.js'));
const pinned=await size(resolve(extension,'libs/page-frameworks/react-19.2.0.js'));
const license=await size(resolve(extension,'licenses/shared-ui-third-party-notices.txt'));
assert.ok(baseline>shared*2,'Baseline must actually contain React, ReactDOM and official UI');
const browserAdded=entry+license;
const report={
  status:'BUILD_OUTPUT_MEASURED',basis:'Raw asset bytes; tool totals are compiled JS/CSS (not package JSON, ZIP/Gzip)',
  inputs:{extension,toolFile:toolFile?resolve(toolFile):null},
  baseline:{js:baseline,css:baselineCss,total:baseline+baselineCss},
  sharedTool:{js:shared,css:sharedCss,total:shared+sharedCss},
  browser:{preexistingPinnedReact19:pinned,sharedUIResourceJS:entry,sharedUIThirdPartyNotices:license,sharedUIAddedTotal:browserAdded},
  sharedToolBytesSaved:baseline+baselineCss-shared-sharedCss,
  sharedToolReductionPercent:Number((100*(1-(shared+sharedCss)/(baseline+baselineCss))).toFixed(2)),
  important:'Savings are per-tool JS/CSS only. Browser sharedUIAdded includes React Aria behavior and Card/Switch style; pinned React19 is preexisting, not incremental'
};
assert.equal(pinned,193163);
await writeFile(resolve(out,'size-report.json'),JSON.stringify(report,null,2)+'\n');
console.log('R17_SIZE_BASELINE '+JSON.stringify(report));
