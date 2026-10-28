// Prepare immutable example snapshots with the existing project compiler, never a runner.
import {readFile,writeFile,mkdir,cp,mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildProgramProject} from '../../../../scripts/build-program-project.mjs';
import {fields,pagination,listDetail} from '../examples/configs.js';
const root=resolve(fileURLToPath(new URL('../../../../',import.meta.url)));
const tool=resolve(root,'examples/sidebar-tools/scrapyjs');
const base=resolve(process.argv[2]||join(root,'artifacts/scrapyjs/examples-'+Date.now()));
await mkdir(base,{recursive:true});
const golden=JSON.parse(await readFile(join(tool,'examples/expected.json')));
const rows=[
  {name:'fields',config:fields,expectedData:golden.github.resolvedUniqueRecords.map(r=>({...r,name:r.name.toUpperCase()})),expectedAudit:{listUrls:[golden.listUrls[0]],detailUrls:[],duplicates:0}},
  {name:'pagination',config:pagination,expectedData:golden.github.resolvedUniqueRecords,expectedAudit:{listUrls:golden.listUrls,detailUrls:[],duplicates:2}},
  {name:'list-detail',config:listDetail,expectedData:golden.listDetail.afterPipeline,expectedAudit:{listUrls:golden.listUrls,detailUrls:golden.listDetail.details.map(d=>d.url),duplicates:1}},
  {name:'capture',config:listDetail,expectedData:golden.listDetail.afterPipeline,expectedAudit:{listUrls:golden.listUrls,detailUrls:golden.listDetail.details.map(d=>d.url),duplicates:1}}
];
const suite=[];
for(const row of rows){
  const snapshot=await mkdtemp(join(base,row.name+'-source-'));
  for(const dir of ['controller','adapters','engine','examples'])await cp(join(tool,dir),join(snapshot,dir),{recursive:true,filter:file=>!file.endsWith('.opendesk-task.json')});
  const pkg=JSON.parse(await readFile(join(tool,'package.json')));
  if(row.name!=='capture'){
    pkg.opendesk.entry='examples/'+row.name+'.js';pkg.opendesk.id='scrapyjs.example-'+row.name;
    pkg.opendesk.paramsSchema={type:'object',additionalProperties:false,required:[],properties:{url:{type:'string',title:'网页地址',maxLength:2048}}};
  }
  await writeFile(join(snapshot,'package.json'),JSON.stringify(pkg,null,2));
  const out=join(base,row.name);
  const artifact=await buildProgramProject(snapshot,{outputDirectory:out,mode:'development'});
  const {url,itemConfig,waitForSelector,timeoutMs,...options}=row.config;
  const params=row.name==='capture'?{url,configJson:JSON.stringify(itemConfig),waitForSelector,timeoutMs,optionsJson:JSON.stringify(options)}:{};
  suite.push({name:row.name,source:join(out,'program.js'),draft:join(out,'program.opendesk-draft.json'),
    artifact:join(out,'artifact.json'),taskPackage:join(out,'program.opendesk-task.json'),params,
    expectedData:row.expectedData,expectedAudit:row.expectedAudit});
  console.log(JSON.stringify({name:row.name,sourceHash:artifact.sourceHash,out}));
}
await writeFile(join(base,'suite.json'),JSON.stringify(suite,null,2)+'\n');
await writeFile(join(base,'app-configs.json'),JSON.stringify([
  {name:'fields',config:fields,expectedData:golden.github.resolvedUniqueRecords},
  {name:'pagination',config:pagination,expectedData:golden.github.resolvedUniqueRecords},
  {name:'list-detail',config:listDetail,expectedData:golden.listDetail.afterPipeline}
],null,2)+'\n');
console.log(join(base,'suite.json'));
