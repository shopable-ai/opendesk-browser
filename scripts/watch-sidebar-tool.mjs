#!/usr/bin/env node
// Explicit foreground watch. Never invokes npm, executes UI JS or installs a tool.
// Compiled projects are admitted ONLY after their completed build-ready receipt.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectSidebarToolProject,stageSidebarTool} from './stage-sidebar-tool.mjs';

function sleep(ms,signal){
  if(signal?.aborted)return Promise.resolve();
  return new Promise(resolve=>{
    const timer=setTimeout(done,ms);
    function done(){clearTimeout(timer);signal?.removeEventListener('abort',done);resolve();}
    signal?.addEventListener('abort',done,{once:true});
  });
}
export async function watchSidebarTool(projectPath,{intervalMs=1000,signal,onEvent=()=>{}}={}){
  if(!Number.isSafeInteger(intervalMs)||intervalMs<50||intervalMs>60000)
    throw new TypeError('watch interval must be between 50 and 60000 ms');
  const project=resolve(projectPath);
  let lastFingerprint=null,lastBuildId=null,lastError=null,lastReport=null;
  while(!signal?.aborted){
    try{
      const inputs=await inspectSidebarToolProject(project);
      if(lastFingerprint!==inputs.fingerprint||lastBuildId!==inputs.buildId){
        const next=await stageSidebarTool(project);
        if(signal?.aborted)break;
        lastFingerprint=next.sourceFingerprint;lastBuildId=next.buildId;
        // Rebuilding the same source must never change the installed version.
        // A new digest is a new explicit *preview snapshot*, not an installation.
        onEvent({state:'STAGED_NOT_INSTALLED',id:next.id,version:next.version,
          buildId:next.buildId,sha256:next.sha256,nativeLatest:next.nativeLatest,
          output:next.output});
      }
      lastError=null;
    }catch(error){
      if(signal?.aborted)break;
      const message=(error.code||'E_TOOL_WATCH')+' · '+String(error.message||error);
      if(message!==lastError){lastError=message;onEvent({state:'BUILD_OR_PACKAGE_FAILED',message,
        previousPreviewRetained:!!lastFingerprint});}
    }
    await sleep(intervalMs,signal);
  }
  return {stopped:true,lastFingerprint,lastBuildId};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(process.argv.length>3||['--help','-h'].includes(process.argv[2])){
    process.stdout.write('用法: node scripts/watch-sidebar-tool.mjs <project-directory>\n仅监听完成的本地文件快照，不运行项目构建命令，也不安装工具。\n');
    if(process.argv.length>3)process.exitCode=1;
  }else{
    const controller=new AbortController(),stop=()=>controller.abort();
    process.once('SIGINT',stop);process.once('SIGTERM',stop);
    watchSidebarTool(process.argv[2]||'.',{signal:controller.signal,onEvent:data=>
      process.stdout.write(JSON.stringify(data)+'\n')}).catch(error=>{
      process.stderr.write(String(error.message||error)+'\n');process.exitCode=1;
    }).finally(()=>{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);});
  }
}
