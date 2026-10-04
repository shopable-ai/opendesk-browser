import {readFile} from 'node:fs/promises'; import {pathToFileURL} from 'node:url';
const path=pathToFileURL(process.cwd()+'/src/framework/sdk/entry.js');
let source=await readFile(path,'utf8'); source=source.replace(/from '(\.\.?\/[^']+)'/g,(_,p)=>`from '${new URL(p,path).href}'`);
const one=await import('data:text/javascript;base64,'+Buffer.from(source+'\n// first entry evaluation').toString('base64'));
const two=await import('data:text/javascript;base64,'+Buffer.from(source+'\n// second entry evaluation').toString('base64'));
const transport={hello:async()=>({sdkVersion:'1.0.0',ready:true,methods:[]}),request:async()=>{throw Error('no calls expected')}};
const page={navigator:{userAgent:''}};
const sdk=one.installPageSdk({global:page,transport}); console.log(one.installPageSdk({global:page,transport})===sdk);
try {two.installPageSdk({global:page,transport});} catch(e) {console.log(e.code,e.message);} sdk.dispose();
