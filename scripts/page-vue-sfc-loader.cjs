'use strict';
// Trusted Webpack loader for the fixed shared Vue SFC compiler.
// The original input is read from the frozen source graph.
const path=require('node:path');
module.exports=function openDeskVueSfc(source){
  const done=this.async(),projectId=this.getOptions()?.projectId;
  const rel=path.relative(this.rootContext,this.resourcePath).split(path.sep).join('/');
  if(rel.startsWith('..')||path.isAbsolute(rel))return done(new Error('E_PROJECT_PATH'));
  import('../src/libs/page-frameworks/vue-sfc-transform.js')
    .then(({transformVueSFC})=>transformVueSFC({sourceUtf8:source,file:rel,projectId}))
    .then(result=>done(null,result.code),done);
};
