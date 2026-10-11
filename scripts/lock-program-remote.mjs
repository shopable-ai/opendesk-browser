#!/usr/bin/env node
// Explicit local-developer consent, not a Native/Sidebar endpoint or runtime downloader.
// The existing pinned downloader and lock writer remain the only network/lock engine.
import {createHash} from 'node:crypto';
import {lstat,mkdtemp,realpath,rm} from 'node:fs/promises';
import {join,basename,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createInterface} from 'node:readline/promises';
import {pathToFileURL} from 'node:url';
import {validateProgramProject,projectError} from './validate-program-project.mjs';
import {prepareRemoteModules,REMOTE_LOCK_FILE} from './remote-esm-modules.mjs';
import {safeRead} from '../native-agent/local-dev/snapshot.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(code,message)=>{throw projectError(code,message,{phase:'remote-review'});};

function args(argv){
  if(argv.length===1&&['--help','-h'].includes(argv[0]))return {help:true};
  const project=argv[0]||'.';
  const more=argv.slice(1);
  if(more.length===0)return {project};
  if(more.length===2&&more[0]==='--approve'&&/^[a-f0-9]{20}$/.test(more[1]))
    return {project,approve:more[1]};
  return fail('E_REMOTE_ARGS','Usage: node scripts/lock-program-remote.mjs <project-dir> [--approve <20-digit-review-token>]');
}

async function review(project){
  const root=await realpath(resolve(project));
  const info=await lstat(root,{bigint:true});
  if(!info.isDirectory()||info.isSymbolicLink())fail('E_REMOTE_PATH','Remote dependency preparation requires a real project directory');
  const verified=await validateProgramProject(root);
  let lockHash='missing';
  try{lockHash=sha(safeRead(root,join(root,REMOTE_LOCK_FILE),128*1024).bytes);}
  catch(error){if(error.code!=='E_PROJECT_FILE')throw error;}
  const identity={root,rootDev:String(info.dev),rootIno:String(info.ino),id:verified.id,
    version:verified.version,entry:verified.entry,runtimeKind:verified.runtimeKind,
    sources:verified.sources,assets:verified.assets,npmDependencies:verified.npmDependencies,
    remoteImports:verified.remoteImports,lockHash};
  return {root,verified,token:sha(JSON.stringify(identity)).slice(0,20)};
}

export async function lockProgramRemote(project,{approve,allowURL,fetchImpl}={}){
  const before=await review(project);
  if(!before.verified.remoteImports.length){
    if(approve)fail('E_REMOTE_EMPTY','Project has no static HTTPS dependencies to lock');
    return {status:'NO_REMOTE_IMPORTS',id:before.verified.id,remoteRoots:[],noNetwork:true,noExecution:true};
  }
  if(!approve)return {status:'REVIEW_REQUIRED',id:before.verified.id,
    project:basename(before.root),remoteRoots:before.verified.remoteImports.map(url=>({url,host:new URL(url).hostname})),
    reviewToken:before.token,noNetwork:true,noExecution:true,
    next:'Run the same command with --approve '+before.token+' to authorize the displayed roots; each newly discovered transitive URL must be approved separately.'};
  if(approve!==before.token)fail('E_REMOTE_APPROVAL_CHANGED','Source, directory, dependency set or lock changed since review. Review again; nothing was downloaded.');
  const approved=new Set(before.verified.remoteImports);
  // Interactive approval is local to this foreground command and each exact URL.
  const approveChild=async url=>{
    if(approved.has(url))return;
    if(!allowURL)fail('E_REMOTE_APPROVAL_REQUIRED','New transitive HTTPS URL requires a separate explicit approval: '+url);
    if(await allowURL(url)!==true)fail('E_REMOTE_APPROVAL_REQUIRED','Remote dependency was not approved: '+url);
    approved.add(url);
  };
  const temp=await mkdtemp(join(tmpdir(),'opendesk-lock-remote-'));
  try{
    const result=await prepareRemoteModules({root:before.root,temp,lockRemote:true,fetchImpl,
      remoteImports:before.verified.remoteImports,approveURL:approveChild,
      beforeCommit:async()=>{
        const current=await review(before.root);
        if(current.token!==before.token)fail('E_REMOTE_APPROVAL_CHANGED',
          'Project source, directory or lock changed during download. New bytes were not added to the lock.');
      }});
    return {status:'LOCKED_NOT_EXECUTED',id:before.verified.id,remoteModuleCount:result.modules.length,
      modules:result.modules,noExecution:true,noInstall:true,
      next:'Return to your authorized ESM project and explicitly run it. The runner will build from pinned bytes without contacting the CDN.'};
  }finally{await rm(temp,{recursive:true,force:true});}
}

async function main(argv){
  const options=args(argv);
  if(options.help){process.stdout.write('Usage: node scripts/lock-program-remote.mjs <project-dir> [--approve <review-token>]\n');return;}
  let rl;
  try{
    const allowURL=async url=>{
      if(!process.stdin.isTTY||!process.stdout.isTTY)
        fail('E_REMOTE_APPROVAL_REQUIRED','New transitive HTTPS dependency '+url+' requires interactive approval; run from a trusted terminal.');
      rl||=createInterface({input:process.stdin,output:process.stdout});
      const answer=await rl.question('New transitive HTTPS ESM: '+url+'\nPermit one download and pin this exact URL? [y/N] ');
      return ['y','yes'].includes(answer.trim().toLowerCase());
    };
    const result=await lockProgramRemote(options.project,{approve:options.approve,allowURL});
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }finally{rl?.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(error=>{
    process.stderr.write(JSON.stringify({code:error.code||'E_REMOTE_PREPARE',message:error.message,phase:error.phase||'remote-review'})+'\n');
    process.exitCode=1;
  });
}
