#!/usr/bin/env node
// Release preflight: reject the retired user-facing brand spelling in tracked active files.
// Lowercase historical domain candidates and docs/release/greydove/ remain unchanged.
import {spawnSync} from 'node:child_process';

const stale = ['Grey'+'Dove','grey'+'Dove','GREY'+'DOVE','Grey'+' Dove'].join('|');
const paths = [
  'manifest.json','README.md','package.json',
  'src','scripts','projects','official-tools','official-pages',
  'task-packs','tests','.github','docs',
];
const result=spawnSync('git',['grep','-n','-I','-E',stale,'--',...paths],{
  encoding:'utf8',maxBuffer:4*1024*1024,
});
if(result.error){
  console.error('Brand spelling audit unavailable:',result.error.message);
  process.exitCode=2;
}else if(result.status===1){
  console.log('Brand spelling audit passed: no retired brand spelling in tracked text.');
}else if(result.status===0){
  console.error('Retired brand spelling found; use GrayDove for current product names:');
  console.error(result.stdout.trim());
  process.exitCode=1;
}else{
  console.error('Brand spelling audit failed:',result.stderr?.trim()||`git exit ${result.status}`);
  process.exitCode=2;
}
