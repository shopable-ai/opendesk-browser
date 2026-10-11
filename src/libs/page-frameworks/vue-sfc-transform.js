// Shared pure Vue SFC -> JavaScript + scoped CSS source transformer.
// Only trusted, version-pinned compiler functions run here; never user code.
import {PAGE_VUE_COMPILER} from './vue-compiler-contract.js';

const error=(code,message,file,line,column)=>Object.assign(new Error(message),{
  code,location:{file,...(line?{line}:{}),...(column!==undefined?{column}:{})}
});
let compilerPromise;
function loadCompiler(){
  compilerPromise??=import('./vue-sfc-compiler-3.5.22.mjs');
  return compilerPromise;
}
function failFrom(errors,file,phase){
  const first=errors?.[0];
  if(!first)return;
  const problem=first instanceof Error?first:typeof first==='string'?new Error(first):first;
  const loc=problem.loc?.start??problem.loc;
  throw error('E_PAGE_VUE_SFC',phase+': '+String(problem.message||problem),
    file,loc?.line,loc?.column);
}
async function scopeFor(projectId,file){
  const input=new TextEncoder().encode(PAGE_VUE_COMPILER.version+':'+projectId+':'+file);
  const subtle=globalThis.crypto?.subtle;
  if(!subtle)throw error('E_PAGE_VUE_COMPILER','A trusted SHA-256 implementation is required',file);
  const digest=new Uint8Array(await subtle.digest('SHA-256',input));
  return 'data-v-'+[...digest.slice(0,8)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function transformVueSFC({sourceUtf8,file,projectId}={}){
  if(typeof sourceUtf8!=='string'||new TextEncoder().encode(sourceUtf8).length>128*1024||
    typeof file!=='string'||!file.endsWith('.vue')||file.includes('\\')||
    typeof projectId!=='string'||!projectId)
    throw error('E_PAGE_VUE_INPUT','Unsupported Vue SFC input',String(file||'App.vue'));
  const compiler=await loadCompiler();
  const parsed=compiler.parse(sourceUtf8,{filename:file,sourceMap:true});
  failFrom(parsed.errors,file,'SFC parse');
  const descriptor=parsed.descriptor;
  for(const block of [descriptor.script,descriptor.scriptSetup,descriptor.template,...descriptor.styles]){
    if(!block)continue;
    if(block.src||block.attrs?.src||block.lang&&block.lang!=='js'&&block.lang!=='javascript'&&
      !(block.type==='style'&&block.lang==='css'))
      throw error('E_PAGE_VUE_SYNTAX','Only inline JavaScript SFC blocks and plain CSS are supported',file,
        block.loc?.start?.line,block.loc?.start?.column);
  }
  if(descriptor.customBlocks.length)throw error('E_PAGE_VUE_SYNTAX','Custom SFC blocks are unsupported',file);
  if(!descriptor.template&&!descriptor.script&&!descriptor.scriptSetup)
    throw error('E_PAGE_VUE_SYNTAX','SFC must provide a script or template',file);
  const id=await scopeFor(projectId,file);
  const scoped=descriptor.styles.some(row=>row.scoped);
  let script,scriptText;
  try{
    script=descriptor.script||descriptor.scriptSetup?
      compiler.compileScript(descriptor,{id,inlineTemplate:false}):null;
    scriptText=script?compiler.rewriteDefault(script.content,'__odVueComponent'):'const __odVueComponent={};';
  }catch(cause){throw error('E_PAGE_VUE_SFC','SFC script: '+cause.message,file,
    cause.loc?.line,cause.loc?.column);}
  let templateCode='';
  if(descriptor.template){
    let template;
    try{
      template=compiler.compileTemplate({source:descriptor.template.content,filename:file,
        id,scoped,compilerOptions:{mode:'module',bindingMetadata:script?.bindings||{}}});
    }catch(cause){throw error('E_PAGE_VUE_SFC','SFC template: '+cause.message,file,
      cause.loc?.line,cause.loc?.column);}
    failFrom(template.errors,file,'SFC template');
    templateCode=template.code;
  }
  const styles=[];
  for(const block of descriptor.styles){
    const result=compiler.compileStyle({source:block.content,filename:file,id,scoped:block.scoped});
    failFrom(result.errors,file,'SFC CSS');
    if(/@import\b|@namespace\b|url\s*\(|expression\s*\(/i.test(result.code))
      throw error('E_PAGE_VUE_STYLE','SFC CSS cannot import or fetch external resources',file);
    styles.push(result.code);
  }
  const css=styles.join('\n');
  if(new TextEncoder().encode(css).length>49152)throw error('E_PAGE_VUE_STYLE','SFC CSS exceeds 48 KiB',file);
  const code=[scriptText,templateCode,
    ...(descriptor.template?['__odVueComponent.render=render;']:[]),
    ...(scoped?['__odVueComponent.__scopeId='+JSON.stringify(id)+';']:[]),
    'export default __odVueComponent;',''].join('\n');
  return Object.freeze({code,css,scopeId:id,compilerVersion:PAGE_VUE_COMPILER.version});
}
