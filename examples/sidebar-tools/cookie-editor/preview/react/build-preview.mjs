#!/usr/bin/env node
// Build one self-contained, file://-compatible React 19 preview. Never touches formal tool src or package.
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const js=await readFile(join(root,'dist','cookie-react.js'));
const css=await readFile(join(root,'dist','cookie-react.css'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const template=(script,style)=>`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cookie Editor R4.9 · React 交互候选</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src data:; style-src data:; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><link rel="stylesheet" href="data:text/css;base64,${style.toString('base64')}"></head><body><div id="r49-root"></div><script src="data:text/javascript;base64,${script.toString('base64')}"></script></body></html>\n`;
const html=template(js,css);
const destination=resolve(root,'index.html');
if(process.argv.includes('--check')){
 const current=await readFile(destination,'utf8');
 if(current!==html)throw Error('R49_REACT_PREVIEW_DRIFT');
 console.log('R49_PREVIEW_MATCH',sha(Buffer.from(html)));
}else{
 await writeFile(destination,html);
 console.log(JSON.stringify({status:'R49_REACT_PREVIEW_BUILT',htmlBytes:Buffer.byteLength(html),jsCharacters:js.toString('utf8').length,jsBytes:js.length,cssBytes:css.length,htmlSha256:sha(Buffer.from(html)),jsSha256:sha(js)},null,2));
}
