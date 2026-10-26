// Real production compiler/package builder. No marker or synthetic source is added.
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildProgramProject} from '../../scripts/build-program-project.mjs';
import {buildPageInstallPackage} from '../../scripts/build-page-install-package.mjs';
let built;
export function realScrollPackage(){
  return built??= (async()=>{
    const outputDirectory=await mkdtemp(join(tmpdir(),'opendesk-scroll-r134-'));
    try{
      await buildProgramProject('examples/programs/chatgpt-jump-top',{outputDirectory});
      const draft=JSON.parse(await readFile(join(outputDirectory,'program.opendesk-draft.json'),'utf8'));
      return await buildPageInstallPackage(draft,{revision:7,title:'AI 对话滚动导航'});
    }finally{await rm(outputDirectory,{recursive:true,force:true});}
  })();
}
