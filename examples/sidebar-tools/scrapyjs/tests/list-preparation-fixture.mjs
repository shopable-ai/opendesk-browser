import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';

// Compile only the real AiPanel and shared Chat in memory. Do not load the
// unrelated App/FieldOrder graph through data URLs. Transport remains a fixture.
const root=new URL('../../../../',import.meta.url);
// linkedom lacks CSS.escape, used by React Aria for the CSP nonce meta lookup.
// Hex escaping each code point is valid CSS; this is a DOM-fixture shim only.
globalThis.CSS??={escape:value=>Array.from(String(value),char=>'\\'+(char.codePointAt(0)||0xfffd).toString(16)+' ').join('')};
const moduleURL=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
async function compile(path,replacements={}){
  let {code}=await transform(await readFile(new URL(path,root),'utf8'),{loader:'tsx',format:'esm',jsx:'transform'});
  code=code.replace(/^import "\.\/(?:results|local-runner)\.css";\n/gm,'');
  for(const [from,to] of Object.entries({react:import.meta.resolve('react'),'react-aria-components':import.meta.resolve('react-aria-components'),...replacements}))
    code=code.replaceAll(JSON.stringify(from),JSON.stringify(to));
  return moduleURL(code);
}
const button=await compile('src/ui/react/components/ui/button.tsx');
const css=moduleURL('export default '+JSON.stringify(await readFile(new URL('src/ui/react/components/conversation-frame.css',root),'utf8')));
const layout=moduleURL('export default '+JSON.stringify(await readFile(new URL('src/ui/react/components/conversation-layout.css',root),'utf8')));
const frame=await compile('src/ui/react/components/conversation.tsx',{
  'react-dom':import.meta.resolve('react-dom'),'./ui/button.tsx':button,'./conversation-frame.css?raw':css,'./conversation-layout.css?raw':layout
});
const input=await compile('src/ui/react/components/ui/input.tsx');
const shared=moduleURL(`export {Input,Textarea} from ${JSON.stringify(input)};export {Button,IconButton} from ${JSON.stringify(button)};export {SharedConversationFrame,SharedConversationDock} from ${JSON.stringify(frame)};export {createConversationSession} from ${JSON.stringify(new URL('src/ui/conversation/session.js',root).href)};`);
const sourceRoot='examples/sidebar-tools/scrapyjs/src/';
const replacements={'@opendesk/ui':shared};
for(const name of ['ai-config.js','ai-request.js','ai-pending.js'])
  replacements['./'+name]=new URL(sourceRoot+name,root).href;
const panel=await compile(sourceRoot+'AiPanel.jsx',replacements);
export const {default:AiPanel}=await import(panel);
