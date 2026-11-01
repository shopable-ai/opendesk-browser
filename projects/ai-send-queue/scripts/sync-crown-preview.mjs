// Keep standalone preview tied to the production CSS and the exact adopted WebP.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const base=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const css=readFileSync(resolve(base,'assets/queue.css'),'utf8');
const image=readFileSync(resolve(base,'assets/crown-premium.webp')).toString('base64');
const path=resolve(base,'preview/index.html');
const current=readFileSync(path,'utf8');
const inlineCss=css.replace('url("crown-premium.webp")','url("data:image/webp;base64,'+image+'")');
if(inlineCss===css)throw Error('Missing packaged WebP CSS declaration');
function replaceOne(s,start,end,body){
  const i=s.indexOf(start), j=s.indexOf(end,i+start.length);
  if(i<0||j<0||s.indexOf(start,i+start.length)!==-1)throw Error('Missing or duplicate marker '+start);
  return s.slice(0,i+start.length)+body+s.slice(j);
}
let next=replaceOne(current,'<style id="program-css">\n','</style>',inlineCss);
const marker='<script id="crown-variants" type="application/json">';
const begin=next.indexOf(marker),finish=next.indexOf('</script>',begin+marker.length);
if(begin<0||finish<0)throw Error('Missing artwork marker');
const art=JSON.parse(next.slice(begin+marker.length,finish));
art.a=image;
next=replaceOne(next,marker,'</script>',JSON.stringify(art));
if(process.argv.includes('--check')){
  if(next!==current){console.error('Preview drift: run node scripts/sync-crown-preview.mjs');process.exitCode=1}
  else console.log('PASS: standalone preview matches production CSS and WebP')
}else{
  if(next!==current)writeFileSync(path,next);
  console.log('Preview synchronized')
}