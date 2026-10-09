// Acceptance-only compilation using existing local dependencies, never a product compiler preset.
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {buildSidebarTool} from '../../scripts/build-sidebar-tool.mjs';
const require=createRequire(import.meta.url),esbuild=require('esbuild');
const web=path.resolve(process.env.SIDEBAR_REACT_NODE_MODULES||'/Users/shopme/Documents/workspace/shopable-station/apps/web/node_modules');
const legacy=path.resolve(process.env.SIDEBAR_VUE_NODE_MODULES||'/Users/shopme/Documents/workspace/todo-user-vue/node_modules');
const postcss=require(web+'/postcss'),tailwind=require(web+'/tailwindcss');
const sfc=require(legacy+'/@vue/compiler-sfc');
const output=path.resolve('artifacts/sidebar-tools/framework-acceptance');
const reports=[];
const jsx=`import React from 'react';import {createRoot} from 'react-dom/client';
function App(){const [count,setCount]=React.useState(0);return <main className="p-4 text-blue-600 bg-slate-50"><h1 className="text-xl font-bold">React＋Tailwind 中文工具</h1><button id="react-count" className="p-2 rounded bg-blue-600 text-white" onClick={()=>setCount(count+1)}>计数 {count}</button></main>;}
createRoot(OpenDeskTool.root.querySelector('#app')).render(<App/>);`;
const vue=`<script setup>import {ref} from 'vue';const count=ref(0);</script>
<template><main class="vue-tool"><h1>Vue 中文工具</h1><button id="vue-count" @click="count++">计数 {{count}}</button></main></template>`;
for(const kind of ['react','vue']){
  const root=path.join(output,kind);await mkdir(root,{recursive:true});
  const source=kind==='react'?jsx:vue;
  await writeFile(path.join(root,kind==='react'?'App.jsx':'App.vue'),source);
  let code,css;
  if(kind==='react'){
    code=jsx;css=(await postcss([tailwind({content:[{raw:jsx,extension:'jsx'}],corePlugins:{preflight:false},theme:{extend:{}},plugins:[]})]).process('@tailwind utilities;',{from:undefined})).css;
  }else{
    const parsed=sfc.parse(vue,{filename:'App.vue'});if(parsed.errors.length)throw parsed.errors[0];
    const compiled=sfc.compileScript(parsed.descriptor,{id:'tool-acceptance-vue',isProd:true,inlineTemplate:true});
    await writeFile(path.join(root,'component.js'),compiled.content);
    code="import {createApp} from 'vue';import App from './component.js';createApp(App).mount(OpenDeskTool.root.querySelector('#app'));";
    css='.vue-tool{padding:16px;color:#126443;font:14px/1.5 system-ui}.vue-tool button{padding:10px;border:1px solid #126443;border-radius:8px;background:#e6f8ed}';
  }
  await esbuild.build({stdin:{contents:code,loader:kind==='react'?'jsx':'js',resolveDir:root,sourcefile:kind+'.js'},bundle:true,format:'iife',minify:true,platform:'browser',target:'es2020',outfile:path.join(root,'ui.js'),
    define:{'process.env.NODE_ENV':'"production"'},alias:{react:web+'/react','react-dom':web+'/react-dom',vue:legacy+'/vue/dist/vue.runtime.esm-browser.prod.js'}});
  await writeFile(path.join(root,'ui.css'),css);await writeFile(path.join(root,'ui.html'),'<div id="app"></div>');
  await writeFile(path.join(root,'tool.config.json'),JSON.stringify({id:kind+'-acceptance',version:'1.0.0',title:kind==='react'?'React＋Tailwind':'Vue 中文工具',description:'本轮预编译产物验收；不表示官方源码编译预设已接入。',capabilities:[],files:{html:'ui.html',css:'ui.css',js:'ui.js'}},null,2));
  const result=await buildSidebarTool(root);
  const bytes=await readFile(result.output);
  reports.push({...result,framework:kind,source,sha256:createHash('sha256').update(bytes).digest('hex'),sourceCompiler:'existing local esbuild / Vue compiler-sfc',officialSourceImport:'NOT_SUPPORTED',native:'NATIVE_NOT_VERIFIED'});
}
await writeFile(path.join(output,'report.json'),JSON.stringify(reports,null,2)+'\n');
console.log(JSON.stringify(reports.map(({source,...report})=>report),null,2));
