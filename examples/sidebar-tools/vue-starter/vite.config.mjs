import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,rename,mkdir,rm,readdir,lstat} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const digest=bytes=>({bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
// Match the packer's existing sources map; read inputs without importing them.
export function completeBuild(projectRoot=root){
  let buildId,sources={};
  async function inputs(){
    const names=['package.json','vite.config.mjs','tool.config.json'];
    for(const name of ['package-lock.json','npm-shrinkwrap.json']){
      try{await lstat(join(projectRoot,name));names.push(name);}catch(error){if(error.code!=='ENOENT')throw error;}
    }
    async function walk(directory){
      for(const item of await readdir(join(projectRoot,directory),{withFileTypes:true})){
        const name=directory+'/'+item.name;
        if(item.isDirectory())await walk(name);
        else if(item.isFile())names.push(name);
        else throw Error('Unsupported build input: '+name);
        if(names.length>32)throw Error('Build inputs exceed the receipt limit');
      }
    }
    await walk('src');
    const result={};
    for(const name of names.sort()){
      if(name.length>180||! /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name))throw Error('Invalid build input path: '+name);
      const info=await lstat(join(projectRoot,name));
      if(!info.isFile()||info.size>220000)throw Error('Invalid or oversized build input: '+name);
      const bytes=await readFile(join(projectRoot,name));
      if(bytes.length>220000)throw Error('Oversized build input: '+name);
      result[name]=digest(bytes);
    }
    return result;
  }
  async function publish(state,files={},message=''){
    const destination=join(projectRoot,'dist','build-ready.json'),temp=destination+'.'+randomUUID()+'.new';
    await mkdir(dirname(destination),{recursive:true});
    try{
      await writeFile(temp,JSON.stringify({format:'opendesk.ui-build-ready.v1',buildId,state,sources,files,
        ...(message?{message:String(message).slice(0,500)}:{})},null,2)+'\n',{flag:'wx'});
      await rename(temp,destination);
    }finally{await rm(temp,{force:true});}
  }
  const failed=error=>publish('error',{},error?.message||'Build failed');
  return {name:'opendesk-tool-build-receipt',apply:'build',
    async buildStart(){
      buildId=randomUUID();sources={};
      // Invalidate even when input discovery or compilation fails. Non-ready
      // receipts have no output claims, so existing packers also reject them.
      await publish('building');
      try{
        sources=await inputs();
        for(const name of Object.keys(sources))this.addWatchFile(join(projectRoot,name));
        await publish('building');
      }catch(error){await failed(error);throw error;}
    },
    async buildEnd(error){if(error)await failed(error);},
    async renderError(error){await failed(error);},
    async writeBundle(){
      try{
        const files={};
        for(const name of ['tool.js','tool.css']){
          const bytes=await readFile(join(projectRoot,'dist',name));
          files['dist/'+name]=digest(bytes);
        }
        if(JSON.stringify(await inputs())!==JSON.stringify(sources))
          throw Error('Build inputs changed during compilation; rebuild before preview');
        await publish('ready',files);
      }catch(error){await failed(error);throw error;}
    }
  };
}
export default defineConfig({root,base:'./',
  plugins:[vue(),completeBuild()],
  define:{'process.env.NODE_ENV':JSON.stringify('production')},
  build:{target:'es2022',minify:'esbuild',cssCodeSplit:false,emptyOutDir:true,
    lib:{entry:resolve(root,'src/main.js'),name:'OpenDeskToolUI',
      formats:['iife'],fileName:()=>'tool.js',cssFileName:'tool'},
    rollupOptions:{external:[],output:{inlineDynamicImports:true}}}
});
