import {readFile,writeFile} from 'node:fs/promises';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const modules=['vendor/marked.js','vendor/prism.js','policy.js','live.js','render.js','style.js','view.js'];
const js=(await Promise.all(modules.map(async path=>(await read('../src/'+path))
  .replace(/^import[^\n]*;\n/gm,'').replace(/^export /gm,'')))).join('\n');
const scenario=await read('./scenario.js');
const notice=await read('../src/vendor/THIRD-PARTY-NOTICES.txt');
const safe=s=>s.replace(/<\/script/gi,'<\\/script');
const html='<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenDesk Markdown Viewer — Interactive preview</title><script type="text/plain" id="third-party-notices">'+safe(notice)+'</script></head><body><script>\n(()=>{\n'+safe(js+'\n'+scenario)+'\n})();\n</script></body></html>\n';
await writeFile(new URL('./index.html',import.meta.url),html);
