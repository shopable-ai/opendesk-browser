#!/usr/bin/env node
// Release preflight: reject retired brand spellings in current source and root product docs.
// Historical release docs, evidence, snapshots and domain candidates are excluded.
import {spawnSync} from 'node:child_process';

const stale = ['grey'+'dove','grey'+' dove'].join('|');
const paths = [
  'manifest.json','README.md','package.json',
  'src','scripts','projects','official-tools','official-pages',
  'task-packs','tests','.github',
];
const result=spawnSync('git',['grep','--untracked','-n','-I','-i','-E',stale,'--',...paths],{
  encoding:'utf8',maxBuffer:4*1024*1024,
});
const retired=new RegExp(stale,'i');
const matches=(result.stdout||'').split('\n').filter(line=>retired.test(
  line.startsWith('README.md:')?line.replaceAll('docs/release/'+'grey'+'dove/','docs/release/'):line
));
if(result.error){
  console.error('Brand spelling audit unavailable:',result.error.message);
  process.exitCode=2;
}else if(result.status===1||(result.status===0&&matches.length===0)){
  console.log('Brand spelling audit passed: no retired brand spelling in current source and root product docs.');
}else if(result.status===0){
  console.error('Retired brand spelling found; use GrayDove for current product names:');
  console.error(matches.join('\n'));
  process.exitCode=1;
}else{
  console.error('Brand spelling audit failed:',result.stderr?.trim()||`git exit ${result.status}`);
  process.exitCode=2;
}
