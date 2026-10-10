// Experimental byte-size RESEARCH, NEVER production build or acceptance.
// Mutates ONLY an explicitly owned ephemeral CI checkout and restores config.
// Shipping budgets remain explicit in build-contract.mjs; this owned CI
// experiment never overrides release verification or native acceptance.
import {readFile,writeFile,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {entryByteBudget} from './build-contract.mjs';

if(process.env.CI!=='true'||process.env.OPENDESK_R16_OWNED_CHECKOUT!=='1')
  throw Error('Size research is CI-only and may not modify a shared workspace');
const root=process.cwd(),config=resolve(root,'wxt.config.mjs'),output=resolve(root,'dist/production/sw.js');
const original=await readFile(config,'utf8');
const key="config.build.terserOptions = {...options, format:{...options.format,semicolons:false}, compress:{...options.compress, passes:6, toplevel:true, top_retain:['sw','background'], unsafe:true}};";
const gate="if(bytes>budget)throw Object.assign(new Error(`WXT entry exceeds configured byte budget: ${target} (${bytes} > ${budget})`),\n            {target,bytes,budgetBytes:budget});";
if(original.split(key).length!==2||original.split(gate).length!==2)throw Error('Pinned WXT configuration changed; re-review experiment');
const variants=[
  {name:'hoist-props-no-unsafe-methods',settings:"config.build.terserOptions = {...options, compress:{...options.compress, passes:8, toplevel:true, top_retain:['sw','background'],unsafe:true,hoist_props:true,unsafe_arrows:true}};"},
  {name:'hoist-props-unsafe-methods-keep-fargs-false',settings:"config.build.terserOptions = {...options, compress:{...options.compress, passes:8, toplevel:true, top_retain:['sw','background'],unsafe:true,hoist_props:true,unsafe_methods:true,unsafe_arrows:true,keep_fargs:false}};"},
  {name:'hoist-props-unsafe-methods-strict-getters',settings:"config.build.terserOptions = {...options, compress:{...options.compress, passes:8, toplevel:true, top_retain:['sw','background'],unsafe:true,hoist_props:true,unsafe_methods:true,unsafe_arrows:true,pure_getters:'strict'}};"},
  {name:'hoist-props-unsafe-methods-omit-semicolons',settings:"config.build.terserOptions = {...options,format:{...options.format,semicolons:false},compress:{...options.compress, passes:8,toplevel:true,top_retain:['sw','background'],unsafe:true,hoist_props:true,unsafe_methods:true,unsafe_arrows:true}};"},
  {name:'hoist-props-unsafe-methods-unsafe-comps',settings:"config.build.terserOptions = {...options,compress:{...options.compress, passes:8,toplevel:true,top_retain:['sw','background'],unsafe:true,hoist_props:true,unsafe_methods:true,unsafe_arrows:true,unsafe_comps:true,unsafe_regexp:true}};"},
  {name:'hoist-props-unsafe-methods-inline-3',settings:"config.build.terserOptions = {...options,compress:{...options.compress, passes:8,toplevel:true,top_retain:['sw','background'],unsafe:true,hoist_props:true,unsafe_methods:true,unsafe_arrows:true,inline:3}};"}
];
const rows=[];
try{
  for(const variant of variants){
    const patched=original.replace(key,variant.settings).replace(gate,
      "if(bytes>budget)console.log('[NON-SHIPPING BYTE LAB] '+target+': '+bytes);");
    await writeFile(config,patched);
    const begin=Date.now(),result=spawnSync('npm',['run','build'],{cwd:root,timeout:120000,encoding:'utf8',
      env:{...process.env,OPENDESK_BUILD_EVIDENCE_DIR:resolve(root,'tests/.cache/r16-sw-size-lab-evidence')},
      maxBuffer:10*1024*1024});
    const log=String(result.stdout||'')+'\n'+String(result.stderr||'');
    let bytes=null,sha256=null;
    try{
      const b=await readFile(output);bytes=b.length;sha256=createHash('sha256').update(b).digest('hex');
      if((await stat(output)).mtimeMs<begin-1000)throw Error('Stale output from previous variant');
    }catch(error){rows.push({variant:variant.name,status:'NO_CURRENT_SW_OUTPUT',error:String(error),
      exitCode:result.status,logTail:log.slice(-1000)});continue;}
    rows.push({variant:variant.name,bytes,sha256,underBudget:bytes<=entryByteBudget('sw.js','production'),
      processExit:result.status,elapsedMs:Date.now()-begin,logTail:log.slice(-400)});
    console.log('SW_NON_SHIPPING_VARIANT',JSON.stringify(rows.at(-1)));
  }
}finally{await writeFile(config,original);}
console.log('SW_NON_SHIPPING_RESEARCH',JSON.stringify({source:'dedicated CI checkout only',
  shippingBudget:entryByteBudget('sw.js','production'),rows}));
if(!rows.some(row=>row.bytes!==null))process.exitCode=1;
