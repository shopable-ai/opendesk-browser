import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {parse} from '@babel/parser';
import {build} from 'esbuild';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';

const require=createRequire(import.meta.url);
const project=fileURLToPath(new URL('..',import.meta.url));
const sharedButton=fileURLToPath(new URL('../../../src/ui/react/components/ui/button.tsx',import.meta.url));
const buttonBundle=await build({entryPoints:[sharedButton],bundle:true,write:false,platform:'node',format:'esm',plugins:[{
 name:'actual-react',setup(builder){builder.onResolve({filter:/^react$/},()=>({path:pathToFileURL(require.resolve('react')).href,external:true}));}
}]});
const {Button}=await import('data:text/javascript;base64,'+Buffer.from(buttonBundle.outputFiles[0].text).toString('base64'));

test('all form submit controls use the real Shared Button submit override; explicit actions remain buttons',async()=>{
 assert.equal(load(renderToStaticMarkup(React.createElement(Button,null,'action')))('button').attr('type'),'button');
 const failures=[];let submitCount=0,actionCount=0;
 for(const file of ['QuickPanel.tsx','Settings.tsx',...(await readdir(join(project,'src/ui'))).filter(n=>n.endsWith('.tsx')).map(n=>'ui/'+n)]){
  const ast=parse(await readFile(join(project,'src',file),'utf8'),{sourceType:'module',plugins:['jsx','typescript']});
  function walk(node,inForm=false){
   if(!node||typeof node!=='object')return;
   if(node.type==='JSXElement'){
    const name=node.openingElement.name.name;if(name==='form')inForm=true;
    if(inForm&&name==='Button'){
     const attrs=node.openingElement.attributes;
     const type=attrs.find(a=>a.name?.name==='type')?.value?.value;
     const isAction=attrs.some(a=>a.name?.name==='onClick');
     const actual=load(renderToStaticMarkup(React.createElement(Button,type?{type}:{})))('button').attr('type');
     if(isAction){actionCount++;if(actual!=='button')failures.push(`${file}:${node.loc.start.line} action submits`);}
     else{submitCount++;if(actual!=='submit')failures.push(`${file}:${node.loc.start.line} submit renders ${actual}`);}
    }
   }
   for(const [key,value]of Object.entries(node)){if(key==='loc')continue;if(Array.isArray(value))value.forEach(v=>walk(v,inForm));else if(value&&typeof value==='object')walk(value,inForm);}
  }
  walk(ast);
 }
 assert.ok(submitCount>=12&&actionCount>=6,'the audit must include all migrated forms and explicit actions');
 assert.deepEqual(failures,[]);
});

