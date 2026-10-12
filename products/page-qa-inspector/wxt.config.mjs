import {defineConfig} from 'wxt';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import product from './product.config.mjs';
import {resolveProduct} from '../../packages/extension-factory/resolve-product.mjs';

const plan=resolveProduct(product);
const root=fileURLToPath(new URL('.',import.meta.url));
const normalized=id=>id.replaceAll('\\','/');
const sourceModuleSet=new Set(plan.modules.map(path=>'/'+path));
const allowedShared='/src/ui/design-tokens.css';

export default defineConfig({
  root,
  srcDir:'.',
  entrypointsDir:'entrypoints',
  publicDir:'public',
  outDir:resolve(root,'../../dist/products',plan.productId),
  outDirTemplate:'{{mode}}',
  manifestVersion:3,
  imports:false,
  webExt:{disabled:true},
  manifest:structuredClone(plan.manifest),
  vite:()=>({
    optimizeDeps:{noDiscovery:true,include:[],entries:[]},
    build:{target:'es2022',minify:'terser',sourcemap:false},
    plugins:[{
      name:'extension-factory-reviewed-static-graph',
      generateBundle(_options,bundle) {
        for(const entry of Object.values(bundle)) {
          if(entry.type!=='chunk')continue;
          for(const id of Object.keys(entry.modules)) {
            const name=normalized(id);
            const shared=name.match(/\/(packages\/features\/[^?#]+|src\/[^?#]+)$/)?.[1];
            if(!shared)continue;
            if(shared.startsWith('src/')&&'/'+shared!==allowedShared)
              throw Error('Unauthorized shared OpenDesk source in Page QA: '+shared);
            if(shared.startsWith('packages/features/')&&!sourceModuleSet.has('/'+shared))
              throw Error('Unselected feature entered Page QA bundle: '+shared);
          }
        }
      }
    }]
  }),
  hooks:{
    'entrypoints:resolved'(_wxt,entries) {
      if(entries.length!==1||entries[0].name!==plan.entrypoints[0])
        throw Error('Page QA must contain only its static popup entrypoint');
    },
    'build:manifestGenerated'(_wxt,output) {
      if(output.background||output.content_scripts||output.externally_connectable||
         output.web_accessible_resources||output.host_permissions?.length||
         output.optional_host_permissions?.length||output.optional_permissions?.length)
        throw Error('Unauthorized Page QA extension exposure');
    }
  }
});
