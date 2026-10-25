import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'vite';
import {parse} from 'acorn';

test('trusted React classic bundle includes locale styles without an unreferenced CSS asset',async()=>{
  const result=await build({configFile:false,logLevel:'error',
    define:{'process.env.NODE_ENV':JSON.stringify('production')},
    build:{write:false,target:'es2022',minify:false,sourcemap:false,cssCodeSplit:false,
      lib:{entry:resolve('src/ui/react/main.tsx'),formats:['iife'],name:'OpenDeskSidebarStyleCheck'}}});
  const outputs=(Array.isArray(result)?result:[result]).flatMap(bundle=>bundle.output);
  assert.deepEqual(outputs.filter(item=>item.type==='asset').map(item=>item.fileName),[],
    'classic Side Panel scripts must not emit CSS outside the referenced fixed stylesheet catalog');
  const script=outputs.find(item=>item.type==='chunk'&&item.isEntry);
  assert.ok(script,'production React entry must be retained');
  const css=await readFile('src/ui/react/tabs/locale-manager.css','utf8');
  const nodes=[parse(script.code,{ecmaVersion:'latest',sourceType:'script'})];
  let canonicalStylesFound=false;
  while(nodes.length){
    const node=nodes.pop();
    const text=node?.type==='Literal'?node.value:
      node?.type==='TemplateLiteral'&&node.expressions.length===0?node.quasis[0].value.cooked:null;
    if(text===css){canonicalStylesFound=true;break;}
    for(const value of Object.values(node||{})){
      if(Array.isArray(value))nodes.push(...value.filter(item=>item?.type));
      else if(value?.type)nodes.push(value);
    }
  }
  assert.ok(canonicalStylesFound,
    'the exact canonical locale styles must travel inside the existing trusted React bundle');
});
