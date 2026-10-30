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
const css=moduleURL('export default '+JSON.stringify(await readFile(new URL('src/ui/react/components/conversation-frame.css',root),'utf8')));
const frame=await compile('src/ui/react/components/conversation.tsx',{
  'react-dom':import.meta.resolve('react-dom'),'./ui/button.tsx':button,'./conversation-frame.css?raw':css
});
const shared=moduleURL(`export {Button} from ${JSON.stringify(button)};export {SharedConversationFrame} from ${JSON.stringify(frame)};export {createConversationSession} from ${JSON.stringify(new URL('src/ui/conversation/session.js',root).href)};`);
const sourceRoot='examples/sidebar-tools/scrapyjs/src/';
const replacements={'@opendesk/ui':shared};
for(const name of ['ai-config.js','ai-request.js','ai-pending.js','local-runner-client.js','editor.js','results-model.js'])
  replacements['./'+name]=new URL(sourceRoot+name,root).href;
const panel=await compile(sourceRoot+'AiPanel.jsx',replacements);
export const {default:AiPanel}=await import(panel);
const results=await compile(sourceRoot+'Results.jsx',replacements);
export const {default:App}=await import(await compile(sourceRoot+'App.jsx',{
  ...replacements,'./AiPanel.jsx':panel,'./Results.jsx':results
}));
