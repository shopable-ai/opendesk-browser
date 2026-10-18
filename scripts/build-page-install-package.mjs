#!/usr/bin/env node
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'acorn';
import {validateProgramDraft,PROGRAM_DRAFT_INPUT_LIMIT} from '../src/ui/program-source.js';
import {inferPageEntryFormat} from '../src/ui/page-dependencies.js';
import {describeDependencyManifest} from '../src/scripting/user-scripts/dependency-manifest.js';
import {assertUserScriptExecutable} from '../src/scripting/user-scripts/dependency-metadata.js';
import {resolvePageProgramRules} from '../src/scripting/user-scripts/page-program-rules.js';
import {digest,invariant} from '../src/platform/protocol.js';
import {PAGE_INSTALL_FORMAT,validatePageInstallPackage} from '../src/scripting/user-scripts/page-install-package.js';

export async function buildPageInstallPackage(draft,{revision,title}={}){
  draft=await validateProgramDraft(draft);
  invariant(draft.runtimeKind==='page-userscript','E_PAGE_KIND','仅支持 Page 编译草稿');
  // Reuse the frozen compiler output byte for byte, including trailing LF and frames.
  const sourceUtf8=draft.sourceUtf8,entryFormat=inferPageEntryFormat(sourceUtf8);
  parse(sourceUtf8,{ecmaVersion:'latest',sourceType:'script'});
  const {parsed}=await describeDependencyManifest({sourceUtf8,entryFormat,importSourceUrl:null});
  invariant(parsed.matches.length>0,'E_PAGE_MATCH','离线草稿必须包含固定网站范围');
  const admission=assertUserScriptExecutable(parsed,{entryFormat,phase:'preview',dependenciesLocked:true});
  const pageRules=resolvePageProgramRules(parsed,admission);
  const payload={format:PAGE_INSTALL_FORMAT,programId:draft.project.id,version:draft.project.version,
    title,revision,entryFormat,sourceUtf8,sourceHash:draft.build.sourceHash,pageRules};
  return validatePageInstallPackage({...payload,packageHash:await digest(payload)});
}

async function main(){
  const args=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i+=2){
    invariant(['--input','--out','--revision','--title'].includes(args[i])&&args[i+1]!==undefined&&
      !Object.hasOwn(options,args[i]),'E_ARGUMENT','用法: --input path --out path --revision 1 --title 名称');
    options[args[i]]=args[i+1];
  }
  invariant(Object.keys(options).length===4&&/^[1-9]\d*$/.test(options['--revision']), 'E_ARGUMENT','需要 input/out/revision/title');
  const input=resolve(options['--input']),out=resolve(options['--out']);
  invariant(input!==out,'E_ARGUMENT','安装包不能覆盖源码草稿');
  invariant((await stat(input)).size<=PROGRAM_DRAFT_INPUT_LIMIT,'E_LIMIT','草稿超过资源预算');
  const pkg=await buildPageInstallPackage(JSON.parse(await readFile(input,'utf8')),
    {revision:Number(options['--revision']),title:options['--title']});
  await mkdir(dirname(out),{recursive:true});
  await writeFile(out,JSON.stringify(pkg,null,2)+'\n');
  console.log(JSON.stringify({out,programId:pkg.programId,revision:pkg.revision,sourceHash:pkg.sourceHash,packageHash:pkg.packageHash}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(error=>{console.error(`${error.code||'E_PAGE_PACKAGE'}: ${error.message}`);process.exitCode=1;});
