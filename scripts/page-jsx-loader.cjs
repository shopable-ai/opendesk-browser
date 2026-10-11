'use strict';
// Trusted build-only Webpack loader. No source execution during JSX conversion.
// Reuse the exact esbuild pinned by the maintainer's existing Vite lock.
const {transform}=require('esbuild');
module.exports=function opendeskPageJSX(source){
  const done=this.async();
  transform(source,{
    loader:'jsx',format:'esm',target:'es2022',jsx:'transform',
    jsxFactory:'globalThis.OpenDeskPageReact.createElement',
    jsxFragment:'globalThis.OpenDeskPageReact.Fragment',
    sourcefile:this.resourcePath,sourcemap:'external',legalComments:'none',
    charset:'utf8'
  }).then(output=>done(null,output.code,JSON.parse(output.map)),error=>done(error));
};
