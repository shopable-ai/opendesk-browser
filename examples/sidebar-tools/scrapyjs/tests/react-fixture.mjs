import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';

// Compile the real tool and shared Chat in memory. Transport remains a fixture.
const root=new URL('../../../../',import.meta.url);
const moduleURL=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
async function compile(path,replacements={}){
  let {code}=await transform(await readFile(new URL(path,root),'utf8'),{loader:'tsx',format:'esm',jsx:'transform'});
  code=code.replace(/^import "\.\/(?:results|local-runner)\.css";\n/gm,'');
  for(const [from,to] of Object.entries({react:import.meta.resolve('react'),...replacements}))
    code=code.replaceAll(JSON.stringify(from),JSON.stringify(to));
  return moduleURL(code);
}
const button=await compile('src/ui/react/components/ui/button.tsx');
const shared=moduleURL(`export {Button} from ${JSON.stringify(button)};`);
const sourceRoot='examples/sidebar-tools/scrapyjs/src/';
const replacements={'@opendesk/ui':shared};
for(const name of ['ai-config.js','ai-request.js','ai-pending.js','local-runner-client.js','editor.js','results-model.js','capture-trials.js','ai-capture.js'])
  replacements['./'+name]=new URL(sourceRoot+name,root).href;
const workspace=await compile(sourceRoot+'CaptureWorkspace.jsx',replacements);
const results=await compile(sourceRoot+'Results.jsx',replacements);
export const {default:App}=await import(await compile(sourceRoot+'App.jsx',{
  ...replacements,'./CaptureWorkspace.jsx':workspace,'./Results.jsx':results
}));
